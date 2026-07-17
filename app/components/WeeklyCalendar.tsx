'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SUBCONTRACTOR_BUCKET,
  UNNAMED_SUB_LABEL,
  getSubcontractorNames,
  isSubcontractorJob,
  normalizeSubName,
  subColor,
} from '@/lib/subcontractors';

interface Lead {
  [key: string]: string;
}

type AssigneeView = 'all' | 'amit' | 'sub';

interface WeeklyCalendarProps {
  leads: Lead[];
  onSelectLead?: (lead: Lead) => void;
  onUpdate?: () => void;
  onCloseDeal?: (lead: Lead) => void;
  onMarkSubPaid?: (lead: Lead) => void | Promise<void>;
  userRole?: string;
}

export default function WeeklyCalendar({ leads, onSelectLead, onUpdate, onCloseDeal, onMarkSubPaid, userRole }: WeeklyCalendarProps) {
  const router = useRouter();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const [draggedJob, setDraggedJob] = useState<Lead | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [assigneeView, setAssigneeView] = useState<AssigneeView>('all');

  const MAX_JOBS_PER_DAY = 10;

  const inSubView = assigneeView === 'sub';

  // Which subs actually have jobs on the visible board (drives the legend).
  const subNamesOnBoard = getSubcontractorNames(leads.filter(isSubcontractorJob));
  const hasUnnamedSub = leads.some(
    (l) => isSubcontractorJob(l) && !normalizeSubName(l['Subcontractor Name'])
  );

  const matchesAssigneeView = (lead: Lead) => {
    const assigned = normalizeSubName(lead['Assigned To']);
    if (assigneeView === 'amit') return assigned === 'Amit';
    if (assigneeView === 'sub') return assigned === SUBCONTRACTOR_BUCKET;
    return true;
  };

  // Get week days
  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const weekDays = getWeekDays();

  // Navigate days
  const goToPreviousDay = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(currentWeekStart.getDate() - 1);
    setCurrentWeekStart(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(currentWeekStart.getDate() + 1);
    setCurrentWeekStart(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  // Parse date string to Date object
  const parseDate = (dateStr: string) => {
    if (!dateStr) return null;

    // Handle MM/DD/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      const [month, day, year] = dateStr.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    // Handle YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    return null;
  };

  // Check if date matches
  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return isSameDay(date, today);
  };

  // Get jobs for a specific date
  const getJobsForDate = (date: Date) => {
    return leads.filter(lead => {
      const status = lead['Status']?.toUpperCase();
      if (status !== 'SCHEDULED' && status !== 'IN PROGRESS' && status !== 'QUOTED' && status !== 'COMPLETED' && status !== 'CLOSED' && status !== 'AWAITING PAYMENT') return false;

      if (!matchesAssigneeView(lead)) return false;

      const appointmentDate = parseDate(lead['Appointment Date']);
      if (!appointmentDate) return false;

      return isSameDay(appointmentDate, date);
    });
  };

  // Sort jobs by time window — parse start hour from any format
  const getTimeOrder = (timeWindow: string): number => {
    const tw = (timeWindow || '').trim();
    // Extract leading hour from formats like "08:00AM - 11:00AM" or "8:00 AM - 11:00 AM"
    const match = tw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return 99;
    let hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2] || '0', 10);
    const meridiem = (match[3] || '').toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return hour * 60 + minutes;
  };

  const sortJobsByTime = (jobs: Lead[]) => {
    return [...jobs].sort((a, b) => getTimeOrder(a['Time Window']) - getTimeOrder(b['Time Window']));
  };

  // Format month/year for header
  const formatMonthYear = () => {
    const startMonth = weekDays[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const endMonth = weekDays[6].toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (startMonth === endMonth) return startMonth;
    return `${weekDays[0].toLocaleDateString('en-US', { month: 'short' })} - ${weekDays[6].toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'SCHEDULED': return 'bg-blue-100 border-blue-400 text-blue-800';
      case 'IN PROGRESS': return 'bg-purple-100 border-purple-400 text-purple-800';
      case 'QUOTED': return 'bg-amber-100 border-amber-400 text-amber-800';
      case 'COMPLETED': return 'bg-cyan-100 border-cyan-400 text-cyan-800';
      case 'CLOSED': return 'bg-emerald-100 border-emerald-400 text-emerald-800';
      case 'AWAITING PAYMENT': return 'bg-emerald-100 border-orange-500 text-emerald-800 ring-1 ring-orange-400';
      default: return 'bg-slate-100 border-slate-400 text-slate-800';
    }
  };

  // Get time window short label
  const getTimeLabel = (timeWindow: string) => {
    switch (timeWindow) {
      case '08:00AM - 11:00AM': return '8-11 AM';
      case '11:00AM - 2:00PM': return '11-2 PM';
      case '2:00PM - 5:00PM': return '2-5 PM';
      default: return timeWindow || 'TBD';
    }
  };

  // Format date to YYYY-MM-DD for URL parameter
  const formatDateForUrl = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format date to MM/DD/YYYY for API
  const formatDateForApi = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  // Navigate to add lead page with pre-filled date
  const handleAddAppointment = (date: Date) => {
    const dateStr = formatDateForUrl(date);
    router.push(`/dashboard/add-lead?date=${dateStr}`);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, job: Lead) => {
    setDraggedJob(job);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', job.rowIndex);
  };

  const handleDragEnd = () => {
    setDraggedJob(null);
    setDragOverDate(null);
  };

  const handleDragOver = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(formatDateForUrl(date));
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    setDragOverDate(null);

    if (!draggedJob) return;

    // Check if dropping on the same date
    const currentDate = parseDate(draggedJob['Appointment Date']);
    if (currentDate && isSameDay(currentDate, targetDate)) {
      setDraggedJob(null);
      return;
    }

    // Check if target date is at capacity
    const targetJobs = getJobsForDate(targetDate);
    if (targetJobs.length >= MAX_JOBS_PER_DAY) {
      alert('Cannot move appointment: Target date is at full capacity (10 jobs)');
      setDraggedJob(null);
      return;
    }

    // Check if target date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (targetDate < today) {
      alert('Cannot move appointment to a past date');
      setDraggedJob(null);
      return;
    }

    // Update the appointment date
    setUpdating(true);
    try {
      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: draggedJob.rowIndex,
          updates: {
            'Appointment Date': formatDateForApi(targetDate),
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        onUpdate?.();
      } else {
        alert('Failed to update appointment: ' + result.error);
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setUpdating(false);
      setDraggedJob(null);
    }
  };

  // Get brand info for color-coded badges
  const getBrandInfo = (lead: Lead) => {
    const leadSourceDetail = (lead['Lead Source Detail'] || '').trim();
    const leadSource = (lead['Lead Source'] || '').toLowerCase();
    const isExternal = leadSource === 'lead company' || leadSource === 'partner';

    if (!isExternal || !leadSourceDetail) {
      return { name: 'ClearAir', style: 'bg-teal-200/60 text-teal-800' };
    }

    const brandKey = leadSourceDetail.toLowerCase();
    if (brandKey.includes('air duct cleaning services')) {
      return { name: 'ADCS', style: 'bg-orange-200/60 text-orange-800' };
    }
    if (brandKey.includes('local air duct')) {
      return { name: 'LADP', style: 'bg-purple-200/60 text-purple-800' };
    }
    if (brandKey.includes('israel')) {
      return { name: 'Israel', style: 'bg-sky-200/60 text-sky-800' };
    }
    return { name: leadSourceDetail.slice(0, 6), style: 'bg-rose-200/60 text-rose-800' };
  };

  // Custom scrollbar styles
  const scrollbarStyles = `
    .calendar-scroll::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .calendar-scroll::-webkit-scrollbar-track {
      background: #f1f5f9;
      border-radius: 4px;
    }
    .calendar-scroll::-webkit-scrollbar-thumb {
      background: #94a3b8;
      border-radius: 4px;
    }
    .calendar-scroll::-webkit-scrollbar-thumb:hover {
      background: #64748b;
    }
  `;

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <style>{scrollbarStyles}</style>
      {/* Calendar Header */}
      <div className="bg-[#0a2540] text-white px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPreviousDay}
              className="p-1.5 hover:bg-white/10 rounded transition"
              title="Previous Day"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToNextDay}
              className="p-1.5 hover:bg-white/10 rounded transition"
              title="Next Day"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm bg-white/10 hover:bg-white/20 rounded transition"
            >
              Today
            </button>
          </div>
          <h2 className="font-semibold text-lg">{formatMonthYear()}</h2>
          {updating && (
            <div className="flex items-center gap-2 text-sm text-teal-300">
              <div className="w-4 h-4 border-2 border-teal-300 border-t-transparent rounded-full animate-spin"></div>
              Updating...
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {/* Assignee toggle */}
          <div className="flex items-center rounded-lg bg-white/10 p-0.5">
            {([
              { key: 'all', label: 'All' },
              { key: 'amit', label: 'Amit' },
              { key: 'sub', label: 'Subcontractors' },
            ] as { key: AssigneeView; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setAssigneeView(key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  assigneeView === key
                    ? 'bg-white text-[#0a2540]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-slate-400 mx-1">|</span>

          {/* Legend: per-subcontractor in sub view, per-status otherwise */}
          {inSubView ? (
            subNamesOnBoard.length === 0 && !hasUnnamedSub ? (
              <span className="text-xs text-slate-300">No subcontractor jobs this week</span>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                {subNamesOnBoard.map((name) => (
                  <div key={name} className="flex items-center gap-1">
                    <span className={`w-3 h-3 rounded ${subColor(name).dot}`}></span>
                    <span className="text-xs text-slate-300">{name}</span>
                  </div>
                ))}
                {hasUnnamedSub && (
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-slate-400"></span>
                    <span className="text-xs text-slate-300">{UNNAMED_SUB_LABEL}</span>
                  </div>
                )}
              </div>
            )
          ) : (
            <>
              <span className="text-slate-300">Drag jobs to reschedule</span>
              <div className="flex items-center gap-1 ml-2">
                <span className="w-3 h-3 rounded bg-blue-400"></span>
                <span className="text-xs text-slate-300">Scheduled</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <span className="w-3 h-3 rounded bg-purple-400"></span>
                <span className="text-xs text-slate-300">In Progress</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <span className="w-3 h-3 rounded bg-amber-400"></span>
                <span className="text-xs text-slate-300">Quoted</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <span className="w-3 h-3 rounded bg-emerald-400"></span>
                <span className="text-xs text-slate-300">Closed</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <span className="w-3 h-3 rounded bg-emerald-400 ring-1 ring-orange-500"></span>
                <span className="text-xs text-slate-300">Awaiting Payment</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {weekDays.map((day, index) => {
          const jobs = getJobsForDate(day);
          const jobCount = jobs.length;
          const isAtCapacity = jobCount >= MAX_JOBS_PER_DAY;
          const isNearCapacity = jobCount >= MAX_JOBS_PER_DAY - 2;
          const dayIsToday = isToday(day);
          const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));
          const isDropTarget = dragOverDate === formatDateForUrl(day);
          const canDrop = !isPast && !isAtCapacity;

          return (
            <div
              key={index}
              className={`border-r border-slate-200 last:border-r-0 transition-colors ${
                dayIsToday ? 'bg-blue-50' : isPast ? 'bg-slate-50' : ''
              } ${isDropTarget && canDrop ? 'bg-teal-50 ring-2 ring-inset ring-teal-400' : ''}
              ${isDropTarget && !canDrop ? 'bg-red-50 ring-2 ring-inset ring-red-400' : ''}`}
              onDragOver={(e) => handleDragOver(e, day)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, day)}
            >
              {/* Day Header */}
              <div className={`px-2 py-2 border-b border-slate-200 ${
                dayIsToday ? 'bg-blue-100' : 'bg-slate-100'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 text-center">
                    <div className="text-xs font-medium text-slate-500 uppercase">
                      {day.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className={`text-lg font-bold ${
                      dayIsToday ? 'text-blue-600' : 'text-slate-700'
                    }`}>
                      {day.getDate()}
                    </div>
                  </div>
                  {/* Add button */}
                  {!isAtCapacity && !isPast && (
                    <button
                      onClick={() => handleAddAppointment(day)}
                      className="w-6 h-6 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-full flex items-center justify-center transition shadow-sm"
                      title={`Add appointment on ${day.toLocaleDateString()}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  )}
                  {isAtCapacity && (
                    <div className="w-6 h-6 bg-red-100 text-red-500 rounded-full flex items-center justify-center" title="Day is full">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </div>
                {/* Job count badge */}
                <div className={`text-xs font-medium mt-1 ${
                  isAtCapacity
                    ? 'text-red-600'
                    : isNearCapacity
                    ? 'text-amber-600'
                    : jobCount > 0
                    ? 'text-slate-600'
                    : 'text-slate-400'
                }`}>
                  {jobCount}/{MAX_JOBS_PER_DAY} jobs
                </div>
              </div>

              {/* Jobs List */}
              <div className="h-[280px] overflow-y-auto calendar-scroll p-1.5 space-y-1">
                {sortJobsByTime(jobs).map((job, jobIndex) => {
                  const jobStatus = job['Status']?.toUpperCase();
                  const isClosed = jobStatus === 'CLOSED';
                  const isDispatcher = userRole === 'Dispatcher';
                  const canClick = !(isDispatcher && isClosed);
                  const canDrag = !isClosed;
                  return (
                  <div
                    key={jobIndex}
                    draggable={canDrag}
                    onDragStart={(e) => canDrag && handleDragStart(e, job)}
                    onDragEnd={handleDragEnd}
                    onClick={() => canClick && onSelectLead?.(job)}
                    className={`p-2 rounded border-l-3 transition text-xs ${getStatusColor(job['Status'])} ${
                      isClosed ? 'cursor-default opacity-75' : 'cursor-grab active:cursor-grabbing'
                    } ${!canClick ? 'cursor-not-allowed' : 'hover:shadow-md'} ${draggedJob?.rowIndex === job.rowIndex ? 'opacity-50 ring-2 ring-teal-500' : ''}`}
                    style={{ borderLeftWidth: '3px' }}
                    title={isDispatcher && isClosed ? 'Closed jobs are restricted' : isClosed ? 'Closed jobs cannot be rescheduled' : 'Drag to reschedule'}
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-semibold truncate">{job['Customer Name']}</span>
                      <span className={`shrink-0 px-1 py-px rounded text-[9px] font-bold ${getBrandInfo(job).style}`}>
                        {getBrandInfo(job).name}
                      </span>
                    </div>
                    {/* Who's actually doing the job */}
                    <div className="flex items-center gap-1 mt-0.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isSubcontractorJob(job)
                            ? subColor(job['Subcontractor Name']).dot
                            : subColor(job['Assigned To']).dot
                        }`}
                      />
                      <span className="text-[10px] font-medium truncate">
                        {isSubcontractorJob(job)
                          ? normalizeSubName(job['Subcontractor Name']) || UNNAMED_SUB_LABEL
                          : normalizeSubName(job['Assigned To']) || 'Unassigned'}
                      </span>
                    </div>
                    {jobStatus === 'AWAITING PAYMENT' && (
                      <div className="inline-flex items-center gap-0.5 mt-0.5 px-1 py-px rounded bg-orange-500 text-white text-[9px] font-bold">
                        💰 Awaiting Pay
                      </div>
                    )}
                    <div className="text-[10px] opacity-75 mt-0.5">{getTimeLabel(job['Time Window'])}</div>
                    <div className="truncate opacity-75 mt-0.5">{job['City']}</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <div className="truncate opacity-75">{job['Service Requested']}</div>
                      {(jobStatus === 'QUOTED' || jobStatus === 'COMPLETED') && onCloseDeal && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCloseDeal(job);
                          }}
                          className="shrink-0 ml-1 px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9px] font-bold transition"
                          title="Close this deal"
                        >
                          Close
                        </button>
                      )}
                      {jobStatus === 'AWAITING PAYMENT' && onMarkSubPaid && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkSubPaid(job);
                          }}
                          className="shrink-0 ml-1 px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9px] font-bold transition"
                          title="Mark payment received — closes the job"
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
                {jobs.length === 0 && !isDropTarget && (
                  <div className="h-full flex items-center justify-center text-slate-300 text-xs">
                    No appointments
                  </div>
                )}
                {jobs.length === 0 && isDropTarget && canDrop && (
                  <div className="h-full flex items-center justify-center text-teal-500 text-xs font-medium">
                    Drop here to reschedule
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
