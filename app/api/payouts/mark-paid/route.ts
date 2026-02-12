import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, DATA_RANGE } from '@/lib/google-sheets';

// Columns for tracking payout dates
const LEAD_CO_PAID_COL = 'AV';
const SOPHIA_PAID_COL = 'AW';
const AMIT_PAID_COL = 'AX';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { payeeType, leadIds } = body;

    if (!payeeType || !leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'payeeType and leadIds array are required'
      }, { status: 400 });
    }

    // Determine which column to update based on payee type
    let columnLetter: string;
    switch (payeeType) {
      case 'lead_company':
        columnLetter = LEAD_CO_PAID_COL;
        break;
      case 'sophia':
        columnLetter = SOPHIA_PAID_COL;
        break;
      case 'amit':
        columnLetter = AMIT_PAID_COL;
        break;
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid payeeType. Must be lead_company, sophia, or amit'
        }, { status: 400 });
    }

    // Google Sheets setup
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all leads to find row indices
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: DATA_RANGE,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: 'No data found' }, { status: 404 });
    }

    const headers = rows[0];
    const leadIdColIndex = headers.indexOf('Lead ID');

    if (leadIdColIndex === -1) {
      return NextResponse.json({ success: false, error: 'Lead ID column not found' }, { status: 500 });
    }

    // Find row indices for the provided lead IDs
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const updates: { range: string; values: string[][] }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const leadId = rows[i][leadIdColIndex];
      if (leadIds.includes(leadId)) {
        const rowNumber = i + 1; // Sheet rows are 1-indexed
        updates.push({
          range: `${SHEET_NAME}!${columnLetter}${rowNumber}`,
          values: [[timestamp]],
        });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No matching leads found'
      }, { status: 404 });
    }

    // Batch update all the cells
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Marked ${updates.length} leads as paid`,
      paidDate: timestamp,
      leadsUpdated: updates.length,
    });

  } catch (error: any) {
    console.error('Mark paid error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
