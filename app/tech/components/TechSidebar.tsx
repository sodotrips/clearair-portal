'use client';

import { useTechContext, type ActiveView } from './TechContext';

interface MenuItem {
  id: ActiveView;
  label: string;
  icon: string;
  jobRequired?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'route', label: 'Route', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'jobs', label: 'Jobs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { id: 'estimate', label: 'Estimate', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', jobRequired: true },
  { id: 'invoice', label: 'Invoice', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z', jobRequired: true },
  { id: 'photos', label: 'Photos', icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z', jobRequired: true },
  { id: 'history', label: 'History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
];

export default function TechSidebar() {
  const { activeView, setActiveView, selectedJob, setSelectedJob } = useTechContext();

  const handleMenuClick = (id: ActiveView) => {
    if (id === 'jobs' || id === 'history' || id === 'route') {
      setSelectedJob(null);
    }
    setActiveView(id);
  };

  return (
    <div className="w-20 bg-[#0a2540] flex flex-col items-center py-4 gap-1 flex-shrink-0 h-full">
      {MENU_ITEMS.map(item => {
        // Hide job-specific items if no job selected
        if (item.jobRequired && !selectedJob) return null;

        const isActive = activeView === item.id;

        return (
          <button
            key={item.id}
            onClick={() => handleMenuClick(item.id)}
            className={`w-16 flex flex-col items-center gap-1 py-2.5 rounded-lg transition ${
              isActive
                ? 'bg-[#14b8a6] text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {item.icon.split(' M').map((d, i) => (
                <path key={i} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={i === 0 ? d : `M${d}`} />
              ))}
            </svg>
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
