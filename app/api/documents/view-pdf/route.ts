import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

function getDriveAuthClient() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Extract Google Drive file ID from various URL formats:
 * - https://drive.google.com/file/d/FILE_ID/view?usp=drivesdk
 * - https://drive.google.com/file/d/FILE_ID/preview
 * - https://drive.google.com/uc?id=FILE_ID&export=download
 */
function extractFileId(url: string): string | null {
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const driveUrl = searchParams.get('url');
    if (!driveUrl) {
      return NextResponse.json({ error: 'url param required' }, { status: 400 });
    }

    const fileId = extractFileId(driveUrl);
    if (!fileId) {
      return NextResponse.json({ error: 'Could not extract file ID' }, { status: 400 });
    }

    const auth = getDriveAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Drive not configured' }, { status: 500 });
    }

    const drive = google.drive({ version: 'v3', auth });

    // Fetch file content as stream
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    console.error('view-pdf error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
