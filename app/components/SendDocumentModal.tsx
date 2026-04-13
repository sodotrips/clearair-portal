'use client';

import { useState, useEffect } from 'react';

interface Lead {
  [key: string]: string;
}

interface SendDocumentModalProps {
  lead: Lead;
  type: 'invoice' | 'estimate';
  onClose: () => void;
  onSuccess?: () => void;
  // Optional pre-filled data from checkout/quote flow
  documentNumber?: string;
  lineItems?: { service: string; description?: string; qty: number; price: number }[];
  totals?: { subtotal: number; discount: number; taxRate: number; tax: number; total: number };
  isPaid?: boolean;
  amountPaid?: string;
  paymentMethod?: string;
  paymentDate?: string;
  signatureDataUrl?: string | null;
  signatureTimestamp?: string;
  photos?: { dataUrl: string; name?: string }[];
  beforePhotos?: { dataUrl: string; name?: string }[];
  afterPhotos?: { dataUrl: string; name?: string }[];
  techNotes?: string;
  driveUrl?: string;
}

export default function SendDocumentModal({
  lead,
  type,
  onClose,
  onSuccess,
  documentNumber,
  lineItems,
  totals,
  isPaid,
  amountPaid,
  paymentMethod,
  paymentDate,
  signatureDataUrl,
  signatureTimestamp,
  photos,
  beforePhotos,
  afterPhotos,
  techNotes,
  driveUrl,
}: SendDocumentModalProps) {
  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const [sendVia, setSendVia] = useState<'sms' | 'email' | 'both'>('sms');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [result, setResult] = useState<{ driveLink?: string; smsSent?: boolean; emailSent?: boolean } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const customerName = lead['Customer Name'] || '';
  const phone = lead['Phone Number'] || '';
  const email = lead['Email'] || '';
  const isInvoice = type === 'invoice';

  const handleSend = async () => {
    setLoading(true);
    setError('');

    try {
      const endpoint = isInvoice ? '/api/documents/send-invoice' : '/api/documents/send-estimate';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead['Lead ID'],
          sendVia,
          ...(isInvoice ? {
            invoiceNumber: documentNumber,
            lineItems,
            totals,
            isPaid,
            amountPaid,
            paymentMethod,
            paymentDate,
            beforePhotos: beforePhotos || photos,
            afterPhotos,
          } : {
            estimateNumber: documentNumber,
            lineItems,
            totals,
            signatureDataUrl,
            signatureTimestamp,
            techNotes,
            photos: photos?.map(p => ({ dataUrl: p.dataUrl, name: p.name })),
          }),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setResult(data);
        onSuccess?.();
      } else {
        setError(data.error || 'Failed to send');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // Load photos from Drive URLs (client-side)
  const loadDrivePhotos = async (columnKey: string): Promise<{ dataUrl: string; name: string }[]> => {
    try {
      const urls = JSON.parse(lead[columnKey] || '[]');
      if (!Array.isArray(urls) || urls.length === 0) return [];
      const loaded = await Promise.all(urls.map(async (url: string, i: number) => {
        try {
          let directUrl = url;
          const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (fileIdMatch) directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
          const res = await fetch(directUrl);
          if (!res.ok) return null;
          const blob = await res.blob();
          return new Promise<{ dataUrl: string; name: string }>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ dataUrl: reader.result as string, name: `photo-${i + 1}.jpg` });
            reader.readAsDataURL(blob);
          });
        } catch { return null; }
      }));
      return loaded.filter(Boolean) as { dataUrl: string; name: string }[];
    } catch { return []; }
  };

  const handlePreview = async () => {
    // Use Drive link if available (prefer prop, then lead data)
    const resolvedDriveUrl = driveUrl || (isInvoice ? lead['Invoice Link'] : lead['Estimate Link']);
    if (resolvedDriveUrl) {
      window.open(resolvedDriveUrl, '_blank');
      return;
    }

    setPreviewing(true);
    try {
      // Fallback: generate PDF client-side
      let resolvedPhotos = photos && photos.length > 0 ? photos : await loadDrivePhotos('Before Photos URL');
      let resolvedBeforePhotos = beforePhotos && beforePhotos.length > 0 ? beforePhotos : resolvedPhotos;
      let resolvedAfterPhotos = afterPhotos && afterPhotos.length > 0 ? afterPhotos : await loadDrivePhotos('After Photos URL');

      // Generate PDF client-side for preview
      if (isInvoice) {
        const { generateInvoicePdf } = await import('@/app/lib/generateInvoicePdf');
        const totalAmount = totals?.total || parseFloat(lead['Amount Paid'] || lead['Quote Amount'] || '0');
        const blob = await generateInvoicePdf({
          invoiceNumber: documentNumber || 'PREVIEW',
          date: new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
          dueDate: lead['Appointment Date'] || new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
          leadId: lead['Lead ID'],
          customer: {
            name: customerName,
            address: lead['Address'] || '',
            city: lead['City'] || '',
            phone,
            email,
          },
          lineItems: lineItems || [{ service: lead['Service Requested'] || 'Air Duct Cleaning', description: '', qty: 1, price: totalAmount }],
          totals: totals || { subtotal: totalAmount, discount: 0, taxRate: 0, tax: 0, total: totalAmount },
          techNotes,
          isPaid: isPaid || false,
          amountPaid,
          paymentMethod,
          paymentDate,
          photos: resolvedBeforePhotos,
          afterPhotos: resolvedAfterPhotos.length > 0 ? resolvedAfterPhotos : undefined,
        });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        const { generateEstimatePdf } = await import('@/app/lib/generateEstimatePdf');
        const quoteAmount = totals?.total || parseFloat(lead['Quote Amount'] || '0');
        const blob = await generateEstimatePdf({
          estimateNumber: documentNumber || 'PREVIEW',
          date: new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
          validUntil: new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
          leadId: lead['Lead ID'],
          customer: {
            name: customerName,
            address: lead['Address'] || '',
            city: lead['City'] || '',
            phone,
            email,
          },
          lineItems: lineItems || [{ service: lead['Service Requested'] || 'Air Duct Cleaning', description: '', qty: 1, price: quoteAmount }],
          totals: totals || { subtotal: quoteAmount, discount: 0, taxRate: 0.0825, tax: quoteAmount * 0.0825, total: quoteAmount * 1.0825 },
          techNotes,
          photos: resolvedPhotos,
          signatureDataUrl: signatureDataUrl || lead['Signature URL'] || undefined,
          signatureTimestamp,
        });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err) {
      setError('Failed to generate preview');
    } finally {
      setPreviewing(false);
    }
  };

  const inputClass = "w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-base";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto my-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#0a2540] text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">
              Send {isInvoice ? 'Invoice' : 'Estimate'}
            </h2>
            <p className="text-slate-400 text-sm">{customerName} - {lead['Lead ID']}</p>
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

          {success ? (
            /* Success state */
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                {isInvoice ? 'Invoice' : 'Estimate'} Sent!
              </h3>
              <div className="text-sm text-slate-600 space-y-1">
                {result?.smsSent && <p>SMS sent to {phone}</p>}
                {result?.emailSent && <p>Email sent to {email}</p>}
                {result?.driveLink && (
                  <p className="mt-3">
                    <a href={result.driveLink} target="_blank" rel="noopener noreferrer" className="text-[#14b8a6] hover:underline">
                      View PDF in Google Drive
                    </a>
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="mt-6 w-full py-3 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-xl font-medium transition"
              >
                Done
              </button>
            </div>
          ) : (
            /* Send form */
            <>
              {/* Document summary */}
              <div className="bg-slate-50 p-3 rounded-lg text-sm mb-4">
                <p><span className="font-medium">Service:</span> {lead['Service Requested']}</p>
                <p><span className="font-medium">Address:</span> {lead['Address']}, {lead['City']}</p>
                {documentNumber && (
                  <p><span className="font-medium">{isInvoice ? 'Invoice' : 'Estimate'} #:</span> {documentNumber}</p>
                )}
                {totals && (
                  <p className="text-lg font-bold text-[#0a2540] mt-1">
                    {isInvoice ? (isPaid ? 'Paid' : 'Due') : 'Estimated Total'}: ${totals.total.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Send via selection */}
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">Send via</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['sms', 'email', 'both'] as const).map(option => (
                    <button
                      key={option}
                      onClick={() => setSendVia(option)}
                      className={`py-3 rounded-xl font-medium text-sm transition flex flex-col items-center gap-1 ${
                        sendVia === option
                          ? 'bg-[#14b8a6] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {option === 'sms' && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      )}
                      {option === 'email' && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      )}
                      {option === 'both' && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                      {option === 'sms' ? 'SMS' : option === 'email' ? 'Email' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient info */}
              <div className="space-y-3 mb-4">
                {(sendVia === 'sms' || sendVia === 'both') && (
                  <div>
                    <label className="block text-slate-700 text-sm font-medium mb-1">Phone</label>
                    <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
                      {phone || 'No phone on file'}
                    </div>
                    {!phone && <p className="text-xs text-red-500 mt-1">Phone number required for SMS</p>}
                  </div>
                )}
                {(sendVia === 'email' || sendVia === 'both') && (
                  <div>
                    <label className="block text-slate-700 text-sm font-medium mb-1">Email</label>
                    <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
                      {email || 'No email on file'}
                    </div>
                    {!email && <p className="text-xs text-amber-600 mt-1">No email — will skip email delivery</p>}
                  </div>
                )}
              </div>

              {/* Info box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-4">
                <p className="font-medium mb-1">What happens when you send:</p>
                <ul className="space-y-0.5">
                  <li>• PDF generated and saved to Google Drive</li>
                  {(sendVia === 'sms' || sendVia === 'both') && <li>• Customer receives SMS with {isInvoice ? 'invoice' : 'estimate'} details + link</li>}
                  {(sendVia === 'email' || sendVia === 'both') && <li>• Customer receives email with PDF attached</li>}
                  <li>• Google Sheet updated with sent timestamp</li>
                </ul>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handlePreview}
                  disabled={previewing}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {previewing ? (
                    <div className="animate-spin w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full"></div>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Preview
                    </>
                  )}
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading || (!phone && sendVia !== 'email')}
                  className="flex-1 py-3 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-xl font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send {isInvoice ? 'Invoice' : 'Estimate'}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
