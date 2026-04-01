import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, DATA_RANGE } from '@/lib/google-sheets';
import { client, formatPhoneForTwilio, shouldSendSMS, getSenderParams } from '@/lib/twilio';
import { uploadPdfToDrive, generatePdfFileName } from '@/app/lib/google-drive';
import { generateDocumentNumber, getHoustonDate, getValidUntilDate } from '@/app/lib/document-numbering';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      leadId,
      sendVia,          // 'sms' | 'email' | 'both'
      estimateNumber,   // optional - auto-generate if not provided
      lineItems,        // { service, description, qty, price }[]
      totals,           // { subtotal, discount, taxRate, tax, total }
      signatureDataUrl, // base64 signature image (optional)
      signatureTimestamp,
      notes,            // string[] (optional)
      photos,           // { dataUrl, name }[] (optional)
      techNotes,        // string (optional)
    } = body;

    if (!leadId) {
      return NextResponse.json({ success: false, error: 'leadId is required' }, { status: 400 });
    }

    // Fetch lead data
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: DATA_RANGE,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: 'No data found' }, { status: 404 });
    }

    const headers = rows[0];
    const leads = rows.slice(1).map((row: string[], index: number) => {
      const lead: Record<string, string> = { rowIndex: String(index + 2) };
      headers.forEach((header: string, i: number) => {
        lead[header] = row[i] || '';
      });
      return lead;
    });

    const lead = leads.find((l: Record<string, string>) => l['Lead ID'] === leadId);
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    // Generate or use provided estimate number
    const docNumber = estimateNumber || await generateDocumentNumber('EST');
    const date = getHoustonDate();
    const validUntil = getValidUntilDate();

    const customerName = lead['Customer Name'] || '';
    const phone = lead['Phone Number'] || '';
    const email = lead['Email'] || '';
    const address = lead['Address'] || '';
    const city = lead['City'] || '';
    const service = lead['Service Requested'] || '';
    const quoteAmount = parseFloat(lead['Quote Amount'] || '0');

    // Build line items
    const items = lineItems && lineItems.length > 0
      ? lineItems
      : [{ service: service || 'Air Duct Cleaning', description: '', qty: 1, price: quoteAmount }];

    const estimateTotals = totals || {
      subtotal: quoteAmount,
      discount: 0,
      taxRate: 0.0825,
      tax: quoteAmount * 0.0825,
      total: quoteAmount * 1.0825,
    };

    // If no photos provided, load existing before photos from Drive
    let resolvedPhotos = photos;
    if ((!resolvedPhotos || resolvedPhotos.length === 0) && lead['Before Photos URL']) {
      try {
        const photoUrls = JSON.parse(lead['Before Photos URL']);
        if (Array.isArray(photoUrls) && photoUrls.length > 0) {
          const loaded = await Promise.all(photoUrls.map(async (url: string, i: number) => {
            try {
              // Convert Drive URL to direct download
              let directUrl = url;
              const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
              if (fileIdMatch) {
                directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
              }
              const res = await fetch(directUrl);
              if (!res.ok) return null;
              const buffer = await res.arrayBuffer();
              const base64 = Buffer.from(buffer).toString('base64');
              const contentType = res.headers.get('content-type') || 'image/jpeg';
              return { dataUrl: `data:${contentType};base64,${base64}`, name: `before-${i + 1}.jpg` };
            } catch { return null; }
          }));
          resolvedPhotos = loaded.filter(Boolean);
          console.log('[send-estimate] Loaded', resolvedPhotos.length, 'photos from Drive');
        }
      } catch {
        // Non-critical
      }
    }

    // Generate PDF and upload to Drive
    let driveLink = '';
    let pdfBuffer: Buffer | null = null;
    try {
      console.log('[send-estimate] Generating PDF...', { docNumber, photosCount: resolvedPhotos?.length || 0 });
      const { generateEstimatePdf } = await import('@/app/lib/generateEstimatePdf');

      const pdfBlob = await generateEstimatePdf({
        estimateNumber: docNumber,
        date,
        validUntil,
        leadId,
        customer: {
          name: customerName,
          address,
          city,
          phone,
          email,
        },
        lineItems: items,
        totals: estimateTotals,
        notes,
        techNotes: techNotes || lead['Tech Notes'] || '',
        signatureDataUrl: signatureDataUrl || lead['Signature URL'] || undefined,
        signatureTimestamp,
        photos: resolvedPhotos,
      });

      // Convert Blob to Buffer
      const arrayBuffer = await pdfBlob.arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuffer);
      console.log('[send-estimate] PDF generated, size:', pdfBuffer.length);

      // Upload to Google Drive
      const fileName = generatePdfFileName(docNumber, customerName, date);
      const driveResult = await uploadPdfToDrive(pdfBuffer, fileName);
      driveLink = driveResult.webViewLink;
      console.log('[send-estimate] Uploaded to Drive:', driveLink);
    } catch (pdfError: any) {
      console.error('[send-estimate] PDF/Drive error:', pdfError?.message || pdfError, pdfError?.stack);
      // Include error in response for debugging
      return NextResponse.json({
        success: true,
        estimateNumber: docNumber,
        smsSent: false,
        emailSent: false,
        driveLink: '',
        pdfError: pdfError?.message || 'Unknown PDF/Drive error',
      });
    }

    // Send via SMS
    let smsSent = false;
    if ((sendVia === 'sms' || sendVia === 'both') && phone && client) {
      const smsCheck = shouldSendSMS(phone);
      if (smsCheck.allowed) {
        const smsBody = `ClearAir Solutions - Estimate\n\nHi ${customerName.split(' ')[0]}!\n\nEstimate #${docNumber}\nService: ${service}\nEstimated Total: $${estimateTotals.total.toFixed(2)}\nValid Until: ${validUntil}\n\n${driveLink ? `View estimate: ${driveLink}\n\n` : ''}Questions? Call (281) 904-4674`;

        try {
          await client.messages.create({
            body: smsBody,
            ...getSenderParams(),
            to: formatPhoneForTwilio(phone),
          });
          smsSent = true;
        } catch (smsError) {
          console.error('SMS send failed:', smsError);
        }
      }
    }

    // Send via Email
    let emailSent = false;
    if ((sendVia === 'email' || sendVia === 'both') && email) {
      try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
          },
        });

        await transporter.sendMail({
          from: `"ClearAir Solutions" <${process.env.GMAIL_USER || 'info@clearairsolutionstx.com'}>`,
          to: email,
          subject: `Estimate #${docNumber} - $${estimateTotals.total.toFixed(2)} | ClearAir Solutions`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #0a2540; padding: 20px; text-align: center;">
                <h1 style="color: #14b8a6; margin: 0; font-size: 24px;">ClearAir Solutions</h1>
              </div>
              <div style="padding: 30px; background: #ffffff;">
                <p>Hi ${customerName.split(' ')[0]},</p>
                <p>Thank you for your interest in our services! Please find your estimate attached.</p>
                <div style="background: #f0fdfa; border: 1px solid #14b8a6; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0;"><strong>Estimate #${docNumber}</strong></p>
                  <p style="margin: 5px 0;">Service: ${service}</p>
                  <p style="font-size: 20px; font-weight: bold; color: #0a2540; margin: 10px 0 0;">$${estimateTotals.total.toFixed(2)}</p>
                  <p style="color: #666; font-size: 12px; margin: 5px 0 0;">Valid until ${validUntil}</p>
                </div>
                ${driveLink ? `<p><a href="${driveLink}" style="color: #14b8a6;">View estimate online</a></p>` : ''}
                <p>To approve this estimate and schedule service, please reply to this email or call us.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">
                  ClearAir Solutions | Houston, TX<br>
                  (281) 904-4674 | info@clearairsolutionstx.com
                </p>
              </div>
            </div>
          `,
          attachments: [{
            filename: `Estimate-${docNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }],
        });
        emailSent = true;
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    // Update Google Sheet
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/leads/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: parseInt(lead.rowIndex),
          updates: {
            'Estimate Number': docNumber,
            'Quote Amount': estimateTotals.total.toFixed(2),
            ...(driveLink ? { 'Estimate Link': driveLink } : {}),
          },
        }),
      });
    } catch (updateError) {
      console.error('Sheet update failed:', updateError);
    }

    return NextResponse.json({
      success: true,
      estimateNumber: docNumber,
      smsSent,
      emailSent,
      driveLink,
    });
  } catch (error: any) {
    console.error('Send estimate error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
