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
// before release).
//
// The rule every branch below serves: TWO MEDICINES THAT ARE DIFFERENT ARE
// NEVER DRAWN UNDER THE SAME NAME. What tells two bars apart is the brand and
// the strength — and, when the first word is not a dosage form at all, that
// word too. So a name that does not fit takes TWO lines (a bar's row has the
// height for them), and what gives way, in this order, is:
//   1. the dosage form — to a quiet line of its own above the brand and
//      strength when they fit the second line whole;
//   2. the END of the brand — when brand and strength are too long for one
//      line, the strength keeps the second line whole and the brand is cut
//      before it. Two strengths of "Amlodipine + Olmesartan" differ in their
//      last few characters, which is exactly what a cut at the end takes;
//   3. the strength only when it is too long for a line by itself.
// Anything that is not a medicine — a symptom, a test's name — wraps at a word
// and only its END is cut.
//
// ⚕️ What is "the dosage form"? `splitDrugLabel` reads everything up to the
// first full stop as one, which is right for bolding a printed name. For
// deciding what may be LEFT OFF it is three different things, each of them
// found the hard way, in review, before release:
//   • a form the app knows by name ("Tablet.", "inj") can be left off behind a
//     "…" when there is no room: every tablet shares it;
//   • a short first word it does NOT know ("Pot.", "Sod.", "Vit.") is part of
//     the name — left off, potassium chloride and sodium chloride were one
//     name — and stays in front of it;
//   • anything else before the full stop ("IV Infusion.", "Oral Saline.",
//     "Capsule (Enteric Coated).", a hand-typed "Napa tab.") reads as a form
//     and is laid out as one, but it is never LEFT OFF: it is shortened, and
//     shares the line with the brand. Treated as part of the name it took the
//     whole line, and "IV Infusion.…" stood over two different medicines.
//
// DISPLAY ONLY, and it only ever takes away: every line is a piece of the name
// as it was written, in the order it was written, and a "…" stands wherever
// something was left off. The bar's tooltip and the list under the chart still
// carry the name in full. Known limit: a strength too long for a line by itself
// ("5 mg + 160 mg + 12.5 mg" in thirteen characters) is cut at its end.

export interface NameLine {
  text: string;
  /** The dosage-form line: set smaller and paler than the name under it. */
  quiet?: boolean;
}

const cutEnd = (s: string, max: number) => (s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + "…" : s);

// The dosage-form words the app already knows (FORM_RE in lib/rxShorthand.ts —
// repeated here rather than exported from a module the printed sheet depends
// on). The WHOLE head has to be one of them.
const KNOWN_FORM =
  /^(?:tab|tablet|cap|capsule|syp|syr|syrup|inj|injection|susp|suspension|sol|solution|drop|drops|oint|ointment|cream|gel|lotion|spray|supp|suppository|inhaler|powder|sachet)$/i;

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

// A form that is not left off, on one line with the brand: the brand has the
// first claim on the room, and the form keeps at least its first few letters.
// `written` is the two exactly as they stand in the label — used whole when the
// form needs no shortening, so that not even a space is added to what was typed.
function formAndBrand(form: string, brand: string, written: string, max: number): string {
  const room = max - brand.length - 1;
  const shortForm = room >= form.length ? form : cutEnd(form, Math.max(4, room));
  return cutEnd(shortForm === form ? written : `${shortForm} ${brand}`, max);
}

/**
 * `name` over at most two lines of at most `max` characters.
 * `kind` "drug" lays a medicine's label out as above; "text" only wraps.
 */
export function nameLines(name: string, max: number, kind: "drug" | "text"): NameLine[] {
  const text = name.trim();
  if (!text) return [];
  if (text.length <= max) return [{ text }];
  if (kind !== "drug") return wrapTwo(text, max);

  const { before, name: brand, after } = splitDrugLabel(text);
  if (!brand) return wrapTwo(text, max);
  const strength = after.trim();
  const head = before.trim();
  const word = head.replace(/\.$/, "");
  const knownForm = KNOWN_FORM.test(word);
  const partOfName = head !== "" && !knownForm && /^\S{1,4}$/.test(word);

  if (head === "" || partOfName) {
    // The whole of it is the name.
    const plain = wrapTwo(text, max);
    const whole = !plain.some((l) => l.text.includes("…"));
    if (whole || !strength || strength.length > max) return plain;
    return [{ text: cutEnd((before + brand).trim(), max) }, { text: strength }];
  }

  const rest = (brand + after).trim();
  if (rest.length <= max) return [{ text: cutEnd(head, max), quiet: true }, { text: rest }];
  if (knownForm) {
    if (strength && strength.length <= max) return [{ text: cutEnd("…" + brand, max) }, { text: strength }];
    return wrapTwo("…" + rest, max);
  }
  // Reads as a form, but not one the app knows by name: shortened, never left off.
  if (strength && strength.length <= max) return [{ text: formAndBrand(head, brand, (before + brand).trim(), max) }, { text: strength }];
  return [{ text: cutEnd(head, max), quiet: true }, { text: cutEnd(rest, max) }];
}
