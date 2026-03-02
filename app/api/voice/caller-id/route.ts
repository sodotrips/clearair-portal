import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Vapi sends call context in the request
    // The customer's phone number can be in different places depending on Vapi's structure
    const customerNumber =
      body?.call?.customer?.number ||
      body?.customer?.number ||
      body?.message?.call?.customer?.number ||
      body?.phoneNumber ||
      body?.from ||
      null;

    if (customerNumber) {
      // Format the phone number for reading aloud (add pauses)
      const cleaned = customerNumber.replace(/\D/g, ''); // Remove non-digits
      const last10 = cleaned.slice(-10); // Get last 10 digits

      if (last10.length === 10) {
        const formatted = `${last10.slice(0,3)}... ${last10.slice(3,6)}... ${last10.slice(6)}`;

        return NextResponse.json({
          found: true,
          phoneNumber: customerNumber,
          formatted: formatted,
          speakAs: `${last10.slice(0,3)}, ${last10.slice(3,6)}, ${last10.slice(6,8)}, ${last10.slice(8)}`,
          message: `The caller's number is ${formatted}`
        });
      }
    }

    return NextResponse.json({
      found: false,
      phoneNumber: null,
      message: "Caller ID not available. Please ask for their phone number."
    });

  } catch (error) {
    return NextResponse.json({
      found: false,
      phoneNumber: null,
      message: "Could not retrieve caller ID. Please ask for their phone number."
    });
  }
}

// Support GET for testing
export async function GET() {
  return NextResponse.json({
    status: "Caller ID endpoint ready",
    usage: "POST with Vapi call context to get caller phone number"
  });
}
