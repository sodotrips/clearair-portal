'use client';

import { useTechContext, type Lead } from './TechContext';

interface JobCardProps {
  job: Lead;
  compact?: boolean;
  onCancel?: (job: Lead) => void;
}

export default function JobCard({ job, compact, onCancel }: JobCardProps) {
  const { selectedJob, setSelectedJob, setActiveView } = useTechContext();
  const isSelected = selectedJob?.['Lead ID'] === job['Lead ID'];
  const status = job['Status']?.toUpperCase() || '';
  const hasDeposit = !!(job['Deposit Amount'] && parseFloat(job['Deposit Amount']) > 0);

  const statusStyles: Record<string, string> = {
    'SCHEDULED': 'bg-teal-100 text-teal-700',
    'IN PROGRESS': 'bg-purple-100 text-purple-700',
    'QUOTED': 'bg-amber-100 text-amber-700',
    'COMPLETED': 'bg-cyan-100 text-cyan-700',
    'CLOSED': 'bg-emerald-100 text-emerald-700',
  };

  const handleClick = () => {
    setSelectedJob(job);
    setActiveView('jobs');
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left p-3 rounded-lg transition border ${
        isSelected
          ? 'bg-[#14b8a6]/10 border-[#14b8a6]'
          : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
              !job['Lead Source Detail'] || job['Lead Source Detail'].toLowerCase().includes('clearair')
                ? 'bg-teal-100 text-teal-700'
                : 'bg-orange-100 text-orange-700'
            }`}>{job['Lead Source Detail'] || 'ClearAir'}</span>
            <span className="text-[10px] text-slate-400">{job['Lead ID']}</span>
          </div>
          <p className="font-semibold text-sm text-[#0a2540] truncate">{job['Customer Name']}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-2">
          {job['Priority Level']?.toUpperCase() === 'APPROVED' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-600 text-white whitespace-nowrap">
              ✓ Customer Approved
            </span>
          )}
          {job['Priority Level']?.toUpperCase() === 'REWORK' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white whitespace-nowrap">
              🔧 Rework
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusStyles[status] || 'bg-slate-100'}`}>
            {status}
          </span>
          <span className="text-xs font-medium text-slate-500">{job['Appointment Date'] || ''}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 truncate">{job['Address']}, {job['City']}</p>
        <span className="text-xs font-medium text-slate-500 flex-shrink-0 ml-2">
          {job['Time Window'] || 'No time'}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600 truncate">{job['Service Requested']}</p>
        {job['Phone Number'] && (
          <a
            href={`tel:${job['Phone Number'].replace(/\D/g, '')}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex-shrink-0 ml-2"
          >
            {job['Phone Number']}
          </a>
        )}
      </div>

      {/* Quote/Estimate badge + Cancel */}
      {!hasDeposit && job['Quote Amount'] && parseFloat(job['Quote Amount']) > 0 && (
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
            Quoted ${job['Quote Amount']}
          </span>
          {onCancel && (
            <span
              onClick={(e) => { e.stopPropagation(); onCancel(job); }}
              className="text-[10px] text-red-400 hover:text-red-600 font-medium cursor-pointer"
            >
              Cancel
            </span>
          )}
        </div>
      )}

      {/* Deposit badge */}
      {hasDeposit && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
            Closed ${job['Quote Amount'] || '0'}
          </span>
          <span className="bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-semibold">
            Dep ${job['Deposit Amount']}
          </span>
          <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
            Bal ${job['Balance Due'] || (parseFloat(job['Quote Amount'] || '0') - parseFloat(job['Deposit Amount'] || '0')).toFixed(2)}
          </span>
        </div>
      )}

      {/* Cancel fallback — when no quote badge shown */}
      {onCancel && !hasDeposit && (!job['Quote Amount'] || parseFloat(job['Quote Amount']) <= 0) && (
        <div className="mt-1.5 flex justify-end">
          <span
            onClick={(e) => { e.stopPropagation(); onCancel(job); }}
            className="text-[10px] text-red-400 hover:text-red-600 font-medium cursor-pointer"
          >
            Cancel
          </span>
        </div>
      )}

      {/* IN PROGRESS indicator */}
      {status === 'IN PROGRESS' && (
        <div className="mt-1 flex items-center gap-1 text-purple-600 text-xs">
          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></span>
          In Progress {job['Check In'] && `(${job['Check In']})`}
        </div>
      )}

    </button>
  );
}
