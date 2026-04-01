'use client';

import { useTechContext, type Lead } from './TechContext';
import JobCard from './JobCard';

export default function HistoryList() {
  const { historyJobs, loading, fetchLeads } = useTechContext();

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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-[#0a2540]">Follow-up Jobs</h2>
        <span className="bg-amber-200 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">
          {historyJobs.length} job{historyJobs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {historyJobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
          No follow-up jobs
        </div>
      ) : (() => {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const grouped: Record<string, typeof historyJobs> = {};
        for (const job of historyJobs) {
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
        return Object.entries(grouped).map(([month, jobs]) => (
          <div key={month} className="mb-6">
            <p className="text-sm font-bold text-[#0a2540] uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">{month}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {jobs.map(job => (
                <JobCard key={job['Lead ID']} job={job} onCancel={handleCancel} />
              ))}
            </div>
          </div>
        ));
      })()}
    </div>
  );
}
