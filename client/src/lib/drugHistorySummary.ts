// Read-only summary of a patient's Drug history (Patient.drugHistory) for the
// Health trends chart. Mirrors the entry format documented in
// DrugHistoryField.tsx and client/CLAUDE.md — does NOT import from
// DrugHistoryField.tsx, since that file's parser is entangled with the
// current-visit/distant-past editor semantics this summary doesn't need
// (same pattern already used independently by lib/prescriptionDoc.ts).
//
// Formats:
//   "dd/mm/yyyy: Drug — dose — food — duration"   (medicine)
//   "dd/mm/yyyy(note): free text"                 (note line)
//   "dd/mm/yyyy(cont): dose — food — duration"    (tapering continuation)
//   "Current: Drug — ..." / "Past: Drug — ..."    (legacy, pre-migration)

import { ddmmyyyyMs } from "@/lib/dateInput";
import { coursesOf } from "@/lib/drugCourse";
export interface DrugMention { name: string; date: string } // date: dd/mm/yyyy
export interface MentionRange { name: string; start: string; end: string } // dd/mm/yyyy

const DATE_RE = /^(\d{2}\/\d{2}\/\d{4})(\(note\)|\(cont\))?:\s*(.*)$/;
const OLD_RE = /^(Current|Past)(\(note\)|\(cont\))?:\s*(.*)$/;

type Kind = "med" | "note" | "cont";
const kindOf = (suffix?: string): Kind => (suffix === "(note)" ? "note" : suffix === "(cont)" ? "cont" : "med");

// Returns null for anything without a recoverable real date: legacy "Past:"
// entries only carry a sentinel bucket marker (not an actual date) in the
// editor, and any entry matching neither known format is left unparsed
// rather than guessed at.
function parseDrugEntry(raw: string, today: string): { date: string; kind: Kind; body: string } | null {
  let m = raw.match(DATE_RE);
  if (m) return { date: m[1], kind: kindOf(m[2]), body: m[3] };
  m = raw.match(OLD_RE);
  if (m) return m[1] === "Past" ? null : { date: today, kind: kindOf(m[2]), body: m[3] };
  return null;
}

// today: dd/mm/yyyy — used only as the resolved date for legacy "Current:" entries.
export function drugMentions(entries: string[], today: string): DrugMention[] {
  const out: DrugMention[] = [];
  for (const raw of entries) {
    const parsed = parseDrugEntry(raw, today);
    if (!parsed || parsed.kind !== "med") continue; // notes/continuations carry no drug name
    const name = parsed.body.split(" — ")[0].trim();
    if (name) out.push({ name, date: parsed.date });
  }
  return out;
}

// Groups mentions by exact drug name; start = the earliest mention date, end =
// the latest mention date — or, where a dated medicine's duration can be read,
// the day that course ENDS if that is later (physician, 07/11/2026: a medicine
// added or edited in Patient's Prescriptions & reports goes to Health
// monitoring "with its date", and the bar runs from its Start to its End).
//
// The End is the one the Drug history table shows (`lib/drugCourse.ts`): the
// start plus the days of the medicine's line and of the tapering lines under it,
// in order. A tapering "(cont)" line carries no drug name; it belongs to the
// medicine directly above it by position, as everywhere else in the app (the
// Drug history modal, Move to Rx, the ℞ mirror). Before 07/11/2026 the range
// ignored every duration and so understated; it still does where a duration
// cannot be read (no unit, `Continue`), the entry has no real date (the no-date
// marker, a legacy `Current:` line, whose date is only today's), or the dose of
// a line is irrelevant here — only days are. The chart's duration override
// (hmDrugDates) is still what lets the doctor correct a bar, and it still wins.
export function drugMentionRanges(entries: string[], today: string): MentionRange[] {
  const map = new Map<string, { start: string; end: string }>();
  for (const m of drugMentions(entries, today)) {
    const cur = map.get(m.name);
    if (!cur) { map.set(m.name, { start: m.date, end: m.date }); continue; }
    if (ddmmyyyyMs(m.date) < ddmmyyyyMs(cur.start)) cur.start = m.date;
    if (ddmmyyyyMs(m.date) > ddmmyyyyMs(cur.end)) cur.end = m.date;
  }
  for (const c of coursesOf(entries, today)) {
    if (c.kind !== "med" || !c.hasDate || c.end === null) continue;
    const cur = map.get(c.label);
    if (cur && ddmmyyyyMs(c.end) > ddmmyyyyMs(cur.end)) cur.end = c.end;
  }
  return Array.from(map.entries()).map(([name, r]) => ({ name, ...r }));
}
