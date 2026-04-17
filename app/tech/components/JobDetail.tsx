'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTechContext, type Lead } from './TechContext';

const CheckoutModal = dynamic(() => import('../../components/CheckoutModal'), { ssr: false });
const SendDocumentModal = dynamic(() => import('../../components/SendDocumentModal'), { ssr: false });

export default function JobDetail() {
  const { selectedJob, setSelectedJob, activeView, setActiveView, fetchLeads, setEstimateStartStep } = useTechContext();
  const [checkingIn, setCheckingIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showSendDoc, setShowSendDoc] = useState<'estimate' | 'invoice' | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<Record<string, string> | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [sendingReview, setSendingReview] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [editFields, setEditFields] = useState({
    'Customer Name': '',
    'Address': '',
    'City': '',
    'Zip Code': '',
    'Phone Number': '',
    'Email': '',
    'Service Requested': '',
    'Property Type': '',
    'Appointment Date': '',
    'Time Window': '',
    'Check In': '',
    'Check Out': '',
    'Status': '',
    'Lead Source': '',
    'Lead Source Detail': '',
    'Referral Source': '',
    'Customer Issue/Notes': '',
  });

  if (!selectedJob) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">Select a job to view details</p>
        </div>
      </div>
    );
  }

  const job = selectedJob;
  const isCanceled = job['Status']?.toUpperCase() === 'CANCELED' || job['Status']?.toUpperCase() === 'CANCELLED';
  const isFinished = job['Status']?.toUpperCase() === 'CLOSED' || job['Status']?.toUpperCase() === 'COMPLETED' || isCanceled;
  const status = job['Status']?.toUpperCase() || '';
  const hasDeposit = !!(job['Deposit Amount'] && parseFloat(job['Deposit Amount']) > 0);
  const depositAmount = parseFloat(job['Deposit Amount'] || '0');
  const estimateTotal = parseFloat(job['Quote Amount'] || '0');
  const amountPaidNum = parseFloat(job['Amount Paid'] || '0');
  const balanceDue = job['Balance Due'] !== undefined && job['Balance Due'] !== ''
    ? parseFloat(job['Balance Due'])
    : amountPaidNum >= estimateTotal
      ? 0
      : (estimateTotal - depositAmount);
  const isFullyPaid = amountPaidNum > 0 && (balanceDue <= 0 || amountPaidNum >= estimateTotal);
  const showDepositBanner = hasDeposit && !isFullyPaid;

  // Determine current step for progress tracker
  const steps = ['Check In', 'Inspect', 'Estimate', 'Approval', 'Work', 'Payment', 'Invoice', 'Review'];
  const hasCheckedIn = !!job['Check In'];
  const hasEstimate = !!(job['Estimate Number'] || job['Estimate Line Items']);
  const hasApproval = !!(job['Signature URL']);
  const isPaid = !!(job['Amount Paid'] && parseFloat(job['Amount Paid']) > 0);
  const hasInvoice = !!(job['Invoice Number']);
  const hasCheckedOut = !!job['Check Out'];
  const hasReviewSent = job['Review Requested?']?.toUpperCase() === 'YES';

  const getCurrentStep = (): number => {
    if (hasReviewSent) return 8; // All done
    if (hasInvoice && isPaid) return 7; // Review Request
    if (isPaid) return 6; // Send Invoice
    if (hasCheckedOut && isPaid) return 6; // Send Invoice
    if (hasCheckedOut && hasEstimate) return 5; // Payment (work done, needs payment)
    if (hasApproval || hasDeposit) return 4; // Ready to Work (approved, do the job)
    if (hasEstimate) return 3; // Customer Approval
    if (hasCheckedIn || status === 'IN PROGRESS') return 1; // Inspect
    return 0; // Check In
  };

  const currentStep = getCurrentStep();

  const startEditing = () => {
    setEditFields({
      'Customer Name': job['Customer Name'] || '',
      'Address': job['Address'] || '',
      'City': job['City'] || '',
      'Zip Code': job['Zip Code'] || '',
      'Phone Number': job['Phone Number'] || '',
      'Email': job['Email'] || '',
      'Service Requested': job['Service Requested'] || '',
      'Property Type': job['Property Type'] || '',
      'Appointment Date': job['Appointment Date'] || '',
      'Time Window': job['Time Window'] || '',
      'Check In': job['Check In'] || '',
      'Check Out': job['Check Out'] || '',
      'Status': job['Status'] || '',
      'Lead Source': job['Lead Source'] || '',
      'Lead Source Detail': job['Lead Source Detail'] || '',
      'Referral Source': job['Referral Source'] || '',
      'Customer Issue/Notes': job['Customer Issue/Notes'] || '',
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    setLoading(true);
    try {
      await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: parseInt(job.rowIndex),
          updates: editFields,
        }),
      });
      setEditing(false);
      fetchLeads();
    } catch {
      alert('Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  // Extract call log ID from customer notes (e.g. "AI Receptionist (CALL-xxx) - ...")
  const callLogMatch = (job['Customer Issue/Notes'] || '').match(/AI Receptionist \(([^)]+)\)/);
  const callLogId = callLogMatch ? callLogMatch[1] : null;

  const handleViewTranscript = async () => {
    if (!callLogId) return;
    setLoadingTranscript(true);
    try {
      const res = await fetch(`/api/call-logs/transcript?id=${encodeURIComponent(callLogId)}`);
      const data = await res.json();
      if (data.success) {
        setTranscript(data.callLog);
        setShowTranscript(true);
      }
    } catch {
      alert('Failed to load transcript');
    } finally {
      setLoadingTranscript(false);
    }
  };

  const handleRegenerateInvoice = async () => {
    setRegenerating(true);
    try {
      const { lineItems, discount: savedDiscount } = parseSavedEstimate();
      const subtotal = lineItems.reduce((s: number, i: { qty?: number; price?: number }) => s + ((i.qty || 1) * (i.price || 0)), 0);
      const discountedSubtotal = Math.max(0, subtotal - savedDiscount);
      const TAX_RATE = 0.0825;
      const tax = discountedSubtotal * TAX_RATE;
      const total = discountedSubtotal + tax;

      const res = await fetch('/api/documents/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: job['Lead ID'],
          sendVia: 'none',
          invoiceNumber: job['Invoice Number'] || undefined,
          lineItems,
          totals: {
            subtotal, discount: savedDiscount, taxRate: TAX_RATE, tax, total,
            ...(hasDeposit ? { depositAmount, depositMethod: job['Deposit Method'] || '', depositDate: job['Deposit Date'] || '' } : {}),
          },
          isPaid,
          amountPaid: job['Amount Paid'] || '',
          paymentMethod: job['Payment Method'] || '',
          paymentDate: job['Payment Date'] || '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLeads();
      } else {
        console.error('[regen] Failed:', data.error);
      }
    } catch (err) {
      console.error('[regen] Error:', err);
    } finally {
      setRegenerating(false);
    }
  };

  const handleDuplicate = async () => {
    if (!confirm(`Duplicate ${job['Customer Name']} — ${job['Lead ID']}?\n\nThis will create a new lead with the same customer info.`)) return;
    setDuplicating(true);
    try {
      const res = await fetch('/api/leads/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: job['Customer Name'],
          phone: job['Phone Number'],
          email: job['Email'],
          address: job['Address'],
          city: job['City'],
          zip: job['Zip Code'],
          propertyType: job['Property Type'],
          leadSource: job['Lead Source'],
          leadSourceDetail: job['Lead Source Detail'],
          referralSource: job['Referral Source'],
          serviceRequested: job['Service Requested'] || '',
          assignedTo: job['Assigned To'],
          appointmentDate: job['Appointment Date'] || '',
          timeWindow: job['Time Window'] || '',
          customerNotes: `Upsell from ${job['Lead ID']}`,
          accessInstructions: job['Access Instructions'] || '',
          gateCode: job['Gate Code/Special Access'] || '',
          parkingInfo: job['Parking Info'] || '',
          pets: job['Pets?'] || '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`New lead created: ${data.leadId}`);
        fetchLeads();
      } else {
        alert(data.error || 'Failed to create lead');
      }
    } catch {
      alert('Failed to connect to server');
    } finally {
      setDuplicating(false);
    }
  };

  const handleSendReview = async () => {
    if (!confirm(`Send review request to ${job['Customer Name']}?\n\nThis will text them a Google review link.`)) return;
    setSendingReview(true);
    try {
      const res = await fetch('/api/sms/send-review-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: job['Lead ID'] }),
      });
      const data = await res.json();
      if (data.success) {
        // Save review sent date to sheet
        await fetch('/api/leads/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rowIndex: parseInt(job.rowIndex),
            updates: {
              'Review Requested?': 'YES',
              'Review Request Date': new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
            },
          }),
        });
        fetchLeads();
        alert(`Review request sent to ${job['Customer Name']}!`);
      } else {
        alert(data.error || 'Failed to send review request');
      }
    } catch {
      alert('Failed to connect to server');
    } finally {
      setSendingReview(false);
    }
  };

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      const res = await fetch('/api/leads/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: job['Lead ID'], action: 'checkin' }),
      });
      const data = await res.json();
      if (data.success) fetchLeads();
    } catch {
      alert('Failed to check in');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCustomerNotHome = async () => {
    if (!confirm('Mark as Customer Not Home? Job will be set back to NEW for rescheduling.')) return;
    setLoading(true);
    try {
      await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: parseInt(job.rowIndex),
          updates: {
            'Status': 'NEW',
            'Customer Issue/Notes': `${job['Customer Issue/Notes'] ? job['Customer Issue/Notes'] + ' | ' : ''}CUSTOMER NOT HOME - ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}`,
          },
        }),
      });
      setSelectedJob(null);
      fetchLeads();
    } catch {
      alert('Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async (paymentMethod: string, amount: string) => {
    setLoading(true);
    try {
      const checkoutTime = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true });
      const totalPaid = hasDeposit ? (depositAmount + parseFloat(amount)).toFixed(2) : amount;
      await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: parseInt(job.rowIndex),
          updates: {
            'Check Out': checkoutTime,
            'Status': 'QUOTED',
            'Amount Paid': totalPaid,
            'Payment Method': paymentMethod,
            'Quote Amount': hasDeposit ? estimateTotal.toFixed(2) : amount,
            ...(hasDeposit ? { 'Balance Due': '0' } : {}),
          },
        }),
      });
      fetchLeads();
    } catch {
      alert('Failed to check out');
    } finally {
      setLoading(false);
    }
  };

  // Parse saved estimate data (items + discount)
  const parseSavedEstimate = () => {
    const totalAmount = parseFloat(job['Amount Paid'] || job['Quote Amount'] || '0');
    try {
      const parsed = JSON.parse(job['Estimate Line Items'] || '[]');
      const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
      const savedDiscount = Array.isArray(parsed) ? 0 : (parsed.discount || 0);
      return {
        lineItems: items.length > 0 ? items : [{ service: job['Service Requested'] || '', description: '', qty: 1, price: totalAmount }],
        discount: savedDiscount,
      };
    } catch {
      return { lineItems: [{ service: job['Service Requested'] || '', description: '', qty: 1, price: totalAmount }], discount: 0 };
    }
  };

  // Load before photos from Drive URLs for PDF
  const loadPhotosFromDrive = async (): Promise<{ dataUrl: string; name: string }[]> => {
    try {
      const urls = JSON.parse(job['Before Photos URL'] || '[]');
      if (!Array.isArray(urls) || urls.length === 0) return [];
      const photos = await Promise.all(urls.map(async (url: string, i: number) => {
        try {
          // Convert Drive URL to direct download URL
          let directUrl = url;
          const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (fileIdMatch) {
            directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
          } else if (url.includes('id=')) {
            // Already a download link
            directUrl = url;
          }
          const res = await fetch(directUrl);
          if (!res.ok) return null;
          const blob = await res.blob();
          return new Promise<{ dataUrl: string; name: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ dataUrl: reader.result as string, name: `before-${i + 1}.jpg` });
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch { return null; }
      }));
      return photos.filter(Boolean) as { dataUrl: string; name: string }[];
    } catch { return []; }
  };

  // Generate PDF handler
  const handleViewPdf = async () => {
    const isPaidCheck = !!(job['Amount Paid'] && parseFloat(job['Amount Paid']) > 0 && job['Payment Method']);
    const isInvoice = isPaidCheck || status === 'CLOSED' || !!(job['Invoice Number']);
    const { lineItems, discount: savedDiscount } = parseSavedEstimate();
    const subtotal = lineItems.reduce((sum: number, item: { qty?: number; price?: number }) => sum + ((item.qty || 1) * (item.price || 0)), 0);
    const discountedSubtotal = Math.max(0, subtotal - savedDiscount);
    const TAX_RATE = 0.0825;
    const tax = discountedSubtotal * TAX_RATE;
    const total = discountedSubtotal + tax;
    const customer = { name: job['Customer Name'] || '', address: job['Address'] || '', city: job['City'] || '', zip: job['Zip Code'] || '', phone: job['Phone Number'] || '', email: job['Email'] || '' };

    // Load photos from Drive
    const photos = await loadPhotosFromDrive();

    try {
      if (isInvoice) {
        const { generateInvoicePdf } = await import('@/app/lib/generateInvoicePdf');
        const blob = await generateInvoicePdf({
          invoiceNumber: job['Invoice Number'] || 'DRAFT',
          date: job['Payment Date'] || job['Appointment Date'] || new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
          dueDate: job['Appointment Date'] || '',
          leadId: job['Lead ID'],
          customer, lineItems,
          totals: { subtotal, discount: savedDiscount, taxRate: TAX_RATE, tax, total, ...(hasDeposit ? { depositAmount, depositMethod: job['Deposit Method'] || '', depositDate: job['Deposit Date'] || '' } : {}) },
          techNotes: job['Tech Notes'] || '',
          isPaid: isPaidCheck, amountPaid: job['Amount Paid'] || '', paymentMethod: job['Payment Method'] || '', paymentDate: job['Payment Date'] || '',
          photos: photos.length > 0 ? photos : undefined,
        });
        window.open(URL.createObjectURL(blob), '_blank');
      } else {
        const { generateEstimatePdf } = await import('@/app/lib/generateEstimatePdf');
        const blob = await generateEstimatePdf({
          estimateNumber: job['Estimate Number'] || 'DRAFT',
          date: job['Appointment Date'] || new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
          validUntil: '', leadId: job['Lead ID'],
          customer, lineItems,
          totals: { subtotal, discount: savedDiscount, taxRate: TAX_RATE, tax, total },
          techNotes: job['Tech Notes'] || '',
          signatureDataUrl: job['Signature URL'] || undefined,
          photos: photos.length > 0 ? photos : undefined,
        });
        window.open(URL.createObjectURL(blob), '_blank');
      }
    } catch {
      alert('Failed to generate PDF');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header bar */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-3 lg:px-6 py-3 flex justify-between items-center gap-2 z-10">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={editFields['Customer Name']}
              onChange={e => setEditFields(f => ({ ...f, 'Customer Name': e.target.value }))}
              className="text-lg font-bold text-[#0a2540] border-b-2 border-[#14b8a6] focus:outline-none bg-transparent"
            />
          ) : (
            <h2 className="text-lg font-bold text-[#0a2540]">{job['Customer Name']}</h2>
          )}
          <p className="text-sm text-slate-500">
            {job['Lead ID']} — {job['Service Requested']} — <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${
              !job['Lead Source Detail'] || job['Lead Source Detail'].toLowerCase().includes('clearair')
                ? 'bg-teal-100 text-teal-700'
                : 'bg-orange-100 text-orange-700'
            }`}>{job['Lead Source Detail'] || 'ClearAir'}</span>
            {job['Referral Source'] && <span className="text-slate-400"> — {job['Referral Source']}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-1"
          >
            {duplicating ? (
              <div className="animate-spin w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full"></div>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
            Duplicate
          </button>
          {(status === 'CANCELED' || status === 'CANCELLED') ? (
            <span className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg font-semibold">CANCELED</span>
          ) : (
            <select
              defaultValue=""
              onChange={async (e) => {
                const reason = e.target.value;
                if (!reason) return;
                if (!confirm(`Cancel this job?\n\nReason: ${reason}`)) { e.target.value = ''; return; }
                try {
                  await fetch('/api/leads/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      rowIndex: parseInt(job.rowIndex),
                      updates: {
                        'Status': 'CANCELED',
                        'Customer Issue/Notes': `${job['Customer Issue/Notes'] ? job['Customer Issue/Notes'] + ' | ' : ''}CANCELED: ${reason} — ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}`,
                      },
                    }),
                  });
                  fetchLeads();
                  setSelectedJob(null);
                } catch { alert('Failed to cancel'); }
              }}
              className="text-xs bg-red-500 text-white border border-red-500 rounded-lg px-3 py-1 cursor-pointer appearance-none pr-6 font-semibold text-center"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'3\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              <option value="" disabled>Cancel Job?</option>
              <option value="Customer not interested">Not Interested</option>
              <option value="Lost bid to competitor">Lost Bid</option>
              <option value="Customer no-show">No Show</option>
              <option value="Duplicate lead">Duplicate</option>
              <option value="Other">Other</option>
            </select>
          )}
          <button onClick={() => setSelectedJob(null)} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress Tracker */}
      <div className="px-3 lg:px-6 py-4 bg-slate-50 border-b-2 border-slate-300 overflow-visible relative z-20">
        <div className="flex items-center justify-center">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentStep;
            const isCurrent = idx === currentStep;
            const tooltips = [
              'Click Check In when you arrive at the property',
              'Walk through and inspect the property',
              'Create an estimate for the customer',
              'Get customer approval and signature',
              'Complete the work for the customer',
              'Collect payment from the customer',
              'Send invoice/receipt to the customer',
              'Ask customer for a review',
            ];
            return (
              <div key={step} className="flex items-center">
                <div className="flex flex-col items-center w-12 lg:w-16 group relative">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 cursor-help ${
                    isCompleted
                      ? 'bg-[#14b8a6] border-[#14b8a6] text-white'
                      : isCurrent
                        ? 'bg-amber-500 border-[#14b8a6] text-white'
                        : 'bg-white border-slate-300 text-slate-400'
                  }`}>
                    {isCompleted ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${
                    isCompleted ? 'text-[#14b8a6]' : isCurrent ? 'text-amber-600 font-bold' : 'text-slate-400'
                  }`}>{step}</span>
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-[#0a2540] text-white text-[10px] px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-20 shadow-lg">
                    {tooltips[idx]}
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#0a2540] rotate-45"></div>
                  </div>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-4 lg:w-10 h-0.5 mt-[-14px] ${
                    idx < currentStep ? 'bg-[#14b8a6]' : 'bg-slate-300'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-6 pt-6 pb-3 space-y-4">
        {/* Deposit Banner */}
        {showDepositBanner && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-blue-700 font-semibold text-xs flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              DEPOSIT
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="font-semibold text-blue-800">${depositAmount.toFixed(2)} <span className="font-normal text-blue-500">({job['Deposit Method'] || ''})</span></span>
              <span className="text-blue-400">|</span>
              <span className="text-blue-500">Est: <span className="font-semibold text-blue-800">${estimateTotal.toFixed(2)}</span></span>
              <span className="text-blue-400">|</span>
              <span className="text-blue-500">Bal: <span className="font-semibold text-red-600">${balanceDue.toFixed(2)}</span></span>
            </div>
          </div>
        )}

        {/* Job Info Grid */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer Info</p>
            {!editing ? (
              <button onClick={startEditing} className="flex items-center gap-1 text-[#14b8a6] hover:text-[#0d9488] transition p-1 text-xs font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={handleSaveEdit} disabled={loading} className="text-xs bg-[#14b8a6] hover:bg-[#0d9488] text-white px-3 py-1 rounded font-medium transition disabled:opacity-50">
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-600 px-3 py-1 rounded font-medium transition">
                  Cancel
                </button>
              </div>
            )}
          </div>

          {editing ? (
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Customer Name</p>
                  <input value={editFields['Customer Name']} onChange={e => setEditFields(f => ({ ...f, 'Customer Name': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Address</p>
                  <input value={editFields['Address']} onChange={e => setEditFields(f => ({ ...f, 'Address': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">City</p>
                  <input value={editFields['City']} onChange={e => setEditFields(f => ({ ...f, 'City': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Zip Code</p>
                  <input value={editFields['Zip Code']} onChange={e => setEditFields(f => ({ ...f, 'Zip Code': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <input value={editFields['Phone Number']} onChange={e => setEditFields(f => ({ ...f, 'Phone Number': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <input value={editFields['Email']} onChange={e => setEditFields(f => ({ ...f, 'Email': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Service</p>
                  <input value={editFields['Service Requested']} onChange={e => setEditFields(f => ({ ...f, 'Service Requested': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Property Type</p>
                  <input value={editFields['Property Type']} onChange={e => setEditFields(f => ({ ...f, 'Property Type': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Service Date</p>
                  <input type="date" value={editFields['Appointment Date']} onChange={e => setEditFields(f => ({ ...f, 'Appointment Date': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Time Window</p>
                  <input value={editFields['Time Window']} onChange={e => setEditFields(f => ({ ...f, 'Time Window': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" placeholder="e.g. 9am-12pm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-slate-500">Check In</p>
                    <input value={editFields['Check In']} onChange={e => setEditFields(f => ({ ...f, 'Check In': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" placeholder="e.g. 9:30 AM" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Check Out</p>
                    <input value={editFields['Check Out']} onChange={e => setEditFields(f => ({ ...f, 'Check Out': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" placeholder="e.g. 11:45 AM" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <select
                    value={editFields['Status']}
                    onChange={e => setEditFields(f => ({ ...f, 'Status': e.target.value }))}
                    className="w-full text-sm border border-slate-300 rounded px-2 py-1"
                  >
                    {['NEW', 'SCHEDULED', 'IN PROGRESS', 'QUOTED', 'COMPLETED', 'CLOSED', 'CANCELED'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Customer Notes</p>
                  <textarea value={editFields['Customer Issue/Notes']} onChange={e => setEditFields(f => ({ ...f, 'Customer Issue/Notes': e.target.value }))} rows={3} className="w-full text-sm border border-slate-300 rounded px-2 py-1 resize-none" />
                </div>
              </div>
              {/* Column 4 */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Lead Source</p>
                  <input value={editFields['Lead Source']} onChange={e => setEditFields(f => ({ ...f, 'Lead Source': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Lead Company</p>
                  <input value={editFields['Lead Source Detail']} onChange={e => setEditFields(f => ({ ...f, 'Lead Source Detail': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Referral</p>
                  <input value={editFields['Referral Source']} onChange={e => setEditFields(f => ({ ...f, 'Referral Source': e.target.value }))} className="w-full text-sm border border-slate-300 rounded px-2 py-1" />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {/* Column 1 */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Address</p>
                  <p className="text-sm font-medium">{job['Address']}, {job['City']}, TX {job['Zip Code']}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <a href={`tel:${job['Phone Number']}`} className="text-sm font-medium text-[#14b8a6]">{job['Phone Number']}</a>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="text-sm font-medium">{job['Email'] || '-'}</p>
                </div>
              </div>
              {/* Column 2 */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Service</p>
                  <p className="text-sm font-medium">{job['Service Requested']}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Service Date</p>
                  <p className="text-sm font-medium">{job['Appointment Date'] || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Time Window</p>
                  <p className="text-sm font-medium">{job['Time Window'] || '-'}</p>
                </div>
              </div>
              {/* Column 3 */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="text-sm font-medium">{status}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Property Type</p>
                  <p className="text-sm font-medium">{job['Property Type'] || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Check In / Out</p>
                  <p className="text-sm font-medium">{job['Check In'] || '-'} — {job['Check Out'] || '-'}</p>
                </div>
              </div>
              {/* Column 4 */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Lead Source</p>
                  <p className="text-sm font-medium">{job['Lead Source'] || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Lead Company</p>
                  <p className="text-sm font-medium">{job['Lead Source Detail'] || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Referral</p>
                  <p className="text-sm font-medium">{job['Referral Source'] || '-'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <a
            href={`tel:${job['Phone Number']}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-[#14b8a6] rounded-lg text-xs font-medium transition shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Call
          </a>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(job['Address'] + ', ' + job['City'] + ', TX ' + job['Zip Code'])}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-[#14b8a6] rounded-lg text-xs font-medium transition shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Navigate
          </a>
        </div>

        {/* Notes — side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-400 h-[100px] flex flex-col">
              <p className="text-xs font-semibold text-slate-500 mb-1 flex-shrink-0">CUSTOMER NOTES</p>
              <p className="text-sm text-slate-700 overflow-y-auto flex-1">{job['Customer Issue/Notes'] || '-'}</p>
            </div>
            {callLogId && (
              <button
                onClick={handleViewTranscript}
                disabled={loadingTranscript}
                className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[#14b8a6] hover:text-[#0d9488] font-medium transition disabled:opacity-50"
              >
                {loadingTranscript ? (
                  <div className="animate-spin w-3 h-3 border-2 border-[#14b8a6] border-t-transparent rounded-full"></div>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
                View AI Transcript
              </button>
            )}
          </div>
          <div className="bg-amber-50 rounded-lg p-3 border border-slate-400 h-[100px] flex flex-col">
            <p className="text-xs font-semibold text-amber-700 mb-1 flex-shrink-0">TECH NOTES</p>
            <p className="text-sm text-amber-800 overflow-y-auto flex-1">{job['Tech Notes'] || '-'}</p>
          </div>
        </div>
      </div>

      <div className="border-t-2 border-slate-300"></div>

      {/* Action Buttons — full width toolbar */}
      <div className="flex border-b-2 border-slate-300">
          {/* Check In */}
          <button
            onClick={handleCheckIn}
            disabled={checkingIn || isFinished}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 font-medium transition text-sm border-r border-[#0d9488] disabled:opacity-40 disabled:cursor-not-allowed ${isFinished ? 'bg-slate-300 text-slate-500' : 'bg-[#14b8a6] hover:bg-[#0d9488] text-white'}`}
          >
            {checkingIn ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Check In
              </>
            )}
          </button>
          {/* Estimate */}
          <button
            onClick={() => !isFinished && setActiveView('estimate')}
            disabled={isFinished}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 font-medium transition text-sm border-r border-[#0d9488] disabled:opacity-40 disabled:cursor-not-allowed ${isFinished ? 'bg-slate-300 text-slate-500' : 'bg-[#14b8a6] hover:bg-[#0d9488] text-white'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Estimate
          </button>
          {/* Photos */}
          <button
            onClick={() => !isFinished && setActiveView('photos')}
            disabled={isFinished}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 font-medium transition text-sm border-r border-[#0d9488] disabled:opacity-40 disabled:cursor-not-allowed ${isFinished ? 'bg-slate-300 text-slate-500' : 'bg-[#14b8a6] hover:bg-[#0d9488] text-white'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
            Photos
          </button>
          {/* Payment */}
          <button
            onClick={() => !isFinished && setShowCheckout(true)}
            disabled={isFinished}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 font-medium transition text-sm border-r border-[#0d9488] disabled:opacity-40 disabled:cursor-not-allowed ${isFinished ? 'bg-slate-300 text-slate-500' : 'bg-[#14b8a6] hover:bg-[#0d9488] text-white'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Payment
          </button>
          {/* Review */}
          <button
            onClick={handleSendReview}
            disabled={sendingReview || isCanceled}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 font-medium transition text-sm disabled:opacity-40 disabled:cursor-not-allowed ${isCanceled ? 'bg-slate-300 text-slate-500' : 'bg-[#14b8a6] hover:bg-[#0d9488] text-white'}`}
          >
            {sendingReview ? (
              <div className="animate-spin w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full"></div>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                Review
              </>
            )}
          </button>
      </div>

      {/* Tracking Cards */}
      <div className="p-6 grid grid-cols-3 gap-4">
        {/* Estimate Card */}
        <div className={`rounded-lg border overflow-hidden ${hasEstimate ? 'border-[#14b8a6] bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
          {/* Card Header */}
          <div className={`px-4 py-2 flex items-center justify-between ${hasEstimate ? 'bg-blue-50 border-b border-blue-100' : 'bg-slate-50'}`}>
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 ${hasEstimate ? 'text-blue-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-bold text-slate-800">Estimate</span>
              <span className="text-slate-300">—</span>
              {hasEstimate ? (
                hasApproval ? (
                  <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">APPROVED</span>
                ) : job['Estimate Link'] ? (
                  <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">SENT</span>
                ) : (
                  <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">CREATED</span>
                )
              ) : (
                <span className="text-[10px] font-semibold bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">NONE</span>
              )}
            </div>
          </div>
          {/* Card Body */}
          <div className="px-4 py-3">
            {hasEstimate ? (
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-xl font-bold text-slate-800">${estimateTotal.toFixed(2)}</p>
                  <p className="text-xs text-slate-500 font-medium">{job['Estimate Number'] || ''}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (job['Estimate Link']) {
                        const pdfUrl = `/api/documents/view-pdf?url=${encodeURIComponent(job['Estimate Link'])}`;
                        const isPWA = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
                        if (isPWA) {
                          window.location.href = pdfUrl;
                        } else {
                          window.open(pdfUrl, '_blank');
                        }
                      } else {
                        handleViewPdf();
                      }
                    }}
                    className="flex-1 text-xs py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded font-medium transition text-center flex items-center justify-center gap-1 min-h-[36px]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View Estimate
                  </button>
                  <button
                    onClick={() => setActiveView('estimate')}
                    className="flex-1 text-xs py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded font-medium transition text-center min-h-[36px]"
                  >
                    Edit
                  </button>
                  {!hasApproval && (
                    <button
                      onClick={() => { setEstimateStartStep('review'); setActiveView('estimate'); }}
                      className="flex-1 text-[11px] py-1.5 bg-green-500 hover:bg-green-600 text-white rounded font-medium transition text-center"
                    >
                      Approve
                    </button>
                  )}
                  <button
                    onClick={() => setShowSendDoc('estimate')}
                    className="flex-1 text-[11px] py-1.5 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded font-medium transition text-center"
                  >
                    {job['Estimate Link'] ? 'Resend' : 'Send'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-xs text-slate-400 mb-2">No estimate yet</p>
                <button
                  onClick={() => setActiveView('estimate')}
                  className="text-xs text-[#14b8a6] hover:text-[#0d9488] font-semibold"
                >
                  + Create Estimate
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Invoice Card */}
        <div className={`rounded-lg border overflow-hidden ${hasInvoice ? 'border-[#14b8a6] bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
          <div className={`px-4 py-2 flex items-center justify-between ${hasInvoice ? 'bg-blue-50 border-b border-blue-100' : 'bg-slate-50'}`}>
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 ${hasInvoice ? 'text-blue-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-bold text-slate-800">Invoice</span>
              <span className="text-slate-300">—</span>
              {hasInvoice ? (
                isPaid ? (
                  <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">PAID</span>
                ) : job['Invoice Link'] ? (
                  <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">SENT</span>
                ) : (
                  <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">PENDING</span>
                )
              ) : (
                <span className="text-[10px] font-semibold bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">NONE</span>
              )}
            </div>
            {hasInvoice && !isPaid && (
              <select
                defaultValue=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'deposit') { setEstimateStartStep('deposit'); setActiveView('estimate'); }
                  if (val === 'payment') setShowCheckout(true);
                  e.target.value = '';
                }}
                className="text-xs font-semibold bg-[#14b8a6] text-white px-3 py-1 rounded-full cursor-pointer appearance-none pr-6"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'3\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
              >
                <option value="" disabled>Payment</option>
                {!showDepositBanner && <option value="deposit">Collect Deposit</option>}
                <option value="payment">{showDepositBanner ? 'Collect Balance' : 'Full Payment'}</option>
              </select>
            )}
          </div>
          <div className="px-4 py-3">
            {hasInvoice ? (
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-xl font-bold text-slate-800">${(estimateTotal || parseFloat(job['Amount Paid'] || '0')).toFixed(2)}</p>
                  <p className="text-xs text-slate-500 font-medium">{job['Invoice Number']}</p>
                </div>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (job['Invoice Link']) {
                        const pdfUrl = `/api/documents/view-pdf?url=${encodeURIComponent(job['Invoice Link'])}`;
                        const isPWA = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
                        if (isPWA) {
                          window.location.href = pdfUrl;
                        } else {
                          window.open(pdfUrl, '_blank');
                        }
                      } else {
                        handleViewPdf();
                      }
                    }}
                    className="flex-1 text-xs py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded font-medium transition text-center flex items-center justify-center gap-1 min-h-[36px]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View Invoice
                  </button>
                  <button
                    onClick={handleRegenerateInvoice}
                    disabled={regenerating}
                    className="flex-1 text-[11px] py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition text-center flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {regenerating ? (
                      <div className="animate-spin w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full"></div>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    Regen
                  </button>
                  <button
                    onClick={() => setShowSendDoc('invoice')}
                    className="flex-1 text-[11px] py-1.5 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded font-medium transition text-center"
                  >
                    {job['Invoice Link'] ? 'Resend' : 'Send'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-xs text-slate-400">No invoice yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Card */}
        <div className={`rounded-lg border overflow-hidden ${isFullyPaid ? 'border-[#14b8a6] bg-white' : (hasDeposit && balanceDue > 0) ? 'border-red-300 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
          <div className={`px-4 py-2 flex items-center justify-between ${isFullyPaid ? 'bg-green-50 border-b border-green-100' : (hasDeposit && balanceDue > 0) ? 'bg-red-50 border-b border-red-200' : 'bg-slate-50'}`}>
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 ${isPaid ? 'text-green-600' : hasDeposit ? 'text-teal-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="text-sm font-bold text-slate-800">Payment</span>
            </div>
            {isPaid ? (
              <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">PAID</span>
            ) : hasDeposit ? (
              <span className="text-[10px] font-semibold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">DEPOSIT</span>
            ) : (
              <span className="text-[10px] font-semibold bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">UNPAID</span>
            )}
          </div>
          <div className="px-4 py-3">
            {isPaid ? (
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-xs text-slate-500">Amount Paid</p>
                  <p className="text-lg font-bold text-green-700">${job['Amount Paid']}</p>
                </div>
                <p className="text-[10px] text-slate-400 mb-1 ml-3">{job['Payment Method']}{job['Payment Date'] ? ` • ${job['Payment Date']}` : ''}</p>
                {hasDeposit && (
                  <p className="text-[10px] text-slate-400 mb-1">Includes ${depositAmount.toFixed(2)} deposit</p>
                )}
                <div className="flex items-baseline justify-between">
                  <p className="text-xs text-slate-500">Balance Due</p>
                  <p className="text-sm font-bold text-green-600">$0.00</p>
                </div>
              </div>
            ) : hasDeposit ? (
              <div className="cursor-pointer" onClick={() => setShowCheckout(true)}>
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-xs text-slate-500">Deposit</p>
                  <p className="text-sm font-bold text-teal-700">${depositAmount.toFixed(2)}</p>
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-xs text-slate-500">Balance Due</p>
                  <p className="text-sm font-bold text-red-600">${balanceDue.toFixed(2)}</p>
                </div>
                <p className="text-[10px] text-slate-400 mb-2">{job['Deposit Method']} {job['Deposit Date'] && `• ${job['Deposit Date']}`}</p>
                <button className="w-full text-[11px] py-1.5 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded font-medium transition">
                  Collect Balance
                </button>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-xs text-slate-400 mb-2">No payment yet</p>
                <button
                  onClick={() => setShowCheckout(true)}
                  className="text-xs text-[#14b8a6] hover:text-[#0d9488] font-semibold"
                >
                  + Collect Payment
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Send Document Modal */}
      {showSendDoc && (
        <SendDocumentModal
          lead={job}
          type={showSendDoc}
          onClose={() => setShowSendDoc(null)}
          onSuccess={() => { setShowSendDoc(null); fetchLeads(); }}
          lineItems={(() => { try { const p = JSON.parse(job['Estimate Line Items'] || '[]'); return Array.isArray(p) ? p : (p.items || []); } catch { return []; } })()}
          totals={(() => {
            const items = (() => { try { const p = JSON.parse(job['Estimate Line Items'] || '[]'); return Array.isArray(p) ? p : (p.items || []); } catch { return []; } })();
            const subtotal = items.reduce((s: number, i: { qty?: number; price?: number }) => s + ((i.qty || 1) * (i.price || 0)), 0);
            const tax = subtotal * 0.0825;
            return { subtotal, discount: 0, taxRate: 0.0825, tax, total: subtotal + tax };
          })()}
          isPaid={isPaid}
          amountPaid={job['Amount Paid'] || ''}
          paymentMethod={job['Payment Method'] || ''}
          techNotes={job['Tech Notes'] || ''}
        />
      )}

      {/* Checkout/Payment Modal */}
      {showCheckout && (
        <CheckoutModal
          lead={job}
          onClose={() => setShowCheckout(false)}
          onSuccess={() => { setShowCheckout(false); fetchLeads(); }}
          onUpsell={() => { setShowCheckout(false); setActiveView('estimate'); }}
        />
      )}

      {/* Transcript Modal */}
      {showTranscript && transcript && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setShowTranscript(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-[#0a2540] text-white px-5 py-3 flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-semibold">AI Call Transcript</h3>
                <p className="text-xs text-slate-400">{transcript.customerName} — {transcript.timestamp}</p>
              </div>
              <button onClick={() => setShowTranscript(false)} className="text-slate-400 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-3 flex-shrink-0 border-b border-slate-200">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="font-medium">{transcript.callerPhone}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Service</p>
                  <p className="font-medium">{transcript.service}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Outcome</p>
                  <p className="font-medium">{transcript.outcome}</p>
                </div>
              </div>
            </div>
            {transcript.recordingUrl && (
              <div className="px-4 pt-3 pb-2 border-b border-slate-200 flex-shrink-0">
                <p className="text-xs font-semibold text-slate-500 mb-2">CALL RECORDING</p>
                <audio controls preload="metadata" src={transcript.recordingUrl} className="w-full" />
              </div>
            )}
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-xs font-semibold text-slate-500 mb-2">FULL TRANSCRIPT</p>
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{transcript.transcript || 'No transcript available'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
