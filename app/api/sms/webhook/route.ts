import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, DATA_RANGE, columnIndexToLetter } from '@/lib/google-sheets';

// Header name for the appointment confirmation column (column AU)
const CONFIRMATION_HEADER = 'Appointment Confirmed';

// This webhook receives incoming SMS messages from Twilio
// When a customer replies "C" to confirm their appointment

export async function POST(request: NextRequest) {
  try {
    // Parse the Twilio webhook data (form-urlencoded)
    const formData = await request.formData();
    const from = formData.get('From') as string; // Customer's phone number
    const body = (formData.get('Body') as string || '').trim().toUpperCase();
    const messageSid = formData.get('MessageSid') as string;

    console.log(`Received SMS from ${from}: "${body}"`);

    // Normalize phone number (remove +1 prefix)
    const normalizedPhone = from.replace(/^\+1/, '').replace(/\D/g, '');

    // Google Sheets setup (supports both env var and keyFile auth)
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all leads (wide range to cover all columns including AU, AR, etc.)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: DATA_RANGE,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return createTwiMLResponse('Sorry, we could not find your appointment.');
    }

    const headers = rows[0];
    const phoneColIndex = headers.indexOf('Phone Number');
    const confirmedColIndex = headers.indexOf(CONFIRMATION_HEADER);
    const statusColIndex = headers.indexOf('Status');

    if (phoneColIndex === -1) {
      console.error('Phone Number column not found');
      return createTwiMLResponse('System error. Please call us directly.');
    }

    if (confirmedColIndex === -1) {
      console.warn(`"${CONFIRMATION_HEADER}" column not found in sheet headers`);
    }

    // Find the lead with matching phone number and scheduled status
    let matchedRow: number | null = null;
    let matchedLead: Record<string, string> | null = null;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const leadPhone = (row[phoneColIndex] || '').replace(/\D/g, '');
      const status = (row[statusColIndex] || '').toUpperCase();

      // Match phone and check if scheduled
      if (leadPhone === normalizedPhone && (status === 'SCHEDULED' || status === 'IN PROGRESS')) {
        matchedRow = i + 1; // Sheet rows are 1-indexed, and we skip header
        matchedLead = {};
        headers.forEach((header: string, idx: number) => {
          matchedLead![header] = row[idx] || '';
        });
        break;
      }
    }

    if (!matchedRow || !matchedLead) {
      return createTwiMLResponse('We could not find a scheduled appointment for this phone number. Please call us if you need assistance.');
    }

    // Check if message is a confirmation
    if (body === 'C' || body === 'CONFIRM' || body === 'YES' || body === 'Y') {
      // Update the sheet to mark as confirmed
      if (confirmedColIndex !== -1) {
        const colLetter = columnIndexToLetter(confirmedColIndex);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${colLetter}${matchedRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['YES']],
          },
        });
      }

      const customerName = matchedLead['Customer Name']?.split(' ')[0] || '';
      const timeWindow = matchedLead['Time Window'] || 'your scheduled time';

      return createTwiMLResponse(
        `Thanks ${customerName}! Your appointment is confirmed for ${timeWindow} tomorrow. We'll see you then!`
      );
    } else if (body === 'CANCEL' || body === 'RESCHEDULE' || body === 'N' || body === 'NO') {
      // Customer wants to cancel or reschedule
      const businessPhone = process.env.BUSINESS_PHONE || '(832) XXX-XXXX';

      // Update confirmation status
      if (confirmedColIndex !== -1) {
        const colLetter = columnIndexToLetter(confirmedColIndex);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${colLetter}${matchedRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['NO']],
          },
        });
      }

      return createTwiMLResponse(
        `No problem! Please call us at ${businessPhone} to reschedule your appointment. We're happy to find a better time for you.`
      );
    } else {
      // Unknown response
      return createTwiMLResponse(
        `Reply C to confirm your appointment, or call us to reschedule.`
      );
    }
  } catch (error: any) {
    console.error('Webhook error:', error);
    return createTwiMLResponse('Sorry, there was an error processing your message. Please call us directly.');
  }
}

// Twilio expects TwiML response
function createTwiMLResponse(message: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;

  return new NextResponse(twiml, {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Also handle GET for Twilio webhook verification
export async function GET() {
  return NextResponse.json({ status: 'SMS webhook ready' });
}
