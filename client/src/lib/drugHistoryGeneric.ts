// ⚕️ Drug history is READ by its generic names, never by a trade name
// (physician, 02/11/2026: "drug history te trade name show korbe na kokono
// medicine er"). DISPLAY ONLY: a stored entry stays exactly as written
// (`Tablet. Napa 500 mg`), Move to Rx puts that stored brand line on the ℞
// pad, and every "already on ℞" comparison reads the stored text.
//
// The generic is the medicine chart's (`POST /medicines/by-brand`, the lookup
// the monthly-cost box uses), and which row IS a label's medicine is the app's
// one answer to that question, `MedicineMap` / `sameMedicine` — form and
// strength included, so Sergel 20 mg is never read as Sergel 40 mg. Nothing is
// guessed: a label the chart does not hold, or holds under two different
// generics, is shown as stored and says so.

import { MedicineMap } from "@/lib/medicineKey";
import { fmtMedicine, splitDrugLabel } from "@/lib/rxShorthand";
import type { ChartRow } from "@/lib/monthlyCost";

export type GenericAnswer =
  /** Exactly one generic: `shown` is the label with the brand replaced by it. */
  | { kind: "generic"; generic: string; shown: string }
  /** The chart holds no generic for this medicine (or not the medicine at all). */
  | { kind: "none" }
  /** The chart lists this medicine under more than one generic. */
  | { kind: "several"; generics: string[] };

// Two spellings of one generic are one (as the server's `sameGeneric`).
const genericKey = (g: string): string => g.replace(/\s+/g, " ").trim().toLowerCase();

/** What the chart's rows say this label's generic is. */
export function genericOf(label: string, rows: ChartRow[]): GenericAnswer {
  const chart = new MedicineMap<ChartRow>();
  for (const r of rows ?? []) chart.add(fmtMedicine(r), r);
  const met = new Map<string, string>();
  for (const r of chart.get(label)) {
    const g = (r.genericName ?? "").replace(/\s+/g, " ").trim();
    if (g && !met.has(genericKey(g))) met.set(genericKey(g), g);
  }
  if (met.size === 0) return { kind: "none" };
  if (met.size > 1) return { kind: "several", generics: [...met.values()] };
  const generic = [...met.values()][0];
  const shown = withGeneric(label, generic);
  return shown === null ? { kind: "none" } : { kind: "generic", generic, shown };
}

/**
 * The label with its brand NAME replaced by the generic, its dosage form and
 * strength exactly as stored: `Tablet. Napa 500 mg` → `Tablet. Paracetamol 500 mg`.
 * Null when the label's name cannot be found (nothing is then replaced).
 */
export function withGeneric(label: string, generic: string): string | null {
  const { before, name, after } = splitDrugLabel(label);
  if (!name || !generic.trim()) return null;
  return `${before}${generic.trim()}${after}`;
}

/** The small note beside a medicine shown as stored. */
export const GENERIC_NOT_FOUND = "generic not found";
export const GENERIC_SEVERAL = "more than one generic in the medicine chart";
export const GENERICS_NOT_LOADED = "Generic names could not be loaded. Medicines are shown as written.";
