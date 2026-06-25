import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID } from '@/lib/google-sheets';

const SMS_LOG_SHEET = 'SMS LOG';

export interface SmsLogEntry {
  api: string;            // e.g. 'booking-confirmation', 'reminder-day-before', 'reminder-same-day'
  leadId: string;
  customer: string;
  phone: string;
  status: 'success' | 'error';
  twilioSid?: string;
  error?: string;
  device?: string;        // user-agent string
}

/**
 * Append a row to the SMS LOG sheet. Failures here are swallowed so they
 * never break the actual SMS-send flow.
 */
export async function logSmsAttempt(entry: SmsLogEntry): Promise<void> {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SMS_LOG_SHEET}!A:I`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          timestamp,              // A: Timestamp
          entry.api,              // B: API
          entry.leadId || '',     // C: Lead ID
          entry.customer || '',   // D: Customer
          entry.phone || '',      // E: Phone
          entry.status,           // F: Status
          entry.twilioSid || '',  // G: Twilio SID
          entry.error || '',      // H: Error
          entry.device || '',     // I: Device
        ]],
      },
    });
  } catch (err) {
    // Logging failures should never break the user flow
    console.error('[sms-log] Failed to write to SMS LOG sheet:', err);
  }
}
