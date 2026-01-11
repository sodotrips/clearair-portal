import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import path from 'path';

const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';
const SHEET_NAME = 'ACTIVE LEADS';

async function getAuthClient() {
  const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return auth;
}

export async function GET() {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:DU`,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ leads: [], message: 'No data found' });
    }

    // First row is headers
    const headers = rows[0];
    const leads = rows.slice(1).map((row, index) => {
      const lead: Record<string, string> = {};
      headers.forEach((header: string, i: number) => {
        lead[header] = row[i] || '';
      });
      lead.rowIndex = String(index + 2); // +2 because row 1 is header, and sheets are 1-indexed
      return lead;
    });

    return NextResponse.json({ leads });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leads', details: String(error) },
      { status: 500 }
    );
  }
}
