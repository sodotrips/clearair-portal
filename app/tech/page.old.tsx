'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import ScheduleModal from '../components/ScheduleModal';
import QuoteModal from '../components/QuoteModal';
import CheckoutModal from '../components/CheckoutModal';

const PhotosModal = dynamic(() => import('../components/PhotosModal'), { ssr: false });
const SendDocumentModal = dynamic(() => import('../components/SendDocumentModal'), { ssr: false });

// Dynamically import the map to avoid SSR issues with Leaflet
const JobMap = dynamic(() => import('../components/JobMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4 h-64 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading map...</div>
    </div>
  )
});

interface Lead {
  [key: string]: string;
}

export default function TechPortal() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTech, setSelectedTech] = useState(() => session?.user?.name || 'Amit');
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [cancellingAppt, setCancellingAppt] = useState<string | null>(null);
  const [cancellingFollowUp, setCancellingFollowUp] = useState<string | null>(null);
  const [sendingReview, setSendingReview] = useState<string | null>(null);
  const [reviewSent, setReviewSent] = useState<Set<string>>(new Set());
  const [rescheduleJob, setRescheduleJob] = useState<Lead | null>(null);
  const [addServiceJob, setAddServiceJob] = useState<Lead | null>(null);
  const [addingService, setAddingService] = useState(false);
  const [selectedNewService, setSelectedNewService] = useState('');
  const [quoteJob, setQuoteJob] = useState<Lead | null>(null);
  const [checkoutJob, setCheckoutJob] = useState<Lead | null>(null);
  const [photosJob, setPhotosJob] = useState<Lead | null>(null);
  const [sendDocJob, setSendDocJob] = useState<Lead | null>(null);
  const [sendDocType, setSendDocType] = useState<'estimate' | 'invoice'>('estimate');
  const [activeView, setActiveView] = useState<'schedule' | 'history'>('schedule');

  // Edit mode state
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editService, setEditService] = useState('');
  const [editPropertyType, setEditPropertyType] = useState('');
  const [editUnits, setEditUnits] = useState('');
  const [editVents, setEditVents] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Transcript viewing state
  const [viewingTranscript, setViewingTranscript] = useState<any>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  const propertyTypes = ['Single Family', 'Townhouse', 'Apartment', 'Commercial - Office'];

  const services = ['Air Duct Cleaning', 'Dryer Vent Cleaning', 'Air Duct & Dryer Vent', 'Attic Insulation', 'Duct Replacement', 'Chimney Services'];
  // Houston timezone helper
  const getHoustonDate = (date: Date = new Date()) => {
    const houstonTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const year = houstonTime.getFullYear();
    const month = String(houstonTime.getMonth() + 1).padStart(2, '0');
    const day = String(houstonTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState('');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const techs = ['Amit', 'Tech 2', 'Subcontractor'];

  // Set initial date and fetch leads on client side
  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(getHoustonDate());
    }
    fetchLeads();
  }, []);

  async function fetchLeads() {
    try {
      const response = await fetch('/api/leads');
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setLeads(data.leads || []);
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddNewService() {
    if (!addServiceJob || !selectedNewService) return;

    setAddingService(true);
    try {
      const response = await fetch('/api/leads/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: addServiceJob['Customer Name'],
          phone: addServiceJob['Phone Number'],
          email: addServiceJob['Email'] || '',
          address: addServiceJob['Address'],
          city: addServiceJob['City'],
          zip: addServiceJob['Zip Code'],
          propertyType: addServiceJob['Property Type'] || '',
          leadSource: 'Repeat Customer',
          leadSourceDetail: '',
          serviceRequested: selectedNewService,
          assignedTo: selectedTech,
          gateCode: addServiceJob['Gate Code'] || '',
          pets: addServiceJob['Pets?'] || '',
          parkingInfo: addServiceJob['Parking Info'] || '',
          accessInstructions: addServiceJob['Access Instructions'] || '',
          customerNotes: `Upsell from ${addServiceJob['Lead ID']} - ${addServiceJob['Service Requested']}`,
          appointmentDate: addServiceJob['Appointment Date'] || '',
          timeWindow: addServiceJob['Time Window'] || '',
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`New service lead created: ${data.leadId}`);
        setAddServiceJob(null);
        setSelectedNewService('');
        await fetchLeads();
      } else {
        alert(data.error || 'Failed to create lead');
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setAddingService(false);
    }
  }

  async function handleCheckInOut(leadId: string, action: 'checkin' | 'checkout') {
    setCheckingIn(leadId);
    try {
      const response = await fetch('/api/leads/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, action }),
      });
      const data = await response.json();
      if (data.success) {
        // Refresh leads to show updated status
        await fetchLeads();
      } else {
        alert(data.error || 'Failed to update');
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setCheckingIn(null);
    }
  }

  // Cancel appointment - reset to NEW, clear date/time, update notes
  async function handleCancelAppointment(job: Lead) {
    if (!confirm(`Customer cancelled appointment?\n\nThis will:\n• Set status to NEW\n• Clear appointment date/time\n• Add note for reschedule`)) return;

    setCancellingAppt(job['Lead ID']);
    try {
      // Get current notes and append cancellation note
      const currentNotes = job['Customer Issue/Notes'] || '';
      const timestamp = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Chicago'
      });
      const cancelNote = `[${timestamp}] Customer cancelled appt, reschedule TBD`;
      const updatedNotes = currentNotes
        ? `${currentNotes}\n${cancelNote}`
        : cancelNote;

      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: job['rowIndex'],
          updates: {
            'Status': 'NEW',
            'Appointment Date': '',
            'Time Window': '',
            'Customer Issue/Notes': updatedNotes,
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        await fetchLeads();
      } else {
        alert(data.error || 'Failed to cancel appointment');
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setCancellingAppt(null);
    }
  }

  // Cancel follow-up - set status to CANCELED so it drops out of the history view
  async function handleCancelFollowUp(job: Lead) {
    if (!confirm(`Cancel follow-up for ${job['Customer Name']}?\n\nThis will mark the lead as CANCELED and remove it from follow-ups.`)) return;

    setCancellingFollowUp(job['Lead ID']);
    try {
      const currentNotes = job['Customer Issue/Notes'] || '';
      const timestamp = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Chicago'
      });
      const cancelNote = `[${timestamp}] Follow-up canceled by tech`;
      const updatedNotes = currentNotes
        ? `${currentNotes}\n${cancelNote}`
        : cancelNote;

      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: job['rowIndex'],
          updates: {
            'Status': 'CANCELED',
            'Customer Issue/Notes': updatedNotes,
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        await fetchLeads();
      } else {
        alert(data.error || 'Failed to cancel follow-up');
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setCancellingFollowUp(null);
    }
  }

  // Fetch image from Drive URL and convert to data URL for PDF embedding
  async function driveUrlToDataUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async function handleViewPdf(job: Lead) {
    const isPaid = !!(job['Amount Paid'] && parseFloat(job['Amount Paid']) > 0 && job['Payment Method']);
    const isInvoice = isPaid || job['Status']?.toUpperCase() === 'CLOSED' || !!(job['Invoice Number']);
    const totalAmount = parseFloat(job['Amount Paid'] || job['Quote Amount'] || '0');

    // Load signature from Drive if available
    let signatureDataUrl: string | null = null;
    if (job['Signature URL']) {
      signatureDataUrl = await driveUrlToDataUrl(job['Signature URL']);
    }

    // Load before photos from Drive if available
    let beforePhotos: { dataUrl: string; name: string }[] = [];
    if (job['Before Photo URLs']) {
      try {
        const urls: string[] = JSON.parse(job['Before Photo URLs']);
        const loaded = await Promise.all(urls.map(async (url, i) => {
          const dataUrl = await driveUrlToDataUrl(url);
          return dataUrl ? { dataUrl, name: `before-${i + 1}.jpg` } : null;
        }));
        beforePhotos = loaded.filter(Boolean) as { dataUrl: string; name: string }[];
      } catch {
        // Invalid JSON
      }
    }

    const lineItems = (() => { try { const items = JSON.parse(job['Estimate Line Items'] || '[]'); return items.length > 0 ? items : [{ service: job['Service Requested'] || '', description: '', qty: 1, price: totalAmount }]; } catch { return [{ service: job['Service Requested'] || '', description: '', qty: 1, price: totalAmount }]; } })();
    const customer = { name: job['Customer Name'] || '', address: job['Address'] || '', city: job['City'] || '', zip: job['Zip Code'] || '', phone: job['Phone Number'] || '', email: job['Email'] || '' };

    // Calculate totals from line items
    const subtotal = lineItems.reduce((sum: number, item: { qty?: number; price?: number }) => sum + ((item.qty || 1) * (item.price || 0)), 0);
    const TAX_RATE = 0.0825;
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;
    const depositInfo = job['Deposit Amount'] && parseFloat(job['Deposit Amount']) > 0
      ? { depositAmount: parseFloat(job['Deposit Amount']), depositMethod: job['Deposit Method'] || '', depositDate: job['Deposit Date'] || '' }
      : {};

    try {
      if (isInvoice) {
        const { generateInvoicePdf } = await import('@/app/lib/generateInvoicePdf');
        const blob = await generateInvoicePdf({
          invoiceNumber: job['Invoice Number'] || 'DRAFT',
          date: job['Payment Date'] || job['Appointment Date'] || new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
          dueDate: job['Appointment Date'] || '',
          leadId: job['Lead ID'],
          customer,
          lineItems,
          totals: { subtotal, discount: 0, taxRate: TAX_RATE, tax, total, ...depositInfo },
          techNotes: job['Tech Notes'] || '',
          isPaid,
          amountPaid: job['Amount Paid'] || '',
          paymentMethod: job['Payment Method'] || '',
          paymentDate: job['Payment Date'] || '',
          signatureDataUrl,
          photos: beforePhotos,
        });
        window.open(URL.createObjectURL(blob), '_blank');
      } else {
        const { generateEstimatePdf } = await import('@/app/lib/generateEstimatePdf');
        const quoteAmount = parseFloat(job['Quote Amount'] || '0');
        const blob = await generateEstimatePdf({
          estimateNumber: job['Estimate Number'] || 'DRAFT',
          date: job['Appointment Date'] || new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
          validUntil: '',
          leadId: job['Lead ID'],
          customer,
          lineItems,
          totals: { subtotal, discount: 0, taxRate: TAX_RATE, tax, total },
          techNotes: job['Tech Notes'] || '',
          signatureDataUrl,
          photos: beforePhotos,
        });
        window.open(URL.createObjectURL(blob), '_blank');
      }
    } catch {
      alert('Failed to generate PDF');
    }
  }

  async function handleSendReviewRequest(job: Lead) {
    if (!confirm(`Send review request to ${job['Customer Name']}?\n\nThis will text them a Google review link.`)) return;

    setSendingReview(job['Lead ID']);
    try {
      const response = await fetch('/api/sms/send-review-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: job['Lead ID'] }),
      });

      const data = await response.json();
      if (data.success) {
        setReviewSent(prev => new Set(prev).add(job['Lead ID']));
        alert(`Review request sent to ${job['Customer Name']}!`);
      } else {
        alert(data.error || 'Failed to send review request');
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setSendingReview(null);
    }
  }

  // Start editing a job
  function startEditJob(job: Lead) {
    setEditingJobId(job['Lead ID']);
    setEditService(job['Service Requested'] || '');
    setEditPropertyType(job['Property Type'] || '');
    setEditUnits(job['# of Units'] || '');
    setEditVents(job['# of Vents'] || '');
    setEditNotes(job['Customer Issue/Notes'] || '');
  }

  // Cancel editing
  function cancelEdit() {
    setEditingJobId(null);
    setEditService('');
    setEditPropertyType('');
    setEditUnits('');
    setEditVents('');
    setEditNotes('');
  }

  // Save job edits
  async function saveJobEdits(job: Lead) {
    setSaving(true);
    try {
      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: job['rowIndex'],
          updates: {
            'Service Requested': editService,
            'Property Type': editPropertyType,
            '# of Units': editUnits,
            '# of Vents': editVents,
            'Customer Issue/Notes': editNotes,
          },
        }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchLeads();
        cancelEdit();
      } else {
        alert(data.error || 'Failed to save');
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setSaving(false);
    }
  }

  // Extract Call Log ID from notes (e.g., "AI Receptionist (CALL-12345678)")
  function extractCallLogId(notes: string): string | null {
    const match = notes?.match(/CALL-\d+/);
    return match ? match[0] : null;
  }

  // Fetch transcript from Call Log
  async function fetchTranscript(callLogId: string) {
    setLoadingTranscript(true);
    try {
      const response = await fetch(`/api/call-logs/transcript?id=${callLogId}`);
      const data = await response.json();
      if (data.success) {
        setViewingTranscript(data.callLog);
      } else {
        alert('Could not load transcript: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setLoadingTranscript(false);
    }
  }

  const formatPhone = (phone: string) => {
    if (!phone || phone === '-') return '-';
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-') return '-';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      return `${month}/${day}/${year}`;
    }
    return dateStr;
  };

  const isDateMatch = (apptDate: string, targetDate: string) => {
    if (!apptDate || !targetDate) return false;

    // Convert target date (YYYY-MM-DD) to compare
    const [targetYear, targetMonth, targetDay] = targetDate.split('-');
    const targetFormatted = `${targetMonth}/${targetDay}/${targetYear}`;

    // Check if appointment date matches
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(apptDate)) {
      const [month, day, year] = apptDate.split('/');
      const apptFormatted = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
      return apptFormatted === targetFormatted;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
      return apptDate === targetDate;
    }

    return false;
  };

  // Filter jobs for selected tech and date
  const myJobs = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    const isAssigned = l['Assigned To'] === selectedTech;
    const isScheduled = status === 'SCHEDULED' || status === 'IN PROGRESS';
    const isOnDate = isDateMatch(l['Appointment Date'], selectedDate);
    return isAssigned && isScheduled && isOnDate;
  }).sort((a, b) => {
    const parseTimeWindow = (tw: string): number => {
      const match = (tw || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (!match) return 99 * 60;
      let hour = parseInt(match[1], 10);
      const minutes = parseInt(match[2] || '0', 10);
      const meridiem = (match[3] || '').toLowerCase();
      if (meridiem === 'pm' && hour !== 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      return hour * 60 + minutes;
    };
    return parseTimeWindow(a['Time Window']) - parseTimeWindow(b['Time Window']);
  });

  // Get quoted jobs for today (visited but not closed/paid)
  const quotedToday = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    const isAssigned = l['Assigned To'] === selectedTech;
    const isQuoted = status === 'QUOTED';
    const isOnDate = isDateMatch(l['Appointment Date'], selectedDate);
    return isAssigned && isQuoted && isOnDate;
  });

  // Get closed jobs for today
  const closedToday = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    const isAssigned = l['Assigned To'] === selectedTech;
    const isClosed = status === 'CLOSED';
    const isOnDate = isDateMatch(l['Appointment Date'], selectedDate);
    return isAssigned && isClosed && isOnDate;
  });

  // Get history jobs (only QUOTED - exclude CLOSED and CANCELED)
  const historyJobs = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    const isAssigned = l['Assigned To'] === selectedTech;
    const isQuoted = status === 'QUOTED';
    return isAssigned && isQuoted;
  }).sort((a, b) => {
    // Sort by appointment date descending (most recent first)
    // Parse dates to compare properly
    const parseDate = (dateStr: string) => {
      if (!dateStr) return new Date(0);
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const [month, day, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      }
      return new Date(0);
    };
    return parseDate(b['Appointment Date']).getTime() - parseDate(a['Appointment Date']).getTime();
  });

  const statusStyles: Record<string, string> = {
    'NEW': 'bg-blue-100 text-blue-700',
    'SCHEDULED': 'bg-teal-100 text-teal-700',
    'IN PROGRESS': 'bg-purple-100 text-purple-700',
    'QUOTED': 'bg-amber-100 text-amber-700',
    'CLOSED': 'bg-emerald-100 text-emerald-700',
  };

  // Helper to determine who the tech is representing
  // Uses column M (Lead Source Detail) - if empty, defaults to CLEARAIR
  const getRepresentingInfo = (job: Lead) => {
    const leadSourceDetail = (job['Lead Source Detail'] || '').trim();

    if (leadSourceDetail) {
      // Representing another company
      return {
        name: leadSourceDetail.toUpperCase(),
        label: `Represent as ${leadSourceDetail} technician`,
        style: 'bg-amber-100 text-amber-800 border-amber-300',
        icon: '🏢'
      };
    } else {
      // Default to CLEARAIR
      return {
        name: 'CLEARAIR',
        label: 'Our direct customer',
        style: 'bg-teal-100 text-teal-800 border-teal-300',
        icon: '✓'
      };
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0); // noon to avoid any edge cases
    return date.toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  const isToday = (dateStr: string) => {
    return dateStr === getHoustonDate();
  };

  // Show loading state while data is being fetched
  if (loading || !selectedDate) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-500">
      {/* Header */}
      <header className="bg-[#0a2540] text-white px-4 py-4 sticky top-0 z-20">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-1">
              <Image
                src="/clearair-logo.png"
                alt="ClearAir Solutions"
                width={75}
                height={23}
                priority
              />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Tech Portal</h1>
              <p className="text-slate-400 text-xs">{session?.user?.name || 'ClearAir Solutions'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="bg-[#1a3a5c] text-white border border-slate-600 rounded-lg px-3 py-2 text-sm"
            >
              {techs.map(tech => (
                <option key={tech} value={tech}>{tech}</option>
              ))}
            </select>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="p-4">
        {/* Schedule View */}
        {activeView === 'schedule' && (
          <>
        {/* Date Selector */}
        <div className="bg-white rounded-xl shadow-sm px-3 py-1.5 mb-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const [year, month, day] = selectedDate.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                date.setDate(date.getDate() - 1);
                const newYear = date.getFullYear();
                const newMonth = String(date.getMonth() + 1).padStart(2, '0');
                const newDay = String(date.getDate()).padStart(2, '0');
                setSelectedDate(`${newYear}-${newMonth}-${newDay}`);
              }}
              className="p-1 hover:bg-slate-100 rounded-lg transition"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#0a2540]">
                {formatDateDisplay(selectedDate)}
              </p>
              {isToday(selectedDate) && (
                <span className="text-[10px] bg-[#14b8a6] text-white px-1.5 py-0.5 rounded-full">Today</span>
              )}
            </div>
            <button
              onClick={() => {
                const [year, month, day] = selectedDate.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                date.setDate(date.getDate() + 1);
                const newYear = date.getFullYear();
                const newMonth = String(date.getMonth() + 1).padStart(2, '0');
                const newDay = String(date.getDate()).padStart(2, '0');
                setSelectedDate(`${newYear}-${newMonth}-${newDay}`);
              }}
              className="p-1 hover:bg-slate-100 rounded-lg transition"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Map showing all jobs for the day */}
        {!loading && [...myJobs, ...quotedToday, ...closedToday].length > 0 && (
          <JobMap jobs={[...myJobs, ...quotedToday, ...closedToday]} />
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-slate-500 text-sm">Loading schedule...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        {/* Jobs List */}
        {!loading && !error && (
          <div className="space-y-3">
            {myJobs.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <span className="text-4xl mb-4 block">📅</span>
                <p className="text-slate-600 font-medium">No jobs scheduled</p>
                <p className="text-slate-400 text-sm">for {formatDateDisplay(selectedDate)}</p>
              </div>
            ) : (
              myJobs.map((job, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {/* Job Header */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedJob(expandedJob === job['Lead ID'] ? null : job['Lead ID'])}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-[#0a2540]">Job {idx + 1}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles[job['Status']?.toUpperCase()] || 'bg-slate-100'}`}>
                          {job['Status']}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="bg-[#14b8a6]/10 text-[#14b8a6] px-3 py-1 rounded-lg text-sm font-semibold">
                          {job['Time Window'] || 'No time'}
                        </div>
                        {job['Deposit Amount'] && parseFloat(job['Deposit Amount']) > 0 && (
                          <div className="mt-1 flex flex-col items-end gap-0.5 text-xs">
                            <span className="text-slate-500">Closed <strong>${job['Quote Amount'] || '0'}</strong> · Dep <strong className="text-teal-600">${job['Deposit Amount']}</strong> · Bal <strong className="text-red-600">${job['Balance Due'] || (parseFloat(job['Quote Amount'] || '0') - parseFloat(job['Deposit Amount'] || '0')).toFixed(2)}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    <h3 className="font-semibold text-[#0a2540] text-lg">{job['Customer Name']}</h3>
                    <p className="text-slate-500 text-sm">{job['Address']}, {job['City']}</p>
                    <p className="text-slate-600 text-sm mt-1">{job['Service Requested']}</p>

                    {/* Representing Badge */}
                    {(() => {
                      const rep = getRepresentingInfo(job);
                      return (
                        <div className={`mt-2 px-3 py-1.5 rounded-lg border ${rep.style} inline-flex items-center gap-2`}>
                          <span>{rep.icon}</span>
                          <div>
                            <span className="font-bold text-sm">{rep.name}</span>
                            <span className="text-xs ml-1 opacity-75">- {rep.label}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Confirmation Status */}
                    {(() => {
                      const status = job['Appointment Confirmed']?.toUpperCase();
                      if (status === 'YES') {
                        return (
                          <div className="mt-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg inline-flex items-center gap-2 text-sm">
                            <span>✓</span>
                            <span className="font-medium">Customer Confirmed</span>
                          </div>
                        );
                      } else if (status === 'PENDING') {
                        return (
                          <div className="mt-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg inline-flex items-center gap-2 text-sm">
                            <span>⏳</span>
                            <span className="font-medium">Awaiting Confirmation</span>
                          </div>
                        );
                      } else if (status === 'NO') {
                        return (
                          <div className="mt-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg inline-flex items-center gap-2 text-sm">
                            <span>⚠️</span>
                            <span className="font-medium">Needs Reschedule - Call First!</span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="mt-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg inline-flex items-center gap-2 text-sm">
                            <span>📞</span>
                            <span className="font-medium">Not Confirmed - Call to Verify</span>
                          </div>
                        );
                      }
                    })()}

                    {/* Referral Source */}
                    {job['Referral Source'] && (
                      <div className="mt-2 text-sm text-slate-600">
                        <span className="text-slate-400">Referral:</span> <span className="font-medium">{job['Referral Source']}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-3">
                      <a
                        href={`tel:${job['Phone Number']}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#14b8a6] text-sm font-medium"
                      >
                        {formatPhone(job['Phone Number'])}
                      </a>
                      <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#14b8a6] text-white">
                        <span className="text-xs font-medium">{expandedJob === job['Lead ID'] ? 'Less' : 'More Info'}</span>
                        <svg
                          className={`w-4 h-4 transition-transform ${expandedJob === job['Lead ID'] ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedJob === job['Lead ID'] && (
                    <div className="border-t border-slate-100">
                      {/* Deposit Banner - top of expanded details */}
                      {job['Deposit Amount'] && parseFloat(job['Deposit Amount']) > 0 && (
                        <div className="mx-4 mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm mb-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            DEPOSIT ON FILE
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <p className="text-blue-500">Deposit</p>
                              <p className="font-semibold text-blue-800">${job['Deposit Amount']} ({job['Deposit Method'] || ''})</p>
                            </div>
                            <div>
                              <p className="text-blue-500">Estimate</p>
                              <p className="font-semibold text-blue-800">${job['Quote Amount'] || '—'}</p>
                            </div>
                            <div>
                              <p className="text-blue-500">Balance Due</p>
                              <p className="font-semibold text-red-600">${job['Balance Due'] || (parseFloat(job['Quote Amount'] || '0') - parseFloat(job['Deposit Amount'] || '0')).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Quick Actions */}
                      {(() => {
                        const isClearAir = getRepresentingInfo(job).name === 'CLEARAIR';
                        const alreadySentReview = reviewSent.has(job['Lead ID']) || job['Review Requested?']?.toUpperCase() === 'YES';
                        return (
                      <div className={`p-4 bg-slate-50 flex flex-wrap gap-2`}>
                        <button
                          onClick={() => setPhotosJob(job)}
                          className="flex-1 flex items-center justify-center gap-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg font-medium transition text-xs min-w-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Photos
                        </button>
                        <button
                          onClick={() => handleViewPdf(job)}
                          className="flex-1 flex items-center justify-center gap-1 bg-slate-500 hover:bg-slate-600 text-white py-2 rounded-lg font-medium transition text-xs min-w-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          View PDF
                        </button>
                        <button
                          onClick={() => {
                            const isPaid = !!(job['Amount Paid'] && parseFloat(job['Amount Paid']) > 0 && job['Payment Method']);
                            setSendDocType(isPaid || job['Status']?.toUpperCase() === 'CLOSED' ? 'invoice' : 'estimate');
                            setSendDocJob(job);
                          }}
                          className="flex-1 flex items-center justify-center gap-1 bg-[#14b8a6] hover:bg-[#0d9488] text-white py-2 rounded-lg font-medium transition text-xs min-w-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          Send
                        </button>
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(job['Address'] + ', ' + job['City'] + ', TX ' + job['Zip Code'])}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg font-medium transition text-xs min-w-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Navigate
                        </a>
                        <button
                          onClick={() => startEditJob(job)}
                          className="flex-1 flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg font-medium transition text-xs min-w-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          onClick={() => handleCancelAppointment(job)}
                          disabled={cancellingAppt === job['Lead ID']}
                          className="flex-1 flex items-center justify-center gap-1 bg-slate-400 hover:bg-slate-500 text-white py-2 rounded-lg font-medium transition text-xs min-w-0 disabled:opacity-50"
                        >
                          {cancellingAppt === job['Lead ID'] ? (
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          Cancel
                        </button>
                        {isClearAir && (
                          <button
                            onClick={() => handleSendReviewRequest(job)}
                            disabled={sendingReview === job['Lead ID']}
                            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg font-medium transition text-xs min-w-0 disabled:opacity-50 ${
                              alreadySentReview
                                ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                                : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                            }`}
                          >
                            {sendingReview === job['Lead ID'] ? (
                              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            )}
                            {alreadySentReview ? 'Sent' : 'Review'}
                          </button>
                        )}
                      </div>
                        );
                      })()}

                      {/* Job Details */}
                      <div className="p-4 space-y-3">
                        {/* Representing Info - Prominent */}
                        {(() => {
                          const rep = getRepresentingInfo(job);
                          const isExternal = rep.name !== 'CLEARAIR';
                          return isExternal ? (
                            <div className={`p-3 rounded-lg border-2 ${rep.style} mb-3`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg">{rep.icon}</span>
                                <span className="font-bold">{rep.name}</span>
                              </div>
                              <p className="text-sm">{rep.label}</p>
                              <p className="text-xs mt-1 opacity-75">Introduce yourself as a {job['Lead Source Detail'] || 'ClearAir'} technician</p>
                            </div>
                          ) : null;
                        })()}

                        {/* Edit Mode */}
                        {editingJobId === job['Lead ID'] ? (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
                            <p className="text-sm font-semibold text-blue-700 mb-3">EDIT JOB DETAILS</p>
                            <div className="grid grid-cols-2 gap-4 mb-3">
                              <div>
                                <label className="text-sm text-slate-600">Service</label>
                                <select
                                  value={editService}
                                  onChange={(e) => setEditService(e.target.value)}
                                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-base bg-white"
                                >
                                  <option value="">Select Service</option>
                                  {services.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-sm text-slate-600">Property Type</label>
                                <select
                                  value={editPropertyType}
                                  onChange={(e) => setEditPropertyType(e.target.value)}
                                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-base bg-white"
                                >
                                  <option value="">Select Type</option>
                                  {propertyTypes.map(pt => (
                                    <option key={pt} value={pt}>{pt}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mb-3">
                              <label className="text-sm text-slate-600">Notes</label>
                              <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-base"
                                rows={3}
                                placeholder="Add notes about the job..."
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveJobEdits(job)}
                                disabled={saving}
                                className="flex-1 bg-[#14b8a6] hover:bg-[#0d9488] disabled:bg-slate-300 text-white py-2 rounded-lg font-medium"
                              >
                                {saving ? 'Saving...' : 'Save Changes'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={saving}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-slate-500">Service</p>
                              <p className="text-base font-medium text-slate-800">{job['Service Requested']}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500">Property Type</p>
                              <p className="text-base font-medium text-slate-800">{job['Property Type'] || '-'}</p>
                            </div>
                          </div>
                        )}

                        {/* Customer Notes - hide when editing */}
                        {job['Customer Issue/Notes'] && editingJobId !== job['Lead ID'] && (
                          <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-sm font-semibold text-slate-500 mb-1">NOTES</p>
                            <p className="text-base text-slate-700">{job['Customer Issue/Notes']}</p>
                            {/* Show View Transcript button for AI Receptionist leads */}
                            {extractCallLogId(job['Customer Issue/Notes']) && (
                              <button
                                onClick={() => fetchTranscript(extractCallLogId(job['Customer Issue/Notes'])!)}
                                disabled={loadingTranscript}
                                className="mt-2 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition disabled:opacity-50"
                              >
                                {loadingTranscript ? (
                                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                )}
                                View Call Transcript
                              </button>
                            )}
                          </div>
                        )}

                        {/* Check In/Out Times */}
                        {(job['Check In'] || job['Check Out']) && (
                          <div className="mt-3 bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-sm text-slate-500">Check In</p>
                              <p className="text-base font-semibold text-slate-700">{job['Check In'] || '-'}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500">Check Out</p>
                              <p className="text-base font-semibold text-slate-700">{job['Check Out'] || '-'}</p>
                            </div>
                          </div>
                        )}

                        {/* Check In & Reschedule Buttons - for SCHEDULED jobs */}
                        {job['Status']?.toUpperCase() === 'SCHEDULED' && (
                          <div className="mt-4 space-y-2">
                            <button
                              onClick={() => handleCheckInOut(job['Lead ID'], 'checkin')}
                              disabled={checkingIn === job['Lead ID']}
                              className="w-full py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                            >
                              {checkingIn === job['Lead ID'] ? (
                                <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full"></div>
                              ) : (
                                <>
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                  </svg>
                                  Check In - Arrived
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => setRescheduleJob(job)}
                              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              Reschedule Appointment
                            </button>
                          </div>
                        )}

                        {/* Action Buttons - for IN PROGRESS jobs */}
                        {job['Status']?.toUpperCase() === 'IN PROGRESS' && (
                          <div className="mt-4 space-y-2">
                            <div className="py-2 px-3 bg-purple-100 text-purple-700 rounded-lg text-sm text-center flex items-center justify-center gap-2">
                              <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                              Job In Progress {job['Check In'] && `(started ${job['Check In']})`}
                            </div>

                            {job['Deposit Amount'] && parseFloat(job['Deposit Amount']) > 0 ? (
                              /* Deposit job — show collect balance / add items */
                              <>
                                <button
                                  onClick={() => setCheckoutJob(job)}
                                  className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
                                >
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  Collect Balance & Close
                                </button>
                                <button
                                  onClick={() => setQuoteJob(job)}
                                  className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
                                >
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  Add Items & Collect Balance
                                </button>
                              </>
                            ) : (
                              /* No deposit — show create estimate / checkout */
                              <>
                                <button
                                  onClick={() => setQuoteJob(job)}
                                  className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
                                >
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Create Estimate / Quote
                                </button>
                                <button
                                  onClick={() => setCheckoutJob(job)}
                                  className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
                                >
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Check Out - Job Complete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Visited Jobs Section */}
            {quotedToday.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Visited Today
                </h3>
                <div className="space-y-2">
                  {quotedToday.map((job, idx) => {
                    const isClearAir = getRepresentingInfo(job).name === 'CLEARAIR';
                    const alreadySentReview = reviewSent.has(job['Lead ID']) || job['Review Requested?']?.toUpperCase() === 'YES';
                    return (
                    <div key={idx} className="bg-white rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-slate-700">{job['Customer Name']}</p>
                        <p className="text-xs text-slate-500">{job['Service Requested']}</p>
                        {job['Total Cost'] && (
                          <p className="text-xs text-amber-600 font-medium mt-1">Quote: ${job['Total Cost']}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <button
                          onClick={() => handleViewPdf(job)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-slate-500 hover:bg-slate-600 text-white transition"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          PDF
                        </button>
                        <button
                          onClick={() => {
                            const isPaid = !!(job['Amount Paid'] && parseFloat(job['Amount Paid']) > 0 && job['Payment Method']);
                            setSendDocType(isPaid || job['Status']?.toUpperCase() === 'CLOSED' ? 'invoice' : 'estimate');
                            setSendDocJob(job);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-[#14b8a6] hover:bg-[#0d9488] text-white transition"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          Send
                        </button>
                        <button
                          onClick={() => setPhotosJob(job)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Photos
                        </button>
                        {isClearAir && (
                          <button
                            onClick={() => handleSendReviewRequest(job)}
                            disabled={sendingReview === job['Lead ID']}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition disabled:opacity-50 ${
                              alreadySentReview
                                ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                                : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                            }`}
                          >
                            {sendingReview === job['Lead ID'] ? (
                              <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            )}
                            {alreadySentReview ? 'Sent' : 'Review'}
                          </button>
                        )}
                        <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-semibold">
                          Quoted
                        </span>
                        <button
                          onClick={async () => {
                            if (!confirm('Revert this job back to Scheduled?')) return;
                            try {
                              await fetch('/api/leads/update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  rowIndex: parseInt(job.rowIndex),
                                  updates: { 'Status': 'SCHEDULED' },
                                }),
                              });
                              fetchLeads();
                            } catch {
                              alert('Failed to update status');
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-600 transition"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          Undo
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Closed Jobs Section */}
            {closedToday.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Closed Today
                </h3>
                <div className="space-y-2">
                  {closedToday.map((job, idx) => {
                    const isClearAir = getRepresentingInfo(job).name === 'CLEARAIR';
                    const alreadySentReview = reviewSent.has(job['Lead ID']) || job['Review Requested?']?.toUpperCase() === 'YES';
                    return (
                    <div key={idx} className="bg-white rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-slate-700">{job['Customer Name']}</p>
                        <p className="text-xs text-slate-500">{job['Service Requested']}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPhotosJob(job)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Photos
                        </button>
                        {isClearAir && (
                          <button
                            onClick={() => handleSendReviewRequest(job)}
                            disabled={sendingReview === job['Lead ID']}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition disabled:opacity-50 ${
                              alreadySentReview
                                ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                                : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                            }`}
                          >
                            {sendingReview === job['Lead ID'] ? (
                              <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            )}
                            {alreadySentReview ? 'Sent' : 'Review'}
                          </button>
                        )}
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                          Closed
                        </span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* History View - Follow-up Jobs */}
        {activeView === 'history' && (
          <div>
            <div className="bg-teal-400 rounded-xl shadow-sm p-4 mb-4">
              <h2 className="text-lg font-semibold text-[#0a2540]">Follow-up Jobs</h2>
              <p className="text-sm text-white">{historyJobs.length} jobs need follow-up</p>
            </div>

            {historyJobs.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <p className="text-slate-500">No job history yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyJobs.map((job, idx) => {
                  const rep = getRepresentingInfo(job);
                  return (
                    <div key={idx} className="bg-teal-50 border border-teal-200 rounded-xl shadow-sm p-4">
                      {/* Company Brand Badge */}
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold mb-2 ${rep.style}`}>
                        <span>{rep.icon}</span>
                        <span>{rep.name}</span>
                      </div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold text-[#0a2540]">{job['Customer Name']}</p>
                          <p className="text-sm text-slate-500">{job['Service Requested']}</p>
                        </div>
                        <div className="text-right">
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-700">
                            Quoted
                          </span>
                          <a
                            href={`tel:${job['Phone Number']}`}
                            className="flex items-center gap-1 text-green-600 hover:text-green-700 text-sm mt-1 justify-end"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {formatPhone(job['Phone Number'])}
                          </a>
                        </div>
                      </div>
                      <div className="text-sm text-slate-600">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Scheduled: {job['Appointment Date']}
                          </span>
                          {job['Quote Amount'] && (
                            <span className="flex items-center gap-1 text-amber-600 font-medium">
                              Quote: ${job['Quote Amount']}
                            </span>
                          )}
                        </div>
                        {job['Follow-up Date'] && (
                          <div className="flex items-center gap-1 mt-1 text-teal-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Follow-up: {job['Follow-up Date']}
                          </div>
                        )}
                      </div>
                      <div className="flex items-end justify-between mt-1">
                        <div className="text-xs text-slate-400">
                          {job['Address']}{job['City'] ? `, ${job['City']}` : ''}
                        </div>
                        <button
                          onClick={() => handleCancelFollowUp(job)}
                          disabled={cancellingFollowUp === job['Lead ID']}
                          className="flex items-center justify-center gap-1 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium transition text-xs disabled:opacity-50 shrink-0"
                        >
                          {cancellingFollowUp === job['Lead ID'] ? (
                            <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0a2540] px-4 py-4 flex justify-around shadow-lg">
        <button
          onClick={() => { setActiveView('schedule'); fetchLeads(); }}
          className={`flex flex-col items-center px-6 py-2 rounded-lg transition ${activeView === 'schedule' ? 'bg-teal-500 text-white' : 'text-slate-300 hover:text-white'}`}
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={`text-xs mt-1 font-medium`}>Schedule</span>
        </button>
        <button
          onClick={() => { setActiveView('history'); fetchLeads(); }}
          className={`flex flex-col items-center px-6 py-2 rounded-lg transition ${activeView === 'history' ? 'bg-teal-500 text-white' : 'text-slate-300 hover:text-white'}`}
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <span className={`text-xs mt-1 font-medium`}>History</span>
        </button>
        <button className="flex flex-col items-center px-6 py-2 rounded-lg text-slate-300 hover:text-white transition">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs mt-1 font-medium">Settings</span>
        </button>
      </div>

      {/* Spacer for bottom nav */}
      <div className="h-20"></div>

      {/* Reschedule Modal */}
      {rescheduleJob && (
        <ScheduleModal
          lead={rescheduleJob}
          onClose={() => setRescheduleJob(null)}
          onSuccess={() => {
            setRescheduleJob(null);
            fetchLeads();
          }}
        />
      )}

      {/* Quote Modal */}
      {quoteJob && (
        <QuoteModal
          lead={quoteJob}
          onClose={() => { setQuoteJob(null); fetchLeads(); }}
          onSuccess={() => { fetchLeads(); }}
        />
      )}

      {/* Checkout Modal */}
      {checkoutJob && (
        <CheckoutModal
          lead={checkoutJob}
          onClose={() => { setCheckoutJob(null); fetchLeads(); }}
          onSuccess={() => { fetchLeads(); }}
          onUpsell={() => { const job = checkoutJob; setCheckoutJob(null); setQuoteJob(job); }}
        />
      )}

      {/* Send Document Modal */}
      {sendDocJob && (
        <SendDocumentModal
          lead={sendDocJob}
          type={sendDocType}
          onClose={() => setSendDocJob(null)}
        />
      )}

      {/* Photos Modal */}
      {photosJob && (
        <PhotosModal
          lead={photosJob}
          onClose={() => setPhotosJob(null)}
        />
      )}

      {/* Add New Service Modal */}
      {addServiceJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAddServiceJob(null)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-blue-500 text-white px-5 py-4">
              <h2 className="text-lg font-semibold">Add New Service</h2>
              <p className="text-blue-100 text-sm">Upsell for {addServiceJob['Customer Name']}</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="text-slate-500 mb-1">Customer Info (will be copied)</p>
                <p className="font-medium">{addServiceJob['Customer Name']}</p>
                <p className="text-slate-600">{addServiceJob['Address']}, {addServiceJob['City']}</p>
                <p className="text-slate-600">{formatPhone(addServiceJob['Phone Number'])}</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <p className="text-amber-700 font-medium flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Lead Source: Repeat Customer
                </p>
                <p className="text-amber-600 text-xs mt-1">Referral company will NOT get credit for this service</p>
              </div>

              <div>
                <label className="block text-slate-600 text-sm font-medium mb-2">Select New Service *</label>
                <select
                  value={selectedNewService}
                  onChange={(e) => setSelectedNewService(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-base"
                >
                  <option value="">Choose a service...</option>
                  {services.filter(s => s !== addServiceJob['Service Requested']).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-5 py-4 bg-slate-50 border-t flex gap-3">
              <button
                onClick={() => {
                  setAddServiceJob(null);
                  setSelectedNewService('');
                }}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNewService}
                disabled={!selectedNewService || addingService}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addingService ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Lead
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transcript Modal */}
      {viewingTranscript && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewingTranscript(null)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-purple-600 text-white px-5 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Call Transcript</h2>
                <p className="text-purple-200 text-sm">{viewingTranscript.id} • {viewingTranscript.timestamp}</p>
              </div>
              <button
                onClick={() => setViewingTranscript(null)}
                className="text-purple-200 hover:text-white transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Call Info */}
            <div className="px-5 py-3 bg-slate-50 border-b grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500">Caller</p>
                <p className="font-medium text-slate-800">{viewingTranscript.customerName || '(unknown)'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Phone</p>
                <a href={`tel:${viewingTranscript.callerPhone?.replace(/\D/g, '')}`} className="font-medium text-teal-600">
                  {viewingTranscript.callerPhone || '-'}
                </a>
              </div>
              <div>
                <p className="text-xs text-slate-500">Service</p>
                <p className="font-medium text-slate-800">{viewingTranscript.service || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Outcome</p>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  viewingTranscript.outcome === 'BOOKED' ? 'bg-emerald-100 text-emerald-700' :
                  viewingTranscript.outcome === 'INQUIRY' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {viewingTranscript.outcome || '-'}
                </span>
              </div>
            </div>

            {/* Transcript */}
            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 220px)' }}>
              <p className="text-sm font-semibold text-slate-500 mb-2">FULL TRANSCRIPT</p>
              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                {viewingTranscript.transcript || '(No transcript available)'}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t">
              <button
                onClick={() => setViewingTranscript(null)}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
