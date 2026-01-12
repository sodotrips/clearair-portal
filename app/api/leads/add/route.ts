import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import path from 'path';

const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';
const SHEET_NAME = 'ACTIVE LEADS';

async function getAuthClient() {
  // Use environment variable in production, file in development
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

// Generate Lead ID (LEAD-XXXX format, sequential)
async function generateLeadId(sheets: any): Promise<string> {
  // Fetch existing Lead IDs from column A
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:A`,
  });

  const rows = response.data.values || [];
  let maxNumber = 0;

  // Find the highest lead number
  for (const row of rows) {
    const leadId = row[0];
    if (leadId && leadId.startsWith('LEAD-')) {
      const numPart = parseInt(leadId.replace('LEAD-', ''), 10);
      if (!isNaN(numPart) && numPart > maxNumber) {
        maxNumber = numPart;
      }
    }
  }

  // Increment and format with leading zeros (4 digits)
  const nextNumber = maxNumber + 1;
  return `LEAD-${nextNumber.toString().padStart(4, '0')}`;
}

export async function POST(request: Request) {
  try {
    const leadData = await request.json();

    // Get current user from session
    const session = await getServerSession(authOptions);
    const userName = session?.user?.name || 'System';

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Generate Lead ID and created date
    const leadId = await generateLeadId(sheets);
    const now = new Date();
    const createdDate = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;
    const status = leadData.appointmentDate ? 'SCHEDULED' : 'NEW';

    // Get Houston timezone timestamp for Last Modified
    const houstonTime = now.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Map form fields to columns (A-DU based on your sheet)
    // Building a row array with correct column positions
    const row = new Array(125).fill(''); // 125 columns (A to DU)

    // Column mappings based on user's sheet
    row[0] = leadId;                              // A: Lead ID
    row[1] = status;                              // B: Status
    row[2] = leadData.priority || 'MEDIUM';       // C: Priority Level
    row[3] = createdDate;                         // D: Lead Created Date
    row[4] = leadData.customerName || '';         // E: Customer Name
    row[5] = leadData.phone || '';                // F: Phone Number
    row[6] = leadData.email || '';                // G: Email
    row[7] = leadData.address || '';              // H: Address
    row[8] = leadData.city || '';                 // I: City
    row[9] = leadData.zip || '';                  // J: Zip Code
    row[10] = leadData.propertyType || '';        // K: Property Type
    row[11] = leadData.leadSource || '';          // L: Lead Source
    row[12] = leadData.leadSourceDetail || '';    // M: Lead Source Detail
    // Rule: If Lead Source is "Lead Company", copy Lead Source Detail to column N (Referral Source)
    if (leadData.leadSource === 'Lead Company' && leadData.leadSourceDetail) {
      row[13] = leadData.leadSourceDetail;        // N: Referral Source - copy from M when Lead Source is Lead Company
    }
    row[16] = leadData.serviceRequested || '';    // Q: Service Requested
    row[17] = leadData.numUnits || '';            // R: # of Units
    row[18] = leadData.numVents || '';            // S: # of Vents
    row[19] = leadData.customerNotes || '';       // T: Customer Issue/Notes
    row[35] = leadData.assignedTo || '';          // AJ: Assigned To
    row[43] = leadData.appointmentDate || '';     // AR: Appointment Date
    row[45] = leadData.timeWindow || '';          // AT: Time Window
    row[50] = leadData.accessInstructions || '';  // AY: Access Instructions
    row[51] = leadData.gateCode || '';            // AZ: Gate Code/Special Access
    row[52] = leadData.parkingInfo || '';         // BA: Parking Info
    row[53] = leadData.pets || '';                // BB: Pets
    row[117] = houstonTime;                       // DN: Last Modified
    row[118] = userName;                          // DO: Last Modified By

    // Append the row to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:DU`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    return NextResponse.json({ success: true, leadId });
  } catch (error) {
    console.error('Error adding lead:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
