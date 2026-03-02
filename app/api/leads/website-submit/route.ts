import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, SPREADSHEET_ID } from '@/lib/google-sheets';

const WEBSITE_LEADS_SHEET = 'Website Leads';

// Telegram config
const TELEGRAM_BOT_TOKEN = '8287761472:AAHUXN6VhTapnMyE1agD6yhjNSBixNfeCNI';
const TELEGRAM_CHAT_ID = '7327298510';

// Format phone as (xxx) xxx-xxxx
function formatPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
  }
  return phone;
}

// Send Telegram notification
async function sendTelegramAlert(lead: {
  name: string;
  phone: string;
  email: string;
  service: string;
  message: string;
  source: string;
}) {
  try {
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });

    const text = `🔔 NEW LEAD — ${lead.source}
━━━━━━━━━━━━━━━━
👤 Name: ${lead.name}
📞 Phone: ${lead.phone}
📧 Email: ${lead.email || 'N/A'}
🔧 Service: ${lead.service}
${lead.message ? `📝 Message: ${lead.message}\n` : ''}━━━━━━━━━━━━━━━━
⏰ ${timestamp}`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
      }),
    });
  } catch (err) {
    console.error('Telegram error:', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Format the lead data
    const lead = {
      name: data.name || '',
      phone: formatPhone(data.phone) || '',
      email: data.email || '',
      service: data.service || '',
      message: data.message || '',
      source: data.source || 'Website',
    };

    // Get timestamp
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });

    // Save to Google Sheets
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Check if sheet exists, create if not
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const sheetExists = spreadsheet.data.sheets?.some(
      (s) => s.properties?.title === WEBSITE_LEADS_SHEET
    );

    if (!sheetExists) {
      // Create sheet with headers
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: WEBSITE_LEADS_SHEET },
              },
            },
          ],
        },
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${WEBSITE_LEADS_SHEET}!A:H`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Timestamp', 'Name', 'Phone', 'Email', 'Service', 'Message', 'Source', 'Status']],
        },
      });
    }

    // Append the lead (apostrophe forces phone to be text)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${WEBSITE_LEADS_SHEET}!A:H`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          timestamp,
          lead.name,
          "'" + lead.phone,
          lead.email,
          lead.service,
          lead.message,
          lead.source,
          'New',
        ]],
      },
    });

    // Send Telegram notification
    await sendTelegramAlert(lead);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Website form submission error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'Website form endpoint ready' });
}
