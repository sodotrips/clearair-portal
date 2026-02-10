import twilio from 'twilio';

// Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

// Create Twilio client
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export { client, twilioPhone, messagingServiceSid };

// Build the sender params for client.messages.create()
// Uses Messaging Service SID if available, falls back to phone number
export function getSenderParams(): { messagingServiceSid: string } | { from: string } {
  if (messagingServiceSid) {
    return { messagingServiceSid };
  }
  return { from: twilioPhone || '' };
}

// TEST MODE: Set to true to prevent real SMS from being sent
export const SMS_TEST_MODE = process.env.SMS_TEST_MODE === 'true';

// WHITELIST: Only these numbers will receive SMS (leave empty to allow all)
// Add your real phone numbers here for testing
const WHITELIST_NUMBERS = (process.env.SMS_WHITELIST || '').split(',').filter(Boolean);

// BLOCKED PATTERNS: Numbers matching these patterns will be skipped
const BLOCKED_PATTERNS = [
  /^555/,           // 555-xxxx numbers (fake)
  /^0{3,}/,         // Numbers starting with 000...
  /^1{10}$/,        // 1111111111
  /^2{10}$/,        // 2222222222
  /^123456/,        // 1234567890
  /^000/,           // Starting with 000
  /^999/,           // Starting with 999
];

// Check if a phone number should receive SMS
export function shouldSendSMS(phone: string): { allowed: boolean; reason?: string } {
  const digits = phone.replace(/\D/g, '');

  // Test mode - block all
  if (SMS_TEST_MODE) {
    return { allowed: false, reason: 'SMS_TEST_MODE is enabled' };
  }

  // Check whitelist (if configured)
  if (WHITELIST_NUMBERS.length > 0) {
    const isWhitelisted = WHITELIST_NUMBERS.some(num => {
      const whitelistDigits = num.replace(/\D/g, '');
      return digits === whitelistDigits || digits.endsWith(whitelistDigits);
    });
    if (!isWhitelisted) {
      return { allowed: false, reason: 'Number not in whitelist' };
    }
  }

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(digits)) {
      return { allowed: false, reason: 'Blocked test number pattern' };
    }
  }

  // Check for obviously fake numbers
  if (digits.length !== 10) {
    return { allowed: false, reason: 'Invalid phone length' };
  }

  return { allowed: true };
}

// Helper to format phone for Twilio (needs +1 for US)
export function formatPhoneForTwilio(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `+1${digits}`;
}

// Generate Google Maps link from address
export function getGoogleMapsLink(address: string, city: string, zip?: string): string {
  const fullAddress = `${address}, ${city}, TX${zip ? ' ' + zip : ''}`;
  return `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`;
}

// Get Houston date/time
export function getHoustonDateTime(): Date {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
}

// Format date for display
export function formatDateForSMS(dateStr: string): string {
  if (!dateStr) return '';

  let year: number, month: number, day: number;

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    [month, day, year] = dateStr.split('/').map(Number);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    [year, month, day] = dateStr.split('-').map(Number);
  } else {
    return dateStr;
  }

  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

// Determine who the tech is representing
export function getRepresentingText(leadSource: string, referralSource: string): string {
  const source = (leadSource || '').toLowerCase();

  if (source === 'lead company' || source.includes('lead gen')) {
    if (referralSource) {
      return `🏢 ${referralSource.toUpperCase()} - Represent as ${referralSource} tech`;
    }
    return '🏢 LEAD COMPANY - Represent as their tech';
  } else if (source === 'partner') {
    if (referralSource) {
      return `🤝 ${referralSource.toUpperCase()} - Partner referral`;
    }
    return '🤝 PARTNER - Partner referral';
  } else {
    return '✓ CLEARAIR - Our direct customer';
  }
}
