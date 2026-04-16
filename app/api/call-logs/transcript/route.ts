import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID } from '@/lib/google-sheets';

const CALL_LOG_SHEET = 'CALL LOG';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const callLogId = searchParams.get('id');

    if (!callLogId) {
      return NextResponse.json({ error: 'Call Log ID is required' }, { status: 400 });
    }

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all call logs
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CALL_LOG_SHEET}!A:N`,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ error: 'Call log not found' }, { status: 404 });
    }

    // Find the call log by ID (column A)
    const headers = rows[0];
    const callLogRow = rows.slice(1).find(row => row[0] === callLogId);

    if (!callLogRow) {
      return NextResponse.json({ error: 'Call log not found' }, { status: 404 });
    }

    // Build response object
    const callLog: Record<string, string> = {};
    headers.forEach((header: string, i: number) => {
      callLog[header] = callLogRow[i] || '';
    });

    return NextResponse.json({
      success: true,
      callLog: {
        id: callLog['Call Log ID'],
        timestamp: callLog['Timestamp'],
        callerPhone: callLog['Caller Phone'],
        customerName: callLog['Customer Name'],
        service: callLog['Service Inquiry'],
        outcome: callLog['Outcome'],
        duration: callLog['Duration'],
        appointmentDate: callLog['Appt Date'],
        timeWindow: callLog['Time Window'],
        transcript: callLog['Full Transcript'],
        recordingUrl: callLog['Recording URL'] || '',
      }
    });
  } catch (error: any) {
    console.error('Fetch transcript error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
