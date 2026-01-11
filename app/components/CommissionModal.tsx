'use client';

import { useState } from 'react';

interface Lead {
  [key: string]: string;
}

interface CommissionModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CommissionModal({ lead, onClose, onSuccess }: CommissionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Financial form state
  const [amountPaid, setAmountPaid] = useState(lead['Amount Paid'] || '');
  const [totalCost, setTotalCost] = useState(lead['Total Cost'] || '');

  // Calculate profit automatically
  const calculateProfit = () => {
    const paid = parseFloat(amountPaid.replace(/[^0-9.-]/g, '')) || 0;
    const cost = parseFloat(totalCost.replace(/[^0-9.-]/g, '')) || 0;
    const profit = paid - cost;
    return profit.toFixed(2);
  };

  // Commission form state
  const [sophiaCommission, setSophiaCommission] = useState(lead['Sophia Commission %'] || '');
  const [amitCommission, setAmitCommission] = useState(lead['Amit Commission %'] || '');
  const [leadCompanyCommission, setLeadCompanyCommission] = useState(lead['Lead Company Commission %'] || '');

  // Calculate total commission percentage
  const calculateTotalCommission = () => {
    const sophia = parseFloat(sophiaCommission.replace(/[^0-9.-]/g, '')) || 0;
    const amit = parseFloat(amitCommission.replace(/[^0-9.-]/g, '')) || 0;
    const leadCo = parseFloat(leadCompanyCommission.replace(/[^0-9.-]/g, '')) || 0;
    return sophia + amit + leadCo;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate commission totals to 100%
    const totalCommission = calculateTotalCommission();
    if (totalCommission !== 100) {
      setError(`Total commission must add up to 100%. Current total: ${totalCommission}%`);
      return;
    }

    setLoading(true);

    try {
      const updates: Record<string, string> = {
        'Amount Paid': amountPaid,
        'Total Cost': totalCost,
        'Profit $': calculateProfit(),
        'Sophia Commission %': sophiaCommission,
        'Amit Commission %': amitCommission,
        'Lead Company Commission %': leadCompanyCommission,
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
        setError(result.error || 'Failed to update commission');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm";
  const numberInputClass = "w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
  const readOnlyClass = "w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 text-sm";
  const labelClass = "block text-slate-700 text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-purple-600 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Adjust Commission</h2>
              <p className="text-purple-200 text-sm">{lead['Lead ID']}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>
          )}

          <div className="space-y-4">
            {/* Lead Info */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Lead Information</h3>
              <div>
                <label className={labelClass}>Customer Name</label>
                <div className={readOnlyClass}>{lead['Customer Name'] || ''}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Lead Source</label>
                  <div className={readOnlyClass}>{lead['Lead Source'] || ''}</div>
                </div>
                <div>
                  <label className={labelClass}>Referral Source</label>
                  <div className={readOnlyClass}>{lead['Referral Source'] || ''}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div>
                  <label className={labelClass}>Amount Paid</label>
                  <input
                    type="text"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="$0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Total Material Cost</label>
                  <input
                    type="text"
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    placeholder="$0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Profit $</label>
                  <div className={`${readOnlyClass} bg-green-50 text-green-700 font-medium`}>
                    ${calculateProfit()}
                  </div>
                </div>
              </div>
            </div>

            {/* Editable Commission Fields */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Commission Percentages
                </h3>
                <span className={`text-sm font-bold px-2 py-1 rounded ${
                  calculateTotalCommission() === 100
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  Total: {calculateTotalCommission()}%
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Sophia Commission %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={sophiaCommission}
                    onChange={(e) => setSophiaCommission(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    className={numberInputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Amit Commission %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={amitCommission}
                    onChange={(e) => setAmitCommission(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    className={numberInputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Lead Company Commission %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={leadCompanyCommission}
                    onChange={(e) => setLeadCompanyCommission(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    className={numberInputClass}
                  />
                </div>
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
              className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Commission
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
