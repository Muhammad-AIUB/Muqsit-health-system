// "Total summary of this patient" (physician's sheet 07/11/2026): every dated
// record the Records page holds, put in ONE list by date. Pure — it reads what
// the page already has (`lib/patientRecords.ts`) and changes nothing.
//
// ⚕️ Each line is shown exactly as it was written. Nothing is reworded, merged
// or completed; only the arrangement is new. Inside a date the kinds always
// come in the sheet's own order (SUMMARY_KINDS): Chief complaints, Surgical and
// disease history, On examination, Patient's input, Investigations, Final
// diagnosis, Drug history.

import { ddmmyyyyMs } from "@/lib/dateInput";
import { NO_DATE } from "@/lib/drugHistoryAdd";
import { HX, type DatedGroup, type HxEntry } from "@/lib/patientRecords";
import type { DrugHistoryRow } from "@/lib/drugHistorySplit";
import type { InvFinding } from "@/lib/investigationSummary";
import type { OeFinding } from "@/lib/onExaminationSummary";

export type SummaryKind = "cc" | "hx" | "oe" | "input" | "inv" | "dx" | "drug";

/** The order on the physician's sheet. */
export const SUMMARY_KINDS: { key: SummaryKind; label: string }[] = [
  { key: "cc", label: "Chief complaints" },
  { key: "hx", label: "Surgical and disease history" },
  { key: "oe", label: "On examination" },
  { key: "input", label: "Patient's input" },
  { key: "inv", label: "Investigations and reports summary" },
  { key: "dx", label: "Final diagnosis" },
  { key: "drug", label: "Drug history" },
];

export interface SummaryLine { text: string; indent?: boolean; muted?: boolean }
export interface SummaryBlock { kind: SummaryKind; label: string; lines: SummaryLine[] }
export interface SummaryDay { date: string; blocks: SummaryBlock[] }

export interface SummarySources {
  complaints: DatedGroup<string>[];
  hx: { disease: HxEntry[]; surgical: HxEntry[] };
  oe: OeFinding[]; // the patient's shared on-examination findings (not removed ones)
  inv: InvFinding[];
  diagnoses: DatedGroup<string>[];
  drug: DatedGroup<DrugHistoryRow>[];
}

export const UNDATED = "Date not known";

// A drug line is `Drug — dose — food — duration` with an empty part where
// nothing was typed; the empty parts are left out, the rest stays as stored.
const drugText = (body: string) => body.split(" — ").map((p) => p.trim()).filter(Boolean).join(" — ");

/** The summary as days, each day's kinds in the sheet's order. `newestFirst`
 *  picks the order of the days; a record with no readable date goes last. */
export function buildTotalSummary(src: SummarySources, opts: {
  kinds?: ReadonlySet<SummaryKind>;
  fromMs?: number | null;
  toMs?: number | null;
  newestFirst?: boolean;
} = {}): SummaryDay[] {
  const days = new Map<string, Map<SummaryKind, SummaryLine[]>>();
  const put = (date: string, kind: SummaryKind, lines: SummaryLine[]) => {
    if (!lines.length) return;
    const d = date && date !== NO_DATE && Number.isFinite(ddmmyyyyMs(date)) && ddmmyyyyMs(date) > 0 ? date : UNDATED;
    let day = days.get(d);
    if (!day) { day = new Map(); days.set(d, day); }
    day.set(kind, [...(day.get(kind) ?? []), ...lines]);
  };
  const text = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

  for (const g of src.complaints) put(g.date, "cc", g.items.map(text).filter(Boolean).map((t) => ({ text: t })));
  for (const e of [...src.hx.disease.map((x) => ({ ...x, p: "Disease history" })), ...src.hx.surgical.map((x) => ({ ...x, p: "Surgical / intervention history" }))]) {
    put(e.date, "hx", [{ text: `${e.p}: ${e.text}` }]);
  }
  for (const f of src.oe) {
    const t = text(f.text);
    // Disease / Surgical history live in the OE list but are shown as history.
    if (!t || t.startsWith(HX.disease) || t.startsWith(HX.surgical)) continue;
    put(f.date, "oe", [{ text: t }]);
  }
  for (const f of src.inv) put(f.date, "inv", [{ text: `${f.test}: ${f.value}` }]);
  for (const g of src.diagnoses) put(g.date, "dx", g.items.map(text).filter(Boolean).map((t) => ({ text: t })));
  for (const g of src.drug) {
    put(g.date, "drug", g.items.map((r) => {
      const t = drugText(r.body);
      return r.kind === "cont" ? { text: `↳ ${t}`, indent: true } : r.kind === "note" ? { text: t, muted: true } : { text: t };
    }).filter((l) => l.text.replace("↳", "").trim()));
  }

  const want = opts.kinds;
  const out: SummaryDay[] = [];
  for (const [date, byKind] of days) {
    if (date !== UNDATED) {
      const ms = ddmmyyyyMs(date);
      if (opts.fromMs != null && ms < opts.fromMs) continue;
      if (opts.toMs != null && ms > opts.toMs) continue;
    } else if (opts.fromMs != null || opts.toMs != null) continue; // a window cannot say where an undated line falls
    const blocks = SUMMARY_KINDS
      .filter((k) => (!want || want.has(k.key)) && byKind.has(k.key))
      .map((k) => ({ kind: k.key, label: k.label, lines: byKind.get(k.key) as SummaryLine[] }));
    if (blocks.length) out.push({ date, blocks });
  }
  const rank = (d: string) => (d === UNDATED ? null : ddmmyyyyMs(d));
  const dir = opts.newestFirst === false ? 1 : -1;
  out.sort((a, b) => {
    const x = rank(a.date), y = rank(b.date);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1; // undated last either way
    return (x - y) * dir;
  });
  return out;
}
