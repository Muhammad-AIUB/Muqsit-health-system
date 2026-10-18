// ⚕️ Current medications vs Distant past — physician's sheet, 18/10/2026,
// item 2 (and the answer given in chat the same day: "only the previous visit").
//
//   Current      = every entry of the PREVIOUS visit (the latest date before
//                  today's), plus what the doctor added to Current by hand today.
//   Distant past = everything else: older visits, the no-date marker, a date
//                  after today's.
//   Today's ℞    = in neither list. The pad mirrors it into the record as it is
//                  typed (lib/rxDrugHistory.ts), so it becomes "the previous
//                  visit" next time; while the doctor writes it, it is on the pad.
//
// Until this sheet, Current was "dated today" — today's ℞ — and the previous
// visit's medicines had already gone to Distant past on the day the doctor most
// needed them in front of him.
//
// The split is DERIVED, never stored, as it always was.

import { ddmmyyyyMs } from "@/lib/dateInput";
import { NO_DATE } from "@/lib/drugHistoryAdd";

export type DrugHistoryKind = "med" | "note" | "cont";
export interface DrugHistoryRow { raw: string; date: string; kind: DrugHistoryKind; body: string }

const DATE_RE = /^(\d{2}\/\d{2}\/\d{4})(\(note\)|\(cont\))?:\s*(.*)$/;
const OLD_RE = /^(Current|Past)(\(note\)|\(cont\))?:\s*(.*)$/; // legacy entries

const kindOf = (suffix?: string): DrugHistoryKind => (suffix === "(note)" ? "note" : suffix === "(cont)" ? "cont" : "med");

/** One stored entry. A legacy `Current:` line reads as today's, `Past:` as no date. */
export function parseDrugHistoryEntry(raw: string, visitDate: string): DrugHistoryRow {
  let m = raw.match(DATE_RE);
  if (m) return { raw, date: m[1], kind: kindOf(m[2]), body: m[3] };
  m = raw.match(OLD_RE);
  if (m) return { raw, date: m[1] === "Past" ? NO_DATE : visitDate, kind: kindOf(m[2]), body: m[3] };
  return { raw, date: visitDate, kind: "med", body: raw };
}

/** The blocks of a run of rows, by position: a line and the tapers under it. */
function blocksOf(rows: DrugHistoryRow[]): string[] {
  const out: string[][] = [];
  for (const r of rows) {
    if (r.kind === "cont" && out.length) out[out.length - 1].push(r.raw);
    else out.push([r.raw]);
  }
  return out.map((b) => b.join("\n"));
}

export interface DrugHistorySplit {
  /** The previous visit's entries in stored order, then today's hand-added ones. */
  current: DrugHistoryRow[];
  /** Everything else, in stored order (the modal groups it by date). */
  past: DrugHistoryRow[];
  /** dd/mm/yyyy of the visit Current comes from, or null when there is none. */
  previousDate: string | null;
}

/**
 * @param items      `Patient.drugHistory` as the editor holds it.
 * @param visitDate  today's visit date, dd/mm/yyyy (`ptDate`).
 * @param todaysRx   what the ℞ mirror writes for today's pad
 *                   (`rxDrugHistoryEntries(rxItems, visitDate)`): those exact
 *                   entries are on the pad and are listed in neither tab.
 */
export function splitDrugHistory(items: string[], visitDate: string, todaysRx: string[]): DrugHistorySplit {
  const rows = (items ?? []).map((raw) => parseDrugHistoryEntry(String(raw ?? ""), visitDate)).filter((r) => r.body.trim());
  const today = ddmmyyyyMs(visitDate);

  // The previous visit: the latest real date before today. The no-date marker
  // (01/01/2000) is a real-looking date and must never be it.
  let previousDate: string | null = null;
  let best = -Infinity;
  for (const r of rows) {
    if (r.date === NO_DATE || r.date === visitDate) continue;
    const ms = ddmmyyyyMs(r.date);
    if (ms > 0 && ms < today && ms > best) { best = ms; previousDate = r.date; }
  }

  // ⚕️ Today's ℞ is hidden a whole BLOCK at a time — a medicine with the
  // tapering lines under it — and only a block that is exactly one the pad
  // writes, counted. Hidden line by line, a medicine whose taper had changed on
  // the pad was hidden and its old taper left standing under another medicine
  // (second review, 18/10/2026).
  const onPad = new Map<string, number>();
  for (const b of blocksOf((todaysRx ?? []).map((raw) => parseDrugHistoryEntry(String(raw ?? ""), visitDate)))) {
    onPad.set(b, (onPad.get(b) ?? 0) + 1);
  }

  const prev: DrugHistoryRow[] = [];
  const todays: DrugHistoryRow[] = [];
  const past: DrugHistoryRow[] = [];
  let block: DrugHistoryRow[] = [];
  const closeBlock = () => {
    if (!block.length) return;
    const key = block.map((r) => r.raw).join("\n");
    const n = onPad.get(key) ?? 0;
    if (n > 0) onPad.set(key, n - 1);
    else todays.push(...block);
    block = [];
  };
  for (const r of rows) {
    if (r.date === visitDate) {
      // A taper belongs to the line directly above it (rxDrugHistory.ts).
      if (r.kind !== "cont") closeBlock();
      block.push(r);
      continue;
    }
    closeBlock();
    if (r.date === previousDate) prev.push(r);
    else past.push(r);
  }
  closeBlock();
  return { current: [...prev, ...todays], past, previousDate };
}
