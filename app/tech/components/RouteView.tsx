'use client';

import dynamic from 'next/dynamic';
import { useTechContext } from './TechContext';

const JobMap = dynamic(() => import('../../components/JobMap'), { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full"></div></div> });

export default function RouteView() {
  const { allTodayJobs, selectedDate, setSelectedDate, isToday, formatDateDisplay, loading } = useTechContext();

  const navigateDate = (direction: number) => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + direction);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    const newDay = String(date.getDate()).padStart(2, '0');
    setSelectedDate(`${newYear}-${newMonth}-${newDay}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Date bar */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <button onClick={() => navigateDate(-1)} className="p-1 hover:bg-slate-100 rounded transition">
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[#0a2540]">{formatDateDisplay(selectedDate)}</p>
          {isToday(selectedDate) && <span className="text-[10px] bg-[#14b8a6] text-white px-1.5 py-0.5 rounded-full">Today</span>}
          <span className="text-xs text-slate-500">{allTodayJobs.length} job{allTodayJobs.length !== 1 ? 's' : ''}</span>
        </div>
        <button onClick={() => navigateDate(1)} className="p-1 hover:bg-slate-100 rounded transition">
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Full-width map */}
      <div className="flex-1">
        {!loading && allTodayJobs.length > 0 ? (
          <JobMap jobs={allTodayJobs} />
        ) : !loading ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            No jobs to show on map
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>
    </div>
  );
}
