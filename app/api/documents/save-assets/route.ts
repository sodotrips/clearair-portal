import { NextRequest, NextResponse } from 'next/server';
import { uploadImageToDrive } from '@/app/lib/google-drive';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, rowIndex, signature, photos, photoType = 'before' } = body;

    if (!leadId) {
      return NextResponse.json({ success: false, error: 'leadId is required' }, { status: 400 });
    }

    let signatureUrl = '';
    const photoUrls: string[] = [];

    // Upload signature
    if (signature) {
      try {
        const result = await uploadImageToDrive(signature, `SIG_${leadId}.png`);
        signatureUrl = result.webViewLink;
      } catch (err) {
        console.error('Failed to upload signature:', err);
      }
    }

    // Upload photos
    const prefix = photoType === 'after' ? 'AFTER' : 'BEFORE';
    if (photos && Array.isArray(photos)) {
      for (let i = 0; i < photos.length; i++) {
        try {
          const result = await uploadImageToDrive(
            photos[i].dataUrl,
            `${prefix}_${leadId}_${i + 1}.jpg`
          );
          photoUrls.push(result.webViewLink);
        } catch (err) {
          console.error(`Failed to upload photo ${i + 1}:`, err);
        }
      }
    }

    // Save URLs to Google Sheet
    const updates: Record<string, string> = {};
    if (signatureUrl) updates['Signature URL'] = signatureUrl;
    const photoColumn = photoType === 'after' ? 'After Photos URL' : 'Before Photos URL';
    if (photoUrls.length > 0) updates[photoColumn] = JSON.stringify(photoUrls);

    if (Object.keys(updates).length > 0) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/leads/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: parseInt(rowIndex), updates }),
      });
    }

    return NextResponse.json({
      success: true,
      signatureUrl,
      photoUrls,
    });
  } catch (error: any) {
    console.error('Save assets error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
