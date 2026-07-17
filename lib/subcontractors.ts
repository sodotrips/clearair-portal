// Subcontractor identity + color helpers.
//
// Subcontractors are NOT portal users. They never log in. "Assigned To" stays the
// generic bucket 'Subcontractor' (column AJ); the actual identity lives in
// 'Subcontractor Name' (column AG). The name list is self-seeding: options are the
// distinct names already present in the sheet, plus whatever the dispatcher types.

export const SUBCONTRACTOR_BUCKET = 'Subcontractor';

// A subcontractor job whose work is done but the sub hasn't paid us yet.
// Income still counts (accrual), but it shows on the "Money Owed to Me" list
// until marked paid, at which point it becomes CLOSED.
export const AWAITING_PAYMENT_STATUS = 'AWAITING PAYMENT';

export interface Lead {
  [key: string]: string;
}

// Tailwind classes must be written out in full — dynamic strings get purged.
const VIOLET = { dot: 'bg-violet-500', card: 'bg-violet-100 border-violet-500 text-violet-900', text: 'text-violet-700' };
const ORANGE = { dot: 'bg-orange-500', card: 'bg-orange-100 border-orange-500 text-orange-900', text: 'text-orange-700' };
const PINK = { dot: 'bg-pink-500', card: 'bg-pink-100 border-pink-500 text-pink-900', text: 'text-pink-700' };
const CYAN = { dot: 'bg-cyan-500', card: 'bg-cyan-100 border-cyan-500 text-cyan-900', text: 'text-cyan-700' };
const LIME = { dot: 'bg-lime-600', card: 'bg-lime-100 border-lime-600 text-lime-900', text: 'text-lime-700' };
const FUCHSIA = { dot: 'bg-fuchsia-500', card: 'bg-fuchsia-100 border-fuchsia-500 text-fuchsia-900', text: 'text-fuchsia-700' };
const SKY = { dot: 'bg-sky-500', card: 'bg-sky-100 border-sky-500 text-sky-900', text: 'text-sky-700' };
const ROSE = { dot: 'bg-rose-500', card: 'bg-rose-100 border-rose-500 text-rose-900', text: 'text-rose-700' };
const AMBER = { dot: 'bg-amber-500', card: 'bg-amber-100 border-amber-500 text-amber-900', text: 'text-amber-700' };
const INDIGO = { dot: 'bg-indigo-500', card: 'bg-indigo-100 border-indigo-500 text-indigo-900', text: 'text-indigo-700' };
// Teal is reserved for Amit — kept OUT of the auto palette so nobody else gets it.
const TEAL = { dot: 'bg-teal-500', card: 'bg-teal-100 border-teal-500 text-teal-900', text: 'text-teal-700' };

// Fallback palette for names that aren't explicitly pinned below (teal excluded).
export const SUB_PALETTE = [VIOLET, ORANGE, PINK, CYAN, LIME, FUCHSIA, SKY, ROSE, AMBER, INDIGO];

// Pinned colors so each person is visually distinct and stable. Amit = teal.
// Add a new subcontractor here to guarantee a unique color; unlisted names get a
// deterministic hash color from SUB_PALETTE.
const FIXED_COLORS: Record<string, typeof VIOLET> = {
  'amit': TEAL,
  'rafael': VIOLET,
  'josef': ORANGE,
  'nisim': PINK,
  'ben': CYAN,
  'dani': LIME,
  'sean(sanantonio)': FUCHSIA,
  'shaylian': SKY,
};

export const UNNAMED_SUB = {
  dot: 'bg-slate-400',
  card: 'bg-slate-100 border-slate-400 text-slate-700',
  text: 'text-slate-600',
};

export const UNNAMED_SUB_LABEL = 'Unnamed sub';

export function normalizeSubName(name: string | undefined): string {
  return (name || '').trim();
}

export function isSubcontractorJob(lead: Lead): boolean {
  return normalizeSubName(lead['Assigned To']) === SUBCONTRACTOR_BUCKET;
}

function statusUpper(lead: Lead): string {
  return (lead['Status'] || '').trim().toUpperCase();
}

// Work done, sub hasn't paid us yet.
export function isAwaitingSubPayment(lead: Lead): boolean {
  return isSubcontractorJob(lead) && statusUpper(lead) === AWAITING_PAYMENT_STATUS;
}

// Sub job whose income should count (accrual): completed whether or not the
// sub's payment has landed — i.e. CLOSED or AWAITING PAYMENT.
export function isSubIncomeRealized(lead: Lead): boolean {
  const s = statusUpper(lead);
  return isSubcontractorJob(lead) && (s === 'CLOSED' || s === AWAITING_PAYMENT_STATUS);
}

// The amount the subcontractor still owes us (your Amit + Sophia share).
export function amountOwed(lead: Lead): number {
  const raw = (lead['Sub Income $'] || '').replace(/[$,]/g, '');
  return parseFloat(raw) || 0;
}

// Stable, distinct color per name. Pinned names (Amit = teal, plus each known
// subcontractor) get their reserved color; everyone else gets a deterministic
// hash color so the same name always looks the same everywhere.
export function subColor(name: string | undefined) {
  const n = normalizeSubName(name);
  if (!n) return UNNAMED_SUB;
  const pinned = FIXED_COLORS[n.toLowerCase()];
  if (pinned) return pinned;
  let hash = 0;
  for (let i = 0; i < n.length; i++) {
    hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
  }
  return SUB_PALETTE[hash % SUB_PALETTE.length];
}

// Distinct subcontractor names already recorded in the sheet.
export function getSubcontractorNames(leads: Lead[]): string[] {
  const names = new Set<string>();
  leads.forEach((l) => {
    const n = normalizeSubName(l['Subcontractor Name']);
    if (n) names.add(n);
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}
