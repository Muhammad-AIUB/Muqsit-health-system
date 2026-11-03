// ⚕️ The patient's Disease history and Surgical / intervention history, in the
// prescription sidebar's History block (physician's sheet 28/10/2026, item 7:
// "On examination er aituk prescription er history te nia jao purota, same
// format a … oi patient er khetre sob somoi thakbe … Aita ai patient er sob dr.
// … print korar age hide kora jabe").
//
// Stored where the On-examination popup put them before: entries of the
// patient's shared on-examination history (`Patient.onExaminationSummary`),
// written `Disease Hx: <text>` / `Surgical Hx: <text>` — so every entry recorded
// through the popup since 18/10/2026 is in the sidebar unchanged, and the
// records page's "Disease and surgical history" keeps reading the same lines.
// The text carries its own date (`H/O cholecystectomy 15/10/2026`); the entry's
// `date` is the visit it was written at.

import { historyEntryText, type AddResult } from "@/lib/oeHistory";
import { isRemovedOe, type OeFinding } from "@/lib/onExaminationSummary";

export type HxKind = "disease" | "surgical";

export const HX_KINDS: ReadonlyArray<{ kind: HxKind; label: string; placeholder: string }> = [
  // The labels and placeholders of the On-examination popup, word for word.
  { kind: "disease", label: "Disease history", placeholder: "e.g. First known, disease event etc." },
  { kind: "surgical", label: "Surgical / intervention history", placeholder: "e.g. H/O cholecystectomy, RFA, TACE of HCC etc." },
];

const PREFIX: Record<HxKind, string> = { disease: "Disease Hx:", surgical: "Surgical Hx:" };

export interface PatientHxEntry {
  /** As written, its date included: `H/O cholecystectomy 15/10/2026`. */
  text: string;
  /** The visit it was first written at (dd/mm/yyyy). */
  date: string;
  /** Who wrote it, when the server stamped it (31/10/2026 on); else null. */
  by: string | null;
}

/** The identity of an entry — the server's (`server/src/patients/on-examination.ts#hxKey`). */
export const hxKey = (text: string): string => String(text ?? "").trim().toLowerCase();

/** The line that is stored, and printed: `Disease Hx: DM 01/01/2010`. */
export const hxLine = (kind: HxKind, text: string): string => `${PREFIX[kind]} ${text}`;

/**
 * Each kind's entries in the order they were first written (oldest first, as
 * the popup listed them), one per distinct text — the same history written at
 * two visits is one entry, shown with the visit it was first written at.
 * A removed entry is left out; anything that is not a readable entry is skipped.
 */
export function patientHistory(findings: OeFinding[] | null | undefined): Record<HxKind, PatientHxEntry[]> {
  const out: Record<HxKind, PatientHxEntry[]> = { disease: [], surgical: [] };
  const seen: Record<HxKind, Set<string>> = { disease: new Set(), surgical: new Set() };
  for (const f of findings ?? []) {
    if (!f || typeof f !== "object" || typeof f.text !== "string" || isRemovedOe(f)) continue;
    for (const kind of ["disease", "surgical"] as const) {
      if (!f.text.startsWith(PREFIX[kind])) continue;
      const text = f.text.slice(PREFIX[kind].length).trim();
      const key = hxKey(text);
      if (!text || seen[kind].has(key)) continue;
      seen[kind].add(key);
      out[kind].push({ text, date: typeof f.date === "string" ? f.date : "", by: typeof f.by === "string" && f.by.trim() ? f.by.trim() : null });
    }
  }
  return out;
}

/** Whether this text is in the list already (case and outer spacing aside). */
export function hasHxEntry(list: PatientHxEntry[], text: string): boolean {
  const k = hxKey(text);
  return list.some((e) => hxKey(e.text) === k);
}

/** What typed text + date box make, as `historyEntryText` (DDMMYY, a date that has happened). */
export function typedHxEntry(text: string, date: string, now = new Date()): AddResult {
  return historyEntryText(text, date, now);
}

/**
 * What the printed sheet carries under "History": this visit's History lines as
 * they always printed, then the patient's Disease and Surgical history, each
 * line as the On-examination section printed it (`Disease Hx: …`). Nothing at
 * all when the doctor pressed ⊘ Hide. The record is untouched either way.
 */
export function printableHistory(visitLines: string[], hx: Record<HxKind, PatientHxEntry[]>, hidden: boolean): string[] {
  if (hidden) return [];
  return [
    ...visitLines,
    ...hx.disease.map((e) => hxLine("disease", e.text)),
    ...hx.surgical.map((e) => hxLine("surgical", e.text)),
  ];
}
