import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import path from 'path';

const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';
const SHEET_NAME = 'ACTIVE LEADS';

async function getAuthClient() {
  const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

// Column mapping for updates
const COLUMN_MAP: Record<string, number> = {
  'Lead ID': 0,           // A
  'Status': 1,            // B
  'Priority Level': 2,    // C
  'Customer Name': 4,     // E
  'Phone Number': 5,      // F
  'Email': 6,             // G
  'Address': 7,           // H
  'City': 8,              // I
  'Zip Code': 9,          // J
  'Property Type': 10,    // K
  'Lead Source': 11,      // L
  'Referral Source': 12,  // M
  'Service Requested': 16, // Q
  '# of Units': 17,       // R
  '# of Vents': 18,       // S
  'Customer Issue/Notes': 19, // T
  'Assigned To': 35,      // AJ
  'Appointment Date': 43, // AR
  'Time Window': 45,      // AT
  'Access Instructions': 50, // AY
  'Gate Code': 51,        // AZ
  'Parking Info': 52,     // BA
  'Pets': 53,             // BB
  'Amount Paid': 77,      // BZ
  'Total Cost': 85,       // CH
  'Profit $': 86,         // CI
  'Follow-up Date': 100,  // CW
  'Last Modified': 117,   // DN
  'Last Modified By': 118, // DO
  'Sophia Commission %': 119,  // DP
  'Amit Commission %': 121,    // DR
  'Lead Company Commission %': 123, // DT
};

// Convert column index to letter (e.g., 0 -> A, 26 -> AA, 100 -> CW)
function columnIndexToLetter(index: number): string {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

export async function POST(request: Request) {
  try {
    const { rowIndex, updates } = await request.json();

    if (!rowIndex || !updates || typeof updates !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Missing rowIndex or updates' },
        { status: 400 }
      );
    }

    // Get current user from session
    const session = await getServerSession(authOptions);
    const userName = session?.user?.name || 'System';

    // Get current timestamp in Houston timezone
    const now = new Date();
    const houstonTime = now.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Auto-add Last Modified timestamp and user
    const updatesWithTimestamp = {
      ...updates,
      'Last Modified': houstonTime,
      'Last Modified By': userName,
    };

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Build batch update requests
    const updateRequests = [];

    for (const [field, value] of Object.entries(updatesWithTimestamp)) {
      const colIndex = COLUMN_MAP[field];
      if (colIndex === undefined) {
        console.warn(`Unknown field: ${field}`);
        continue;
      }

      const colLetter = columnIndexToLetter(colIndex);
      const range = `${SHEET_NAME}!${colLetter}${rowIndex}`;

      updateRequests.push({
        range,
        values: [[value]],
      });
    }

    if (updateRequests.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Batch update all fields
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updateRequests,
      },
    });

    return NextResponse.json({ success: true, updatedFields: Object.keys(updates) });
  } catch (error) {
    console.error('Error updating lead:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
