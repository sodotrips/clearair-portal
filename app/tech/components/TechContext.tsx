'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

export interface Lead {
  [key: string]: string;
}

export type ActiveView = 'route' | 'jobs' | 'estimate' | 'invoice' | 'photos' | 'history';

interface TechAppState {
  // Data
  leads: Lead[];
  loading: boolean;
  error: string;

  // Selections
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedTech: string;
  setSelectedTech: (tech: string) => void;
  selectedJob: Lead | null;
  setSelectedJob: (job: Lead | null) => void;

  // Navigation
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  estimateStartStep: string;
  setEstimateStartStep: (step: string) => void;

  // Actions
  fetchLeads: () => void;

  // Computed
  todayJobs: Lead[];
  quotedJobs: Lead[];
  closedJobs: Lead[];
  historyJobs: Lead[];
  allTodayJobs: Lead[];
  upcomingJobs: Lead[];

  // Helpers
  isToday: (dateStr: string) => boolean;
  formatDateDisplay: (dateStr: string) => string;
  getHoustonDate: (date?: Date) => string;
}

const TechContext = createContext<TechAppState | null>(null);

export function useTechContext() {
  const ctx = useContext(TechContext);
  if (!ctx) throw new Error('useTechContext must be used within TechProvider');
  return ctx;
}

function isDateMatch(appointmentDate: string, selectedDate: string): boolean {
  if (!appointmentDate || !selectedDate) return false;
  const clean = appointmentDate.trim();
  // Handle MM/DD/YYYY
  if (clean.includes('/')) {
    const [m, d, y] = clean.split('/');
    const formatted = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return formatted === selectedDate;
  }
  // Handle YYYY-MM-DD
  return clean === selectedDate;
}

function parseTimeWindow(tw: string): number {
  const match = (tw || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return 99 * 60;
  let hour = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  const meridiem = (match[3] || '').toLowerCase();
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

export function TechProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTech, setSelectedTech] = useState(() => session?.user?.name || 'Amit');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedJob, setSelectedJob] = useState<Lead | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('jobs');
  const [estimateStartStep, setEstimateStartStep] = useState('');

  const getHoustonDate = useCallback((date: Date = new Date()) => {
    const houstonTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const year = houstonTime.getFullYear();
    const month = String(houstonTime.getMonth() + 1).padStart(2, '0');
    const day = String(houstonTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const isToday = useCallback((dateStr: string) => {
    return dateStr === getHoustonDate();
  }, [getHoustonDate]);

  const formatDateDisplay = useCallback((dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const selectedJobRef = useRef(selectedJob);
  selectedJobRef.current = selectedJob;

  const fetchLeads = useCallback(async () => {
    try {
      const response = await fetch('/api/leads');
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setLeads(data.leads || []);
        // Refresh selected job data if one is selected
        const currentJob = selectedJobRef.current;
        if (currentJob) {
          const updated = (data.leads || []).find((l: Lead) => l['Lead ID'] === currentJob['Lead ID']);
          if (updated) setSelectedJob(updated);
        }
      }
    } catch {
      setError('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, []);

  // Set date on mount
  useEffect(() => {
    if (!selectedDate) setSelectedDate(getHoustonDate());
  }, [getHoustonDate, selectedDate]);

  // Fetch leads on mount, on focus, and auto-refresh
  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 60000);

    // Refetch when tab/window becomes visible (e.g. navigating back)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchLeads();
    };
    const handleFocus = () => fetchLeads();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchLeads]);

  // Computed job lists
  const todayJobs = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    return l['Assigned To'] === selectedTech
      && (status === 'SCHEDULED' || status === 'IN PROGRESS')
      && isDateMatch(l['Appointment Date'], selectedDate);
  }).sort((a, b) => parseTimeWindow(a['Time Window']) - parseTimeWindow(b['Time Window']));

  const quotedJobs = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    return l['Assigned To'] === selectedTech
      && (status === 'QUOTED' || status === 'COMPLETED')
      && isDateMatch(l['Appointment Date'], selectedDate);
  });

  const closedJobs = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    return l['Assigned To'] === selectedTech
      && status === 'CLOSED'
      && isDateMatch(l['Appointment Date'], selectedDate);
  });

  const historyJobs = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    if (l['Assigned To'] !== selectedTech || !status) return false;
    const raw = (l['Appointment Date'] || '').trim();
    let apptDate = '';
    if (raw.includes('/')) { const [m, d, y] = raw.split('/'); apptDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; } else { apptDate = raw; }
    return !apptDate || apptDate < getHoustonDate();
  }).sort((a, b) => {
    const norm = (d: string) => {
      if (!d) return '';
      const c = d.trim();
      if (c.includes('/')) { const [m, dd, y] = c.split('/'); return `${y}-${m.padStart(2, '0')}-${dd.padStart(2, '0')}`; }
      return c;
    };
    return norm(b['Appointment Date']).localeCompare(norm(a['Appointment Date']));
  });

  const allTodayJobs = [...todayJobs, ...quotedJobs, ...closedJobs];

  // Normalize date to YYYY-MM-DD for comparison
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const clean = dateStr.trim();
    if (clean.includes('/')) {
      const [m, d, y] = clean.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return clean;
  };

  // Upcoming jobs: SCHEDULED for future dates
  const upcomingJobs = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    const apptDate = normalizeDate(l['Appointment Date']);
    return l['Assigned To'] === selectedTech
      && (status === 'SCHEDULED' || status === 'IN PROGRESS' || status === 'QUOTED' || status === 'COMPLETED')
      && apptDate > selectedDate;
  }).sort((a, b) => {
    const dateA = normalizeDate(a['Appointment Date']);
    const dateB = normalizeDate(b['Appointment Date']);
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return parseTimeWindow(a['Time Window']) - parseTimeWindow(b['Time Window']);
  });

  return (
    <TechContext.Provider value={{
      leads, loading, error,
      selectedDate, setSelectedDate,
      selectedTech, setSelectedTech,
      selectedJob, setSelectedJob,
      activeView, setActiveView, estimateStartStep, setEstimateStartStep,
      fetchLeads,
      todayJobs, quotedJobs, closedJobs, historyJobs, allTodayJobs, upcomingJobs,
      isToday, formatDateDisplay, getHoustonDate,
    }}>
      {children}
    </TechContext.Provider>
  );
}
