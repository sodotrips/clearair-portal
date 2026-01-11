import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';

const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';
const SHEET_NAME = 'ACTIVE LEADS';

// Convert column index to letter (0=A, 25=Z, 26=AA, etc.)
function colIndexToLetter(index: number): string {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

// Get current time in Houston timezone
function getHoustonTime(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, action } = body; // action: 'checkin' or 'checkout'

    if (!leadId || !action) {
      return NextResponse.json({ success: false, error: 'Missing leadId or action' }, { status: 400 });
    }

    if (action !== 'checkin' && action !== 'checkout') {
      return NextResponse.json({ success: false, error: 'Action must be "checkin" or "checkout"' }, { status: 400 });
    }

    // Google Sheets setup
    const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get all leads to find headers and row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:DZ`,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: 'No data found' });
    }

    const headers = rows[0];
    const leadIdColIndex = headers.indexOf('Lead ID');
    const checkInColIndex = headers.indexOf('Check In');
    const checkOutColIndex = headers.indexOf('Check Out');

    if (leadIdColIndex === -1) {
      return NextResponse.json({ success: false, error: 'Lead ID column not found' }, { status: 500 });
    }

    const targetColIndex = action === 'checkin' ? checkInColIndex : checkOutColIndex;
    const colName = action === 'checkin' ? 'Check In' : 'Check Out';

    if (targetColIndex === -1) {
      return NextResponse.json({
        success: false,
        error: `Please add "${colName}" column to your Google Sheet first.`
      }, { status: 400 });
    }

    // Find the row with matching Lead ID
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][leadIdColIndex] === leadId) {
        rowIndex = i + 1; // 1-indexed for sheets
        break;
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    // Update the check-in or check-out time
    const colLetter = colIndexToLetter(targetColIndex);
    const timestamp = getHoustonTime();

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!${colLetter}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[timestamp]],
      },
    });

    // If checking in, also update status to "IN PROGRESS"
    if (action === 'checkin') {
      const statusColIndex = headers.indexOf('Status');
      if (statusColIndex !== -1) {
        const statusColLetter = colIndexToLetter(statusColIndex);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${statusColLetter}${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['IN PROGRESS']],
          },
        });
      }
    }

    // If checking out, update status to "COMPLETED"
    if (action === 'checkout') {
      const statusColIndex = headers.indexOf('Status');
      if (statusColIndex !== -1) {
        const statusColLetter = colIndexToLetter(statusColIndex);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${statusColLetter}${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['COMPLETED']],
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      action,
      timestamp,
      message: action === 'checkin' ? 'Checked in successfully' : 'Checked out successfully'
    });

  } catch (error: any) {
    console.error('Check-in/out error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
