'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { fileToCompressedJpeg, type PhotoItem } from '@/app/lib/photo-utils';

const SendDocumentModal = dynamic(() => import('./SendDocumentModal'), { ssr: false });

interface Lead {
  [key: string]: string;
}

interface CheckoutModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
  onUpsell?: () => void;
}

export default function CheckoutModal({ lead, onClose, onSuccess }: CheckoutModalProps) {
  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobClosed, setJobClosed] = useState<boolean | null>(null); // null = not selected yet
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  // Photo step states
  const [photoStep, setPhotoStep] = useState(false);
  const [beforePhotos, setBeforePhotos] = useState<PhotoItem[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<PhotoItem[]>([]);
  const [activePhotoTab, setActivePhotoTab] = useState<'before' | 'after'>('after');
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [savingPhotos, setSavingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Deposit detection
  const hasDeposit = !!(lead['Deposit Amount'] && parseFloat(lead['Deposit Amount']) > 0);
  const depositAmount = parseFloat(lead['Deposit Amount'] || '0');
  const estimateTotal = parseFloat(lead['Quote Amount'] || '0');
  const balanceDue = parseFloat(lead['Balance Due'] || '0') || (estimateTotal - depositAmount);

  // Fields for quoted (not closed)
  const [estimateNumber, setEstimateNumber] = useState(lead['Estimate Number'] || '');
  const [estimateAmount, setEstimateAmount] = useState(lead['Quote Amount'] || '');

  // Fields for closed (payment collected)
  const [invoiceNumber, setInvoiceNumber] = useState(lead['Invoice Number'] || '');
  const [totalPaid, setTotalPaid] = useState(hasDeposit ? balanceDue.toFixed(2) : (lead['Quote Amount'] || ''));
  const [paymentMethod, setPaymentMethod] = useState('');
  // Credit card fee: default 4% (CC_FEE_PCT), backed out of the final card charge.
  // Only the dollar amount is tracked/editable; the % lives in code.
  const CC_FEE_PCT = 4;
  const [ccFeeAmount, setCcFeeAmount] = useState('');

  // Default fee $ from a final charge at the standard rate.
  const defaultFeeFrom = (finalStr: string) => {
    const final = parseFloat(finalStr) || 0;
    return final > 0 ? (final - final / (1 + CC_FEE_PCT / 100)).toFixed(2) : '';
  };
  const [laborCost, setLaborCost] = useState(lead['Labor Cost'] || '');
  const [materialCost, setMaterialCost] = useState(lead['Materials Cost'] || '');
  const [subcontractorCost, setSubcontractorCost] = useState(lead['Subcontractor Cost'] || '');

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

      // Credit card: "Total Customer Paid" is the FINAL charge (fee included).
      // Back the fee out so the books record job + tax only.
      const isCC = paymentMethod === 'Credit Card';
      const chargedNow = parseFloat(totalPaid) || 0;
      // Fee $ is the source of truth (defaults to the % if not set).
      const ccFee = isCC ? (parseFloat(ccFeeAmount) || parseFloat(defaultFeeFrom(totalPaid)) || 0) : 0;
      const jobTaxNow = isCC ? Math.max(0, chargedNow - ccFee) : chargedNow; // fee removed
      const amountPaidTotal = hasDeposit ? depositAmount + jobTaxNow : jobTaxNow;

      const updates: Record<string, string> = {
        'Check Out': checkoutTime,
      };

      if (jobClosed) {
        // Job closed - payment collected, mark as COMPLETE (before dispatcher closes)
        updates['Status'] = 'COMPLETED';
        updates['Invoice Number'] = invoiceNumber;  // Column CC
        // Amount Paid = job + tax (fee removed for credit card). Deposit added in.
        updates['Amount Paid'] = amountPaidTotal.toFixed(2);
        updates['Payment Method'] = paymentMethod;
        // Credit card fee is a pass-through, kept out of Amount Paid. Cleared otherwise.
        updates['Credit Card Fee'] = isCC ? ccFee.toFixed(2) : '';
        updates['Final Amount Charged'] = isCC ? chargedNow.toFixed(2) : '';
        updates['Payment Date'] = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
        updates['Quote Amount'] = hasDeposit ? estimateTotal.toFixed(2) : jobTaxNow.toFixed(2);
        if (hasDeposit) updates['Balance Due'] = '0';
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
        // If payment collected and invoice exists, regenerate PDF with PAID stamp
        if (jobClosed && (invoiceNumber || lead['Invoice Number'])) {
          try {
            const lineItems = (() => {
              try {
                const parsed = JSON.parse(lead['Estimate Line Items'] || '[]');
                const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
                return items.length > 0 ? items : [{ service: lead['Service Requested'] || '', description: '', qty: 1, price: parseFloat(totalPaid) }];
              } catch { return [{ service: lead['Service Requested'] || '', description: '', qty: 1, price: parseFloat(totalPaid) }]; }
            })();
            const subtotal = lineItems.reduce((sum: number, item: { qty?: number; price?: number }) => sum + ((item.qty || 1) * (item.price || 0)), 0);
            const TAX_RATE = 0.0825;
            const tax = subtotal * TAX_RATE;
            const total = subtotal + tax;
            const finalAmountPaid = amountPaidTotal.toFixed(2);

            await fetch('/api/documents/send-invoice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                leadId: lead['Lead ID'],
                sendVia: 'none',
                invoiceNumber: invoiceNumber || lead['Invoice Number'],
                lineItems,
                totals: {
                  subtotal, discount: 0, taxRate: TAX_RATE, tax, total,
                  ...(hasDeposit ? { depositAmount, depositMethod: lead['Deposit Method'] || '', depositDate: lead['Deposit Date'] || '' } : {}),
                },
                isPaid: true,
                amountPaid: finalAmountPaid,
                paymentMethod,
                paymentDate: new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
              }),
            });
          } catch {
            // Non-critical — payment saved even if PDF fails
          }
        }
        setCheckoutComplete(true);
      } else {
        setError(result.error || 'Failed to checkout');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLoadingPhotos(true);
    try {
      const newPhotos: PhotoItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const dataUrl = await fileToCompressedJpeg(files[i]);
        newPhotos.push({
          id: `${Date.now()}_${i}`,
          dataUrl,
          name: files[i].name,
        });
      }
      if (activePhotoTab === 'before') {
        setBeforePhotos(prev => [...prev, ...newPhotos]);
      } else {
        setAfterPhotos(prev => [...prev, ...newPhotos]);
      }
    } catch (err) {
      console.error('Failed to process photos:', err);
    } finally {
      setLoadingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (id: string, tab: 'before' | 'after') => {
    if (tab === 'before') {
      setBeforePhotos(prev => prev.filter(p => p.id !== id));
    } else {
      setAfterPhotos(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleSaveAndSend = async () => {
    setSavingPhotos(true);
    setError('');
    try {
      // Save before photos to Drive
      if (beforePhotos.length > 0) {
        await fetch('/api/documents/save-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead['Lead ID'],
            rowIndex: lead.rowIndex,
            photos: beforePhotos.map(p => ({ dataUrl: p.dataUrl, name: p.name })),
            photoType: 'before',
          }),
        });
      }
      // Save after photos to Drive
      if (afterPhotos.length > 0) {
        await fetch('/api/documents/save-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead['Lead ID'],
            rowIndex: lead.rowIndex,
            photos: afterPhotos.map(p => ({ dataUrl: p.dataUrl, name: p.name })),
            photoType: 'after',
          }),
        });
      }
    } catch (err) {
      console.error('Failed to save photos:', err);
    } finally {
      setSavingPhotos(false);
    }
    setShowSendModal(true);
  };

  const inputClass = "w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-base";
  const labelClass = "block text-slate-700 text-sm font-medium mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#0a2540] text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">Collect Payment</h2>
            <p className="text-slate-400 text-sm">{lead['Customer Name']} - {lead['Lead ID']}</p>
          </div>
          <button onClick={() => { if (checkoutComplete) onSuccess(); onClose(); }} className="text-slate-400 hover:text-white transition">
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

          {/* Success screen - offer to send document */}
          {checkoutComplete ? (
            jobClosed && !photoStep ? (
              /* Photo step trigger - auto-enter photo step for closed jobs */
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-1">Job Checked Out!</h3>
                <p className="text-sm text-slate-500 mb-6">
                  Invoice #{invoiceNumber} — ${totalPaid} via {paymentMethod}
                </p>
                <button
                  onClick={() => setPhotoStep(true)}
                  className="w-full py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition mb-3"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Attach Photos & Send Receipt
                </button>
                <button
                  onClick={() => setShowSendModal(true)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium transition mb-2"
                >
                  Skip Photos — Send Receipt
                </button>
                <button
                  onClick={() => { onSuccess(); onClose(); }}
                  className="text-slate-400 hover:text-slate-600 text-sm transition"
                >
                  Close without sending
                </button>
              </div>
            ) : jobClosed && photoStep ? (
              /* Photo capture step */
              <div className="py-2">
                <h3 className="text-lg font-semibold text-slate-800 mb-3 text-center">Attach Photos</h3>

                {/* Before/After tab toggle */}
                <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
                  <button
                    onClick={() => setActivePhotoTab('before')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                      activePhotoTab === 'before'
                        ? 'bg-white text-[#0a2540] shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Before ({beforePhotos.length})
                  </button>
                  <button
                    onClick={() => setActivePhotoTab('after')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                      activePhotoTab === 'after'
                        ? 'bg-white text-[#0a2540] shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    After ({afterPhotos.length})
                  </button>
                </div>

                {/* Photo grid */}
                {(() => {
                  const currentPhotos = activePhotoTab === 'before' ? beforePhotos : afterPhotos;
                  return currentPhotos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {currentPhotos.map(photo => (
                        <div key={photo.id} className="relative group">
                          <img
                            src={photo.dataUrl}
                            alt={photo.name}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                          <button
                            onClick={() => handleRemovePhoto(photo.id, activePhotoTab)}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-80 hover:opacity-100 transition"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-6 text-center mb-4">
                      <svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <p className="text-slate-400 text-sm">No {activePhotoTab} photos yet</p>
                    </div>
                  );
                })()}

                {/* Add Photos button */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  onChange={handleAddPhotos}
                  className="hidden"
                />
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={loadingPhotos}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition flex items-center justify-center gap-2 mb-4 disabled:opacity-50"
                >
                  {loadingPhotos ? (
                    <div className="animate-spin w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full"></div>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add {activePhotoTab === 'before' ? 'Before' : 'After'} Photos
                    </>
                  )}
                </button>

                {/* Save & Send Receipt */}
                <button
                  onClick={handleSaveAndSend}
                  disabled={savingPhotos}
                  className="w-full py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition mb-3 disabled:opacity-50"
                >
                  {savingPhotos ? (
                    <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      {beforePhotos.length > 0 || afterPhotos.length > 0 ? 'Save & Send Receipt' : 'Send Receipt'}
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowSendModal(true)}
                  className="w-full text-center text-slate-400 hover:text-slate-600 text-sm transition"
                >
                  Skip — send without photos
                </button>
              </div>
            ) : (
              /* Quoted (not closed) - simple send button */
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-1">Estimate Saved!</h3>
                <p className="text-sm text-slate-500 mb-6">
                  Estimate #{estimateNumber} — ${estimateAmount}
                </p>
                <button
                  onClick={() => setShowSendModal(true)}
                  className="w-full py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition mb-3"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send Estimate to Customer
                </button>
                <button
                  onClick={() => { onSuccess(); onClose(); }}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium transition"
                >
                  Skip — Close
                </button>
              </div>
            )
          ) : jobClosed === null ? (
            <div className="space-y-3">
              {/* Deposit banner in checkout */}
              {hasDeposit && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                  <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm mb-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    DEPOSIT ON FILE
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-blue-500">Deposit</p>
                      <p className="font-semibold text-blue-800">${depositAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-blue-500">Estimate</p>
                      <p className="font-semibold text-blue-800">${estimateTotal.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-blue-500">Balance Due</p>
                      <p className="font-semibold text-red-600">${balanceDue.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-center text-slate-700 font-medium mb-4">
                {hasDeposit ? 'Job complete — collect remaining balance' : 'Did you close this job?'}
              </p>

              {hasDeposit ? (
                <>
                  <button
                    onClick={() => { setJobClosed(true); setTotalPaid(balanceDue.toFixed(2)); }}
                    className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Collect Balance — ${balanceDue.toFixed(2)}
                  </button>
                </>
              ) : (
                <>
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
                    onClick={async () => {
                      if (!confirm('Mark as Customer Not Home? Job will be set back to NEW for rescheduling.')) return;
                      try {
                        await fetch('/api/leads/update', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            rowIndex: parseInt(lead.rowIndex),
                            updates: {
                              'Status': 'NEW',
                              'Customer Issue/Notes': `${lead['Customer Issue/Notes'] ? lead['Customer Issue/Notes'] + ' | ' : ''}CUSTOMER NOT HOME - ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}`,
                            },
                          }),
                        });
                        onSuccess();
                        onClose();
                      } catch {
                        alert('Failed to update status');
                      }
                    }}
                    className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Customer Not Home
                  </button>
                </>
              )}
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
                    <label className={labelClass}>
                      {paymentMethod === 'Credit Card' ? 'Total Charged to Card (fee included)' : 'Total Customer Paid'} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={totalPaid}
                        onChange={(e) => { setTotalPaid(e.target.value); if (paymentMethod === 'Credit Card') setCcFeeAmount(defaultFeeFrom(e.target.value)); }}
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
                      onChange={(e) => { setPaymentMethod(e.target.value); if (e.target.value === 'Credit Card') setCcFeeAmount(defaultFeeFrom(totalPaid)); }}
                      required
                      className={inputClass}
                    >
                      <option value="">Select payment method...</option>
                      {paymentMethods.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>

                  {/* Credit card fee — the "Total Customer Paid" above is the final
                      card charge (fee included); we back the fee out here. */}
                  {paymentMethod === 'Credit Card' && (() => {
                    const chargedNow = parseFloat(totalPaid) || 0;
                    const fee = parseFloat(ccFeeAmount) || parseFloat(defaultFeeFrom(totalPaid)) || 0;
                    const jobTax = Math.max(0, chargedNow - fee);
                    const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    return (
                      <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 mt-2 space-y-2">
                        <p className="text-[11px] text-slate-500">The amount above is the final card charge — the fee is backed out below.</p>
                        <div>
                          <label className={labelClass}>Credit Card Fee $ (default {CC_FEE_PCT}%)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={ccFeeAmount}
                            onChange={(e) => setCcFeeAmount(e.target.value)}
                            placeholder={defaultFeeFrom(totalPaid) || '0.00'}
                            className={`${inputClass} max-w-[10rem]`}
                          />
                        </div>
                        <div className="flex justify-between items-center bg-white border border-slate-200 rounded-lg px-3 py-2">
                          <span className="text-sm font-semibold text-slate-700">Job + tax (recorded)</span>
                          <span className="text-base font-bold text-slate-800">{fmt(jobTax)}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">Fee auto-fills at {CC_FEE_PCT}% — override the $ if needed. Not counted in sales, tax, or income.</p>
                      </div>
                    );
                  })()}

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

      {/* Send Document Modal */}
      {showSendModal && (
        <SendDocumentModal
          lead={lead}
          type={jobClosed ? 'invoice' : 'estimate'}
          onClose={() => { setShowSendModal(false); onSuccess(); onClose(); }}
          onSuccess={() => { setShowSendModal(false); onSuccess(); onClose(); }}
          documentNumber={jobClosed ? invoiceNumber : estimateNumber}
          totals={jobClosed ? {
            subtotal: parseFloat(totalPaid) || 0,
            discount: 0,
            taxRate: 0,
            tax: 0,
            total: parseFloat(totalPaid) || 0,
          } : {
            subtotal: parseFloat(estimateAmount) || 0,
            discount: 0,
            taxRate: 0.0825,
            tax: (parseFloat(estimateAmount) || 0) * 0.0825,
            total: (parseFloat(estimateAmount) || 0) * 1.0825,
          }}
          isPaid={jobClosed || false}
          amountPaid={totalPaid}
          paymentMethod={paymentMethod}
          paymentDate={new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
          beforePhotos={beforePhotos.length > 0 ? beforePhotos.map(p => ({ dataUrl: p.dataUrl, name: p.name })) : undefined}
          afterPhotos={afterPhotos.length > 0 ? afterPhotos.map(p => ({ dataUrl: p.dataUrl, name: p.name })) : undefined}
        />
      )}
    </div>
  );
}
