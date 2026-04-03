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
import ChartDataLabels from 'chartjs-plugin-datalabels';
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
  Filler,
  ChartDataLabels
);

interface Lead {
  [key: string]: string;
}

export default function FinancialDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Date range filter - same as Payouts page
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
    return getWeekRange();
  });

  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [laborCost, setLaborCost] = useState('');
  const [materialCost, setMaterialCost] = useState('');
  const [subcontractorCost, setSubcontractorCost] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [profitAmount, setProfitAmount] = useState('');
  const [partnerCommission, setPartnerCommission] = useState('');
  const [amitCommission, setAmitCommission] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [financialPage, setFinancialPage] = useState(1);
  const FINANCIAL_PAGE_SIZE = 25;
  const [financialSortCol, setFinancialSortCol] = useState('Appointment Date');
  const [financialSortDir, setFinancialSortDir] = useState<'asc' | 'desc'>('asc');
  const [financialSearch, setFinancialSearch] = useState('');

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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Filter leads by date range (based on Appointment Date)
  const filterByDateRange = (leads: Lead[]) => {
    // Parse dates as local time (not UTC) to avoid timezone shift
    const [startYear, startMonth, startDay] = dateRange.start.split('-').map(Number);
    const [endYear, endMonth, endDay] = dateRange.end.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    return leads.filter(lead => {
      const leadDate = parseDate(lead['Appointment Date']);
      if (!leadDate) return false;
      return leadDate >= startDate && leadDate <= endDate;
    });
  };

  const filteredLeads = filterByDateRange(leads);

  // Date preset functions
  const setThisWeek = () => {
    setDateRange(getWeekRange());
  };

  const setLastWeek = () => {
    const now = new Date();
    const thisSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const lastWeekDay = new Date(thisSunday);
    lastWeekDay.setDate(thisSunday.getDate() - 1); // Last Saturday
    setDateRange(getWeekRange(lastWeekDay));
  };

  const setThisMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
  };

  const setThisYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1); // Jan 1 of current year
    const end = new Date(now.getFullYear(), 11, 31); // Dec 31 of current year
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
  };

  const setAllTime = () => {
    setDateRange({
      start: '2020-01-01',
      end: new Date().toISOString().split('T')[0],
    });
  };

  const formatDateRange = () => {
    // Parse dates as local time (not UTC) to avoid timezone shift
    const [startYear, startMonth, startDay] = dateRange.start.split('-').map(Number);
    const [endYear, endMonth, endDay] = dateRange.end.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}, ${end.getFullYear()}`;
  };

  // Calculate financial metrics
  const closedLeads = filteredLeads.filter(l => l['Status']?.toUpperCase() === 'CLOSED');
  const quotedOrScheduledLeads = filteredLeads.filter(l => {
    const status = l['Status']?.toUpperCase();
    return status === 'QUOTED' || status === 'SCHEDULED';
  });

  // Card 1: Total Gross Sales (sum of Amount Paid for closed jobs)
  const totalGrossSales = closedLeads.reduce((sum, l) => sum + parseCurrency(l['Amount Paid']), 0);

  // Card 2: Total Gross Profit (sum of Profit $ for closed jobs)
  const totalGrossProfit = closedLeads.reduce((sum, l) => sum + parseCurrency(l['Profit $']), 0);
  const totalRevenue = totalGrossProfit; // Alias for commission calculations

  // Card 3: Total Sales Tax (Amount Paid - PreTax amount, where PreTax = Amount Paid / 1.0825)
  const totalSalesTax = closedLeads.reduce((sum, l) => {
    const amountPaid = parseCurrency(l['Amount Paid']);
    const preTax = amountPaid / 1.0825;
    const tax = amountPaid - preTax;
    return sum + tax;
  }, 0);

  // Card 4: Pending Quotes (sum of Quote Amount for QUOTED and SCHEDULED status)
  const pendingQuotes = quotedOrScheduledLeads.reduce((sum, l) => sum + parseCurrency(l['Quote Amount']), 0);

  // Card 5: Closing Rate (Closed jobs / Total jobs in filtered period)
  const totalJobsInPeriod = closedLeads.length + quotedOrScheduledLeads.length;
  const closingRate = totalJobsInPeriod > 0
    ? Math.round((closedLeads.length / totalJobsInPeriod) * 100)
    : 0;

  // Revenue by service type
  const revenueByService: Record<string, number> = {};
  closedLeads.forEach(lead => {
    const service = lead['Service Requested'] || 'Unknown';
    const amount = parseCurrency(lead['Amount Paid'] || lead['Quote Amount']);
    revenueByService[service] = (revenueByService[service] || 0) + amount;
  });

  const serviceRevenueLabels = Object.entries(revenueByService).map(([service, amount]) =>
    `${service} - $${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  );

  const serviceRevenueData = {
    labels: serviceRevenueLabels,
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
      datalabels: {
        display: false,
      },
    }]
  };

  // Revenue by Lead Source
  const revenueByLeadSource: Record<string, number> = {};
  closedLeads.forEach(lead => {
    const source = lead['Lead Source'] || 'Unknown';
    const amount = parseCurrency(lead['Amount Paid']);
    revenueByLeadSource[source] = (revenueByLeadSource[source] || 0) + amount;
  });

  const leadSourceRevenueData = {
    labels: Object.keys(revenueByLeadSource),
    datasets: [{
      label: 'Paid $',
      data: Object.values(revenueByLeadSource),
      backgroundColor: '#14b8a6',
      borderRadius: 6,
    }]
  };

  // Revenue by city
  const revenueByCity: Record<string, number> = {};
  closedLeads.forEach(lead => {
    const city = lead['City'] || 'Unknown';
    const amount = parseCurrency(lead['Amount Paid'] || lead['Quote Amount']);
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

  // Monthly revenue trend from January 2026 to December 2026
  const getMonthlyRevenue = () => {
    const months: { year: number; month: number; label: string; revenue: number }[] = [];

    // Generate all 12 months of 2026 (Jan - Dec)
    for (let month = 0; month < 12; month++) {
      const date = new Date(2026, month, 1);
      const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      months.push({
        year: 2026,
        month: month,
        label,
        revenue: 0
      });
    }

    // Sum revenue (Amount Paid) for each month - use ALL closed leads, not filtered by date range
    leads
      .filter(l => l['Status']?.toUpperCase() === 'CLOSED')
      .forEach(lead => {
        const leadDate = parseDate(lead['Appointment Date'] || lead['Timestamp Received']);
        if (leadDate && leadDate.getFullYear() === 2026) {
          const monthData = months.find(m => m.month === leadDate.getMonth());
          if (monthData) {
            monthData.revenue += parseCurrency(lead['Amount Paid']);
          }
        }
      });

    return months;
  };

  const monthlyRevenue = getMonthlyRevenue();

  const monthlyRevenueData = {
    labels: monthlyRevenue.map(m => m.label),
    datasets: [{
      label: 'Monthly Gross Sales',
      data: monthlyRevenue.map(m => m.revenue),
      borderColor: '#14b8a6',
      backgroundColor: 'rgba(20, 184, 166, 0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#14b8a6',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 6,
      datalabels: {
        display: true,
        color: '#0a2540',
        anchor: 'end' as const,
        align: 'top' as const,
        offset: 4,
        font: {
          weight: 'bold' as const,
          size: 11,
        },
        formatter: (value: number) => {
          if (value === 0) return '';
          return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        },
      },
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

    closedLeads.forEach(lead => {
      const revenue = parseCurrency(lead['Amount Paid'] || lead['Quote Amount']);
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
        'Invoice Number': invoiceNumber,
        'Quote Amount': quoteAmount,
        'Amount Paid': finalAmount,
        'Payment Method': paymentMethod,
        'Labor Cost': laborCost,
        'Materials Cost': materialCost,
        'Subcontractor Cost': subcontractorCost,
        'Total Cost': totalCost,
        'Profit $': profitAmount,
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
        // Also update the calculated fields for local display
        const updatedLead = {
          ...editingLead,
          ...updates,
        };
        setLeads(prev => prev.map(lead =>
          lead.rowIndex === editingLead.rowIndex
            ? updatedLead
            : lead
        ));
        resetEditForm();
      } else {
        alert('Failed to save: ' + result.error);
      }
    } catch (err) {
      alert('Failed to connect to server');
    } finally {
      setSaving(false);
    }
  };

  const resetEditForm = () => {
    setEditingLead(null);
    setQuoteAmount('');
    setFinalAmount('');
    setPaymentMethod('');
    setLaborCost('');
    setMaterialCost('');
    setSubcontractorCost('');
    setTotalCost('');
    setProfitAmount('');
    setPartnerCommission('');
    setAmitCommission('');
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
        display: false, // Default off for other charts
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
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
        )}

        {/* Date Range Filter - Same as Payouts page */}
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
              <button onClick={setThisWeek} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">
                This Week
              </button>
              <button onClick={setLastWeek} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">
                Last Week
              </button>
              <button onClick={setThisMonth} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">
                This Month
              </button>
              <button onClick={setThisYear} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">
                This Year
              </button>
              <button onClick={setAllTime} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">
                All Time
              </button>
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Showing data for: <span className="font-medium text-slate-700">{formatDateRange()}</span>
          </div>
        </div>

        {/* Financial KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Total Gross Sales</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(totalGrossSales)}</p>
            <p className="text-xs text-slate-400 mt-1">{closedLeads.length} closed jobs</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Total Gross Profit</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalGrossProfit)}</p>
            <p className="text-xs text-slate-400 mt-1">From closed jobs</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Total Sales Tax</p>
            <p className="text-2xl font-bold text-amber-500 mt-1">{formatCurrency(totalSalesTax)}</p>
            <p className="text-xs text-slate-400 mt-1">8.25% collected</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Pending Quotes</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{formatCurrency(pendingQuotes)}</p>
            <p className="text-xs text-slate-400 mt-1">{quotedOrScheduledLeads.length} jobs pending</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm font-medium">Closing Rate</p>
            <p className="text-2xl font-bold text-[#14b8a6] mt-1">{closingRate}%</p>
            <p className="text-xs text-slate-400 mt-1">{closedLeads.length} of {totalJobsInPeriod} jobs</p>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Monthly Revenue Trend */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Monthly Gross Sales</h3>
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
          {/* Revenue by Lead Source */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-[#0a2540] mb-4">Revenue by Lead Source</h3>
            <div className="h-64">
              {Object.keys(revenueByLeadSource).length > 0 ? (
                <Bar data={leadSourceRevenueData} options={currencyBarOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  No lead source data available
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
                  ...chartOptions,
                  indexAxis: 'y' as const,
                  scales: {
                    x: {
                      beginAtZero: true,
                      ticks: {
                        callback: function(value: number | string) {
                          return '$' + Number(value).toLocaleString();
                        }
                      }
                    },
                    y: {
                      ticks: {
                        font: {
                          size: 11
                        }
                      }
                    }
                  }
                }} />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  No city data available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Balance Sheet */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-lg font-semibold text-[#0a2540]">Balance Sheet</h3>
            <span className="text-sm text-slate-500">{formatDateRange()}</span>
          </div>

          {(() => {
            // Calculate totals for balance sheet
            const totalExpenses = closedLeads.reduce((sum, l) => {
              const labor = parseCurrency(l['Labor Cost']);
              const materials = parseCurrency(l['Materials Cost']);
              const subcontractor = parseCurrency(l['Subcontractor Cost']);
              const sophiaComm = parseCurrency(l['Sophia Commission $']);
              const leadCompanyComm = parseCurrency(l['Lead Company Commission $']);
              return sum + labor + materials + subcontractor + sophiaComm + leadCompanyComm;
            }, 0);

            const totalLaborCost = closedLeads.reduce((sum, l) => sum + parseCurrency(l['Labor Cost']), 0);
            const totalMaterialsCost = closedLeads.reduce((sum, l) => sum + parseCurrency(l['Materials Cost']), 0);
            const totalSubcontractorCost = closedLeads.reduce((sum, l) => sum + parseCurrency(l['Subcontractor Cost']), 0);
            const totalSophiaCommission = closedLeads.reduce((sum, l) => sum + parseCurrency(l['Sophia Commission $']), 0);
            const totalLeadCompanyCommission = closedLeads.reduce((sum, l) => sum + parseCurrency(l['Lead Company Commission $']), 0);
            const totalAmitCommission = closedLeads.reduce((sum, l) => sum + parseCurrency(l['Amit Commission $']), 0);
            const preTaxRevenue = totalGrossSales / 1.0825;
            // Net Income = Amit Commission $ (what Amit makes after all expenses)
            const netIncome = totalAmitCommission;

            return (
              <div className="space-y-4">
                {/* Revenue Section */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-blue-50 px-4 py-2 border-b border-slate-200">
                    <h4 className="text-sm font-bold text-blue-800 uppercase tracking-wide">Revenue</h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50">
                      <span className="text-sm text-slate-700">Gross Sales</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(totalGrossSales)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50">
                      <span className="text-sm text-red-600">Less: Sales Tax (8.25%)</span>
                      <span className="text-sm font-semibold text-red-600">({formatCurrency(totalSalesTax)})</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4 bg-blue-50">
                      <span className="text-sm font-bold text-blue-800">Net Revenue</span>
                      <span className="text-base font-bold text-blue-800">{formatCurrency(preTaxRevenue)}</span>
                    </div>
                  </div>
                </div>

                {/* Expenses Section */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-4 py-2 border-b border-slate-200">
                    <h4 className="text-sm font-bold text-red-800 uppercase tracking-wide">Expenses</h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50">
                      <span className="text-sm text-slate-700">Labor Cost</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(totalLaborCost)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50">
                      <span className="text-sm text-slate-700">Materials Cost</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(totalMaterialsCost)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50">
                      <span className="text-sm text-slate-700">Subcontractor Cost</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(totalSubcontractorCost)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50">
                      <span className="text-sm text-slate-700">Sophia Commission</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(totalSophiaCommission)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50">
                      <span className="text-sm text-slate-700">Lead Company Commission</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(totalLeadCompanyCommission)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4 bg-red-50">
                      <span className="text-sm font-bold text-red-800">Total Expenses</span>
                      <span className="text-base font-bold text-red-800">({formatCurrency(totalExpenses)})</span>
                    </div>
                  </div>
                </div>

                {/* Net Income */}
                <div className={`border-2 rounded-lg overflow-hidden ${netIncome >= 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                  <div className="flex justify-between items-center p-4">
                    <div>
                      <span className={`text-xs font-bold uppercase tracking-wide ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>Net Income</span>
                      <div className={`text-2xl font-bold mt-1 ${netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(netIncome)}
                      </div>
                    </div>
                    <div className={`text-right px-4 py-2 rounded-lg ${netIncome >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                      <span className="text-xs text-slate-600 block">Profit Margin</span>
                      <span className={`text-xl font-bold ${netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {preTaxRevenue > 0 ? ((netIncome / preTaxRevenue) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Job Financial Details Table */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h3 className="text-lg font-semibold text-[#0a2540]">Job Financial Details</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search customer, lead ID…"
                  value={financialSearch}
                  onChange={e => { setFinancialSearch(e.target.value); setFinancialPage(1); }}
                  className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14b8a6] w-52"
                />
                {financialSearch && (
                  <button onClick={() => setFinancialSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">✕</button>
                )}
              </div>
              <p className="text-xs text-slate-500">Click a row to edit financial details</p>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  {([
                    { label: 'Lead ID', col: 'Lead ID', align: 'left' },
                    { label: 'Invoice #', col: 'Invoice Number', align: 'left' },
                    { label: 'Customer', col: 'Customer Name', align: 'left' },
                    { label: 'Appt Date', col: 'Appointment Date', align: 'center' },
                    { label: 'Status', col: 'Status', align: 'left' },
                    { label: 'Quote $', col: 'Quote Amount', align: 'right' },
                    { label: 'Paid $', col: 'Amount Paid', align: 'right' },
                    { label: 'Payment Method', col: 'Payment Method', align: 'center' },
                    { label: 'Payment Date', col: 'Payment Date', align: 'center' },
                    { label: 'Pretax Total Cost', col: 'Total Cost', align: 'right' },
                    { label: 'Expenses', col: '_expenses', align: 'right' },
                    { label: 'Gross Profit', col: 'Profit $', align: 'right' },
                  ] as { label: string; col: string; align: string }[]).map(({ label, col, align }) => (
                    <th
                      key={col}
                      onClick={() => {
                        if (financialSortCol === col) {
                          setFinancialSortDir(d => d === 'asc' ? 'desc' : 'asc');
                        } else {
                          setFinancialSortCol(col);
                          setFinancialSortDir('asc');
                        }
                        setFinancialPage(1);
                      }}
                      className={`py-3 px-3 text-sm font-semibold text-slate-600 cursor-pointer select-none hover:text-[#14b8a6] whitespace-nowrap text-${align}`}
                    >
                      {label}
                      <span className="ml-1 text-xs text-slate-400">
                        {financialSortCol === col ? (financialSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </th>
                  ))}
                  <th className="text-center py-3 px-3 text-sm font-semibold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads
                  .filter(l => l['Status']?.toUpperCase() === 'CLOSED')
                  .filter(l => {
                    if (!financialSearch.trim()) return true;
                    const q = financialSearch.toLowerCase();
                    return (
                      (l['Customer Name'] || '').toLowerCase().includes(q) ||
                      (l['Lead ID'] || '').toLowerCase().includes(q) ||
                      (l['Address'] || '').toLowerCase().includes(q) ||
                      (l['Payment Method'] || '').toLowerCase().includes(q)
                    );
                  })
                  .sort((a, b) => {
                    const dir = financialSortDir === 'asc' ? 1 : -1;
                    const col = financialSortCol;

                    // Date columns
                    if (col === 'Appointment Date' || col === 'Payment Date') {
                      const dateA = parseDate(a[col]);
                      const dateB = parseDate(b[col]);
                      if (!dateA && !dateB) return 0;
                      if (!dateA) return dir;
                      if (!dateB) return -dir;
                      return (dateA.getTime() - dateB.getTime()) * dir;
                    }

                    // Currency columns
                    if (['Quote Amount', 'Amount Paid', 'Total Cost', 'Profit $'].includes(col)) {
                      return (parseCurrency(a[col]) - parseCurrency(b[col])) * dir;
                    }

                    // Computed expenses column
                    if (col === '_expenses') {
                      const expA = parseCurrency(a['Labor Cost']) + parseCurrency(a['Materials Cost']) + parseCurrency(a['Subcontractor Cost']);
                      const expB = parseCurrency(b['Labor Cost']) + parseCurrency(b['Materials Cost']) + parseCurrency(b['Subcontractor Cost']);
                      return (expA - expB) * dir;
                    }

                    // Text columns
                    const valA = (a[col] || '').toLowerCase();
                    const valB = (b[col] || '').toLowerCase();
                    if (valA < valB) return -dir;
                    if (valA > valB) return dir;
                    return 0;
                  })
                  .slice((financialPage - 1) * FINANCIAL_PAGE_SIZE, financialPage * FINANCIAL_PAGE_SIZE)
                  .map((lead, idx) => {
                    // Calculate expenses from columns CE, CF, CG
                    // Headers: Labor Cost (CE), Materials Cost (CF), Subcontractor Cost (CG)
                    const laborCost = parseCurrency(lead['Labor Cost']);
                    const materialsCost = parseCurrency(lead['Materials Cost']); // Note: "Materials" plural
                    const subcontractorCost = parseCurrency(lead['Subcontractor Cost']);
                    const expenses = laborCost + materialsCost + subcontractorCost;

                    return (
                      <tr
                        key={idx}
                        className="border-b border-slate-300 hover:bg-slate-50 transition"
                      >
                        <td className="py-3 px-3 text-sm text-slate-600">{lead['Lead ID']}</td>
                        <td className="py-3 px-3 text-sm text-slate-600">{lead['Invoice Number'] || '-'}</td>
                        <td className="py-3 px-3 text-sm font-medium text-slate-800">{lead['Customer Name']}</td>
                        <td className="py-3 px-3 text-sm text-center text-slate-600">
                          {lead['Appointment Date'] || '-'}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            lead['Status']?.toUpperCase() === 'CLOSED' ? 'bg-green-100 text-green-700' :
                            lead['Status']?.toUpperCase() === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {lead['Status']}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-sm text-right font-medium text-blue-600">
                          {lead['Quote Amount'] ? formatCurrency(parseCurrency(lead['Quote Amount'])) : '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-right font-medium text-green-600">
                          {lead['Amount Paid'] ? formatCurrency(parseCurrency(lead['Amount Paid'])) : '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-center text-slate-600">
                          {lead['Payment Method'] || '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-center text-slate-600">
                          {lead['Payment Date'] || '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-right text-slate-600">
                          {lead['Total Cost'] ? formatCurrency(parseCurrency(lead['Total Cost'])) : '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-right text-red-500">
                          {expenses > 0 ? formatCurrency(expenses) : '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-right font-semibold text-emerald-600">
                          {lead['Profit $'] ? formatCurrency(parseCurrency(lead['Profit $'])) : '-'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => {
                              setEditingLead(lead);
                              setQuoteAmount(lead['Quote Amount'] || '');
                              setFinalAmount(lead['Amount Paid'] || '');
                              setPaymentMethod(lead['Payment Method'] || '');
                              setLaborCost(lead['Labor Cost'] || '');
                              setMaterialCost(lead['Materials Cost'] || '');
                              setSubcontractorCost(lead['Subcontractor Cost'] || '');
                              setTotalCost(lead['Total Cost'] || '');
                              setProfitAmount(lead['Profit $'] || '');
                              setPartnerCommission(lead['Partner Commission'] || '');
                              setAmitCommission(lead['Amit Commission'] || '');
                              setInvoiceNumber(lead['Invoice Number'] || '');
                            }}
                            className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition"
                            title="Edit financials"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(() => {
            const closedJobs = filteredLeads
              .filter(l => l['Status']?.toUpperCase() === 'CLOSED')
              .filter(l => {
                if (!financialSearch.trim()) return true;
                const q = financialSearch.toLowerCase();
                return (
                  (l['Customer Name'] || '').toLowerCase().includes(q) ||
                  (l['Lead ID'] || '').toLowerCase().includes(q) ||
                  (l['Address'] || '').toLowerCase().includes(q) ||
                  (l['Payment Method'] || '').toLowerCase().includes(q)
                );
              });
            const totalCount = closedJobs.length;
            const totalPages = Math.max(1, Math.ceil(totalCount / FINANCIAL_PAGE_SIZE));
            const start = Math.min((financialPage - 1) * FINANCIAL_PAGE_SIZE + 1, totalCount);
            const end = Math.min(financialPage * FINANCIAL_PAGE_SIZE, totalCount);

            const btnBase = "inline-flex items-center justify-center w-8 h-8 rounded-lg transition text-slate-600";
            const btnEnabled = `${btnBase} hover:bg-slate-100 hover:text-[#14b8a6]`;
            const btnDisabled = `${btnBase} opacity-30 cursor-not-allowed`;

            return (
              <div className="mt-4 flex items-center justify-center text-sm gap-3">
                <div className="flex items-center gap-1">
                  {/* First page */}
                  <button
                    onClick={() => setFinancialPage(1)}
                    disabled={financialPage === 1}
                    className={financialPage === 1 ? btnDisabled : btnEnabled}
                    title="First page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {/* Previous page */}
                  <button
                    onClick={() => setFinancialPage(p => Math.max(1, p - 1))}
                    disabled={financialPage === 1}
                    className={financialPage === 1 ? btnDisabled : btnEnabled}
                    title="Previous page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {/* Next page */}
                  <button
                    onClick={() => setFinancialPage(p => Math.min(totalPages, p + 1))}
                    disabled={financialPage === totalPages}
                    className={financialPage === totalPages ? btnDisabled : btnEnabled}
                    title="Next page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {/* Last page */}
                  <button
                    onClick={() => setFinancialPage(totalPages)}
                    disabled={financialPage === totalPages}
                    className={financialPage === totalPages ? btnDisabled : btnEnabled}
                    title="Last page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M6 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                <span className="font-medium text-slate-700">
                  {totalCount === 0 ? 'No jobs found' : `${start}–${end} of ${totalCount} jobs`}
                </span>
              </div>
            );
          })()}
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
                <p><span className="font-medium">Technician:</span> {editingLead['Assigned To'] || 'Unassigned'}</p>
              </div>

              {/* Invoice Number */}
              <div className="border-t border-slate-200 pt-4">
                <label className="block text-slate-700 text-xs font-medium mb-1">Invoice #</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g., INV-001234"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm"
                />
              </div>

              {/* Revenue Section */}
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Revenue</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 text-xs font-medium mb-1">Quote Amount ($)</label>
                    <input
                      type="text"
                      value={quoteAmount}
                      onChange={(e) => setQuoteAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 text-xs font-medium mb-1">Amount Paid ($)</label>
                    <input
                      type="text"
                      value={finalAmount}
                      onChange={(e) => setFinalAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-green-300 rounded-lg focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition text-sm bg-green-50"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-slate-700 text-xs font-medium mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm"
                  >
                    <option value="">Select method...</option>
                    <option value="Cash">Cash</option>
                    <option value="Check">Check</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Zelle">Zelle</option>
                    <option value="Venmo">Venmo</option>
                    <option value="PayPal">PayPal</option>
                    <option value="Square">Square</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Expenses Section */}
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Expenses</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 text-xs font-medium mb-1">Labor ($)</label>
                    <input
                      type="text"
                      value={laborCost}
                      onChange={(e) => setLaborCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-red-200 rounded-lg focus:border-red-400 focus:ring-1 focus:ring-red-400 focus:outline-none transition text-sm bg-red-50"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 text-xs font-medium mb-1">Material ($)</label>
                    <input
                      type="text"
                      value={materialCost}
                      onChange={(e) => setMaterialCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-red-200 rounded-lg focus:border-red-400 focus:ring-1 focus:ring-red-400 focus:outline-none transition text-sm bg-red-50"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 text-xs font-medium mb-1">Subcontractor ($)</label>
                    <input
                      type="text"
                      value={subcontractorCost}
                      onChange={(e) => setSubcontractorCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-red-200 rounded-lg focus:border-red-400 focus:ring-1 focus:ring-red-400 focus:outline-none transition text-sm bg-red-50"
                    />
                  </div>
                </div>
              </div>

              {/* Totals Section */}
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Totals</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 text-xs font-medium mb-1">Total Cost ($)</label>
                    <input
                      type="text"
                      value={totalCost}
                      onChange={(e) => setTotalCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none transition text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 text-xs font-medium mb-1">Gross Profit ($)</label>
                    <input
                      type="text"
                      value={profitAmount}
                      onChange={(e) => setProfitAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition text-sm bg-emerald-50"
                    />
                  </div>
                </div>
              </div>

              {/* Partner Commission Split - Only show for partner/lead gen deals */}
              {(isAmitPartner(editingLead['Lead Source'] || '') || isLeadGenCompany(editingLead['Lead Source'] || '')) && (
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Commission Split
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 text-xs font-medium mb-1">Amit's Commission ($)</label>
                      <input
                        type="text"
                        value={amitCommission}
                        onChange={(e) => setAmitCommission(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-teal-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition text-sm bg-teal-50"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 text-xs font-medium mb-1">Partner's Commission ($)</label>
                      <input
                        type="text"
                        value={partnerCommission}
                        onChange={(e) => setPartnerCommission(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition text-sm bg-amber-50"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetEditForm}
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
