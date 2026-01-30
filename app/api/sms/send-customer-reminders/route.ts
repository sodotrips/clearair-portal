import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, DATA_RANGE, columnIndexToLetter } from '@/lib/google-sheets';
import {
  client,
  twilioPhone,
  messagingServiceSid,
  formatPhoneForTwilio,
  getHoustonDateTime,
  formatDateForSMS,
  shouldSendSMS,
  SMS_TEST_MODE
} from '@/lib/twilio';

// Header name for the appointment confirmation column (column AU)
const CONFIRMATION_HEADER = 'Appointment Confirmed';

export async function POST(request: NextRequest) {
  try {
    // Check for Twilio configuration
    if (!client || !twilioPhone) {
      return NextResponse.json({
        success: false,
        error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.'
      }, { status: 500 });
    }

    const body = await request.json();
    const { date, leadId } = body; // Optional: specific date or single lead

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

    // Find the column index for confirmation status
    const confirmedColIndex = headers.indexOf(CONFIRMATION_HEADER);
    if (confirmedColIndex === -1) {
      console.warn(`"${CONFIRMATION_HEADER}" column not found in sheet headers`);
    }

    // Calculate tomorrow's date in Houston timezone
    const houston = getHoustonDateTime();
    const tomorrow = new Date(houston);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${String(tomorrow.getDate()).padStart(2, '0')}/${tomorrow.getFullYear()}`;
    const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    // Use provided date or tomorrow
    const targetDate = date || tomorrowStr;

    // Filter jobs for tomorrow
    const isDateMatch = (apptDate: string) => {
      if (!apptDate) return false;

      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(apptDate)) {
        const [m, d, y] = apptDate.split('/');
        const normalized = `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
        return normalized === tomorrowStr || apptDate === targetDate;
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
        return apptDate === tomorrowISO || apptDate === targetDate;
      }

      return false;
    };

    // Get scheduled jobs for tomorrow
    const jobsToRemind = leads.filter(lead => {
      const status = lead['Status']?.toUpperCase();
      const isScheduled = status === 'SCHEDULED' || status === 'IN PROGRESS';
      const isOnDate = isDateMatch(lead['Appointment Date']);
      const hasPhone = lead['Phone Number'] && lead['Phone Number'] !== '-';

      // If specific leadId provided, only process that one
      if (leadId) {
        return lead['Lead ID'] === leadId && hasPhone;
      }

      return isScheduled && isOnDate && hasPhone;
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
      let companyName = 'ClearAir';
      if ((leadSource === 'lead company' || leadSource.includes('lead gen')) && referralSource) {
        companyName = referralSource;
      } else if (leadSource === 'partner' && referralSource) {
        companyName = referralSource;
      }

      // Build customer SMS
      let sms = `Hi ${customerName}! This is ${companyName}.\n\n`;
      sms += `Reminder: Your ${service} appointment is tomorrow (${apptDate}) between ${timeWindow}.\n\n`;
      sms += `${techName} will arrive in a ${companyName === 'ClearAir' ? 'ClearAir' : 'service'} van.\n\n`;
      sms += `Reply C to confirm or call ${businessPhone} to reschedule.`;

      // Check if this number should receive SMS
      const smsCheck = shouldSendSMS(phone);
      if (!smsCheck.allowed) {
        results.push({
          leadId: job['Lead ID'],
          customer: job['Customer Name'],
          success: false,
          error: `Skipped: ${smsCheck.reason}`
        });
        continue;
      }

      try {
        await client.messages.create({
          body: sms,
          messagingServiceSid: messagingServiceSid,
          to: formatPhoneForTwilio(phone),
        });

        // Update sheet to mark reminder sent - set confirmation to "PENDING"
        if (confirmedColIndex !== -1) {
          const colLetter = columnIndexToLetter(confirmedColIndex);
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!${colLetter}${job.rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [['PENDING']],
            },
          });
        }

        results.push({
          leadId: job['Lead ID'],
          customer: job['Customer Name'],
          success: true,
          message: 'Reminder sent'
        });
      } catch (err: any) {
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
