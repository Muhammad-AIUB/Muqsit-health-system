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
//   • a brand + strength too long for one line takes both lines, and the form
//     is left off with a mark (…) where it stood;
//   • anything else — a symptom, a test's name, a medicine typed by hand with
//     no form to set aside — wraps at a word, and only its END is cut.
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
  if (kind === "drug") {
    const { before, name: brand, after } = splitDrugLabel(text);
    const form = before.trim();
    const rest = (brand + after).trim();
    if (form && brand) {
      if (rest.length <= max) return [{ text: cutEnd(form, max), quiet: true }, { text: rest }];
      return wrapTwo("…" + rest, max);
    }
  }
  return wrapTwo(text, max);
}
