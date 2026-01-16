import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import {
  client,
  twilioPhone,
  messagingServiceSid,
  formatPhoneForTwilio,
  getHoustonDateTime,
} from '@/lib/twilio';

const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';
const SHEET_NAME = 'ACTIVE LEADS';
const SETTINGS_SHEET = 'SETTINGS';

// Default phone for daily summary
const DEFAULT_SUMMARY_PHONE = '281-904-4674';

interface Lead {
  [key: string]: string;
}

interface DailySummary {
  todayDate: string;
  closedJobsToday: number;
  revenueCollectedToday: number;
  pendingPaymentJobs: number;
  pendingPaymentAmount: number;
  scheduledTomorrow: number;
  unconfirmedTomorrow: number;
  weeklyRevenue: number;
  hasData: boolean;
}

async function getAuthClient() {
  if (process.env.GOOGLE_CREDENTIALS) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
  } else {
    const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
  }
}

async function getSettings(sheets: any): Promise<Record<string, string>> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SETTINGS_SHEET}!A:B`,
    });

    const rows = response.data.values || [];
    const settings: Record<string, string> = {};
    rows.forEach((row: string[]) => {
      if (row[0]) {
        settings[row[0]] = row[1] || '';
      }
    });
    return settings;
  } catch (e) {
    return {};
  }
}

function getHoustonDateString(date: Date = new Date()): string {
  const houston = new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const year = houston.getFullYear();
  const month = String(houston.getMonth() + 1).padStart(2, '0');
  const day = String(houston.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTomorrowDateString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getHoustonDateString(tomorrow);
}

function getWeekStartDate(): Date {
  const now = getHoustonDateTime();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek; // Sunday start
  return new Date(now.setDate(diff));
}

function isDateMatch(apptDate: string, targetDate: string): boolean {
  if (!apptDate) return false;

  const [targetYear, targetMonth, targetDay] = targetDate.split('-');
  const targetFormatted = `${targetMonth}/${targetDay}/${targetYear}`;

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(apptDate)) {
    const [month, day, year] = apptDate.split('/');
    const apptFormatted = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
    return apptFormatted === targetFormatted;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
    return apptDate === targetDate;
  }

  return false;
}

function isDateInCurrentWeek(apptDate: string): boolean {
  if (!apptDate) return false;

  const weekStart = getWeekStartDate();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  let apptDateObj: Date;

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(apptDate)) {
    const [month, day, year] = apptDate.split('/').map(Number);
    apptDateObj = new Date(year, month - 1, day);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
    const [year, month, day] = apptDate.split('-').map(Number);
    apptDateObj = new Date(year, month - 1, day);
  } else {
    return false;
  }

  return apptDateObj >= weekStart && apptDateObj <= weekEnd;
}

function calculateSummary(leads: Lead[]): DailySummary {
  const today = getHoustonDateString();
  const tomorrow = getTomorrowDateString();

  let closedJobsToday = 0;
  let revenueCollectedToday = 0;
  let pendingPaymentJobs = 0;
  let pendingPaymentAmount = 0;
  let scheduledTomorrow = 0;
  let unconfirmedTomorrow = 0;
  let weeklyRevenue = 0;

  for (const lead of leads) {
    const status = (lead['Status'] || '').toUpperCase();
    const apptDate = lead['Appointment Date'] || '';
    const amountPaid = parseFloat(lead['Amount Paid']) || 0;
    const totalCost = parseFloat(lead['Total Cost']) || 0;
    const confirmed = (lead['AU'] || '').toUpperCase();

    // Completed today
    if (status === 'CLOSED' && isDateMatch(apptDate, today)) {
      closedJobsToday++;
      revenueCollectedToday += amountPaid;
    }

    // Pending payment (closed but not fully paid)
    if (status === 'CLOSED' && totalCost > 0 && amountPaid < totalCost) {
      pendingPaymentJobs++;
      pendingPaymentAmount += (totalCost - amountPaid);
    }

    // Scheduled tomorrow
    if ((status === 'SCHEDULED' || status === 'IN PROGRESS') && isDateMatch(apptDate, tomorrow)) {
      scheduledTomorrow++;
      if (confirmed !== 'YES') {
        unconfirmedTomorrow++;
      }
    }

    // Weekly revenue (all closed this week)
    if (status === 'CLOSED' && isDateInCurrentWeek(apptDate) && amountPaid > 0) {
      weeklyRevenue += amountPaid;
    }
  }

  const hasData = closedJobsToday > 0;

  return {
    todayDate: today,
    closedJobsToday,
    revenueCollectedToday,
    pendingPaymentJobs,
    pendingPaymentAmount,
    scheduledTomorrow,
    unconfirmedTomorrow,
    weeklyRevenue,
    hasData,
  };
}

function formatSummaryMessage(summary: DailySummary): string {
  const houston = getHoustonDateTime();
  const dateStr = houston.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const tomorrow = new Date(houston);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

  let message = `📊 ClearAir Daily Summary\n`;
  message += `━━━━━━━━━━━━━━━━━━━\n`;
  message += `Today (${dateStr}):\n`;
  message += `✅ Closed: ${summary.closedJobsToday} jobs\n`;
  message += `💰 Collected: ${formatCurrency(summary.revenueCollectedToday)}\n`;

  if (summary.pendingPaymentJobs > 0) {
    message += `⏳ Pending: ${summary.pendingPaymentJobs} (${formatCurrency(summary.pendingPaymentAmount)})\n`;
  }

  message += `\n`;
  message += `Tomorrow (${tomorrowStr}):\n`;
  message += `📅 Scheduled: ${summary.scheduledTomorrow} jobs\n`;

  if (summary.unconfirmedTomorrow > 0) {
    message += `⚠️ Unconfirmed: ${summary.unconfirmedTomorrow}\n`;
  } else if (summary.scheduledTomorrow > 0) {
    message += `✅ All confirmed\n`;
  }

  message += `\n`;
  message += `Weekly Total: ${formatCurrency(summary.weeklyRevenue)}\n`;
  message += `━━━━━━━━━━━━━━━━━━━`;

  return message;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const isTest = body.test === true;

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get settings
    const settings = await getSettings(sheets);
    const isEnabled = settings['daily_summary_enabled'] === 'true';
    const phoneNumber = settings['daily_summary_phone'] || DEFAULT_SUMMARY_PHONE;

    // Check if agent is enabled (skip check for test runs)
    if (!isTest && !isEnabled) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: 'Daily Summary Agent is disabled',
      });
    }

    // Fetch all leads
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:DU`,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: 'No leads data found',
      });
    }

    const headers = rows[0];
    const leads: Lead[] = rows.slice(1).map((row) => {
      const lead: Lead = {};
      headers.forEach((header: string, i: number) => {
        lead[header] = row[i] || '';
      });
      return lead;
    });

    // Calculate summary
    const summary = calculateSummary(leads);

    // If no closed jobs today and not a test, skip sending
    if (!summary.hasData && !isTest) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'No closed jobs today - SMS not sent',
        summary,
      });
    }

    // Format message
    const message = formatSummaryMessage(summary);

    // Send SMS
    if (!client || !twilioPhone) {
      return NextResponse.json({
        success: false,
        error: 'Twilio not configured',
        summary,
        message,
      });
    }

    const formattedPhone = formatPhoneForTwilio(phoneNumber);

    const smsResult = await client.messages.create({
      body: message,
      from: messagingServiceSid || twilioPhone,
      to: formattedPhone,
    });

    console.log('=== DAILY SUMMARY SENT ===');
    console.log('To:', formattedPhone);
    console.log('Message SID:', smsResult.sid);
    console.log('Summary:', summary);
    console.log('==========================');

    return NextResponse.json({
      success: true,
      messageSid: smsResult.sid,
      sentTo: formattedPhone,
      summary,
      message,
      isTest,
    });

  } catch (error) {
    console.error('Daily Summary Agent error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint for cron job
export async function GET(request: NextRequest) {
  // Convert to POST internally
  const postRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
  });
  return POST(postRequest);
}
