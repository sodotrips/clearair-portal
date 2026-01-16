'use client';

interface Lead {
  [key: string]: string;
}

interface ViewDetailsModalProps {
  lead: Lead;
  onClose: () => void;
  onEdit: () => void;
  onSchedule: () => void;
}

export default function ViewDetailsModal({ lead, onClose, onEdit, onSchedule }: ViewDetailsModalProps) {
  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      return `${month}/${day}/${year}`;
    }
    return dateStr;
  };

  const status = lead['Status']?.toUpperCase() || '';
  const statusStyles: Record<string, string> = {
    'NEW': 'bg-blue-100 text-blue-700',
    'SCHEDULED': 'bg-teal-100 text-teal-700',
    'QUOTED': 'bg-amber-100 text-amber-700',
    'IN PROGRESS': 'bg-purple-100 text-purple-700',
    'CLOSED': 'bg-emerald-100 text-emerald-700',
    'CANCELED': 'bg-slate-100 text-slate-500',
  };

  const priorityStyles: Record<string, string> = {
    'HIGH': 'bg-red-100 text-red-700',
    'MEDIUM': 'bg-amber-100 text-amber-700',
    'LOW': 'bg-green-100 text-green-700',
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-[#0a2540] uppercase tracking-wide mb-3 pb-2 border-b border-slate-200">
        {title}
      </h3>
      {children}
    </div>
  );

  const Field = ({ label, value, isLink, href }: { label: string; value: string; isLink?: boolean; href?: string }) => (
    <div className="mb-2">
      <span className="text-xs text-slate-500 block">{label}</span>
      {isLink && href ? (
        <a href={href} className="text-sm text-[#14b8a6] font-medium hover:underline">{value || ''}</a>
      ) : (
        <span className="text-sm text-slate-800 font-medium">{value || ''}</span>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0a2540] text-white px-6 py-4 flex justify-between items-start flex-shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-semibold">{lead['Customer Name']}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyles[status] || 'bg-slate-100 text-slate-600'}`}>
                {lead['Status'] || ''}
              </span>
            </div>
            <p className="text-slate-400 text-sm">{lead['Lead ID']}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex gap-2 flex-shrink-0">
          <a
            href={`tel:${lead['Phone Number']}`}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Call
          </a>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(lead['Address'] + ', ' + lead['City'] + ', TX ' + lead['Zip Code'])}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Navigate
          </a>
          <button
            onClick={() => { onClose(); onSchedule(); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Schedule
          </button>
          <button
            onClick={() => { onClose(); onEdit(); }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div>
              <Section title="Customer Information">
                <Field label="Name" value={lead['Customer Name']} />
                <Field
                  label="Phone"
                  value={formatPhone(lead['Phone Number'])}
                  isLink
                  href={`tel:${lead['Phone Number']}`}
                />
                <Field
                  label="Email"
                  value={lead['Email']}
                  isLink
                  href={`mailto:${lead['Email']}`}
                />
                <Field label="Property Type" value={lead['Property Type']} />
                <Field label="Lead Source" value={lead['Lead Source']} />
              </Section>

              <Section title="Location">
                <Field label="Address" value={lead['Address']} />
                <Field label="City" value={lead['City']} />
                <Field label="ZIP Code" value={lead['Zip Code']} />
                <div className="mt-3">
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(lead['Address'] + ', ' + lead['City'] + ', TX ' + lead['Zip Code'])}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#14b8a6] hover:underline flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in Google Maps
                  </a>
                </div>
              </Section>

              <Section title="Access Information">
                <Field label="Gate Code" value={lead['Gate Code']} />
                <Field label="Parking Info" value={lead['Parking Info']} />
                <Field label="Pets" value={lead['Pets']} />
                <Field label="Access Instructions" value={lead['Access Instructions']} />
              </Section>
            </div>

            {/* Right Column */}
            <div>
              <Section title="Service Details">
                <Field label="Service Requested" value={lead['Service Requested']} />
                <Field label="# of Units" value={lead['# of Units']} />
                <Field label="# of Vents" value={lead['# of Vents']} />
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500">Priority:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${priorityStyles[lead['Priority Level']?.toUpperCase()] || 'bg-slate-100 text-slate-600'}`}>
                    {lead['Priority Level'] || 'MEDIUM'}
                  </span>
                </div>
              </Section>

              <Section title="Scheduling">
                <Field label="Assigned To" value={lead['Assigned To']} />
                <Field label="Appointment Date" value={formatDate(lead['Appointment Date'])} />
                <Field label="Time Window" value={lead['Time Window']} />
                <Field label="Follow-up Date" value={formatDate(lead['Follow-up Date'])} />
              </Section>

              <Section title="Notes">
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700">
                  {lead['Customer Issue/Notes'] || 'No notes'}
                </div>
              </Section>

              <Section title="Timeline">
                <Field label="Created" value={formatDate(lead['Timestamp Received'])} />
                <Field label="Status" value={lead['Status']} />
              </Section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
