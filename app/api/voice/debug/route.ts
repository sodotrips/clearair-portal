import { NextRequest, NextResponse } from 'next/server';

// Debug endpoint - logs everything Vapi sends
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Log the full payload
    console.log('=== VAPI DEBUG PAYLOAD ===');
    console.log(JSON.stringify(payload, null, 2));

    return NextResponse.json({
      received: true,
      payloadKeys: Object.keys(payload),
      hasStructuredData: !!payload.structuredData,
      hasMessage: !!payload.message,
      hasCall: !!payload.call,
      hasTranscript: !!payload.transcript,
      payload: payload
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Debug endpoint ready' });
}
