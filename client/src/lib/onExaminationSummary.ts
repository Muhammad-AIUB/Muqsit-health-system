// Persistent on-examination history: each entry is a finding written on a given
// visit date (e.g. "BP: 120/60 mmHg"). Mirrors the investigation summary but the
// values are free-text lines instead of test/value pairs.

export interface OeFinding {
  date: string; // dd/mm/yyyy — the visit it was written on
  text: string; // e.g. "BP: 120/60 mmHg"
}

const oeKey = (f: OeFinding) => `${f.date}|${f.text.trim().toLowerCase()}`;

// Merge new entries into an existing list, de-duplicating by date + text.
export function mergeOe(existing: OeFinding[], additions: OeFinding[]): OeFinding[] {
  const seen = new Set(existing.map(oeKey));
  const out = [...existing];
  for (const f of additions) {
    const k = oeKey(f);
    if (f.text.trim() && !seen.has(k)) { seen.add(k); out.push(f); }
  }
  return out;
}

// Turn this visit's on-examination lines into dated findings.
export function oeEntriesForDate(lines: string[], date: string): OeFinding[] {
  return lines.map((l) => l.trim()).filter(Boolean).map((text) => ({ date, text }));
}

const ts = (d: string): number => {
  const [dd, mm, yy] = d.split("/").map(Number);
  return new Date(yy || 0, (mm || 1) - 1, dd || 1).getTime() || 0;
};

// Group findings by date (newest date first).
export function groupOeByDate(findings: OeFinding[]): { date: string; items: OeFinding[] }[] {
  const groups: { date: string; items: OeFinding[] }[] = [];
  for (const f of findings) {
    let g = groups.find((x) => x.date === f.date);
    if (!g) { g = { date: f.date, items: [] }; groups.push(g); }
    g.items.push(f);
  }
  groups.sort((a, b) => ts(b.date) - ts(a.date));
  return groups;
}
