import { normaliseDrugKey, splitForm } from "@/lib/rxHabitKey";
import { rxCellIn } from "@/lib/rxLanguage";

// The dosage forms the key knows by their short words (`Tab`, `Cap`, `Inj`,
// `Syp`/`Syr`, `Susp`), written out.
const FORM_WORDS = "tablet|capsule|injection|syrup|suspension";

// The rule under `normaliseDrugKey`: the words before a label's FIRST full stop
// are its dosage form when they hold no digit and are four words or fewer.
const readsAsForm = (s: string): boolean => {
  const stop = s.indexOf(".");
  if (stop === -1) return false;
  const head = s.slice(0, stop).trim();
  return head !== "" && !/\d/.test(head) && head.split(" ").length <= 4;
};

/**
 * How a label was TYPED, set aside. It changes no letter, digit or unit of
 * what is written; it adds a 0, and adds or drops spaces and full stops:
 *  • a decimal written with no 0 in front of it — after a space, a plus, a
 *    stroke or a bracket (`.5 mg`, `+.5 mg`) — gets one, so that its point is
 *    not read as the full stop that ends a dosage form: `Tab Rivotril .5 mg`
 *    and `Tab Rivotril. 5 mg` came out as one medicine (review, before
 *    release). A point glued to a letter (`Rivotril.5 mg`) is not touched —
 *    `Tab.5-FU` is a form and a name — and is still read as a form's;
 *  • no space round a plus or a stroke (`20 mg + 50 mg`, `1 gm / 100 ml`),
 *    after a number (`100 units`, `2 %`), or inside a bracket, and one before
 *    it (`Capsule(Enteric Coated).`);
 *  • a full stop at the very end of the label is dropped;
 *  • the form written out with no full stop after it (`Tablet Napa`) is read
 *    as that form, as `Tab Napa` is — only where the label would not already
 *    be read as having a form: `Capsule (Enteric Coated). Sergel` has its full
 *    stop, after its qualifier, and given another one it no longer matched
 *    `Cap (enteric coated). Sergel` (review, before release).
 */
function asTyped(label: string): string {
  const s = (label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s+/(])\.(\d)/g, "$10.$2")
    .replace(/\s*([+/])\s*/g, "$1")
    .replace(/(\d)\s+(?=[a-z%µ])/gi, "$1")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s+\)/g, ")")
    .trim()
    .replace(/\.$/, "");
  return readsAsForm(s) ? s : s.replace(new RegExp(`^(${FORM_WORDS}) `, "i"), "$1. ");
}

/**
 * A medicine as the app tells two medicines apart: its dosage form, its name
 * and its strength — however the label is spaced or capitalised (`asTyped`
 * above), and with `Tab` read as `Tablet.`. Under it is `normaliseDrugKey`,
 * the key "Your usual" is kept under, which never sets aside a strength, a
 * form or a form's qualifier. A label that key reads as nothing at all is
 * compared without its capitals and outer spaces.
 *
 * ⚕️ Under the ONE answer to "is this medicine on the pad already?"
 * (`sameMedicine`, `MedicineMap`), for the two places that ask it before they
 * write: the "Add Bulk Medicine" box and Drug history's "Move to Rx". (The
 * pad itself, "Your usual" and a saved template write without asking.) With
 * two answers a line was written twice from one screen and once from the
 * other — "Move to Rx" compared the label letter for letter, and `Tablet.
 * Napa 500mg` went on beside `Tablet. Napa 500 mg` at the same dose.
 *
 * What it does NOT take for one medicine: a unit written another way
 * (`1 gm`, `1 g`) is not converted; a decimal glued to a letter (above). And
 * what it DOES take for one that a reader might not: capitals are set aside,
 * so `3 MIU` and `3 mIU` (mega and milli) are one key — no such pair is known
 * in a medicine list here.
 *
 * A KEY is not the whole answer: a label typed with no dosage form
 * (`Napa 500 mg`) has a key of its own, and is the same medicine as the
 * tablet only by `sameMedicine` below. Ask that, or a `MedicineMap`.
 */
export const medicineKey = (drugLabel: string): string => {
  const typed = asTyped(drugLabel);
  return normaliseDrugKey(typed) || typed.toLowerCase() || (drugLabel ?? "").trim().toLowerCase();
};

/** A medicine's key in two parts: its dosage form (blank when the label has none) and the rest — its name and strength. */
interface MedicineParts { form: string; rest: string }

// The key is split where `normaliseDrugKey` joined it: a form is everything up
// to the key's first full stop, when that holds no digit and is four words or
// fewer — the rule it was found by, so a key splits as it was built.
function partsOf(drugLabel: string): MedicineParts {
  const key = medicineKey(drugLabel);
  const stop = key.indexOf(".");
  if (stop !== -1) {
    const head = key.slice(0, stop).trim();
    if (head !== "" && !/\d/.test(head) && head.split(" ").length <= 4) {
      return { form: key.slice(0, stop + 1), rest: key.slice(stop + 1).trim() };
    }
  }
  return { form: "", rest: key };
}

const formsMeet = (a: string, b: string): boolean => a === b || a === "" || b === "";

/**
 * ⚕️ Are these two labels one medicine? The same key; or — where ONE of them
 * was typed without its dosage form (`Napa 500 mg`) — the same name and
 * strength (physician's decision, 2026-10-14). The strength is never set
 * aside: `Sergel 20 mg` is not `Capsule (Enteric Coated). Sergel 40 mg`. And
 * two forms are never one medicine, not even through a label that has none:
 * `Napa 500 mg` is the tablet and is the suppository, and the tablet is not
 * the suppository — which is why this is a question asked of two labels, not
 * a key. A blank is no medicine.
 */
export function sameMedicine(a: string, b: string): boolean {
  const pa = partsOf(a);
  const pb = partsOf(b);
  if (pa.rest === "" || pb.rest === "") return false;
  return pa.rest === pb.rest && formsMeet(pa.form, pb.form);
}

/**
 * Many medicines — or many lines of medicines — asked `sameMedicine`'s
 * question at once: what is held under the same medicine as this label (and,
 * for a line, the same `extra`: its dose, food and duration). In the order
 * they were added. A blank medicine is not held.
 */
export class MedicineMap<V> {
  private byRest = new Map<string, { form: string; value: V }[]>();
  private count = 0;

  private slot(rest: string, extra: string): string {
    return `${rest}\u0000${extra}`;
  }

  add(drugLabel: string, value: V, extra = ""): void {
    const { form, rest } = partsOf(drugLabel);
    if (rest === "") return;
    const at = this.slot(rest, extra);
    const held = this.byRest.get(at) ?? [];
    held.push({ form, value });
    this.byRest.set(at, held);
    this.count++;
  }

  get(drugLabel: string, extra = ""): V[] {
    const { form, rest } = partsOf(drugLabel);
    if (rest === "") return [];
    return (this.byRest.get(this.slot(rest, extra)) ?? []).filter((h) => formsMeet(h.form, form)).map((h) => h.value);
  }

  has(drugLabel: string, extra = ""): boolean {
    return this.get(drugLabel, extra).length > 0;
  }

  /** How many were added. */
  get size(): number {
    return this.count;
  }
}

/**
 * What the medicine chart is asked for to find a label's medicine: the first
 * word of its brand (`Tablet. Napa 500 mg` → `napa`), as the server's lookup
 * takes it (`server/src/medicines/catalogue.ts`). Taken twice — from the label
 * as written and with how it was typed set aside — because each finds a brand
 * the other misses: `Tablet Napa`, with no full stop, is `napa` only once its
 * form is read, and `3 G Cef` is `3` only as written (set aside, it is `3g`).
 * And the word after the label's first full stop is asked for as well: a form
 * of five words (`Dry Powder Inhalation Capsule (DPI).`) is not read as one,
 * and its brand was never asked for (review, before release).
 * Only a way to fetch candidates: which of them IS the medicine is
 * `sameMedicine`'s question.
 */
export function brandWordsOf(drugLabel: string): string[] {
  const words = new Set<string>();
  for (const label of [drugLabel ?? "", asTyped(drugLabel)]) {
    const s = label.replace(/\s+/g, " ").trim().toLowerCase();
    const word = splitForm(s).rest.split(" ").filter(Boolean)[0];
    if (word) words.add(word);
    const stop = s.indexOf(". ");
    const after = stop > 0 ? s.slice(stop + 2).split(" ").filter(Boolean)[0] : undefined;
    if (after) words.add(after);
  }
  return [...words];
}

/**
 * ⚕️ A dose, a food instruction or a duration, with how it was TYPED set
 * aside — capitals and spaces, and nothing else (physician's decision,
 * 2026-10-14): `1 + 0 + 1` is `1+0+1`, `After meal` is `after meal`, `5 days`
 * is `5days`. No space round a plus or a stroke, none between a number and
 * the word after it, one before a bracket and none inside it. A different
 * NOTATION is not set aside: `1-0-1`, `101`, `0.5` for `1/2`, a full stop at
 * the end — what those mean is the doctor's to say, not this function's. The
 * same caution as the medicine's: `3 MIU` and `3 mIU` are one.
 */
export function instructionKey(cell: string): string {
  // BAN writes these cells in Bangla (2026-10-14): a cell with Bangla in it is
  // read as its English first, so `খাবারের আগে` is `Before meal`. An English
  // cell passes through untouched — what is set aside for it is unchanged.
  return rxCellIn(cell ?? "", "en")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*([+/])\s*/g, "$1")
    .replace(/(\d)\s+(?=[a-z%µ\u0980-\u09ff])/gi, "$1")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s+\)/g, ")")
    .trim()
    .toLowerCase();
}

/** A line's dose, food and duration, as `instructionKey` reads each — what a `MedicineMap` of lines holds beside the medicine. */
export const instructionsKey = (dose: string, food: string, duration: string): string =>
  [instructionKey(dose), instructionKey(food), instructionKey(duration)].join("\u0000");
