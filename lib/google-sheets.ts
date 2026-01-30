import { google } from 'googleapis';
import path from 'path';

export const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';
export const SHEET_NAME = 'ACTIVE LEADS';
// Fetch range wide enough to cover all columns (through DU = index 124)
export const DATA_RANGE = `${SHEET_NAME}!A:EZ`;

export async function getAuthClient() {
  // Use environment variable in production (Vercel), file in development
  if (process.env.GOOGLE_CREDENTIALS) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
    return new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
}

// Convert column index to letter (e.g., 0 -> A, 25 -> Z, 26 -> AA, 46 -> AU)
export function columnIndexToLetter(index: number): string {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}
