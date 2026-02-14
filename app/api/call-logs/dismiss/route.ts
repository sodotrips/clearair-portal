import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID } from '@/lib/google-sheets';

const CALL_LOG_SHEET = 'CALL LOG';

export async function POST(request: NextRequest) {
  try {
    const { callLogId, rowIndex } = await request.json();

    if (!callLogId || !rowIndex) {
      return NextResponse.json({ error: 'callLogId and rowIndex are required' }, { status: 400 });
    }

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Add a Status column (M) to mark as DISMISSED
    // First check if column M exists, if not we'll update column G to include dismissed status
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CALL_LOG_SHEET}!M${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['DISMISSED']],
      },
    });

    return NextResponse.json({
      success: true,
      message: `Call ${callLogId} dismissed`,
    });
  } catch (error: any) {
    console.error('Dismiss call log error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
