import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME } from '@/lib/google-sheets';
import { client, formatPhoneForTwilio, getSenderParams, shouldSendSMS } from '@/lib/twilio';

const OWNER_PHONE = '2818140061'; // Owner's personal cell for notifications

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Extract data from Vapi end-of-call webhook
    const { call, transcript, structuredData } = payload;

    // Build lead object from Vapi's extracted data
    const lead = {
      customerName: structuredData?.customerName || structuredData?.name || '',
      phone: structuredData?.phone || call?.customer?.number || '',
      address: structuredData?.address || structuredData?.streetAddress || '',
      city: structuredData?.city || '',
      zip: structuredData?.zip || structuredData?.zipCode || '',
      propertyType: structuredData?.propertyType || '',
      service: structuredData?.serviceRequested || structuredData?.service || 'Air Duct Cleaning',
      numUnits: structuredData?.numUnits || structuredData?.acUnits || '',
      numVents: structuredData?.numVents || structuredData?.vents || '',
      preferredTime: structuredData?.preferredTime || structuredData?.appointmentTime || '',
      gateCode: structuredData?.gateCode || structuredData?.accessCode || '',
      notes: transcript?.substring(0, 500) || '',
    };

    // Skip if no customer name (likely a hang-up or wrong number)
    if (!lead.customerName) {
      console.log('Voice webhook: No customer name, skipping lead creation');
      return NextResponse.json({ success: true, skipped: true, reason: 'No customer name' });
    }

    // Generate Lead ID
    const leadId = `LEAD-${Date.now().toString().slice(-6)}`;
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Normalize phone number
    const normalizedPhone = lead.phone.replace(/^\+1/, '').replace(/\D/g, '');

    // Save to Google Sheet
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:T`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          leadId,                      // A - Lead ID
          'NEW',                       // B - Status
          'MEDIUM',                    // C - Priority
          timestamp,                   // D - Created Date
          lead.customerName,           // E - Customer Name
          normalizedPhone,             // F - Phone Number
          '',                          // G - Email
          lead.address,                // H - Address
          lead.city,                   // I - City
          lead.zip,                    // J - Zip
          lead.propertyType,           // K - Property Type
          'Phone - AI Receptionist',   // L - Lead Source
          'Vapi Voice AI',             // M - Source Detail
          '',                          // N - Assigned Tech
          '',                          // O - Scheduled Date
          '',                          // P - Time Window
          lead.service,                // Q - Service Requested
          lead.numUnits,               // R - # AC Units
          lead.numVents,               // S - # Vents
          `Gate: ${lead.gateCode || 'N/A'} | Preferred: ${lead.preferredTime || 'Flexible'} | ${lead.notes}`, // T - Notes
        ]],
      },
    });

    console.log(`Voice webhook: Lead ${leadId} saved to Google Sheets`);

    // Send SMS notification to owner
    const smsCheck = shouldSendSMS(OWNER_PHONE);
    if (client && smsCheck.allowed) {
      const smsBody = `📞 NEW LEAD (AI)

Name: ${lead.customerName}
Phone: ${normalizedPhone}
Address: ${lead.address}${lead.city ? ', ' + lead.city : ''}${lead.zip ? ' ' + lead.zip : ''}
Service: ${lead.service}
Preferred: ${lead.preferredTime || 'Flexible'}${lead.gateCode ? `\nGate: ${lead.gateCode}` : ''}

Lead ID: ${leadId}`;

      await client.messages.create({
        body: smsBody,
        ...getSenderParams(),
        to: formatPhoneForTwilio(OWNER_PHONE),
      });

      console.log(`Voice webhook: SMS notification sent to ${OWNER_PHONE}`);
    } else {
      console.log(`Voice webhook: SMS skipped - ${smsCheck.reason || 'client not configured'}`);
    }

    return NextResponse.json({
      success: true,
      leadId,
      message: 'Lead saved and notification sent'
    });

  } catch (error) {
    console.error('Voice webhook error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'Voice webhook ready',
    timestamp: new Date().toISOString()
  });
}
