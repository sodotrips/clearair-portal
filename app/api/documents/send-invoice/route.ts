import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, DATA_RANGE } from '@/lib/google-sheets';
import { client, formatPhoneForTwilio, shouldSendSMS, getSenderParams } from '@/lib/twilio';
import { uploadPdfToDrive, generatePdfFileName } from '@/app/lib/google-drive';
import { generateDocumentNumber, getHoustonDate } from '@/app/lib/document-numbering';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      leadId,
      sendVia,        // 'sms' | 'email' | 'both'
      invoiceNumber,  // optional - auto-generate if not provided
      lineItems,      // { service, description, qty, price }[]
      totals,         // { subtotal, discount, taxRate, tax, total }
      isPaid,
      amountPaid,
      paymentMethod,
      paymentDate,
      beforePhotos,
      afterPhotos,
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

    // Generate or use provided invoice number
    const docNumber = invoiceNumber || await generateDocumentNumber('INV');
    const date = getHoustonDate();

    // Build invoice data for PDF (generated client-side, but we need data for SMS/email)
    const customerName = lead['Customer Name'] || '';
    const phone = lead['Phone Number'] || '';
    const email = lead['Email'] || '';
    const address = lead['Address'] || '';
    const city = lead['City'] || '';
    const service = lead['Service Requested'] || '';
    const totalAmount = totals?.total || parseFloat(lead['Amount Paid'] || lead['Quote Amount'] || '0');

    // Generate PDF server-side using jsPDF
    // Note: jsPDF runs in Node.js for server-side generation
    const jsPDF = (await import('jspdf')).default;
    const pdfShared = await import('@/app/lib/pdf-shared');
    const { generateInvoicePdf } = await import('@/app/lib/generateInvoicePdf');

    // Parse saved estimate data (items + discount)
    let savedItems: any[] = [];
    let savedDiscount = 0;
    try {
      const parsed = JSON.parse(lead['Estimate Line Items'] || '[]');
      savedItems = Array.isArray(parsed) ? parsed : (parsed.items || []);
      savedDiscount = Array.isArray(parsed) ? 0 : (parsed.discount || 0);
    } catch {}

    // Build line items from provided data, saved data, or fallback
    const items = lineItems && lineItems.length > 0
      ? lineItems
      : savedItems.length > 0
        ? savedItems
        : [{ service: service || 'Air Duct Cleaning', description: '', qty: 1, price: totalAmount }];

    // Build totals — use provided, or calculate from items with saved discount
    let invoiceTotals: any;
    if (totals) {
      invoiceTotals = totals;
      // Ensure discount is included even if caller forgot
      if (invoiceTotals.discount === undefined || invoiceTotals.discount === 0) {
        invoiceTotals.discount = savedDiscount;
      }
    } else {
      const subtotal = items.reduce((s: number, i: any) => s + ((i.qty || 1) * (i.price || 0)), 0);
      const discountedSubtotal = Math.max(0, subtotal - savedDiscount);
      const tax = discountedSubtotal * 0.0825;
      invoiceTotals = {
        subtotal,
        discount: savedDiscount,
        taxRate: 0.0825,
        tax,
        total: discountedSubtotal + tax,
      };
    }

    // Load before photos from Drive if none provided
    let resolvedBeforePhotos = beforePhotos;
    if ((!resolvedBeforePhotos || resolvedBeforePhotos.length === 0) && lead['Before Photos URL']) {
      try {
        const photoUrls = JSON.parse(lead['Before Photos URL']);
        if (Array.isArray(photoUrls) && photoUrls.length > 0) {
          const loaded = await Promise.all(photoUrls.map(async (url: string, i: number) => {
            try {
              let directUrl = url;
              const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
              if (fileIdMatch) directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
              const res = await fetch(directUrl);
              if (!res.ok) return null;
              const buffer = await res.arrayBuffer();
              const base64 = Buffer.from(buffer).toString('base64');
              const contentType = res.headers.get('content-type') || 'image/jpeg';
              return { dataUrl: `data:${contentType};base64,${base64}`, name: `before-${i + 1}.jpg` };
            } catch { return null; }
          }));
          resolvedBeforePhotos = loaded.filter(Boolean);
        }
      } catch {}
    }

    // Load after photos from Drive if none provided
    let resolvedAfterPhotos = afterPhotos;
    if ((!resolvedAfterPhotos || resolvedAfterPhotos.length === 0) && lead['After Photos URL']) {
      try {
        const photoUrls = JSON.parse(lead['After Photos URL']);
        if (Array.isArray(photoUrls) && photoUrls.length > 0) {
          const loaded = await Promise.all(photoUrls.map(async (url: string, i: number) => {
            try {
              let directUrl = url;
              const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
              if (fileIdMatch) directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
              const res = await fetch(directUrl);
              if (!res.ok) return null;
              const buffer = await res.arrayBuffer();
              const base64 = Buffer.from(buffer).toString('base64');
              const contentType = res.headers.get('content-type') || 'image/jpeg';
              return { dataUrl: `data:${contentType};base64,${base64}`, name: `after-${i + 1}.jpg` };
            } catch { return null; }
          }));
          resolvedAfterPhotos = loaded.filter(Boolean);
        }
      } catch {}
    }

    // Load signature from Drive if available
    let signatureDataUrl: string | undefined;
    if (lead['Signature URL']) {
      try {
        let directUrl = lead['Signature URL'];
        const fileIdMatch = directUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
        const sigRes = await fetch(directUrl);
        if (sigRes.ok) {
          const buffer = await sigRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const contentType = sigRes.headers.get('content-type') || 'image/png';
          signatureDataUrl = `data:${contentType};base64,${base64}`;
        }
      } catch {}
    }

    // Generate PDF blob
    const pdfBlob = await generateInvoicePdf({
      invoiceNumber: docNumber,
      date,
      dueDate: isPaid ? 'Paid' : 'Due on Receipt',
      leadId,
      customer: {
        name: customerName,
        address,
        city,
        phone,
        email,
      },
      lineItems: items,
      totals: invoiceTotals,
      techNotes: lead['Tech Notes'] || '',
      isPaid: isPaid || false,
      amountPaid: amountPaid || '',
      paymentMethod: paymentMethod || '',
      paymentDate: paymentDate || '',
      signatureDataUrl,
      photos: resolvedBeforePhotos,
      afterPhotos: resolvedAfterPhotos,
    });

    // Convert Blob to Buffer for Drive upload
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Upload to Google Drive
    let driveLink = '';
    try {
      const fileName = generatePdfFileName(docNumber, customerName, date);
      const driveResult = await uploadPdfToDrive(pdfBuffer, fileName);
      driveLink = driveResult.webViewLink;
    } catch (driveError) {
      console.error('Failed to upload to Google Drive:', driveError);
      // Continue without Drive - still send via SMS/Email
    }

    // Send via SMS
    let smsSent = false;
    if ((sendVia === 'sms' || sendVia === 'both') && phone && client) {
      const smsCheck = shouldSendSMS(phone);
      if (smsCheck.allowed) {
        const smsBody = isPaid
          ? `ClearAir Solutions - Payment Receipt\n\nHi ${customerName.split(' ')[0]}!\n\nInvoice #${docNumber}\nAmount Paid: $${amountPaid || totalAmount}\nPayment: ${paymentMethod || 'N/A'}\nDate: ${date}\n\n${driveLink ? `View receipt: ${driveLink}\n\n` : ''}Thank you for your business!`
          : `ClearAir Solutions - Invoice\n\nHi ${customerName.split(' ')[0]}!\n\nInvoice #${docNumber}\nAmount Due: $${invoiceTotals.total.toFixed(2)}\nDue: On Receipt\n\n${driveLink ? `View invoice: ${driveLink}\n\n` : ''}Payment: Card, Cash, Check, or Zelle\nQuestions? Call/Text (281) 904-4674`;

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
        // Dynamic import of nodemailer (installed separately)
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
          },
        });

        const subject = isPaid
          ? `Payment Receipt - Invoice #${docNumber} | ClearAir Solutions`
          : `Invoice #${docNumber} - $${invoiceTotals.total.toFixed(2)} Due | ClearAir Solutions`;

        await transporter.sendMail({
          from: `"ClearAir Solutions" <${process.env.GMAIL_USER || 'info@clearairsolutionstx.com'}>`,
          to: email,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #0a2540; padding: 20px; text-align: center;">
                <h1 style="color: #14b8a6; margin: 0; font-size: 24px;">ClearAir Solutions</h1>
              </div>
              <div style="padding: 30px; background: #ffffff;">
                <p>Hi ${customerName.split(' ')[0]},</p>
                ${isPaid
                  ? `<p>Thank you for your payment! Please find your receipt attached.</p>
                     <div style="background: #dcfce7; border: 1px solid #16a34a; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
                       <p style="color: #16a34a; font-size: 18px; font-weight: bold; margin: 0;">PAID</p>
                       <p style="color: #666; margin: 5px 0 0;">$${amountPaid || totalAmount} via ${paymentMethod || 'N/A'}</p>
                     </div>`
                  : `<p>Please find your invoice attached. Payment is due upon receipt.</p>
                     <div style="background: #fef2f2; border: 1px solid #dc2626; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
                       <p style="color: #dc2626; font-size: 14px; font-weight: bold; margin: 0;">AMOUNT DUE</p>
                       <p style="color: #dc2626; font-size: 24px; font-weight: bold; margin: 5px 0 0;">$${invoiceTotals.total.toFixed(2)}</p>
                     </div>
                     <p style="color: #666; font-size: 14px;">Payment Methods: Card, Cash, Check, Zelle</p>`
                }
                ${driveLink ? `<p><a href="${driveLink}" style="color: #14b8a6;">View ${isPaid ? 'receipt' : 'invoice'} online</a></p>` : ''}
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">
                  ClearAir Solutions | Houston, TX<br>
                  (281) 904-4674 | info@clearairsolutionstx.com
                </p>
              </div>
            </div>
          `,
          attachments: [{
            filename: `Invoice-${docNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }],
        });
        emailSent = true;
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    // Update Google Sheet with sent info
    try {
      const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/leads/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: parseInt(lead.rowIndex),
          updates: {
            'Invoice Number': docNumber,
            ...(driveLink ? { 'Invoice Link': driveLink } : {}),
          },
        }),
      });
    } catch (updateError) {
      console.error('Sheet update failed:', updateError);
    }

    return NextResponse.json({
      success: true,
      invoiceNumber: docNumber,
      smsSent,
      emailSent,
      driveLink,
    });
  } catch (error: any) {
    console.error('Send invoice error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
