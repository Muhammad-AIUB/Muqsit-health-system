// "Start from / Upto" dates for each drug on the health-monitoring timeline.
// The doctor types a 6-digit shorthand DDMMYY (e.g. 120614 → "12 Jun 2014");
// an empty "Upto" means "till today". Stored per patient.

import { resolveTwoDigitYear, YEAR_POLICY } from "./dateInput";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "120614" → { label: "12 Jun 2014", iso: "2014-06-12" }. null if not 6 digits.
export function parseShorthandDate(input: string): { label: string; iso: string } | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 6) return null;
  const dd = +digits.slice(0, 2), mm = +digits.slice(2, 4), yy = +digits.slice(4, 6);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  // Shared century window, not a hard-coded 2000 + yy: `010198` is 1998, not the
  // 2098 this used to write. Timeline bars may legitimately sit a few years out,
  // so this uses the clinical allowance rather than the birth-date one.
  const year = resolveTwoDigitYear(yy, YEAR_POLICY.clinical);
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

// dd/mm/yyyy (or dd-mm-yyyy), the format this app writes dates in everywhere.
const DDMMYYYY = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

// Interpret a stored cell (label, shorthand, or any parseable date) as a Date.
export function cellToDate(s: string): Date | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const p = parseShorthandDate(t);
  if (p) return new Date(p.iso);
  // dd/mm/yyyy MUST be parsed explicitly: `new Date("25/07/2026")` reads the
  // day as a month, gets 25, and returns Invalid Date. Falling through to it
  // meant a cell holding a full date the doctor typed silently became "no
  // date", and the bar quietly dropped their adjustment with nothing to show
  // for it. Same calendar validation as the shorthand so 31/02/2026 is
  // rejected rather than rolled over to 3 March.
  const m = DDMMYYYY.exec(t);
  if (m) {
    const dd = +m[1], mm = +m[2], yy = +m[3];
    const d = new Date(yy, mm - 1, dd);
    const ok = d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd;
    return ok ? d : null;
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

// Stored on the patient record (Patient.hmDrugDates) — see patientsApi.
export type DrugDateMap = Record<string, { sf: string; upto: string }>;
