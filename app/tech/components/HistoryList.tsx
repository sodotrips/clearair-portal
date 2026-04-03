'use client';

import { useState } from 'react';
import { useTechContext, type Lead } from './TechContext';
import JobCard from './JobCard';

type TimeFilter = 'all' | 'thisweek' | 'week' | 'month' | 'year';
type StatusFilter = 'all' | 'quoted' | 'completed' | 'closed' | 'canceled';

export default function HistoryList() {
  const { historyJobs, loading, fetchLeads, getHoustonDate } = useTechContext();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('thisweek');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const handleCancel = async (job: Lead) => {
    if (!confirm(`Cancel ${job['Customer Name']} — ${job['Lead ID']}?`)) return;
    try {
      await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: parseInt(job.rowIndex),
          updates: { 'Status': 'CANCELLED' },
        }),
      });
      fetchLeads();
    } catch {
      alert('Failed to cancel job');
    }
  };

  // Normalize date to YYYY-MM-DD
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const c = dateStr.trim();
    if (c.includes('/')) {
      const [m, d, y] = c.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return c;
  };

  // Apply filters
  const filtered = historyJobs.filter(job => {
    const status = job['Status']?.toUpperCase();

    // Status filter
    if (statusFilter === 'quoted' && status !== 'QUOTED') return false;
    if (statusFilter === 'completed' && status !== 'COMPLETED') return false;
    if (statusFilter === 'closed' && status !== 'CLOSED') return false;
    if (statusFilter === 'canceled' && status !== 'CANCELED' && status !== 'CANCELLED') return false;

    // Time filter
    if (timeFilter !== 'all') {
      const apptDate = normalizeDate(job['Appointment Date']);
      if (!apptDate) return false;
      const today = getHoustonDate();
      const [ty, tm, td] = today.split('-').map(Number);
      const todayDate = new Date(ty, tm - 1, td);

      if (timeFilter === 'thisweek') {
        // Start of current week (Monday)
        const startOfWeek = new Date(todayDate);
        const day = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
        const startStr = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}-${String(startOfWeek.getDate()).padStart(2, '0')}`;
        if (apptDate < startStr) return false;
      } else if (timeFilter === 'week') {
        const weekAgo = new Date(todayDate);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;
        if (apptDate < weekAgoStr) return false;
      } else if (timeFilter === 'month') {
        const monthAgo = new Date(todayDate);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        const monthAgoStr = `${monthAgo.getFullYear()}-${String(monthAgo.getMonth() + 1).padStart(2, '0')}-${String(monthAgo.getDate()).padStart(2, '0')}`;
        if (apptDate < monthAgoStr) return false;
      } else if (timeFilter === 'year') {
        const yearStart = `${ty}-01-01`;
        if (apptDate < yearStart) return false;
      }
    }

    return true;
  });

  // Group by month
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const grouped: Record<string, typeof filtered> = {};
  for (const job of filtered) {
    const raw = job['Appointment Date'] || '';
    let key = 'Unscheduled';
    if (raw) {
      let m: number, y: number;
      if (raw.includes('/')) {
        const parts = raw.split('/');
        m = parseInt(parts[0], 10) - 1;
        y = parseInt(parts[2], 10);
      } else {
        const parts = raw.split('-');
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10) - 1;
      }
      if (!isNaN(m) && !isNaN(y)) key = `${monthNames[m]} ${y}`;
    }
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(job);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const timeFilters: { id: TimeFilter; label: string }[] = [
    { id: 'thisweek', label: 'This Week' },
    { id: 'week', label: 'Last 7 Days' },
    { id: 'month', label: 'Last Month' },
    { id: 'year', label: 'This Year' },
    { id: 'all', label: 'All Time' },
  ];

  // Time-filtered jobs (before status filter) for accurate counts
  const timeFiltered = historyJobs.filter(job => {
    if (timeFilter === 'all') return true;
    const apptDate = normalizeDate(job['Appointment Date']);
    if (!apptDate) return false;
    const today = getHoustonDate();
    const [ty, tm, td] = today.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    if (timeFilter === 'thisweek') {
      const d = new Date(todayDate);
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return apptDate >= `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (timeFilter === 'week') {
      const d = new Date(todayDate); d.setDate(d.getDate() - 7);
      return apptDate >= `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (timeFilter === 'month') {
      const d = new Date(todayDate); d.setMonth(d.getMonth() - 1);
      return apptDate >= `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (timeFilter === 'year') return apptDate >= `${ty}-01-01`;
    return true;
  });

  const statusFilters: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: timeFiltered.length },
    { id: 'quoted', label: 'Quoted', count: timeFiltered.filter(j => j['Status']?.toUpperCase() === 'QUOTED').length },
    { id: 'completed', label: 'Completed', count: timeFiltered.filter(j => j['Status']?.toUpperCase() === 'COMPLETED').length },
    { id: 'closed', label: 'Closed', count: timeFiltered.filter(j => j['Status']?.toUpperCase() === 'CLOSED').length },
    { id: 'canceled', label: 'Canceled', count: timeFiltered.filter(j => { const s = j['Status']?.toUpperCase(); return s === 'CANCELED' || s === 'CANCELLED'; }).length },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-[#0a2540]">History</h2>
          <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium">
            {filtered.length} job{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Time Filter */}
        <div className="flex items-center gap-1">
          {timeFilters.map(f => (
            <button
              key={f.id}
              onClick={() => setTimeFilter(f.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                timeFilter === f.id
                  ? 'bg-[#14b8a6] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-2 mb-4">
        {statusFilters.map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
              statusFilter === f.id
                ? 'bg-[#0a2540] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              statusFilter === f.id ? 'bg-white/20' : 'bg-slate-200'
            }`}>{f.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
          No jobs found
        </div>
      ) : (
        Object.entries(grouped).map(([month, jobs]) => (
          <div key={month} className="mb-6">
            <p className="text-sm font-bold text-[#0a2540] uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">{month}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {jobs.map(job => (
                <JobCard key={job['Lead ID']} job={job} onCancel={handleCancel} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
