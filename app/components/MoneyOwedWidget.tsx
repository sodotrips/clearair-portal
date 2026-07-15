'use client';

import { useState } from 'react';
import {
  amountOwed,
  isAwaitingSubPayment,
  normalizeSubName,
  subColor,
  UNNAMED_SUB_LABEL,
} from '@/lib/subcontractors';

interface Lead {
  [key: string]: string;
}

interface Props {
  leads: Lead[];
  onMarkPaid: (rowIndices: string[]) => Promise<void>;
}

// Days between a MM/DD/YYYY (or YYYY-MM-DD) date and today, Houston.
function daysWaiting(dateStr: string): number | null {
  if (!dateStr) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr.trim());
  if (match) { m = +match[1]; d = +match[2]; y = +match[3]; }
  else {
    match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
    if (!match) return null;
    y = +match[1]; m = +match[2]; d = +match[3];
  }
  const then = new Date(y, m - 1, d);
  const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const [ny, nm, nd] = nowStr.split('-').map(Number);
  const now = new Date(ny, nm - 1, nd);
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86400000));
}

export default function MoneyOwedWidget({ leads, onMarkPaid }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const owed = leads
    .filter(isAwaitingSubPayment)
    .sort((a, b) => (daysWaiting(b['Sub Completed Date']) ?? 0) - (daysWaiting(a['Sub Completed Date']) ?? 0));

  if (owed.length === 0) return null;

  const total = owed.reduce((sum, l) => sum + amountOwed(l), 0);

  // Group row indices by subcontractor for "mark all paid" per sub.
  const bySub = new Map<string, string[]>();
  owed.forEach(l => {
    const name = normalizeSubName(l['Subcontractor Name']) || UNNAMED_SUB_LABEL;
    if (!bySub.has(name)) bySub.set(name, []);
    bySub.get(name)!.push(l.rowIndex);
  });

  const markPaid = async (rowIndices: string[], key: string) => {
    setBusy(key);
    try {
      await onMarkPaid(rowIndices);
    } finally {
      setBusy(null);
    }
  };

  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="bg-white border-2 border-sky-300 rounded-xl overflow-hidden mb-6">
      <div className="bg-sky-50 px-5 py-3 border-b border-sky-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">💰</span>
          <h3 className="text-sm font-semibold text-sky-900">Money Owed to Me</h3>
          <span className="text-xs font-bold bg-amber-500 text-white rounded-full px-2 py-0.5">{owed.length}</span>
        </div>
        <span className="text-sm font-bold text-sky-800">{money(total)} owed</span>
      </div>

      <div className="divide-y divide-slate-100">
        {owed.map(l => {
          const name = normalizeSubName(l['Subcontractor Name']) || UNNAMED_SUB_LABEL;
          const days = daysWaiting(l['Sub Completed Date']);
          return (
            <div key={l.rowIndex} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${subColor(name === UNNAMED_SUB_LABEL ? '' : name).dot}`} />
                <span className="text-sm font-medium text-slate-800 shrink-0">{name}</span>
                <span className="text-sm text-slate-400 truncate">→ {l['Customer Name'] || l['Lead ID']}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {days !== null && (
                  <span className={`text-xs ${days >= 5 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                    {days}d
                  </span>
                )}
                <span className="text-sm font-bold text-slate-900 w-20 text-right">{money(amountOwed(l))}</span>
                <button
                  onClick={() => markPaid([l.rowIndex], l.rowIndex)}
                  disabled={busy !== null}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium transition disabled:opacity-50"
                >
                  {busy === l.rowIndex ? '…' : 'Mark Paid'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-sub bulk "mark all paid" when a sub has multiple outstanding */}
      {[...bySub.entries()].some(([, rows]) => rows.length > 1) && (
        <div className="px-5 py-2 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2">
          <span className="text-xs text-slate-500 self-center">Mark all paid:</span>
          {[...bySub.entries()].filter(([, rows]) => rows.length > 1).map(([name, rows]) => (
            <button
              key={name}
              onClick={() => markPaid(rows, `all:${name}`)}
              disabled={busy !== null}
              className="px-2.5 py-1 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded text-xs font-medium transition disabled:opacity-50"
            >
              {busy === `all:${name}` ? '…' : `${name} (${rows.length})`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
