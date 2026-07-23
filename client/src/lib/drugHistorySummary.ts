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

const ts = (d: string): number => {
  const [dd, mm, yy] = d.split("/").map(Number);
  return new Date(yy || 0, (mm || 1) - 1, dd || 1).getTime() || 0;
};

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

// Groups mentions by exact drug name; start/end = earliest/latest mention date.
export function drugMentionRanges(entries: string[], today: string): MentionRange[] {
  const map = new Map<string, { start: string; end: string }>();
  for (const m of drugMentions(entries, today)) {
    const cur = map.get(m.name);
    if (!cur) { map.set(m.name, { start: m.date, end: m.date }); continue; }
    if (ts(m.date) < ts(cur.start)) cur.start = m.date;
    if (ts(m.date) > ts(cur.end)) cur.end = m.date;
  }
  return Array.from(map.entries()).map(([name, r]) => ({ name, ...r }));
}
