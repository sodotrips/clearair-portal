import { NextResponse } from 'next/server';

export async function GET() {
  const now = new Date();

  // Format for display
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago'
  };

  const today = now.toLocaleDateString('en-US', options);

  // Get day of week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const houstonTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const dayOfWeek = dayNames[houstonTime.getDay()];

  // Calculate this week's dates
  const getDateString = (daysFromNow: number) => {
    const date = new Date(houstonTime);
    date.setDate(date.getDate() + daysFromNow);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekday = dayNames[date.getDay()];
    return `${weekday}, ${month}/${day}`;
  };

  return NextResponse.json({
    today: today,
    dayOfWeek: dayOfWeek,
    tomorrow: getDateString(1),
    thisWeek: {
      today: getDateString(0),
      tomorrow: getDateString(1),
      in2days: getDateString(2),
      in3days: getDateString(3),
      in4days: getDateString(4),
      in5days: getDateString(5),
      in6days: getDateString(6),
    },
    message: `Today is ${today}. Tomorrow is ${getDateString(1)}.`
  });
}

// Also support POST for Vapi function calls
export async function POST() {
  return GET();
}
