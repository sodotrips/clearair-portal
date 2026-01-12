import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';

export async function GET() {
  const results: string[] = [];

  try {
    // Check if env var exists
    if (process.env.GOOGLE_CREDENTIALS) {
      results.push('GOOGLE_CREDENTIALS env var: EXISTS');

      try {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        results.push('JSON parse: SUCCESS');
        results.push('client_email: ' + (credentials.client_email || 'MISSING'));
        results.push('private_key starts with: ' + (credentials.private_key?.substring(0, 30) || 'MISSING'));

        // Try to connect to Google Sheets
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Users!A:E',
        });

        const rows = response.data.values || [];
        results.push('Users sheet rows: ' + rows.length);

        if (rows.length > 0) {
          results.push('Headers: ' + rows[0].join(', '));
        }
        if (rows.length > 1) {
          results.push('First user username: ' + (rows[1][0] || 'empty'));
        }

      } catch (parseError: any) {
        results.push('Error: ' + parseError.message);
      }
    } else {
      results.push('GOOGLE_CREDENTIALS env var: MISSING');
    }

    // Check other env vars
    results.push('NEXTAUTH_SECRET: ' + (process.env.NEXTAUTH_SECRET ? 'EXISTS' : 'MISSING'));
    results.push('NEXTAUTH_URL: ' + (process.env.NEXTAUTH_URL || 'MISSING'));

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, results });
  }
}
