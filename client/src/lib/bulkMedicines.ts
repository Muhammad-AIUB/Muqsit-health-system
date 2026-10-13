import type { RxItem } from "@/types";
import { normaliseDrugKey } from "@/lib/rxHabitKey";
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

/**
 * Is this the server's list at all — an object holding a list of medicines?
 *
 * ⚕️ `readBulkList` below reads ANYTHING as a list, an empty one if it must,
 * because it must never throw inside the editor. But "the answer was not the
 * list" is a failure to load, and read as an empty list it was drawn as "No
 * medicines yet" — a sign-in page handed back by a hospital's Wi-Fi, an empty
 * body. The caller asks this first and treats `false` as a failed load.
 */
export const isBulkAnswer = (value: unknown): boolean => Array.isArray(record(value)?.medicines);

// A whole number of rows, or nothing: the server's count of what IT left out.
const rowsLeftOut = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);

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
  // The server leaves out a medicine whose row it cannot read; those are counted
  // with the ones left out here, so the box's notice is the whole number.
  return { medicines, truncated: root?.truncated === true, unreadable: unreadable + rowsLeftOut(root?.unreadable) };
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

// ── On the pad already? ───────────────────────────────────────────────────────
// A medicine is not written twice: one whose FIRST line is on the pad is
// skipped, tapering lines and all — the rule of Drug history's "Move to Rx",
// by the physician's decision. Two things are this box's own:
//
//  • The medicine is compared as the app compares medicines everywhere else
//    (`normaliseDrugKey`: case, spacing, `Tab` for `Tablet.` — never the
//    strength, never the form). The box's label is the medicine as this doctor
//    LAST wrote it and the pad's may have been picked from the medicine list;
//    compared letter for letter, `Tablet. Napa 500mg` went on the pad beside
//    `Tablet. Napa 500 mg` (first review, before release).
//  • What is SAID about a skip is true. The first line being there does not
//    mean the instruction is: the pad may hold that medicine with other
//    tapering lines, or none. That is counted (`otherTaper`) and said, where
//    for one review round the box said "with the same instruction".

const cell = (s: string | undefined): string => (s ?? "").trim();
/** The first line of a block: the medicine and its three cells. */
const headKey = (drug: string, dose: string, food: string, duration: string): string =>
  [normaliseDrugKey(drug) || cell(drug).toLowerCase(), cell(dose), cell(food), cell(duration)].join("|");
/** The tapering lines under it, in order. */
const taperKey = (lines: { dose: string; food: string; duration: string }[]): string =>
  lines.map((l) => [cell(l.dose), cell(l.food), cell(l.duration)].join("|")).join("\n");

// The pad as blocks: each medicine with the tapering lines directly under it.
// A line is a taper by the pad's own test (`rowsFromRxItems`): marked `isCont`,
// or — on a line saved before that mark existed — no drug name. A note belongs
// to nothing and ends the block above it.
function padBlocks(existing: RxItem[]): Map<string, Set<string>> {
  const blocks = new Map<string, Set<string>>();
  let open: { key: string; taper: BulkLine[] } | null = null;
  const close = () => {
    if (!open) return;
    const tapers = blocks.get(open.key) ?? new Set<string>();
    tapers.add(taperKey(open.taper));
    blocks.set(open.key, tapers);
    open = null;
  };
  (existing ?? []).forEach((it, i) => {
    if (!it) return;
    if (it.isNote) { close(); return; }
    const isCont = it.isCont ?? (cell(it.drug) === "" && i > 0);
    if (isCont) {
      open?.taper.push({ dose: it.dose, food: it.instruction, duration: it.duration });
      return;
    }
    close();
    if (cell(it.drug)) open = { key: headKey(it.drug, it.dose, it.instruction, it.duration), taper: [] };
  });
  close();
  return blocks;
}

export interface BulkAdd {
  /** The lines to append to the pad, in the order ticked medicines were given. */
  items: RxItem[];
  /** Medicines added — not lines. */
  added: number;
  /** Medicines whose first line was already on the pad. */
  skipped: number;
  /** Of those, the ones that stand on the pad with other tapering lines than the box shows. */
  otherTaper: number;
}

/**
 * The lines the ticked medicines add to a pad that already holds `existing`,
 * in the order given.
 */
export function bulkToRxItems(picked: BulkMedicine[], existing: RxItem[]): BulkAdd {
  const onPad = padBlocks(existing);
  const items: RxItem[] = [];
  let added = 0;
  let skipped = 0;
  let otherTaper = 0;

  for (const m of picked ?? []) {
    const key = headKey(m.drugLabel, m.dose, m.food, m.duration);
    const taper = taperKey(m.contLines);
    const there = onPad.get(key);
    if (there) {
      skipped++;
      if (!there.has(taper)) otherTaper++;
      continue;
    }
    onPad.set(key, new Set([taper]));
    // The lines carry no `fromHabit`. That flag is what makes a save write
    // `N of M ℞ lines inserted from "Your usual"` to the activity feed, and a
    // line added from this box was not inserted from "Your usual".
    items.push({
      drug: m.drugLabel,
      dose: m.dose,
      duration: m.duration,
      instruction: m.food,
      isCont: false,
      ...(m.generic ? { generic: m.generic } : {}),
    });
    for (const c of m.contLines) {
      items.push({ drug: "", dose: c.dose, duration: c.duration, instruction: c.food, isCont: true });
    }
    added++;
  }
  return { items, added, skipped, otherTaper };
}

/** The line beside the + after an Add: honest about what did not go. */
export function bulkSummary({ added, skipped, otherTaper }: Pick<BulkAdd, "added" | "skipped" | "otherTaper">): string {
  const parts: string[] = [`${added} added`];
  if (skipped) {
    const taper = otherTaper === 0 ? ""
      : skipped === 1 ? " — its tapering lines differ there"
      : ` — the tapering lines of ${otherTaper} differ there`;
    parts.push(`${skipped} already on ℞${taper}`);
  }
  return parts.join(" · ");
}

/** The line in the box when every ticked medicine was already on the pad. */
export function nothingAddedNote(ticked: number, otherTaper: number): string {
  if (ticked === 1) {
    return otherTaper
      ? "That medicine is already on ℞, but its tapering lines there are not the ones shown here — nothing was added. Change them on the pad."
      : "That medicine is already on ℞ with the same instruction — nothing was added.";
  }
  return otherTaper
    ? `Those medicines are already on ℞ — nothing was added. The tapering lines of ${otherTaper} are not the ones shown here: change them on the pad.`
    : "Those medicines are already on ℞ with the same instructions — nothing was added.";
}
