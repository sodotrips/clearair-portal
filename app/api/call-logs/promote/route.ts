import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME } from '@/lib/google-sheets';

const CALL_LOG_SHEET = 'CALL LOG';

// Generate sequential Lead ID
async function generateLeadId(sheets: any): Promise<string> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:A`,
  });

  const rows = response.data.values || [];
  let maxNumber = 0;

  for (const row of rows) {
    const leadId = row[0];
    if (leadId && leadId.startsWith('LEAD-')) {
      const numPart = parseInt(leadId.replace('LEAD-', ''), 10);
      if (!isNaN(numPart) && numPart > maxNumber) {
        maxNumber = numPart;
      }
    }
  }

  return `LEAD-${(maxNumber + 1).toString().padStart(4, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const { callLogId, rowIndex } = await request.json();

    if (!callLogId || !rowIndex) {
      return NextResponse.json({ error: 'callLogId and rowIndex are required' }, { status: 400 });
    }

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get the call log entry
    const callLogResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CALL_LOG_SHEET}!A${rowIndex}:L${rowIndex}`,
    });

    const callLogRow = callLogResponse.data.values?.[0];
    if (!callLogRow) {
      return NextResponse.json({ error: 'Call log entry not found' }, { status: 404 });
    }

    // Extract data from call log
    // Columns: A:CallLogID, B:Timestamp, C:Phone, D:Name, E:Service, F:Outcome, G:Promoted?, H:LeadID, I:Duration, J:ApptDate, K:TimeWindow, L:Transcript
    const customerName = callLogRow[3] || '';
    const phone = callLogRow[2] || '';
    const service = callLogRow[4] || 'Air Duct Cleaning';
    const appointmentDate = callLogRow[9] || '';
    const timeWindow = callLogRow[10] || '';
    const transcript = callLogRow[11] || '';

    // Generate new Lead ID
    const leadId = await generateLeadId(sheets);

    // Get current timestamp
    const now = new Date();
    const createdDate = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;
    const houstonTime = now.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Determine status based on whether appointment date exists
    const status = appointmentDate && appointmentDate !== '(none)' ? 'SCHEDULED' : 'NEW';

    // Build lead row for ACTIVE LEADS
    const row = new Array(125).fill('');
    row[0] = leadId;
    row[1] = status;
    row[2] = 'MEDIUM';
    row[3] = createdDate;
    row[4] = customerName;
    row[5] = phone;
    row[6] = ''; // Email
    row[7] = ''; // Address
    row[8] = ''; // City
    row[9] = ''; // Zip
    row[10] = ''; // State
    row[11] = 'Phone - AI Receptionist';
    row[12] = ''; // Referral Source
    row[16] = service;
    row[19] = `Promoted from Call Log (${callLogId}). ${transcript.substring(0, 200)}`;
    row[43] = appointmentDate !== '(none)' ? appointmentDate : '';
    row[45] = timeWindow !== '(none)' ? timeWindow : '';
    row[117] = houstonTime;
    row[118] = 'AI Receptionist (Manual Promote)';

    // Add to ACTIVE LEADS
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:DU`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    // Update CALL LOG to mark as promoted
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CALL_LOG_SHEET}!G${rowIndex}:H${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['YES', leadId]],
      },
    });

    return NextResponse.json({
      success: true,
      leadId,
      message: `Call ${callLogId} promoted to lead ${leadId}`,
    });
  } catch (error: any) {
    console.error('Promote call log error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
