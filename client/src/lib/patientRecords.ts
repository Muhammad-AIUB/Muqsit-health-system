// The read-only history sections of "Patient's Prescriptions & reports"
// (physician's sheet 31/10/2026, item 3): Drug history, Disease and surgical
// history, Chief complaints history, Diagnosis history. Pure — each reads data
// the app already holds and changes nothing; pinned in `patientRecords.test.ts`.
//
// ⚕️ Every line is shown exactly as it was written. Nothing here rewords,
// completes or merges two different texts; a repeat is folded only where it is
// the very same text (case and outer spacing aside), and its date says where
// it was first written.

import { ddmmyyyyMs, isoToDdmmyyyy } from "@/lib/dateInput";
import { NO_DATE } from "@/lib/drugHistoryAdd";
import { parseDrugHistoryEntry, type DrugHistoryRow } from "@/lib/drugHistorySplit";
import { dhakaToday } from "@/lib/opdDay";
import type { OeFinding } from "@/lib/onExaminationSummary";

export interface DatedGroup<T> { date: string; items: T[] }

// Newest date first; the no-date marker and anything unreadable last. Inside a
// date the stored order is kept — that is what keeps a taper (`(cont)`) under
// the medicine it belongs to.
function byDateNewestFirst<T>(groups: DatedGroup<T>[]): DatedGroup<T>[] {
  const rank = (d: string) => (d === NO_DATE ? -1 : ddmmyyyyMs(d) || -0.5);
  return [...groups].sort((a, b) => rank(b.date) - rank(a.date));
}

/** The patient's drug history by the date each line was written. A tapering
 *  line stays directly under its medicine: lines are grouped by date in the
 *  order stored, and a taper always carries its medicine's date. A legacy
 *  `Current:` line reads as `visitDate`, `Past:` as the no-date marker — the
 *  modal's own reading (`parseDrugHistoryEntry`). */
export function drugHistoryByDate(entries: string[], visitDate: string): DatedGroup<DrugHistoryRow>[] {
  // Blocks first — a medicine with the tapers stored straight after it — and
  // the block is placed by its MEDICINE's date, so a taper can never be moved
  // under another medicine, whatever date it carries itself. A taper with no
  // medicine before it is a block of its own.
  const blocks: DrugHistoryRow[][] = [];
  for (const raw of entries ?? []) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const row = parseDrugHistoryEntry(raw, visitDate);
    const last = blocks[blocks.length - 1];
    if (row.kind === "cont" && last && last[0].kind !== "note") last.push(row);
    else blocks.push([row]);
  }
  const groups: DatedGroup<DrugHistoryRow>[] = [];
  for (const b of blocks) {
    const date = b[0].date;
    let g = groups.find((x) => x.date === date);
    if (!g) { g = { date, items: [] }; groups.push(g); }
    g.items.push(...b);
  }
  return byDateNewestFirst(groups);
}

export const NO_DATE_LABEL = "No date";
export const dateLabel = (d: string) => (d === NO_DATE ? NO_DATE_LABEL : d);

export interface HxEntry { text: string; date: string; by: string | null }

// The two history boxes of the On-examination popup are written into the
// visit's On-examination lines as `Disease Hx: …` / `Surgical Hx: …`
// (`lib/oeHistory.ts#historyLines`), and so reach the patient's shared
// on-examination history on Save & print. Read back from there.
const HX = { disease: "Disease Hx:", surgical: "Surgical Hx:" } as const;

/** Each distinct disease / surgical history entry once, with the visit it was
 *  FIRST recorded at (and by whom, when that was stored), newest first. The
 *  same entry written again at later visits is the same history, not a new
 *  event — it is folded only when the text is the same. */
export function diseaseSurgicalHistory(findings: OeFinding[]): { disease: HxEntry[]; surgical: HxEntry[] } {
  const pick = (prefix: string): HxEntry[] => {
    const first = new Map<string, HxEntry>();
    for (const f of findings ?? []) {
      if (!f || typeof f.text !== "string" || !f.text.startsWith(prefix)) continue;
      const text = f.text.slice(prefix.length).trim();
      if (!text) continue;
      const key = text.toLowerCase();
      const seen = first.get(key);
      const by = typeof f.by === "string" && f.by.trim() ? f.by.trim() : null;
      if (!seen || ddmmyyyyMs(f.date) < ddmmyyyyMs(seen.date)) first.set(key, { text, date: f.date, by });
    }
    return [...first.values()].sort((a, b) => ddmmyyyyMs(b.date) - ddmmyyyyMs(a.date));
  };
  return { disease: pick(HX.disease), surgical: pick(HX.surgical) };
}

/** A saved prescription's day as the doctor's calendar has it (Dhaka). */
export function rxDay(createdAt: string): string {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? "" : isoToDdmmyyyy(dhakaToday(d));
}

type RxLike = { createdAt: string; chiefComplaints?: string[]; finalDiagnosis?: string[] };

/** One card per saved prescription that holds anything in `field`, newest
 *  first, each line as written. Two visits on one day are two cards. */
export function perVisit(prescriptions: RxLike[] | undefined, field: "chiefComplaints" | "finalDiagnosis"): DatedGroup<string>[] {
  return [...(prescriptions ?? [])]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((p) => ({ date: rxDay(p.createdAt), items: (p[field] ?? []).filter((s) => typeof s === "string" && s.trim()) }))
    .filter((g) => g.items.length > 0);
}
