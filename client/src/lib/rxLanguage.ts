// ⚕️ The OPD ℞ pad's dose / food / duration in Bangla when BAN is on, and in
// English when EN is (physician's decision, 2026-10-14). The phrases are the
// physician's own table, word for word — `rxLanguage.test.ts` pins every one —
// and a number's digits. Anything else in a cell is returned exactly as it was
// written: free text is never guessed at.
//
// A decimal point stays a point. The 2026-09-23 rule "a number is never
// converted" existed because the phonetic engine turns `.` into the dari, and
// `0.5` printed as `০।৫` is not a dose anyone can read. Here only the digits
// change: `0.5` is `০.৫`.
//
// A cell is read into a language-free form and written out in the language
// asked for, so the two directions cannot disagree about what a phrase is.

import type { RxItem } from "@/types";

export type RxLang = "en" | "bn";

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toBnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
const toEnDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

const HAS_BANGLA = /[ঀ-৿]/;
const HAS_LATIN = /[A-Za-z0-9]/;

// Shared by reading and writing, so the two can never spell a word differently.
const MEAL_BN = "খাবারের";
const HOUR_BN = "ঘণ্টা";

type Fixed = "before" | "after" | "with" | "night" | "continue";
const FIXED_EN: Record<Fixed, string> = {
  before: "Before meal", after: "After meal", with: "With food", night: "at night", continue: "Continue",
};
const FIXED_BN: Record<Fixed, string> = {
  before: `${MEAL_BN} আগে`, after: `${MEAL_BN} পরে`, with: `${MEAL_BN} সাথে`, night: "রাতে", continue: "চলবে",
};

type When = "before" | "after" | "either";
const WHEN_EN: Record<When, string> = { before: "before meal", after: "after meal", either: "before or after meal" };
const WHEN_BN: Record<When, string> = { before: "আগে", after: "পরে", either: "আগে বা পরে" };

type Unit = "day" | "week" | "month";
// The English the pad's own shorthand writes (`parseDuration`): `7 days`, `2 week`, `2 month`.
const UNIT_EN: Record<Unit, string> = { day: "days", week: "week", month: "month" };
const UNIT_BN: Record<Unit, string> = { day: "দিন", week: "সপ্তাহ", month: "মাস" };

type Canon =
  | { k: "fixed"; v: Fixed }
  | { k: "hr"; when: When; n: string }
  | { k: "dur"; unit: Unit; n: string }
  | { k: "num"; text: string };

const N = "(\\d+(?:\\.\\d+)?)";
const HR_EN = new RegExp(`^${N} ?hrs? (before or after|before|after) meal$`);
const HR_BN = new RegExp(`^${MEAL_BN} ${N} ${HOUR_BN} (আগে বা পরে|আগে|পরে)$`);
const DUR_EN = new RegExp(`^${N} ?(days?|weeks?|months?)$`);
const DUR_BN = new RegExp(`^${N} ?(দিন|সপ্তাহ|মাস)$`);
// A dose written as counts: digits, `+`, `/`, `.` and spaces, nothing else.
const SCHEDULE = /^[\d.+/ ]+$/;

function read(raw: string): Canon | null {
  // Digits are read in either script, so a half-converted cell is understood.
  const t = toEnDigits(raw.trim());
  if (!t) return null;
  if (SCHEDULE.test(t) && /\d/.test(t)) return { k: "num", text: t };
  const s = t.replace(/\s+/g, " ");
  const low = s.toLowerCase();
  for (const v of Object.keys(FIXED_EN) as Fixed[]) {
    if (low === FIXED_EN[v].toLowerCase() || s === FIXED_BN[v]) return { k: "fixed", v };
  }
  let m = HR_EN.exec(low);
  if (m) return { k: "hr", n: m[1], when: m[2] === "before" ? "before" : m[2] === "after" ? "after" : "either" };
  m = HR_BN.exec(s);
  if (m) return { k: "hr", n: m[1], when: m[2] === "আগে" ? "before" : m[2] === "পরে" ? "after" : "either" };
  m = DUR_EN.exec(low);
  if (m) return { k: "dur", n: m[1], unit: m[2].startsWith("day") ? "day" : m[2].startsWith("week") ? "week" : "month" };
  m = DUR_BN.exec(s);
  if (m) return { k: "dur", n: m[1], unit: m[2] === "দিন" ? "day" : m[2] === "সপ্তাহ" ? "week" : "month" };
  return null;
}

function write(c: Canon, lang: RxLang): string {
  const bn = lang === "bn";
  const d = (n: string) => (bn ? toBnDigits(n) : n);
  if (c.k === "fixed") return bn ? FIXED_BN[c.v] : FIXED_EN[c.v];
  if (c.k === "hr") return bn ? `${MEAL_BN} ${d(c.n)} ${HOUR_BN} ${WHEN_BN[c.when]}` : `${c.n} hr ${WHEN_EN[c.when]}`;
  if (c.k === "dur") return `${d(c.n)} ${bn ? UNIT_BN[c.unit] : UNIT_EN[c.unit]}`;
  return d(c.text);
}

/**
 * One ℞ cell in `lang`. A cell already wholly in that language is returned
 * untouched — EN never rewrites English the doctor typed — and so is any text
 * the physician's table does not cover.
 */
export function rxCellIn(text: string, lang: RxLang): string {
  const s = text ?? "";
  if (lang === "en" ? !HAS_BANGLA.test(s) : !HAS_LATIN.test(s)) return s;
  const c = read(s);
  return c ? write(c, lang) : s;
}

/** The dose, food and duration of every medicine line in `lang`. The same list back when nothing changed. */
export function rxItemsIn(items: RxItem[], lang: RxLang): RxItem[] {
  let changed = false;
  const out = items.map((it) => {
    if (it.isNote) return it;
    const dose = rxCellIn(it.dose, lang);
    const instruction = rxCellIn(it.instruction, lang);
    const duration = rxCellIn(it.duration, lang);
    if (dose === it.dose && instruction === it.instruction && duration === it.duration) return it;
    changed = true;
    return { ...it, dose, instruction, duration };
  });
  return changed ? out : items;
}

interface Cells { dose: string; food: string; duration: string }

/** A "Your usual" line, and its tapering lines, in `lang`. */
export function habitIn<T extends Cells & { contLines?: Cells[] }>(habit: T, lang: RxLang): T {
  const cells = <C extends Cells>(c: C): C => ({
    ...c, dose: rxCellIn(c.dose, lang), food: rxCellIn(c.food, lang), duration: rxCellIn(c.duration, lang),
  });
  return { ...cells(habit), ...(habit.contLines ? { contLines: habit.contLines.map(cells) } : {}) };
}
