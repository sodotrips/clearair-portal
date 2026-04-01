import { google } from 'googleapis';
import { getAuthClient } from '@/lib/google-sheets';
import { Readable } from 'stream';

// Shared folder in your Google Drive
const ROOT_FOLDER_ID = '1H0MxORFBdK_mjVT9WBWA8AN68y_-BxFC';

// Get OAuth2 client for Drive uploads (uses your personal Google account)
function getDriveAuthClient() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }

  // Fallback to service account
  return null;
}

async function getDriveClient() {
  const oauthClient = getDriveAuthClient();
  if (oauthClient) {
    return google.drive({ version: 'v3', auth: oauthClient });
  }
  // Fallback to service account
  const auth = await getAuthClient();
  return google.drive({ version: 'v3', auth });
}

/**
 * Get or create a subfolder inside a parent folder
 */
async function getOrCreateFolder(drive: ReturnType<typeof google.drive>, parentId: string, folderName: string): Promise<string> {
  // Search for existing folder
  const response = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id!;
  }

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  return folder.data.id!;
}

/**
 * Get or create year/month subfolder structure
 * e.g., ClearAir Documents / 2026 / 03-March
 */
async function getOrCreateDateFolder(drive: ReturnType<typeof google.drive>): Promise<string> {
  const now = new Date();
  const houston = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const year = houston.getFullYear().toString();
  const month = String(houston.getMonth() + 1).padStart(2, '0');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthFolder = `${month}-${monthNames[houston.getMonth()]}`;

  // Use shared folder as root
  const yearFolderId = await getOrCreateFolder(drive, ROOT_FOLDER_ID, year);
  const monthFolderId = await getOrCreateFolder(drive, yearFolderId, monthFolder);

  return monthFolderId;
}

/**
 * Upload a PDF to Google Drive
 * Returns the web view link
 */
export async function uploadPdfToDrive(
  pdfBuffer: Buffer,
  fileName: string
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = await getDriveClient();

  // Extract doc number prefix (e.g. "EST-260329-001" or "INV-260329-001") for matching
  const docPrefix = fileName.split('_')[0]; // e.g. "EST-260329-001"

  // Search for existing file with same doc number across all folders
  let existingFileId: string | null = null;
  if (docPrefix) {
    try {
      const search = await drive.files.list({
        q: `name contains '${docPrefix}' and mimeType='application/pdf' and '${ROOT_FOLDER_ID}' in parents or name contains '${docPrefix}' and mimeType='application/pdf' and trashed=false`,
        fields: 'files(id, name, parents)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      // Find exact prefix match
      const match = search.data.files?.find(f => f.name?.startsWith(docPrefix));
      if (match) existingFileId = match.id!;
    } catch {
      // Search failed, will create new file
    }
  }

  const stream = new Readable();
  stream.push(pdfBuffer);
  stream.push(null);

  if (existingFileId) {
    // Update existing file content
    await drive.files.update({
      fileId: existingFileId,
      requestBody: { name: fileName },
      media: {
        mimeType: 'application/pdf',
        body: stream,
      },
      supportsAllDrives: true,
    });

    const updatedFile = await drive.files.get({
      fileId: existingFileId,
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });

    return {
      fileId: updatedFile.data.id!,
      webViewLink: updatedFile.data.webViewLink!,
    };
  }

  // No existing file — create new
  const folderId = await getOrCreateDateFolder(drive);

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'application/pdf',
      parents: [folderId],
    },
    media: {
      mimeType: 'application/pdf',
      body: stream,
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  // Make the file accessible via link
  await drive.permissions.create({
    fileId: file.data.id!,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
    supportsAllDrives: true,
  });

  const updatedFile = await drive.files.get({
    fileId: file.data.id!,
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  return {
    fileId: updatedFile.data.id!,
    webViewLink: updatedFile.data.webViewLink!,
  };
}

/**
 * Upload an image (base64 data URL) to Google Drive
 * Returns the web view link
 */
export async function uploadImageToDrive(
  dataUrl: string,
  fileName: string
): Promise<{ fileId: string; webViewLink: string }> {
  // Convert base64 data URL to Buffer
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid data URL');
  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');

  const drive = await getDriveClient();
  const folderId = await getOrCreateDateFolder(drive);

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id, webViewLink, webContentLink',
    supportsAllDrives: true,
  });

  // Make accessible via link
  await drive.permissions.create({
    fileId: file.data.id!,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });

  const updatedFile = await drive.files.get({
    fileId: file.data.id!,
    fields: 'id, webViewLink, webContentLink',
    supportsAllDrives: true,
  });

  return {
    fileId: updatedFile.data.id!,
    webViewLink: updatedFile.data.webContentLink || updatedFile.data.webViewLink!,
  };
}

/**
 * Generate a clean filename for a document
 * e.g., INV-260324-001_John-Smith_2026-03-24.pdf
 */
export function generatePdfFileName(
  docNumber: string,
  customerName: string,
  date: string
): string {
  const cleanName = customerName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 30);
  const cleanDate = date.replace(/\//g, '-');
  return `${docNumber}_${cleanName}_${cleanDate}.pdf`;
}
