'use client';

import { useState } from 'react';

interface Lead {
  [key: string]: string;
}

interface CheckoutModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CheckoutModal({ lead, onClose, onSuccess }: CheckoutModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobClosed, setJobClosed] = useState<boolean | null>(null); // null = not selected yet

  // Fields for quoted (not closed)
  const [estimateNumber, setEstimateNumber] = useState('');
  const [estimateAmount, setEstimateAmount] = useState('');

  // Fields for closed (payment collected)
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [totalPaid, setTotalPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [laborCost, setLaborCost] = useState('');
  const [materialCost, setMaterialCost] = useState('');
  const [subcontractorCost, setSubcontractorCost] = useState('');

  const paymentMethods = ['Cash', 'Zelle', 'Credit Card', 'Check', 'Venmo', 'Other'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Get current timestamp for checkout
      const now = new Date();
      const checkoutTime = now.toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const updates: Record<string, string> = {
        'Check Out': checkoutTime,
      };

      if (jobClosed) {
        // Job closed - payment collected (stays QUOTED for dispatcher to finalize commissions)
        updates['Status'] = 'QUOTED';
        updates['Invoice Number'] = invoiceNumber;  // Column CC
        updates['Amount Paid'] = totalPaid;
        updates['Payment Method'] = paymentMethod;
        updates['Quote Amount'] = totalPaid;  // Column AP - same as Amount Paid
        if (laborCost) updates['Labor Cost'] = laborCost;
        if (materialCost) updates['Materials Cost'] = materialCost;
        if (subcontractorCost) updates['Subcontractor Cost'] = subcontractorCost;
      } else {
        // Job quoted - no payment yet
        updates['Status'] = 'QUOTED';
        updates['Estimate Number'] = estimateNumber;  // Column AQ
        updates['Quote Amount'] = estimateAmount;      // Column AP
      }

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
        setError(result.error || 'Failed to checkout');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-base";
  const labelClass = "block text-slate-700 text-sm font-medium mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#0a2540] text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">Check Out</h2>
            <p className="text-slate-400 text-sm">{lead['Customer Name']} - {lead['Lead ID']}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>
          )}

          {/* Job Summary */}
          <div className="bg-slate-50 p-3 rounded-lg text-sm mb-5">
            <p><span className="font-medium">Service:</span> {lead['Service Requested']}</p>
            <p><span className="font-medium">Address:</span> {lead['Address']}, {lead['City']}</p>
            {lead['Check In'] && <p><span className="font-medium">Checked In:</span> {lead['Check In']}</p>}
          </div>

          {/* Step 1: Did you close the job? */}
          {jobClosed === null ? (
            <div className="space-y-3">
              <p className="text-center text-slate-700 font-medium mb-4">Did you close this job?</p>
              <button
                onClick={() => setJobClosed(true)}
                className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Yes - Payment Collected
              </button>
              <button
                onClick={() => setJobClosed(false)}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                No - Estimate Only
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Back button */}
              <button
                type="button"
                onClick={() => setJobClosed(null)}
                className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-1 mb-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              {jobClosed ? (
                /* CLOSED - Payment collected fields */
                <>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                    <p className="text-green-700 font-medium flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Job Closed - Enter Payment Details
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>Invoice # <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="e.g., INV-001234"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Total Customer Paid <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={totalPaid}
                        onChange={(e) => setTotalPaid(e.target.value)}
                        placeholder="0.00"
                        required
                        className={`${inputClass} pl-8`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Payment Method <span className="text-red-500">*</span></label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      required
                      className={inputClass}
                    >
                      <option value="">Select payment method...</option>
                      {paymentMethods.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>

                  {/* Cost Breakdown (optional) */}
                  <div className="border-t border-slate-200 pt-4 mt-2">
                    <p className="text-xs text-slate-500 mb-3">Cost Breakdown (optional)</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Labor $</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={laborCost}
                            onChange={(e) => setLaborCost(e.target.value)}
                            placeholder="0"
                            className={`${inputClass} pl-7 text-sm`}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Material $</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={materialCost}
                            onChange={(e) => setMaterialCost(e.target.value)}
                            placeholder="0"
                            className={`${inputClass} pl-7 text-sm`}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Subcon $</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={subcontractorCost}
                            onChange={(e) => setSubcontractorCost(e.target.value)}
                            placeholder="0"
                            className={`${inputClass} pl-7 text-sm`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* QUOTED - Estimate only fields */
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <p className="text-amber-700 font-medium flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Estimate Only - Enter Quote Details
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>Estimate # <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={estimateNumber}
                      onChange={(e) => setEstimateNumber(e.target.value)}
                      placeholder="e.g., EST-001234"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Estimate Amount <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={estimateAmount}
                        onChange={(e) => setEstimateAmount(e.target.value)}
                        placeholder="0.00"
                        required
                        className={`${inputClass} pl-8`}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-4 ${jobClosed ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'} text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition disabled:opacity-50`}
                >
                  {loading ? (
                    <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {jobClosed ? 'Complete & Close Job' : 'Save Estimate & Check Out'}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
