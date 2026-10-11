import { splitDrugLabel } from "./rxShorthand";

// The name written beside a bar or a lane of the Health-trend chart, when the
// column it stands in is too narrow for the whole of it.
//
// ⚕️ It used to be one line cut at its end, on the reasoning that the START of
// a name is what says which medicine it is. In this app it is not: a medicine's
// label starts with its dosage form. On a phone the column holds 12 to 15
// characters, so "Tablet. Entaliv 0.5 mg" and "Tablet. Entaliv 1 mg" both read
// "Tablet. Enta…", and "Capsule (Enteric Coated). Sergel 40 mg" read
// "Capsule (Ente…" with the medicine itself gone — two bars under one name, and
// a dose change that could not be read off the timeline (found in review,
// before release). What tells two bars apart is the brand and the strength.
//
// So a name that does not fit is set on TWO lines (a bar's row has the height
// for them), and it is the dosage form that gives way:
//   • form above, quiet; brand + strength below, whole — whenever they fit;
//   • a brand + strength too long for one line: the form is left off with a
//     mark (…) where it stood, the brand takes the first line — cut at its end
//     if it must be — and the STRENGTH keeps the second, whole. Two strengths
//     of "Amlodipine + Olmesartan" differ in their last few characters, which
//     is exactly what a cut at the end would take;
//   • anything else — a symptom, a test's name — wraps at a word, and only its
//     END is cut.
//
// ⚕️ Only a KNOWN dosage form is set aside. `splitDrugLabel` reads any short
// word with a full stop after it as a form — right for bolding a printed name,
// wrong for deciding what may be left off: "Pot. chloride 600 mg SR" and
// "Sod. chloride 600 mg tab" both came out "…chloride 600" (caught in the
// second review, before release). A first word that is not a dosage form is
// part of the name and stays in front of it.
//
// DISPLAY ONLY, and it only ever takes away: every line is a piece of the name
// as it was written, in the order it was written, and a "…" stands wherever
// something was left off. The bar's tooltip and the list under the chart still
// carry the name in full.

export interface NameLine {
  text: string;
  /** The dosage-form line: set smaller and paler than the name under it. */
  quiet?: boolean;
}

const cutEnd = (s: string, max: number) => (s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + "…" : s);

// The dosage-form words the app already knows (FORM_RE in lib/rxShorthand.ts —
// repeated here rather than exported from a module the printed sheet depends
// on). Anywhere in the head, so "SC Injection." and "Capsule (Enteric Coated)."
// count; a head with none of them ("Pot.", "IV Infusion.") is simply not set
// aside, and wraps with the rest of the name.
const FORM_WORD =
  /\b(?:tab|tablet|cap|capsule|syp|syr|syrup|inj|injection|susp|suspension|sol|solution|drop|drops|oint|ointment|cream|gel|lotion|spray|supp|suppository|inhaler|powder|sachet)\b/i;

// Whole words on the first line; whatever is left on the second, cut at its end.
function wrapTwo(text: string, max: number): NameLine[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  let first = cutEnd(words[0], max); // a first word too long for the line is cut where it stands
  let i = 1;
  if (first === words[0]) {
    while (i < words.length && first.length + 1 + words[i].length <= max) first += " " + words[i++];
  }
  const rest = words.slice(i).join(" ");
  return rest ? [{ text: first }, { text: cutEnd(rest, max) }] : [{ text: first }];
}

/**
 * `name` over at most two lines of at most `max` characters.
 * `kind` "drug" sets a dosage form aside (`splitDrugLabel`); "text" never does.
 */
export function nameLines(name: string, max: number, kind: "drug" | "text"): NameLine[] {
  const text = name.trim();
  if (!text) return [];
  if (text.length <= max) return [{ text }];
  if (kind !== "drug") return wrapTwo(text, max);

  const { before, name: brand, after } = splitDrugLabel(text);
  if (!brand) return wrapTwo(text, max);
  const strength = after.trim();
  const form = before.trim();
  const setAside = form !== "" && FORM_WORD.test(form);
  if (setAside) {
    const rest = (brand + after).trim();
    if (rest.length <= max) return [{ text: cutEnd(form, max), quiet: true }, { text: rest }];
    if (strength && strength.length <= max) return [{ text: cutEnd("…" + brand, max) }, { text: strength }];
    return wrapTwo("…" + rest, max);
  }
  // No dosage form to set aside: the whole of it is the name.
  const plain = wrapTwo(text, max);
  const whole = !plain.some((l) => l.text.includes("…"));
  if (whole || !strength || strength.length > max) return plain;
  return [{ text: cutEnd((before + brand).trim(), max) }, { text: strength }];
}
