import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME } from '@/lib/google-sheets';
import { client, formatPhoneForTwilio, getSenderParams, shouldSendSMS } from '@/lib/twilio';

const OWNER_PHONE = '2818140061'; // Owner's personal cell for notifications

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
        if (daysUntil === 0) daysUntil = 7; // Next week if today
        targetDate.setDate(targetDate.getDate() + daysUntil);
        break;
      }
    }
  }

  if (targetDate) {
    return `${(targetDate.getMonth() + 1).toString().padStart(2, '0')}/${targetDate.getDate().toString().padStart(2, '0')}/${targetDate.getFullYear()}`;
  }

  return dateStr; // Return as-is if can't parse
}

// Normalize time window to standard format
function normalizeTimeWindow(timeStr: string): string {
  if (!timeStr) return '';

  const lower = timeStr.toLowerCase();

  if (lower.includes('morning') || lower.includes('8') || lower.includes('am')) {
    return 'Morning (8-12)';
  }
  if (lower.includes('afternoon') || lower.includes('12') || lower.includes('1') || lower.includes('pm')) {
    return 'Afternoon (12-5)';
  }
  if (lower.includes('evening') || lower.includes('5') || lower.includes('after')) {
    return 'Evening';
  }

  return timeStr;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Extract data from Vapi end-of-call webhook
    const { call, transcript, structuredData, analysis } = payload;

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
      appointmentDate: structuredData?.appointmentDate || structuredData?.preferredDate || '',
      timeWindow: structuredData?.timeWindow || structuredData?.preferredTime || structuredData?.appointmentTime || '',
      gateCode: structuredData?.gateCode || structuredData?.accessCode || '',
      accessInstructions: structuredData?.accessInstructions || '',
      pets: structuredData?.pets || '',
      notes: transcript?.substring(0, 500) || '',
    };

    // Skip if no customer name (likely a hang-up or wrong number)
    if (!lead.customerName) {
      console.log('Voice webhook: No customer name, skipping lead creation');
      return NextResponse.json({ success: true, skipped: true, reason: 'No customer name' });
    }

    // Normalize phone number
    const normalizedPhone = lead.phone.replace(/^\+1/, '').replace(/\D/g, '');

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

    // Determine status based on whether appointment was scheduled
    const status = appointmentDate ? 'SCHEDULED' : 'NEW';

    // Save to Google Sheet
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Generate proper sequential Lead ID
    const leadId = await generateLeadId(sheets);

    // Build full row with correct column positions (125 columns: A to DU)
    const row = new Array(125).fill('');

    row[0] = leadId;                              // A: Lead ID
    row[1] = status;                              // B: Status
    row[2] = 'MEDIUM';                            // C: Priority Level
    row[3] = createdDate;                         // D: Lead Created Date
    row[4] = lead.customerName;                   // E: Customer Name
    row[5] = normalizedPhone;                     // F: Phone Number
    row[6] = '';                                  // G: Email
    row[7] = lead.address;                        // H: Address
    row[8] = lead.city;                           // I: City
    row[9] = lead.zip;                            // J: Zip Code
    row[10] = lead.propertyType;                  // K: Property Type
    row[11] = 'Phone - AI Receptionist';          // L: Lead Source
    row[12] = 'Vapi Voice AI';                    // M: Lead Source Detail
    row[16] = lead.service;                       // Q: Service Requested
    row[17] = lead.numUnits;                      // R: # of Units
    row[18] = lead.numVents;                      // S: # of Vents
    row[19] = lead.notes;                         // T: Customer Issue/Notes
    row[43] = appointmentDate;                    // AR: Appointment Date
    row[45] = timeWindow;                         // AT: Time Window
    row[50] = lead.accessInstructions;            // AY: Access Instructions
    row[51] = lead.gateCode;                      // AZ: Gate Code/Special Access
    row[53] = lead.pets;                          // BB: Pets
    row[117] = houstonTime;                       // DN: Last Modified
    row[118] = 'AI Receptionist';                 // DO: Last Modified By

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:DU`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.log(`Voice webhook: Lead ${leadId} saved to Google Sheets`);

    // Send SMS notification to owner
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
