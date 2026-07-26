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
  // Reject impossible calendar dates (e.g. 31 Feb) so cellToDate doesn't silently
  // roll them over (new Date("2014-02-31") → 3 Mar) and mis-sort the timeline.
  const dt = new Date(year, mm - 1, dd);
  if (dt.getFullYear() !== year || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
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

// Stored on the patient record (Patient.hmDrugDates) — see patientsApi.
export type DrugDateMap = Record<string, { sf: string; upto: string }>;
