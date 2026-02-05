import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { getAuthClient, SPREADSHEET_ID, columnIndexToLetter } from '@/lib/google-sheets';

const WEBSITE_LEADS_SHEET = 'Website Leads';

export async function GET() {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${WEBSITE_LEADS_SHEET}!A:Z`,
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
      lead.rowIndex = String(index + 2);
      return lead;
    });

    return NextResponse.json({ leads });
  } catch (error) {
    console.error('Error fetching website leads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch website leads', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { rowIndex, status } = await request.json();

    if (!rowIndex || !status) {
      return NextResponse.json(
        { success: false, error: 'Missing rowIndex or status' },
        { status: 400 }
      );
    }

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the "Status" column index from headers
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${WEBSITE_LEADS_SHEET}!1:1`,
    });

    const headers = headerResponse.data.values?.[0] || [];
    let statusColIndex = headers.findIndex((h: string) => h.toLowerCase() === 'status');

    // If no Status column exists, add it as the next column
    if (statusColIndex === -1) {
      statusColIndex = headers.length;
      const colLetter = columnIndexToLetter(statusColIndex);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${WEBSITE_LEADS_SHEET}!${colLetter}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Status']] },
      });
    }

    // Update the status cell
    const colLetter = columnIndexToLetter(statusColIndex);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${WEBSITE_LEADS_SHEET}!${colLetter}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[status]] },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating website lead status:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
