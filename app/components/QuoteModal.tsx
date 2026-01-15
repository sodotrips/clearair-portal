'use client';

import { useState } from 'react';
import SignaturePad from './SignaturePad';

interface Lead {
  [key: string]: string;
}

interface QuoteModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

interface LineItem {
  id: string;
  service: string;
  description: string;
  price: number;
}

const SERVICE_PRICES: Record<string, number> = {
  'Air Duct Cleaning': 299,
  'Dryer Vent Cleaning': 129,
  'Attic Insulation': 1500,
  'Duct Replacement': 2500,
  'Chimney Services': 199,
  'Additional Vent': 15,
  'Sanitization': 99,
  'UV Light Installation': 399,
};

export default function QuoteModal({ lead, onClose, onSuccess }: QuoteModalProps) {
  const [step, setStep] = useState<'quote' | 'signature' | 'payment'>('quote');
  const [lineItems, setLineItems] = useState<LineItem[]>(() => {
    // Pre-populate with the service from the lead
    const initialService = lead['Service Requested'] || '';
    if (initialService && SERVICE_PRICES[initialService]) {
      return [{
        id: '1',
        service: initialService,
        description: '',
        price: SERVICE_PRICES[initialService],
      }];
    }
    return [];
  });
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureTimestamp, setSignatureTimestamp] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quoteApproved, setQuoteApproved] = useState(false);
  const [discount, setDiscount] = useState<number>(0);

  const services = Object.keys(SERVICE_PRICES);

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: Date.now().toString(),
        service: '',
        description: '',
        price: 0,
      },
    ]);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        if (field === 'service') {
          // Auto-fill price when service is selected
          return {
            ...item,
            service: value as string,
            price: SERVICE_PRICES[value as string] || item.price,
          };
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const subtotal = lineItems.reduce((sum, item) => sum + (item.price || 0), 0);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const TAX_RATE = 0.0825; // Texas sales tax 8.25%
  const tax = discountedSubtotal * TAX_RATE;
  const total = discountedSubtotal + tax;

  const handleSignatureChange = (signatureDataUrl: string | null) => {
    setSignature(signatureDataUrl);
    if (signatureDataUrl) {
      setSignatureTimestamp(new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        dateStyle: 'full',
        timeStyle: 'short',
      }));
    }
  };

  const handleApproveQuote = () => {
    if (!signature) {
      setError('Please provide your signature to approve the quote');
      return;
    }
    setQuoteApproved(true);
    setError('');
    setStep('payment');
  };

  const handleCompletePayment = async () => {
    if (!paymentMethod) {
      setError('Please select a payment method');
      return;
    }
    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      setError('Please enter the amount paid');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Save quote data and update lead
      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: lead.rowIndex,
          updates: {
            'Status': 'COMPLETED',
            'Amount Paid': amountPaid,
            'Total Cost': total.toString(),
            // Store quote details in notes or a dedicated field
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Save signature and quote details via separate endpoint
        await fetch('/api/leads/save-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead['Lead ID'],
            rowIndex: lead.rowIndex,
            lineItems,
            subtotal,
            total,
            signature,
            signatureTimestamp,
            paymentMethod,
            amountPaid: parseFloat(amountPaid),
            customerName: lead['Customer Name'],
            address: lead['Address'],
            city: lead['City'],
          }),
        });

        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0a2540] text-white px-5 py-4 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold">
                {step === 'quote' && 'Create Quote'}
                {step === 'signature' && 'Customer Approval'}
                {step === 'payment' && 'Collect Payment'}
              </h2>
              <p className="text-slate-400 text-sm">{lead['Customer Name']}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-3">
            <div className={`flex items-center gap-1 ${step === 'quote' ? 'text-white' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'quote' ? 'bg-[#14b8a6]' : 'bg-slate-600'}`}>1</div>
              <span className="text-xs">Quote</span>
            </div>
            <div className="flex-1 h-0.5 bg-slate-600"></div>
            <div className={`flex items-center gap-1 ${step === 'signature' ? 'text-white' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'signature' ? 'bg-[#14b8a6]' : quoteApproved ? 'bg-green-500' : 'bg-slate-600'}`}>
                {quoteApproved ? '✓' : '2'}
              </div>
              <span className="text-xs">Sign</span>
            </div>
            <div className="flex-1 h-0.5 bg-slate-600"></div>
            <div className={`flex items-center gap-1 ${step === 'payment' ? 'text-white' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'payment' ? 'bg-[#14b8a6]' : 'bg-slate-600'}`}>3</div>
              <span className="text-xs">Pay</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
          )}

          {/* Step 1: Quote Builder */}
          {step === 'quote' && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-slate-700">{lead['Address']}, {lead['City']}</p>
                <p className="text-slate-500">{lead['Service Requested']}</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-slate-700">Line Items</h3>
                  <button
                    onClick={addLineItem}
                    className="text-sm text-[#14b8a6] hover:text-[#0d9488] font-medium flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Item
                  </button>
                </div>

                {lineItems.map((item, idx) => (
                  <div key={item.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Item {idx + 1}</span>
                      {lineItems.length > 1 && (
                        <button
                          onClick={() => removeLineItem(item.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <select
                      value={item.service}
                      onChange={(e) => updateLineItem(item.id, 'service', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="">Select service...</option>
                      {services.map(s => (
                        <option key={s} value={s}>{s} - ${SERVICE_PRICES[s]}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400">$</span>
                        <input
                          type="number"
                          value={item.price || ''}
                          onChange={(e) => updateLineItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                          className="w-24 pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>

                {/* Discount */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-green-700">Discount</span>
                    <div className="flex gap-1">
                      {[5, 10, 20, 25, 30].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setDiscount(Math.round(subtotal * pct) / 100)}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded font-medium transition"
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">-$</span>
                    <input
                      type="number"
                      value={discount || ''}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2 border border-green-300 rounded-lg text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {discount > 0 && (
                      <button
                        type="button"
                        onClick={() => setDiscount(0)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>After Discount</span>
                    <span className="font-medium">${discountedSubtotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Texas Sales Tax (8.25%)</span>
                  <span className="font-medium">${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-slate-200 pt-2">
                  <span>Total</span>
                  <span className="text-[#14b8a6]">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Signature */}
          {step === 'signature' && (
            <div className="space-y-4">
              {/* Quote Summary */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-700 mb-2">Quote Summary</h3>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1">
                    <span>{item.service}</span>
                    <span className="font-medium">${item.price.toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-slate-300 mt-2 pt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-${discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Tax (8.25%)</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1">
                    <span>Total</span>
                    <span className="text-[#14b8a6]">${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Agreement Text */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-medium mb-1">Customer Agreement</p>
                <p>By signing below, I authorize ClearAir Solutions to perform the services listed above for the quoted price of ${total.toFixed(2)}.</p>
              </div>

              {/* Signature Pad */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Customer Signature</label>
                <SignaturePad onSignatureChange={handleSignatureChange} />
              </div>

              {signature && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Signature captured
                </p>
              )}
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 'payment' && (
            <div className="space-y-4">
              {/* Approval Confirmation */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Quote Approved
                </div>
                <p className="text-sm text-green-600">Signed at {signatureTimestamp}</p>
                <p className="text-lg font-bold text-green-700 mt-1">Total: ${total.toFixed(2)}</p>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cash', 'Card', 'Check'].map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-3 rounded-lg font-medium text-sm transition ${
                        paymentMethod === method
                          ? 'bg-[#14b8a6] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Amount Paid</label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-slate-400 text-lg">$</span>
                  <input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder={total.toFixed(2)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg text-lg font-medium"
                  />
                </div>
                <button
                  onClick={() => setAmountPaid(total.toFixed(2))}
                  className="text-sm text-[#14b8a6] hover:text-[#0d9488] mt-1"
                >
                  Use quote total (${total.toFixed(2)})
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 border-t flex gap-3 flex-shrink-0">
          {step === 'quote' && (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('signature')}
                disabled={lineItems.length === 0 || !lineItems.some(i => i.service)}
                className="flex-1 py-3 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition disabled:opacity-50"
              >
                Next: Get Signature
              </button>
            </>
          )}

          {step === 'signature' && (
            <>
              <button
                onClick={() => setStep('quote')}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition"
              >
                Back
              </button>
              <button
                onClick={handleApproveQuote}
                disabled={!signature}
                className="flex-1 py-3 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition disabled:opacity-50"
              >
                Approve Quote
              </button>
            </>
          )}

          {step === 'payment' && (
            <>
              <button
                onClick={() => setStep('signature')}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition"
              >
                Back
              </button>
              <button
                onClick={handleCompletePayment}
                disabled={loading || !paymentMethod || !amountPaid}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Complete & Save
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
