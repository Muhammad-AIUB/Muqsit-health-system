// Turns a prescribing-habit suggestion into editor rows, and splices it into
// the pad. The sibling of `rxRows.ts`, which does the equivalent job for a
// saved prescription.
//
// Kept OUT of the component on purpose: this is the code that decides what
// lands in a prescription when the doctor clicks a suggestion, so it has to be
// unit-testable without rendering anything (`rxHabitRows.test.ts`).

import type { MedicineHit, RxHabitContLine, RxHabitItem } from "@/lib/api";
import { fmtMedicine } from "@/lib/rxShorthand";
import { normaliseDrugKey } from "@/lib/rxHabitKey";
import { contRow, emptyRow, type Row } from "@/components/prescription/MedicinePad";

/**
 * ⚕️ TOTAL BY CONSTRUCTION. `contLines` reaches the browser from a `Json`
 * column, so it is treated as unknown here: a non-array, a null, an entry
 * missing a key or holding a number is SKIPPED rather than mapped over.
 *
 * This is the second of two layers (the server drops an unreadable block
 * whole), and it exists because the two fail for different reasons. This code
 * runs inside the prescription editor, and React unmounts the whole tree on an
 * uncaught render error — one bad value would take out the entire screen a
 * doctor prescribes through, not just the suggestion. That is not hypothetical:
 * it is what happened to the prescribing alerts on 2026-08-01.
 */
export function safeContLines(value: unknown): RxHabitContLine[] {
  if (!Array.isArray(value)) return [];
  const out: RxHabitContLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    if (
      typeof e.dose !== "string" ||
      typeof e.food !== "string" ||
      typeof e.duration !== "string"
    ) {
      continue;
    }
    out.push({ dose: e.dose, food: e.food, duration: e.duration });
  }
  return out;
}

/** Every string a suggestion renders or inserts, read defensively. */
export function safeHabitText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Resolve the medicine's generic name from the results ALREADY loaded for the
 * same query — no extra request, no new storage.
 *
 * Matched on the NORMALISED key, never the raw label: "Tablet. Napa 500 mg" and
 * "Tablet. Napa 500mg" are the same medicine, and a raw comparison would miss
 * on the space alone. A miss is not cosmetic — it silently removes a
 * generic-based drug-drug alert on the fastest path through the editor.
 *
 * When nothing matches the row carries no generic, which is exactly the
 * already-documented state of a hand-typed brand. No generic is ever invented.
 */
export function resolveGeneric(
  drugLabel: string,
  medicines: MedicineHit[],
): string | undefined {
  const key = normaliseDrugKey(safeHabitText(drugLabel));
  if (!key) return undefined;
  for (const m of medicines ?? []) {
    if (!m) continue;
    if (normaliseDrugKey(fmtMedicine(m)) === key) return m.genericName ?? undefined;
  }
  return undefined;
}

/**
 * The rows one suggestion becomes: the head medicine, then one `contRow()` per
 * continuation line, in order. The whole tapering block is one unit (D4) — a
 * click fills every line of it.
 */
export function habitToRows(habit: RxHabitItem, generic?: string): Row[] {
  const head: Row = {
    drug: safeHabitText(habit?.drugLabel),
    dose: safeHabitText(habit?.dose),
    food: safeHabitText(habit?.food),
    duration: safeHabitText(habit?.duration),
    checked: true,
    isMedicine: true,
    continuation: false,
    // Measurement only — stripped by the server's ValidationPipe, so a
    // prescription still records what was prescribed, never how it was typed.
    fromHabit: true,
    ...(generic ? { generic } : {}),
  };
  const cont = safeContLines(habit?.contLines).map((c) => ({
    ...contRow(),
    dose: c.dose,
    food: c.food,
    duration: c.duration,
    fromHabit: true,
  }));
  return [head, ...cont];
}

const isBlank = (r: Row): boolean =>
  !r.drug.trim() && !r.dose.trim() && !r.food.trim() && !r.duration.trim();

/**
 * Write a suggestion into the pad at `idx`.
 *
 * ⚕️ INSERTION NEVER OVERWRITES AN EXISTING LINE. The clicked row is replaced
 * (it is the one the doctor was typing into), and the continuation rows are
 * SPLICED IN below it, pushing whatever followed downward — the same splice
 * `addContinuation` already performs in MedicinePad. A doctor who clicks a
 * tapering suggestion on row 2 of a five-medicine sheet must not lose row 3.
 *
 * The trailing empty row is re-appended if the insertion consumed it, so the
 * pad always ends with somewhere to type.
 */
export function insertHabitRows(
  rows: Row[],
  idx: number,
  habit: RxHabitItem,
  generic?: string,
): Row[] {
  const safe = Array.isArray(rows) ? rows : [];
  if (idx < 0 || idx >= safe.length) return safe;
  const inserted = habitToRows(habit, generic);
  const next = [...safe.slice(0, idx), ...inserted, ...safe.slice(idx + 1)];
  const last = next[next.length - 1];
  if (!last || !isBlank(last)) next.push(emptyRow());
  return next;
}

/**
 * Where the caret goes after an insertion: the NEXT medicine row, not the dose
 * box. The clicked row is already complete — the whole point of the feature —
 * so focusing `dose` would put the doctor back in a field they did not have to
 * fill.
 */
export function focusIndexAfterInsert(idx: number, habit: RxHabitItem): number {
  return idx + 1 + safeContLines(habit?.contLines).length;
}
