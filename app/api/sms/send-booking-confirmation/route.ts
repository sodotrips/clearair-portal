import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, DATA_RANGE } from '@/lib/google-sheets';
import { logSmsAttempt } from '@/app/lib/sms-log';

// Column W = "Booking Confirm Sent"
const BOOKING_CONFIRM_COL = 'W';
import {
  client,
  twilioPhone,
  messagingServiceSid,
  formatPhoneForTwilio,
  formatDateForSMS,
  shouldSendSMS,
  getSenderParams,
} from '@/lib/twilio';

// Send booking confirmation to a customer after scheduling their appointment
export async function POST(request: NextRequest) {
  const device = request.headers.get('user-agent') || '';
  let leadIdForLog = '';
  let customerForLog = '';
  let phoneForLog = '';
  try {
    // Check for Twilio configuration
    if (!client || (!twilioPhone && !messagingServiceSid)) {
      await logSmsAttempt({
        api: 'booking-confirmation', leadId: '', customer: '', phone: '',
        status: 'error', error: 'Twilio not configured', device,
      });
      return NextResponse.json({
        success: false,
        error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID.'
      }, { status: 500 });
    }

    const body = await request.json();
    const { leadId } = body;
    leadIdForLog = leadId || '';

    if (!leadId) {
      return NextResponse.json({
        success: false,
        error: 'leadId is required'
      }, { status: 400 });
    }

    // Get lead data from Google Sheets
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

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

    // Find the lead
    const lead = leads.find(l => l['Lead ID'] === leadId);
    if (!lead) {
      await logSmsAttempt({ api: 'booking-confirmation', leadId: leadIdForLog, customer: '', phone: '', status: 'error', error: `Lead ${leadId} not found`, device });
      return NextResponse.json({
        success: false,
        error: `Lead ${leadId} not found`
      }, { status: 404 });
    }
    customerForLog = lead['Customer Name'] || '';

    // Validate lead has required info
    const phone = lead['Phone Number'];
    const appointmentDate = lead['Appointment Date'];
    const timeWindow = lead['Time Window'];
    phoneForLog = phone || '';

    if (!phone) {
      await logSmsAttempt({ api: 'booking-confirmation', leadId: leadIdForLog, customer: customerForLog, phone: '', status: 'error', error: 'Lead has no phone number', device });
      return NextResponse.json({
        success: false,
        error: 'Lead has no phone number'
      }, { status: 400 });
    }

    if (!appointmentDate || !timeWindow) {
      await logSmsAttempt({ api: 'booking-confirmation', leadId: leadIdForLog, customer: customerForLog, phone: phoneForLog, status: 'error', error: 'Lead has no appointment date or time window scheduled', device });
      return NextResponse.json({
        success: false,
        error: 'Lead has no appointment date or time window scheduled'
      }, { status: 400 });
    }

    // Check if phone is valid for SMS
    const smsCheck = shouldSendSMS(phone);
    if (!smsCheck.allowed) {
      await logSmsAttempt({ api: 'booking-confirmation', leadId: leadIdForLog, customer: customerForLog, phone: phoneForLog, status: 'error', error: `Cannot send SMS: ${smsCheck.reason}`, device });
      return NextResponse.json({
        success: false,
        error: `Cannot send SMS: ${smsCheck.reason}`
      }, { status: 400 });
    }

    // Build confirmation message
    const customerName = lead['Customer Name']?.split(' ')[0] || 'there';
    const service = lead['Service Requested'] || 'service';
    const formattedDate = formatDateForSMS(appointmentDate);
    const address = lead['Address'] || '';
    const city = lead['City'] || '';
    const leadSource = lead['Lead Source']?.toLowerCase() || '';
    const referralSource = lead['Referral Source'] || '';

    // Determine company name based on lead source
    let companyName = 'ClearAir Solutions';
    if ((leadSource === 'lead company' || leadSource.includes('lead gen')) && referralSource) {
      companyName = referralSource;
    } else if (leadSource === 'partner' && referralSource) {
      companyName = referralSource;
    }

    const businessPhone = process.env.BUSINESS_PHONE || '(281) 904-4674';

    let sms = `Hi ${customerName}! Thanks for scheduling with ${companyName}.\n\n`;
    sms += `Your ${service} appointment:\n`;
    sms += `📅 ${formattedDate}\n`;
    sms += `⏰ ${timeWindow}\n`;
    if (address) {
      sms += `📍 ${address}${city ? ', ' + city : ''}\n`;
    }
    sms += `\nOur technician will call you 30-40 minutes before arrival.\n\n`;
    sms += `Questions? Call/Text ${businessPhone}`;

    // Send SMS
    const twilioMessage = await client.messages.create({
      body: sms,
      ...getSenderParams(),
      to: formatPhoneForTwilio(phone),
    });

    // Mark column W as sent with timestamp
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!${BOOKING_CONFIRM_COL}${lead.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[timestamp]],
      },
    });

    await logSmsAttempt({
      api: 'booking-confirmation', leadId: leadIdForLog, customer: customerForLog, phone: phoneForLog,
      status: 'success', twilioSid: twilioMessage.sid, device,
    });

    return NextResponse.json({
      success: true,
      leadId,
      customer: lead['Customer Name'],
      message: 'Booking confirmation sent',
      smsContent: sms,
    });

  } catch (error: any) {
    console.error('Booking confirmation error:', error);
    await logSmsAttempt({
      api: 'booking-confirmation', leadId: leadIdForLog, customer: customerForLog, phone: phoneForLog,
      status: 'error', error: error.message || String(error), device,
    });
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
