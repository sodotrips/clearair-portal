import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, columnIndexToLetter } from '@/lib/google-sheets';

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
  'Lead Source Detail': 12,  // M
  'Referral Source': 13,  // N (auto-filled when Lead Source is Lead Company)
  'Service Requested': 16, // Q
  '# of Units': 17,       // R
  '# of Vents': 18,       // S
  'Customer Issue/Notes': 19, // T
  'Assigned To': 35,      // AJ
  'Quote Amount': 41,     // AP
  'Quote Valid Until': 42, // AQ
  'Appointment Date': 43, // AR
  'Time Window': 45,      // AT
  'Access Instructions': 50, // AY
  'Gate Code': 51,        // AZ
  'Parking Info': 52,     // BA
  'Pets': 53,             // BB
  'Issues Found': 61,     // BJ
  'Tech Notes': 70,       // BS
  'Payment Method': 75,   // BX
  'Amount Paid': 77,      // BZ
  'Balance Due': 78,      // CA
  'Payment Date': 79,     // CB
  'Labor Cost': 82,       // CE
  'Material Cost': 83,    // CF
  'Subcontractor Cost': 84, // CG
  'Total Cost': 85,       // CH
  'Profit $': 86,         // CI
  'Profit %': 87,         // CJ
  'Follow-up Date': 100,  // CW
  'Last Modified': 117,   // DN
  'Last Modified By': 118, // DO
  'Sophia Commission %': 119,  // DP
  'Sophia Commission $': 120,  // DQ
  'Amit Commission %': 121,    // DR
  'Amit Commission $': 122,    // DS
  'Lead Company Commission %': 123, // DT
  'Lead Company Commission $': 124, // DU
};

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
    const updatesWithTimestamp: Record<string, any> = {
      ...updates,
      'Last Modified': houstonTime,
      'Last Modified By': userName,
    };

    // Rule: If Lead Source is "Lead Company", copy Lead Source Detail (M) to Referral Source (N)
    if (updates['Lead Source'] === 'Lead Company' && updates['Lead Source Detail']) {
      updatesWithTimestamp['Referral Source'] = updates['Lead Source Detail'];
    }

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Check if any fields need dynamic header lookup (not in static COLUMN_MAP)
    const fieldsToUpdate = Object.keys(updatesWithTimestamp);
    const unmappedFields = fieldsToUpdate.filter(f => COLUMN_MAP[f] === undefined);

    let dynamicColumnMap: Record<string, number> = {};
    if (unmappedFields.length > 0) {
      // Fetch headers from the sheet to resolve unknown columns
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!1:1`,
      });
      const headers = headerResponse.data.values?.[0] || [];
      for (const field of unmappedFields) {
        const idx = headers.indexOf(field);
        if (idx !== -1) {
          dynamicColumnMap[field] = idx;
        } else {
          console.warn(`Unknown field not found in headers: ${field}`);
        }
      }
    }

    // Build batch update requests
    const updateRequests = [];

    for (const [field, value] of Object.entries(updatesWithTimestamp)) {
      const colIndex = COLUMN_MAP[field] ?? dynamicColumnMap[field];
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
