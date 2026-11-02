// Persistent on-examination history: each entry is a finding written on a given
// visit date (e.g. "BP: 120/60 mmHg"). Mirrors the investigation summary but the
// values are free-text lines instead of test/value pairs.

import { ddmmyyyyMs } from "@/lib/dateInput";
export interface OeFinding {
  date: string; // dd/mm/yyyy — the visit it was written on
  text: string; // e.g. "BP: 120/60 mmHg"
  // The practice doctor who wrote it, stamped by the SERVER when the entry is
  // appended (`POST /patients/:id/on-examination`, 31/10/2026). Entries from
  // before that carry none, and none is ever made up for them.
  by?: string;
  // A Disease / Surgical history entry taken off in the sidebar (02/11/2026):
  // kept in the record, stamped by the server, and left out by every reader.
  removedAt?: string;
  removedBy?: string;
}

/** Taken off softly — kept in the record, shown nowhere. */
export function isRemovedOe(f: unknown): boolean {
  if (!f || typeof f !== "object") return false;
  const at = (f as { removedAt?: unknown }).removedAt;
  return typeof at === "string" && at.length > 0;
}

const oeKey = (f: OeFinding) => `${f.date}|${f.text.trim().toLowerCase()}`;

// Merge new entries into an existing list, de-duplicating by date + text.
export function mergeOe(existing: OeFinding[], additions: OeFinding[]): OeFinding[] {
  const seen = new Set(existing.map(oeKey));
  const out = [...existing];
  for (const f of additions) {
    const k = oeKey(f);
    if (f.text.trim() && !seen.has(k)) { seen.add(k); out.push(f); }
  }
  return out;
}

// Turn this visit's on-examination lines into dated findings.
export function oeEntriesForDate(lines: string[], date: string): OeFinding[] {
  return lines.map((l) => l.trim()).filter(Boolean).map((text) => ({ date, text }));
}

// Group findings by date (newest date first).
export function groupOeByDate(findings: OeFinding[]): { date: string; items: OeFinding[] }[] {
  const groups: { date: string; items: OeFinding[] }[] = [];
  for (const f of findings) {
    let g = groups.find((x) => x.date === f.date);
    if (!g) { g = { date: f.date, items: [] }; groups.push(g); }
    g.items.push(f);
  }
  groups.sort((a, b) => ddmmyyyyMs(b.date) - ddmmyyyyMs(a.date));
  return groups;
}

// "by Dr. Rahim" — the name as stored, with "Dr." put in front only when the
// name does not already begin with it. Null when there is no author to name.
export function oeAuthorLabel(by: unknown): string | null {
  if (typeof by !== "string" || !by.trim()) return null;
  const name = by.trim();
  return /^dr\b\.?/i.test(name) ? `by ${name}` : `by Dr. ${name}`;
}

// The records page: one card per DATE and AUTHOR, newest date first. Inside a
// date the entries keep their stored order, split by who wrote them (in the
// order each author first appears) — so a date written by two doctors says
// which line is whose, and an entry with no author is never put under one.
export function groupOeForRecords(findings: OeFinding[]): { date: string; by: string | null; items: OeFinding[] }[] {
  const out: { date: string; by: string | null; items: OeFinding[] }[] = [];
  for (const g of groupOeByDate((findings ?? []).filter((f) => !isRemovedOe(f)))) {
    const byAuthor: { date: string; by: string | null; items: OeFinding[] }[] = [];
    for (const f of g.items) {
      const by = typeof f.by === "string" && f.by.trim() ? f.by.trim() : null;
      let a = byAuthor.find((x) => x.by === by);
      if (!a) { a = { date: g.date, by, items: [] }; byAuthor.push(a); }
      a.items.push(f);
    }
    out.push(...byAuthor);
  }
  return out;
}

// What the printed sheet carries under "On examination": this visit's lines,
// or nothing when the doctor pressed ⊘ Hide (physician's sheet 28/10/2026).
// The lines themselves are untouched — on screen and in the record.
export function printableOnExamination(lines: string[], hidden: boolean): string[] {
  return hidden ? [] : lines;
}
