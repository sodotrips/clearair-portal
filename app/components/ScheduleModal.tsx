'use client';

import { useState } from 'react';

interface Lead {
  [key: string]: string;
}

interface ScheduleModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ScheduleModal({ lead, onClose, onSuccess }: ScheduleModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const techs = ['Amit', 'Tech 2', 'Subcontractor'];
  const timeWindows = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];

  // Convert MM/DD/YYYY to YYYY-MM-DD for date input
  const formatDateForInput = (dateStr: string) => {
    if (!dateStr || dateStr === '-') return '';
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, month, day, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return '';
  };

  // Convert YYYY-MM-DD to MM/DD/YYYY for saving
  const formatDateForSave = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  };

  const [appointmentDate, setAppointmentDate] = useState(formatDateForInput(lead['Appointment Date']));
  const [timeWindow, setTimeWindow] = useState(lead['Time Window'] || '');
  const [assignedTo, setAssignedTo] = useState(lead['Assigned To'] || '');

  // Calculate follow-up date: appointment date + 3 days (default)
  // Using Houston timezone to avoid off-by-one errors
  const calculateFollowUpDate = (apptDate: string) => {
    if (!apptDate) return '';
    // Parse as local date to avoid UTC offset issues
    const [year, month, day] = apptDate.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0); // noon to avoid edge cases
    date.setDate(date.getDate() + 3);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    const newDay = String(date.getDate()).padStart(2, '0');
    return `${newYear}-${newMonth}-${newDay}`;
  };

  const [followUpDate, setFollowUpDate] = useState(() => {
    // If follow-up date already exists, use it; otherwise calculate from appointment date
    if (lead['Follow-up Date']) {
      return formatDateForInput(lead['Follow-up Date']);
    }
    if (lead['Appointment Date']) {
      return calculateFollowUpDate(formatDateForInput(lead['Appointment Date']));
    }
    return '';
  });

  // Auto-update follow-up date when appointment date changes
  const handleAppointmentDateChange = (newDate: string) => {
    setAppointmentDate(newDate);
    // Auto-set follow-up to appointment + 3 days
    if (newDate) {
      setFollowUpDate(calculateFollowUpDate(newDate));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const updates: Record<string, string> = {
        'Status': appointmentDate ? 'SCHEDULED' : lead['Status'],
      };

      if (appointmentDate) {
        updates['Appointment Date'] = formatDateForSave(appointmentDate);
      }
      if (timeWindow) {
        updates['Time Window'] = timeWindow;
      }
      if (assignedTo) {
        updates['Assigned To'] = assignedTo;
      }
      if (followUpDate) {
        updates['Follow-up Date'] = formatDateForSave(followUpDate);
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
        setError(result.error || 'Failed to update schedule');
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#0a2540] text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">Schedule Appointment</h2>
            <p className="text-slate-400 text-sm">{lead['Customer Name']} - {lead['Lead ID']}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>
          )}

          {/* Customer Info Summary */}
          <div className="bg-slate-50 p-3 rounded-lg text-sm">
            <p><span className="font-medium">Phone:</span> {lead['Phone Number']}</p>
            <p><span className="font-medium">Address:</span> {lead['Address']}, {lead['City']}</p>
            <p><span className="font-medium">Service:</span> {lead['Service Requested']}</p>
          </div>

          <div>
            <label className={labelClass}>Appointment Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => handleAppointmentDateChange(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Time Window <span className="text-red-500">*</span></label>
            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value)}
              required
              className={inputClass}
            >
              <option value="">Select time...</option>
              {timeWindows.map(tw => <option key={tw} value={tw}>{tw}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Assign Technician <span className="text-red-500">*</span></label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              required
              className={inputClass}
            >
              <option value="">Select tech...</option>
              {techs.map(tech => <option key={tech} value={tech}>{tech}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Follow-up Date</label>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-slate-500 mt-1">Auto-set to appointment + 3 days (editable)</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
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
                  Schedule
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
