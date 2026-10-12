// Turns a chosen numeric investigation test/field into a chartable time
// series for the Health trends chart. Value-string shape and unit handling
// are derived directly from how InvestigationPopup.tsx writes findings —
// see comments below for the exact source lines this mirrors.

import { INV_CATS } from "@/data/investigations";
import type { InvFinding } from "./investigationSummary";
import { ddmmyyyyMs } from "@/lib/dateInput";

// Fields whose value is written bare (no "Label:" prefix) — mirrors
// InvestigationPopup.tsx's VALUE_LABELS exactly.
const VALUE_LABELS = ["Value", "Result", "Report", "Finding", "Score", "Status", "Grade"];

export interface ChartableParam {
  test: string;                // InvTest.name
  field: string;                // InvField.l
  label: string;                 // display label: "Test" (single-field) or "Test — Field"
  category: string;
  unit: string;                    // canonical unit = field.u1 ("" if unitless)
  u2?: string;
  c21?: number;                      // u2 -> u1 conversion factor
  otherFieldLabels: string[];         // sibling field labels in the same test (any type)
}

// Every numeric field in the investigation catalog, flattened to one
// chartable parameter each. Non-numeric fields (t: "text" | "dd") and
// calculator-only tests (fields: []) are never included.
export function chartableParams(): ChartableParam[] {
  const out: ChartableParam[] = [];
  for (const cat of INV_CATS) {
    for (const test of cat.tests) {
      const multiField = test.fields.length > 1;
      for (const f of test.fields) {
        if (f.t !== "num") continue;
        out.push({
          test: test.name,
          field: f.l,
          label: multiField ? `${test.name} — ${f.l}` : test.name,
          category: cat.cat,
          unit: f.u1 ?? "",
          u2: f.u2,
          c21: f.c21,
          otherFieldLabels: test.fields.filter((g) => g !== f).map((g) => g.l),
        });
      }
    }
  }
  return out;
}

export interface NumericPoint {
  date: string;    // dd/mm/yyyy, verbatim from the finding
  value: number;    // canonical (u1-equivalent) — Y-position only, never displayed raw
  label: string;      // text printed at the point
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Isolates this parameter's raw "<number><unit>" substring out of a finding
// value, which InvestigationPopup.tsx (collectTestParts/autoSaveInvData)
// writes as either a bare string (single-field test, or a multi-field test
// whose target field's label is in VALUE_LABELS) or as comma-joined
// "Label:val" parts (every other field). Returns null when the substring
// can't be identified with confidence — never guesses.
//
// ⚕️ A number typed with a comma in it. The parts of a value are joined by
// commas too — by a comma and nothing else, no space — so a comma with a DIGIT
// DIRECTLY ON EACH SIDE of it cannot be read: "WBC:1,200" is a WBC of 1,200,
// or of 1.2 typed the continental way, or a 1 followed by another box's "200",
// and the string does not say which. What stands on either side of such a
// comma is not plotted. Looking at only one side of it, or only at one shape
// of what follows, drew three wrong numbers, each in production:
//   • a count typed "1,200" into a box with no unit, as 1 (third review);
//   • the same with anything typed after it — "1,200/cmm" — because the first
//     guard knew only a bare number after the comma (fourth review);
//   • a ferritin typed ">2,000", stored ">2,000ng/mL", as 0: the part AFTER
//     the comma, "000ng/mL", was taken for a value of its own (fifth review).
// A comma followed by a SPACE is punctuation ("350, repeat next week"), and
// the number before it stands, as it always did.
const BARE_NUMBER = /^\d+(?:\.\d+)?$/;
// `before` and `after` are the pieces on the two sides of one comma, as stored.
const insideANumber = (before: string, after: string) => /\d$/.test(before) && /^\d/.test(after);

function isolateRaw(value: string, param: ChartableParam): string | null {
  const stored = value.split(",");
  const parts = stored.map((p) => p.trim());
  const anothers = (p: string) => param.otherFieldLabels.some((l) => p.startsWith(l + ":"));
  const prefix = param.field + ":";
  const at = parts.findIndex((p) => p.startsWith(prefix));
  if (at !== -1) {
    const mine = parts[at].slice(prefix.length).trim();
    const next = parts[at + 1];
    // A part with another box's name on it is that box's ("WBC:350,ADA:…",
    // OGTT's "Fasting:95,1 hr:160"). Anything else after the comma may be the
    // rest of this number — also where the NEXT box writes no name of its own
    // (ETT's report after METs): "METs:10,150 bpm at peak" is METs 10 and a
    // report, or a METs of 10,150, as "METs:10,5 METs" is 10.5.
    if (next !== undefined && !anothers(next)) {
      if (insideANumber(stored[at], stored[at + 1])) return null;
      // …and two bare numbers are not read however they are spaced ("1, 200").
      if (BARE_NUMBER.test(mine) && BARE_NUMBER.test(next)) return null;
    }
    return mine;
  }
  if (!VALUE_LABELS.includes(param.field)) return null;
  // Bare-value fallback (only reached for VALUE_LABELS fields, e.g. a plain
  // "Value"/"Result" field). Accept only if exactly one part is unclaimed by
  // a sibling field's own "Label:" prefix and looks numeric — ambiguous
  // (0 or 2+ candidates) means skip rather than pick one.
  const candidates = parts.flatMap((p, i) => (!anothers(p) && /^\d/.test(p) ? [i] : []));
  if (candidates.length !== 1) return null;
  const i = candidates[0];
  // The same comma from its other side: the one part that begins with a digit
  // may be the END of a number whose beginning does not (">2,000", "<0,5",
  // "approx 1,200") — or of another box's ("Count:1,200").
  if (i > 0 && insideANumber(stored[i - 1], stored[i])) return null;
  return parts[i];
}
// Parses "<number><unit>" and normalizes to the field's u1-equivalent.
// Returns null (point omitted, never guessed) unless the suffix is an exact
// match for the field's known u1 or u2 — "normal", a dropdown result, or an
// unrecognized unit all fall through to null.
function parseAndNormalize(raw: string, param: ChartableParam): { value: number; usedU2: boolean } | null {
  const m = raw.trim().match(/^(\d*\.?\d+)(.*)$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  const suffix = m[2].trim();
  if (suffix === param.unit) return { value: num, usedU2: false };
  if (param.u2 && suffix === param.u2.trim()) {
    if (typeof param.c21 !== "number") return null; // no known conversion factor — never invent one
    return { value: num * param.c21, usedU2: true };
  }
  return null;
}

// Numeric time series for one chartable parameter, derived from a patient's
// investigationSummary findings, oldest first. Same-date re-entries are
// never deduped/merged — dropping a recorded value based on a guess about
// doctor intent is exactly what this app's clinical-accuracy rules prohibit.
export function numericSeriesFor(findings: InvFinding[], param: ChartableParam): NumericPoint[] {
  const points: NumericPoint[] = [];
  for (const f of findings) {
    if (f.test !== param.test) continue;
    const raw = isolateRaw(f.value, param);
    if (raw == null) continue;
    const parsed = parseAndNormalize(raw, param);
    if (!parsed) continue;
    // u1-recorded: label is the raw string, verbatim — zero transformation.
    // u2-recorded: converted value shown alongside the untouched raw string,
    // so the derivation stays visible rather than silently substituted.
    const label = parsed.usedU2 ? `${round2(parsed.value)}${param.unit} (${raw})` : raw;
    points.push({ date: f.date, value: parsed.value, label });
  }
  return points.sort((a, b) => ddmmyyyyMs(a.date) - ddmmyyyyMs(b.date));
}
