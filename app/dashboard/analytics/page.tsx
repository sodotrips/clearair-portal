'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  Filler
);

interface Lead {
  [key: string]: string;
}

export default function AnalyticsDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('30'); // days

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

  // Houston timezone helper
  const getHoustonDate = () => {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  };

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

  // Filter leads by date range
  const filterByDateRange = (leads: Lead[]) => {
    const today = getHoustonDate();
    const daysAgo = new Date(today);
    daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));

    return leads.filter(lead => {
      const leadDate = parseDate(lead['Timestamp Received']);
      if (!leadDate) return false;
      return leadDate >= daysAgo && leadDate <= today;
    });
  };

  const filteredLeads = dateRange === 'all' ? leads : filterByDateRange(leads);

  // Calculate stats
  const stats = {
    total: filteredLeads.length,
    new: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'NEW').length,
    scheduled: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'SCHEDULED').length,
    closed: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'CLOSED').length,
    canceled: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'CANCELED').length,
    inProgress: filteredLeads.filter(l => l['Status']?.toUpperCase() === 'IN PROGRESS').length,
  };

  const conversionRate = stats.total > 0
    ? Math.round((stats.closed / stats.total) * 100)
    : 0;

  // Status distribution for donut chart
  const statusData = {
    labels: ['New', 'Scheduled', 'In Progress', 'Closed', 'Canceled'],
    datasets: [{
      data: [stats.new, stats.scheduled, stats.inProgress, stats.closed, stats.canceled],
      backgroundColor: [
        '#3b82f6', // blue
        '#14b8a6', // teal
        '#a855f7', // purple
        '#22c55e', // green
        '#94a3b8', // slate
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

  // Leads over time (last 30 days or selected range)
  const getLeadsOverTime = () => {
    const days = dateRange === 'all' ? 30 : parseInt(dateRange);
    const today = getHoustonDate();
    const data: Record<string, number> = {};

    // Initialize all days with 0
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const key = `${date.getMonth() + 1}/${date.getDate()}`;
      data[key] = 0;
    }

    // Count leads per day
    filteredLeads.forEach(lead => {
      const leadDate = parseDate(lead['Timestamp Received']);
      if (leadDate) {
        const key = `${leadDate.getMonth() + 1}/${leadDate.getDate()}`;
        if (data[key] !== undefined) {
          data[key]++;
        }
      }
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
      if (lead['Status']?.toUpperCase() === 'CLOSED') {
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
          <div className="flex items-center gap-4">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-[#1a3a5c] text-white border border-slate-600 rounded-lg px-4 py-2 text-sm"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Total Leads</p>
            <p className="text-3xl font-bold text-[#0a2540] mt-1">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Closed</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{stats.closed}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Conversion Rate</p>
            <p className="text-3xl font-bold text-[#14b8a6] mt-1">{conversionRate}%</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Pending</p>
            <p className="text-3xl font-bold text-amber-500 mt-1">{stats.new + stats.scheduled + stats.inProgress}</p>
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
                  { status: 'In Progress', count: stats.inProgress, color: 'bg-purple-500' },
                  { status: 'Closed', count: stats.closed, color: 'bg-green-500' },
                  { status: 'Canceled', count: stats.canceled, color: 'bg-slate-400' },
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
