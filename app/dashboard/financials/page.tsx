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

export default function FinancialDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [partnerCommission, setPartnerCommission] = useState('');
  const [amitCommission, setAmitCommission] = useState('');
  const [saving, setSaving] = useState(false);

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

  // Parse currency string to number
  const parseCurrency = (value: string): number => {
    if (!value || value === '-') return 0;
    return parseFloat(value.replace(/[$,]/g, '')) || 0;
  };

  // Format number as currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Filter leads by date range
  const filterByDateRange = (leads: Lead[]) => {
    const today = getHoustonDate();
    const daysAgo = new Date(today);
    daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));

    return leads.filter(lead => {
      const leadDate = parseDate(lead['Timestamp Received'] || lead['Appointment Date']);
      if (!leadDate) return false;
      return leadDate >= daysAgo && leadDate <= today;
    });
  };

  const filteredLeads = dateRange === 'all' ? leads : filterByDateRange(leads);

  // Calculate financial metrics
  const completedLeads = filteredLeads.filter(l => l['Status']?.toUpperCase() === 'COMPLETED');
  const quotedLeads = filteredLeads.filter(l => parseCurrency(l['Quote Amount']) > 0);

  const totalQuoted = filteredLeads.reduce((sum, l) => sum + parseCurrency(l['Quote Amount']), 0);
  const totalRevenue = completedLeads.reduce((sum, l) => sum + parseCurrency(l['Final Amount'] || l['Quote Amount']), 0);
  const pendingRevenue = filteredLeads
    .filter(l => {
      const status = l['Status']?.toUpperCase();
      return status === 'SCHEDULED' || status === 'IN PROGRESS' || status === 'QUOTED';
    })
    .reduce((sum, l) => sum + parseCurrency(l['Quote Amount']), 0);

  const avgJobValue = completedLeads.length > 0
    ? totalRevenue / completedLeads.length
    : 0;

  const conversionRate = quotedLeads.length > 0
    ? Math.round((completedLeads.length / quotedLeads.length) * 100)
    : 0;

  // Revenue by service type
  const revenueByService: Record<string, number> = {};
  completedLeads.forEach(lead => {
    const service = lead['Service Requested'] || 'Unknown';
    const amount = parseCurrency(lead['Final Amount'] || lead['Quote Amount']);
    revenueByService[service] = (revenueByService[service] || 0) + amount;
  });

  const serviceRevenueData = {
    labels: Object.keys(revenueByService),
    datasets: [{
      data: Object.values(revenueByService),
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

  // Revenue by technician
  const revenueByTech: Record<string, { revenue: number; jobs: number }> = {};
  completedLeads.forEach(lead => {
    const tech = lead['Assigned To'] || 'Unassigned';
    const amount = parseCurrency(lead['Final Amount'] || lead['Quote Amount']);
    if (!revenueByTech[tech]) {
      revenueByTech[tech] = { revenue: 0, jobs: 0 };
    }
    revenueByTech[tech].revenue += amount;
    revenueByTech[tech].jobs++;
  });

  const techRevenueData = {
    labels: Object.keys(revenueByTech),
    datasets: [{
      label: 'Revenue',
      data: Object.values(revenueByTech).map(t => t.revenue),
      backgroundColor: '#14b8a6',
      borderRadius: 6,
    }]
  };

  // Revenue by city
  const revenueByCity: Record<string, number> = {};
  completedLeads.forEach(lead => {
    const city = lead['City'] || 'Unknown';
    const amount = parseCurrency(lead['Final Amount'] || lead['Quote Amount']);
    revenueByCity[city] = (revenueByCity[city] || 0) + amount;
  });

  const sortedCityRevenue = Object.entries(revenueByCity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const cityRevenueData = {
    labels: sortedCityRevenue.map(([city]) => city),
    datasets: [{
      label: 'Revenue',
      data: sortedCityRevenue.map(([, revenue]) => revenue),
      backgroundColor: '#0a2540',
      borderRadius: 6,
    }]
  };

  // Monthly revenue trend
  const getMonthlyRevenue = () => {
    const months: Record<string, number> = {};
    const today = getHoustonDate();

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      const key = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      months[key] = 0;
    }

    completedLeads.forEach(lead => {
      const leadDate = parseDate(lead['Appointment Date'] || lead['Timestamp Received']);
      if (leadDate) {
        const key = leadDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (months[key] !== undefined) {
          months[key] += parseCurrency(lead['Final Amount'] || lead['Quote Amount']);
        }
      }
    });

    return months;
  };

  const monthlyRevenue = getMonthlyRevenue();

  const monthlyRevenueData = {
    labels: Object.keys(monthlyRevenue),
    datasets: [{
      label: 'Monthly Revenue',
      data: Object.values(monthlyRevenue),
      borderColor: '#14b8a6',
      backgroundColor: 'rgba(20, 184, 166, 0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#14b8a6',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 6,
    }]
  };

  // Commission Model:
  // 1. Ads/Organic Leads (Google, FB, Organic): Sophia 25%, Amit 75%
  // 2. Amit's Partners (HVAC Vendor, Realtor, etc.): Amit splits with partner (default 50/50, can be adjusted per lead)
  // 3. Lead Gen Company Referrals: Amit 50%, Lead Gen Company 50%

  // Lead Source categories for commission calculation
  // Based on user's Lead Source values:
  // - Google Ads, Facebook Ads, Google Ads - Dryer Vent, Organic, Referral, Repeat Customer → Sophia 25% / Amit 75%
  // - Lead Company → Amit 50% / Partner 50%
  // - Partner → Amit 50% / Partner 50% (custom split available)

  const isAdsOrOrganic = (source: string) => {
    const s = source.toLowerCase();
    return s.includes('google ads') || s.includes('facebook ads') || s.includes('fb ads') ||
           s === 'organic' || s === 'referral' || s === 'repeat customer' ||
           s.includes('seo') || s.includes('website') || s === '';
  };

  const isLeadGenCompany = (source: string) => {
    const s = source.toLowerCase();
    return s === 'lead company' || s.includes('lead gen') || s.includes('leadgen') ||
           s.includes('angi') || s.includes('homeadvisor') || s.includes('thumbtack') ||
           s.includes('yelp');
  };

  const isAmitPartner = (source: string) => {
    const s = source.toLowerCase();
    return s === 'partner' || s.includes('hvac') || s.includes('realtor') ||
           s.includes('vendor') || s.includes('contractor');
  };

  const calculateCommissions = () => {
    let sophiaCommission = 0;
    let amitCommission = 0;
    let partnerCommission = 0;

    let adsOrganicJobs = 0;
    let leadGenJobs = 0;
    let partnerJobs = 0;

    let adsOrganicRevenue = 0;
    let leadGenRevenue = 0;
    let partnerRevenue = 0;

    completedLeads.forEach(lead => {
      const revenue = parseCurrency(lead['Final Amount'] || lead['Quote Amount']);
      const leadSource = lead['Lead Source'] || '';

      // Check for manual partner split (stored in lead)
      const manualPartnerSplit = parseCurrency(lead['Partner Commission']) || 0;
      const manualAmitSplit = parseCurrency(lead['Amit Commission']) || 0;

      if (isAdsOrOrganic(leadSource)) {
        // Ads/Organic: Sophia 25%, Amit 75%
        sophiaCommission += revenue * 0.25;
        amitCommission += revenue * 0.75;
        adsOrganicJobs++;
        adsOrganicRevenue += revenue;
      } else if (isLeadGenCompany(leadSource)) {
        // Lead Gen Company: Amit 50%, Lead Gen 50%
        amitCommission += revenue * 0.50;
        partnerCommission += revenue * 0.50;
        leadGenJobs++;
        leadGenRevenue += revenue;
      } else if (isAmitPartner(leadSource)) {
        // Amit's Partners: Use manual split if set, otherwise default 50/50
        if (manualPartnerSplit > 0 || manualAmitSplit > 0) {
          amitCommission += manualAmitSplit;
          partnerCommission += manualPartnerSplit;
        } else {
          // Default 50/50 split
          amitCommission += revenue * 0.50;
          partnerCommission += revenue * 0.50;
        }
        partnerJobs++;
        partnerRevenue += revenue;
      } else {
        // Unknown source - default to Ads/Organic model
        sophiaCommission += revenue * 0.25;
        amitCommission += revenue * 0.75;
        adsOrganicJobs++;
        adsOrganicRevenue += revenue;
      }
    });

    return {
      sophia: { commission: sophiaCommission, jobs: adsOrganicJobs, revenue: adsOrganicRevenue },
      amit: { commission: amitCommission, jobs: adsOrganicJobs + leadGenJobs + partnerJobs, revenue: adsOrganicRevenue + leadGenRevenue + partnerRevenue },
      partner: { commission: partnerCommission, jobs: leadGenJobs + partnerJobs, revenue: leadGenRevenue + partnerRevenue },
      breakdown: {
        adsOrganic: { jobs: adsOrganicJobs, revenue: adsOrganicRevenue, sophiaRate: 0.25, amitRate: 0.75 },
        leadGen: { jobs: leadGenJobs, revenue: leadGenRevenue, amitRate: 0.50, partnerRate: 0.50 },
        amitPartner: { jobs: partnerJobs, revenue: partnerRevenue, defaultSplit: 0.50 },
      },
      total: sophiaCommission + amitCommission + partnerCommission,
    };
  };

  const commissions = calculateCommissions();

  // Save financial info
  const handleSaveFinancials = async () => {
    if (!editingLead) return;

    setSaving(true);
    try {
      const updates: Record<string, string> = {
        'Quote Amount': quoteAmount,
        'Final Amount': finalAmount,
      };

      // Only include commission fields if they have values (for partner deals)
      if (partnerCommission) {
        updates['Partner Commission'] = partnerCommission;
      }
      if (amitCommission) {
        updates['Amit Commission'] = amitCommission;
      }

      const response = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: editingLead.rowIndex,
          updates,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setLeads(prev => prev.map(lead =>
          lead.rowIndex === editingLead.rowIndex
            ? { ...lead, ...updates }
            : lead
        ));
        setEditingLead(null);
        setQuoteAmount('');
        setFinalAmount('');
        setPartnerCommission('');
        setAmitCommission('');
      } else {
        alert('Failed to save: ' + result.error);
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setSaving(false);
    }
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

  const currencyBarOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: number | string) {
            return '$' + Number(value).toLocaleString();
          }
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#14b8a6] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500">Loading financials...</p>
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
              <h1 className="text-xl font-semibold">Financial Dashboard</h1>
              <p className="text-slate-400 text-sm">Revenue & Performance</p>
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
              <option value="365">Last 12 months</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
        )}

        {/* Financial KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Total Revenue</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs text-slate-400 mt-1">{completedLeads.length} completed jobs</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Pending Revenue</p>
            <p className="text-2xl font-bold text-amber-500 mt-1">{formatCurrency(pendingRevenue)}</p>
            <p className="text-xs text-slate-400 mt-1">Scheduled & quoted</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Total Quoted</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(totalQuoted)}</p>
            <p className="text-xs text-slate-400 mt-1">{quotedLeads.length} quotes sent</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Avg Job Value</p>
            <p className="text-2xl font-bold text-[#14b8a6] mt-1">{formatCurrency(avgJobValue)}</p>
            <p className="text-xs text-slate-400 mt-1">Per completed job</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Close Rate</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{conversionRate}%</p>
            <p className="text-xs text-slate-400 mt-1">Quotes to completed</p>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Monthly Revenue Trend */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Revenue Trend</h3>
            <div className="h-64">
              <Line data={monthlyRevenueData} options={currencyBarOptions} />
            </div>
          </div>

          {/* Revenue by Service */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Revenue by Service</h3>
            <div className="h-64">
              {Object.keys(revenueByService).length > 0 ? (
                <Doughnut data={serviceRevenueData} options={{
                  ...chartOptions,
                  cutout: '60%',
                  plugins: {
                    ...chartOptions.plugins,
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          return ` ${context.label}: ${formatCurrency(context.raw as number)}`;
                        }
                      }
                    }
                  }
                }} />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  No revenue data available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Revenue by Technician */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Revenue by Technician</h3>
            <div className="h-64">
              {Object.keys(revenueByTech).length > 0 ? (
                <Bar data={techRevenueData} options={currencyBarOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  No technician data available
                </div>
              )}
            </div>
          </div>

          {/* Revenue by City */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Top Cities by Revenue</h3>
            <div className="h-64">
              {sortedCityRevenue.length > 0 ? (
                <Bar data={cityRevenueData} options={{
                  ...currencyBarOptions,
                  indexAxis: 'y' as const,
                }} />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  No city data available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lead Provider Performance */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-[#0a2540]">Lead Provider Performance</h3>
            <p className="text-xs text-slate-500">Based on "Referral Source" column</p>
          </div>

          {(() => {
            // Calculate provider metrics
            const providerMetrics: Record<string, {
              leads: number;
              completed: number;
              revenue: number;
              commissionOwed: number;
            }> = {};

            filteredLeads.forEach(lead => {
              const provider = lead['Referral Source'] || lead['Lead Provider'] || '';
              if (!provider || provider === '-') return;

              if (!providerMetrics[provider]) {
                providerMetrics[provider] = { leads: 0, completed: 0, revenue: 0, commissionOwed: 0 };
              }

              providerMetrics[provider].leads++;

              if (lead['Status']?.toUpperCase() === 'COMPLETED') {
                providerMetrics[provider].completed++;
                const revenue = parseCurrency(lead['Final Amount'] || lead['Quote Amount']);
                providerMetrics[provider].revenue += revenue;

                // Check if it's a lead gen company for commission calculation
                const leadSource = lead['Lead Source']?.toLowerCase() || '';
                if (isLeadGenCompany(leadSource) || isAmitPartner(leadSource)) {
                  // Use custom commission if set, otherwise 50%
                  const partnerComm = parseCurrency(lead['Partner Commission']);
                  providerMetrics[provider].commissionOwed += partnerComm > 0 ? partnerComm : revenue * 0.50;
                }
              }
            });

            const sortedProviders = Object.entries(providerMetrics)
              .sort((a, b) => b[1].revenue - a[1].revenue);

            const totalProviderRevenue = sortedProviders.reduce((sum, [, data]) => sum + data.revenue, 0);

            if (sortedProviders.length === 0) {
              return (
                <div className="text-center py-8 text-slate-400">
                  <p>No lead provider data available</p>
                  <p className="text-xs mt-1">Add provider names to "Referral Source" column in your sheet</p>
                </div>
              );
            }

            return (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Provider</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Leads</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Closed</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Close Rate</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Revenue</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Avg Job</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Commission Owed</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProviders.map(([provider, data]) => {
                        const closeRate = data.leads > 0 ? Math.round((data.completed / data.leads) * 100) : 0;
                        const avgJob = data.completed > 0 ? data.revenue / data.completed : 0;
                        const pctOfTotal = totalProviderRevenue > 0 ? (data.revenue / totalProviderRevenue) * 100 : 0;

                        return (
                          <tr key={provider} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">
                                  {provider.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-slate-800">{provider}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm text-right text-slate-600">{data.leads}</td>
                            <td className="py-3 px-4 text-sm text-right text-slate-600">{data.completed}</td>
                            <td className="py-3 px-4 text-sm text-right">
                              <span className={`font-medium ${closeRate >= 60 ? 'text-green-600' : closeRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                                {closeRate}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-right font-semibold text-green-600">
                              {formatCurrency(data.revenue)}
                            </td>
                            <td className="py-3 px-4 text-sm text-right text-slate-600">
                              {formatCurrency(avgJob)}
                            </td>
                            <td className="py-3 px-4 text-sm text-right font-semibold text-amber-600">
                              {formatCurrency(data.commissionOwed)}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-slate-100 rounded-full h-2">
                                  <div
                                    className="h-2 rounded-full bg-[#14b8a6]"
                                    style={{ width: `${Math.min(pctOfTotal, 100)}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs text-slate-500">{pctOfTotal.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-semibold">
                        <td className="py-3 px-4 text-sm text-slate-800">Total</td>
                        <td className="py-3 px-4 text-sm text-right text-slate-800">
                          {sortedProviders.reduce((sum, [, d]) => sum + d.leads, 0)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-slate-800">
                          {sortedProviders.reduce((sum, [, d]) => sum + d.completed, 0)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-slate-800">-</td>
                        <td className="py-3 px-4 text-sm text-right text-green-600">
                          {formatCurrency(totalProviderRevenue)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-slate-800">-</td>
                        <td className="py-3 px-4 text-sm text-right text-amber-600">
                          {formatCurrency(sortedProviders.reduce((sum, [, d]) => sum + d.commissionOwed, 0))}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-800">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Top Provider Highlight */}
                {sortedProviders.length > 0 && sortedProviders[0][1].revenue > 0 && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center text-lg font-bold">
                        #1
                      </div>
                      <div>
                        <p className="text-sm text-amber-700">Top Performing Provider</p>
                        <p className="text-lg font-bold text-amber-900">{sortedProviders[0][0]}</p>
                        <p className="text-xs text-amber-600">
                          {formatCurrency(sortedProviders[0][1].revenue)} revenue from {sortedProviders[0][1].completed} jobs
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Commission Breakdown */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-[#0a2540]">Commission Breakdown</h3>
            <div className="text-right">
              <p className="text-sm text-slate-500">Total Commissions</p>
              <p className="text-xl font-bold text-[#14b8a6]">{formatCurrency(commissions.total)}</p>
            </div>
          </div>

          {/* Commission Model Summary */}
          <div className="mb-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-1">Commission Model:</p>
            <ul className="space-y-0.5">
              <li>• <span className="font-medium">Ads/Organic:</span> Sophia 25% | Amit 75%</li>
              <li>• <span className="font-medium">Lead Gen (Angi, etc.):</span> Amit 50% | Lead Gen Co. 50%</li>
              <li>• <span className="font-medium">Amit's Partners:</span> Custom split (default 50/50)</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sophia's Commission */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-5 border border-purple-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                  S
                </div>
                <div>
                  <h4 className="font-semibold text-purple-900">Sophia's Commission</h4>
                  <p className="text-xs text-purple-600">25% of Ads/Organic leads</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-purple-700">Ads/Organic Jobs</span>
                  <span className="font-semibold text-purple-900">{commissions.breakdown.adsOrganic.jobs}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-purple-700">Revenue</span>
                  <span className="font-semibold text-purple-900">{formatCurrency(commissions.breakdown.adsOrganic.revenue)}</span>
                </div>
                <div className="border-t border-purple-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-purple-700">Commission (25%)</span>
                    <span className="text-xl font-bold text-purple-600">{formatCurrency(commissions.sophia.commission)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Amit's Commission */}
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-5 border border-teal-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center text-white font-bold">
                  A
                </div>
                <div>
                  <h4 className="font-semibold text-teal-900">Amit's Commission</h4>
                  <p className="text-xs text-teal-600">All lead sources</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-teal-700">Ads/Organic (75%)</span>
                  <span className="font-semibold text-teal-900">{formatCurrency(commissions.breakdown.adsOrganic.revenue * 0.75)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-teal-700">Lead Gen (50%)</span>
                  <span className="font-semibold text-teal-900">{formatCurrency(commissions.breakdown.leadGen.revenue * 0.50)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-teal-700">Partner Deals</span>
                  <span className="font-semibold text-teal-900">{formatCurrency(commissions.breakdown.amitPartner.revenue * 0.50)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-sm text-teal-700">Total Jobs</span>
                  <span className="font-semibold text-teal-900">{commissions.amit.jobs}</span>
                </div>
                <div className="border-t border-teal-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-teal-700">Total Commission</span>
                    <span className="text-xl font-bold text-teal-600">{formatCurrency(commissions.amit.commission)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Partner/External Commission */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-5 border border-amber-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center text-white font-bold">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-amber-900">Partner Commission</h4>
                  <p className="text-xs text-amber-600">Lead Gen & Amit's Partners</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-amber-700">Lead Gen Co. (50%)</span>
                  <span className="font-semibold text-amber-900">{formatCurrency(commissions.breakdown.leadGen.revenue * 0.50)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-amber-700">Amit's Partners</span>
                  <span className="font-semibold text-amber-900">{formatCurrency(commissions.breakdown.amitPartner.revenue * 0.50)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-sm text-amber-700">Total Jobs</span>
                  <span className="font-semibold text-amber-900">{commissions.partner.jobs}</span>
                </div>
                <div className="border-t border-amber-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-amber-700">Total Owed</span>
                    <span className="text-xl font-bold text-amber-600">{formatCurrency(commissions.partner.commission)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lead Source Breakdown Table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Lead Source Type</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Jobs</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Revenue</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Sophia</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Amit</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Partner</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-3 text-slate-700">Ads / Organic</td>
                  <td className="py-2 px-3 text-right">{commissions.breakdown.adsOrganic.jobs}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(commissions.breakdown.adsOrganic.revenue)}</td>
                  <td className="py-2 px-3 text-right text-purple-600 font-medium">25%</td>
                  <td className="py-2 px-3 text-right text-teal-600 font-medium">75%</td>
                  <td className="py-2 px-3 text-right text-slate-400">-</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-3 text-slate-700">Lead Gen Company</td>
                  <td className="py-2 px-3 text-right">{commissions.breakdown.leadGen.jobs}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(commissions.breakdown.leadGen.revenue)}</td>
                  <td className="py-2 px-3 text-right text-slate-400">-</td>
                  <td className="py-2 px-3 text-right text-teal-600 font-medium">50%</td>
                  <td className="py-2 px-3 text-right text-amber-600 font-medium">50%</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-3 text-slate-700">Amit's Partners</td>
                  <td className="py-2 px-3 text-right">{commissions.breakdown.amitPartner.jobs}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(commissions.breakdown.amitPartner.revenue)}</td>
                  <td className="py-2 px-3 text-right text-slate-400">-</td>
                  <td className="py-2 px-3 text-right text-teal-600 font-medium">Custom*</td>
                  <td className="py-2 px-3 text-right text-amber-600 font-medium">Custom*</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td className="py-2 px-3 text-slate-800">Total</td>
                  <td className="py-2 px-3 text-right">{completedLeads.length}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(totalRevenue)}</td>
                  <td className="py-2 px-3 text-right text-purple-600">{formatCurrency(commissions.sophia.commission)}</td>
                  <td className="py-2 px-3 text-right text-teal-600">{formatCurrency(commissions.amit.commission)}</td>
                  <td className="py-2 px-3 text-right text-amber-600">{formatCurrency(commissions.partner.commission)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-slate-500 mt-2">*Partner splits can be customized per job in Job Financial Details below</p>
          </div>

          {/* Net Summary */}
          <div className="mt-4 p-4 bg-slate-50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500">Total Revenue</p>
                <p className="font-bold text-slate-800">{formatCurrency(totalRevenue)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Commissions</p>
                <p className="font-bold text-[#14b8a6]">{formatCurrency(commissions.total)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Net to Business</p>
                <p className="font-bold text-green-600">{formatCurrency(totalRevenue - commissions.total)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Commission %</p>
                <p className="font-bold text-slate-800">
                  {totalRevenue > 0 ? ((commissions.total / totalRevenue) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Job Financial Details Table */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-[#0a2540]">Job Financial Details</h3>
            <p className="text-xs text-slate-500">Click a row to edit quote/final amounts</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Lead ID</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Customer</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Service</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Technician</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Quote Amount</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Final Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads
                  .filter(l => {
                    const status = l['Status']?.toUpperCase();
                    return status === 'COMPLETED' || status === 'PAID';
                  })
                  .slice(0, 20)
                  .map((lead, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition"
                      onClick={() => {
                        setEditingLead(lead);
                        setQuoteAmount(lead['Quote Amount'] || '');
                        setFinalAmount(lead['Final Amount'] || '');
                        setPartnerCommission(lead['Partner Commission'] || '');
                        setAmitCommission(lead['Amit Commission'] || '');
                      }}
                    >
                      <td className="py-3 px-4 text-sm text-slate-600">{lead['Lead ID']}</td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-800">{lead['Customer Name']}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{lead['Service Requested']}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          lead['Status']?.toUpperCase() === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          lead['Status']?.toUpperCase() === 'SCHEDULED' ? 'bg-teal-100 text-teal-700' :
                          lead['Status']?.toUpperCase() === 'QUOTED' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {lead['Status']}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">{lead['Assigned To'] || '-'}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-blue-600">
                        {lead['Quote Amount'] ? formatCurrency(parseCurrency(lead['Quote Amount'])) : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-green-600">
                        {lead['Final Amount'] ? formatCurrency(parseCurrency(lead['Final Amount'])) : '-'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Financial Modal */}
      {editingLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingLead(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#0a2540] text-white px-6 py-4 rounded-t-xl flex justify-between items-center sticky top-0">
              <div>
                <h2 className="text-lg font-semibold">Update Financials</h2>
                <p className="text-slate-400 text-sm">{editingLead['Customer Name']} - {editingLead['Lead ID']}</p>
              </div>
              <button onClick={() => setEditingLead(null)} className="text-slate-400 hover:text-white transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg text-sm">
                <p><span className="font-medium">Service:</span> {editingLead['Service Requested']}</p>
                <p><span className="font-medium">Status:</span> {editingLead['Status']}</p>
                <p><span className="font-medium">Lead Source:</span> {editingLead['Lead Source'] || 'Unknown'}</p>
                <p><span className="font-medium">Technician:</span> {editingLead['Assigned To'] || 'Unassigned'}</p>
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-medium mb-1.5">Quote Amount ($)</label>
                <input
                  type="text"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  placeholder="e.g., 250"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-medium mb-1.5">Final Amount ($)</label>
                <input
                  type="text"
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(e.target.value)}
                  placeholder="e.g., 275"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Enter final invoiced amount after job completion</p>
              </div>

              {/* Partner Commission Split - Only show for partner/lead gen deals */}
              {(isAmitPartner(editingLead['Lead Source'] || '') || isLeadGenCompany(editingLead['Lead Source'] || '')) && (
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Custom Commission Split
                  </h4>
                  <p className="text-xs text-slate-500 mb-3">
                    For partner deals, enter the exact dollar amounts for commission split.
                    Leave blank to use default 50/50 split.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 text-sm font-medium mb-1.5">Amit's Commission ($)</label>
                      <input
                        type="text"
                        value={amitCommission}
                        onChange={(e) => setAmitCommission(e.target.value)}
                        placeholder="e.g., 150"
                        className="w-full px-4 py-2.5 border border-teal-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition text-sm bg-teal-50"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 text-sm font-medium mb-1.5">Partner's Commission ($)</label>
                      <input
                        type="text"
                        value={partnerCommission}
                        onChange={(e) => setPartnerCommission(e.target.value)}
                        placeholder="e.g., 125"
                        className="w-full px-4 py-2.5 border border-amber-300 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition text-sm bg-amber-50"
                      />
                    </div>
                  </div>

                  {/* Auto-calculate helper */}
                  {finalAmount && (
                    <div className="mt-2 p-2 bg-slate-100 rounded text-xs text-slate-600">
                      <p>Final Amount: <span className="font-semibold">{formatCurrency(parseCurrency(finalAmount))}</span></p>
                      <p>Default 50/50: <span className="font-semibold">{formatCurrency(parseCurrency(finalAmount) * 0.5)}</span> each</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingLead(null);
                    setQuoteAmount('');
                    setFinalAmount('');
                    setPartnerCommission('');
                    setAmitCommission('');
                  }}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFinancials}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
