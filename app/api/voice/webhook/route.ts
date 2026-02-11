import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME } from '@/lib/google-sheets';
import { client, formatPhoneForTwilio, getSenderParams, shouldSendSMS } from '@/lib/twilio';

const OWNER_PHONE = '2819044674'; // Owner's phone for notifications

// Generate sequential Lead ID
async function generateLeadId(sheets: any): Promise<string> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:A`,
  });

  const rows = response.data.values || [];
  let maxNumber = 0;

  for (const row of rows) {
    const leadId = row[0];
    if (leadId && leadId.startsWith('LEAD-')) {
      const numPart = parseInt(leadId.replace('LEAD-', ''), 10);
      if (!isNaN(numPart) && numPart > maxNumber) {
        maxNumber = numPart;
      }
    }
  }

  return `LEAD-${(maxNumber + 1).toString().padStart(4, '0')}`;
}

// Parse appointment date from natural language
function parseAppointmentDate(dateStr: string): string {
  if (!dateStr) return '';

  const lower = dateStr.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let targetDate: Date | null = null;

  if (lower.includes('today')) {
    targetDate = today;
  } else if (lower.includes('tomorrow')) {
    targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (lower.includes('monday') || lower.includes('tuesday') || lower.includes('wednesday') ||
             lower.includes('thursday') || lower.includes('friday') || lower.includes('saturday') || lower.includes('sunday')) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        targetDate = new Date(today);
        const currentDay = targetDate.getDay();
        let daysUntil = (i - currentDay + 7) % 7;
        if (daysUntil === 0) daysUntil = 7;
        targetDate.setDate(targetDate.getDate() + daysUntil);
        break;
      }
    }
  }

  if (targetDate) {
    return `${(targetDate.getMonth() + 1).toString().padStart(2, '0')}/${targetDate.getDate().toString().padStart(2, '0')}/${targetDate.getFullYear()}`;
  }

  return dateStr;
}

// Normalize time window to standard format matching Google Sheet
function normalizeTimeWindow(timeStr: string): string {
  if (!timeStr) return '';

  const lower = timeStr.toLowerCase().replace(/\s/g, '');

  // Morning: 08:00AM - 11:00AM
  if (lower.includes('8am-11am') || lower.includes('8-11') || lower.includes('8am') ||
      lower.includes('08:00') || (lower.includes('morning') && !lower.includes('11'))) {
    return '08:00AM - 11:00AM';
  }
  // Midday: 11:00AM - 2:00PM
  if (lower.includes('11am-2pm') || lower.includes('11-2') || lower.includes('11am') ||
      lower.includes('11:00') || lower.includes('midday') || lower.includes('noon')) {
    return '11:00AM - 2:00PM';
  }
  // Afternoon: 2:00PM - 5:00PM
  if (lower.includes('2pm-5pm') || lower.includes('2-5') || lower.includes('2pm') ||
      lower.includes('2:00') || lower.includes('afternoon')) {
    return '2:00PM - 5:00PM';
  }

  return timeStr;
}

// Extract data from various Vapi payload formats
function extractVapiData(payload: any): {
  customerPhone: string;
  transcript: string;
  summary: string;
  structuredData: any;
  callId: string;
} {
  // Vapi can send data in different formats:
  // 1. Direct: { call, transcript, analysis, ... }
  // 2. Wrapped: { message: { call, transcript, analysis, ... } }

  const data = payload.message || payload;

  // Get phone number from various possible locations
  const customerPhone =
    data.call?.customer?.number ||
    data.customer?.number ||
    payload.call?.customer?.number ||
    payload.from ||
    '';

  // Get transcript
  const transcript =
    data.transcript ||
    data.artifact?.transcript ||
    payload.transcript ||
    '';

  // Get summary
  const summary =
    data.summary ||
    data.artifact?.summary ||
    payload.summary ||
    '';

  // Get structured data from analysis
  const structuredData =
    data.analysis?.structuredData ||
    data.analysis ||
    data.structuredData ||
    payload.analysis?.structuredData ||
    payload.analysis ||
    payload.structuredData ||
    {};

  // Get call ID
  const callId =
    data.call?.id ||
    payload.call?.id ||
    data.callId ||
    payload.callId ||
    '';

  return { customerPhone, transcript, summary, structuredData, callId };
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Log the full payload for debugging
    console.log('=== VAPI WEBHOOK RECEIVED ===');
    console.log('Payload keys:', Object.keys(payload));
    console.log('Full payload:', JSON.stringify(payload, null, 2).substring(0, 2000));

    // Extract data from Vapi payload
    const { customerPhone, transcript, summary, structuredData, callId } = extractVapiData(payload);

    console.log('Extracted data:', { customerPhone, hasTranscript: !!transcript, structuredData });

    // Build lead object - try multiple field name variations
    const lead = {
      customerName:
        structuredData?.customerName ||
        structuredData?.name ||
        structuredData?.customer_name ||
        structuredData?.fullName ||
        structuredData?.full_name ||
        '',
      phone:
        structuredData?.phone ||
        structuredData?.phoneNumber ||
        structuredData?.phone_number ||
        customerPhone ||
        '',
      address:
        structuredData?.address ||
        structuredData?.streetAddress ||
        structuredData?.street_address ||
        '',
      city:
        structuredData?.city ||
        '',
      zip:
        structuredData?.zip ||
        structuredData?.zipCode ||
        structuredData?.zip_code ||
        structuredData?.postalCode ||
        '',
      propertyType:
        structuredData?.propertyType ||
        structuredData?.property_type ||
        '',
      service:
        structuredData?.serviceRequested ||
        structuredData?.service ||
        structuredData?.service_requested ||
        structuredData?.serviceType ||
        'Air Duct Cleaning',
      numUnits:
        structuredData?.numUnits ||
        structuredData?.acUnits ||
        structuredData?.num_units ||
        structuredData?.units ||
        '',
      numVents:
        structuredData?.numVents ||
        structuredData?.vents ||
        structuredData?.num_vents ||
        '',
      appointmentDate:
        structuredData?.appointmentDate ||
        structuredData?.preferredDate ||
        structuredData?.appointment_date ||
        structuredData?.date ||
        '',
      timeWindow:
        structuredData?.timeWindow ||
        structuredData?.preferredTime ||
        structuredData?.appointmentTime ||
        structuredData?.time_window ||
        structuredData?.time ||
        '',
      gateCode:
        structuredData?.gateCode ||
        structuredData?.accessCode ||
        structuredData?.gate_code ||
        '',
      accessInstructions:
        structuredData?.accessInstructions ||
        structuredData?.access_instructions ||
        structuredData?.specialInstructions ||
        '',
      pets:
        structuredData?.pets ||
        '',
      notes: transcript?.substring(0, 500) || summary || '',
    };

    // Normalize phone number
    const normalizedPhone = lead.phone.replace(/^\+1/, '').replace(/\D/g, '');

    // If no customer name but we have a phone number and transcript, still save it
    if (!lead.customerName && !normalizedPhone) {
      console.log('Voice webhook: No customer name or phone, skipping');
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'No customer name or phone number',
        debug: { payloadKeys: Object.keys(payload), structuredDataKeys: Object.keys(structuredData) }
      });
    }

    // Use "Unknown Caller" if no name but we have phone
    if (!lead.customerName && normalizedPhone) {
      lead.customerName = `Caller ${normalizedPhone.slice(-4)}`;
    }

    // Parse and normalize appointment date/time
    const appointmentDate = parseAppointmentDate(lead.appointmentDate);
    const timeWindow = normalizeTimeWindow(lead.timeWindow);

    // Get current timestamp
    const now = new Date();
    const createdDate = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;
    const houstonTime = now.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Determine status
    const status = appointmentDate ? 'SCHEDULED' : 'NEW';

    // Save to Google Sheet
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const leadId = await generateLeadId(sheets);

    // Build full row
    const row = new Array(125).fill('');

    row[0] = leadId;
    row[1] = status;
    row[2] = 'MEDIUM';
    row[3] = createdDate;
    row[4] = lead.customerName;
    row[5] = normalizedPhone;
    row[6] = '';
    row[7] = lead.address;
    row[8] = lead.city;
    row[9] = lead.zip;
    row[10] = lead.propertyType;
    row[11] = 'Phone - AI Receptionist';
    row[12] = 'Vapi Voice AI';
    row[16] = lead.service;
    row[17] = lead.numUnits;
    row[18] = lead.numVents;
    row[19] = lead.notes;
    row[43] = appointmentDate;
    row[45] = timeWindow;
    row[50] = lead.accessInstructions;
    row[51] = lead.gateCode;
    row[53] = lead.pets;
    row[117] = houstonTime;
    row[118] = 'AI Receptionist';

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:DU`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.log(`Voice webhook: Lead ${leadId} saved to Google Sheets`);

    // Send SMS notification
    let smsStatus = 'not attempted';
    try {
      const smsCheck = shouldSendSMS(OWNER_PHONE);
      if (client && smsCheck.allowed) {
        const appointmentInfo = appointmentDate
          ? `📅 ${appointmentDate}${timeWindow ? ` (${timeWindow})` : ''}`
          : '⏳ No appointment set - needs callback';

        const smsBody = `📞 NEW LEAD (AI)

Name: ${lead.customerName}
Phone: ${normalizedPhone}
Address: ${lead.address}${lead.city ? ', ' + lead.city : ''}${lead.zip ? ' ' + lead.zip : ''}
Service: ${lead.service}
${appointmentInfo}${lead.gateCode ? `\nGate: ${lead.gateCode}` : ''}

Lead ID: ${leadId}`;

        await client.messages.create({
          body: smsBody,
          ...getSenderParams(),
          to: formatPhoneForTwilio(OWNER_PHONE),
        });

        console.log(`Voice webhook: SMS sent to ${OWNER_PHONE}`);
        smsStatus = 'sent';
      } else {
        smsStatus = `skipped: ${smsCheck.reason || 'client not configured'}`;
      }
    } catch (smsError: any) {
      console.error('Voice webhook: SMS failed:', smsError);
      smsStatus = `failed: ${smsError?.message || String(smsError)}`;
    }

    return NextResponse.json({
      success: true,
      leadId,
      smsStatus,
      message: 'Lead saved to Google Sheets'
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
