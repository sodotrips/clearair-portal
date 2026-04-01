'use client';

import { useSession, signOut } from 'next-auth/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { TechProvider, useTechContext } from './components/TechContext';
import TechSidebar from './components/TechSidebar';
import JobList from './components/JobList';
import JobDetail from './components/JobDetail';
import RouteView from './components/RouteView';
import HistoryList from './components/HistoryList';

// Lazy load heavy components — render inline (not as modals)
const QuoteModal = dynamic(() => import('../components/QuoteModal'), { ssr: false });
const PhotosModal = dynamic(() => import('../components/PhotosModal'), { ssr: false });

function EstimateView() {
  const { selectedJob, fetchLeads, setActiveView, estimateStartStep, setEstimateStartStep } = useTechContext();
  if (!selectedJob) return null;
  return (
    <div className="flex-1 overflow-hidden">
      <QuoteModal
        lead={selectedJob}
        onClose={() => { setActiveView('jobs'); setEstimateStartStep(''); }}
        onSuccess={() => fetchLeads()}
        initialStep={estimateStartStep || undefined}
      />
    </div>
  );
}

function PhotosView() {
  const { selectedJob, setActiveView } = useTechContext();
  if (!selectedJob) return null;
  return (
    <div className="flex-1 overflow-hidden">
      <PhotosModal
        lead={selectedJob}
        onClose={() => setActiveView('jobs')}
      />
    </div>
  );
}

function TechAppContent() {
  const { data: session } = useSession();
  const { activeView, setActiveView, selectedJob, setSelectedJob, selectedTech, setSelectedTech } = useTechContext();

  const techs = ['Amit', 'Tech 2', 'Subcontractor'];

  // When a job is selected and view is 'jobs', show detail. Otherwise show list.
  const showJobDetail = selectedJob && (activeView === 'jobs' || activeView === 'estimate' || activeView === 'invoice' || activeView === 'photos');

  const handleBackToJobs = () => {
    setSelectedJob(null);
    setActiveView('jobs');
  };

  // Render the main content area
  const renderContent = () => {
    // Route view — full width map
    if (activeView === 'route') return <RouteView />;

    // History view — full width list + detail
    if (activeView === 'history') {
      if (selectedJob) return <JobDetail />;
      return <HistoryList />;
    }

    // Jobs view — either list or detail
    if (!showJobDetail) return <JobList />;

    // Job selected — show detail/estimate/invoice/photos
    return (
      <div className="flex-1 flex flex-col">
        {activeView === 'jobs' && <JobDetail />}
        {activeView === 'estimate' && <EstimateView />}
        {activeView === 'invoice' && <JobDetail />}
        {activeView === 'photos' && <PhotosView />}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <header className="bg-[#0a2540] text-white px-4 py-1 flex justify-between items-center flex-shrink-0 h-10">
        <div className="flex items-center gap-1">
          <Image src="/ClearAir-icon1.png" alt="ClearAir" width={56} height={56} className="h-11 w-auto -my-2 relative z-10" priority />
          <h1 className="text-sm font-semibold ml-2">Tech Portal</h1>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-slate-400 text-xs">{session?.user?.name || 'ClearAir Solutions'}</p>
          <select
            value={selectedTech}
            onChange={(e) => setSelectedTech(e.target.value)}
            className="bg-[#1a3a5c] text-white border border-slate-600 rounded-lg px-2 py-1.5 text-xs"
          >
            {techs.map(tech => <option key={tech} value={tech}>{tech}</option>)}
          </select>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-1.5 rounded-lg text-sm transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <TechSidebar />
        {renderContent()}
      </div>
    </div>
  );
}

export default function TechPage() {
  return (
    <TechProvider>
      <TechAppContent />
    </TechProvider>
  );
}
