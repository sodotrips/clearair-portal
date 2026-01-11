import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';
import {
  client,
  twilioPhone,
  messagingServiceSid,
  formatPhoneForTwilio,
  getGoogleMapsLink,
  getHoustonDateTime,
  getRepresentingText,
  shouldSendSMS
} from '@/lib/twilio';

const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';
const SHEET_NAME = 'ACTIVE LEADS';

// Tech phone numbers - add more as needed
const TECH_PHONES: Record<string, string> = {
  'Amit': process.env.AMIT_PHONE || '',
  'Tech 2': process.env.TECH2_PHONE || '',
  'Subcontractor': process.env.SUBCONTRACTOR_PHONE || '',
};

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
    const { tech, date } = body; // Optional: specific tech and date

    // Google Sheets setup
    const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = SPREADSHEET_ID;

    // Get all leads
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:Z`,
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

    // Calculate tomorrow's date in Houston timezone
    const houston = getHoustonDateTime();
    const tomorrow = new Date(houston);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${String(tomorrow.getDate()).padStart(2, '0')}/${tomorrow.getFullYear()}`;
    const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    // Use provided date or tomorrow
    const targetDate = date || tomorrowStr;

    // Filter jobs for tomorrow (or specified date)
    const isDateMatch = (apptDate: string) => {
      if (!apptDate) return false;

      // Handle MM/DD/YYYY format
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(apptDate)) {
        const [m, d, y] = apptDate.split('/');
        const normalized = `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
        return normalized === tomorrowStr || apptDate === targetDate;
      }

      // Handle YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
        return apptDate === tomorrowISO || apptDate === targetDate;
      }

      return false;
    };

    // Group jobs by technician
    const jobsByTech: Record<string, Array<Record<string, string>>> = {};

    leads.forEach(lead => {
      const status = lead['Status']?.toUpperCase();
      const assignedTo = lead['Assigned To'];
      const isScheduled = status === 'SCHEDULED' || status === 'IN PROGRESS';
      const isOnDate = isDateMatch(lead['Appointment Date']);

      if (isScheduled && isOnDate && assignedTo) {
        if (!jobsByTech[assignedTo]) {
          jobsByTech[assignedTo] = [];
        }
        jobsByTech[assignedTo].push(lead);
      }
    });

    // Send SMS to each tech (or just specified tech)
    const techsToNotify = tech ? [tech] : Object.keys(jobsByTech);
    const results: Array<{ tech: string; success: boolean; message?: string; error?: string }> = [];

    for (const techName of techsToNotify) {
      const techPhone = TECH_PHONES[techName];
      const jobs = jobsByTech[techName] || [];

      if (!techPhone) {
        results.push({ tech: techName, success: false, error: 'No phone number configured' });
        continue;
      }

      // Check if this number should receive SMS
      const smsCheck = shouldSendSMS(techPhone);
      if (!smsCheck.allowed) {
        results.push({ tech: techName, success: false, error: `Skipped: ${smsCheck.reason}` });
        continue;
      }

      if (jobs.length === 0) {
        results.push({ tech: techName, success: true, message: 'No jobs scheduled' });
        continue;
      }

      // Sort jobs by time window
      const timeOrder = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];
      jobs.sort((a, b) => {
        return timeOrder.indexOf(a['Time Window'] || '') - timeOrder.indexOf(b['Time Window'] || '');
      });

      // Build SMS message
      let sms = `Hey ${techName}, you have ${jobs.length} job${jobs.length > 1 ? 's' : ''} tomorrow:\n\n`;

      jobs.forEach((job, idx) => {
        const timeWindow = job['Time Window'] || 'TBD';
        const customerName = job['Customer Name'];
        const address = job['Address'];
        const city = job['City'];
        const zip = job['Zip Code'];
        const service = job['Service Requested'];
        const phone = job['Phone Number'];
        const gateCode = job['Gate Code'];
        const leadSource = job['Lead Source'];
        const referralSource = job['Referral Source'] || job['Lead Provider'];

        sms += `${idx + 1}. ${timeWindow}\n`;
        sms += `${customerName}\n`;
        sms += `${address}, ${city}\n`;
        sms += `${service} | ${phone}\n`;
        sms += getRepresentingText(leadSource, referralSource) + '\n';
        if (gateCode) {
          sms += `Gate: ${gateCode}\n`;
        }
        sms += `📍 ${getGoogleMapsLink(address, city, zip)}\n\n`;
      });

      // Add portal link
      const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app';
      sms += `View full details: ${portalUrl}/tech`;

      try {
        await client.messages.create({
          body: sms,
          messagingServiceSid: messagingServiceSid,
          to: formatPhoneForTwilio(techPhone),
        });
        results.push({ tech: techName, success: true, message: `Sent ${jobs.length} jobs` });
      } catch (err: any) {
        results.push({ tech: techName, success: false, error: err.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Tech reminder error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
