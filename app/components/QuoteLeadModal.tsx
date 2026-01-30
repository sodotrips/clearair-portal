'use client';

import { useState } from 'react';

interface Lead {
  [key: string]: string;
}

interface QuoteLeadModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

export default function QuoteLeadModal({ lead, onClose, onSuccess }: QuoteLeadModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [quoteAmount, setQuoteAmount] = useState(lead['Quote Amount'] || '');
  const [quoteValidUntil, setQuoteValidUntil] = useState(lead['Quote Valid Until'] || '');
  const [techNotes, setTechNotes] = useState(lead['Tech Notes'] || '');
  const [issuesFound, setIssuesFound] = useState(lead['Issues Found'] || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const updates: Record<string, string> = {
        'Status': 'QUOTED',
        'Quote Amount': quoteAmount,
        'Quote Valid Until': quoteValidUntil,
        'Tech Notes': techNotes,
        'Issues Found': issuesFound,
      };

      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: lead.rowIndex,
          updates,
        }),
      });

      const result = await response.json();

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Failed to update quote');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition text-sm";
  const labelClass = "block text-slate-700 text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-amber-500 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Mark as Quoted</h2>
              <p className="text-amber-100 text-sm">{lead['Lead ID']} - {lead['Customer Name']}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-amber-100 hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>
          )}

          <div className="space-y-4">
            {/* Quote Details */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Quote Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Quote Amount</label>
                  <input
                    type="text"
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    placeholder="$0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Quote Valid Until</label>
                  <input
                    type="text"
                    value={quoteValidUntil}
                    onChange={(e) => setQuoteValidUntil(e.target.value)}
                    placeholder="MM/DD/YYYY"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Tech Feedback */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Tech Feedback</h3>
              <div>
                <label className={labelClass}>Issues Found</label>
                <textarea
                  value={issuesFound}
                  onChange={(e) => setIssuesFound(e.target.value)}
                  placeholder="Describe any issues found during inspection..."
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Tech Notes</label>
                <textarea
                  value={techNotes}
                  onChange={(e) => setTechNotes(e.target.value)}
                  placeholder="Additional technician notes..."
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Mark as Quoted
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
