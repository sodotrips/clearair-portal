import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID } from '@/lib/google-sheets';

const CALL_LOG_SHEET = 'CALL LOG';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CALL_LOG_SHEET}!A:M`,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ callLogs: [] });
    }

    const headers = rows[0];
    const callLogs = rows.slice(1).map((row, index) => {
      const callLog: Record<string, string> = { rowIndex: String(index + 2) };
      headers.forEach((header: string, i: number) => {
        callLog[header] = row[i] || '';
      });
      return callLog;
    });

    // Filter to show only pending calls (not yet promoted or dismissed)
    // Status column M will be used for PROMOTED/DISMISSED status
    const pendingCalls = callLogs.filter(log => {
      const status = log['Status'] || '';
      const promoted = log['Promoted?'] || '';
      // Show if not already promoted and not dismissed
      return promoted !== 'YES' && status !== 'DISMISSED';
    });

    // Sort by timestamp (newest first)
    pendingCalls.sort((a, b) => {
      return (b['Timestamp'] || '').localeCompare(a['Timestamp'] || '');
    });

    return NextResponse.json({ callLogs: pendingCalls });
  } catch (error: any) {
    console.error('Call logs fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
