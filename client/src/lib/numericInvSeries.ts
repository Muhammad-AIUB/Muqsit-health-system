// Turns a chosen numeric investigation test/field into a chartable time
// series for the Health trends chart. Value-string shape and unit handling
// are derived directly from how InvestigationPopup.tsx writes findings —
// see comments below for the exact source lines this mirrors.

import { INV_CATS } from "@/data/investigations";
import type { InvFinding } from "./investigationSummary";

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
function isolateRaw(value: string, param: ChartableParam): string | null {
  const parts = value.split(",").map((p) => p.trim());
  const prefix = param.field + ":";
  const direct = parts.find((p) => p.startsWith(prefix));
  if (direct) return direct.slice(prefix.length).trim();
  if (!VALUE_LABELS.includes(param.field)) return null;
  // Bare-value fallback (only reached for VALUE_LABELS fields, e.g. a plain
  // "Value"/"Result" field). Accept only if exactly one part is unclaimed by
  // a sibling field's own "Label:" prefix and looks numeric — ambiguous
  // (0 or 2+ candidates) means skip rather than pick one.
  const otherPrefixes = param.otherFieldLabels.map((l) => l + ":");
  const candidates = parts.filter((p) => !otherPrefixes.some((pre) => p.startsWith(pre)) && /^\d/.test(p));
  return candidates.length === 1 ? candidates[0] : null;
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

const ts = (d: string): number => {
  const [dd, mm, yy] = d.split("/").map(Number);
  return new Date(yy || 0, (mm || 1) - 1, dd || 1).getTime() || 0;
};

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
  return points.sort((a, b) => ts(a.date) - ts(b.date));
}
