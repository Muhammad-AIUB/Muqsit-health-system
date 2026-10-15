// ⚕️ Special advice per medicine (the ℞ pad's ••• box, physician's design
// 2026-09-24). The doctor writes advice lines for a medicine — for that exact
// medicine, or for every brand of its generic — and while such a medicine is on
// today's pad, its ticked lines sit in the prescription's Advice section.
//
// The physician's decisions this module carries:
//  • the lines go INTO the Advice section, and print as ordinary advice;
//  • they leave again the moment the medicine leaves the pad, or its tick is
//    taken off — but ONLY lines this mirror put there. A line the doctor typed
//    into Advice by hand is never touched, even when it reads the same;
//  • the next time the medicine (or its generic) is written, the saved advice
//    comes back on its own, ticked.
//
// Every character is the doctor's own: nothing here invents, completes or
// rewords a line. The tick is per VISIT (`off` lives in the editor draft), so
// unticking a line for one patient never removes it for the next.
//
// Same shape as `rxDrugHistory.ts`, and the same rule that makes writing into a
// clinical list from a keystroke safe: the mirror remembers what it added
// (`owned`) and withdraws only that.
//
// ⚕️ Advice per FINAL DIAGNOSIS (physician's sheet, 15/10/2026, item 4) rides
// the same mirror: the doctor writes it in the same box, from the ••• beside a
// Final diagnosis line (scope "diagnosis"), and it joins Advice while that
// diagnosis is written. The medicines' advice comes first and the diagnoses'
// after it ("osudh er advice and final diagnosis er advice … por por thakbe").

import type { RxItem } from "@/types";
import { rowsFromRxItems } from "@/lib/rxRows";
import { normaliseDrugKey } from "@/lib/rxHabitKey";

export type AdviceScope = "medicine" | "generic" | "diagnosis";

export interface DrugAdvice {
  id: string;
  scope: AdviceScope | string;
  /** Server-computed matching key (see server/src/drug-advice/keys.ts). */
  key: string;
  label: string;
  lines: string[];
}

/** A medicine line on the pad, as far as advice is concerned. */
export interface PadMedicine {
  drug: string;
  generic?: string;
}

/** A generic name, folded for case and spacing only — mirrors the server. */
export function genericKey(generic: string | undefined | null): string {
  return (generic ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The per-medicine key a tick is remembered under (strength included). */
export function drugKeyOf(drug: string): string {
  return normaliseDrugKey(drug ?? "");
}

/**
 * A final diagnosis, folded for case and spacing only — mirrors the server's
 * `diagnosisKey`. "Pregnant 32 weeks" is not "Pregnant", and "Not pregnant" is
 * not either: nothing is matched on part of a diagnosis.
 */
export function diagnosisKey(diagnosis: string | undefined | null): string {
  return (diagnosis ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Who a diagnosis's advice line belongs to, for this visit's ticks — in the
 * place a medicine's key stands. The \u0002 keeps it apart from every medicine
 * key, so unticking a line for a diagnosis never unticks it for a medicine.
 */
export function diagnosisOwner(diagnosis: string): string {
  return `\u0002dx:${diagnosisKey(diagnosis)}`;
}

/** How a single unticked line is remembered for this visit. */
export function offKey(drugKey: string, line: string): string {
  return `${drugKey}\u0001${line}`;
}

const hasLines = (a: DrugAdvice | undefined): a is DrugAdvice =>
  !!a && Array.isArray(a.lines) && a.lines.some((l) => typeof l === "string" && l.trim() !== "");

/** The doctor's saved advice that applies to this medicine, per scope. */
export function savedAdviceFor(
  med: PadMedicine,
  saved: readonly DrugAdvice[],
): { medicine: DrugAdvice | null; generic: DrugAdvice | null } {
  const mk = drugKeyOf(med.drug);
  const gk = genericKey(med.generic);
  let medicine: DrugAdvice | null = null;
  let generic: DrugAdvice | null = null;
  for (const a of saved ?? []) {
    if (!hasLines(a)) continue;
    if (a.scope === "medicine" && mk && a.key === mk) medicine = a;
    else if (a.scope === "generic" && gk && a.key === gk) generic = a;
  }
  return { medicine, generic };
}

/** The doctor's saved advice for this final diagnosis, if any. */
export function savedAdviceForDiagnosis(diagnosis: string, saved: readonly DrugAdvice[]): DrugAdvice | null {
  const k = diagnosisKey(diagnosis);
  if (!k) return null;
  let found: DrugAdvice | null = null;
  for (const a of saved ?? []) if (hasLines(a) && a.scope === "diagnosis" && a.key === k) found = a;
  return found;
}

/** The lines of one advice, as they should be offered (blanks skipped). */
export function adviceLines(a: DrugAdvice | null): string[] {
  if (!a || !Array.isArray(a.lines)) return [];
  return a.lines.filter((l): l is string => typeof l === "string").map((l) => l.trim()).filter(Boolean);
}

/** The head medicines on today's pad (no notes, no taper lines, no blanks). */
export function padMedicines(rxItems: RxItem[]): PadMedicine[] {
  return rowsFromRxItems(rxItems ?? [])
    .filter((r) => r.isMedicine && !r.continuation && r.drug.trim())
    .map((r) => ({ drug: r.drug.trim(), generic: r.generic }));
}

export interface DerivedLine {
  line: string;
  /** Every medicine on the pad (or `diagnosisOwner`) this line is advice for. */
  drugKeys: string[];
  /** Whose advice it is: a medicine's stands before a diagnosis's in Advice. */
  kind?: "medicine" | "diagnosis";
}

/**
 * The advice lines today's pad asks for, in pad order: each medicine's own
 * advice first, then its generic's. A line two medicines share appears once.
 * A line unticked for a medicine this visit is not asked for by THAT medicine.
 */
export function rxAdviceLines(
  meds: readonly PadMedicine[],
  saved: readonly DrugAdvice[],
  off: readonly string[],
): DerivedLine[] {
  const offSet = new Set(off ?? []);
  const byLine = new Map<string, DerivedLine>();
  for (const m of meds ?? []) {
    const dk = drugKeyOf(m.drug);
    if (!dk) continue;
    const { medicine, generic } = savedAdviceFor(m, saved);
    for (const line of [...adviceLines(medicine), ...adviceLines(generic)]) {
      if (offSet.has(offKey(dk, line))) continue;
      const d = byLine.get(line);
      if (d) {
        if (!d.drugKeys.includes(dk)) d.drugKeys.push(dk);
      } else byLine.set(line, { line, drugKeys: [dk], kind: "medicine" });
    }
  }
  return [...byLine.values()];
}

/**
 * The advice lines today's FINAL DIAGNOSES ask for, in the order they are
 * written. A line two diagnoses share appears once; a line unticked for a
 * diagnosis this visit is not asked for by that diagnosis.
 */
export function diagnosisAdviceLines(
  diagnoses: readonly string[],
  saved: readonly DrugAdvice[],
  off: readonly string[],
): DerivedLine[] {
  const offSet = new Set(off ?? []);
  const byLine = new Map<string, DerivedLine>();
  for (const dx of diagnoses ?? []) {
    if (typeof dx !== "string" || !diagnosisKey(dx)) continue;
    const owner = diagnosisOwner(dx);
    for (const line of adviceLines(savedAdviceForDiagnosis(dx, saved))) {
      if (offSet.has(offKey(owner, line))) continue;
      const d = byLine.get(line);
      if (d) {
        if (!d.drugKeys.includes(owner)) d.drugKeys.push(owner);
      } else byLine.set(line, { line, drugKeys: [owner], kind: "diagnosis" });
    }
  }
  return [...byLine.values()];
}

/**
 * Everything the visit's Advice is asked to carry: the medicines' advice, then
 * the final diagnoses'. A line both ask for is written once, with the
 * medicines', and belongs to all of them (so deleting it by hand unticks it for
 * every one).
 */
export function adviceLinesFor(
  meds: readonly PadMedicine[],
  diagnoses: readonly string[],
  saved: readonly DrugAdvice[],
  off: readonly string[],
): DerivedLine[] {
  const out = rxAdviceLines(meds, saved, off);
  const byLine = new Map(out.map((d) => [d.line, d] as const));
  for (const d of diagnosisAdviceLines(diagnoses, saved, off)) {
    const have = byLine.get(d.line);
    if (have) {
      for (const k of d.drugKeys) if (!have.drugKeys.includes(k)) have.drugKeys.push(k);
      continue;
    }
    byLine.set(d.line, d);
    out.push(d);
  }
  return out;
}

/**
 * Fold the pad's advice into the visit's Advice list.
 *
 *  1. **Only withdraw what this mirror added** (`owned`). A line typed into
 *     Advice by hand is never removed — and a wanted line that is ALREADY
 *     there by hand is left alone and not claimed, so taking the medicine off
 *     later cannot delete the doctor's own line.
 *  2. **A line the doctor deleted from Advice by hand stays deleted.** An owned
 *     line missing from `stored` was removed by the doctor; it is returned in
 *     `newlyOff` (unticked for every medicine that asked for it) instead of
 *     being put straight back.
 *  3. **Additive and order-stable**, and **idempotent** — the same inputs give
 *     equal arrays, which lets the caller skip a write when nothing changed.
 *  4. **The medicines' advice stands before the diagnoses'** (physician's sheet,
 *     15/10/2026). Only the mirror's own lines are put in that order, among the
 *     places they already hold — a line the doctor typed never moves — so a
 *     diagnosis written before its medicine still prints after it.
 */
export function syncRxAdvice(
  stored: readonly string[],
  owned: readonly string[],
  derived: readonly DerivedLine[],
): { advice: string[]; owned: string[]; newlyOff: string[] } {
  const storedSet = new Set(stored ?? []);
  const want = new Map(derived.map((d) => [d.line, d] as const));
  const newlyOff: string[] = [];
  const handDeleted = new Set<string>();
  const stillOwned: string[] = [];
  for (const o of owned ?? []) {
    if (!storedSet.has(o)) {
      handDeleted.add(o);
      const d = want.get(o);
      if (d) for (const k of d.drugKeys) newlyOff.push(offKey(k, o));
      continue;
    }
    stillOwned.push(o);
  }
  const ownedSet = new Set(stillOwned);
  const advice = (stored ?? []).filter((l) => !(ownedSet.has(l) && !want.has(l)));
  const nextOwned = stillOwned.filter((l) => want.has(l));
  const present = new Set(advice);
  for (const { line } of derived) {
    if (present.has(line) || handDeleted.has(line)) continue;
    present.add(line);
    advice.push(line);
    nextOwned.push(line);
  }
  // Rule 4: the mirror's own lines, medicines' first, in the places they hold.
  const rank = (l: string) => (want.get(l)?.kind === "diagnosis" ? 1 : 0);
  const mine = new Set(nextOwned);
  const slots = advice.flatMap((l, i) => (mine.has(l) ? [i] : []));
  const ordered = slots.map((i) => advice[i]).sort((a, b) => rank(a) - rank(b)); // stable
  slots.forEach((slot, n) => { advice[slot] = ordered[n]; });
  return { advice, owned: nextOwned, newlyOff };
}
