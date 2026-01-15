import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import path from 'path';

const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';
const SETTINGS_SHEET = 'SETTINGS';

async function getAuthClient() {
  if (process.env.GOOGLE_CREDENTIALS) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
  } else {
    const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
  }
}

// Default settings
const DEFAULT_SETTINGS: Record<string, string> = {
  'daily_summary_enabled': 'false',
  'daily_summary_phone': '281-904-4674',
  'daily_summary_time': '18:00',
};

export async function GET() {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Try to read settings
    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SETTINGS_SHEET}!A:B`,
      });
    } catch (e) {
      // Sheet might not exist, create it with defaults
      await createSettingsSheet(sheets);
      return NextResponse.json({ settings: DEFAULT_SETTINGS });
    }

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ settings: DEFAULT_SETTINGS });
    }

    // Convert rows to settings object
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    rows.forEach((row) => {
      if (row[0]) {
        settings[row[0]] = row[1] || '';
      }
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error reading settings:', error);
    return NextResponse.json(
      { error: String(error), settings: DEFAULT_SETTINGS },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { key, value } = await request.json();

    if (!key) {
      return NextResponse.json(
        { success: false, error: 'Missing key' },
        { status: 400 }
      );
    }

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // First, try to read existing settings to find the row
    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SETTINGS_SHEET}!A:B`,
      });
    } catch (e) {
      // Create sheet if it doesn't exist
      await createSettingsSheet(sheets);
      response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SETTINGS_SHEET}!A:B`,
      });
    }

    const rows = response.data.values || [];
    let rowIndex = -1;

    // Find if key exists
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === key) {
        rowIndex = i + 1; // 1-indexed
        break;
      }
    }

    if (rowIndex > 0) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SETTINGS_SHEET}!B${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[value]],
        },
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SETTINGS_SHEET}!A:B`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[key, value]],
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving setting:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

async function createSettingsSheet(sheets: any) {
  try {
    // Add the SETTINGS sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: SETTINGS_SHEET,
              },
            },
          },
        ],
      },
    });

    // Add default values
    const defaultRows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => [key, value]);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SETTINGS_SHEET}!A1:B${defaultRows.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: defaultRows,
      },
    });
  } catch (e) {
    // Sheet might already exist
    console.log('Settings sheet may already exist:', e);
  }
}
