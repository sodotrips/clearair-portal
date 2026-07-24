'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardMainNav from '../../components/DashboardMainNav';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

interface Lead {
  [key: string]: string;
}

export default function AnalyticsDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Date range filter — same control as the Financials page (from/to + presets)
  const formatLocalDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const getWeekRange = (date: Date = new Date()) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
    const start = new Date(d);
    start.setDate(d.getDate() - dayOfWeek); // Sunday
    const end = new Date(start);
    end.setDate(start.getDate() + 6); // Saturday
    return { start: formatLocalDate(start), end: formatLocalDate(end) };
  };

  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatLocalDate(start), end: formatLocalDate(end) };
  });

  useEffect(() => {
    fetchLeads();
  }, []);

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

  // Parse date string to Date object
  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr || dateStr === '-') return null;

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      const [month, day, year] = dateStr.split('/').map(Number);
      return new Date(year, month - 1, day);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    return null;
  };

  // Range bounds as Date objects (local time).
  const rangeBounds = () => {
    const [sy, sm, sd] = dateRange.start.split('-').map(Number);
    const [ey, em, ed] = dateRange.end.split('-').map(Number);
    return {
      startDate: new Date(sy, sm - 1, sd, 0, 0, 0, 0),
      endDate: new Date(ey, em - 1, ed, 23, 59, 59, 999),
    };
  };

  // Lead-intake basis: filter by when the lead was CREATED (Timestamp Received).
  // Drives Total Leads, status mix, sources, and leads-over-time.
  const filterByDateRange = (leads: Lead[]) => {
    const { startDate, endDate } = rangeBounds();
    return leads.filter(lead => {
      const d = parseDate(lead['Timestamp Received']);
      return d ? d >= startDate && d <= endDate : false;
    });
  };

  // Job-outcome basis: filter by Appointment Date. Drives the "Closed jobs" count.
  const filterByAppointment = (leads: Lead[]) => {
    const { startDate, endDate } = rangeBounds();
    return leads.filter(lead => {
      const d = parseDate(lead['Appointment Date']);
      return d ? d >= startDate && d <= endDate : false;
    });
  };

  // A job counts as closed if CLOSED or AWAITING PAYMENT (work done; sub owes us).
  const isClosedStatus = (lead: Lead) => {
    const s = lead['Status']?.toUpperCase();
    return s === 'CLOSED' || s === 'AWAITING PAYMENT';
  };

  // Job counts by appointment date (operations view), separate from lead intake.
  const apptLeads = filterByAppointment(leads);
  const closedJobsCount = apptLeads.filter(isClosedStatus).length;
  const quotedJobsCount = apptLeads.filter(l => l['Status']?.toUpperCase() === 'QUOTED').length;
  const scheduledJobsCount = apptLeads.filter(l => l['Status']?.toUpperCase() === 'SCHEDULED').length;

  const filteredLeads = filterByDateRange(leads);

  // Date preset functions — identical to the Financials page
  const setThisWeek = () => setDateRange(getWeekRange());
  const setLastWeek = () => {
    const now = new Date();
    const thisSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const lastWeekDay = new Date(thisSunday);
    lastWeekDay.setDate(thisSunday.getDate() - 1);
    setDateRange(getWeekRange(lastWeekDay));
  };
  const setThisMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDateRange({ start: formatLocalDate(start), end: formatLocalDate(end) });
  };
  const setThisYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    setDateRange({ start: formatLocalDate(start), end: formatLocalDate(end) });
  };
  const setAllTime = () => {
    setDateRange({ start: '2020-01-01', end: formatLocalDate(new Date()) });
  };
  const formatDateRange = () => {
    const [sy, sm, sd] = dateRange.start.split('-').map(Number);
    const [ey, em, ed] = dateRange.end.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}, ${end.getFullYear()}`;
  };

  // Calculate stats
  const stats = {
    total: filteredLeads.length,
    new: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'NEW').length,
    scheduled: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'SCHEDULED').length,
    quoted: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'QUOTED').length,
    closed: filteredLeads.filter(isClosedStatus).length,
    completed: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'COMPLETED').length,
    canceled: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'CANCELED').length,
    lost: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'LOST').length,
  };

  // Conversion = of the jobs a tech actually visited, how many closed.
  // A visit ends in either a quote or a close; scheduled = not visited yet,
  // canceled = no visit. So visited = Quoted + Closed (appointment-based).
  const visitedJobsCount = quotedJobsCount + closedJobsCount;
  const conversionRate = visitedJobsCount > 0
    ? Math.round((closedJobsCount / visitedJobsCount) * 100)
    : 0;

  // Status distribution for donut chart
  const statusData = {
    labels: ['New', 'Scheduled', 'Quoted', 'Closed', 'Completed', 'Canceled', 'Lost'],
    datasets: [{
      data: [stats.new, stats.scheduled, stats.quoted, stats.closed, stats.completed, stats.canceled, stats.lost],
      backgroundColor: [
        '#3b82f6', // blue - New
        '#14b8a6', // teal - Scheduled
        '#f59e0b', // amber - Quoted
        '#22c55e', // green - Closed
        '#10b981', // emerald - Completed
        '#94a3b8', // slate - Canceled
        '#ef4444', // red - Lost
      ],
      borderWidth: 0,
    }]
  };

  // Lead source distribution
  const sourceCount: Record<string, number> = {};
  filteredLeads.forEach(lead => {
    const source = lead['Lead Source'] || 'Unknown';
    sourceCount[source] = (sourceCount[source] || 0) + 1;
  });

  const sourceData = {
    labels: Object.keys(sourceCount),
    datasets: [{
      label: 'Leads by Source',
      data: Object.values(sourceCount),
      backgroundColor: '#14b8a6',
      borderRadius: 6,
    }]
  };

  // Lead Source Detail - All Statuses
  const sourceDetailStats: Record<string, {
    total: number;
    new: number;
    scheduled: number;
    quoted: number;
    closed: number;
    completed: number;
    canceled: number;
    lost: number;
  }> = {};

  filteredLeads.forEach(lead => {
    const sourceDetail = lead['Lead Source Detail']?.trim() || 'Organic';
    const status = lead['Status']?.toUpperCase();

    if (!sourceDetailStats[sourceDetail]) {
      sourceDetailStats[sourceDetail] = {
        total: 0, new: 0, scheduled: 0, quoted: 0,
        closed: 0, completed: 0, canceled: 0, lost: 0
      };
    }
    sourceDetailStats[sourceDetail].total++;

    if (status === 'NEW') sourceDetailStats[sourceDetail].new++;
    else if (status === 'SCHEDULED') sourceDetailStats[sourceDetail].scheduled++;
    else if (status === 'QUOTED') sourceDetailStats[sourceDetail].quoted++;
    else if (status === 'CLOSED' || status === 'AWAITING PAYMENT') sourceDetailStats[sourceDetail].closed++;
    else if (status === 'COMPLETED') sourceDetailStats[sourceDetail].completed++;
    else if (status === 'CANCELED') sourceDetailStats[sourceDetail].canceled++;
    else if (status === 'LOST') sourceDetailStats[sourceDetail].lost++;
  });

  // Sort by total leads descending
  const sortedSourceDetails = Object.entries(sourceDetailStats)
    .sort((a, b) => b[1].total - a[1].total);

  const sourceDetailData = {
    labels: sortedSourceDetails.map(([source]) => source),
    datasets: [
      {
        label: 'New',
        data: sortedSourceDetails.map(([, s]) => s.new),
        backgroundColor: '#3b82f6',
        borderRadius: 6,
      },
      {
        label: 'Scheduled',
        data: sortedSourceDetails.map(([, s]) => s.scheduled),
        backgroundColor: '#14b8a6',
        borderRadius: 6,
      },
      {
        label: 'Quoted',
        data: sortedSourceDetails.map(([, s]) => s.quoted),
        backgroundColor: '#f59e0b',
        borderRadius: 6,
      },
      {
        label: 'Closed',
        data: sortedSourceDetails.map(([, s]) => s.closed),
        backgroundColor: '#22c55e',
        borderRadius: 6,
      },
      {
        label: 'Completed',
        data: sortedSourceDetails.map(([, s]) => s.completed),
        backgroundColor: '#10b981',
        borderRadius: 6,
      },
      {
        label: 'Canceled',
        data: sortedSourceDetails.map(([, s]) => s.canceled),
        backgroundColor: '#94a3b8',
        borderRadius: 6,
      },
      {
        label: 'Lost',
        data: sortedSourceDetails.map(([, s]) => s.lost),
        backgroundColor: '#ef4444',
        borderRadius: 6,
      },
    ]
  };

  // Service type distribution
  const serviceCount: Record<string, number> = {};
  filteredLeads.forEach(lead => {
    const service = lead['Service Requested'] || 'Unknown';
    serviceCount[service] = (serviceCount[service] || 0) + 1;
  });

  const serviceData = {
    labels: Object.keys(serviceCount),
    datasets: [{
      label: 'Leads by Service',
      data: Object.values(serviceCount),
      backgroundColor: [
        '#0a2540',
        '#14b8a6',
        '#3b82f6',
        '#f59e0b',
        '#ef4444',
      ],
      borderWidth: 0,
    }]
  };

  // City distribution
  const cityCount: Record<string, number> = {};
  filteredLeads.forEach(lead => {
    const city = lead['City'] || 'Unknown';
    cityCount[city] = (cityCount[city] || 0) + 1;
  });

  // Sort cities by count and take top 10
  const sortedCities = Object.entries(cityCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const cityData = {
    labels: sortedCities.map(([city]) => city),
    datasets: [{
      label: 'Leads by City',
      data: sortedCities.map(([, count]) => count),
      backgroundColor: '#0a2540',
      borderRadius: 6,
    }]
  };

  // Leads over time across the selected from/to range. Long ranges (> ~13 weeks)
  // group by month; shorter ranges group by day.
  const getLeadsOverTime = () => {
    const data: Record<string, number> = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [sy, sm, sd] = dateRange.start.split('-').map(Number);
    const [ey, em, ed] = dateRange.end.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    const dayMs = 1000 * 60 * 60 * 24;
    const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
    const byMonth = totalDays > 92;

    const monthKey = (d: Date) => `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    const dayKey = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

    if (byMonth) {
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        data[monthKey(cur)] = 0;
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
        data[dayKey(new Date(t))] = 0;
      }
    }

    filteredLeads.forEach(lead => {
      const leadDate = parseDate(lead['Timestamp Received']);
      if (!leadDate) return;
      const key = byMonth ? monthKey(leadDate) : dayKey(leadDate);
      if (data[key] !== undefined) data[key]++;
    });

    return data;
  };

  const leadsOverTime = getLeadsOverTime();

  const timeData = {
    labels: Object.keys(leadsOverTime),
    datasets: [{
      label: 'New Leads',
      data: Object.values(leadsOverTime),
      borderColor: '#14b8a6',
      backgroundColor: 'rgba(20, 184, 166, 0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#14b8a6',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
    }]
  };

  // Technician performance
  const techStats: Record<string, { total: number; closed: number }> = {};
  filteredLeads.forEach(lead => {
    const tech = lead['Assigned To'];
    if (tech && tech !== '-') {
      if (!techStats[tech]) {
        techStats[tech] = { total: 0, closed: 0 };
      }
      techStats[tech].total++;
      if (isClosedStatus(lead)) {
        techStats[tech].closed++;
      }
    }
  });

  const techData = {
    labels: Object.keys(techStats),
    datasets: [
      {
        label: 'Assigned',
        data: Object.values(techStats).map(t => t.total),
        backgroundColor: '#0a2540',
        borderRadius: 6,
      },
      {
        label: 'Closed',
        data: Object.values(techStats).map(t => t.closed),
        backgroundColor: '#22c55e',
        borderRadius: 6,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
        }
      },
      datalabels: {
        display: false, // Disable by default
      }
    }
  };

  const barOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#14b8a6] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-[#0a2540] text-white px-6 py-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-400 hover:text-white transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="w-10 h-10 bg-[#14b8a6] rounded-lg flex items-center justify-center font-bold text-lg">
              CA
            </div>
            <div>
              <h1 className="text-xl font-semibold">Analytics Dashboard</h1>
              <p className="text-slate-400 text-sm">Business Insights</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:gap-4">
            <DashboardMainNav />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
        )}

        {/* Date Range Filter - same control as the Financials page */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">From:</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">To:</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={setThisWeek} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">This Week</button>
              <button onClick={setLastWeek} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">Last Week</button>
              <button onClick={setThisMonth} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">This Month</button>
              <button onClick={setThisYear} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">This Year</button>
              <button onClick={setAllTime} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">All Time</button>
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Showing data for: <span className="font-medium text-slate-700">{formatDateRange()}</span>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Total Leads</p>
            <p className="text-3xl font-bold text-[#0a2540] mt-1">{stats.total}</p>
            <p className="text-xs text-slate-400 mt-1">created in range</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Quoted</p>
            <p className="text-3xl font-bold text-amber-500 mt-1">{quotedJobsCount}</p>
            <p className="text-xs text-slate-400 mt-1">quoted to customer</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Scheduled</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{scheduledJobsCount}</p>
            <p className="text-xs text-slate-400 mt-1">upcoming jobs</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Closed Jobs</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{closedJobsCount}</p>
            <p className="text-xs text-slate-400 mt-1">by appointment date</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Conversion Rate</p>
            <p className="text-3xl font-bold text-[#14b8a6] mt-1">{conversionRate}%</p>
            <p className="text-xs text-slate-400 mt-1">{closedJobsCount} closed / {visitedJobsCount} visited</p>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Status Distribution */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Leads by Status</h3>
            <div className="h-64">
              <Doughnut data={statusData} options={{
                ...chartOptions,
                cutout: '60%',
              }} />
            </div>
          </div>

          {/* Leads Over Time */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Leads Over Time</h3>
            <div className="h-64">
              <Line data={timeData} options={barOptions} />
            </div>
          </div>
        </div>

        {/* Lead Source Detail - Full Width */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Conversion by Lead Source</h3>
          <div className="h-72">
            <Bar data={sourceDetailData} options={{
              ...barOptions,
              scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true },
              },
              plugins: {
                ...barOptions.plugins,
                datalabels: {
                  display: (context: any) => {
                    // Only show label on the last (top) dataset
                    return context.datasetIndex === sourceDetailData.datasets.length - 1;
                  },
                  anchor: 'end',
                  align: 'end',
                  formatter: (_value: any, context: any) => {
                    // Calculate total for this bar
                    const total = sortedSourceDetails[context.dataIndex]?.[1]?.total || 0;
                    return total;
                  },
                  color: '#0a2540',
                  font: {
                    weight: 'bold',
                    size: 12,
                  },
                },
              },
            }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {sortedSourceDetails.map(([source, data]) => {
              const closedTotal = data.closed + data.completed;
              const convRate = data.total > 0 ? Math.round((closedTotal / data.total) * 100) : 0;
              return (
                <div key={source} className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg">
                  <span className="font-medium text-slate-700">{source}:</span>
                  <span className="text-green-600 font-semibold">{closedTotal}/{data.total}</span>
                  <span className="text-slate-500">({convRate}% closed)</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Lead Source */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Leads by Source</h3>
            <div className="h-64">
              <Bar data={sourceData} options={barOptions} />
            </div>
          </div>

          {/* Service Type */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Leads by Service</h3>
            <div className="h-64">
              <Doughnut data={serviceData} options={{
                ...chartOptions,
                cutout: '60%',
              }} />
            </div>
          </div>
        </div>

        {/* Charts Row 3 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Top Cities */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Top Cities</h3>
            <div className="h-64">
              <Bar data={cityData} options={{
                ...barOptions,
                indexAxis: 'y' as const,
              }} />
            </div>
          </div>

          {/* Technician Performance */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Technician Performance</h3>
            <div className="h-64">
              {Object.keys(techStats).length > 0 ? (
                <Bar data={techData} options={barOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  No technician data available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary Table */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Status Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Status</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Count</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Percentage</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { status: 'New', count: stats.new, color: 'bg-blue-500' },
                  { status: 'Scheduled', count: stats.scheduled, color: 'bg-teal-500' },
                  { status: 'Quoted', count: stats.quoted, color: 'bg-amber-500' },
                  { status: 'Closed', count: stats.closed, color: 'bg-green-500' },
                  { status: 'Completed', count: stats.completed, color: 'bg-emerald-500' },
                  { status: 'Canceled', count: stats.canceled, color: 'bg-slate-400' },
                  { status: 'Lost', count: stats.lost, color: 'bg-red-500' },
                ].map(row => (
                  <tr key={row.status} className="border-b border-slate-100">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${row.color}`}></div>
                        <span className="text-sm text-slate-700">{row.status}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-semibold text-slate-800">{row.count}</td>
                    <td className="py-3 px-4 text-right text-sm text-slate-600">
                      {stats.total > 0 ? Math.round((row.count / stats.total) * 100) : 0}%
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${row.color}`}
                          style={{ width: `${stats.total > 0 ? (row.count / stats.total) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
