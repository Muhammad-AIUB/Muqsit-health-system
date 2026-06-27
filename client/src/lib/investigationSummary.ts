import { INV_CATS } from "@/data/investigations";

// One persisted investigation result in a patient's history.
export interface InvFinding {
  date: string;     // dd/mm/yyyy
  category: string; // e.g. "LFT / Liver"
  test: string;     // e.g. "ALT/SGPT"
  value: string;    // e.g. "60" or "Hb=12,WBC=8000" or "negative"
}

const DATE_RE = /^(\d{2}\/\d{2}\/\d{4}):(.*)$/;

// test name (lowercased) → category, from the catalog.
const CAT_OF_TEST: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of INV_CATS) {
    if (c.cat === "Favourite") continue;
    for (const t of c.tests || []) {
      const k = t.name.trim().toLowerCase();
      if (!m.has(k)) m.set(k, c.cat);
    }
  }
  return m;
})();

export const categoryOfTest = (test: string): string =>
  CAT_OF_TEST.get(test.trim().toLowerCase()) || "Other";

// Parse the editor's investigation strings ("dd/mm/yyyy:Test:value") into
// structured findings. Skips image-attachment and report-pool entries.
export function parseInvestigationEntries(entries: string[]): InvFinding[] {
  const out: InvFinding[] = [];
  for (const raw of entries) {
    if (!raw || raw.indexOf("[image attached]") >= 0) continue;
    const m = raw.match(DATE_RE);
    if (!m) continue;
    const rest = m[2];
    const ci = rest.indexOf(":");
    if (ci < 0) continue;
    const test = rest.slice(0, ci).trim();
    const value = rest.slice(ci + 1).trim();
    if (!test || /^Report \d+$/i.test(test)) continue;
    out.push({ date: m[1], category: categoryOfTest(test), test, value });
  }
  return out;
}

const findingKey = (f: InvFinding) => `${f.date}|${f.test.toLowerCase()}|${f.value.toLowerCase()}`;

// Merge new findings into an existing list, de-duplicating by date+test+value.
export function mergeFindings(existing: InvFinding[], additions: InvFinding[]): InvFinding[] {
  const seen = new Set(existing.map(findingKey));
  const out = [...existing];
  for (const f of additions) {
    const k = findingKey(f);
    if (!seen.has(k)) { seen.add(k); out.push(f); }
  }
  return out;
}

const ts = (d: string): number => {
  const [dd, mm, yy] = d.split("/").map(Number);
  return new Date(yy, (mm || 1) - 1, dd || 1).getTime() || 0;
};

// Group findings by date (newest date first).
export function groupByDate(findings: InvFinding[]): { date: string; items: InvFinding[] }[] {
  const groups: { date: string; items: InvFinding[] }[] = [];
  for (const f of findings) {
    let g = groups.find((x) => x.date === f.date);
    if (!g) { g = { date: f.date, items: [] }; groups.push(g); }
    g.items.push(f);
  }
  groups.sort((a, b) => ts(b.date) - ts(a.date));
  return groups;
}

// Group findings by category (alphabetical), each sorted newest-first.
export function groupByCategory(findings: InvFinding[]): { category: string; items: InvFinding[] }[] {
  const groups: { category: string; items: InvFinding[] }[] = [];
  for (const f of findings) {
    let g = groups.find((x) => x.category === f.category);
    if (!g) { g = { category: f.category, items: [] }; groups.push(g); }
    g.items.push(f);
  }
  groups.forEach((g) => g.items.sort((a, b) => ts(b.date) - ts(a.date)));
  groups.sort((a, b) => a.category.localeCompare(b.category));
  return groups;
}

// Filter by a date window (epoch ms, inclusive). null bound = open.
export function filterByDate(findings: InvFinding[], fromMs: number | null, toMs: number | null): InvFinding[] {
  return findings.filter((f) => {
    const t = ts(f.date);
    if (fromMs != null && t < fromMs) return false;
    if (toMs != null && t > toMs) return false;
    return true;
  });
}
