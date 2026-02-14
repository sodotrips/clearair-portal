import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME } from '@/lib/google-sheets';
import { client, formatPhoneForTwilio, getSenderParams, shouldSendSMS } from '@/lib/twilio';

const OWNER_PHONE = '2818140061'; // Owner's phone for notifications
const CALL_LOG_SHEET = 'CALL LOG'; // All calls go here for analytics

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

  // Get structured data - Vapi uses "structuredOutputs" (plural) under artifact
  // Format: { [UUID]: { name: "leadInfo", result: { customerName, phone, ... } } }
  const artifact = data.artifact || payload.artifact || {};

  let structuredData: any = {};

  if (artifact.structuredOutputs && typeof artifact.structuredOutputs === 'object') {
    const outputs = artifact.structuredOutputs;

    // Get the first key (UUID) and extract the result
    const keys = Object.keys(outputs);
    if (keys.length > 0) {
      const firstOutput = outputs[keys[0]];
      // The actual data is in the "result" property
      if (firstOutput?.result) {
        structuredData = firstOutput.result;
      } else if (firstOutput?.name === 'leadInfo' && firstOutput) {
        // Fallback if result is at a different level
        structuredData = firstOutput;
      }
    }
  }

  // Fallback to other locations if structuredOutputs didn't work
  if (!structuredData || Object.keys(structuredData).length === 0) {
    structuredData =
      data.analysis?.structuredData?.leadInfo ||
      data.analysis?.structuredData ||
      payload.analysis?.structuredData?.leadInfo ||
      payload.analysis?.structuredData ||
      data.structuredData?.leadInfo ||
      data.structuredData ||
      payload.structuredData?.leadInfo ||
      payload.structuredData ||
      {};
  }

  // Get call ID
  const callId =
    data.call?.id ||
    payload.call?.id ||
    data.callId ||
    payload.callId ||
    '';

  return { customerPhone, transcript, summary, structuredData, callId };
}

// Track processed calls to prevent duplicates
const processedCalls = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Log the payload type
    console.log('=== VAPI WEBHOOK RECEIVED ===');
    console.log('Payload keys:', Object.keys(payload));

    // IMPORTANT: Only process "end-of-call-report" messages
    // Vapi sends multiple event types - we only want the final report
    const messageType = payload.message?.type || payload.type || '';

    if (messageType && messageType !== 'end-of-call-report') {
      console.log(`Skipping non-final event: ${messageType}`);
      return NextResponse.json({ success: true, skipped: true, reason: `Event type: ${messageType}` });
    }

    // Extract data from Vapi payload
    const { customerPhone, transcript, summary, structuredData, callId } = extractVapiData(payload);

    // Prevent duplicate processing of same call
    if (callId && processedCalls.has(callId)) {
      console.log(`Skipping duplicate call: ${callId}`);
      return NextResponse.json({ success: true, skipped: true, reason: 'Duplicate call' });
    }
    if (callId) {
      processedCalls.add(callId);
      // Clean up old entries after 5 minutes
      setTimeout(() => processedCalls.delete(callId), 5 * 60 * 1000);
    }

    console.log('Extracted data:', { customerPhone, hasTranscript: !!transcript, structuredData });
    console.log('Full structuredData:', JSON.stringify(structuredData, null, 2));
    console.log('Payload analysis:', JSON.stringify(payload.message?.analysis || payload.analysis, null, 2));

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

    // Normalize phone number and format as (xxx) xxx-xxxx
    const phoneDigits = lead.phone.replace(/^\+1/, '').replace(/\D/g, '');
    const formattedPhone = phoneDigits.length === 10
      ? `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`
      : phoneDigits;

    // Use "Unknown Caller" if no name but we have phone
    if (!lead.customerName && phoneDigits) {
      lead.customerName = `Caller ${phoneDigits.slice(-4)}`;
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

    // Get call duration if available
    const callDuration = payload.message?.call?.duration || payload.call?.duration || '';

    // Determine call outcome
    let callOutcome = 'INQUIRY';
    if (appointmentDate && lead.customerName && phoneDigits) {
      callOutcome = 'BOOKED';
    } else if (!lead.customerName && !phoneDigits) {
      callOutcome = 'SPAM/HANGUP';
    } else if (transcript?.toLowerCase().includes('transfer') || transcript?.toLowerCase().includes('speak to someone')) {
      callOutcome = 'TRANSFER REQUEST';
    }

    // Save to Google Sheet
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // ============================================
    // STEP 1: ALWAYS save to CALL LOG (all calls)
    // ============================================
    const callLogId = `CALL-${Date.now().toString().slice(-8)}`;
    const isValidLead = !!(appointmentDate && lead.customerName && phoneDigits);

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${CALL_LOG_SHEET}!A:L`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            callLogId,                                    // A: Call Log ID
            houstonTime,                                  // B: Timestamp
            formattedPhone || customerPhone || '(unknown)', // C: Caller Phone
            lead.customerName || '(not captured)',        // D: Customer Name
            lead.service || '(not specified)',            // E: Service Inquiry
            callOutcome,                                  // F: Outcome (BOOKED, INQUIRY, SPAM/HANGUP, TRANSFER REQUEST)
            isValidLead ? 'YES' : 'NO',                   // G: Promoted to Lead?
            isValidLead ? '' : '',                        // H: Lead ID (filled below if promoted)
            callDuration ? `${Math.round(callDuration)}s` : '', // I: Duration
            appointmentDate || '(none)',                  // J: Appointment Date
            timeWindow || '(none)',                       // K: Time Window
            (transcript || '').substring(0, 300),         // L: Transcript Preview
          ]],
        },
      });
      console.log(`Voice webhook: Call logged to CALL LOG - ${callLogId} (${callOutcome})`);
    } catch (callLogError) {
      console.error('Failed to save to CALL LOG:', callLogError);
      // Continue - don't fail if call log save fails
    }

    // ============================================
    // STEP 2: Only save to ACTIVE LEADS if valid
    // (has name + phone + appointment date)
    // ============================================
    let leadId = '';

    if (isValidLead) {
      leadId = await generateLeadId(sheets);

      // Build full row for ACTIVE LEADS
      const row = new Array(125).fill('');

      row[0] = leadId;
      row[1] = 'SCHEDULED';
      row[2] = 'MEDIUM';
      row[3] = createdDate;
      row[4] = lead.customerName;
      row[5] = formattedPhone;
      row[6] = '';
      row[7] = lead.address;
      row[8] = lead.city;
      row[9] = lead.zip;
      row[10] = '';
      row[11] = 'Phone - AI Receptionist';
      row[12] = '';
      row[16] = lead.service;
      row[17] = '';
      row[18] = '';
      row[19] = `Customer called in via AI Receptionist. Call Log ID: ${callLogId}`;
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

      console.log(`Voice webhook: Lead ${leadId} promoted to ACTIVE LEADS`);

      // Update CALL LOG with the Lead ID
      // Find the row we just added and update column H
      try {
        const callLogData = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${CALL_LOG_SHEET}!A:A`,
        });
        const callLogRows = callLogData.data.values || [];
        const rowIndex = callLogRows.findIndex((r: string[]) => r[0] === callLogId);
        if (rowIndex >= 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${CALL_LOG_SHEET}!H${rowIndex + 1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[leadId]] },
          });
        }
      } catch (updateError) {
        console.error('Failed to update CALL LOG with Lead ID:', updateError);
      }
    } else {
      console.log(`Voice webhook: Call logged but NOT promoted (missing: ${!lead.customerName ? 'name ' : ''}${!phoneDigits ? 'phone ' : ''}${!appointmentDate ? 'appointment' : ''})`);
    }

    // Save full transcript to separate TRANSCRIPTS tab (with debug info)
    try {
      const artifactObj = payload.message?.artifact || payload.artifact || {};
      const debugInfo = JSON.stringify({
        hasStructuredOutputs: !!artifactObj.structuredOutputs,
        structuredDataExtracted: structuredData,
        callOutcome,
        isValidLead,
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'TRANSCRIPTS!A:E',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[callLogId, leadId || '(not promoted)', transcript || '(no transcript)', houstonTime, debugInfo]],
        },
      });
      console.log(`Voice webhook: Transcript saved for ${callLogId}`);
    } catch (transcriptError) {
      console.error('Failed to save transcript:', transcriptError);
    }

    // Send SMS notification - different message for booked vs inquiry
    let smsStatus = 'not attempted';
    try {
      const smsCheck = shouldSendSMS(OWNER_PHONE);
      if (client && smsCheck.allowed) {
        let smsBody = '';

        if (isValidLead) {
          // BOOKED APPOINTMENT - Full details
          smsBody = `✅ NEW BOOKING (AI)

Name: ${lead.customerName}
Phone: ${formattedPhone}
Address: ${lead.address}${lead.city ? ', ' + lead.city : ''}${lead.zip ? ' ' + lead.zip : ''}
Service: ${lead.service}
📅 ${appointmentDate}${timeWindow ? ` (${timeWindow})` : ''}${lead.gateCode ? `\nGate: ${lead.gateCode}` : ''}

Lead ID: ${leadId}`;
        } else if (phoneDigits || lead.customerName) {
          // INQUIRY ONLY - no appointment, but has some info
          smsBody = `📞 AI CALL (No Booking)

Name: ${lead.customerName || '(unknown)'}
Phone: ${formattedPhone || '(unknown)'}
Outcome: ${callOutcome}

Review in CALL LOG: ${callLogId}`;
        }

        // Only send SMS if we have content
        if (smsBody) {
          await client.messages.create({
            body: smsBody,
            ...getSenderParams(),
            to: formatPhoneForTwilio(OWNER_PHONE),
          });
          console.log(`Voice webhook: SMS sent to ${OWNER_PHONE}`);
          smsStatus = 'sent';
        } else {
          smsStatus = 'skipped: no meaningful data to report';
        }
      } else {
        smsStatus = `skipped: ${smsCheck.reason || 'client not configured'}`;
      }
    } catch (smsError: any) {
      console.error('Voice webhook: SMS failed:', smsError);
      smsStatus = `failed: ${smsError?.message || String(smsError)}`;
    }

    return NextResponse.json({
      success: true,
      callLogId,
      leadId: leadId || null,
      outcome: callOutcome,
      promotedToLead: isValidLead,
      smsStatus,
      message: isValidLead ? 'Appointment booked - added to ACTIVE LEADS' : 'Call logged - not promoted (missing required fields)'
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
