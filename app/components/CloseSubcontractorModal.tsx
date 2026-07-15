'use client';

import { useState } from 'react';
import { AWAITING_PAYMENT_STATUS, normalizeSubName, subColor, UNNAMED_SUB_LABEL } from '@/lib/subcontractors';

interface Lead {
  [key: string]: string;
}

interface CloseSubcontractorModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

// Separate close flow for jobs run by a subcontractor. Deliberately NOT the
// normal Close Deal: the sub collected the money and remitted the tax, so this
// never touches Amount Paid, sales tax, or the sales P&L. It only records how
// the pot (customer price minus materials) is split three ways.
export default function CloseSubcontractorModal({ lead, onClose, onSuccess }: CloseSubcontractorModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getTodayHouston = () =>
    new Date().toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });

  const parseNum = (val: string) => parseFloat((val || '').replace(/[^0-9.-]/g, '')) || 0;

  const [customerPrice, setCustomerPrice] = useState(lead['Sub Customer Price'] || '');
  const [materialCost, setMaterialCost] = useState(lead['Sub Material Cost'] || '');
  const [paymentDate, setPaymentDate] = useState(lead['Payment Date'] || getTodayHouston());
  // Default: the sub already paid us → CLOSED. Uncheck if payment is still pending.
  const [paymentReceived, setPaymentReceived] = useState(
    lead['Status']?.toUpperCase() === AWAITING_PAYMENT_STATUS ? false : true
  );

  // Three-way split — editable, must total 100%. Default: Sub 50 / Sophia 25 / Amit 25.
  const [subPct, setSubPct] = useState(lead['Subcontractor Split %'] || '50');
  const [amitPct, setAmitPct] = useState(lead['Amit Commission %'] || '25');
  const [sophiaPct, setSophiaPct] = useState(lead['Sophia Commission %'] || '25');

  const subName = normalizeSubName(lead['Subcontractor Name']);
  const nameColor = subColor(subName);

  // Money math
  const pot = Math.max(0, parseNum(customerPrice) - parseNum(materialCost));
  const dollarsFor = (pct: string) => (pot * (parseNum(pct) / 100));
  const subDollars = dollarsFor(subPct);
  const amitDollars = dollarsFor(amitPct);
  const sophiaDollars = dollarsFor(sophiaPct);
  const yourIncome = amitDollars + sophiaDollars; // check the sub writes you
  const totalPct = parseNum(subPct) + parseNum(amitPct) + parseNum(sophiaPct);

  const money = (n: number) => `$${n.toFixed(2)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (parseNum(customerPrice) <= 0) {
      setError('Enter the price the customer paid the subcontractor.');
      return;
    }
    if (totalPct !== 100) {
      setError(`The three-way split must total 100%. Current total: ${totalPct}%`);
      return;
    }

    setLoading(true);
    try {
      const updates: Record<string, string> = {
        // Income counts either way (accrual). "Awaiting Payment" just means the
        // sub still owes us — it shows on the Money Owed list until marked paid.
        'Status': paymentReceived ? 'CLOSED' : AWAITING_PAYMENT_STATUS,
        'Sold to Subcontractor?': 'Yes',
        'Sub Completed Date': getTodayHouston(),
        // Payment Date only once the money is actually in hand.
        'Payment Date': paymentReceived ? paymentDate : '',
        // Reference-only columns — never touch the sales P&L
        'Sub Customer Price': parseNum(customerPrice).toFixed(2),
        'Sub Material Cost': parseNum(materialCost).toFixed(2),
        'Subcontractor Split %': String(parseNum(subPct)),
        'Subcontractor Split $': subDollars.toFixed(2),
        'Sub Income $': yourIncome.toFixed(2),
        // Income lines — flow into Net Income (Amit) and the Sophia line, exactly
        // like a regular close, so each person's total income combines both.
        'Amit Commission %': String(parseNum(amitPct)),
        'Amit Commission $': amitDollars.toFixed(2),
        'Sophia Commission %': String(parseNum(sophiaPct)),
        'Sophia Commission $': sophiaDollars.toFixed(2),
        // Explicitly keep this job out of gross sales / sales tax.
        'Amount Paid': '',
      };

      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: lead.rowIndex, updates }),
      });
      const result = await response.json();
      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Failed to close subcontractor job');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition text-sm';
  const numberInputClass = `${inputClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;
  const readOnlyClass = 'w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-sm';
  const labelClass = 'block text-slate-700 text-xs font-medium mb-1';

  // NOTE: this is a plain function called inline ({renderSplitRow(...)}), NOT a
  // React component (<SplitRow/>). Defining a component inside render remounts it
  // on every keystroke, which steals focus after each character typed.
  const renderSplitRow = (
    key: string,
    label: string,
    pct: string,
    setPct: (v: string) => void,
    dollars: number,
    accent?: React.ReactNode,
  ) => (
    <div key={key} className="grid grid-cols-[1fr_80px_110px] gap-2 items-center">
      <span className="text-sm text-slate-700 flex items-center gap-1.5">{accent}{label}</span>
      <input
        type="number" min="0" max="100" step="1" value={pct}
        onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="0" className={numberInputClass}
      />
      <div className={`${readOnlyClass} text-right font-medium`}>{money(dollars)}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header — distinct indigo, clearly NOT the normal green close */}
        <div className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Close Subcontractor Job</h2>
              <p className="text-indigo-200 text-sm">{lead['Lead ID']} — {lead['Customer Name']}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}

          {/* Who ran it */}
          <div className="flex items-center gap-2 mb-4 text-sm">
            <span className="text-slate-500">Subcontractor:</span>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${nameColor.dot}`} />
            <span className="font-medium text-slate-800">{subName || UNNAMED_SUB_LABEL}</span>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
            The subcontractor collected payment and handles the sales tax. This close records income only —
            it does <strong>not</strong> count toward gross sales or sales tax.
          </div>

          <div className="space-y-4">
            {/* The pot */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Job Amount</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Customer Price</label>
                  <input type="text" value={customerPrice} onChange={(e) => setCustomerPrice(e.target.value)} placeholder="$0.00" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Material Cost</label>
                  <input type="text" value={materialCost} onChange={(e) => setMaterialCost(e.target.value)} placeholder="$0.00" className={inputClass} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-sm font-medium text-slate-600">Shared pot (price − materials)</span>
                <span className="text-base font-bold text-slate-800">{money(pot)}</span>
              </div>
            </div>

            {/* Three-way split */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Split</h3>
                <span className={`text-sm font-bold px-2 py-1 rounded ${totalPct === 100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  Total: {totalPct}%
                </span>
              </div>
              <div className="grid grid-cols-[1fr_80px_110px] gap-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                <span>Who</span><span className="text-center">%</span><span className="text-right">Amount</span>
              </div>
              {renderSplitRow('sub', 'Subcontractor (keeps)', subPct, setSubPct, subDollars,
                <span className={`inline-block w-2 h-2 rounded-full ${nameColor.dot}`} />)}
              {renderSplitRow('amit', 'Amit (ClearAir income)', amitPct, setAmitPct, amitDollars)}
              {renderSplitRow('sophia', 'Sophia (income)', sophiaPct, setSophiaPct, sophiaDollars)}
            </div>

            {/* Your take */}
            <div className="border-2 border-indigo-300 bg-indigo-50 rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Check you receive</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Amit + Sophia — booked as income</p>
              </div>
              <span className="text-2xl font-bold text-indigo-700">{money(yourIncome)}</span>
            </div>

            {/* Payment received? — default Yes (closes). Uncheck to hold as Awaiting Payment. */}
            <div className="bg-slate-50 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paymentReceived}
                  onChange={(e) => setPaymentReceived(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-indigo-600"
                />
                <span>
                  <span className="text-sm font-medium text-slate-800">Payment received from subcontractor</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {paymentReceived
                      ? 'Job will be marked CLOSED.'
                      : 'Uncheck: job is held as AWAITING PAYMENT and added to your “Money Owed to Me” list until the check arrives.'}
                  </span>
                </span>
              </label>
            </div>

            {paymentReceived && (
              <div>
                <label className={labelClass}>Payment Date</label>
                <input type="text" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} placeholder="MM/DD/YYYY" className={inputClass} />
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition text-sm">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                paymentReceived ? 'Close Subcontractor Job' : 'Save as Awaiting Payment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
