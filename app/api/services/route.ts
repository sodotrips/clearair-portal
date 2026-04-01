import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID } from '@/lib/google-sheets';

const SERVICES_SHEET = 'SERVICES';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SERVICES_SHEET}!A:E`,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ services: [] });
    }

    // Skip header row, map to objects
    const services = rows.slice(1)
      .filter(row => row[2]) // must have a service name
      .map(row => ({
        code: row[0] || '',
        category: row[1] || '',
        name: row[2] || '',
        description: row[3] || '',
        taxable: (row[4] || '').toUpperCase() === 'YES',
      }));

    return NextResponse.json({ services });
  } catch (error: any) {
    console.error('Services fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
