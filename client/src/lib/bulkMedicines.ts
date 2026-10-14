import type { RxItem } from "@/types";
import { medicineKey } from "@/lib/medicineKey";
import { splitDrugLabel } from "@/lib/rxShorthand";

// The rules of the "Add Bulk Medicine" box: the medicines this doctor has
// prescribed before, each with its usual instruction, ticked and added to the
// ℞ pad in one press.
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
  /** When this instruction was last written (ISO), shown beside the count. */
  lastUsedAt?: string;
}

export interface BulkList {
  medicines: BulkMedicine[];
  /** The doctor has more medicines than the server's cap. */
  truncated: boolean;
  /** Medicines left out — by the server or here — because they could not be read whole. */
  unreadable: number;
}

export type BulkOrder = "popular" | "alphabetical";

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
// The server's own count of rows it left out: a whole number, or nothing.
const rowCount = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);

// Null when it cannot be read: the caller leaves the medicine out WHOLE. Half
// a tapering schedule offered as the whole instruction is worse than none.
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
 * The server's response, read without trusting it. Never throws.
 *
 * ⚕️ NULL when the answer is not the list at all — an empty body, or the
 * sign-in page a hospital's Wi-Fi puts in place of an answer. That is a failed
 * load, and must not be read as a doctor who has prescribed nothing. A row
 * that cannot be read whole is left out and counted.
 */
export function readBulkList(value: unknown): BulkList | null {
  const root = record(value);
  if (!root || !Array.isArray(root.medicines)) return null;
  const medicines: BulkMedicine[] = [];
  const seen = new Set<string>();
  let unreadable = rowCount(root.unreadable);
  for (const raw of root.medicines) {
    const r = record(raw);
    const id = r ? text(r.id) : "";
    const drugLabel = r ? text(r.drugLabel).trim() : "";
    const contLines = r ? linesOf(r.contLines) : null;
    if (!r || !id || !drugLabel || contLines === null || seen.has(id)) { unreadable++; continue; }
    seen.add(id);
    const generic = text(r.generic).trim();
    const lastUsedAt = text(r.lastUsedAt);
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
      ...(lastUsedAt ? { lastUsedAt } : {}),
    });
  }
  return { medicines, truncated: root.truncated === true, unreadable };
}

// ── Order and search ──────────────────────────────────────────────────────────

// Compared by character, never by the browser's locale: the same list must be
// in the same order on every machine.
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A new list in the order asked for. The order is total — equal rows never
 * swap — and Alphabetical is by the BRAND: a label starts with its dosage
 * form, and sorted by that the list is every capsule, then every tablet.
 */
export function sortBulk(list: BulkMedicine[], order: BulkOrder): BulkMedicine[] {
  // The keys are worked out once per medicine, not once per comparison.
  const keyed = list.map((m) => ({
    m,
    brand: (splitDrugLabel(m.drugLabel).name || m.drugLabel).toLowerCase(),
    label: m.drugLabel.toLowerCase(),
  }));
  type Keyed = (typeof keyed)[number];
  const aToZ = (a: Keyed, b: Keyed): number => byText(a.brand, b.brand) || byText(a.label, b.label) || byText(a.m.id, b.m.id);
  keyed.sort(order === "alphabetical" ? aToZ : (a, b) => b.m.patientCount - a.m.patientCount || aToZ(a, b));
  return keyed.map((k) => k.m);
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

// ── What is on the pad already ────────────────────────────────────────────────
// A LINE is not written twice: the same medicine with the same dose, timing
// and duration is skipped, tapering lines and all (the rule of Drug history's
// "Move to Rx", by the physician's decision). Three things follow from it, and
// the box has to be honest about each:
//
//  • The medicine is compared as the app compares medicines everywhere else —
//    capitals, spacing, `Tab` for `Tablet.`, never the strength or the form.
//    The box's label is the medicine as last WRITTEN and the pad's may have
//    been picked from the list; compared letter for letter, `Tablet. Napa
//    500mg` went on beside `Tablet. Napa 500 mg`.
//  • The same medicine at ANOTHER dose is another line, and is added: which
//    dose is right is the doctor's judgement. It is kept by name (`repeated`),
//    and the box says which medicine is now on the prescription more than
//    once. (A line typed on the pad WITHOUT its dosage form — `Napa 500 mg` —
//    is not known to be the tablet: it is another medicine here, and nothing
//    is said of it. Whether it is the same one is not this module's to guess.)
//  • Only the FIRST line is compared, so a skipped medicine may stand on the
//    pad with other tapering lines than the box shows, or none. That is
//    counted too (`otherTaper`): "the same instruction" is not said of it.

const cell = (s: string | undefined): string => (s ?? "").trim();

// A medicine, strength and form included, however it is spaced or capitalised:
// the one comparison every surface that writes on the pad uses (lib/medicineKey.ts).
export { medicineKey };

const lineKey = (drug: string, dose: string, food: string, duration: string): string =>
  [medicineKey(drug), cell(dose), cell(food), cell(duration)].join("|");
const taperKey = (lines: BulkLine[]): string =>
  lines.map((l) => [cell(l.dose), cell(l.food), cell(l.duration)].join("|")).join("\n");

interface Pad {
  /** Every medicine that has a line of its own, at any dose. */
  medicines: Set<string>;
  /** Each first line, with the tapering lines found under it (one entry per time it stands there). */
  lines: Map<string, Set<string>>;
}

// The pad as blocks: each medicine with the tapering lines directly under it.
// A line is a taper by the pad's own test (`rowsFromRxItems`): marked `isCont`,
// or — on a line saved before that mark existed — no drug name. A note belongs
// to nothing and ends the block above it.
function readPad(existing: RxItem[]): Pad {
  const pad: Pad = { medicines: new Set(), lines: new Map() };
  let open: { key: string; taper: BulkLine[] } | null = null;
  const close = () => {
    if (!open) return;
    const tapers = pad.lines.get(open.key) ?? new Set<string>();
    tapers.add(taperKey(open.taper));
    pad.lines.set(open.key, tapers);
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
    if (!cell(it.drug)) return;
    pad.medicines.add(medicineKey(it.drug));
    open = { key: lineKey(it.drug, it.dose, it.instruction, it.duration), taper: [] };
  });
  close();
  return pad;
}

/** The medicines that stand on the pad at any dose: the box marks their rows. */
export const medicinesOnPad = (existing: RxItem[]): Set<string> => readPad(existing).medicines;

export interface BulkAdd {
  /** The lines to append to the pad, in the order the ticked medicines were given. */
  items: RxItem[];
  /** Medicines added — not lines. */
  added: number;
  /** Of those, the ones that were already on the pad with another instruction — by the label they were added under. */
  repeated: string[];
  /** Medicines whose first line was already on the pad: not added. */
  skipped: number;
  /** Of those, the ones standing on the pad with other tapering lines than the box shows. */
  otherTaper: number;
}

/** The lines the ticked medicines add to a pad that already holds `existing`. */
export function bulkToRxItems(picked: BulkMedicine[], existing: RxItem[]): BulkAdd {
  const pad = readPad(existing);
  const out: BulkAdd = { items: [], added: 0, repeated: [], skipped: 0, otherTaper: 0 };

  for (const m of picked ?? []) {
    const key = lineKey(m.drugLabel, m.dose, m.food, m.duration);
    const taper = taperKey(m.contLines);
    const there = pad.lines.get(key);
    if (there) {
      out.skipped++;
      if (!there.has(taper)) out.otherTaper++;
      continue;
    }
    const medicine = medicineKey(m.drugLabel);
    if (pad.medicines.has(medicine)) out.repeated.push(m.drugLabel);
    pad.medicines.add(medicine);
    pad.lines.set(key, new Set([taper]));
    // No `fromHabit`: that flag makes a save write `N of M ℞ lines inserted
    // from "Your usual"` to the activity feed, and these were not.
    out.items.push({
      drug: m.drugLabel,
      dose: m.dose,
      duration: m.duration,
      instruction: m.food,
      isCont: false,
      ...(m.generic ? { generic: m.generic } : {}),
    });
    for (const c of m.contLines) {
      out.items.push({ drug: "", dose: c.dose, duration: c.duration, instruction: c.food, isCont: true });
    }
    out.added++;
  }
  return out;
}

/** The line beside the + after an Add: honest about what did not go, and what now stands twice. */
export function bulkSummary({ added, repeated, skipped, otherTaper }: Omit<BulkAdd, "items">): string {
  const parts: string[] = [`${added} added`];
  if (repeated.length) {
    // Named, where a line can hold the names: the pad has scrolled to the
    // lines just added, and the line that was there before may be above its
    // edge. By the label on the pad, letter for letter — it is what the
    // doctor will look for.
    const which = added === 1 ? "it is"
      : repeated.length === 1 ? `“${repeated[0]}” is`
      : repeated.length === 2 ? `“${repeated[0]}” and “${repeated[1]}” are`
      : `${repeated.length} of them are`;
    parts.push(`${which} now on ℞ more than once`);
  }
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
