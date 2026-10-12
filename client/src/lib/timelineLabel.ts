import { splitDrugLabel } from "./rxShorthand";

// The name written beside a bar or a lane of the Health-trend chart, when the
// column it stands in is too narrow for the whole of it.
//
// ⚕️ It used to be one line cut at its end, on the reasoning that the START of
// a name is what says which medicine it is. In this app it is not: a medicine's
// label starts with its dosage form. On a phone the column holds 13 to 15
// characters (up to 20 on a narrow tablet), so "Tablet. Entaliv 0.5 mg" and
// "Tablet. Entaliv 1 mg" both read "Tablet. Enta…", and "Capsule (Enteric
// Coated). Sergel 40 mg" read "Capsule (Ente…" with the medicine itself gone —
// two bars under one name, and a dose change that could not be read off the
// timeline (found in review, before release).
//
// What the chart needs: TWO NAMES THAT ARE DIFFERENT ARE NOT DRAWN THE SAME.
// It takes two steps, because no rule for ONE name can promise it — two lines
// of thirteen letters do not hold every label, and whatever a rule leaves off,
// some pair of medicines differs in exactly that:
//   • `nameLines` lays ONE name out, keeping what most often tells two bars
//     apart: the brand and the strength;
//   • `namesApart` lays out the names of one CHART, and any that came out the
//     same are laid out again so that what they differ in is what is shown.
//
// One name that does not fit takes TWO lines (a bar's row has the height for
// them), and what gives way, in this order, is:
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
//     "…" when there is no room for it beside the brand: every tablet shares
//     it. (Where two bars differ in nothing else — a tablet and an injection
//     of one medicine — `namesApart` brings it back.)
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
// ("5 mg + 160 mg + 12.5 mg" in thirteen characters) is cut at its end — on a
// chart where another strength of it differs only in that end, `namesApart`
// shows the end instead.

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
    if (strength && strength.length <= max) {
      // Left off only when there is no room for it beside the brand: where
      // there is, the whole name fits the two lines.
      const written = (before + brand).trim();
      return [{ text: written.length <= max ? written : cutEnd("…" + brand, max) }, { text: strength }];
    }
    return wrapTwo("…" + rest, max);
  }
  // Reads as a form, but not one the app knows by name: shortened, never left off.
  if (strength && strength.length <= max) return [{ text: formAndBrand(head, brand, (before + brand).trim(), max) }, { text: strength }];
  return [{ text: cutEnd(head, max), quiet: true }, { text: cutEnd(rest, max) }];
}

/** One name on the chart, and what it is: a medicine's label, or any other text. */
export interface ChartName { name: string; kind: "drug" | "text" }

const shown = (lines: NameLine[]) => lines.map((l) => l.text).join("\n");

// A medicine with its form KEPT — shortened if it must be — on one line with
// the brand, and the strength under them. What tells a tablet from an
// injection of the same medicine and strength.
function formKept(text: string, max: number): NameLine[] | null {
  const { before, name: brand, after } = splitDrugLabel(text);
  const head = before.trim();
  const strength = after.trim();
  if (!brand || !head || !strength || strength.length > max) return null;
  return [{ text: formAndBrand(head, brand, (before + brand).trim(), max) }, { text: strength }];
}

// Two lines read from the place where a name stops being the same as the names
// it was taken for: what they share, cut at its end, and under it the word
// they part at — or the very letter, when that word runs on for longer than a
// line could show the difference in. `same` is how many letters they share.
// Null for a name that ENDS there: it has nothing to go on with, and keeps the
// lines it had.
function fromDifference(text: string, same: number, max: number): NameLine[] | null {
  const word = text.slice(0, same).search(/\S*$/);
  const start = same - word <= max - 3 ? word : same;
  if (start === 0) return wrapTwo(text, max);
  const rest = text.slice(start).trimStart();
  if (!rest) return null;
  return [{ text: cutEnd(text.slice(0, start).trimEnd(), max) }, { text: cutEnd((start === word ? "" : "…") + rest, max) }];
}

// More rounds than a real chart can need: each one either tells a group of
// names apart or moves on to a later letter of them.
const ROUNDS = 6;

/**
 * The names of ONE chart, each over at most two lines of at most `max`
 * characters, in the order given.
 *
 * Each is what `nameLines` writes for it alone — until two names that are
 * different come out the same. Those are laid out again, together:
 *   • medicines that differ in their dosage form get it back, shortened, with
 *     the strength still under it ("Tab… Ondanse…" / "Inj… Ondanse…");
 *   • anything else is read from the word the names part at, under what they
 *     share ("Tablet. Amlodi…" over "Atenolol 5 mg…" / "Losartan 5 mg…").
 * A name is written the same wherever it stands in the list, and a chart whose
 * names are already different is not touched.
 *
 * ⚕️ What is held (timelineLabel.test.ts): any TWO different names are written
 * differently, whatever they are; and so is every pair on a chart of names
 * built to be mistaken for one another. What is not promised: more than two
 * names that agree for longer than two lines can show, in different places —
 * after ROUNDS tries they are left as they are.
 */
export function namesApart(names: ChartName[], max: number): NameLine[][] {
  const texts = names.map((n) => n.name.trim());
  const lines = names.map((n) => nameLines(n.name, max, n.kind));
  for (let round = 0; round < ROUNDS; round++) {
    // Names written the same: grouped by what is shown, and only where the
    // group holds more than one NAME (the same name twice is one name).
    const byShown = new Map<string, number[]>();
    lines.forEach((l, i) => byShown.set(shown(l), [...(byShown.get(shown(l)) ?? []), i]));
    const groups = [...byShown.values()].filter((g) => new Set(g.map((i) => texts[i])).size > 1);
    if (groups.length === 0) break;
    for (const g of groups) {
      const kept = g.map((i) => (names[i].kind === "drug" ? formKept(texts[i], max) : null));
      const told = new Map<string, string>(); // what is shown → the name it stands for
      const apart = kept.every((l, k) => {
        if (!l) return false;
        const was = told.get(shown(l));
        told.set(shown(l), texts[g[k]]);
        return was === undefined || was === texts[g[k]];
      });
      if (apart) { g.forEach((i, k) => { lines[i] = kept[k] as NameLine[]; }); continue; }
      const first = texts[g[0]];
      let same = first.length;
      for (const i of g) {
        let n = 0;
        while (n < same && n < texts[i].length && texts[i][n] === first[n]) n++;
        same = n;
      }
      for (const i of g) lines[i] = fromDifference(texts[i], same, max) ?? lines[i];
    }
  }
  return lines;
}
