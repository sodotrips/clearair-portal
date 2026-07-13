'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  UNNAMED_SUB_LABEL,
  isSubcontractorJob,
  normalizeSubName,
  subColor,
} from '@/lib/subcontractors';

interface Lead {
  [key: string]: string;
}

interface OpenSlotsWidgetProps {
  leads: Lead[];
  readOnly?: boolean;
  compact?: boolean;
}

const TIME_WINDOWS = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];
const TIME_WINDOW_LABELS = ['8-11 AM', '11-2 PM', '2-5 PM'];
const PRIMARY_TECH = 'Amit';
const ACTIVE_STATUSES = new Set(['SCHEDULED', 'IN PROGRESS', 'QUOTED', 'COMPLETED', 'CLOSED']);
const DAYS_TO_SHOW = 7;

// Houston "today" in YYYY-MM-DD
function getHoustonDate(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

// Convert MM/DD/YYYY → YYYY-MM-DD; returns '' if invalid
function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (clean.includes('/')) {
    const [m, d, y] = clean.split('/');
    if (!m || !d || !y) return '';
    const formatted = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(formatted) ? formatted : '';
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : '';
}

// Parse the start hour (24h) from a time window string. Handles formats like:
// "08:00AM - 11:00AM", "1:00 pm - 3:00 pm", "8-11", "1-3", "1pm-3pm", "13:00-15:00"
function parseStartHour(tw: string): number | null {
  if (!tw) return null;
  const s = tw.trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const ampm = m[3];
  if (ampm === 'pm' && hour < 12) hour += 12;
  else if (ampm === 'am' && hour === 12) hour = 0;
  // No AM/PM specified: infer based on common service hours.
  // Hours 1-7 with no AM/PM => assume PM (afternoon appts more common).
  // Hours 8-11 => AM. Hour 12 => noon. Hours 13-19 => already 24h PM.
  else if (!ampm && hour >= 1 && hour <= 7) hour += 12;
  return hour;
}

// Map any time window string to one of the 3 slot indices (0/1/2) based on start hour.
// 0 = 8-11 AM (start < 11), 1 = 11-2 PM (11 ≤ start < 14), 2 = 2-5 PM (start ≥ 14)
function getSlotIndex(tw: string): number | null {
  const hour = parseStartHour(tw);
  if (hour === null) return null;
  if (hour < 11) return 0;
  if (hour < 14) return 1;
  return 2;
}

// Returns array of next N days starting from today as YYYY-MM-DD strings
function getNextDays(n: number): string[] {
  const result: string[] = [];
  const todayStr = getHoustonDate();
  const [y, m, d] = todayStr.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    result.push(`${yy}-${mm}-${dd}`);
  }
  return result;
}

function formatDateLabel(dateStr: string, isToday: boolean): { dayName: string; dateText: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  const dayName = isToday ? `Today - ${weekday}` : weekday;
  const dateText = `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  return { dayName, dateText };
}

export default function OpenSlotsWidget({ leads, readOnly = false, compact = false }: OpenSlotsWidgetProps) {
  const router = useRouter();
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const today = getHoustonDate();
  const days = getNextDays(DAYS_TO_SHOW);

  // Build a map: { 'YYYY-MM-DD|<slotIndex>': Lead[] } — every assignee counts
  // toward a slot being booked (Amit, Tech 2, and subcontractors alike).
  const bookedMap = new Map<string, Lead[]>();
  for (const lead of leads) {
    const status = (lead['Status'] || '').toUpperCase().trim();
    if (!ACTIVE_STATUSES.has(status)) continue;
    const apptDate = normalizeDate(lead['Appointment Date']);
    if (!apptDate) continue;
    if (!days.includes(apptDate)) continue;
    const slotIdx = getSlotIndex(lead['Time Window']);
    if (slotIdx === null) continue;
    const key = `${apptDate}|${slotIdx}`;
    if (!bookedMap.has(key)) bookedMap.set(key, []);
    bookedMap.get(key)!.push(lead);
  }

  const getCellInfo = (date: string, slotIdx: number) => {
    const bookedJobs = bookedMap.get(`${date}|${slotIdx}`) || [];
    return { bookedCount: bookedJobs.length, bookedJobs };
  };

  const getCellColor = (count: number): string => {
    const hover = readOnly ? '' : 'hover:bg-emerald-200';
    const hoverAmber = readOnly ? '' : 'hover:bg-amber-200';
    if (count === 0) return `bg-emerald-100 ${hover} text-emerald-800 border-emerald-200`;
    return `bg-amber-100 ${hoverAmber} text-amber-800 border-amber-200`;
  };

  const getDot = (count: number): string => {
    if (count === 0) return '🟢';
    return '🟡';
  };

  const getLabel = (count: number): string => {
    if (count === 0) return 'Open';
    return `${count} booked`;
  };

  const handleCellClick = (date: string, timeWindow: string) => {
    if (readOnly) return;
    const params = new URLSearchParams({ date, timeWindow, technician: PRIMARY_TECH });
    router.push(`/dashboard/add-lead?${params.toString()}`);
  };

  return (
    <div className="bg-white border border-slate-200 mb-6">
      <div className={`${compact ? 'px-3 py-0.5' : 'px-5 py-3'} border-b border-slate-200 flex items-center justify-between`}>
        <div>
          <h3 className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-slate-800`}>
            Next 7 Days Schedule
          </h3>
          {!readOnly && <p className="text-xs text-slate-500 mt-0.5">Click any slot to add a job (overbooking allowed)</p>}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-600">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>Open</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>Booked</span>
        </div>
      </div>

      <div className={compact ? 'px-2 py-1' : 'p-3'}>
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: '70px' }} />
            {days.map(d => <col key={d} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide px-2 border border-slate-200 border-b border-b-slate-500 bg-slate-50">Time</th>
              {days.map(date => {
                const isToday = date === today;
                const { dayName, dateText } = formatDateLabel(date, isToday);
                return (
                  <th key={date} className="p-0 border-b border-b-slate-500">
                    <div className={`text-center border border-slate-200 ${compact ? 'py-0.5 px-1' : 'py-1.5'} ${isToday ? 'bg-blue-100 text-blue-800' : 'bg-slate-50 text-slate-700'}`}>
                      <div className="text-[10px] font-semibold leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                        {dayName} - {dateText}
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {TIME_WINDOWS.map((tw, twIdx) => {
              return (
                <tr key={tw}>
                  <td className={`text-[10px] font-medium text-slate-700 px-2 ${compact ? 'py-0.5' : 'py-1.5'} align-middle whitespace-nowrap border border-slate-200 bg-slate-50`}>{TIME_WINDOW_LABELS[twIdx]}</td>
                  {days.map(date => {
                    const { bookedCount, bookedJobs } = getCellInfo(date, twIdx);
                    const isToday = date === today;
                    const cellKey = `${date}|${tw}`;
                    const isHovered = hoveredCell === cellKey;
                    return (
                      <td key={date} className="relative">
                        <button
                          type="button"
                          onClick={() => handleCellClick(date, tw)}
                          onMouseEnter={() => setHoveredCell(cellKey)}
                          onMouseLeave={() => setHoveredCell(null)}
                          className={`w-full ${compact ? 'py-0.5' : 'py-2'} px-1 border border-slate-200 text-[10px] font-semibold transition truncate ${getCellColor(bookedCount)}`}
                        >
                          <span className="mr-0.5">{getDot(bookedCount)}</span>
                          {getLabel(bookedCount)}
                        </button>
                        {isHovered && (
                          <div className="absolute z-20 left-1/2 -translate-x-1/2 mt-1 bg-[#0a2540] text-white text-[11px] rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none">
                            <div className="font-semibold mb-1">{TIME_WINDOW_LABELS[twIdx]}</div>
                            {bookedJobs.length === 0 ? (
                              <div className="text-emerald-300">No jobs scheduled</div>
                            ) : (
                              bookedJobs.map((j, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-amber-200">
                                  <span
                                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                                      isSubcontractorJob(j)
                                        ? subColor(j['Subcontractor Name']).dot
                                        : 'bg-slate-400'
                                    }`}
                                  />
                                  <span>
                                    {j['Customer Name'] || '(no name)'} — {j['City'] || ''}
                                    <span className="text-slate-300">
                                      {' '}
                                      (
                                      {isSubcontractorJob(j)
                                        ? normalizeSubName(j['Subcontractor Name']) || UNNAMED_SUB_LABEL
                                        : normalizeSubName(j['Assigned To']) || 'Unassigned'}
                                      )
                                    </span>
                                  </span>
                                </div>
                              ))
                            )}
                            <div className="text-slate-400 mt-1 italic">Click to add another job</div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
