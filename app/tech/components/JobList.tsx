'use client';

import { useTechContext } from './TechContext';
import JobCard from './JobCard';

export default function JobList() {
  const { todayJobs, quotedJobs, closedJobs, upcomingJobs, loading, formatDateDisplay, getHoustonDate } = useTechContext();

  const today = getHoustonDate();
  const parseTime = (tw: string): number => {
    const match = (tw || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return 99 * 60;
    let hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2] || '0', 10);
    const meridiem = (match[3] || '').toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return hour * 60 + minutes;
  };

  const allToday = [...todayJobs, ...quotedJobs, ...closedJobs].sort((a, b) =>
    parseTime(a['Time Window']) - parseTime(b['Time Window'])
  );

  // Normalize date to YYYY-MM-DD
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const clean = dateStr.trim();
    if (clean.includes('/')) {
      const [m, d, y] = clean.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return clean;
  };

  // Group upcoming jobs by normalized date
  const upcomingByDate: Record<string, typeof upcomingJobs> = {};
  for (const job of upcomingJobs) {
    const date = normalizeDate(job['Appointment Date']) || 'Unscheduled';
    if (!upcomingByDate[date]) upcomingByDate[date] = [];
    upcomingByDate[date].push(job);
  }

  // Format date for upcoming section headers
  const formatUpcomingDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'Unscheduled') return 'Unscheduled';
    // Convert MM/DD/YYYY to YYYY-MM-DD if needed
    let normalized = dateStr;
    if (dateStr.includes('/')) {
      const [m, d, y] = dateStr.split('/');
      normalized = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const [year, month, day] = normalized.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${day}`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Today's Jobs */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-bold text-[#0a2540]">Today</h2>
          <span className="text-sm text-slate-500">{formatDateDisplay(today)}</span>
          <span className="bg-[#14b8a6] text-white text-xs px-2 py-0.5 rounded-full font-medium">
            {allToday.length} job{allToday.length !== 1 ? 's' : ''}
          </span>
        </div>

        {allToday.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
            No jobs scheduled for today
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allToday.map(job => (
              <JobCard key={job['Lead ID']} job={job} />
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Jobs */}
      {upcomingJobs.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-[#0a2540]">Upcoming</h2>
            <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium">
              {upcomingJobs.length} job{upcomingJobs.length !== 1 ? 's' : ''}
            </span>
          </div>

          {Object.entries(upcomingByDate).map(([date, jobs]) => (
            <div key={date} className="mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {formatUpcomingDate(date)}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {jobs.map(job => (
                  <JobCard key={job['Lead ID']} job={job} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
