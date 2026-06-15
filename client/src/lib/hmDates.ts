// "Start from / Upto" dates for each drug on the health-monitoring timeline.
// The doctor types a 6-digit shorthand DDMMYY (e.g. 120614 → "12 Jun 2014");
// an empty "Upto" means "till today". Stored per patient.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "120614" → { label: "12 Jun 2014", iso: "2014-06-12" }. null if not 6 digits.
export function parseShorthandDate(input: string): { label: string; iso: string } | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 6) return null;
  const dd = +digits.slice(0, 2), mm = +digits.slice(2, 4), yy = +digits.slice(4, 6);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  const year = 2000 + yy;
  const iso = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return { label: `${dd} ${MONTHS[mm - 1]} ${year}`, iso };
}

// Normalise what the doctor typed: 6-digit shorthand → nice label, else as-is.
export function normaliseDateCell(input: string): string {
  const p = parseShorthandDate(input);
  return p ? p.label : input.trim();
}

// Interpret a stored cell (label, shorthand, or any parseable date) as a Date.
export function cellToDate(s: string): Date | null {
  if (!s || !s.trim()) return null;
  const p = parseShorthandDate(s);
  if (p) return new Date(p.iso);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export type DrugDateMap = Record<string, { sf: string; upto: string }>;

const keyFor = (pid: string) => `mhs_hm_dates_${pid}`;

export function loadHmDates(pid: string | null): DrugDateMap {
  if (!pid || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(keyFor(pid));
    return raw ? (JSON.parse(raw) as DrugDateMap) : {};
  } catch {
    return {};
  }
}

export function saveHmDates(pid: string | null, map: DrugDateMap): void {
  if (!pid || typeof window === "undefined") return;
  window.localStorage.setItem(keyFor(pid), JSON.stringify(map));
}
