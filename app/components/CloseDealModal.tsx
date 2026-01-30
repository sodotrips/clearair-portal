'use client';

import { useState } from 'react';

interface Lead {
  [key: string]: string;
}

interface CloseDealModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CloseDealModal({ lead, onClose, onSuccess }: CloseDealModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-populate Payment Date with today's date in Houston timezone
  const getTodayHouston = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  };

  // Helper to parse a numeric value from a string (strips $, commas, etc.)
  const parseNum = (val: string) => parseFloat(val.replace(/[^0-9.-]/g, '')) || 0;

  // Editable fields
  const [amountPaid, setAmountPaid] = useState(lead['Amount Paid'] || '');
  const [paymentMethod, setPaymentMethod] = useState(lead['Payment Method'] || '');
  const [paymentDate, setPaymentDate] = useState(lead['Payment Date'] || getTodayHouston());
  const [laborCost, setLaborCost] = useState(lead['Labor Cost'] || '');
  const [materialCost, setMaterialCost] = useState(lead['Material Cost'] || '');
  const [subcontractorCost, setSubcontractorCost] = useState(lead['Subcontractor Cost'] || '');
  const [totalCost, setTotalCost] = useState(lead['Total Cost'] || '');

  // Commission form state
  const [sophiaCommission, setSophiaCommission] = useState(lead['Sophia Commission %'] || '');
  const [amitCommission, setAmitCommission] = useState(lead['Amit Commission %'] || '');
  const [leadCompanyCommission, setLeadCompanyCommission] = useState(lead['Lead Company Commission %'] || '');

  // Auto-calculated: Profit $ = Total Cost - Material Cost - Labor Cost - Subcontractor Cost
  const calculateProfit = () => {
    const total = parseNum(totalCost);
    const material = parseNum(materialCost);
    const labor = parseNum(laborCost);
    const sub = parseNum(subcontractorCost);
    return (total - material - labor - sub).toFixed(2);
  };

  // Auto-calculated: Profit % = (Profit $ / Total Cost) * 100
  const calculateProfitPercent = () => {
    const total = parseNum(totalCost);
    if (total === 0) return '0';
    const profit = parseFloat(calculateProfit());
    return ((profit / total) * 100).toFixed(1);
  };

  // Calculate total commission percentage
  const calculateTotalCommission = () => {
    const sophia = parseNum(sophiaCommission);
    const amit = parseNum(amitCommission);
    const leadCo = parseNum(leadCompanyCommission);
    return sophia + amit + leadCo;
  };

  // Auto-calculated: Commission $ = (Commission % / 100) * Profit $
  const calcCommission$ = (pct: string) => {
    const profit = parseFloat(calculateProfit()) || 0;
    const percent = parseNum(pct);
    return ((percent / 100) * profit).toFixed(2);
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
        'Status': 'CLOSED',
        'Amount Paid': amountPaid,
        'Payment Method': paymentMethod,
        'Payment Date': paymentDate,
        'Labor Cost': laborCost,
        'Material Cost': materialCost,
        'Subcontractor Cost': subcontractorCost,
        'Total Cost': totalCost,
        'Profit $': calculateProfit(),
        'Profit %': calculateProfitPercent(),
        'Sophia Commission %': sophiaCommission,
        'Sophia Commission $': calcCommission$(sophiaCommission),
        'Amit Commission %': amitCommission,
        'Amit Commission $': calcCommission$(amitCommission),
        'Lead Company Commission %': leadCompanyCommission,
        'Lead Company Commission $': calcCommission$(leadCompanyCommission),
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
        setError(result.error || 'Failed to close deal');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition text-sm";
  const numberInputClass = "w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
  const readOnlyClass = "w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 text-sm";
  const labelClass = "block text-slate-700 text-xs font-medium mb-1";

  const profitVal = parseFloat(calculateProfit());

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-emerald-600 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Close Deal</h2>
              <p className="text-emerald-200 text-sm">{lead['Lead ID']} - {lead['Customer Name']}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-emerald-200 hover:text-white transition">
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
            {/* Payment Info */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Payment Information</h3>

              {/* Row 1: Payment Method, Payment Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select...</option>
                    <option value="Cash">Cash</option>
                    <option value="Check">Check</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Zelle">Zelle</option>
                    <option value="Venmo">Venmo</option>
                    <option value="CashApp">CashApp</option>
                    <option value="Financing">Financing</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Payment Date</label>
                  <input
                    type="text"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    placeholder="MM/DD/YYYY"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Row 2: Amount Paid, Total Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Amount Paid (tax included)</label>
                  <input
                    type="text"
                    value={amountPaid}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAmountPaid(val);
                      const paid = parseFloat(val.replace(/[^0-9.-]/g, '')) || 0;
                      if (paid > 0) {
                        setTotalCost((paid / 1.0825).toFixed(2));
                      }
                    }}
                    placeholder="$0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Total Cost (before tax)</label>
                  <input
                    type="text"
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    placeholder="$0.00"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Cost Breakdown</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Labor Cost</label>
                  <input
                    type="text"
                    value={laborCost}
                    onChange={(e) => setLaborCost(e.target.value)}
                    placeholder="$0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Material Cost</label>
                  <input
                    type="text"
                    value={materialCost}
                    onChange={(e) => setMaterialCost(e.target.value)}
                    placeholder="$0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Subcontractor</label>
                  <input
                    type="text"
                    value={subcontractorCost}
                    onChange={(e) => setSubcontractorCost(e.target.value)}
                    placeholder="$0.00"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Profit row */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className={labelClass}>Gross Profit (shared profit)</label>
                  <div className={`${readOnlyClass} font-medium ${profitVal >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    ${calculateProfit()}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Profit %</label>
                  <div className={`${readOnlyClass} font-medium ${profitVal >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {calculateProfitPercent()}%
                  </div>
                </div>
              </div>
            </div>

            {/* Commission Percentages */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
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
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Sophia %</label>
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
                  <label className={labelClass}>Amit %</label>
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
                  <label className={labelClass}>Lead Co %</label>
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
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className={labelClass}>Sophia $</label>
                  <div className={`${readOnlyClass} bg-green-50 text-green-700 font-medium`}>
                    ${calcCommission$(sophiaCommission)}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Amit $</label>
                  <div className={`${readOnlyClass} bg-green-50 text-green-700 font-medium`}>
                    ${calcCommission$(amitCommission)}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Lead Co $</label>
                  <div className={`${readOnlyClass} bg-green-50 text-green-700 font-medium`}>
                    ${calcCommission$(leadCompanyCommission)}
                  </div>
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
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Closing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Close Deal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
