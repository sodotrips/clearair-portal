'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import ScheduleModal from '../components/ScheduleModal';
import EditModal from '../components/EditModal';
import ViewDetailsModal from '../components/ViewDetailsModal';
import InlineEditCell from '../components/InlineEditCell';
import CommissionModal from '../components/CommissionModal';
import CloseDealModal from '../components/CloseDealModal';
import QuoteLeadModal from '../components/QuoteLeadModal';
import WeeklyCalendar from '../components/WeeklyCalendar';
import QuickImportModal from '../components/QuickImportModal';

interface Lead {
  [key: string]: string;
}

export default function Dashboard() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentView, setCurrentView] = useState('new');
  const [searchTerm, setSearchTerm] = useState('');
  const [scheduleModalLead, setScheduleModalLead] = useState<Lead | null>(null);
  const [editModalLead, setEditModalLead] = useState<Lead | null>(null);
  const [viewDetailsLead, setViewDetailsLead] = useState<Lead | null>(null);
  const [commissionModalLead, setCommissionModalLead] = useState<Lead | null>(null);
  const [closeDealModalLead, setCloseDealModalLead] = useState<Lead | null>(null);
  const [quoteLeadModalLead, setQuoteLeadModalLead] = useState<Lead | null>(null);
  const [todaysAppointmentsExpanded, setTodaysAppointmentsExpanded] = useState(false);
  const [showQuickImport, setShowQuickImport] = useState(false);
  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [agentSettings, setAgentSettings] = useState<Record<string, string>>({});
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentTestResult, setAgentTestResult] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const userRole = (session?.user as any)?.role;

  // Map column headers to actual field names
  const columnToField: Record<string, string> = {
    'Lead ID': 'Lead ID',
    'Status': 'Status',
    'Customer': 'Customer Name',
    'Phone': 'Phone Number',
    'Address': 'Address',
    'City': 'City',
    'Service': 'Service Requested',
    'Created': 'Timestamp Received',
    'Technician': 'Assigned To',
    'Appointment': 'Appointment Date',
    'Time Window': 'Time Window',
    'Follow-up': 'Follow-up Date',
    'Customer Notes': 'Customer Issue/Notes',
    'Lead Source': 'Lead Source',
    'Referral Source': 'Referral Source',
    'Amount Paid': 'Amount Paid',
    'Total Cost': 'Total Cost',
    'Profit $': 'Profit $',
    'Sophia %': 'Sophia Commission %',
    'Amit %': 'Amit Commission %',
    'Lead Co %': 'Lead Company Commission %',
  };

  // Dropdown options for inline editing
  const cities = ['Houston', 'Katy', 'Sugar Land', 'Pearland', 'Spring', 'Cypress', 'The Woodlands', 'Humble', 'Pasadena', 'League City', 'Missouri City', 'Baytown', 'Conroe', 'Richmond', 'Tomball'];
  const services = ['Air Duct Cleaning', 'Dryer Vent Cleaning', 'Attic Insulation', 'Duct Replacement', 'Chimney Services'];
  const techs = ['Amit', 'Tech 2', 'Subcontractor'];
  const statuses = ['NEW', 'SCHEDULED', 'IN PROGRESS', 'QUOTED', 'CLOSED', 'CANCELED'];
  const timeWindows = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];

  // Column widths per view
  const defaultWidths: Record<string, number[]> = {
    new: [140, 110, 100, 160, 140, 200, 120, 160, 100, 100, 110, 250],
    scheduled: [140, 110, 100, 160, 160, 140, 200, 120, 160, 100, 110, 160, 110],
    followups: [140, 110, 100, 110, 160, 140, 200, 120, 160, 100, 110],
    quoted: [80, 110, 100, 160, 140, 200, 120, 160, 100, 110, 100, 120, 100, 100, 90, 90, 90, 90],
    closed: [50, 110, 100, 160, 140, 200, 120, 160, 100, 110, 100, 120, 100, 100, 90, 90, 90, 90],
    canceled: [140, 110, 100, 160, 140, 200, 120, 160, 100, 110],
  };
  const [columnWidths, setColumnWidths] = useState<Record<string, number[]>>(defaultWidths);
  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    fetchLeads();
    fetchAgentSettings();
  }, []);

  useEffect(() => {
    filterLeadsByView();
  }, [leads, currentView, searchTerm, sortColumn, sortDirection]);

  // Handle column sort
  const handleSort = (column: string) => {
    if (column === 'Actions') return; // Don't sort Actions column

    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort function for leads
  const sortLeads = (leadsToSort: Lead[]) => {
    if (!sortColumn) return leadsToSort;

    const field = columnToField[sortColumn] || sortColumn;

    return [...leadsToSort].sort((a, b) => {
      const aRaw = a[field] || '';
      const bRaw = b[field] || '';

      // Handle date fields
      if (field.includes('Date') || field === 'Timestamp Received') {
        const parseDate = (dateStr: string): number => {
          if (!dateStr) return 0;
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
            const [month, day, year] = dateStr.split('/');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
          }
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return new Date(dateStr).getTime();
          }
          return new Date(dateStr).getTime() || 0;
        };
        const aNum = parseDate(aRaw);
        const bNum = parseDate(bRaw);
        if (aNum < bNum) return sortDirection === 'asc' ? -1 : 1;
        if (aNum > bNum) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }
      // Handle numeric fields
      else if (field.includes('Amount') || field.includes('Cost') || field.includes('Profit') || field.includes('%')) {
        const aNum = parseFloat(aRaw.replace(/[^0-9.-]/g, '')) || 0;
        const bNum = parseFloat(bRaw.replace(/[^0-9.-]/g, '')) || 0;
        if (aNum < bNum) return sortDirection === 'asc' ? -1 : 1;
        if (aNum > bNum) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }
      // Handle string fields
      else {
        const aStr = aRaw.toLowerCase();
        const bStr = bRaw.toLowerCase();
        if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }
    });
  };

  async function fetchAgentSettings() {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.settings) {
        setAgentSettings(data.settings);
      }
    } catch (err) {
      console.error('Failed to fetch agent settings:', err);
    }
  }

  async function updateAgentSetting(key: string, value: string) {
    setAgentLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      const data = await response.json();
      if (data.success) {
        setAgentSettings(prev => ({ ...prev, [key]: value }));
      }
    } catch (err) {
      console.error('Failed to update setting:', err);
    } finally {
      setAgentLoading(false);
    }
  }

  async function testDailySummaryAgent() {
    setAgentLoading(true);
    setAgentTestResult(null);
    try {
      const response = await fetch('/api/agents/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      const data = await response.json();
      if (data.success) {
        setAgentTestResult(`✅ Test SMS sent to ${data.sentTo}`);
      } else if (data.skipped) {
        setAgentTestResult(`⚠️ Skipped: ${data.reason}`);
      } else {
        setAgentTestResult(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      setAgentTestResult(`❌ Failed to connect`);
    } finally {
      setAgentLoading(false);
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(60, resizingRef.current.startWidth + diff);
      setColumnWidths(prev => {
        const updated = { ...prev };
        updated[currentView] = [...prev[currentView]];
        updated[currentView][resizingRef.current!.index] = newWidth;
        return updated;
      });
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [currentView]);

  const startResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = {
      index,
      startX: e.clientX,
      startWidth: columnWidths[currentView][index],
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Format date to MM/DD/YYYY
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      return `${month}/${day}/${year}`;
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
    }
    return dateStr;
  };

  // Format phone to (xxx) xxx-xxxx
  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  // Houston timezone helper
  const getHoustonDateString = () => {
    const now = new Date();
    const houstonTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const year = houstonTime.getFullYear();
    const month = String(houstonTime.getMonth() + 1).padStart(2, '0');
    const day = String(houstonTime.getDate()).padStart(2, '0');
    return `${month}/${day}/${year}`;
  };

  // Check if a date is today (Houston time)
  const isToday = (dateStr: string) => {
    if (!dateStr) return false;
    const houstonToday = getHoustonDateString();

    // Normalize the date string to MM/DD/YYYY format
    let normalizedDate = dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      normalizedDate = `${month}/${day}/${year}`;
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      const [month, day, year] = dateStr.split('/');
      normalizedDate = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
    }

    return normalizedDate === houstonToday;
  };

  async function fetchLeads() {
    try {
      const response = await fetch('/api/leads');
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setLeads(data.leads || []);
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }

  // Inline edit save handler
  async function handleInlineSave(rowIndex: string, field: string, value: string): Promise<boolean> {
    try {
      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex,
          updates: { [field]: value },
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Update local state
        setLeads(prev => prev.map(lead =>
          lead.rowIndex === rowIndex
            ? { ...lead, [field]: value }
            : lead
        ));
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  async function updateLeadStatus(lead: Lead, newStatus: string) {
    let confirmMsg = '';
    if (newStatus === 'CLOSED') {
      confirmMsg = `Mark "${lead['Customer Name']}" as closed?`;
    } else if (newStatus === 'CANCELED') {
      confirmMsg = `Cancel lead for "${lead['Customer Name']}"?`;
    } else if (newStatus === 'NEW') {
      confirmMsg = `Reactivate lead for "${lead['Customer Name']}"?`;
    }

    if (!confirm(confirmMsg)) return;

    try {
      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: lead.rowIndex,
          updates: { 'Status': newStatus },
        }),
      });

      const result = await response.json();
      if (result.success) {
        fetchLeads();
      } else {
        alert('Failed to update status: ' + result.error);
      }
    } catch (err) {
      alert('Failed to connect to server');
    }
  }

  function filterLeadsByView() {
    let filtered = leads;

    if (currentView === 'new') {
      filtered = leads.filter(l => l['Status']?.toUpperCase() === 'NEW');
    } else if (currentView === 'scheduled') {
      filtered = leads.filter(l => l['Status']?.toUpperCase() === 'SCHEDULED');
    } else if (currentView === 'followups') {
      filtered = leads.filter(l => {
        const status = l['Status']?.toUpperCase();
        // Check multiple possible column names for Follow-up Date
        const followUpDate = l['Follow-up Date'] || l['Follow Up Date'] || l['Followup Date'] || l['Follow-Up Date'] || '';
        const hasFollowUpDate = followUpDate.trim() !== '';
        return status !== 'CLOSED' && status !== 'CANCELED' && hasFollowUpDate;
      });
    } else if (currentView === 'quoted') {
      filtered = leads.filter(l => l['Status']?.toUpperCase() === 'QUOTED');
    } else if (currentView === 'closed') {
      filtered = leads.filter(l => l['Status']?.toUpperCase() === 'CLOSED');
    } else if (currentView === 'canceled') {
      filtered = leads.filter(l => l['Status']?.toUpperCase() === 'CANCELED');
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(lead =>
        (lead['Customer Name'] || '').toLowerCase().includes(term) ||
        (lead['Phone Number'] || '').toLowerCase().includes(term) ||
        (lead['Address'] || '').toLowerCase().includes(term) ||
        (lead['City'] || '').toLowerCase().includes(term) ||
        (lead['Lead ID'] || '').toLowerCase().includes(term)
      );
    }

    // Apply sorting
    filtered = sortLeads(filtered);

    setFilteredLeads(filtered);
  }

  // Get today's appointments (including closed)
  const todaysAppointments = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    return (status === 'SCHEDULED' || status === 'IN PROGRESS' || status === 'QUOTED' || status === 'CLOSED') && isToday(l['Appointment Date']);
  }).sort((a, b) => {
    const aClosed = a['Status']?.toUpperCase() === 'CLOSED';
    const bClosed = b['Status']?.toUpperCase() === 'CLOSED';
    // Closed jobs go to the bottom
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    // Then sort by time window
    const timeOrder = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];
    return timeOrder.indexOf(a['Time Window'] || '') - timeOrder.indexOf(b['Time Window'] || '');
  });

  const stats = {
    newLeads: leads.filter(l => l['Status']?.toUpperCase() === 'NEW').length,
    scheduled: leads.filter(l => l['Status']?.toUpperCase() === 'SCHEDULED').length,
    followups: leads.filter(l => {
      const status = l['Status']?.toUpperCase();
      const followUpDate = l['Follow-up Date'] || l['Follow Up Date'] || l['Followup Date'] || l['Follow-Up Date'] || '';
      const hasFollowUpDate = followUpDate.trim() !== '';
      return status !== 'CLOSED' && status !== 'CANCELED' && hasFollowUpDate;
    }).length,
    quoted: leads.filter(l => l['Status']?.toUpperCase() === 'QUOTED').length,
    closed: leads.filter(l => l['Status']?.toUpperCase() === 'CLOSED').length,
    canceled: leads.filter(l => l['Status']?.toUpperCase() === 'CANCELED').length,
  };

  const allTabs = [
    { id: 'new', label: 'New Leads', count: stats.newLeads },
    { id: 'scheduled', label: 'Scheduled', count: stats.scheduled },
    { id: 'quoted', label: 'Quoted', count: stats.quoted, adminOnly: true },
    { id: 'followups', label: 'Follow-ups', count: stats.followups },
    { id: 'closed', label: 'Closed', count: stats.closed, adminOnly: true },
    { id: 'canceled', label: 'Canceled', count: stats.canceled },
  ];

  // Filter tabs based on role - completed tab only visible to Admin
  const tabs = userRole === 'Admin' ? allTabs : allTabs.filter(tab => !tab.adminOnly);

  const statCards = [
    { id: 'new', label: 'New Leads', count: stats.newLeads, accentColor: 'bg-blue-500', icon: '📋' },
    { id: 'scheduled', label: 'Scheduled', count: stats.scheduled, accentColor: 'bg-teal-500', icon: '📅' },
    { id: 'quoted', label: 'Quoted', count: stats.quoted, accentColor: 'bg-amber-500', icon: '💰' },
    { id: 'closed', label: 'Closed', count: stats.closed, accentColor: 'bg-emerald-500', icon: '✅' },
  ];

  const columnsByView: Record<string, string[]> = {
    new: ['Actions', 'Lead ID', 'Status', 'Customer', 'Phone', 'Address', 'City', 'Service', 'Created', 'Technician', 'Appointment', 'Customer Notes'],
    scheduled: ['Actions', 'Lead ID', 'Status', 'Brand', 'Customer', 'Phone', 'Address', 'City', 'Service', 'Technician', 'Appointment', 'Time Window', 'Follow-up'],
    followups: ['Actions', 'Lead ID', 'Status', 'Follow-up', 'Customer', 'Phone', 'Address', 'City', 'Service', 'Technician', 'Appointment'],
    quoted: ['Actions', 'Lead ID', 'Status', 'Customer', 'Phone', 'Address', 'City', 'Service', 'Technician', 'Appointment', 'Lead Source', 'Referral Source', 'Amount Paid', 'Total Cost', 'Profit $', 'Sophia %', 'Amit %', 'Lead Co %'],
    closed: ['Actions', 'Lead ID', 'Status', 'Customer', 'Phone', 'Address', 'City', 'Service', 'Technician', 'Appointment', 'Lead Source', 'Referral Source', 'Amount Paid', 'Total Cost', 'Profit $', 'Sophia %', 'Amit %', 'Lead Co %'],
    canceled: ['Actions', 'Lead ID', 'Status', 'Customer', 'Phone', 'Address', 'City', 'Service', 'Technician', 'Appointment'],
  };

  const columns = columnsByView[currentView] || columnsByView.new;

  const statusStyles: Record<string, string> = {
    'NEW': 'bg-blue-100 text-blue-700',
    'SCHEDULED': 'bg-teal-100 text-teal-700',
    'IN PROGRESS': 'bg-purple-100 text-purple-700',
    'QUOTED': 'bg-amber-100 text-amber-700',
    'CLOSED': 'bg-emerald-100 text-emerald-700',
    'CANCELED': 'bg-slate-100 text-slate-500',
  };

  // Brand color mapping for lead source companies
  const getBrandInfo = (lead: Lead) => {
    const leadSourceDetail = (lead['Lead Source Detail'] || '').trim();
    const leadSource = (lead['Lead Source'] || '').toLowerCase();
    const isExternal = leadSource === 'lead company' || leadSource === 'partner';

    if (!isExternal || !leadSourceDetail) {
      return { name: 'ClearAir', style: 'bg-teal-100 text-teal-800 border-teal-300' };
    }

    const brandKey = leadSourceDetail.toLowerCase();
    if (brandKey.includes('air duct cleaning services')) {
      return { name: 'Air Duct Cleaning Svc', style: 'bg-orange-100 text-orange-800 border-orange-300' };
    }
    if (brandKey.includes('local air duct')) {
      return { name: 'Local Air Duct Pros', style: 'bg-purple-100 text-purple-800 border-purple-300' };
    }
    if (brandKey.includes('israel')) {
      return { name: 'Israel', style: 'bg-blue-100 text-blue-800 border-blue-300' };
    }
    // Fallback for unknown brands
    return { name: leadSourceDetail, style: 'bg-rose-100 text-rose-800 border-rose-300' };
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Instant tooltip styles */}
      <style>{`
        [data-tip] { position: relative; }
        [data-tip]::after {
          content: attr(data-tip);
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          padding: 4px 8px;
          background: #1e293b;
          color: white;
          font-size: 11px;
          font-weight: 500;
          border-radius: 4px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.1s;
          z-index: 50;
        }
        [data-tip]:hover::after { opacity: 1; }
      `}</style>
      {/* Header */}
      <header className="bg-[#0a2540] text-white px-6 py-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-white rounded-lg p-1">
              <Image
                src="/clearair-logo.png"
                alt="ClearAir Solutions"
                width={105}
                height={30}
                priority
              />
            </div>
            <div>
              <h1 className="text-xl font-semibold">
                {userRole === 'Admin' ? 'Administration Portal' : 'Dispatcher Portal'}
              </h1>
              <p className="text-slate-400 text-xs">Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {userRole === 'Admin' && (
              <>
                <Link
                  href="/dashboard/analytics"
                  className="flex items-center gap-2 bg-[#14b8a6] hover:bg-[#0d9488] text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Analytics
                </Link>
                <Link
                  href="/dashboard/financials"
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Financials
                </Link>
                <Link
                  href="/dashboard/payouts"
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Payouts
                </Link>
                <Link
                  href="/dashboard/reminders"
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  SMS
                </Link>
                <Link
                  href="/tech"
                  className="flex items-center gap-2 bg-[#1a3a5c] hover:bg-[#0a2540] text-white px-4 py-2 rounded-lg text-sm font-medium transition border border-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Tech Portal
                </Link>
                <button
                  onClick={() => setShowAgentSettings(true)}
                  className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Agents
                  {agentSettings['daily_summary_enabled'] === 'true' && (
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  )}
                </button>
              </>
            )}
            <div className="flex items-center gap-3 border-l border-slate-600 pl-4 ml-2">
              <span className="text-slate-400 text-sm">{session?.user?.name}</span>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-slate-400 hover:text-white text-sm transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Cards - Status Flow */}
        <div className="flex items-center justify-between gap-2 mt-2 mb-4">
          {statCards.map((card, index) => (
            <div key={card.id} className="flex items-center flex-1">
              <div
                onClick={() => setCurrentView(card.id)}
                className={`bg-[#E0EBF7] rounded-lg overflow-hidden cursor-pointer transition-all hover:bg-[#d0dde9] w-full ${
                  currentView === card.id ? 'ring-2 ring-[#14b8a6] shadow-md' : 'shadow-sm'
                }`}
              >
                <div className={`h-1 ${card.accentColor}`}></div>
                <div className="px-3 py-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-slate-600 text-xs font-medium uppercase tracking-wide">{card.label}</p>
                      <p className="text-[#0a2540] text-2xl font-bold">{card.count}</p>
                    </div>
                    <div className={`w-8 h-8 rounded-md ${card.accentColor} bg-opacity-20 flex items-center justify-center`}>
                      <span className="text-base">{card.icon}</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Arrow between cards */}
              {index < statCards.length - 1 && (
                <div className="flex items-center px-2 flex-shrink-0">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Today's Appointments Section - Collapsible */}
        {todaysAppointments.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden">
            <button
              onClick={() => setTodaysAppointmentsExpanded(!todaysAppointmentsExpanded)}
              className="w-full bg-[#0a2540] text-white px-6 py-3 flex justify-between items-center hover:bg-[#0d2d4a] transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                <h2 className="font-semibold">Today's Appointments</h2>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold ml-2">
                  {todaysAppointments.length}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold text-lg">
                  {new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                <svg
                  className={`w-5 h-5 transition-transform ${todaysAppointmentsExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {todaysAppointmentsExpanded && (
            <div className="divide-y divide-slate-100 h-[200px] overflow-y-auto">
              {todaysAppointments.map((appt, idx) => {
                const brand = getBrandInfo(appt);
                const isClosed = appt['Status']?.toUpperCase() === 'CLOSED';
                // Count closed jobs before this one to determine alternating shade
                const closedCountBefore = todaysAppointments.slice(0, idx).filter(a => a['Status']?.toUpperCase() === 'CLOSED').length;
                return (
                <div key={idx} className={`px-4 py-2 ${isClosed ? (closedCountBefore % 2 === 0 ? 'bg-emerald-50' : 'bg-[#f0fdf4]') : (idx % 2 === 1 ? 'bg-slate-100' : 'bg-white')}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`px-2 py-1 rounded text-xs font-semibold min-w-[120px] text-center ${isClosed ? 'bg-emerald-200 text-emerald-700' : 'bg-[#14b8a6]/10 text-[#14b8a6]'}`}>
                        {appt['Time Window'] || 'No time set'}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${isClosed ? 'text-emerald-600' : 'text-[#14b8a6]'}`}>{isClosed ? '✓' : `Job ${idx + 1}`}</span>
                        <span className="font-semibold text-sm text-[#0a2540]">{appt['Customer Name']}</span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-500">{appt['City']}</span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-500">{appt['Service Requested']}</span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-500">{appt['Assigned To'] || 'Unassigned'}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold border ${brand.style}`}>{brand.name}</span>
                        {appt['Check In'] && <span className="text-xs text-green-600">In: {appt['Check In']}</span>}
                        {appt['Check Out'] && <span className="text-xs text-blue-600">Out: {appt['Check Out']}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={`tel:${appt['Phone Number']}`} className="p-1 text-green-500 hover:bg-green-50 rounded transition" title="Call">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </a>
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(appt['Address'] + ', ' + appt['City'] + ', TX')}`} target="_blank" rel="noopener noreferrer" className="p-1 text-blue-500 hover:bg-blue-50 rounded transition" title="Navigate">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </a>
                      <button onClick={() => setScheduleModalLead(appt)} className="p-1 text-amber-500 hover:bg-amber-50 rounded transition" title="Reschedule">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles[appt['Status']?.toUpperCase()] || 'bg-slate-100 text-slate-600'}`}>
                        {appt['Status']}
                      </span>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
            )}
          </div>
        )}

        {/* Weekly Calendar */}
        <div className="mb-6">
          <WeeklyCalendar
            leads={leads}
            onSelectLead={(lead) => setViewDetailsLead(lead)}
            onUpdate={() => fetchLeads()}
            userRole={userRole}
          />
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-xl shadow-sm">
          {/* Tabs */}
          <div className="flex">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                className={`px-4 py-2 text-sm transition-all border-l border-r border-b-4 border-t-0 rounded-t-lg ${
                  currentView === tab.id
                    ? 'bg-[#E0EBF7] text-black font-bold border-l-slate-300 border-r-slate-300 border-b-[#14b8a6]'
                    : 'bg-white text-black font-normal border-l-slate-300 border-r-slate-300 border-b-slate-500 hover:bg-slate-50'
                }`}
              >
                {tab.label}
                <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  currentView === tab.id
                    ? 'bg-[#14b8a6] text-white'
                    : 'bg-slate-400 text-white'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <div className="px-4 py-2 bg-[#E0EBF7] border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-2 focus:ring-[#14b8a6]/20 focus:outline-none transition text-sm"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Click any cell to edit inline
            </div>
            <button
              onClick={() => setShowQuickImport(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg font-semibold transition-all hover:shadow-lg flex items-center gap-2 text-sm"
              title="Paste text message to auto-create lead"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Smart Add
            </button>
            <Link
              href="/dashboard/add-lead"
              className="bg-[#14b8a6] hover:bg-[#0d9488] text-white px-4 py-1.5 rounded-lg font-semibold transition-all hover:shadow-lg flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Lead
            </Link>
          </div>

          {/* Table */}
          <div
            className="overflow-auto"
            style={{
              height: '500px',
              overflowX: 'scroll',
              overflowY: 'scroll'
            }}
          >
          {loading && (
            <div className="text-center py-16 text-slate-500 h-full flex flex-col items-center justify-center">
              <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full mb-4"></div>
              <p className="text-sm">Loading leads...</p>
            </div>
          )}

          {error && (
            <div className="p-6 text-red-600 text-center text-sm h-full flex items-center justify-center">{error}</div>
          )}

          {!loading && !error && (
            <div style={{ minWidth: '1800px' }}>
              <table style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead className="sticky top-0 z-10 bg-slate-300">
                  <tr className="bg-slate-300 border-b border-slate-400">
                    {columns.map((col, index) => (
                      <th
                        key={col}
                        className={`px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider relative select-none ${col !== 'Actions' ? 'cursor-pointer hover:bg-slate-400/50' : ''}`}
                        style={index === 0 ? { width: 140, minWidth: 140, maxWidth: 140 } : { width: columnWidths[currentView][index] }}
                        onClick={() => handleSort(col)}
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate">{col}</span>
                          {sortColumn === col && (
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {sortDirection === 'asc' ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              )}
                            </svg>
                          )}
                          {col !== 'Actions' && sortColumn !== col && (
                            <svg className="w-3 h-3 flex-shrink-0 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                          )}
                        </div>
                        {index > 0 && index < columns.length - 1 && (
                          <div
                            className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize group flex items-center justify-center hover:bg-[#14b8a6]/20"
                            onMouseDown={(e) => { e.stopPropagation(); startResize(index, e); }}
                          >
                            <div className="w-0.5 h-4 bg-slate-400 group-hover:bg-[#14b8a6] transition"></div>
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead, index) => {
                    const status = lead['Status']?.toUpperCase() || '';

                    return (
                      <tr key={index} className="hover:bg-slate-50 transition border-b border-slate-300">
                        {/* Actions Column - Not editable */}
                        <td className="px-0 py-1 bg-slate-100 border border-slate-300" style={{ width: (currentView === 'quoted' || currentView === 'closed') ? 80 : 130, minWidth: (currentView === 'quoted' || currentView === 'closed') ? 80 : 130, maxWidth: (currentView === 'quoted' || currentView === 'closed') ? 80 : 130 }}>
                          <div className="flex items-center justify-center gap-0">
                            {(currentView === 'quoted' || currentView === 'closed') ? (
                              <>
                              {/* Close Deal button - only for quoted view */}
                              {currentView === 'quoted' && (
                                <button
                                  onClick={() => setCloseDealModalLead(lead)}
                                  className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded transition"
                                  data-tip="Close Deal"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                              )}
                              {/* Commission adjustment button */}
                              <button
                                onClick={() => setCommissionModalLead(lead)}
                                className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded transition"
                                data-tip="Commission"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                              </>
                            ) : (
                              /* Regular action buttons: View, Edit, Schedule, Quote, Cancel */
                              <>
                                {/* 1. View */}
                                <button
                                  onClick={() => setViewDetailsLead(lead)}
                                  className="p-1 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded transition"
                                  data-tip="View"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                {/* 2. Edit */}
                                <button
                                  onClick={() => setEditModalLead(lead)}
                                  className="p-1 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded transition"
                                  data-tip="Edit"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                {/* 3. Schedule */}
                                <button
                                  onClick={() => setScheduleModalLead(lead)}
                                  className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition"
                                  data-tip="Schedule"
                                >
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/>
                                    <path d="M9 14h2v2H9zm4 0h2v2h-2zm4 0h2v2h-2zm-8-3h2v2H9zm4 0h2v2h-2zm4 0h2v2h-2z"/>
                                  </svg>
                                </button>
                                {/* 4. Quote (scheduled view) / Call (other views) */}
                                {currentView === 'scheduled' ? (
                                  <button
                                    onClick={() => setQuoteLeadModalLead(lead)}
                                    className="p-1 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded transition"
                                    data-tip="Quote"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => window.location.href = `tel:${lead['Phone Number']}`}
                                    className="p-1 text-green-500 hover:text-green-700 hover:bg-green-50 rounded transition"
                                    data-tip="Call"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                  </button>
                                )}
                                {/* 5. Cancel */}
                                {status !== 'CLOSED' && status !== 'CANCELED' && (
                                  <button
                                    onClick={() => updateLeadStatus(lead, 'CANCELED')}
                                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                    data-tip="Cancel"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </button>
                                )}
                                {status === 'CANCELED' && (
                                  <button
                                    onClick={() => updateLeadStatus(lead, 'NEW')}
                                    className="p-1 text-green-500 hover:text-green-700 hover:bg-green-50 rounded transition"
                                    data-tip="Reactivate"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>

                        {/* Lead ID - Not editable */}
                        <td className="px-4 py-3 text-sm font-medium text-[#0a2540] truncate">
                          {lead['Lead ID'] || ''}
                        </td>

                        {/* Status */}
                        {(currentView === 'quoted' || currentView === 'closed') ? (
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[status] || 'bg-slate-100 text-slate-600'}`}>
                              {lead['Status'] || ''}
                            </span>
                          </td>
                        ) : (
                          <InlineEditCell
                            value={lead['Status'] || ''}
                            field="Status"
                            leadId={lead['Lead ID']}
                            rowIndex={lead.rowIndex}
                            onSave={handleInlineSave}
                            type="select"
                            options={statuses}
                            displayValue={
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[status] || 'bg-slate-100 text-slate-600'}`}>
                                {lead['Status'] || ''}
                              </span>
                            }
                            className="text-slate-900"
                          />
                        )}

                        {/* Follow-up Date - only for followups view, positioned after Status */}
                        {currentView === 'followups' && (
                          <td className="px-4 py-3 text-sm text-slate-600 truncate">
                            {formatDate(lead['Follow-up Date'] || lead['Follow Up Date'] || lead['Followup Date'] || lead['Follow-Up Date'] || '')}
                          </td>
                        )}

                        {/* Brand - only for scheduled view */}
                        {currentView === 'scheduled' && (() => {
                          const brand = getBrandInfo(lead);
                          return (
                            <td className="px-4 py-3 text-sm">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${brand.style}`}>
                                {brand.name}
                              </span>
                            </td>
                          );
                        })()}

                        {/* Customer Name */}
                        {(currentView === 'quoted' || currentView === 'closed') ? (
                          <td className="px-4 py-3 text-sm text-slate-900 font-medium truncate">
                            {lead['Customer Name'] || ''}
                          </td>
                        ) : (
                          <InlineEditCell
                            value={lead['Customer Name'] || ''}
                            field="Customer Name"
                            leadId={lead['Lead ID']}
                            rowIndex={lead.rowIndex}
                            onSave={handleInlineSave}
                            type="text"
                            className="text-slate-900 font-medium"
                          />
                        )}

                        {/* Phone */}
                        {(currentView === 'quoted' || currentView === 'closed') ? (
                          <td className="px-4 py-3 text-sm text-[#14b8a6] font-medium truncate">
                            {formatPhone(lead['Phone Number'])}
                          </td>
                        ) : (
                          <InlineEditCell
                            value={lead['Phone Number'] || ''}
                            field="Phone Number"
                            leadId={lead['Lead ID']}
                            rowIndex={lead.rowIndex}
                            onSave={handleInlineSave}
                            type="phone"
                            displayValue={formatPhone(lead['Phone Number'])}
                            className="text-[#14b8a6] font-medium"
                          />
                        )}

                        {/* Address */}
                        {(currentView === 'quoted' || currentView === 'closed') ? (
                          <td className="px-4 py-3 text-sm text-slate-600 truncate">
                            {lead['Address'] || ''}
                          </td>
                        ) : (
                          <InlineEditCell
                            value={lead['Address'] || ''}
                            field="Address"
                            leadId={lead['Lead ID']}
                            rowIndex={lead.rowIndex}
                            onSave={handleInlineSave}
                            type="text"
                            className="text-slate-600"
                          />
                        )}

                        {/* City */}
                        {(currentView === 'quoted' || currentView === 'closed') ? (
                          <td className="px-4 py-3 text-sm text-slate-600 truncate">
                            {lead['City'] || ''}
                          </td>
                        ) : (
                          <InlineEditCell
                            value={lead['City'] || ''}
                            field="City"
                            leadId={lead['Lead ID']}
                            rowIndex={lead.rowIndex}
                            onSave={handleInlineSave}
                            type="text"
                            className="text-slate-600"
                          />
                        )}

                        {/* Service */}
                        {(currentView === 'quoted' || currentView === 'closed') ? (
                          <td className="px-4 py-3 text-sm text-slate-600 truncate">
                            {lead['Service Requested'] || ''}
                          </td>
                        ) : (
                          <InlineEditCell
                            value={lead['Service Requested'] || ''}
                            field="Service Requested"
                            leadId={lead['Lead ID']}
                            rowIndex={lead.rowIndex}
                            onSave={handleInlineSave}
                            type="select"
                            options={services}
                            className="text-slate-600"
                          />
                        )}

                        {/* View-specific columns */}
                        {currentView === 'new' && (
                          <td className="px-4 py-3 text-sm text-slate-600 truncate">
                            {formatDate(lead['Timestamp Received']) || ''}
                          </td>
                        )}

                        {/* Technician */}
                        {(currentView === 'quoted' || currentView === 'closed') ? (
                          <td className="px-4 py-3 text-sm text-slate-600 truncate">
                            {lead['Assigned To'] || ''}
                          </td>
                        ) : (
                          <InlineEditCell
                            value={lead['Assigned To'] || ''}
                            field="Assigned To"
                            leadId={lead['Lead ID']}
                            rowIndex={lead.rowIndex}
                            onSave={handleInlineSave}
                            type="select"
                            options={techs}
                            className="text-slate-600"
                          />
                        )}

                        {/* Appointment Date */}
                        {(currentView === 'quoted' || currentView === 'closed') ? (
                          <td className="px-4 py-3 text-sm text-slate-600 truncate">
                            {formatDate(lead['Appointment Date'])}
                          </td>
                        ) : (
                          <InlineEditCell
                            value={lead['Appointment Date'] || ''}
                            field="Appointment Date"
                            leadId={lead['Lead ID']}
                            rowIndex={lead.rowIndex}
                            onSave={handleInlineSave}
                            type="text"
                            displayValue={formatDate(lead['Appointment Date'])}
                            className="text-slate-600"
                          />
                        )}

                        {/* Scheduled view extra columns */}
                        {currentView === 'scheduled' && (
                          <>
                            <InlineEditCell
                              value={lead['Time Window'] || ''}
                              field="Time Window"
                              leadId={lead['Lead ID']}
                              rowIndex={lead.rowIndex}
                              onSave={handleInlineSave}
                              type="select"
                              options={timeWindows}
                              className="text-slate-600"
                            />
                            <td className="px-4 py-3 text-sm text-slate-600 truncate">
                              {formatDate(lead['Follow-up Date'] || lead['Follow Up Date'] || lead['Followup Date'] || lead['Follow-Up Date'] || '')}
                            </td>
                          </>
                        )}


                        {/* New view Customer Notes */}
                        {currentView === 'new' && (
                          <InlineEditCell
                            value={lead['Customer Issue/Notes'] || ''}
                            field="Customer Issue/Notes"
                            leadId={lead['Lead ID']}
                            rowIndex={lead.rowIndex}
                            onSave={handleInlineSave}
                            type="text"
                            className="text-slate-600"
                          />
                        )}

                        {/* Completed/Closed view extra columns - all read-only */}
                        {(currentView === 'quoted' || currentView === 'closed') && (
                          <>
                            <td className="px-4 py-3 text-sm text-slate-600 truncate">
                              {lead['Lead Source'] || ''}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 truncate">
                              {lead['Referral Source'] || ''}
                            </td>
                            <td className="px-4 py-3 text-sm text-green-600 font-medium truncate">
                              {lead['Amount Paid'] || ''}
                            </td>
                            <td className="px-4 py-3 text-sm text-red-600 font-medium truncate">
                              {lead['Total Cost'] || ''}
                            </td>
                            <td className="px-4 py-3 text-sm text-green-600 font-medium truncate bg-green-50">
                              {lead['Profit $'] || ''}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 truncate">
                              {lead['Sophia Commission %'] ? `${lead['Sophia Commission %']}%` : ''}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 truncate">
                              {lead['Amit Commission %'] ? `${lead['Amit Commission %']}%` : ''}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 truncate">
                              {lead['Lead Company Commission %'] ? `${lead['Lead Company Commission %']}%` : ''}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredLeads.length === 0 && !loading && (
                <div className="text-center py-16 text-slate-400">
                  <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="font-semibold text-slate-600 text-lg">No leads found</p>
                  <p className="text-sm mt-1">Try adjusting your search or add a new lead</p>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      {scheduleModalLead && (
        <ScheduleModal
          lead={scheduleModalLead}
          onClose={() => setScheduleModalLead(null)}
          onSuccess={() => fetchLeads()}
        />
      )}

      {/* Edit Modal */}
      {editModalLead && (
        <EditModal
          lead={editModalLead}
          onClose={() => setEditModalLead(null)}
          onSuccess={() => fetchLeads()}
        />
      )}

      {/* View Details Modal */}
      {viewDetailsLead && (
        <ViewDetailsModal
          lead={viewDetailsLead}
          onClose={() => setViewDetailsLead(null)}
          onEdit={() => setEditModalLead(viewDetailsLead)}
          onSchedule={() => setScheduleModalLead(viewDetailsLead)}
        />
      )}

      {/* Commission Modal */}
      {commissionModalLead && (
        <CommissionModal
          lead={commissionModalLead}
          onClose={() => setCommissionModalLead(null)}
          onSuccess={() => fetchLeads()}
        />
      )}

      {/* Close Deal Modal */}
      {closeDealModalLead && (
        <CloseDealModal
          lead={closeDealModalLead}
          onClose={() => setCloseDealModalLead(null)}
          onSuccess={() => fetchLeads()}
        />
      )}

      {/* Quote Lead Modal */}
      {quoteLeadModalLead && (
        <QuoteLeadModal
          lead={quoteLeadModalLead}
          onClose={() => setQuoteLeadModalLead(null)}
          onSuccess={() => fetchLeads()}
        />
      )}

      {/* Quick Import Modal */}
      {showQuickImport && (
        <QuickImportModal
          onClose={() => setShowQuickImport(false)}
          onSuccess={() => fetchLeads()}
        />
      )}

      {/* Agent Settings Modal */}
      {showAgentSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAgentSettings(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-cyan-600 to-teal-600 text-white px-6 py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <h2 className="text-lg font-semibold">Agent Settings</h2>
                </div>
                <button onClick={() => setShowAgentSettings(false)} className="text-white/80 hover:text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Daily Summary Agent */}
              <div className="border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-[#0a2540] flex items-center gap-2">
                      <span className="text-lg">📊</span>
                      Daily Summary Agent
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Sends daily summary at 6pm Houston time
                    </p>
                  </div>
                  <button
                    onClick={() => updateAgentSetting('daily_summary_enabled', agentSettings['daily_summary_enabled'] === 'true' ? 'false' : 'true')}
                    disabled={agentLoading}
                    className={`relative w-14 h-7 rounded-full transition-colors ${
                      agentSettings['daily_summary_enabled'] === 'true' ? 'bg-green-500' : 'bg-slate-300'
                    }`}
                  >
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      agentSettings['daily_summary_enabled'] === 'true' ? 'translate-x-8' : 'translate-x-1'
                    }`}></div>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wide">Send To</label>
                    <p className="font-medium text-slate-700">{agentSettings['daily_summary_phone'] || '281-904-4674'}</p>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wide">Schedule</label>
                    <p className="font-medium text-slate-700">6:00 PM Daily (Houston)</p>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wide">Conditions</label>
                    <p className="text-sm text-slate-600">Only sends if there are closed jobs today</p>
                  </div>
                </div>

                {/* Test Button */}
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <button
                    onClick={testDailySummaryAgent}
                    disabled={agentLoading}
                    className="w-full py-2.5 bg-[#0a2540] hover:bg-[#1a3a5c] text-white rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {agentLoading ? (
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Send Test Summary Now
                      </>
                    )}
                  </button>

                  {agentTestResult && (
                    <div className={`mt-3 p-3 rounded-lg text-sm ${
                      agentTestResult.startsWith('✅') ? 'bg-green-50 text-green-700' :
                      agentTestResult.startsWith('⚠️') ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {agentTestResult}
                    </div>
                  )}
                </div>
              </div>

              {/* Future agents can be added here */}
              <div className="text-center text-sm text-slate-400">
                More agents coming soon...
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
