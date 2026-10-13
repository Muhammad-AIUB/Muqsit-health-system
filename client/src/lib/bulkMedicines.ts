import type { RxItem } from "@/types";
import { appendBlocks } from "@/lib/drugHistorySelect";
import { splitDrugLabel } from "@/lib/rxShorthand";

// The "Add Bulk Medicine" box (physician's request, 2026-10-13): the medicines
// this doctor has prescribed before, each with the instruction they most often
// write for it, ticked and added to the ℞ pad in one press.
//
// ⚕️ Everything here is ECHOED from prescriptions this doctor already saved.
// Nothing is completed, defaulted or reworded: a cell left blank is added
// blank, a taper goes with its medicine or not at all, and the generic — which
// is what makes a prescribing alert fire on a brand line — travels with the
// medicine it came with. The response reaches the prescription editor, where
// an uncaught error unmounts the whole screen, so it is read as UNKNOWN.

/** One `>>>` line of a tapering block. */
export interface BulkLine { dose: string; food: string; duration: string }

export interface BulkMedicine extends BulkLine {
  /** The habit row it stands for; what a tick is kept by. */
  id: string;
  /** As last written: the text added to the pad. */
  drugLabel: string;
  generic?: string;
  contLines: BulkLine[];
  /** DISTINCT PATIENTS given this instruction — never a prescription count. */
  patientCount: number;
}

export interface BulkList {
  medicines: BulkMedicine[];
  /** The doctor has more medicines than the server's cap. */
  truncated: boolean;
  /** Rows left out because they could not be read whole. */
  unreadable: number;
}

export type BulkOrder = "popular" | "alphabetical";

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// Null when it cannot be read: the caller leaves the medicine out WHOLE. Half
// a tapering schedule offered as the whole instruction is worse than none.
// (The server applies the same rule; the two layers fail for different reasons.)
function linesOf(value: unknown): BulkLine[] | null {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: BulkLine[] = [];
  for (const entry of value) {
    const e = record(entry);
    if (!e || typeof e.dose !== "string" || typeof e.food !== "string" || typeof e.duration !== "string") return null;
    out.push({ dose: e.dose, food: e.food, duration: e.duration });
  }
  return out;
}

/** The server's response, read without trusting it. Total: never throws. */
export function readBulkList(value: unknown): BulkList {
  const root = record(value);
  const rows = root && Array.isArray(root.medicines) ? root.medicines : [];
  const medicines: BulkMedicine[] = [];
  const seen = new Set<string>();
  let unreadable = 0;
  for (const raw of rows) {
    const r = record(raw);
    const id = r ? text(r.id) : "";
    const drugLabel = r ? text(r.drugLabel).trim() : "";
    const contLines = r ? linesOf(r.contLines) : null;
    if (!r || !id || !drugLabel || contLines === null || seen.has(id)) { unreadable++; continue; }
    seen.add(id);
    const generic = text(r.generic).trim();
    const n = r.patientCount;
    medicines.push({
      id,
      drugLabel,
      ...(generic ? { generic } : {}),
      dose: text(r.dose),
      food: text(r.food),
      duration: text(r.duration),
      contLines,
      patientCount: typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0,
    });
  }
  return { medicines, truncated: root?.truncated === true, unreadable };
}

// Compared by character, never by the browser's locale: the same list must be
// in the same order on every machine.
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
// What a medicine is filed under from A to Z: its brand. A label STARTS with
// its dosage form, and sorted by that the list is every capsule, then every
// tablet — not an order anyone looks a medicine up in.
const brandOf = (label: string): string => (splitDrugLabel(label).name || label).toLowerCase();
const aToZ = (a: BulkMedicine, b: BulkMedicine): number =>
  byText(brandOf(a.drugLabel), brandOf(b.drugLabel))
  || byText(a.drugLabel.toLowerCase(), b.drugLabel.toLowerCase())
  || byText(a.id, b.id);

/** A new list in the order asked for. The order is total: equal rows never swap. */
export function sortBulk(list: BulkMedicine[], order: BulkOrder): BulkMedicine[] {
  return [...list].sort(order === "alphabetical" ? aToZ : (a, b) => b.patientCount - a.patientCount || aToZ(a, b));
}

/** The medicines whose name or generic holds every word typed, in the order given. */
export function searchBulk(list: BulkMedicine[], q: string): BulkMedicine[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return list;
  return list.filter((m) => {
    const hay = `${m.drugLabel} ${m.generic ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** A line's instruction as the row shows it: only the cells that were written. */
export const instructionOf = (line: BulkLine): string =>
  [line.dose, line.food, line.duration].map((s) => s.trim()).filter(Boolean).join(" · ");

/** DISTINCT patients — the word is always written out, never "×". */
export const patientsLabel = (n: number): string => (n === 1 ? "1 patient" : `${n} patients`);

/**
 * The lines the ticked medicines add to a pad that already holds `existing`,
 * in the order given. A medicine whose head line is already on the pad is
 * skipped, taper and all (`appendBlocks`, the rule of Drug history's "Move to
 * Rx"); `added` and `skipped` count medicines, not lines.
 */
export function bulkToRxItems(
  picked: BulkMedicine[],
  existing: RxItem[],
): { items: RxItem[]; added: number; skipped: number } {
  // The lines carry no `fromHabit`. That flag is what makes a save write
  // `N of M ℞ lines inserted from "Your usual"` to the activity feed, and a
  // line added from this box was not inserted from "Your usual".
  const blocks = picked.map((m) => {
    const head: RxItem = {
      drug: m.drugLabel,
      dose: m.dose,
      duration: m.duration,
      instruction: m.food,
      isCont: false,
      ...(m.generic ? { generic: m.generic } : {}),
    };
    const taper: RxItem[] = m.contLines.map((c) => ({
      drug: "", dose: c.dose, duration: c.duration, instruction: c.food, isCont: true,
    }));
    return { items: [head, ...taper] };
  });
  return appendBlocks(blocks, existing);
}
