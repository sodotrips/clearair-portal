// Subcontractor identity + color helpers.
//
// Subcontractors are NOT portal users. They never log in. "Assigned To" stays the
// generic bucket 'Subcontractor' (column AJ); the actual identity lives in
// 'Subcontractor Name' (column AG). The name list is self-seeding: options are the
// distinct names already present in the sheet, plus whatever the dispatcher types.

export const SUBCONTRACTOR_BUCKET = 'Subcontractor';

export interface Lead {
  [key: string]: string;
}

// Tailwind classes must be written out in full — dynamic strings get purged.
export const SUB_PALETTE = [
  { dot: 'bg-violet-500', card: 'bg-violet-100 border-violet-500 text-violet-900', text: 'text-violet-700' },
  { dot: 'bg-orange-500', card: 'bg-orange-100 border-orange-500 text-orange-900', text: 'text-orange-700' },
  { dot: 'bg-pink-500', card: 'bg-pink-100 border-pink-500 text-pink-900', text: 'text-pink-700' },
  { dot: 'bg-cyan-500', card: 'bg-cyan-100 border-cyan-500 text-cyan-900', text: 'text-cyan-700' },
  { dot: 'bg-lime-600', card: 'bg-lime-100 border-lime-600 text-lime-900', text: 'text-lime-700' },
  { dot: 'bg-fuchsia-500', card: 'bg-fuchsia-100 border-fuchsia-500 text-fuchsia-900', text: 'text-fuchsia-700' },
  { dot: 'bg-sky-500', card: 'bg-sky-100 border-sky-500 text-sky-900', text: 'text-sky-700' },
  { dot: 'bg-rose-500', card: 'bg-rose-100 border-rose-500 text-rose-900', text: 'text-rose-700' },
];

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

// Stable color for a given name, so a sub keeps the same color forever and new
// subs get one automatically without any config.
export function subColor(name: string | undefined) {
  const n = normalizeSubName(name);
  if (!n) return UNNAMED_SUB;
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
