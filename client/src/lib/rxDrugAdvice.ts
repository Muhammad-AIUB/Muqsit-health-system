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

import type { RxItem } from "@/types";
import { rowsFromRxItems } from "@/lib/rxRows";
import { normaliseDrugKey } from "@/lib/rxHabitKey";

export type AdviceScope = "medicine" | "generic";

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
  /** Every medicine on the pad this line is advice for. */
  drugKeys: string[];
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
      } else byLine.set(line, { line, drugKeys: [dk] });
    }
  }
  return [...byLine.values()];
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
  return { advice, owned: nextOwned, newlyOff };
}
