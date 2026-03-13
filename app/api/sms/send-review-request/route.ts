import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, DATA_RANGE } from '@/lib/google-sheets';
import {
  client,
  twilioPhone,
  messagingServiceSid,
  formatPhoneForTwilio,
  shouldSendSMS,
  getSenderParams,
} from '@/lib/twilio';

// Google Review URL - set in .env or defaults to Maps listing
const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL || 'https://maps.app.goo.gl/789sWPkaX7MxnP1e6?g_st=ic';

// CL = "Review Requested?" (col 90), CM = "Review Request Date" (col 91), CN = "Review Left?" (col 92)
const REVIEW_REQUESTED_COL = 'CL';
const REVIEW_REQUEST_DATE_COL = 'CM';

export async function POST(request: NextRequest) {
  try {
    if (!client || (!twilioPhone && !messagingServiceSid)) {
      return NextResponse.json({
        success: false,
        error: 'Twilio not configured.'
      }, { status: 500 });
    }

    const body = await request.json();
    const { leadId } = body;

    if (!leadId) {
      return NextResponse.json({
        success: false,
        error: 'leadId is required'
      }, { status: 400 });
    }

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

    const lead = leads.find(l => l['Lead ID'] === leadId);
    if (!lead) {
      return NextResponse.json({
        success: false,
        error: `Lead ${leadId} not found`
      }, { status: 404 });
    }

    const phone = lead['Phone Number'];
    if (!phone) {
      return NextResponse.json({
        success: false,
        error: 'Lead has no phone number'
      }, { status: 400 });
    }

    const smsCheck = shouldSendSMS(phone);
    if (!smsCheck.allowed) {
      return NextResponse.json({
        success: false,
        error: `Cannot send SMS: ${smsCheck.reason}`
      }, { status: 400 });
    }

    // Determine company name based on lead source
    const leadSource = (lead['Lead Source'] || '').toLowerCase();
    const referralSource = lead['Referral Source'] || '';
    let companyName = 'ClearAir Solutions';
    if ((leadSource === 'lead company' || leadSource.includes('lead gen')) && referralSource) {
      companyName = referralSource;
    } else if (leadSource === 'partner' && referralSource) {
      companyName = referralSource;
    }

    const customerName = lead['Customer Name']?.split(' ')[0] || 'there';

    // Build review request message
    let sms = `Hi ${customerName}! Thank you for choosing ${companyName}. We truly appreciate your business!\n\n`;
    sms += `If you had a great experience, we'd love for you to leave us a quick review on Google. It really helps us out!\n\n`;
    sms += `${GOOGLE_REVIEW_URL}\n\n`;
    sms += `Thank you so much!`;

    await client.messages.create({
      body: sms,
      ...getSenderParams(),
      to: formatPhoneForTwilio(phone),
    });

    // Mark CL as "YES" and CM with timestamp
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!${REVIEW_REQUESTED_COL}${lead.rowIndex}:${REVIEW_REQUEST_DATE_COL}${lead.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['YES', timestamp]],
      },
    });

    return NextResponse.json({
      success: true,
      leadId,
      customer: lead['Customer Name'],
      message: 'Review request sent',
      smsContent: sms,
    });

  } catch (error: any) {
    console.error('Review request error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
