import { NextRequest, NextResponse } from 'next/server';
import {
  client,
  twilioPhone,
  messagingServiceSid,
  formatPhoneForTwilio,
  getSenderParams,
} from '@/lib/twilio';

// TEST ENDPOINT - Sends a sample reminder to a specific phone number
// Does NOT touch production data or Google Sheets

export async function POST(request: NextRequest) {
  try {
    // Check for Twilio configuration
    if (!client || (!twilioPhone && !messagingServiceSid)) {
      return NextResponse.json({
        success: false,
        error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID.'
      }, { status: 500 });
    }

    const body = await request.json();
    const { phone, type = 'customer' } = body;

    if (!phone) {
      return NextResponse.json({
        success: false,
        error: 'Phone number required. Send: { "phone": "2819484922", "type": "customer" or "tech" }'
      }, { status: 400 });
    }

    const businessPhone = process.env.BUSINESS_PHONE || '(281) 904-4674';

    let sms = '';

    if (type === 'tech') {
      // Sample tech reminder
      sms = `📋 Tomorrow's Jobs (TEST)\n\n`;
      sms += `1. John Smith\n`;
      sms += `   📍 1234 Oak St, Katy 77450\n`;
      sms += `   🔧 Air Duct Cleaning\n`;
      sms += `   ⏰ 08:00AM - 11:00AM\n`;
      sms += `   📞 (832) 555-1234\n`;
      sms += `   🔑 Gate: 1234\n\n`;
      sms += `This is a TEST message.`;
    } else {
      // Sample customer reminder
      sms = `Hi John! This is ClearAir.\n\n`;
      sms += `Reminder: Your Air Duct Cleaning appointment is tomorrow (Tue, Feb 11) between 08:00AM - 11:00AM.\n\n`;
      sms += `Our technician will call 30-40 mins before arrival.\n\n`;
      sms += `Reply C to confirm or call ${businessPhone} to reschedule.\n\n`;
      sms += `This is a TEST message.`;
    }

    await client.messages.create({
      body: sms,
      ...getSenderParams(),
      to: formatPhoneForTwilio(phone),
    });

    return NextResponse.json({
      success: true,
      message: `Test ${type} reminder sent to ${phone}`,
      smsContent: sms,
    });

  } catch (error: any) {
    console.error('Test SMS error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'SMS Test endpoint ready',
    usage: 'POST with { "phone": "2819484922", "type": "customer" or "tech" }',
  });
}
