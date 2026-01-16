'use client';

import { useState } from 'react';

interface Lead {
  [key: string]: string;
}

interface EditModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditModal({ lead, onClose, onSuccess }: EditModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cities = ['Houston', 'Katy', 'Sugar Land', 'Pearland', 'Spring', 'Cypress', 'The Woodlands', 'Humble', 'Pasadena', 'League City', 'Missouri City', 'Baytown', 'Conroe', 'Richmond', 'Tomball'];
  const services = ['Air Duct Cleaning', 'Dryer Vent Cleaning', 'Attic Insulation', 'Duct Replacement', 'Chimney Services'];
  const leadSources = ['Google Ads', 'Facebook Ads', 'Organic', 'Referral', 'Lead Company', 'Repeat Customer', 'Partner'];
  const propertyTypes = ['Single Family', 'Townhouse', 'Apartment', 'Commercial - Office'];
  const statuses = ['NEW', 'SCHEDULED', 'IN PROGRESS', 'QUOTED', 'CLOSED', 'CANCELED'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH'];

  // Form state
  const [customerName, setCustomerName] = useState(lead['Customer Name'] || '');
  const [phone, setPhone] = useState(lead['Phone Number'] || '');
  const [email, setEmail] = useState(lead['Email'] || '');
  const [address, setAddress] = useState(lead['Address'] || '');
  const [city, setCity] = useState(lead['City'] || '');
  const [zip, setZip] = useState(lead['Zip Code'] || '');
  const [propertyType, setPropertyType] = useState(lead['Property Type'] || '');
  const [leadSource, setLeadSource] = useState(lead['Lead Source'] || '');
  const [serviceRequested, setServiceRequested] = useState(lead['Service Requested'] || '');
  const [status, setStatus] = useState(lead['Status'] || 'NEW');
  const [priority, setPriority] = useState(lead['Priority Level'] || 'MEDIUM');
  const [customerNotes, setCustomerNotes] = useState(lead['Customer Issue/Notes'] || '');
  const [gateCode, setGateCode] = useState(lead['Gate Code'] || '');
  const [pets, setPets] = useState(lead['Pets'] || '');
  const [parkingInfo, setParkingInfo] = useState(lead['Parking Info'] || '');
  const [accessInstructions, setAccessInstructions] = useState(lead['Access Instructions'] || '');

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const updates: Record<string, string> = {
        'Customer Name': customerName,
        'Phone Number': phone,
        'Email': email,
        'Address': address,
        'City': city,
        'Zip Code': zip,
        'Property Type': propertyType,
        'Lead Source': leadSource,
        'Service Requested': serviceRequested,
        'Status': status,
        'Priority Level': priority,
        'Customer Issue/Notes': customerNotes,
        'Gate Code': gateCode,
        'Pets': pets,
        'Parking Info': parkingInfo,
        'Access Instructions': accessInstructions,
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
        setError(result.error || 'Failed to update lead');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm";
  const labelClass = "block text-slate-700 text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#0a2540] text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Edit Lead</h2>
            <p className="text-slate-400 text-sm">{lead['Lead ID']}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>
          )}

          <div className="space-y-4">
            {/* Status & Priority Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
                  {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Customer Info */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-[#0a2540] mb-3">Customer Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelClass}>Customer Name</label>
                  <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    maxLength={14}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Address</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>City</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Houston" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>ZIP Code</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    maxLength={5}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Property Type</label>
                  <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className={inputClass}>
                    <option value="">Select type...</option>
                    {propertyTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Lead Source</label>
                  <select value={leadSource} onChange={(e) => setLeadSource(e.target.value)} className={inputClass}>
                    <option value="">Select source...</option>
                    {leadSources.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Service Info */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-[#0a2540] mb-3">Service Details</h3>
              <div>
                <label className={labelClass}>Service Requested</label>
                <select value={serviceRequested} onChange={(e) => setServiceRequested(e.target.value)} className={inputClass}>
                  <option value="">Select service...</option>
                  {services.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Access Info */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-[#0a2540] mb-3">Access Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Gate Code</label>
                  <input type="text" value={gateCode} onChange={(e) => setGateCode(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Pets</label>
                  <input type="text" value={pets} onChange={(e) => setPets(e.target.value)} className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Parking Info</label>
                  <input type="text" value={parkingInfo} onChange={(e) => setParkingInfo(e.target.value)} className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Access Instructions</label>
                  <textarea value={accessInstructions} onChange={(e) => setAccessInstructions(e.target.value)} rows={2} className={inputClass} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-[#0a2540] mb-3">Notes</h3>
              <div>
                <label className={labelClass}>Customer Notes</label>
                <textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={3} className={inputClass} />
              </div>
            </div>
          </div>
        </form>

        {/* Footer - Fixed */}
        <div className="px-6 py-4 bg-slate-50 border-t flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
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
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
