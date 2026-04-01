import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    // Step 1: Redirect to Google OAuth consent
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      'http://localhost:3000/api/auth/google-callback'
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive'],
    });

    return NextResponse.redirect(authUrl);
  }

  // Step 2: Exchange code for tokens
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      'http://localhost:3000/api/auth/google-callback'
    );

    const { tokens } = await oauth2Client.getToken(code);

    return new NextResponse(`
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1 style="color: #14b8a6;">✅ Google Drive Connected!</h1>
          <p>Copy this refresh token and add it to your <code>.env.local</code> file:</p>
          <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 14px;">
            GOOGLE_DRIVE_REFRESH_TOKEN="${tokens.refresh_token}"
          </div>
          <p style="margin-top: 20px; color: #64748b;">After adding the token, restart your dev server. You can close this page.</p>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error: any) {
    return new NextResponse(`
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1 style="color: #ef4444;">❌ Error</h1>
          <p>${error.message}</p>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
