// ⚕️ Disease history and Surgical / intervention history (On examination) as a
// LIST of dated entries — physician's sheet, 18/10/2026, item 3.
//
// Each field stays ONE string in `OeData` (the draft, the mirror and the record
// already carry it so), with one entry per line: a value saved before this — a
// single line — reads back as one entry, and nothing stored is rewritten.
// The date is written after the text as dd/mm/yyyy, as typed (DDMMYY accepted),
// and only a date that has already happened is accepted.

import { isoToDdmmyyyy, parseDateInput, YEAR_POLICY } from "@/lib/dateInput";

/** The entries of one field, in the order they were added. */
export function historyEntries(value: string): string[] {
  return String(value ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
}

export type AddResult = { ok: true; value: string } | { ok: false; reason: string };

/** Add one entry below the others. Nothing is written when the date cannot be read. */
export function addHistoryEntry(value: string, text: string, date: string, now = new Date()): AddResult {
  const what = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!what) return { ok: false, reason: "Write the history first." };
  let when = "";
  if (String(date ?? "").trim()) {
    const r = parseDateInput(date, YEAR_POLICY.past, now);
    if (!r.ok) {
      return {
        ok: false,
        reason: r.reason === "future" ? "The date cannot be in the future." : "Not a valid date. Type DDMMYY (151026) or DD/MM/YYYY.",
      };
    }
    when = isoToDdmmyyyy(r.iso);
  }
  return { ok: true, value: [...historyEntries(value), when ? `${what} ${when}` : what].join("\n") };
}

/** Take off the entry at `index` — that one, by place, so a repeat elsewhere stays. */
export function removeHistoryEntry(value: string, index: number): string {
  return historyEntries(value).filter((_, i) => i !== index).join("\n");
}

/** The On-examination lines for one field: one per entry, each with its label. */
export function historyLines(label: string, value: string): string[] {
  return historyEntries(value).map((e) => `${label}: ${e}`);
}
