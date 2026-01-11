'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import ScheduleModal from '../components/ScheduleModal';

// Dynamically import the map to avoid SSR issues with Leaflet
const JobMap = dynamic(() => import('../components/JobMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4 h-64 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading map...</div>
    </div>
  )
});

interface Lead {
  [key: string]: string;
}

export default function TechPortal() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTech, setSelectedTech] = useState(() => session?.user?.name || 'Amit');
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [rescheduleJob, setRescheduleJob] = useState<Lead | null>(null);
  // Houston timezone helper
  const getHoustonDate = (date: Date = new Date()) => {
    const houstonTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const year = houstonTime.getFullYear();
    const month = String(houstonTime.getMonth() + 1).padStart(2, '0');
    const day = String(houstonTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(() => getHoustonDate());
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const techs = ['Amit', 'Tech 2', 'Subcontractor'];

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    try {
      const response = await fetch('/api/leads');
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setLeads(data.leads || []);
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckInOut(leadId: string, action: 'checkin' | 'checkout') {
    setCheckingIn(leadId);
    try {
      const response = await fetch('/api/leads/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, action }),
      });
      const data = await response.json();
      if (data.success) {
        // Refresh leads to show updated status
        await fetchLeads();
      } else {
        alert(data.error || 'Failed to update');
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setCheckingIn(null);
    }
  }

  const formatPhone = (phone: string) => {
    if (!phone || phone === '-') return '-';
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-') return '-';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      return `${month}/${day}/${year}`;
    }
    return dateStr;
  };

  const isDateMatch = (apptDate: string, targetDate: string) => {
    if (!apptDate) return false;

    // Convert target date (YYYY-MM-DD) to compare
    const [targetYear, targetMonth, targetDay] = targetDate.split('-');
    const targetFormatted = `${targetMonth}/${targetDay}/${targetYear}`;

    // Check if appointment date matches
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(apptDate)) {
      const [month, day, year] = apptDate.split('/');
      const apptFormatted = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
      return apptFormatted === targetFormatted;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
      return apptDate === targetDate;
    }

    return false;
  };

  // Filter jobs for selected tech and date
  const myJobs = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    const isAssigned = l['Assigned To'] === selectedTech;
    const isScheduled = status === 'SCHEDULED' || status === 'IN PROGRESS';
    const isOnDate = isDateMatch(l['Appointment Date'], selectedDate);
    return isAssigned && isScheduled && isOnDate;
  }).sort((a, b) => {
    const timeOrder = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];
    return timeOrder.indexOf(a['Time Window'] || '') - timeOrder.indexOf(b['Time Window'] || '');
  });

  // Get completed jobs for today
  const completedToday = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    const isAssigned = l['Assigned To'] === selectedTech;
    const isCompleted = status === 'COMPLETED';
    const isOnDate = isDateMatch(l['Appointment Date'], selectedDate);
    return isAssigned && isCompleted && isOnDate;
  });

  const statusStyles: Record<string, string> = {
    'NEW': 'bg-blue-100 text-blue-700',
    'SCHEDULED': 'bg-teal-100 text-teal-700',
    'IN PROGRESS': 'bg-purple-100 text-purple-700',
    'COMPLETED': 'bg-green-100 text-green-700',
  };

  // Helper to determine who the tech is representing
  const getRepresentingInfo = (job: Lead) => {
    const leadSource = (job['Lead Source'] || '').toLowerCase();
    const referralSource = job['Referral Source'] || job['Lead Provider'] || '';

    // Check if it's a lead gen company or partner
    const isLeadCompany = leadSource === 'lead company' || leadSource.includes('lead gen');
    const isPartner = leadSource === 'partner';

    if (isLeadCompany && referralSource) {
      return {
        name: referralSource.toUpperCase(),
        label: `Represent as ${referralSource} technician`,
        style: 'bg-amber-100 text-amber-800 border-amber-300',
        icon: '🏢'
      };
    } else if (isPartner && referralSource) {
      return {
        name: referralSource.toUpperCase(),
        label: 'Partner referral',
        style: 'bg-purple-100 text-purple-800 border-purple-300',
        icon: '🤝'
      };
    } else {
      return {
        name: 'CLEARAIR',
        label: 'Our direct customer',
        style: 'bg-teal-100 text-teal-800 border-teal-300',
        icon: '✓'
      };
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0); // noon to avoid any edge cases
    return date.toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  const isToday = (dateStr: string) => {
    return dateStr === getHoustonDate();
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-[#0a2540] text-white px-4 py-4 sticky top-0 z-20">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-1">
              <Image
                src="/clearair-logo.png"
                alt="ClearAir Solutions"
                width={75}
                height={23}
                priority
              />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Tech Portal</h1>
              <p className="text-slate-400 text-xs">{session?.user?.name || 'ClearAir Solutions'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="bg-[#1a3a5c] text-white border border-slate-600 rounded-lg px-3 py-2 text-sm"
            >
              {techs.map(tech => (
                <option key={tech} value={tech}>{tech}</option>
              ))}
            </select>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="p-4">
        {/* Date Selector */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const [year, month, day] = selectedDate.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                date.setDate(date.getDate() - 1);
                const newYear = date.getFullYear();
                const newMonth = String(date.getMonth() + 1).padStart(2, '0');
                const newDay = String(date.getDate()).padStart(2, '0');
                setSelectedDate(`${newYear}-${newMonth}-${newDay}`);
              }}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-center">
              <p className="text-lg font-semibold text-[#0a2540]">
                {formatDateDisplay(selectedDate)}
              </p>
              {isToday(selectedDate) && (
                <span className="text-xs bg-[#14b8a6] text-white px-2 py-0.5 rounded-full">Today</span>
              )}
            </div>
            <button
              onClick={() => {
                const [year, month, day] = selectedDate.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                date.setDate(date.getDate() + 1);
                const newYear = date.getFullYear();
                const newMonth = String(date.getMonth() + 1).padStart(2, '0');
                const newDay = String(date.getDate()).padStart(2, '0');
                setSelectedDate(`${newYear}-${newMonth}-${newDay}`);
              }}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📋</span>
              <div>
                <p className="text-2xl font-bold text-[#0a2540]">{myJobs.length}</p>
                <p className="text-xs text-slate-500">Jobs Scheduled</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <div>
                <p className="text-2xl font-bold text-green-600">{completedToday.length}</p>
                <p className="text-xs text-slate-500">Completed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Map showing all jobs for the day */}
        {!loading && myJobs.length > 0 && (
          <JobMap jobs={myJobs} />
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-slate-500 text-sm">Loading schedule...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        {/* Jobs List */}
        {!loading && !error && (
          <div className="space-y-3">
            {myJobs.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <span className="text-4xl mb-4 block">📅</span>
                <p className="text-slate-600 font-medium">No jobs scheduled</p>
                <p className="text-slate-400 text-sm">for {formatDateDisplay(selectedDate)}</p>
              </div>
            ) : (
              myJobs.map((job, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {/* Job Header */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedJob(expandedJob === job['Lead ID'] ? null : job['Lead ID'])}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-[#0a2540]">Job {idx + 1}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles[job['Status']?.toUpperCase()] || 'bg-slate-100'}`}>
                          {job['Status']}
                        </span>
                      </div>
                      <div className="bg-[#14b8a6]/10 text-[#14b8a6] px-3 py-1 rounded-lg text-sm font-semibold">
                        {job['Time Window'] || 'No time'}
                      </div>
                    </div>

                    <h3 className="font-semibold text-[#0a2540] text-lg">{job['Customer Name']}</h3>
                    <p className="text-slate-500 text-sm">{job['Address']}, {job['City']}</p>
                    <p className="text-slate-600 text-sm mt-1">{job['Service Requested']}</p>

                    {/* Representing Badge */}
                    {(() => {
                      const rep = getRepresentingInfo(job);
                      return (
                        <div className={`mt-2 px-3 py-1.5 rounded-lg border ${rep.style} inline-flex items-center gap-2`}>
                          <span>{rep.icon}</span>
                          <div>
                            <span className="font-bold text-sm">{rep.name}</span>
                            <span className="text-xs ml-1 opacity-75">- {rep.label}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Confirmation Status */}
                    {(() => {
                      const status = job['AU']?.toUpperCase();
                      if (status === 'YES') {
                        return (
                          <div className="mt-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg inline-flex items-center gap-2 text-sm">
                            <span>✓</span>
                            <span className="font-medium">Customer Confirmed</span>
                          </div>
                        );
                      } else if (status === 'PENDING') {
                        return (
                          <div className="mt-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg inline-flex items-center gap-2 text-sm">
                            <span>⏳</span>
                            <span className="font-medium">Awaiting Confirmation</span>
                          </div>
                        );
                      } else if (status === 'NO') {
                        return (
                          <div className="mt-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg inline-flex items-center gap-2 text-sm">
                            <span>⚠️</span>
                            <span className="font-medium">Needs Reschedule - Call First!</span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="mt-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg inline-flex items-center gap-2 text-sm">
                            <span>📞</span>
                            <span className="font-medium">Not Confirmed - Call to Verify</span>
                          </div>
                        );
                      }
                    })()}

                    <div className="flex items-center justify-between mt-3">
                      <a
                        href={`tel:${job['Phone Number']}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#14b8a6] text-sm font-medium"
                      >
                        {formatPhone(job['Phone Number'])}
                      </a>
                      <svg
                        className={`w-5 h-5 text-slate-400 transition-transform ${expandedJob === job['Lead ID'] ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedJob === job['Lead ID'] && (
                    <div className="border-t border-slate-100">
                      {/* Quick Actions */}
                      <div className="p-4 bg-slate-50 grid grid-cols-2 gap-2">
                        <a
                          href={`tel:${job['Phone Number']}`}
                          className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-3 rounded-lg font-medium transition"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          Call Customer
                        </a>
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(job['Address'] + ', ' + job['City'] + ', TX ' + job['Zip Code'])}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-medium transition"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Navigate
                        </a>
                      </div>

                      {/* Job Details */}
                      <div className="p-4 space-y-3">
                        {/* Representing Info - Prominent */}
                        {(() => {
                          const rep = getRepresentingInfo(job);
                          const isExternal = rep.name !== 'CLEARAIR';
                          return isExternal ? (
                            <div className={`p-3 rounded-lg border-2 ${rep.style} mb-3`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg">{rep.icon}</span>
                                <span className="font-bold">{rep.name}</span>
                              </div>
                              <p className="text-sm">{rep.label}</p>
                              <p className="text-xs mt-1 opacity-75">Introduce yourself as a {job['Referral Source'] || 'partner'} technician</p>
                            </div>
                          ) : null;
                        })()}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-slate-500">Service</p>
                            <p className="text-sm font-medium text-slate-800">{job['Service Requested']}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Property Type</p>
                            <p className="text-sm font-medium text-slate-800">{job['Property Type'] || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500"># of Units</p>
                            <p className="text-sm font-medium text-slate-800">{job['# of Units'] || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500"># of Vents</p>
                            <p className="text-sm font-medium text-slate-800">{job['# of Vents'] || '-'}</p>
                          </div>
                        </div>

                        {/* Access Info - Always show */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                          <p className="text-xs font-semibold text-amber-700 mb-2">ACCESS INFO</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-amber-600 text-xs">Gate Code:</span>
                              <p className="font-medium">{job['Gate Code'] || '-'}</p>
                            </div>
                            <div>
                              <span className="text-amber-600 text-xs">Pets:</span>
                              <p className="font-medium">{job['Pets?'] || 'None'}</p>
                            </div>
                            <div>
                              <span className="text-amber-600 text-xs">Parking:</span>
                              <p className="font-medium">{job['Parking Info'] || '-'}</p>
                            </div>
                            <div>
                              <span className="text-amber-600 text-xs">Access:</span>
                              <p className="font-medium">{job['Access Instructions'] || '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Customer Notes */}
                        {job['Customer Issue/Notes'] && (
                          <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-xs font-semibold text-slate-500 mb-1">NOTES</p>
                            <p className="text-sm text-slate-700">{job['Customer Issue/Notes']}</p>
                          </div>
                        )}

                        {/* Check In/Out Times */}
                        {(job['Check In'] || job['Check Out']) && (
                          <div className="mt-3 bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs text-slate-500">Check In</p>
                              <p className="text-sm font-semibold text-slate-700">{job['Check In'] || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Check Out</p>
                              <p className="text-sm font-semibold text-slate-700">{job['Check Out'] || '-'}</p>
                            </div>
                          </div>
                        )}

                        {/* Check In & Reschedule Buttons - for SCHEDULED jobs */}
                        {job['Status']?.toUpperCase() === 'SCHEDULED' && (
                          <div className="mt-4 space-y-2">
                            <button
                              onClick={() => handleCheckInOut(job['Lead ID'], 'checkin')}
                              disabled={checkingIn === job['Lead ID']}
                              className="w-full py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                            >
                              {checkingIn === job['Lead ID'] ? (
                                <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full"></div>
                              ) : (
                                <>
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                  </svg>
                                  Check In - Arrived
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => setRescheduleJob(job)}
                              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              Reschedule Appointment
                            </button>
                          </div>
                        )}

                        {/* Check Out Button - for IN PROGRESS jobs */}
                        {job['Status']?.toUpperCase() === 'IN PROGRESS' && (
                          <div className="mt-4 space-y-2">
                            <div className="py-2 px-3 bg-purple-100 text-purple-700 rounded-lg text-sm text-center flex items-center justify-center gap-2">
                              <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                              Job In Progress {job['Check In'] && `(started ${job['Check In']})`}
                            </div>
                            <button
                              onClick={() => handleCheckInOut(job['Lead ID'], 'checkout')}
                              disabled={checkingIn === job['Lead ID']}
                              className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                            >
                              {checkingIn === job['Lead ID'] ? (
                                <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full"></div>
                              ) : (
                                <>
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Check Out - Job Complete
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Completed Jobs Section */}
            {completedToday.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Completed Today
                </h3>
                <div className="space-y-2">
                  {completedToday.map((job, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-3 flex justify-between items-center opacity-75">
                      <div>
                        <p className="font-medium text-slate-700">{job['Customer Name']}</p>
                        <p className="text-xs text-slate-500">{job['Service Requested']}</p>
                      </div>
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                        Completed
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 flex justify-around">
        <button className="flex flex-col items-center text-[#14b8a6]">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs mt-1 font-medium">Schedule</span>
        </button>
        <button className="flex flex-col items-center text-slate-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <span className="text-xs mt-1">History</span>
        </button>
        <button className="flex flex-col items-center text-slate-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs mt-1">Settings</span>
        </button>
      </div>

      {/* Spacer for bottom nav */}
      <div className="h-20"></div>

      {/* Reschedule Modal */}
      {rescheduleJob && (
        <ScheduleModal
          lead={rescheduleJob}
          onClose={() => setRescheduleJob(null)}
          onSuccess={() => {
            setRescheduleJob(null);
            fetchLeads();
          }}
        />
      )}
    </div>
  );
}
