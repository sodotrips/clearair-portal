'use client';

import { useState } from 'react';

interface Lead {
  [key: string]: string;
}

interface ViewDetailsModalProps {
  lead: Lead;
  onClose: () => void;
  onEdit: () => void;
  onSchedule: () => void;
  onCloseDeal?: () => void;
  onCancel?: () => void;
  onUpdate?: () => void;
}

export default function ViewDetailsModal({ lead, onClose, onEdit, onSchedule, onCloseDeal, onCancel, onUpdate }: ViewDetailsModalProps) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unscheduling, setUnscheduling] = useState(false);
  const [sendingConfirmation, setSendingConfirmation] = useState(false);

  const handleSendConfirmation = async () => {
    if (!confirm(`Send booking confirmation SMS to ${lead['Customer Name']}?`)) return;
    setSendingConfirmation(true);
    try {
      const res = await fetch('/api/sms/send-booking-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead['Lead ID'] }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Confirmation sent to ${data.customer}`);
        onUpdate?.();
      } else {
        alert('Failed to send confirmation: ' + (data.error || 'unknown error'));
      }
    } catch {
      alert('Failed to connect to server');
    } finally {
      setSendingConfirmation(false);
    }
  };

  const handleUnschedule = async () => {
    if (!confirm(`Remove schedule for ${lead['Customer Name']}? They will be moved back to New Leads.`)) return;
    setUnscheduling(true);
    try {
      const res = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: parseInt(String(lead.rowIndex || lead['rowIndex'])),
          updates: {
            'Status': 'NEW',
            'Appointment Date': '',
            'Time Window': '',
            'Assigned To': '',
            'Appointment Confirmed': '',
            'Confirmation Method': '',
            'Confirmation Date/Time': '',
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        onUpdate?.();
        onClose();
      } else {
        alert('Failed to unschedule: ' + (data.error || 'unknown error'));
      }
    } catch {
      alert('Failed to connect to server');
    } finally {
      setUnscheduling(false);
    }
  };

  function extractCallLogId(notes: string): string | null {
    const match = notes?.match(/CALL-\d+/);
    return match ? match[0] : null;
  }

  async function fetchTranscript(callLogId: string) {
    setLoadingTranscript(true);
    try {
      const res = await fetch(`/api/call-logs/transcript?id=${callLogId}`);
      const data = await res.json();
      if (data.success) {
        setTranscript(data.callLog.transcript || '(No transcript available)');
      } else {
        setTranscript('Could not load transcript.');
      }
    } catch {
      setTranscript('Error loading transcript.');
    } finally {
      setLoadingTranscript(false);
    }
  }
  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      return `${month}/${day}/${year}`;
    }
    return dateStr;
  };

  const status = lead['Status']?.toUpperCase() || '';
  const statusStyles: Record<string, string> = {
    'NEW': 'bg-blue-100 text-blue-700',
    'SCHEDULED': 'bg-teal-100 text-teal-700',
    'QUOTED': 'bg-amber-100 text-amber-700',
    'IN PROGRESS': 'bg-purple-100 text-purple-700',
    'CLOSED': 'bg-emerald-100 text-emerald-700',
    'CANCELED': 'bg-slate-100 text-slate-500',
  };

  const priorityStyles: Record<string, string> = {
    'HIGH': 'bg-red-100 text-red-700',
    'MEDIUM': 'bg-amber-100 text-amber-700',
    'LOW': 'bg-green-100 text-green-700',
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-[#0a2540] uppercase tracking-wide mb-3 pb-2 border-b border-slate-200">
        {title}
      </h3>
      {children}
    </div>
  );

  const Field = ({ label, value, isLink, href }: { label: string; value: string; isLink?: boolean; href?: string }) => (
    <div className="mb-2">
      <span className="text-xs text-slate-500 block">{label}</span>
      {isLink && href ? (
        <a href={href} className="text-sm text-[#14b8a6] font-medium hover:underline">{value || ''}</a>
      ) : (
        <span className="text-sm text-slate-800 font-medium">{value || ''}</span>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0a2540] text-white px-6 py-4 flex justify-between items-start flex-shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-semibold">{lead['Customer Name']}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyles[status] || 'bg-slate-100 text-slate-600'}`}>
                {lead['Status'] || ''}
              </span>
            </div>
            <p className="text-slate-400 text-sm">{lead['Lead ID']}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2 flex-shrink-0">
          <a
            href={`tel:${lead['Phone Number']}`}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Call
          </a>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(lead['Address'] + ', ' + lead['City'] + ', TX ' + lead['Zip Code'])}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Navigate
          </a>
          <button
            onClick={() => { onClose(); onSchedule(); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Schedule
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Export
          </button>
          <button
            onClick={() => { onClose(); onEdit(); }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          {status === 'QUOTED' && onCloseDeal && (
            <button
              onClick={() => { onClose(); onCloseDeal(); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Close Deal
            </button>
          )}
          {(status === 'SCHEDULED' || status === 'IN PROGRESS') && (
            <button
              onClick={handleUnschedule}
              disabled={unscheduling}
              className="flex items-center gap-2 px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              title="Remove schedule and move back to New Leads"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l-7 7 7 7M2 12h15" />
              </svg>
              {unscheduling ? 'Unscheduling...' : 'Unschedule'}
            </button>
          )}
          {/* Visual separator between status-changing actions and send-confirmation */}
          {(status === 'SCHEDULED' || status === 'IN PROGRESS') && (
            <div className="w-px bg-slate-300 mx-1 self-stretch" aria-hidden="true" />
          )}
          {(status === 'SCHEDULED' || status === 'IN PROGRESS') && (
            <button
              onClick={handleSendConfirmation}
              disabled={sendingConfirmation}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              title='Send booking confirmation SMS ("Thanks for scheduling...")'
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              {sendingConfirmation ? 'Sending...' : 'Send Confirmation'}
            </button>
          )}
          {/* Visual separator before destructive action */}
          {onCancel && status !== 'CLOSED' && status !== 'CANCELED' && (
            <div className="w-px bg-slate-300 mx-1 self-stretch" aria-hidden="true" />
          )}
          {onCancel && status !== 'CLOSED' && status !== 'CANCELED' && (
            <button
              onClick={() => { onClose(); onCancel(); }}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </button>
          )}
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div>
              <Section title="Customer Information">
                <Field label="Name" value={lead['Customer Name']} />
                <Field
                  label="Phone"
                  value={formatPhone(lead['Phone Number'])}
                  isLink
                  href={`tel:${lead['Phone Number']}`}
                />
                <Field
                  label="Email"
                  value={lead['Email']}
                  isLink
                  href={`mailto:${lead['Email']}`}
                />
                <Field label="Property Type" value={lead['Property Type']} />
                <Field label="Lead Source" value={lead['Lead Source']} />
              </Section>

              <Section title="Location">
                <Field label="Address" value={lead['Address']} />
                <Field label="City" value={lead['City']} />
                <Field label="ZIP Code" value={lead['Zip Code']} />
                <div className="mt-3">
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(lead['Address'] + ', ' + lead['City'] + ', TX ' + lead['Zip Code'])}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#14b8a6] hover:underline flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in Google Maps
                  </a>
                </div>
              </Section>

              <Section title="Access Information">
                <Field label="Gate Code" value={lead['Gate Code']} />
                <Field label="Parking Info" value={lead['Parking Info']} />
                <Field label="Pets" value={lead['Pets']} />
                <Field label="Access Instructions" value={lead['Access Instructions']} />
              </Section>
            </div>

            {/* Right Column */}
            <div>
              <Section title="Service Details">
                <Field label="Service Requested" value={lead['Service Requested']} />
                <Field label="# of Units" value={lead['# of Units']} />
                <Field label="# of Vents" value={lead['# of Vents']} />
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500">Priority:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${priorityStyles[lead['Priority Level']?.toUpperCase()] || 'bg-slate-100 text-slate-600'}`}>
                    {lead['Priority Level'] || 'MEDIUM'}
                  </span>
                </div>
              </Section>

              <Section title="Scheduling">
                <Field label="Assigned To" value={lead['Assigned To']} />
                <Field label="Appointment Date" value={formatDate(lead['Appointment Date'])} />
                <Field label="Time Window" value={lead['Time Window']} />
                <Field label="Follow-up Date" value={formatDate(lead['Follow-up Date'])} />
              </Section>

              <Section title="Notes">
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700">
                  {lead['Customer Issue/Notes'] || 'No notes'}
                </div>
              </Section>

              {/* AI Receptionist Transcript */}
              {extractCallLogId(lead['Customer Issue/Notes']) && (
                <Section title="AI Call Transcript">
                  {transcript ? (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                      {transcript}
                    </div>
                  ) : (
                    <button
                      onClick={() => fetchTranscript(extractCallLogId(lead['Customer Issue/Notes'])!)}
                      disabled={loadingTranscript}
                      className="flex items-center gap-2 px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                    >
                      {loadingTranscript ? (
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                      Load Call Transcript
                    </button>
                  )}
                </Section>
              )}

              <Section title="Timeline">
                <Field label="Created" value={formatDate(lead['Timestamp Received'])} />
                <Field label="Status" value={lead['Status']} />
              </Section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition text-sm"
          >
            Close
          </button>
        </div>
      </div>

      {/* Export Modal */}
      {showExport && (() => {
        const fullAddress = [lead['Address'], lead['City'], 'TX', lead['Zip Code']].filter(Boolean).join(', ');
        const exportText = [
          `${lead['Customer Name'] || ''}${lead['City'] ? ' - ' + lead['City'] : ''}`,
          `📞 ${formatPhone(lead['Phone Number']) || ''}`,
          '',
          `Service: ${lead['Service Requested'] || ''}`,
          '',
          `📍 ${fullAddress}`,
          `⏰ ${formatDate(lead['Appointment Date']) || ''}, ${lead['Time Window'] || ''}`,
          '',
          `Notes: ${lead['Customer Issue/Notes'] || ''}`,
        ].join('\n');

        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
              <div className="bg-[#0a2540] text-white px-5 py-3 flex justify-between items-center">
                <h3 className="font-semibold">Export Job Details</h3>
                <button onClick={() => { setShowExport(false); setCopied(false); }} className="text-slate-400 hover:text-white p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <p className="text-xs text-slate-500 mb-2">Copy this and paste to your technician</p>
                <textarea
                  readOnly
                  value={exportText}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="w-full h-64 p-3 border border-slate-300 rounded-lg text-sm font-mono bg-slate-50 text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-[#14b8a6]"
                />
              </div>
              <div className="px-4 py-3 bg-slate-50 border-t flex justify-end gap-2">
                <button
                  onClick={() => { setShowExport(false); setCopied(false); }}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(exportText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch { /* ignore */ }
                  }}
                  className="px-4 py-2 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
