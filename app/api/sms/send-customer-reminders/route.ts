import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, DATA_RANGE, columnIndexToLetter } from '@/lib/google-sheets';
import { logSmsAttempt } from '@/app/lib/sms-log';
import {
  client,
  twilioPhone,
  messagingServiceSid,
  formatPhoneForTwilio,
  getHoustonDateTime,
  formatDateForSMS,
  shouldSendSMS,
  getSenderParams,
} from '@/lib/twilio';

// Column X = "Reminder Sent" - tracks when day-before reminder was sent
const REMINDER_SENT_COL = 'X';
const REMINDER_SENT_HEADER = 'Reminder Sent';

export async function POST(request: NextRequest) {
  const device = request.headers.get('user-agent') || '';
  try {
    // Check for Twilio configuration (needs client AND either phone or messaging service)
    if (!client || (!twilioPhone && !messagingServiceSid)) {
      return NextResponse.json({
        success: false,
        error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID.'
      }, { status: 500 });
    }

    const body = await request.json();
    const { date, leadId, mode = 'day-before' } = body; // mode: 'day-before' (default) or 'same-day'
    const isSameDay = mode === 'same-day';
    const apiName = isSameDay ? 'reminder-same-day' : 'reminder-day-before';

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
      return NextResponse.json({ success: false, error: 'No data found' });
    }

    const headers = rows[0];
    const leads = rows.slice(1).map((row, index) => {
      const lead: Record<string, string> = { rowIndex: String(index + 2) };
      headers.forEach((header: string, i: number) => {
        lead[header] = row[i] || '';
      });
      return lead;
    });

    // Find the column index for reminder sent status (column X)
    const reminderSentColIndex = headers.indexOf(REMINDER_SENT_HEADER);
    if (reminderSentColIndex === -1) {
      console.warn(`"${REMINDER_SENT_HEADER}" column not found in sheet headers`);
    }

    // Calculate target date in Houston timezone (today for same-day, tomorrow for day-before)
    const houston = getHoustonDateTime();
    const target = new Date(houston);
    if (!isSameDay) target.setDate(target.getDate() + 1);
    const targetStr = `${String(target.getMonth() + 1).padStart(2, '0')}/${String(target.getDate()).padStart(2, '0')}/${target.getFullYear()}`;
    const targetISO = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;

    // Use provided date or computed target
    const targetDate = date || targetStr;

    // Filter jobs for target date
    const isDateMatch = (apptDate: string) => {
      if (!apptDate) return false;

      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(apptDate)) {
        const [m, d, y] = apptDate.split('/');
        const normalized = `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
        return normalized === targetStr || apptDate === targetDate;
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
        return apptDate === targetISO || apptDate === targetDate;
      }

      return false;
    };

    // Get scheduled jobs for tomorrow
    const jobsToRemind = leads.filter(lead => {
      const status = lead['Status']?.toUpperCase();
      const isScheduled = status === 'SCHEDULED' || status === 'IN PROGRESS';
      const isOnDate = isDateMatch(lead['Appointment Date']);
      const hasPhone = lead['Phone Number'] && lead['Phone Number'] !== '-';

      // Duplicate-send protection: skip if reminder already sent (column X has value)
      const reminderSent = (lead[REMINDER_SENT_HEADER] || '').trim();
      const alreadyReminded = reminderSent !== '';

      // If specific leadId provided, only process that one (bypass duplicate check for manual sends)
      if (leadId) {
        return lead['Lead ID'] === leadId && hasPhone;
      }

      return isScheduled && isOnDate && hasPhone && !alreadyReminded;
    });

    const results: Array<{
      leadId: string;
      customer: string;
      success: boolean;
      message?: string;
      error?: string
    }> = [];

    // Business phone for rescheduling
    const businessPhone = process.env.BUSINESS_PHONE || '(832) XXX-XXXX';

    for (const job of jobsToRemind) {
      const customerName = job['Customer Name']?.split(' ')[0] || 'there'; // First name
      const timeWindow = job['Time Window'] || 'your scheduled time';
      const service = job['Service Requested'];
      const techName = job['Assigned To'] || 'our technician';
      const apptDate = formatDateForSMS(job['Appointment Date']);
      const phone = job['Phone Number'];
      const leadSource = job['Lead Source']?.toLowerCase() || '';
      const referralSource = job['Referral Source'] || '';

      // Determine company name based on lead source
      let companyName = 'ClearAir Solutions';
      if ((leadSource === 'lead company' || leadSource.includes('lead gen')) && referralSource) {
        companyName = referralSource;
      } else if (leadSource === 'partner' && referralSource) {
        companyName = referralSource;
      }

      // Build customer SMS
      const whenWord = isSameDay ? 'today' : 'tomorrow';
      let sms = `Hi ${customerName}! This is ${companyName}.\n\n`;
      sms += `Reminder: Your ${service} appointment is ${whenWord} (${apptDate}) between ${timeWindow}.\n\n`;
      sms += `Our technician will call you 30-40 minutes before his arrival.\n\n`;
      sms += `Reply C to confirm or call ${businessPhone} to reschedule.`;

      // Check if this number should receive SMS
      const smsCheck = shouldSendSMS(phone);
      if (!smsCheck.allowed) {
        await logSmsAttempt({
          api: apiName, leadId: job['Lead ID'], customer: job['Customer Name'], phone,
          status: 'error', error: `Skipped: ${smsCheck.reason}`, device,
        });
        results.push({
          leadId: job['Lead ID'],
          customer: job['Customer Name'],
          success: false,
          error: `Skipped: ${smsCheck.reason}`
        });
        continue;
      }

      try {
        const twilioMessage = await client.messages.create({
          body: sms,
          ...getSenderParams(),
          to: formatPhoneForTwilio(phone),
        });

        // Update column X to mark reminder sent with timestamp
        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${REMINDER_SENT_COL}${job.rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[timestamp]],
          },
        });

        await logSmsAttempt({
          api: apiName, leadId: job['Lead ID'], customer: job['Customer Name'], phone,
          status: 'success', twilioSid: twilioMessage.sid, device,
        });
        results.push({
          leadId: job['Lead ID'],
          customer: job['Customer Name'],
          success: true,
          message: 'Reminder sent'
        });
      } catch (err: any) {
        await logSmsAttempt({
          api: apiName, leadId: job['Lead ID'], customer: job['Customer Name'], phone,
          status: 'error', error: err.message || String(err), device,
        });
        results.push({
          leadId: job['Lead ID'],
          customer: job['Customer Name'],
          success: false,
          error: err.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      totalSent: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length,
      results
    });
  } catch (error: any) {
    console.error('Customer reminder error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
