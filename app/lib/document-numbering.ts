import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, DATA_RANGE } from '@/lib/google-sheets';

/**
 * Generate a sequential document number by scanning existing values in the Sheet.
 * Format: INV-YYMMDD-### or EST-YYMMDD-###
 * e.g., INV-260324-001, EST-260324-002
 */
export async function generateDocumentNumber(type: 'INV' | 'EST'): Promise<string> {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Get today's date prefix
  const now = new Date();
  const houston = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const yy = String(houston.getFullYear()).slice(-2);
  const mm = String(houston.getMonth() + 1).padStart(2, '0');
  const dd = String(houston.getDate()).padStart(2, '0');
  const datePrefix = `${type}-${yy}${mm}${dd}`;

  // Scan the relevant column for existing numbers with today's prefix
  // Invoice Number and Estimate Number are dynamically looked up
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!1:1`,
  });

  const headers = headerResponse.data.values?.[0] || [];
  const columnName = type === 'INV' ? 'Invoice Number' : 'Estimate Number';
  const colIndex = headers.findIndex((h: string) => h === columnName);

  if (colIndex === -1) {
    // Column doesn't exist yet, start at 001
    return `${datePrefix}-001`;
  }

  // Get all values in that column
  const colLetter = String.fromCharCode(65 + (colIndex % 26));
  const colPrefix = colIndex >= 26 ? String.fromCharCode(64 + Math.floor(colIndex / 26)) : '';
  const fullCol = `${colPrefix}${colLetter}`;

  const colResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${fullCol}:${fullCol}`,
  });

  const values = (colResponse.data.values || []).flat().filter(Boolean);

  // Find highest sequence number for today's prefix
  let maxSeq = 0;
  for (const val of values) {
    if (typeof val === 'string' && val.startsWith(datePrefix)) {
      const seqPart = val.split('-').pop();
      const seq = parseInt(seqPart || '0', 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${datePrefix}-${nextSeq}`;
}

/**
 * Get Houston timezone formatted date string
 */
export function getHoustonDate(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Get a "Valid Until" date (14 days from now)
 */
export function getValidUntilDate(): string {
  const now = new Date();
  const validUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return validUntil.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}
