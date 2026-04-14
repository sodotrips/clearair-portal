'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import SignaturePad from './SignaturePad';
import { fileToCompressedJpeg, type PhotoItem } from '@/app/lib/photo-utils';

const SendDocumentModal = dynamic(() => import('./SendDocumentModal'), { ssr: false });

interface Lead {
  [key: string]: string;
}

interface QuoteModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
  initialStep?: string;
}

interface ServiceItem {
  code: string;
  category: string;
  name: string;
  description: string;
  taxable: boolean;
}

interface LineItem {
  id: string;
  service: string;
  customService: string;
  description: string;
  qty: number;
  price: number;
  taxable: boolean;
}

type Step = 'estimate' | 'review' | 'sign' | 'choose' | 'payment' | 'deposit' | 'done';

export default function QuoteModal({ lead, onClose, onSuccess, initialStep }: QuoteModalProps) {
  const [step, setStep] = useState<Step>((initialStep as Step) || 'estimate');
  const [servicesList, setServicesList] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureTimestamp, setSignatureTimestamp] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [discount, setDiscount] = useState(0);
  const [showSendModal, setShowSendModal] = useState(false);
  const [doneType, setDoneType] = useState<'estimate' | 'invoice' | 'deposit'>('estimate');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDriveLink, setInvoiceDriveLink] = useState('');
  // Deposit state
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTimeWindow, setScheduleTimeWindow] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [techNotes, setTechNotes] = useState(lead['Tech Notes'] || '');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [annotatingPhoto, setAnnotatingPhoto] = useState<PhotoItem | null>(null);
  const [drawColor, setDrawColor] = useState('#ef4444');
  const [brushSize, setBrushSize] = useState(4);
  const annotateCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotateImgRef = useRef<HTMLImageElement | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const isDrawingRef = useRef(false);

  // Detect deposit job
  const hasDeposit = !!(lead['Deposit Amount'] && parseFloat(lead['Deposit Amount']) > 0);
  const existingDeposit = parseFloat(lead['Deposit Amount'] || '0');

  // Fetch services from SERVICES sheet
  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    async function fetchServices() {
      try {
        const res = await fetch('/api/services');
        const data = await res.json();
        if (data.services) {
          setServicesList(data.services);

          // Load existing line items if available (upsell/deposit scenario)
          const savedItems = lead['Estimate Line Items'];
          if (savedItems) {
            try {
              const parsed = JSON.parse(savedItems);
              // Support both formats: array (old) and { items, discount } (new)
              const itemsArray = Array.isArray(parsed) ? parsed : (parsed.items || []);
              if (parsed.discount !== undefined) setDiscount(parsed.discount);
              if (itemsArray.length > 0) {
                setLineItems(itemsArray.map((item: { service: string; description?: string; qty: number; price: number; taxable?: boolean }, idx: number) => {
                  const svc = data.services.find((s: ServiceItem) => s.name === item.service);
                  return {
                    id: `existing-${idx}`,
                    service: svc ? item.service : 'Custom',
                    customService: svc ? '' : item.service,
                    description: item.description || '',
                    qty: item.qty || 1,
                    price: item.price || 0,
                    taxable: item.taxable !== undefined ? item.taxable : (svc ? svc.taxable : true),
                  };
                }));
                setServicesLoading(false);
                return;
              }
            } catch {
              // Invalid JSON, start fresh
            }
          }

          setLineItems([]);
        }
      } catch {
        setLineItems([]);
      } finally {
        setServicesLoading(false);
      }
    }
    fetchServices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Group services by category for dropdown
  const servicesByCategory = servicesList.reduce<Record<string, ServiceItem[]>>((acc, s) => {
    const cat = s.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  // Line item helpers
  const addLineItem = () => {
    setLineItems([{ id: Date.now().toString(), service: '', customService: '', description: '', qty: 1, price: 0, taxable: true }, ...lineItems]);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number | boolean) => {
    setLineItems(lineItems.map(item => {
      if (item.id !== id) return item;
      if (field === 'service') {
        const svc = servicesList.find(s => s.name === value);
        if (svc) {
          return { ...item, service: svc.name, customService: '', description: svc.description, taxable: svc.taxable };
        }
        return { ...item, service: value as string, customService: value === 'Custom' ? item.customService : '', taxable: true };
      }
      return { ...item, [field]: value };
    }));
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
    setExpandedItems(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const toggleItemExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const updated = [...lineItems];
      const [dragged] = updated.splice(dragIndex, 1);
      updated.splice(dragOverIndex, 0, dragged);
      setLineItems(updated);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Photo upload handler
  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoadingPhotos(true);
    const newPhotos: PhotoItem[] = [];
    for (const file of Array.from(files)) {
      try {
        const dataUrl = await fileToCompressedJpeg(file);
        newPhotos.push({ id: Date.now().toString() + Math.random(), dataUrl, name: file.name });
      } catch {
        // Skip failed photos
      }
    }
    setPhotos(prev => [...prev, ...newPhotos]);
    setLoadingPhotos(false);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  // Annotation: load photo into canvas
  useEffect(() => {
    if (!annotatingPhoto) return;
    const canvas = annotateCanvasRef.current;
    if (!canvas) return;
    const img = new window.Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      annotateImgRef.current = img;
      undoStackRef.current = [canvas.toDataURL()];
    };
    img.src = annotatingPhoto.dataUrl;
  }, [annotatingPhoto]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = annotateCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [drawColor, brushSize]);

  const drawLine = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = annotateCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, []);

  const endDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = annotateCanvasRef.current;
    if (!canvas) return;
    undoStackRef.current = [...undoStackRef.current, canvas.toDataURL()];
  }, []);

  const handleAnnotateUndo = () => {
    const stack = undoStackRef.current;
    if (stack.length <= 1) return;
    stack.pop();
    const prev = stack[stack.length - 1];
    const canvas = annotateCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new window.Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = prev;
  };

  const handleAnnotateClear = () => {
    const canvas = annotateCanvasRef.current;
    if (!canvas || !annotateImgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(annotateImgRef.current, 0, 0);
    undoStackRef.current = [canvas.toDataURL()];
  };

  const handleAnnotateDone = () => {
    const canvas = annotateCanvasRef.current;
    if (!canvas || !annotatingPhoto) return;
    const annotated = canvas.toDataURL('image/jpeg', 0.9);
    setPhotos(prev => prev.map(p => p.id === annotatingPhoto.id ? { ...p, dataUrl: annotated } : p));
    setAnnotatingPhoto(null);
    undoStackRef.current = [];
  };

  // Calculations
  const subtotal = lineItems.reduce((sum, item) => sum + ((item.qty || 1) * (item.price || 0)), 0);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const TAX_RATE = 0.0825;
  const taxableSubtotal = lineItems.reduce((sum, item) => sum + (item.taxable ? ((item.qty || 1) * (item.price || 0)) : 0), 0);
  const taxableAfterDiscount = Math.max(0, taxableSubtotal - (discount * (taxableSubtotal / (subtotal || 1))));
  const tax = taxableAfterDiscount * TAX_RATE;
  const total = discountedSubtotal + tax;

  const getServiceName = (item: LineItem) => item.service === 'Custom' ? item.customService : item.service;

  const getLineItemsForApi = () => lineItems.map(i => ({
    service: getServiceName(i),
    description: i.description,
    qty: i.qty || 1,
    price: i.price,
  }));

  const getTotals = () => ({
    subtotal, discount, taxRate: TAX_RATE, tax, total,
    // Include deposit info for PDF (from new deposit or existing deposit)
    ...(doneType === 'deposit' && depositAmount ? {
      depositAmount: parseFloat(depositAmount),
      depositMethod: depositMethod,
      depositDate: new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
    } : hasDeposit ? {
      depositAmount: existingDeposit,
      depositMethod: lead['Deposit Method'] || '',
      depositDate: lead['Deposit Date'] || '',
    } : {}),
  });

  // Signature handler
  const handleSignatureChange = (dataUrl: string | null) => {
    setSignature(dataUrl);
    if (dataUrl) {
      setSignatureTimestamp(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' }));
    }
  };

  // Save estimate — generate PDF, save to Drive, then go to done screen to send
  const handleSaveEstimate = async () => {
    setLoading(true);
    setError('');
    try {
      // Save to sheet first
      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: lead.rowIndex,
          updates: {
            'Status': 'QUOTED',
            'Quote Amount': total.toFixed(2),
            'Estimate Line Items': JSON.stringify({ items: getLineItemsForApi(), discount }),
            'Tech Notes': techNotes,
          },
        }),
      });
      const result = await response.json();
      if (!result.success) {
        setError(result.error || 'Failed to save');
        return;
      }

      // Show success immediately
      onSuccess();
      setDoneType('estimate');
      setStep('done');

      // Save photos to Drive first (blocking), then generate PDF — ensures PDF has photos even if inline upload fails on iPad
      (async () => {
        if (photos.length > 0) {
          try {
            await fetch('/api/documents/save-assets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                leadId: lead['Lead ID'],
                rowIndex: lead.rowIndex,
                photos,
              }),
            });
          } catch { /* non-critical — server will try inline photos */ }
        }

        const res = await fetch('/api/documents/send-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead['Lead ID'],
            sendVia: 'none',
            lineItems: getLineItemsForApi(),
            totals: getTotals(),
            signatureDataUrl: signature,
            signatureTimestamp,
            photos: photos.length > 0 ? photos.map(p => ({ dataUrl: p.dataUrl, name: p.name })) : undefined,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setInvoiceNumber(data.estimateNumber || '');
          setInvoiceDriveLink(data.driveLink || '');
        }
      })().catch(() => {});
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // Save with payment (close job — amount is fixed to balance/total)
  const handleCompletePayment = async () => {
    if (!paymentMethod) { setError('Please select a payment method'); return; }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: lead.rowIndex,
          updates: {
            'Status': 'COMPLETED',
            'Amount Paid': hasDeposit ? (existingDeposit + parseFloat(amountPaid)).toFixed(2) : amountPaid,
            'Payment Method': paymentMethod,
            'Quote Amount': total.toFixed(2),
            'Total Cost': total.toFixed(2),
            'Balance Due': '0',
            'Estimate Line Items': JSON.stringify({ items: getLineItemsForApi(), discount }),
            'Tech Notes': techNotes,
          },
        }),
      });
      const result = await response.json();
      if (result.success) {
        onSuccess();
        setDoneType('invoice');
        setStep('done');
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // Save with deposit & schedule
  const handleCollectDeposit = async () => {
    if (!depositMethod) { setError('Please select a payment method'); return; }
    if (!depositAmount || parseFloat(depositAmount) <= 0) { setError('Please enter the deposit amount'); return; }
    if (!scheduleDate) { setError('Please select a date'); return; }
    if (!scheduleTimeWindow) { setError('Please select a time window'); return; }

    setLoading(true);
    setError('');
    try {
      const balanceDue = (total - parseFloat(depositAmount)).toFixed(2);
      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: lead.rowIndex,
          updates: {
            'Status': 'SCHEDULED',
            'Quote Amount': total.toFixed(2),
            'Deposit Amount': depositAmount,
            'Deposit Method': depositMethod,
            'Deposit Date': new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
            'Balance Due': balanceDue,
            'Appointment Date': scheduleDate,
            'Time Window': scheduleTimeWindow,
            'Estimate Line Items': JSON.stringify({ items: getLineItemsForApi(), discount }),
            'Tech Notes': techNotes,
          },
        }),
      });
      const result = await response.json();
      if (result.success) {
        onSuccess();
        setDoneType('deposit');
        setStep('done');

        // Regenerate invoice PDF with deposit info in background
        fetch('/api/documents/send-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead['Lead ID'],
            sendVia: 'none',
            invoiceNumber: invoiceNumber || lead['Invoice Number'] || undefined,
            lineItems: getLineItemsForApi(),
            totals: { ...getTotals(), depositAmount: parseFloat(depositAmount), depositMethod, depositDate: new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) },
            isPaid: false,
          }),
        }).then(res => res.json()).then(data => {
          if (data.success) {
            setInvoiceNumber(data.invoiceNumber || '');
            setInvoiceDriveLink(data.driveLink || '');
          }
        }).catch(() => {});
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // After customer signs — save signature + photos to Drive, generate invoice PDF
  const handleApproveAndGenerate = async () => {
    if (!signature) { setError('Please get customer signature'); return; }
    setError('');
    setLoading(true);

    try {
      // 1. Save estimate data to sheet
      await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: lead.rowIndex,
          updates: {
            'Status': 'QUOTED',
            'Quote Amount': total.toFixed(2),
            'Estimate Line Items': JSON.stringify({ items: getLineItemsForApi(), discount }),
            'Tech Notes': techNotes,
          },
        }),
      });

      // 2. Save signature + before photos to Google Drive
      try {
        await fetch('/api/documents/save-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead['Lead ID'],
            rowIndex: lead.rowIndex,
            signature,
            photos: photos.length > 0 ? photos : undefined,
          }),
        });
      } catch {
        // Non-critical
      }

      // 3. Generate invoice PDF and save to Drive
      const numRes = await fetch('/api/documents/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead['Lead ID'],
          sendVia: 'none',
          lineItems: getLineItemsForApi(),
          totals: getTotals(),
          isPaid: false,
        }),
      });
      const numData = await numRes.json();
      if (numData.success) {
        setInvoiceNumber(numData.invoiceNumber || '');
        setInvoiceDriveLink(numData.driveLink || '');
      }
    } catch {
      // Non-critical — continue even if Drive save fails
    } finally {
      setLoading(false);
      onSuccess();
      setStep('choose');
    }
  };

  // Close handler
  const handleClose = () => {
    if (step === 'done') onSuccess();
    onClose();
  };

  // Step labels for header
  const stepLabels: Record<Step, string> = {
    estimate: hasDeposit ? 'Add Items' : 'Build Estimate',
    review: 'Review Estimate',
    sign: 'Customer Signature',
    choose: 'Next Step',
    payment: 'Collect Full Payment',
    deposit: 'Collect Deposit',
    done: doneType === 'estimate' ? 'Estimate Saved' : doneType === 'deposit' ? 'Deposit Collected' : 'Payment Complete',
  };

  const stepNumbers = ['estimate', 'review', 'sign'] as const;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col my-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-[#0a2540] text-white px-5 py-4 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold">{stepLabels[step]}</h2>
              <p className="text-slate-400 text-sm">{lead['Customer Name']} — {lead['Lead ID']}</p>
            </div>
            <div className="flex items-center gap-2">
              {step === 'review' && (
                <button onClick={() => setStep('estimate')} className="text-slate-400 hover:text-white text-xs flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Edit
                </button>
              )}
              <button onClick={handleClose} className="text-slate-400 hover:text-white p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Progress Steps — hide on choose/payment/done since all steps complete */}
          {!['choose', 'payment', 'deposit', 'done'].includes(step) && (
            <div className="flex items-center gap-2 mt-3">
              {stepNumbers.map((s, i) => (
                <div key={s} className="flex items-center gap-1 flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === s ? 'bg-[#14b8a6]' :
                    stepNumbers.indexOf(step as typeof stepNumbers[number]) > i || step === 'payment' ? 'bg-green-500' : 'bg-slate-600'
                  }`}>
                    {stepNumbers.indexOf(step as typeof stepNumbers[number]) > i || step === 'payment' ? '✓' : i + 1}
                  </div>
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    {['Estimate', 'Review', 'Sign'][i]}
                  </span>
                  {i < 2 && <div className="flex-1 h-0.5 bg-slate-600 ml-1"></div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
          )}

          {/* ── STEP 1: BUILD ESTIMATE ── */}
          {step === 'estimate' && servicesLoading && (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full"></div>
            </div>
          )}
          {step === 'estimate' && !servicesLoading && (
            <div className="space-y-4">
              {/* Deposit context banner */}
              {hasDeposit && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm mb-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    DEPOSIT ON FILE — ${existingDeposit.toFixed(2)} ({lead['Deposit Method'] || ''})
                  </div>
                  <p className="text-xs text-blue-600">Add upsell items below. Deposit will be applied at checkout.</p>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-slate-700">{lead['Address']}, {lead['City']}</p>
                <p className="text-slate-500">{lead['Service Requested']}</p>
              </div>

              {/* Tech Notes / Findings */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Findings & Current Conditions <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={techNotes}
                  onChange={(e) => setTechNotes(e.target.value)}
                  placeholder="Describe what you found during inspection — duct condition, contamination, damage, recommendations..."
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none"
                />
              </div>

              {/* Search & Add Services */}
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-slate-700">Add Services</h3>
                </div>
                <div className="relative">
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={(e) => { setServiceSearch(e.target.value); setShowSearchResults(true); }}
                    onFocus={() => setShowSearchResults(true)}
                    placeholder="Search services by name or description..."
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none"
                  />
                </div>

                {/* Search Results Dropdown */}
                {showSearchResults && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-[240px] overflow-y-auto">
                    {(() => {
                      const term = serviceSearch.toLowerCase();
                      const filtered = servicesList.filter(s =>
                        s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term) || s.code.toLowerCase().includes(term)
                      );

                      if (filtered.length === 0 && serviceSearch) {
                        return (
                          <div className="p-3">
                            <p className="text-sm text-slate-500 mb-2">No services match "{serviceSearch}"</p>
                            <button
                              onClick={() => {
                                setLineItems([{
                                  id: Date.now().toString(), service: 'Custom', customService: serviceSearch,
                                  description: '', qty: 1, price: 0, taxable: true,
                                }, ...lineItems]);
                                setServiceSearch('');
                                setShowSearchResults(false);
                              }}
                              className="text-sm text-[#14b8a6] hover:text-[#0d9488] font-medium flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add "{serviceSearch}" as custom item
                            </button>
                          </div>
                        );
                      }

                      return (
                        <>
                          {filtered.map(s => {
                            return (
                              <button
                                key={s.code}
                                onClick={() => {
                                  setLineItems([{
                                    id: Date.now().toString(), service: s.name, customService: '',
                                    description: s.description, qty: 1, price: 0, taxable: s.taxable,
                                  }, ...lineItems]);
                                  setServiceSearch('');
                                  setShowSearchResults(false);
                                }}
                                className="w-full text-left px-3 py-2.5 flex justify-between items-center gap-2 transition hover:bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                                  {s.description && <p className="text-xs text-slate-500 truncate">{s.description}</p>}
                                </div>
                                <svg className="w-4 h-4 text-[#14b8a6] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                              </button>
                            );
                          })}
                          {/* Custom option at bottom */}
                          <button
                            onClick={() => {
                              setLineItems([{
                                id: Date.now().toString(), service: 'Custom', customService: '',
                                description: '', qty: 1, price: 0, taxable: true,
                              }, ...lineItems]);
                              setServiceSearch('');
                              setShowSearchResults(false);
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-t border-slate-100 flex items-center gap-2 text-[#14b8a6]"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="text-sm font-medium">Add Custom Item</span>
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Close search results when clicking outside */}
              {showSearchResults && (
                <div className="fixed inset-0 z-[1]" onClick={() => setShowSearchResults(false)} />
              )}

              {/* Added Line Items */}
              <div className="space-y-3">
                {lineItems.length > 0 && (
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-slate-700 text-sm">{lineItems.length} item{lineItems.length !== 1 ? 's' : ''} added</h3>
                    <button
                      onClick={() => {
                        if (expandedItems.size === lineItems.length) {
                          setExpandedItems(new Set());
                        } else {
                          setExpandedItems(new Set(lineItems.map(i => i.id)));
                        }
                      }}
                      className="text-xs text-[#14b8a6] hover:text-[#0d9488] font-medium"
                    >
                      {expandedItems.size === lineItems.length ? 'Collapse All' : 'Expand All'}
                    </button>
                  </div>
                )}
                {lineItems.map((item, idx) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx); }}
                    onDragEnd={handleDragEnd}
                    className={`border rounded-lg overflow-hidden transition-all ${
                      dragIndex === idx ? 'opacity-50 border-[#14b8a6] scale-[0.98]' :
                      dragOverIndex === idx && dragIndex !== null ? 'border-[#14b8a6] border-2' : 'border-slate-400'
                    }`}
                  >
                    {/* Service name header — always visible, click to expand */}
                    <div
                      className="flex justify-between items-center px-4 py-2.5 bg-slate-50 border-b border-slate-200 cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex flex-col flex-shrink-0 mr-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (idx === 0) return;
                            const updated = [...lineItems];
                            [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
                            setLineItems(updated);
                          }}
                          disabled={idx === 0}
                          className="text-slate-500 hover:text-[#14b8a6] disabled:opacity-30 p-0.5"
                          aria-label="Move up"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (idx === lineItems.length - 1) return;
                            const updated = [...lineItems];
                            [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
                            setLineItems(updated);
                          }}
                          disabled={idx === lineItems.length - 1}
                          className="text-slate-500 hover:text-[#14b8a6] disabled:opacity-30 p-0.5"
                          aria-label="Move down"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => toggleItemExpand(item.id)}>
                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                        <span className="text-sm font-semibold text-slate-800 truncate">{getServiceName(item) || 'Custom Item'}</span>
                        <span className="text-sm font-semibold text-slate-600 flex-shrink-0 ml-auto mr-2">
                          ${((item.qty || 1) * (item.price || 0)).toFixed(2)}
                        </span>
                        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${expandedItems.has(item.id) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <button onClick={() => removeLineItem(item.id)} className="text-red-400 hover:text-red-600 ml-2 flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Collapsible body */}
                    {expandedItems.has(item.id) && (
                    <div className="px-4 py-2 space-y-2">
                      {/* Custom service name */}
                      {item.service === 'Custom' && (
                        <div>
                          <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Service Name</label>
                          <input
                            type="text"
                            placeholder="Enter service name"
                            value={item.customService}
                            onChange={(e) => updateLineItem(item.id, 'customService', e.target.value)}
                            className="w-full px-2 py-1 border-b border-slate-300 text-sm focus:border-[#14b8a6] focus:outline-none bg-transparent"
                          />
                        </div>
                      )}

                      {/* Description + Taxable */}
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Description</label>
                          <textarea
                            placeholder="Service description"
                            value={item.description}
                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                            rows={2}
                            className="w-full px-2 py-1 border-b border-slate-300 text-sm focus:border-[#14b8a6] focus:outline-none bg-transparent resize-none leading-snug"
                          />
                        </div>
                        <div className="flex flex-col items-center pt-3">
                          <span className="text-[10px] text-slate-500 mb-1">Taxable</span>
                          <button
                            type="button"
                            onClick={() => updateLineItem(item.id, 'taxable', !item.taxable)}
                            className={`w-9 h-5 rounded-full transition-colors relative ${item.taxable ? 'bg-[#14b8a6]' : 'bg-slate-300'}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.taxable ? 'left-4' : 'left-0.5'}`} />
                          </button>
                        </div>
                      </div>

                      {/* Price × Qty + Total */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Price</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.price || ''}
                            onChange={(e) => updateLineItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full px-2 py-1 border-b border-slate-300 text-sm focus:border-[#14b8a6] focus:outline-none bg-transparent"
                          />
                        </div>
                        <span className="text-slate-400 text-lg mt-3">×</span>
                        <div className="w-24">
                          <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Qty</label>
                          <div className="flex items-center border-b border-slate-300">
                            <button
                              type="button"
                              onClick={() => updateLineItem(item.id, 'qty', Math.max(1, (item.qty || 1) - 1))}
                              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-[#14b8a6] hover:bg-slate-100 rounded transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                              </svg>
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.qty || ''}
                              onChange={(e) => updateLineItem(item.id, 'qty', parseInt(e.target.value) || 1)}
                              className="w-8 px-0 py-1 text-sm focus:outline-none bg-transparent text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateLineItem(item.id, 'qty', (item.qty || 1) + 1)}
                              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-[#14b8a6] hover:bg-slate-100 rounded transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="text-right mt-3">
                          <span className="text-xs text-slate-500">Total</span>
                          <p className="text-sm font-bold text-slate-800">${((item.qty || 1) * (item.price || 0)).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex justify-end gap-6 text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium w-24 text-right">${subtotal.toFixed(2)}</span>
                </div>

                {/* Discount */}
                <div className="flex justify-end">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2 w-64">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-medium text-green-700">Discount</span>
                      <div className="flex gap-1">
                        {[5, 10, 20].map(pct => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setDiscount(Math.round(subtotal * pct) / 100)}
                            className="text-[10px] bg-green-600 hover:bg-green-700 text-white px-1.5 py-0.5 rounded font-medium transition"
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-green-600 text-sm">-$</span>
                      <input
                        type="number"
                        value={discount || ''}
                        onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="flex-1 px-2 py-1 border border-green-300 rounded text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      {discount > 0 && (
                        <button type="button" onClick={() => setDiscount(0)} className="text-red-500 hover:text-red-700 p-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {discount > 0 && (
                  <div className="flex justify-end gap-6 text-sm text-green-600">
                    <span>After Discount</span>
                    <span className="font-medium w-24 text-right">${discountedSubtotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-end gap-6 text-sm">
                  <span className="text-slate-500">Tax (8.25%)</span>
                  <span className="font-medium w-24 text-right">${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-end gap-6 text-lg font-bold border-t border-slate-200 pt-2">
                  <span>Total</span>
                  <span className="text-[#14b8a6] w-24 text-right">${total.toFixed(2)}</span>
                </div>
                {hasDeposit && (
                  <>
                    <div className="flex justify-end gap-6 text-sm text-teal-600 pt-1">
                      <span>Deposit Paid</span>
                      <span className="w-24 text-right">-${existingDeposit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-end gap-6 text-base font-bold text-red-600 border-t border-slate-300 pt-1">
                      <span>Balance Due</span>
                      <span className="w-24 text-right">${(total - existingDeposit).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Attach Photos */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Attach Photos
                    <span className="text-xs text-slate-400 font-normal">(optional)</span>
                  </h3>
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    disabled={loadingPhotos}
                    className="text-sm text-[#14b8a6] hover:text-[#0d9488] font-medium flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Photos
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files)}
                  />
                </div>

                {loadingPhotos && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                    <div className="animate-spin w-4 h-4 border-2 border-[#14b8a6] border-t-transparent rounded-full"></div>
                    Processing photos...
                  </div>
                )}

                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {photos.map(photo => (
                      <div key={photo.id} className="relative group">
                        <img
                          src={photo.dataUrl}
                          alt={photo.name}
                          className="w-full h-32 object-cover rounded-lg border border-slate-200"
                        />
                        <button
                          onClick={() => setAnnotatingPhoto(photo)}
                          className="absolute bottom-1.5 left-1.5 w-7 h-7 bg-white/90 text-slate-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow"
                          title="Draw on photo"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setPhotos(prev => prev.filter(p => p.id !== photo.id))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {photos.length === 0 && !loadingPhotos && (() => {
                  let savedCount = 0;
                  try { savedCount = JSON.parse(lead['Before Photos URL'] || '[]').length; } catch {}
                  return savedCount > 0
                    ? <p className="text-xs text-green-600 text-center py-2 flex items-center justify-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        {savedCount} photo{savedCount !== 1 ? 's' : ''} already saved to Drive — add more or continue
                      </p>
                    : <p className="text-xs text-slate-400 text-center py-2">Photos of current condition will appear on the estimate PDF</p>;
                })()}
              </div>
            </div>
          )}

          {/* ── STEP 2: REVIEW ── */}
          {step === 'review' && (
            <div className="space-y-2">
              {/* Tech Notes */}
              {techNotes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <p className="text-xs font-semibold text-amber-700 mb-0.5">FINDINGS & CONDITIONS</p>
                  <p className="text-sm text-amber-800 leading-snug">{techNotes}</p>
                </div>
              )}

              {/* Estimate Summary */}
              <div className="bg-slate-50 rounded-lg p-3">
                <h3 className="font-semibold text-slate-700 mb-2">Estimate Summary</h3>
                {lineItems.map((item, idx) => (
                  <div key={idx} className={`py-2 px-2 ${idx > 0 ? 'border-t border-slate-300' : ''}`}>
                    <div className="flex justify-between gap-4 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-slate-800">
                          {getServiceName(item)}
                        </span>
                        <span className="text-xs text-slate-500 ml-3">
                          ${(item.price || 0).toFixed(2)} × {item.qty || 1}
                        </span>
                        {item.description && (
                          <p className="text-xs text-slate-500 ml-3 mt-0.5 leading-relaxed">{item.description}</p>
                        )}
                      </div>
                      <span className="font-medium flex-shrink-0">${((item.qty || 1) * (item.price || 0)).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
                <div className="border-t-2 border-slate-500 mt-2 pt-2 space-y-1">
                  {discount > 0 && (
                    <div className="flex justify-end gap-6 text-sm text-green-600">
                      <span>Discount</span>
                      <span className="w-24 text-right">-${discount.toFixed(2)}</span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-end gap-6 text-sm">
                      <span className="text-slate-500">Tax (8.25%)</span>
                      <span className="w-24 text-right">${tax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-end gap-6 font-bold pt-1">
                    <span>Estimated Total</span>
                    <span className="text-[#14b8a6] w-24 text-right">${total.toFixed(2)}</span>
                  </div>
                  {hasDeposit && (
                    <>
                      <div className="flex justify-end gap-6 text-sm text-teal-600 pt-1">
                        <span>Deposit Paid</span>
                        <span className="w-24 text-right">-${existingDeposit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-end gap-6 font-bold text-red-600 border-t border-slate-300 pt-1">
                        <span>Balance Due</span>
                        <span className="w-24 text-right">${(total - existingDeposit).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>


              {/* Option A: Customer approves → get signature */}
              <button
                onClick={() => { setError(''); setStep('sign'); }}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Customer Approves — Get Signature
              </button>

              {/* Option B: Send estimate, customer decides later (subtle) */}
              <button
                onClick={handleSaveEstimate}
                disabled={loading}
                className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs font-medium transition disabled:opacity-50"
              >
                {loading ? (
                  <div className="animate-spin w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full mx-auto"></div>
                ) : (
                  'Save & send estimate'
                )}
              </button>
            </div>
          )}

          {/* ── STEP 3: SIGN ── */}
          {step === 'sign' && (
            <div className="space-y-4">
              {/* Agreement */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-medium mb-1">Customer Agreement</p>
                <p>By signing below, I authorize ClearAir Solutions to perform the services listed above at the estimated price of <strong>${total.toFixed(2)}</strong>.</p>
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
                  Signed at {signatureTimestamp}
                </p>
              )}
            </div>
          )}

          {/* ── STEP 4: CHOOSE (after signature) ── */}
          {step === 'choose' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-700 font-medium mb-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Invoice Generated & Signed
                </div>
                {invoiceNumber && <p className="text-sm text-green-600 font-medium">Invoice #{invoiceNumber}</p>}
                <p className="text-sm text-green-600">Signed at {signatureTimestamp}</p>
                <p className="text-lg font-bold text-green-700 mt-1">Total: ${total.toFixed(2)}</p>
                {invoiceDriveLink && (
                  <a href={invoiceDriveLink} target="_blank" rel="noopener noreferrer" className="text-xs text-[#14b8a6] hover:underline mt-1 inline-block">
                    View PDF in Drive
                  </a>
                )}
              </div>

              <p className="text-center text-slate-600 font-medium">What would you like to do?</p>

              {/* Option A: Collect Full Payment Now */}
              <button
                onClick={() => { setError(''); setAmountPaid((hasDeposit ? (total - existingDeposit) : total).toFixed(2)); setStep('payment'); }}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Collect Full Payment
              </button>

              {/* Option B: Collect Deposit & Schedule */}
              <button
                onClick={() => { setError(''); setStep('deposit'); }}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Collect Deposit — Schedule for Later
              </button>

            </div>
          )}

          {/* ── STEP 3B: PAYMENT ── */}
          {step === 'payment' && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total:</span>
                  <span className="font-bold text-slate-700">${total.toFixed(2)}</span>
                </div>
                {hasDeposit && (
                  <>
                    <div className="flex justify-between text-teal-600">
                      <span>Deposit Paid:</span>
                      <span>-${existingDeposit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-300 pt-1">
                      <span className="font-bold text-red-600">Balance Due:</span>
                      <span className="font-bold text-red-600">${(total - existingDeposit).toFixed(2)}</span>
                    </div>
                  </>
                )}
                {!hasDeposit && (
                  <div className="flex justify-between">
                    <span className="font-bold text-[#14b8a6]">Amount to Collect:</span>
                    <span className="font-bold text-[#14b8a6]">${total.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {['Cash', 'Zelle', 'Card', 'Check'].map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-3 rounded-lg font-medium text-sm transition ${
                        paymentMethod === method ? 'bg-[#14b8a6] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount — fixed, not editable */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Amount to Collect</label>
                <div className="px-4 py-3 bg-slate-100 border border-slate-300 rounded-lg text-lg font-bold text-slate-800">
                  ${(hasDeposit ? (total - existingDeposit) : total).toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* ── DEPOSIT ── */}
          {step === 'deposit' && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="font-bold text-slate-700">Estimate Total: <span className="text-[#14b8a6]">${total.toFixed(2)}</span></p>
              </div>

              {/* Deposit Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Deposit Amount</label>
                <div className="flex gap-2 mb-2">
                  {[20, 25, 50].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDepositAmount((total * pct / 100).toFixed(2))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        depositAmount === (total * pct / 100).toFixed(2)
                          ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-slate-400 text-lg">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg text-lg font-medium"
                  />
                </div>
                {depositAmount && parseFloat(depositAmount) > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Balance remaining: ${(total - parseFloat(depositAmount)).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {['Cash', 'Zelle', 'Card', 'Check'].map(method => (
                    <button
                      key={method}
                      onClick={() => setDepositMethod(method)}
                      className={`py-3 rounded-lg font-medium text-sm transition ${
                        depositMethod === method ? 'bg-[#14b8a6] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Schedule Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-base"
                />
              </div>

              {/* Time Window */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Time Window</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {['8:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'].map(tw => (
                    <button
                      key={tw}
                      onClick={() => setScheduleTimeWindow(tw)}
                      className={`py-3 rounded-lg font-medium text-xs transition ${
                        scheduleTimeWindow === tw ? 'bg-[#14b8a6] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {tw}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={!['8:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'].includes(scheduleTimeWindow) ? scheduleTimeWindow : ''}
                  onChange={(e) => setScheduleTimeWindow(e.target.value)}
                  placeholder="Or type custom time (e.g., 9:00AM - 12:00PM)"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-1">
                {doneType === 'estimate' && 'Estimate Saved and PDF Generated!'}
                {doneType === 'invoice' && 'Payment Saved!'}
                {doneType === 'deposit' && 'Deposit Collected & Job Scheduled!'}
              </h3>
              {invoiceNumber && (
                <p className="text-sm text-slate-600 font-medium">{doneType === 'estimate' ? 'Estimate' : 'Invoice'} #{invoiceNumber}</p>
              )}
              {invoiceDriveLink && (
                <a href={invoiceDriveLink} target="_blank" rel="noopener noreferrer" className="text-xs text-[#14b8a6] hover:underline">
                  View PDF in Drive
                </a>
              )}
              <p className="text-sm text-slate-500 mb-6 mt-2">
                {doneType === 'estimate' && `Estimated Total: $${total.toFixed(2)}`}
                {doneType === 'invoice' && `$${amountPaid} via ${paymentMethod}`}
                {doneType === 'deposit' && `Deposit: $${depositAmount} via ${depositMethod} — Balance: $${(total - parseFloat(depositAmount || '0')).toFixed(2)}`}
              </p>
              {doneType === 'deposit' && (
                <p className="text-sm text-blue-600 mb-4">
                  Scheduled: {scheduleDate} | {scheduleTimeWindow}
                </p>
              )}

              {/* Before Photos (estimate done step only) */}
              {doneType === 'estimate' && (() => {
                let drivePhotoCount = 0;
                try { drivePhotoCount = JSON.parse(lead['Before Photos URL'] || '[]').length; } catch {}
                const totalPhotos = photos.length + drivePhotoCount;

                return (
                  <div className="border border-slate-200 rounded-lg p-3 mb-4 text-left">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        </svg>
                        Before Photos
                      </h4>
                      <label className="text-xs text-[#14b8a6] hover:text-[#0d9488] font-medium flex items-center gap-1 cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add
                        <input
                          type="file"
                          accept="image/*,.heic,.heif"
                          multiple
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(e.target.files)}
                        />
                      </label>
                    </div>
                    {loadingPhotos && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                        <div className="animate-spin w-3 h-3 border-2 border-[#14b8a6] border-t-transparent rounded-full"></div>
                        Processing...
                      </div>
                    )}
                    {/* Show new photos from this session */}
                    {photos.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {photos.map(photo => (
                          <div key={photo.id} className="relative group">
                            <img src={photo.dataUrl} alt={photo.name} className="w-full h-20 object-cover rounded border border-slate-200" />
                            <button
                              onClick={() => setAnnotatingPhoto(photo)}
                              className="absolute bottom-1 left-1 w-5 h-5 bg-white/90 text-slate-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setPhotos(prev => prev.filter(p => p.id !== photo.id))}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-[10px]"
                            >×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Show Drive photo count */}
                    {drivePhotoCount > 0 && (
                      <p className="text-xs text-green-600 flex items-center gap-1 py-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {drivePhotoCount} photo{drivePhotoCount !== 1 ? 's' : ''} saved — will be included in PDF
                      </p>
                    )}
                    {totalPhotos === 0 && !loadingPhotos && (
                      <p className="text-xs text-slate-400 text-center py-2">Add before photos to include in estimate PDF</p>
                    )}
                  </div>
                );
              })()}

              <button
                onClick={() => {
                  setShowSendModal(true);
                  // Save photos to Drive in background (non-blocking)
                  if (doneType === 'estimate' && photos.length > 0) {
                    fetch('/api/documents/save-assets', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        leadId: lead['Lead ID'],
                        rowIndex: lead.rowIndex,
                        photos,
                        photoType: 'before',
                      }),
                    }).catch(() => {});
                  }
                }}
                className="w-full py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition mb-3"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                {doneType === 'estimate' ? 'Send Estimate' : doneType === 'deposit' ? 'Send Deposit Receipt' : 'Send Invoice'} to Customer
              </button>
              <button
                onClick={handleClose}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium transition"
              >
                Skip — Close
              </button>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        {!['review', 'choose', 'done'].includes(step) && lineItems.length > 0 && (
          <div className="px-5 py-4 bg-slate-50 border-t flex gap-3 flex-shrink-0">
            {step === 'estimate' && (
              <>
                <button onClick={handleClose} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition">
                  Cancel
                </button>
                <button
                  onClick={() => setStep('review')}
                  disabled={lineItems.length === 0 || !lineItems.some(i => i.service && i.price > 0) || !techNotes.trim()}
                  className="flex-1 py-3 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition disabled:opacity-50"
                >
                  Review Estimate
                </button>
              </>
            )}

            {step === 'sign' && (
              <>
                <button onClick={() => setStep('review')} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition">
                  Back
                </button>
                <button
                  onClick={handleApproveAndGenerate}
                  disabled={!signature || loading}
                  className="flex-1 py-3 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : 'Approve & Continue'}
                </button>
              </>
            )}

            {step === 'payment' && (
              <>
                <button onClick={() => setStep('choose')} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition">
                  Back
                </button>
                <button
                  onClick={handleCompletePayment}
                  disabled={loading || !paymentMethod}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Complete Payment
                    </>
                  )}
                </button>
              </>
            )}

            {step === 'deposit' && (
              <>
                <button onClick={() => setStep('choose')} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition">
                  Back
                </button>
                <button
                  onClick={handleCollectDeposit}
                  disabled={loading || !depositMethod || !depositAmount || !scheduleDate || !scheduleTimeWindow}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Collect Deposit & Schedule
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Send Document Modal */}
      {showSendModal && (
        <SendDocumentModal
          lead={lead}
          type={doneType === 'estimate' ? 'estimate' : 'invoice'}
          driveUrl={invoiceDriveLink}
          onClose={() => { setShowSendModal(false); handleClose(); }}
          onSuccess={() => { setShowSendModal(false); handleClose(); }}
          lineItems={getLineItemsForApi()}
          totals={getTotals()}
          isPaid={doneType === 'invoice'}
          amountPaid={amountPaid}
          paymentMethod={paymentMethod}
          paymentDate={new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
          signatureDataUrl={signature}
          signatureTimestamp={signatureTimestamp}
          photos={photos}
          techNotes={techNotes}
        />
      )}
      {/* Annotation Overlay */}
      {annotatingPhoto && (
        <div className="fixed inset-0 bg-black z-[10001] flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0 gap-3">
            <div className="flex items-center gap-2">
              {['#ef4444','#f97316','#facc15','#ffffff'].map(color => (
                <button
                  key={color}
                  onClick={() => setDrawColor(color)}
                  className={`w-8 h-8 rounded-full border-4 transition ${drawColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <div className="w-px h-6 bg-white/30 mx-1" />
              {[3, 6, 12].map(size => (
                <button
                  key={size}
                  onClick={() => setBrushSize(size)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition ${brushSize === size ? 'bg-white/30' : 'bg-white/10'}`}
                >
                  <div className="rounded-full bg-white" style={{ width: size + 4, height: size + 4 }} />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleAnnotateUndo} className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20 transition">Undo</button>
              <button onClick={handleAnnotateClear} className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20 transition">Clear</button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <canvas
              ref={annotateCanvasRef}
              className="max-w-full max-h-full object-contain touch-none"
              style={{ cursor: 'crosshair' }}
              onMouseDown={startDraw}
              onMouseMove={drawLine}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={drawLine}
              onTouchEnd={endDraw}
            />
          </div>

          {/* Bottom actions */}
          <div className="flex gap-3 px-4 py-4 bg-black/80 shrink-0">
            <button
              onClick={() => { setAnnotatingPhoto(null); undoStackRef.current = []; }}
              className="flex-1 py-3 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/20 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleAnnotateDone}
              className="flex-[2] py-3 bg-[#14b8a6] text-white rounded-xl font-semibold hover:bg-[#0d9488] transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
