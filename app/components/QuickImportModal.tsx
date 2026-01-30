'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface QuickImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedLead {
  customerName: string;
  phone: string;
  address: string;
  city: string;
  zip: string;
  serviceRequested: string;
  leadSource: string;
  leadSourceDetail: string;
  referralSource: string;
  leadJobId: string;
  appointmentDate: string;
  timeWindow: string;
  customerNotes: string;
  propertyType: string;
  assignedTo: string;
}

export default function QuickImportModal({ onClose, onSuccess }: QuickImportModalProps) {
  const router = useRouter();
  const [rawText, setRawText] = useState('');
  const [parsedLead, setParsedLead] = useState<ParsedLead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'paste' | 'review'>('paste');

  const services = ['Air Duct Cleaning', 'Dryer Vent Cleaning', 'Attic Insulation', 'Duct Replacement', 'Chimney Services'];
  const leadSources = ['Lead Company', 'Google Ads', 'Facebook Ads', 'Organic', 'Referral', 'Repeat Customer', 'Partner'];
  const timeWindows = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];
  const techs = ['Amit', 'Tech 2', 'Subcontractor'];

  // Houston area cities for matching
  const houstonCities = ['Houston', 'Katy', 'Sugar Land', 'Pearland', 'Spring', 'Cypress', 'The Woodlands', 'Humble', 'Pasadena', 'League City', 'Missouri City', 'Baytown', 'Conroe', 'Richmond', 'Tomball', 'Friendswood', 'Stafford', 'Bellaire', 'Webster', 'Alvin', 'Rosenberg', 'Galveston', 'Texas City', 'La Porte', 'Deer Park', 'Channelview', 'Kingwood', 'Atascocita', 'Clear Lake', 'Galena Park', 'Jacinto City', 'South Houston', 'Seabrook', 'Brookshire', 'West University Place', 'Hedwig Village', 'Bunker Hill Village', 'Piney Point Village', 'Hunters Creek Village', 'Memorial', 'Spring Branch', 'Heights', 'Montrose', 'Midtown', 'Downtown', 'Third Ward', 'Fifth Ward', 'Acres Homes', 'Greenspoint', 'Willowbrook', 'Champions', 'Klein', 'Aldine', 'Sunnyside', 'Sharpstown', 'Alief', 'Westchase', 'Briarforest', 'Energy Corridor', 'Eldridge', 'Bear Creek', 'Copperfield', 'Fairfield', 'Jersey Village', 'Cinco Ranch', 'Fulshear', 'Brookshire', 'Sealy', 'Waller', 'Hockley', 'Magnolia', 'Pinehurst', 'Woodloch', 'Shenandoah', 'Oak Ridge North', 'Panorama Village', 'Cut and Shoot', 'Willis', 'New Caney', 'Porter', 'Huffman', 'Crosby', 'Mont Belvieu', 'Dayton', 'Liberty', 'Cleveland', 'Splendora', 'Patton Village', 'Roman Forest', 'Plum Grove'];

  // Month name to number mapping
  const monthNames: Record<string, string> = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12',
  };

  // Parser for "New job #" format from lead gen companies
  // Format: New job # [Company] [RefNum] [Name] ([Phone] #[Unit]) [Address], [City], [State] [Zip] [Service]
  const parseNewJobFormat = (text: string): ParsedLead | null => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    if (!lines[0] || !lines[0].toLowerCase().startsWith('new job')) return null;

    const firstLine = lines[0];

    // Extract phone from parentheses: (9895597919 #0018) - ignore extension
    const phoneParenRegex = /\((\d{10,11})(?:\s*#\w+)?\)/;
    const phoneParenMatch = firstLine.match(phoneParenRegex);
    if (!phoneParenMatch) return null;

    const rawPhone = phoneParenMatch[1];
    const digits = rawPhone.length === 11 && rawPhone.startsWith('1') ? rawPhone.slice(1) : rawPhone;
    const phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;

    // Split first line around the phone parentheses (use match index to avoid matching other parens like "(HOUSTON)")
    const phoneStart = firstLine.indexOf(phoneParenMatch[0]);
    const phoneEnd = phoneStart + phoneParenMatch[0].length;
    const beforePhone = firstLine.substring(0, phoneStart).trim();
    const afterPhone = firstLine.substring(phoneEnd).trim();

    // Parse beforePhone: "New job # Kirby CC 328963 Guy Beard"
    // Remove "New job #" prefix
    const afterPrefix = beforePhone.replace(/^new\s+job\s*#?\s*/i, '').trim();

    // Find the reference number (standalone digits) to split company from name
    // Pattern: [Company words] [RefNumber] [Name words]
    const refMatch = afterPrefix.match(/^(.+?)\s+(\d{4,})\s+(.+)$/);
    let companyName = '';
    let refNumber = '';
    let customerName = '';

    if (refMatch) {
      companyName = refMatch[1].trim();
      refNumber = refMatch[2];
      customerName = refMatch[3].trim();
    } else {
      // Fallback: no ref number, try to split company and name
      // If no numeric ref, treat everything as customer name
      customerName = afterPrefix;
    }

    // Parse afterPhone: "16638 Millridge Ln, Houston, Texas 77095 Air Duct Cleaning"
    let address = '';
    let city = '';
    let zip = '';
    let serviceRequested = '';

    // Split by commas
    const addressParts = afterPhone.split(',').map(p => p.trim());

    if (addressParts.length >= 2) {
      // First part is street address
      address = addressParts[0];

      // Second part is city
      city = addressParts[1];

      // Third part has state, zip, and possibly service
      if (addressParts.length >= 3) {
        const lastPart = addressParts.slice(2).join(', ');

        // Extract zip from after state name (avoids matching house numbers)
        const stateZipMatch = lastPart.match(/(?:Texas|TX)\s+(\d{5})(?:-\d{4})?/i);
        if (stateZipMatch) {
          zip = stateZipMatch[1];
        }

        // Remove state name and zip to get service
        const serviceMatch = lastPart.replace(/\b(?:Texas|TX)\b/i, '').replace(/\b\d{5}(?:-\d{4})?\b/, '').trim();
        if (serviceMatch) {
          // Match against known services
          const lower = serviceMatch.toLowerCase();
          if (lower.includes('dryer vent')) serviceRequested = 'Dryer Vent Cleaning';
          else if (lower.includes('air duct') || lower.includes('duct cleaning')) serviceRequested = 'Air Duct Cleaning';
          else if (lower.includes('insulation')) serviceRequested = 'Attic Insulation';
          else if (lower.includes('duct replacement')) serviceRequested = 'Duct Replacement';
          else if (lower.includes('chimney')) serviceRequested = 'Chimney Services';
        }
      }
    }

    // Parse date line: "January 29, 2026, 9:00 am January 29, 2026, 11:00 am"
    let appointmentDate = '';
    let timeWindow = '';

    if (lines.length >= 2) {
      const dateLine = lines[1];

      // Match written month format: "January 29, 2026, 9:00 am"
      const dateTimePattern = /(\w+)\s+(\d{1,2}),?\s*(\d{4}),?\s*(\d{1,2}:\d{2}\s*(?:am|pm))/gi;
      const dateMatches = [...dateLine.matchAll(dateTimePattern)];

      if (dateMatches.length >= 1) {
        const firstMatch = dateMatches[0];
        const monthStr = firstMatch[1].toLowerCase();
        const day = firstMatch[2];
        const year = firstMatch[3];
        const startTime = firstMatch[4].trim();

        const monthNum = monthNames[monthStr];
        if (monthNum) {
          appointmentDate = `${monthNum}/${day.padStart(2, '0')}/${year}`;
        }

        // Get time window - format to match dropdown: "10:00AM - 12:00PM"
        if (dateMatches.length >= 2) {
          const endTime = dateMatches[1][4].trim();
          // Convert "9:00 am" → "9:00AM"
          const formatTime = (t: string) => t.replace(/\s*(am|pm)/i, (_, p) => p.toUpperCase());
          timeWindow = `${formatTime(startTime)} - ${formatTime(endTime)}`;
        }
      }
    }

    // Parse remaining lines for notes and property type
    let propertyType = '';
    const noteLines: string[] = [];

    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase().trim();

      // Detect property type - exact match on own line
      if (lower === 'res' || lower === 'residential') {
        propertyType = 'Residential';
        continue;
      }
      if (lower === 'com' || lower === 'commercial') {
        propertyType = 'Commercial';
        continue;
      }

      // Detect property type at start of line with more text after it
      if (!propertyType && /^(?:res|residential)\b/i.test(lower)) {
        propertyType = 'Residential';
        // Keep the rest as notes (strip "residential / " or "res - " prefix)
        const remaining = line.replace(/^(?:res|residential)\s*[\/\-,.:]\s*/i, '').trim();
        if (remaining) noteLines.push(remaining);
        continue;
      }
      if (!propertyType && /^(?:com|commercial)\b/i.test(lower)) {
        propertyType = 'Commercial';
        const remaining = line.replace(/^(?:com|commercial)\s*[\/\-,.:]\s*/i, '').trim();
        if (remaining) noteLines.push(remaining);
        continue;
      }

      // Everything else is notes
      noteLines.push(line);
    }

    const customerNotes = noteLines.join(' | ');

    return {
      customerName,
      phone,
      address,
      city,
      zip,
      serviceRequested,
      leadSource: 'Lead Company',
      leadSourceDetail: 'Air Duct Cleaning Services',
      referralSource: 'IDO',
      leadJobId: refNumber,
      appointmentDate,
      timeWindow,
      customerNotes,
      propertyType,
      assignedTo: 'Amit',
    };
  };

  const parseLeadText = (text: string): ParsedLead => {
    // Try specialized parsers first
    const newJobResult = parseNewJobFormat(text);
    if (newJobResult) return newJobResult;

    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    let customerName = '';
    let phone = '';
    let address = '';
    let city = '';
    let zip = '';
    let serviceRequested = '';
    let leadSourceDetail = '';
    let appointmentDate = '';
    let timeWindow = '';
    let customerNotes = '';

    // Extract phone number - look for pattern like (xxx) xxx-xxxx or xxx-xxx-xxxx or 1xxxxxxxxxx
    // Handle formats with extra spaces like (832) 439- 7453
    const phoneRegex = /\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/;
    const phoneRegex11 = /1?\d{10}/; // 11 digit with country code or 10 digit
    for (const line of lines) {
      // Check if line contains "phone" label
      if (line.toLowerCase().includes('phone')) {
        // Try to extract digits from the line
        const digitsOnly = line.replace(/\D/g, '');
        let digits = digitsOnly;
        // Remove leading 1 if 11 digits (country code)
        if (digits.length === 11 && digits.startsWith('1')) {
          digits = digits.slice(1);
        }
        if (digits.length === 10) {
          phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
          break;
        }
      }
    }
    // Fallback: look for phone pattern anywhere if not found
    if (!phone) {
      for (const line of lines) {
        const phoneMatch = line.match(phoneRegex);
        if (phoneMatch) {
          const digits = phoneMatch[0].replace(/\D/g, '');
          if (digits.length === 10) {
            phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
            break;
          }
        }
      }
    }

    // Extract ZIP code and address
    const zipRegex = /\b(\d{5})(?:-\d{4})?\b/;
    const addressRegex = /(\d+\s+[\w\s]+(?:St|Street|Dr|Drive|Ave|Avenue|Rd|Road|Ln|Lane|Blvd|Boulevard|Ct|Court|Cir|Circle|Way|Pl|Place|Sq|Square|Pkwy|Parkway|Hwy|Highway|Trail|Tr)\.?)/i;

    for (const line of lines) {
      // Check for address line with city, state, zip
      if (line.toLowerCase().includes('address') || addressRegex.test(line) || zipRegex.test(line)) {
        const lineWithoutLabel = line.replace(/^address\s*/i, '').trim();

        // Extract ZIP
        const zipMatch = lineWithoutLabel.match(zipRegex);
        if (zipMatch) {
          zip = zipMatch[1];
        }

        // Extract city - look for Houston area cities
        for (const cityName of houstonCities) {
          const cityRegex = new RegExp(`\\b${cityName}\\b`, 'i');
          if (cityRegex.test(lineWithoutLabel)) {
            city = cityName;
            break;
          }
        }

        // Extract street address
        const addrMatch = lineWithoutLabel.match(addressRegex);
        if (addrMatch) {
          address = addrMatch[1].trim();
        } else {
          // Try to get address before city/state
          const parts = lineWithoutLabel.split(/,\s*/);
          if (parts.length > 0) {
            address = parts[0].trim();
          }
        }
      }
    }

    // Extract customer name - look for "Name:" label first, then "Customer Information" pattern
    for (const line of lines) {
      // Check for "Name:" label pattern (e.g., "Name: John Smith")
      const nameMatch = line.match(/^name:\s*(.+)/i);
      if (nameMatch && nameMatch[1].trim()) {
        customerName = nameMatch[1].trim();
        break;
      }
    }

    // If no "Name:" label found, look for "Customer Information" pattern
    if (!customerName) {
      let foundCustomerInfo = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes('customer information')) {
          foundCustomerInfo = true;
          continue;
        }
        if (foundCustomerInfo && line && !line.toLowerCase().includes('phone') && !phoneRegex.test(line)) {
          // Check if line looks like a name (2-3 words, capitalized)
          const words = line.split(/\s+/);
          if (words.length >= 2 && words.length <= 4 && /^[A-Z]/.test(line)) {
            customerName = line;
            break;
          }
        }
      }
    }

    // Fallback: look for name-like patterns
    if (!customerName) {
      for (const line of lines) {
        // Skip lines that are clearly not names
        if (line.toLowerCase().includes('phone') ||
            line.toLowerCase().includes('address') ||
            line.toLowerCase().includes('message') ||
            line.toLowerCase().includes('inspection') ||
            line.toLowerCase().includes('ticket') ||
            line.toLowerCase().includes('desc') ||
            line.toLowerCase().includes('notes') ||
            line.toLowerCase().startsWith('name:') ||
            phoneRegex.test(line) ||
            zipRegex.test(line)) {
          continue;
        }
        // Check if line looks like a name
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 4 && /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(line)) {
          customerName = line;
          break;
        }
      }
    }

    // Extract service - look for "Desc:" label first, then keywords
    for (const line of lines) {
      const descMatch = line.match(/^desc(?:ription)?:\s*(.+)/i);
      if (descMatch && descMatch[1].trim()) {
        const descText = descMatch[1].trim().toLowerCase();
        if (descText.includes('dryer vent')) {
          serviceRequested = 'Dryer Vent Cleaning';
        } else if (descText.includes('air duct') || descText.includes('duct cleaning')) {
          serviceRequested = 'Air Duct Cleaning';
        } else if (descText.includes('insulation')) {
          serviceRequested = 'Attic Insulation';
        } else if (descText.includes('duct replacement')) {
          serviceRequested = 'Duct Replacement';
        } else if (descText.includes('chimney')) {
          serviceRequested = 'Chimney Services';
        }
        break;
      }
    }

    // Fallback: look for service keywords anywhere in text
    if (!serviceRequested) {
      const serviceKeywords = {
        'dryer vent': 'Dryer Vent Cleaning',
        'air duct': 'Air Duct Cleaning',
        'duct cleaning': 'Air Duct Cleaning',
        'attic insulation': 'Attic Insulation',
        'insulation': 'Attic Insulation',
        'duct replacement': 'Duct Replacement',
        'chimney': 'Chimney Services',
      };

      const textLower = text.toLowerCase();
      for (const [keyword, service] of Object.entries(serviceKeywords)) {
        if (textLower.includes(keyword)) {
          serviceRequested = service;
          break;
        }
      }
    }

    // Extract referral source - first line is usually the company name
    // Look for company name patterns (typically all caps or title case in first few lines)
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i];
      // Skip lines that look like service descriptions or customer info headers
      if (line.toLowerCase().includes('customer information') ||
          line.toLowerCase() === 'clean dryer vent' ||
          line.toLowerCase() === 'air duct cleaning' ||
          line.toLowerCase().includes('phone') ||
          line.toLowerCase().includes('address')) {
        continue;
      }
      // First non-service line is likely the company name
      if (line.length > 3 && !phoneRegex.test(line)) {
        leadSourceDetail = line;
        break;
      }
    }

    // Extract appointment date and time
    // Handle formats: "Monday 1/12", "12/28/2025", "1/12 11-1pm"
    const dateWithYearRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    const dateNoYearRegex = /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*(\d{1,2})\/(\d{1,2})(?!\d)/i;
    const timeRegex = /(\d{1,2})\s*(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*(\d{1,2})\s*(?::\d{2})?\s*(?:am|pm)?/i;

    for (const line of lines) {
      // First try date with year (e.g., 12/28/2025)
      const dateWithYearMatch = line.match(dateWithYearRegex);
      if (dateWithYearMatch && !appointmentDate) {
        const [_, month, day, year] = dateWithYearMatch;
        appointmentDate = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
      }

      // Try date without year (e.g., Monday 1/12)
      if (!appointmentDate) {
        const dateNoYearMatch = line.match(dateNoYearRegex);
        if (dateNoYearMatch) {
          const month = dateNoYearMatch[1];
          const day = dateNoYearMatch[2];
          const year = new Date().getFullYear();
          appointmentDate = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
        }
      }

      // Extract time window
      const timeMatch = line.match(timeRegex);
      if (timeMatch && !timeWindow) {
        const startHour = parseInt(timeMatch[1]);
        // Adjust for PM times written as single digits (e.g., "9am -12pm" or "11-1pm")
        if (startHour >= 8 && startHour < 11) {
          timeWindow = '08:00AM - 11:00AM';
        } else if (startHour >= 11 && startHour <= 12) {
          timeWindow = '11:00AM - 2:00PM';
        } else if (startHour >= 1 && startHour < 8) {
          // Afternoon times (1pm-5pm written as 1-5)
          timeWindow = '2:00PM - 5:00PM';
        } else if (startHour >= 14) {
          timeWindow = '2:00PM - 5:00PM';
        }
      }
    }

    // Collect any additional notes (services mentioned, special requests)
    const noteLines: string[] = [];
    let inNotesSection = false;
    for (const line of lines) {
      // Check for NOTES: section
      if (line.toLowerCase().startsWith('notes:')) {
        inNotesSection = true;
        const noteContent = line.replace(/^notes:\s*/i, '').trim();
        if (noteContent) {
          noteLines.push(noteContent);
        }
        continue;
      }
      // Collect lines after NOTES: header
      if (inNotesSection && line && !line.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
        noteLines.push(line);
      }
      // Also collect lines with dashes like "-Free Inspection-"
      if (line.startsWith('-') && line.endsWith('-')) {
        noteLines.push(line.replace(/-/g, '').trim());
      }
    }
    if (noteLines.length > 0) {
      customerNotes = noteLines.join(' | ');
    }

    return {
      customerName,
      phone,
      address,
      city,
      zip,
      serviceRequested,
      leadSource: leadSourceDetail ? 'Lead Company' : '',
      leadSourceDetail,
      referralSource: '',
      leadJobId: '',
      appointmentDate,
      timeWindow,
      customerNotes,
      propertyType: '',
      assignedTo: 'Amit',
    };
  };

  const handleParse = () => {
    if (!rawText.trim()) {
      setError('Please paste the lead information');
      return;
    }

    const parsed = parseLeadText(rawText);
    setParsedLead(parsed);
    setStep('review');
    setError('');
  };

  const handleFieldChange = (field: keyof ParsedLead, value: string) => {
    if (parsedLead) {
      setParsedLead({ ...parsedLead, [field]: value });
    }
  };

  // Check if date is today or future
  const isDateValid = (dateStr: string) => {
    if (!dateStr) return true; // Empty date is OK (optional)

    // Parse MM/DD/YYYY format
    const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!parts) return true; // Invalid format, let it pass (will be caught elsewhere)

    const [_, month, day, year] = parts;
    const appointmentDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

    // Get today's date at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return appointmentDate >= today;
  };

  const handleSubmit = async () => {
    if (!parsedLead) return;

    // Validation
    if (!parsedLead.customerName.trim()) {
      setError('Customer name is required');
      return;
    }
    if (!parsedLead.phone.trim()) {
      setError('Phone number is required');
      return;
    }
    if (parsedLead.appointmentDate && !isDateValid(parsedLead.appointmentDate)) {
      setError('Appointment date cannot be in the past. Please select today or a future date.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/leads/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: parsedLead.customerName,
          phone: parsedLead.phone,
          address: parsedLead.address,
          city: parsedLead.city,
          zip: parsedLead.zip,
          serviceRequested: parsedLead.serviceRequested,
          leadSource: parsedLead.leadSource,
          leadSourceDetail: parsedLead.leadSourceDetail,
          referralSource: parsedLead.referralSource,
          leadJobId: parsedLead.leadJobId,
          appointmentDate: parsedLead.appointmentDate,
          timeWindow: parsedLead.timeWindow,
          customerNotes: parsedLead.customerNotes,
          propertyType: parsedLead.propertyType,
          assignedTo: parsedLead.assignedTo,
        }),
      });

      const result = await response.json();

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Failed to create lead');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm";
  const labelClass = "block text-slate-600 text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0a2540] text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Smart Add Lead</h2>
            <p className="text-slate-400 text-xs">Paste text message to auto-fill lead info</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress indicator */}
        <div className="px-6 py-2 bg-slate-50 border-b flex items-center gap-4">
          <div className={`flex items-center gap-2 ${step === 'paste' ? 'text-[#14b8a6]' : 'text-slate-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'paste' ? 'bg-[#14b8a6] text-white' : 'bg-slate-200'}`}>1</div>
            <span className="text-sm font-medium">Paste</span>
          </div>
          <div className="flex-1 h-0.5 bg-slate-200"></div>
          <div className={`flex items-center gap-2 ${step === 'review' ? 'text-[#14b8a6]' : 'text-slate-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'review' ? 'bg-[#14b8a6] text-white' : 'bg-slate-200'}`}>2</div>
            <span className="text-sm font-medium">Review & Create</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
          )}

          {step === 'paste' && (
            <div>
              <label className={labelClass}>Paste Lead Text Message</label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Example:
LOCAL AIR DUCT PROS
Clean Dryer Vent
Customer Information
John Smith
Phone    (832) 555-1234
Address    123 Main St, Houston, TX 77001

Monday 1/15  11-1pm`}
                rows={12}
                className={`${inputClass} font-mono text-xs`}
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-2">
                Paste the text message from your lead gen company. The system will automatically extract customer name, phone, address, and service details.
              </p>
            </div>
          )}

          {step === 'review' && parsedLead && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Lead info extracted! Review and edit if needed.
              </div>

              {/* Original text reference */}
              <details open className="bg-slate-50 border border-slate-200 rounded-lg">
                <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-800 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  View Original Text
                </summary>
                <div className="px-3 pb-3">
                  <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono bg-white p-2 rounded border border-slate-200 max-h-32 overflow-y-auto">{rawText}</pre>
                </div>
              </details>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelClass}>Customer Name *</label>
                  <input
                    type="text"
                    value={parsedLead.customerName}
                    onChange={(e) => handleFieldChange('customerName', e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Phone *</label>
                  <input
                    type="text"
                    value={parsedLead.phone}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Service Requested</label>
                  <select
                    value={parsedLead.serviceRequested}
                    onChange={(e) => handleFieldChange('serviceRequested', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select service...</option>
                    {services.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className={labelClass}>Address</label>
                  <input
                    type="text"
                    value={parsedLead.address}
                    onChange={(e) => handleFieldChange('address', e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>City</label>
                  <input
                    type="text"
                    value={parsedLead.city}
                    onChange={(e) => handleFieldChange('city', e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>ZIP Code</label>
                  <input
                    type="text"
                    value={parsedLead.zip}
                    onChange={(e) => handleFieldChange('zip', e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Lead Source</label>
                  <select
                    value={parsedLead.leadSource}
                    onChange={(e) => handleFieldChange('leadSource', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select source...</option>
                    {leadSources.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Lead Source Detail (Company/Brand)</label>
                  <input
                    type="text"
                    value={parsedLead.leadSourceDetail}
                    onChange={(e) => handleFieldChange('leadSourceDetail', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., LOCAL AIR DUCT PROS"
                  />
                </div>

                <div>
                  <label className={labelClass}>Referral Source (Col N)</label>
                  <input
                    type="text"
                    value={parsedLead.referralSource}
                    onChange={(e) => handleFieldChange('referralSource', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., IDO"
                  />
                </div>

                <div>
                  <label className={labelClass}>Lead Job ID (Col P)</label>
                  <input
                    type="text"
                    value={parsedLead.leadJobId}
                    onChange={(e) => handleFieldChange('leadJobId', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., 328963"
                  />
                </div>

                <div>
                  <label className={labelClass}>Appointment Date</label>
                  <input
                    type="text"
                    value={parsedLead.appointmentDate}
                    onChange={(e) => handleFieldChange('appointmentDate', e.target.value)}
                    placeholder="MM/DD/YYYY"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Time Window</label>
                  <input
                    type="text"
                    value={parsedLead.timeWindow}
                    onChange={(e) => handleFieldChange('timeWindow', e.target.value)}
                    placeholder="e.g., 9:00 am - 11:00 am"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Technician</label>
                  <select
                    value={parsedLead.assignedTo}
                    onChange={(e) => handleFieldChange('assignedTo', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select tech...</option>
                    {techs.map(tech => <option key={tech} value={tech}>{tech}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Property Type</label>
                  <select
                    value={parsedLead.propertyType}
                    onChange={(e) => handleFieldChange('propertyType', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select type...</option>
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className={labelClass}>Notes</label>
                  <textarea
                    value={parsedLead.customerNotes}
                    onChange={(e) => handleFieldChange('customerNotes', e.target.value)}
                    rows={2}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t flex justify-between gap-3 flex-shrink-0">
          {step === 'review' && (
            <button
              onClick={() => setStep('paste')}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition"
            >
              Back
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition text-sm"
            >
              Cancel
            </button>
            {step === 'paste' && (
              <button
                onClick={handleParse}
                className="px-4 py-2 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Parse Lead
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-2 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Lead
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
