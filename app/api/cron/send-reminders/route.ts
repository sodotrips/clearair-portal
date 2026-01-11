import { NextRequest, NextResponse } from 'next/server';

// This endpoint is called by Vercel Cron or external cron service
// Schedule: Every day at 6pm Houston time (customer) and 7pm (tech)

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    customerReminders: null,
    techReminders: null,
  };

  try {
    // Get the base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Send customer reminders
    const customerResponse = await fetch(`${baseUrl}/api/sms/send-customer-reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    results.customerReminders = await customerResponse.json();

    // Send tech reminders
    const techResponse = await fetch(`${baseUrl}/api/sms/send-tech-reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    results.techReminders = await techResponse.json();

    console.log('Cron job completed:', results);

    return NextResponse.json({
      success: true,
      message: 'Reminders sent successfully',
      results,
    });
  } catch (error: any) {
    console.error('Cron job error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      results,
    }, { status: 500 });
  }
}
