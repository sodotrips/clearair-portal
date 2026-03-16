'use client';

import { useState, useRef } from 'react';
import { generatePhotoPdf, PhotoItem, JobInfo } from '../lib/generatePhotoPdf';

interface Lead {
  [key: string]: string;
}

interface PhotosModalProps {
  lead: Lead;
  onClose: () => void;
}

function isHeicOrUnknown(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type === 'image/heic' || type === 'image/heif' || type === '' || name.endsWith('.heic') || name.endsWith('.heif');
}

async function convertViaServer(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/photos/convert', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Server conversion failed');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function compressViaCanvas(objectUrl: string, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height / width) * maxDim);
          width = maxDim;
        } else {
          width = Math.round((width / height) * maxDim);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failed'));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = objectUrl;
  });
}

async function fileToCompressedJpeg(file: File, maxDim: number = 1200, quality: number = 0.7): Promise<string> {
  // HEIC/HEIF files: send to server for conversion (sharp handles all variants)
  if (isHeicOrUnknown(file)) {
    const jpegUrl = await convertViaServer(file);
    try {
      return await compressViaCanvas(jpegUrl, maxDim, quality);
    } finally {
      URL.revokeObjectURL(jpegUrl);
    }
  }

  // Standard formats (JPEG, PNG, WebP): compress client-side
  const objectUrl = URL.createObjectURL(file);
  try {
    return await compressViaCanvas(objectUrl, maxDim, quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function PhotosModal({ lead, onClose }: PhotosModalProps) {
  const [activeTab, setActiveTab] = useState<'before' | 'after'>('before');
  const [beforePhotos, setBeforePhotos] = useState<PhotoItem[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<PhotoItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const currentPhotos = activeTab === 'before' ? beforePhotos : afterPhotos;
  const setCurrentPhotos = activeTab === 'before' ? setBeforePhotos : setAfterPhotos;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoadingPhotos(true);
    setError('');
    const newPhotos: PhotoItem[] = [];
    let failCount = 0;
    let lastErr = '';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const info = `${file.name} (${file.type || 'no-type'}, ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
        console.log(`Processing photo ${i + 1}/${files.length}: ${info}`);
        const compressed = await fileToCompressedJpeg(file);
        newPhotos.push({
          id: `${Date.now()}-${i}`,
          dataUrl: compressed,
          name: file.name,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : JSON.stringify(err);
        console.error(`Failed to process ${file.name}:`, err);
        failCount++;
        lastErr = `${file.name}: ${errMsg}`;
      }
    }

    if (newPhotos.length > 0) {
      setCurrentPhotos(prev => [...prev, ...newPhotos]);
    }
    if (failCount > 0) {
      setError(`${failCount} photo${failCount > 1 ? 's' : ''} failed. ${lastErr}`);
    }

    setLoadingPhotos(false);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const removePhoto = (id: string) => {
    setCurrentPhotos(prev => prev.filter(p => p.id !== id));
  };

  const handleGeneratePdf = async () => {
    setGenerating(true);
    setError('');
    try {
      const jobInfo: JobInfo = {
        customerName: lead['Customer Name'] || '',
        address: lead['Address'] || '',
        city: lead['City'] || '',
        service: lead['Service Requested'] || '',
        date: lead['Appointment Date'] || '',
        leadId: lead['Lead ID'] || '',
      };

      const blob = await generatePhotoPdf(jobInfo, beforePhotos, afterPhotos);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (lead['Customer Name'] || 'Job').replace(/[^a-zA-Z0-9]/g, '-');
      const dateStr = (lead['Appointment Date'] || new Date().toLocaleDateString()).replace(/\//g, '-');
      a.href = url;
      a.download = `ClearAir-Photos-${safeName}-${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess(true);
    } catch (err) {
      console.error('PDF generation failed:', err);
      setError('Failed to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const totalPhotos = beforePhotos.length + afterPhotos.length;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="bg-[#0a2540] text-white px-6 py-4 rounded-t-xl flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-lg font-semibold">Job Photos</h2>
              <p className="text-slate-400 text-sm">{lead['Customer Name']} - {lead['Lead ID']}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Job Summary */}
          <div className="px-6 pt-4 pb-2 shrink-0">
            <div className="bg-slate-50 p-3 rounded-lg text-sm">
              <p><span className="font-medium">Service:</span> {lead['Service Requested']}</p>
              <p><span className="font-medium">Address:</span> {lead['Address']}, {lead['City']}</p>
              <p><span className="font-medium">Date:</span> {lead['Appointment Date']}</p>
            </div>
          </div>

          {/* Tab Toggle */}
          <div className="px-6 py-3 shrink-0">
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('before')}
                className={`flex-1 py-2.5 rounded-md text-sm font-semibold transition flex items-center justify-center gap-2 ${
                  activeTab === 'before'
                    ? 'bg-[#14b8a6] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Before
                {beforePhotos.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                    activeTab === 'before' ? 'bg-white/20' : 'bg-slate-300'
                  }`}>
                    {beforePhotos.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('after')}
                className={`flex-1 py-2.5 rounded-md text-sm font-semibold transition flex items-center justify-center gap-2 ${
                  activeTab === 'after'
                    ? 'bg-[#14b8a6] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                After
                {afterPhotos.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                    activeTab === 'after' ? 'bg-white/20' : 'bg-slate-300'
                  }`}>
                    {afterPhotos.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="px-6 shrink-0">
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>
            </div>
          )}
          {success && (
            <div className="px-6 shrink-0">
              <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                PDF downloaded! Attach it to your QuickBooks invoice.
              </div>
            </div>
          )}

          {/* Photo Grid */}
          <div className="px-6 py-3 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-3">
              {currentPhotos.map((photo) => (
                <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100">
                  <img
                    src={photo.dataUrl}
                    alt={photo.name}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setPreviewPhoto(photo.dataUrl)}
                  />
                  <button
                    onClick={() => removePhoto(photo.id)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-80 hover:opacity-100 transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

            </div>

            {/* Add Photo Buttons */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={loadingPhotos}
                className="py-3 rounded-lg border-2 border-dashed border-slate-300 hover:border-[#14b8a6] flex flex-col items-center justify-center gap-1.5 text-slate-500 hover:text-[#14b8a6] transition disabled:opacity-50"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-xs font-medium">Take Photo</span>
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                disabled={loadingPhotos}
                className="py-3 rounded-lg border-2 border-dashed border-slate-300 hover:border-[#14b8a6] flex flex-col items-center justify-center gap-1.5 text-slate-500 hover:text-[#14b8a6] transition disabled:opacity-50"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-medium">From Library</span>
              </button>
            </div>

            {loadingPhotos && (
              <div className="flex items-center justify-center gap-2 mt-3 text-slate-500 text-sm">
                <div className="animate-spin w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full"></div>
                Processing photo...
              </div>
            )}

            {currentPhotos.length === 0 && !loadingPhotos && (
              <p className="text-center text-slate-400 text-sm mt-4">
                Take a photo or choose from your library
              </p>
            )}
          </div>

          {/* Hidden File Inputs - separate for camera vs gallery */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-slate-50 rounded-b-xl shrink-0">
            <button
              onClick={handleGeneratePdf}
              disabled={totalPhotos === 0 || generating}
              className="w-full py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {generating ? (
                <>
                  <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full"></div>
                  Generating PDF...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generate PDF ({totalPhotos} photo{totalPhotos !== 1 ? 's' : ''})
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Full-screen Photo Preview */}
      {previewPhoto && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[10000] p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <button
            onClick={() => setPreviewPhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/30 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={previewPhoto}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
