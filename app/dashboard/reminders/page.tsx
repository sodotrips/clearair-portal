'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Lead {
  [key: string]: string;
}

export default function RemindersPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState<'tech' | 'customer' | null>(null);
  const [results, setResults] = useState<any>(null);

  // Houston timezone helper
  const getHoustonDate = (daysOffset: number = 0) => {
    const now = new Date();
    const houston = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    houston.setDate(houston.getDate() + daysOffset);
    const year = houston.getFullYear();
    const month = String(houston.getMonth() + 1).padStart(2, '0');
    const day = String(houston.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(() => getHoustonDate(1)); // Tomorrow

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

  const isDateMatch = (apptDate: string, targetDate: string) => {
    if (!apptDate) return false;

    const [targetYear, targetMonth, targetDay] = targetDate.split('-');
    const targetFormatted = `${targetMonth}/${targetDay}/${targetYear}`;

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(apptDate)) {
      const [month, day, year] = apptDate.split('/');
      const apptFormatted = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
      return apptFormatted === targetFormatted;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
      return apptDate === targetDate;
    }

    return false;
  };

  // Filter jobs for selected date
  const scheduledJobs = leads.filter(l => {
    const status = l['Status']?.toUpperCase();
    const isScheduled = status === 'SCHEDULED' || status === 'IN PROGRESS';
    const isOnDate = isDateMatch(l['Appointment Date'], selectedDate);
    return isScheduled && isOnDate;
  }).sort((a, b) => {
    const timeOrder = ['08:00AM - 11:00AM', '11:00AM - 2:00PM', '2:00PM - 5:00PM'];
    return timeOrder.indexOf(a['Time Window'] || '') - timeOrder.indexOf(b['Time Window'] || '');
  });

  // Group by tech
  const jobsByTech: Record<string, Lead[]> = {};
  scheduledJobs.forEach(job => {
    const tech = job['Assigned To'] || 'Unassigned';
    if (!jobsByTech[tech]) jobsByTech[tech] = [];
    jobsByTech[tech].push(job);
  });

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatPhone = (phone: string) => {
    const digits = phone?.replace(/\D/g, '') || '';
    if (digits.length !== 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const getConfirmationStyle = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'YES':
        return 'bg-green-100 text-green-700';
      case 'PENDING':
        return 'bg-amber-100 text-amber-700';
      case 'NO':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const sendTechReminder = async (tech?: string) => {
    setSendingAll(tech ? null : 'tech');
    if (tech) setSending(tech);
    setResults(null);

    try {
      const response = await fetch('/api/sms/send-tech-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tech, date: selectedDate }),
      });
      const data = await response.json();
      setResults(data);
      if (!data.success) {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Failed to send reminder');
    } finally {
      setSendingAll(null);
      setSending(null);
    }
  };

  const sendCustomerReminders = async (leadId?: string) => {
    setSendingAll(leadId ? null : 'customer');
    if (leadId) setSending(leadId);
    setResults(null);

    try {
      const response = await fetch('/api/sms/send-customer-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, date: selectedDate }),
      });
      const data = await response.json();
      setResults(data);
      await fetchLeads(); // Refresh to get updated confirmation status
      if (!data.success) {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Failed to send reminders');
    } finally {
      setSendingAll(null);
      setSending(null);
    }
  };

  const isToday = selectedDate === getHoustonDate(0);
  const isTomorrow = selectedDate === getHoustonDate(1);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-[#0a2540] text-white px-6 py-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
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
              <h1 className="text-xl font-semibold">SMS Reminders</h1>
              <p className="text-slate-400 text-sm">Appointment notifications</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
        )}

        {/* Date Selector & Actions */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] focus:outline-none"
              />
              <p className="text-sm text-slate-500 mt-1">
                {formatDate(selectedDate)}
                {isToday && <span className="ml-2 text-blue-600 font-medium">(Today)</span>}
                {isTomorrow && <span className="ml-2 text-[#14b8a6] font-medium">(Tomorrow)</span>}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => sendTechReminder()}
                disabled={sendingAll === 'tech' || scheduledJobs.length === 0}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
              >
                {sendingAll === 'tech' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Send Tech Reminders
                  </>
                )}
              </button>

              <button
                onClick={() => sendCustomerReminders()}
                disabled={sendingAll === 'customer' || scheduledJobs.length === 0}
                className="px-4 py-2.5 bg-[#14b8a6] hover:bg-[#0d9488] text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
              >
                {sendingAll === 'customer' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    Send Customer Reminders
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results */}
          {results && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg">
              <h4 className="font-semibold text-slate-700 mb-2">Results</h4>
              {results.results?.map((r: any, idx: number) => (
                <div key={idx} className="text-sm flex items-center gap-2">
                  {r.success ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-red-600">✗</span>
                  )}
                  <span className="text-slate-700">{r.tech || r.customer || r.leadId}</span>
                  <span className="text-slate-500">{r.message || r.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm">Total Appointments</p>
            <p className="text-2xl font-bold text-[#0a2540]">{scheduledJobs.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm">Confirmed (YES)</p>
            <p className="text-2xl font-bold text-green-600">
              {scheduledJobs.filter(j => j['AU']?.toUpperCase() === 'YES').length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm">Pending</p>
            <p className="text-2xl font-bold text-amber-600">
              {scheduledJobs.filter(j => j['AU']?.toUpperCase() === 'PENDING').length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-slate-500 text-sm">Not Confirmed (NO)</p>
            <p className="text-2xl font-bold text-red-500">
              {scheduledJobs.filter(j => j['AU']?.toUpperCase() === 'NO').length}
            </p>
          </div>
        </div>

        {/* Jobs by Technician */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-[#14b8a6] border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-slate-500">Loading...</p>
          </div>
        ) : scheduledJobs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <span className="text-4xl mb-4 block">📅</span>
            <p className="text-slate-600 font-medium">No appointments scheduled</p>
            <p className="text-slate-400 text-sm">for {formatDate(selectedDate)}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(jobsByTech).map(([tech, jobs]) => (
              <div key={tech} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Tech Header */}
                <div className="bg-[#0a2540] text-white px-6 py-4 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#14b8a6] rounded-full flex items-center justify-center font-bold">
                      {tech.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{tech}</h3>
                      <p className="text-slate-400 text-sm">{jobs.length} job{jobs.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => sendTechReminder(tech)}
                    disabled={sending === tech}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition disabled:opacity-50"
                  >
                    {sending === tech ? 'Sending...' : 'Send Summary'}
                  </button>
                </div>

                {/* Jobs Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Time</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Customer</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Service</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Phone</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Representing</th>
                        <th className="text-center py-3 px-4 text-sm font-semibold text-slate-600">Confirmed</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job, idx) => {
                        const leadSource = (job['Lead Source'] || '').toLowerCase();
                        const referralSource = job['Referral Source'] || job['Lead Provider'] || '';
                        let representing = 'ClearAir';
                        let repStyle = 'bg-teal-100 text-teal-700';

                        if ((leadSource === 'lead company' || leadSource.includes('lead gen')) && referralSource) {
                          representing = referralSource;
                          repStyle = 'bg-amber-100 text-amber-700';
                        } else if (leadSource === 'partner' && referralSource) {
                          representing = referralSource;
                          repStyle = 'bg-purple-100 text-purple-700';
                        }

                        return (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <span className="text-sm font-medium text-slate-800">{job['Time Window'] || '-'}</span>
                            </td>
                            <td className="py-3 px-4">
                              <div>
                                <p className="font-medium text-slate-800">{job['Customer Name']}</p>
                                <p className="text-xs text-slate-500">{job['Address']}, {job['City']}</p>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600">{job['Service Requested']}</td>
                            <td className="py-3 px-4">
                              <a href={`tel:${job['Phone Number']}`} className="text-sm text-[#14b8a6] hover:underline">
                                {formatPhone(job['Phone Number'])}
                              </a>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${repStyle}`}>
                                {representing}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getConfirmationStyle(job['AU'])}`}>
                                {job['AU']?.toUpperCase() === 'YES' ? 'YES' :
                                 job['AU']?.toUpperCase() === 'NO' ? 'NO' :
                                 job['AU']?.toUpperCase() === 'PENDING' ? 'PENDING' :
                                 'Not Sent'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => sendCustomerReminders(job['Lead ID'])}
                                disabled={sending === job['Lead ID']}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg transition disabled:opacity-50"
                              >
                                {sending === job['Lead ID'] ? '...' : 'Send'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Setup Instructions */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Twilio Setup Required
          </h3>
          <p className="text-amber-700 text-sm mb-4">
            To enable SMS reminders, you need to configure Twilio. Add these to your environment variables:
          </p>
          <div className="bg-white rounded-lg p-4 font-mono text-xs text-slate-700 space-y-1">
            <p>TWILIO_ACCOUNT_SID=your_account_sid</p>
            <p>TWILIO_AUTH_TOKEN=your_auth_token</p>
            <p>TWILIO_PHONE_NUMBER=+1832XXXXXXX</p>
            <p>AMIT_PHONE=8325551234</p>
            <p>BUSINESS_PHONE=(832) 555-1234</p>
          </div>
          <p className="text-amber-700 text-sm mt-4">
            The "AU" column in your Google Sheet tracks confirmations (YES/NO/PENDING).
          </p>
        </div>
      </div>
    </div>
  );
}
