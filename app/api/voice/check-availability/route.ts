import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME } from '@/lib/google-sheets';

const MAX_BOOKINGS_PER_SLOT = 2;

// Column indices (0-based)
const COLUMNS = {
  STATUS: 1,           // B - Status
  APPOINTMENT_DATE: 43, // AR - Appointment Date
  TIME_WINDOW: 45,     // AT - Time Window
};

// Valid time windows (matching Google Sheet format)
const TIME_WINDOWS = [
  '08:00AM - 11:00AM',
  '11:00AM - 2:00PM',
  '2:00PM - 5:00PM',
  'Flexible',
];

export async function POST(request: NextRequest) {
  try {
    const { date, timeWindow } = await request.json();

    if (!date) {
      return NextResponse.json({
        error: 'Date is required',
        available: false
      }, { status: 400 });
    }

    // Normalize the date format (accept various formats)
    const normalizedDate = normalizeDate(date);
    if (!normalizedDate) {
      return NextResponse.json({
        error: 'Invalid date format',
        available: false
      }, { status: 400 });
    }

    // Fetch all leads from Google Sheets
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:AZ`, // Covers through column AT (Time Window)
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) {
      // Only header or empty - slot is available
      return NextResponse.json({
        available: true,
        currentBookings: 0,
        maxBookings: MAX_BOOKINGS_PER_SLOT,
        date: normalizedDate,
        timeWindow: timeWindow || 'Any',
      });
    }

    // Skip header row, count bookings for the requested date/time
    const dataRows = rows.slice(1);
    let bookingCount = 0;

    for (const row of dataRows) {
      const status = (row[COLUMNS.STATUS] || '').toUpperCase();
      const apptDate = row[COLUMNS.APPOINTMENT_DATE] || '';
      const apptTime = row[COLUMNS.TIME_WINDOW] || '';

      // Skip cancelled/closed leads
      if (status === 'CANCELLED' || status === 'NO SHOW') {
        continue;
      }

      // Check if date matches
      const rowNormalizedDate = normalizeDate(apptDate);
      if (rowNormalizedDate !== normalizedDate) {
        continue;
      }

      // Check if time window matches (if specified)
      if (timeWindow && timeWindow !== 'Flexible' && timeWindow !== 'Any') {
        // Normalize time window comparison
        const normalizedRequestedTime = normalizeTimeWindow(timeWindow);
        const normalizedRowTime = normalizeTimeWindow(apptTime);

        if (normalizedRowTime !== normalizedRequestedTime) {
          continue;
        }
      }

      bookingCount++;
    }

    const isAvailable = bookingCount < MAX_BOOKINGS_PER_SLOT;

    // If not available, find alternative slots
    let alternatives: string[] = [];
    if (!isAvailable && timeWindow) {
      alternatives = await findAlternativeSlots(dataRows, normalizedDate, timeWindow);
    }

    return NextResponse.json({
      available: isAvailable,
      currentBookings: bookingCount,
      maxBookings: MAX_BOOKINGS_PER_SLOT,
      date: normalizedDate,
      timeWindow: timeWindow || 'Any',
      alternatives: alternatives.length > 0 ? alternatives : undefined,
      message: isAvailable
        ? `Slot available (${bookingCount}/${MAX_BOOKINGS_PER_SLOT} booked)`
        : `Slot full (${bookingCount}/${MAX_BOOKINGS_PER_SLOT} booked)`,
    });

  } catch (error) {
    console.error('Check availability error:', error);
    return NextResponse.json({
      error: String(error),
      available: true, // Default to available on error to not block bookings
    }, { status: 500 });
  }
}

// Normalize date to MM/DD/YYYY format
function normalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;

  let date: Date | null = null;

  // Try various formats
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // YYYY-MM-DD
    const [year, month, day] = dateStr.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    // M/D/YYYY or MM/DD/YYYY
    const [month, day, year] = dateStr.split('/').map(Number);
    date = new Date(year, month - 1, day);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(dateStr)) {
    // M/D/YY or MM/DD/YY
    const [month, day, year] = dateStr.split('/').map(Number);
    const fullYear = year < 50 ? 2000 + year : 1900 + year;
    date = new Date(fullYear, month - 1, day);
  } else {
    // Try natural language like "tomorrow", "next Monday"
    date = parseNaturalDate(dateStr);
  }

  if (!date) return null;

  // Return in MM/DD/YYYY format
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();

  return `${month}/${day}/${year}`;
}

// Parse natural language dates
function parseNaturalDate(str: string): Date | null {
  const lower = str.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lower === 'today') {
    return today;
  }
  if (lower === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower.includes('next')) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        const d = new Date(today);
        const currentDay = d.getDay();
        const daysUntil = (i - currentDay + 7) % 7 || 7;
        d.setDate(d.getDate() + daysUntil);
        return d;
      }
    }
  }

  // Try standard date parsing as fallback
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Normalize time window for comparison
function normalizeTimeWindow(timeWindow: string): string {
  const lower = (timeWindow || '').toLowerCase().replace(/\s/g, '');

  // 08:00AM - 11:00AM (Morning)
  if (lower.includes('8am-11am') || lower.includes('8-11') || lower.includes('8am') ||
      lower.includes('08:00') || (lower.includes('morning') && !lower.includes('11'))) {
    return '08:00AM - 11:00AM';
  }
  // 11:00AM - 2:00PM (Midday)
  if (lower.includes('11am-2pm') || lower.includes('11-2') || lower.includes('11am') ||
      lower.includes('11:00') || lower.includes('midday') || lower.includes('noon')) {
    return '11:00AM - 2:00PM';
  }
  // 2:00PM - 5:00PM (Afternoon)
  if (lower.includes('2pm-5pm') || lower.includes('2-5') || lower.includes('2pm') ||
      lower.includes('2:00') || lower.includes('afternoon')) {
    return '2:00PM - 5:00PM';
  }

  return 'flexible';
}

// Find alternative available slots
async function findAlternativeSlots(
  dataRows: string[][],
  requestedDate: string,
  requestedTimeWindow: string
): Promise<string[]> {
  const alternatives: string[] = [];
  const timeWindows = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];

  // Check other time windows on same day
  for (const tw of timeWindows) {
    if (normalizeTimeWindow(tw) === normalizeTimeWindow(requestedTimeWindow)) {
      continue; // Skip the requested time window
    }

    let count = 0;
    for (const row of dataRows) {
      const status = (row[COLUMNS.STATUS] || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'NO SHOW') continue;

      const rowDate = normalizeDate(row[COLUMNS.APPOINTMENT_DATE] || '');
      const rowTime = row[COLUMNS.TIME_WINDOW] || '';

      if (rowDate === requestedDate && normalizeTimeWindow(rowTime) === normalizeTimeWindow(tw)) {
        count++;
      }
    }

    if (count < MAX_BOOKINGS_PER_SLOT) {
      alternatives.push(`${tw} on same day`);
    }
  }

  // Check next day
  const nextDay = getNextDay(requestedDate);
  if (nextDay) {
    for (const tw of timeWindows) {
      let count = 0;
      for (const row of dataRows) {
        const status = (row[COLUMNS.STATUS] || '').toUpperCase();
        if (status === 'CANCELLED' || status === 'NO SHOW') continue;

        const rowDate = normalizeDate(row[COLUMNS.APPOINTMENT_DATE] || '');
        const rowTime = row[COLUMNS.TIME_WINDOW] || '';

        if (rowDate === nextDay && normalizeTimeWindow(rowTime) === normalizeTimeWindow(tw)) {
          count++;
        }
      }

      if (count < MAX_BOOKINGS_PER_SLOT) {
        alternatives.push(`${tw} next day`);
        break; // Just need one alternative from next day
      }
    }
  }

  return alternatives.slice(0, 2); // Return max 2 alternatives
}

// Get next day in MM/DD/YYYY format
function getNextDay(dateStr: string): string | null {
  const [month, day, year] = dateStr.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);

  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  const nextYear = date.getFullYear();

  return `${nextMonth}/${nextDay}/${nextYear}`;
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'Availability check ready',
    maxBookingsPerSlot: MAX_BOOKINGS_PER_SLOT,
    timeWindows: TIME_WINDOWS,
  });
}
