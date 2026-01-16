'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface Lead {
  [key: string]: string;
}

interface PayoutSummary {
  name: string;
  type: 'lead_company' | 'sophia' | 'amit';
  leads: Lead[];
  totalRevenue: number;
  commissionPercent: number;
  commissionAmount: number;
}

export default function PayoutsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Date range filter - default to current week
  const getWeekRange = (date: Date = new Date()) => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 6); // End of week (Saturday)
    end.setHours(23, 59, 59, 999);

    return { start, end };
  };

  const [dateRange, setDateRange] = useState(() => {
    const { start, end } = getWeekRange();
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

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
      setError('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }

  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    // Handle MM/DD/YYYY format
    const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (parts) {
      return new Date(parseInt(parts[3]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    // Handle YYYY-MM-DD format
    const isoParts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoParts) {
      return new Date(parseInt(isoParts[1]), parseInt(isoParts[2]) - 1, parseInt(isoParts[3]));
    }
    return null;
  };

  const parseNumber = (value: string): number => {
    if (!value) return 0;
    // Remove $ and , and parse
    const cleaned = value.replace(/[$,]/g, '').trim();
    return parseFloat(cleaned) || 0;
  };

  // Filter leads that are closed and paid within date range
  const filteredLeads = useMemo(() => {
    const startDate = new Date(dateRange.start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(dateRange.end);
    endDate.setHours(23, 59, 59, 999);

    return leads.filter(lead => {
      const status = lead['Status']?.toUpperCase();
      const amountPaid = parseNumber(lead['Amount Paid']);
      const appointmentDate = parseDate(lead['Appointment Date']);

      // Must be CLOSED status and have payment
      if (status !== 'CLOSED' || amountPaid <= 0) return false;

      // Check date range
      if (appointmentDate) {
        return appointmentDate >= startDate && appointmentDate <= endDate;
      }
      return false;
    });
  }, [leads, dateRange]);

  // Calculate payouts
  const payoutSummaries = useMemo(() => {
    const summaries: PayoutSummary[] = [];
    const leadCompanyMap = new Map<string, Lead[]>();

    // Group leads by lead company
    filteredLeads.forEach(lead => {
      const leadSource = lead['Lead Source']?.toLowerCase();
      const leadSourceDetail = lead['Lead Source Detail']?.trim();

      if (leadSource === 'lead company' && leadSourceDetail) {
        const existing = leadCompanyMap.get(leadSourceDetail) || [];
        existing.push(lead);
        leadCompanyMap.set(leadSourceDetail, existing);
      }
    });

    // Calculate lead company payouts
    leadCompanyMap.forEach((companyLeads, companyName) => {
      let totalGrossProfit = 0;
      let totalCommission = 0;

      companyLeads.forEach(lead => {
        const grossProfit = parseNumber(lead['Profit $']);
        const commissionPercent = parseNumber(lead['Lead Company Commission %']) || 0;
        totalGrossProfit += grossProfit;
        totalCommission += (grossProfit * commissionPercent / 100);
      });

      summaries.push({
        name: companyName,
        type: 'lead_company',
        leads: companyLeads,
        totalRevenue: totalGrossProfit,
        commissionPercent: companyLeads.length > 0 ? parseNumber(companyLeads[0]['Lead Company Commission %']) : 0,
        commissionAmount: totalCommission,
      });
    });

    // Calculate Sophia's commission (across all closed leads)
    let sophiaTotalGrossProfit = 0;
    let sophiaCommission = 0;
    const sophiaLeads: Lead[] = [];

    filteredLeads.forEach(lead => {
      const grossProfit = parseNumber(lead['Profit $']);
      const sophiaPercent = parseNumber(lead['Sophia Commission %']) || 0;
      if (sophiaPercent > 0) {
        sophiaTotalGrossProfit += grossProfit;
        sophiaCommission += (grossProfit * sophiaPercent / 100);
        sophiaLeads.push(lead);
      }
    });

    if (sophiaLeads.length > 0) {
      summaries.push({
        name: 'Sophia',
        type: 'sophia',
        leads: sophiaLeads,
        totalRevenue: sophiaTotalGrossProfit,
        commissionPercent: sophiaLeads.length > 0 ? parseNumber(sophiaLeads[0]['Sophia Commission %']) : 0,
        commissionAmount: sophiaCommission,
      });
    }

    // Calculate Amit's commission
    let amitTotalGrossProfit = 0;
    let amitCommission = 0;
    const amitLeads: Lead[] = [];

    filteredLeads.forEach(lead => {
      const grossProfit = parseNumber(lead['Profit $']);
      const amitPercent = parseNumber(lead['Amit Commission %']) || 0;
      if (amitPercent > 0) {
        amitTotalGrossProfit += grossProfit;
        amitCommission += (grossProfit * amitPercent / 100);
        amitLeads.push(lead);
      }
    });

    if (amitLeads.length > 0) {
      summaries.push({
        name: 'Amit',
        type: 'amit',
        leads: amitLeads,
        totalRevenue: amitTotalGrossProfit,
        commissionPercent: amitLeads.length > 0 ? parseNumber(amitLeads[0]['Amit Commission %']) : 0,
        commissionAmount: amitCommission,
      });
    }

    return summaries;
  }, [filteredLeads]);

  // Calculate totals
  const totalGrossProfit = filteredLeads.reduce((sum, lead) => sum + parseNumber(lead['Profit $']), 0);
  const totalPayouts = payoutSummaries.reduce((sum, s) => sum + s.commissionAmount, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDateRange = () => {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}, ${end.getFullYear()}`;
  };

  // Quick date range presets
  const setThisWeek = () => {
    const { start, end } = getWeekRange();
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
  };

  const setLastWeek = () => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const { start, end } = getWeekRange(lastWeek);
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
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

  // Export functions
  const exportToCSV = () => {
    // Create CSV content
    let csv = 'Weekly Payout Report\n';
    csv += `Period: ${formatDateRange()}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;

    // Summary
    csv += 'SUMMARY\n';
    csv += `Closed Jobs,${filteredLeads.length}\n`;
    csv += `Total Gross Profit,${formatCurrency(totalGrossProfit)}\n`;
    csv += `Total Payouts Due,${formatCurrency(totalPayouts)}\n`;
    csv += `Net Profit,${formatCurrency(totalGrossProfit - totalPayouts)}\n\n`;

    // Payout breakdown
    csv += 'PAYOUT BREAKDOWN\n';
    csv += 'Payee,Type,Jobs,Total Revenue,Commission %,Commission Amount\n';
    payoutSummaries.forEach(summary => {
      const type = summary.type === 'lead_company' ? 'Lead Gen Company' :
                   summary.type === 'sophia' ? 'Dispatcher' : 'Technician';
      csv += `"${summary.name}",${type},${summary.leads.length},${formatCurrency(summary.totalRevenue)},${summary.commissionPercent}%,${formatCurrency(summary.commissionAmount)}\n`;
    });

    csv += '\nDETAILED TRANSACTIONS\n';
    csv += 'Payee,Lead ID,Job ID,Lead Company,Customer,Service,Appointment Date,Payment Date,Gross Profit,Commission %,Commission Amount\n';

    payoutSummaries.forEach(summary => {
      summary.leads.forEach(lead => {
        const grossProfit = parseNumber(lead['Profit $']);
        const commissionPercent = summary.type === 'lead_company'
          ? parseNumber(lead['Lead Company Commission %'])
          : summary.type === 'sophia'
          ? parseNumber(lead['Sophia Commission %'])
          : parseNumber(lead['Amit Commission %']);
        const commission = grossProfit * commissionPercent / 100;

        csv += `"${summary.name}","${lead['Lead ID']}","${lead['Lead Job ID'] || ''}","${lead['Lead Source Detail'] || ''}","${lead['Customer Name']}","${lead['Service Requested']}","${lead['Appointment Date']}","${lead['Payment Date'] || ''}",${formatCurrency(grossProfit)},${commissionPercent}%,${formatCurrency(commission)}\n`;
      });
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `payout-report-${dateRange.start}-to-${dateRange.end}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Check admin access
  const isAdmin = (session?.user as any)?.role === 'Admin';

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#14b8a6] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-700 mb-2">Access Denied</h1>
          <p className="text-slate-500">This page is only accessible to Admins.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 px-4 py-2 bg-[#14b8a6] text-white rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#0a2540] text-white px-6 py-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-white rounded-lg p-1">
              <Image
                src="/clearair-logo.png"
                alt="ClearAir"
                width={80}
                height={24}
                priority
              />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Weekly Payout Report</h1>
              <p className="text-slate-400 text-sm">Commission & Lead Gen Payouts</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-slate-400 hover:text-white text-sm transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Date Range Filter */}
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
            <div className="flex gap-2">
              <button onClick={setThisWeek} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">
                This Week
              </button>
              <button onClick={setLastWeek} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">
                Last Week
              </button>
              <button onClick={setThisMonth} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition">
                This Month
              </button>
            </div>
            <button
              onClick={exportToCSV}
              disabled={filteredLeads.length === 0}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-slate-500 text-sm">Period</p>
            <p className="text-lg font-semibold text-[#0a2540]">{formatDateRange()}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-slate-500 text-sm">Closed Jobs</p>
            <p className="text-2xl font-bold text-[#0a2540]">{filteredLeads.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-slate-500 text-sm">Total Gross Profit</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalGrossProfit)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-slate-500 text-sm">Total Payouts Due</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalPayouts)}</p>
          </div>
        </div>

        {/* Payout Details */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="bg-[#0a2540] text-white px-6 py-4">
            <h2 className="text-lg font-semibold">Payout Breakdown</h2>
          </div>

          {payoutSummaries.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No closed and paid jobs found in this date range.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {payoutSummaries.map((summary, idx) => (
                <div key={idx} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                        summary.type === 'lead_company' ? 'bg-amber-500' :
                        summary.type === 'sophia' ? 'bg-purple-500' : 'bg-blue-500'
                      }`}>
                        {summary.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-[#0a2540]">{summary.name}</h3>
                        <p className="text-sm text-slate-500">
                          {summary.type === 'lead_company' ? 'Lead Gen Company' :
                           summary.type === 'sophia' ? 'Dispatcher Commission' : 'Tech Commission'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.commissionAmount)}</p>
                      <p className="text-sm text-slate-500">{summary.leads.length} jobs</p>
                    </div>
                  </div>

                  {/* Lead details */}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-[#14b8a6] hover:text-[#0d9488]">
                      View {summary.leads.length} job(s)
                    </summary>
                    <div className="mt-2 bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="pb-2">Lead ID</th>
                            <th className="pb-2">Job ID</th>
                            <th className="pb-2">Lead Company</th>
                            <th className="pb-2">Customer</th>
                            <th className="pb-2">Service</th>
                            <th className="pb-2">Payment Date</th>
                            <th className="pb-2 text-right">Gross Profit</th>
                            <th className="pb-2 text-right">Commission</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.leads.map((lead, i) => {
                            const grossProfit = parseNumber(lead['Profit $']);
                            const commissionPercent = summary.type === 'lead_company'
                              ? parseNumber(lead['Lead Company Commission %'])
                              : summary.type === 'sophia'
                              ? parseNumber(lead['Sophia Commission %'])
                              : parseNumber(lead['Amit Commission %']);
                            const commission = grossProfit * commissionPercent / 100;

                            return (
                              <tr key={i} className="border-t border-slate-200">
                                <td className="py-2 text-slate-600">{lead['Lead ID']}</td>
                                <td className="py-2 text-slate-600">{lead['Lead Job ID']}</td>
                                <td className="py-2 text-slate-600">{lead['Lead Source Detail']}</td>
                                <td className="py-2">{lead['Customer Name']}</td>
                                <td className="py-2 text-slate-600">{lead['Service Requested']}</td>
                                <td className="py-2 text-slate-600">{lead['Payment Date']}</td>
                                <td className="py-2 text-right">{formatCurrency(grossProfit)}</td>
                                <td className="py-2 text-right text-red-600">
                                  {formatCurrency(commission)} ({commissionPercent}%)
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Net Profit Summary */}
        <div className="bg-gradient-to-r from-[#0a2540] to-[#14b8a6] rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-white/70 text-sm">Net Profit After Payouts</p>
              <p className="text-3xl font-bold">{formatCurrency(totalGrossProfit - totalPayouts)}</p>
            </div>
            <div className="text-right">
              <p className="text-white/70 text-sm">Gross Profit: {formatCurrency(totalGrossProfit)}</p>
              <p className="text-white/70 text-sm">Payouts: {formatCurrency(totalPayouts)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
