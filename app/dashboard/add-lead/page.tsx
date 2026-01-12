'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AddLeadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prefilledDate, setPrefilledDate] = useState('');

  // Get date from URL parameter
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      setPrefilledDate(dateParam);
    }
  }, [searchParams]);

  const cities = ['Houston', 'Katy', 'Sugar Land', 'Pearland', 'Spring', 'Cypress', 'The Woodlands', 'Humble', 'Pasadena', 'League City', 'Missouri City', 'Baytown', 'Conroe', 'Richmond', 'Tomball'];
  const services = ['Air Duct Cleaning', 'Dryer Vent Cleaning', 'Attic Insulation', 'Duct Replacement', 'Chimney Services'];
  const leadSources = ['Google Ads', 'Facebook Ads', 'Organic', 'Referral', 'Lead Company', 'Repeat Customer', 'Partner'];
  const propertyTypes = ['Single Family', 'Townhouse', 'Apartment', 'Commercial - Office'];
  const techs = ['Amit', 'Tech 2', 'Subcontractor'];
  const timeWindows = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  };

  // Convert YYYY-MM-DD to MM/DD/YYYY
  const formatDateToUS = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  };

  // Check if date is today or future (YYYY-MM-DD format from input)
  const isDateValid = (dateStr: string) => {
    if (!dateStr) return true; // Empty date is OK (optional)

    const appointmentDate = new Date(dateStr + 'T00:00:00');

    // Get today's date at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return appointmentDate >= today;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const leadData: Record<string, string> = {};
    formData.forEach((value, key) => {
      leadData[key] = value.toString();
    });

    // Validate appointment date is not in the past
    if (leadData.appointmentDate && !isDateValid(leadData.appointmentDate)) {
      setError('Appointment date cannot be in the past. Please select today or a future date.');
      setLoading(false);
      return;
    }

    // Convert appointment date to MM/DD/YYYY format
    if (leadData.appointmentDate) {
      leadData.appointmentDate = formatDateToUS(leadData.appointmentDate);
    }

    try {
      const response = await fetch('/api/leads/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData),
      });

      const result = await response.json();

      if (result.success) {
        alert('Lead created successfully! ' + result.leadId);
        router.push('/dashboard');
      } else {
        setError(result.error || 'Failed to create lead');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm";
  const labelClass = "block text-slate-700 text-sm font-medium mb-1.5";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#0a2540] text-white px-6 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#14b8a6] rounded-lg flex items-center justify-center font-bold text-lg">
              CA
            </div>
            <div>
              <h1 className="text-xl font-semibold">Add New Lead</h1>
              <p className="text-slate-400 text-sm">Create a new customer lead</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-slate-400 hover:text-white text-sm transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section: Customer Info */}
            <div>
              <h2 className="text-sm font-semibold text-[#0a2540] uppercase tracking-wide mb-4 pb-2 border-b border-slate-200">Customer Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={labelClass}>Customer Name <span className="text-red-500">*</span></label>
                  <input type="text" name="customerName" required className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>Phone <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    name="phone"
                    required
                    placeholder="(123) 456-7890"
                    maxLength={14}
                    onChange={(e) => e.target.value = formatPhone(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" name="email" placeholder="customer@email.com" className={inputClass} />
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>Address <span className="text-red-500">*</span></label>
                  <input type="text" name="address" required placeholder="123 Main St" className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>City <span className="text-red-500">*</span></label>
                  <input type="text" name="city" required placeholder="Houston" className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>ZIP Code <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    name="zip"
                    required
                    placeholder="77001"
                    maxLength={5}
                    onChange={(e) => e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Property Type</label>
                  <select name="propertyType" className={inputClass}>
                    <option value="">Select type...</option>
                    {propertyTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Lead Source <span className="text-red-500">*</span></label>
                  <select name="leadSource" required className={inputClass}>
                    <option value="">Select source...</option>
                    {leadSources.map(source => <option key={source} value={source}>{source}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Section: Service Info */}
            <div>
              <h2 className="text-sm font-semibold text-[#0a2540] uppercase tracking-wide mb-4 pb-2 border-b border-slate-200">Service Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={labelClass}>Service Requested <span className="text-red-500">*</span></label>
                  <select name="serviceRequested" required className={inputClass}>
                    <option value="">Select service...</option>
                    {services.map(service => <option key={service} value={service}>{service}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Number of Units</label>
                  <input type="number" name="numUnits" placeholder="0" className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>Number of Vents</label>
                  <input type="number" name="numVents" placeholder="0" className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>Priority</label>
                  <select name="priority" defaultValue="MEDIUM" className={inputClass}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section: Scheduling */}
            <div>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-[#0a2540] uppercase tracking-wide">Scheduling {prefilledDate ? '' : '(Optional)'}</h2>
                {prefilledDate && (
                  <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-full font-medium">
                    Date pre-selected from calendar
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Appointment Date</label>
                  <input
                    type="date"
                    name="appointmentDate"
                    defaultValue={prefilledDate}
                    key={prefilledDate}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Time Window</label>
                  <select name="timeWindow" className={inputClass}>
                    <option value="">Select time...</option>
                    {timeWindows.map(tw => <option key={tw} value={tw}>{tw}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Assign Technician</label>
                  <select name="assignedTo" className={inputClass}>
                    <option value="">Select tech...</option>
                    {techs.map(tech => <option key={tech} value={tech}>{tech}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Section: Access Info */}
            <div>
              <h2 className="text-sm font-semibold text-[#0a2540] uppercase tracking-wide mb-4 pb-2 border-b border-slate-200">Access Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Gate Code</label>
                  <input type="text" name="gateCode" placeholder="1234#" className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>Pets</label>
                  <input type="text" name="pets" placeholder="Dogs, cats, etc." className={inputClass} />
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>Parking Info</label>
                  <input type="text" name="parkingInfo" placeholder="Driveway, street parking, etc." className={inputClass} />
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>Access Instructions</label>
                  <textarea name="accessInstructions" placeholder="Special instructions..." rows={2} className={inputClass} />
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>Customer Notes</label>
                  <textarea name="customerNotes" placeholder="Any additional notes..." rows={3} className={inputClass} />
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Lead
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AddLeadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center">Loading...</div>}>
      <AddLeadContent />
    </Suspense>
  );
}
