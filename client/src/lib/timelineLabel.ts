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
//     same are laid out again so that what they differ in is what is shown —
//     and a strength that is longer than a line is cut there by the OTHER
//     strengths of its medicine on the chart, so that a dose change can be
//     read off two names that were different anyway.
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
// something was left off. (The one thing it puts in is a space, between a mark
// and a decimal point straight after it — see `pointFirst`.) The bar's tooltip
// and the list under the chart still carry the name in full. Known limit: a
// strength too long for a line by itself ("5 mg + 160 mg + 12.5 mg" in thirteen
// characters) is cut at its end, between its parts — and on a chart where
// another strength of it differs in a part the cut has hidden, `namesApart`
// brings that part into view, whole.

export interface NameLine {
  text: string;
  /** The dosage-form line: set smaller and paler than the name under it. */
  quiet?: boolean;
}

// ── A number, and what it is a number of ───────────────────────────────────
//
// ⚕️ "12.5 mg", "500mg", "10%", "200 IU", "30/70", "12 weeks": a number, with
// the short word after it that says what it is a number OF. A "…" never stands
// inside one. Cut wherever the line ran out, "12.5 mg + 500 mg" was shown as
// "12.5 mg + 50…" and a 12.5 as "12.…"; and with the word a strength parts at
// looked for between SPACES, a strength written as a label from the medicines
// table is — "10 mg+160 mg+25 mg", no space round the plus — was shown as
// "10…mg+25 mg": the unit beside the 10 was the hidden 160's (sixth review,
// before release). So a cut backs off to where the amount begins, and the
// word two names part at begins there too.
//
// What is held, from the number outwards:
//   • a NUMBER is never shown in part — wherever it stands, also glued to a
//     word ("B12", "Ciprofloxacin500mg");
//   • no mark stands between a number and its unit, and what follows a mark
//     never begins inside an amount: a unit is not shown without its number,
//     nor beside another's;
//   • an amount too long for a line to hold between two marks (eleven
//     characters in a line of thirteen: "1,200,000 IU" is twelve) keeps its
//     NUMBER whole and may lose its unit behind the mark; a run of numbers
//     that long ("150/75/400/275") is cut at one of its strokes; and a single
//     number that long is cut where it stands, as a long word is — no line
//     could hold it.
// A number glued to a word is still part of that WORD where two names are told
// apart ("HbA2" beside "HbA", "FT3" beside "FT4"), and a ratio may be cut at
// its stroke ("100 mcg/…").
//
// Written without `\p{…}` classes and `matchAll`: either would have been the
// first in this app, and a browser that lacks one cannot load the page that
// holds it at all (Firefox before 78). The digits and letters known are the
// Latin and the Bangla ones.
const DIGITS = "0-9\\u09E6-\\u09EF";
const LETTERS = "A-Za-z\\u00B5\\u03BC\\u0980-\\u09E5\\u09F0-\\u09FF";
const UNIT = `(?:\\s*(?:[${LETTERS}]{1,5}(?![${LETTERS}])|%))?`;
const ONE_NUMBER = `[${DIGITS}]+(?:[.,][${DIGITS}]+)*`;
// A number, or a run of them joined by a stroke or a hyphen (30/70, 5-10), and its unit.
const AMOUNT = new RegExp(`(${ONE_NUMBER}(?:[/\\-\\u2013]${ONE_NUMBER})*)${UNIT}`, "g");
const PLAIN_AMOUNT = new RegExp(`(${ONE_NUMBER})${UNIT}`, "g");
const LETTER = new RegExp(`[${LETTERS}]`);
const LETTER_OR_DIGIT = new RegExp(`[${LETTERS}${DIGITS}]`);

/** `a`…`b` in the text; its number ends at `n`. */
interface Amount {
  a: number; n: number; b: number;
  /** Glued to the letters before it ("B12"): cut like any amount, but part of its word. */
  inWord: boolean;
  /** Too long to keep whole: a mark may stand at `n`, after the number. */
  loose: boolean;
}
function amountsIn(text: string, max: number): Amount[] {
  const out: Amount[] = [];
  const read = (pattern: RegExp, from: number, to: number, split: boolean) => {
    pattern.lastIndex = from;
    for (let m = pattern.exec(text); m && m.index < to; m = pattern.exec(text)) {
      let a = m.index;
      const n = a + m[1].length;
      const b = a + m[0].length;
      const inWord = a > 0 && LETTER.test(text[a - 1]);
      if (text[a - 1] === "." && !(a > 1 && LETTER_OR_DIGIT.test(text[a - 2]))) a -= 1; // ".5 mg" is half a milligram
      const limit = max - 2 - (text[a] === "." ? 1 : 0);
      if (n - a <= limit) out.push({ a, n, b, inWord, loose: b - a > limit });
      // A run too long for a line is read again as the numbers it is made of.
      else if (split) { read(PLAIN_AMOUNT, m.index, b, false); pattern.lastIndex = b; }
    }
  };
  read(AMOUNT, 0, text.length, true);
  return out;
}
// May what is shown END at `p` — a place between two letters? Not inside an
// amount; except after the number of one too long to keep whole.
const endsInside = (amounts: Amount[], p: number) => amounts.some(({ a, n, b, loose }) => a < p && p < b && !(loose && p === n));
// May what is shown BEGIN at `p`, or a line turn there? Never inside an amount.
const startsInside = (amounts: Amount[], p: number) => amounts.find(({ a, b }) => a < p && p < b);

// `s` cut at its end to fit `room`, with a mark — never inside an amount.
// (`max` is the line's width, which decides how long an amount can be kept
// whole; it is the room itself unless the line holds something else too.)
function cutEnd(s: string, room: number, max = room): string {
  if (s.length <= room) return s;
  const amounts = amountsIn(s, max);
  let p = Math.max(1, room - 1);
  while (p > 0 && endsInside(amounts, p)) p--; // (to nothing but the mark, where the room is less than its first amount)
  return s.slice(0, p).trimEnd() + "…";
}

// The dosage-form words the app already knows (FORM_RE in lib/rxShorthand.ts —
// repeated here rather than exported from a module the printed sheet depends
// on). The WHOLE head has to be one of them.
const KNOWN_FORM =
  /^(?:tab|tablet|cap|capsule|syp|syr|syrup|inj|injection|susp|suspension|sol|solution|drop|drops|oint|ointment|cream|gel|lotion|spray|supp|suppository|inhaler|powder|sachet)$/i;

// Whole words on the first line; whatever is left on the second, cut at its end.
//
// ⚕️ The line does not turn between a number and its unit where the name can
// be shown as well with the turn before them ("Calbo-D" over "500 mg+200 IU",
// not "Calbo-D 500" over "mg+200 IU"). Where the rest of the name only fits
// with the turn there, it is shown so — nothing after the turn is left off, so
// the number and its unit are both there to be read. And where something has
// to be left off after it, the turn is never there: "…Exforge HCT 5" over
// "mg+160 mg+12.…" is how a 5 lost its unit.
function wrapTwo(text: string, max: number): NameLine[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const joined = words.join(" ");
  const amounts = amountsIn(joined, max);
  const head = cutEnd(words[0], max); // a first word too long for the line is cut where it stands
  if (head !== words[0]) {
    // What follows it takes the second line — from the END of an amount whose
    // number the cut has hidden: its unit would stand there by itself.
    const hidden = startsInside(amounts, words[0].length + 1);
    const rest = hidden ? joined.slice(hidden.b).trimStart() : words.slice(1).join(" ");
    return rest ? [{ text: head }, { text: cutEnd(hidden ? (pointFirst(rest) ? "… " : "…") + rest : rest, max) }] : [{ text: head }];
  }
  let i = 1;
  for (let len = words[0].length; i < words.length && len + 1 + words[i].length <= max; i++) len += 1 + words[i].length;
  const turnAfter = (n: number) => ({ first: words.slice(0, n).join(" "), rest: words.slice(n).join(" ") });
  const turn = turnAfter(i);
  if (!turn.rest) return [{ text: turn.first }];
  const clean = (n: number) => !startsInside(amounts, turnAfter(n).first.length);
  if (clean(i)) return [{ text: turn.first }, { text: cutEnd(turn.rest, max) }];
  let j = i - 1;
  while (j >= 1 && !clean(j)) j--;
  const earlier = j >= 1 ? turnAfter(j) : null;
  if (earlier && earlier.rest.length <= max) return [{ text: earlier.first }, { text: earlier.rest }];
  if (turn.rest.length <= max) return [{ text: turn.first }, { text: turn.rest }];
  // No turn that is not inside an amount (a name that BEGINS with a run of
  // them): one line, cut where an amount ends.
  return earlier ? [{ text: earlier.first }, { text: cutEnd(earlier.rest, max) }] : [{ text: cutEnd(joined, max) }];
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

// A medicine's label in its three parts — or with no brand, when it cannot be
// read as one.
//
// ⚕️ `splitDrugLabel` takes everything up to the first full stop as the form.
// In "Tab Rivotril .5 mg" the first full stop is the decimal point: the "form"
// was "Tab Rivotril ." and the name under it "5 mg" — half a milligram shown
// as five, its point left on the line above, behind the mark when that line
// was cut (found by the property that no mark stands inside an amount, sixth
// review). A full stop with a digit straight after it ends no form.
//
// And it looks for the strength at the first word that begins with a DIGIT, so
// ".5 mg" was no strength at all: the brand was "Rivotril .5 mg", and where
// that did not fit a line the strength was left off whole. A word that begins
// with a decimal point begins the strength too — also where that point is the
// label's first full stop, the one misread above: everything in front of the
// word is then the name ("Tab Clonazepam" over ".5 mg"; with no brand and no
// strength found, "Tab" stood over "Clonazepam…" — eighth review).
const DIGIT_FIRST = new RegExp(`^[${DIGITS}]`);
const POINT_WORD = new RegExp(`\\s(?=\\.[${DIGITS}])`);
function labelParts(text: string): { before: string; name: string; after: string } {
  const parts = splitDrugLabel(text);
  if (parts.before.endsWith(".") && DIGIT_FIRST.test(parts.name)) {
    const point = POINT_WORD.exec(text);
    return point ? { before: "", name: text.slice(0, point.index), after: text.slice(point.index) } : { before: text, name: "", after: "" };
  }
  const point = parts.after ? null : POINT_WORD.exec(parts.name);
  if (point && point.index > 0) return { before: parts.before, name: parts.name.slice(0, point.index), after: parts.name.slice(point.index) };
  return parts;
}

/**
 * `name` over at most two lines of at most `max` characters.
 * `kind` "drug" lays a medicine's label out as above; "text" only wraps.
 */
export function nameLines(name: string, max: number, kind: "drug" | "text"): NameLine[] {
  return layOut(name, max, kind, []);
}

// One name — and, for a medicine, the OTHER strengths of it on the same chart
// (`others`; none for a name laid out by itself). They change one thing: where
// the strength is longer than a line and something of the name has to be left
// off, the strength has the second line to ITSELF — cut so that what it
// differs in from those others stays in sight (`strengthFor`) — and the brand
// gives way on the line above it. By itself a name keeps as much of its brand
// as two lines hold, and the strength is what is cut, or left off whole
// ("…Amlodipine +" over "Olmesartan…"): right for telling two medicines
// apart, and no use for telling 12.5 from 25. Where the name fits its two
// lines, nothing changes.
function layOut(name: string, max: number, kind: "drug" | "text", others: string[]): NameLine[] {
  const text = name.trim();
  if (!text) return [];
  if (text.length <= max) return [{ text }];
  if (kind !== "drug") return wrapTwo(text, max);

  const { before, name: brand, after } = labelParts(text);
  if (!brand) return wrapTwo(text, max);
  const strength = after.trim();
  const head = before.trim();
  const word = head.replace(/\.$/, "");
  const knownForm = KNOWN_FORM.test(word);
  const partOfName = head !== "" && !knownForm && /^\S{1,4}$/.test(word);
  // The strength as a line of its own shows it: whole where it fits, otherwise
  // cut — at its end, or by what it has to be told from.
  const told = strengthFor(strength, others, max, max);

  if (head === "" || partOfName) {
    // The whole of it is the name.
    const plain = wrapTwo(text, max);
    const whole = !plain.some((l) => l.text.includes("…"));
    if (whole || !strength || (strength.length > max && others.length === 0)) return plain;
    return [{ text: cutEnd((before + brand).trim(), max) }, { text: told }];
  }

  const rest = (brand + after).trim();
  if (rest.length <= max) return [{ text: cutEnd(head, max), quiet: true }, { text: rest }];
  if (knownForm) {
    // Left off only when there is no room for it beside the brand: where
    // there is, the whole name fits the two lines.
    const written = (before + brand).trim();
    const formAndName = { text: written.length <= max ? written : cutEnd("…" + brand, max) };
    if (strength && strength.length <= max) return [formAndName, { text: strength }];
    const wrapped = wrapTwo((pointFirst(rest) ? "… " : "…") + rest, max);
    // (A line that ENDS in a mark: something besides the form was left off.)
    return strength && others.length > 0 && wrapped.some((l) => l.text.endsWith("…")) ? [formAndName, { text: told }] : wrapped;
  }
  // Reads as a form, but not one the app knows by name: shortened, never left
  // off — and the strength has the line under it, cut if it must be. (With
  // the form above and the rest under it, a strength too long for a line was
  // not shown at all: "Capsule (Ent…" over "Edeloss…".)
  if (strength) return [{ text: formAndBrand(head, brand, (before + brand).trim(), max) }, { text: told }];
  return [{ text: cutEnd(head, max), quiet: true }, { text: cutEnd(rest, max) }];
}

// The medicine a label is OF, whatever its form — what two labels have to
// share for the strength of one to be told from the strength of the other. Its
// brand; with a short first word that is part of the name in front of it
// ("Pot. chloride" is not "Sod. chloride"); and without a form word written
// with no full stop after it, which the split reads as the start of the brand
// ("Tablet Edeloss" is Edeloss).
function medicineOf({ before, name }: { before: string; name: string }): string {
  const head = before.trim();
  if (head) {
    const word = head.replace(/\.$/, "");
    return !KNOWN_FORM.test(word) && /^\S{1,4}$/.test(word) ? `${head} ${name}` : name;
  }
  const first = /^(\S+)\s+(?=\S)/.exec(name);
  return first && KNOWN_FORM.test(first[1]) ? name.slice(first[0].length) : name;
}

/** One name on the chart, and what it is: a medicine's label, or any other text. */
export interface ChartName { name: string; kind: "drug" | "text" }

const shown = (lines: NameLine[]) => lines.map((l) => l.text).join("\n");

// ── Four ways of writing a name again, so that the place where it differs
//    from the names it was taken for is in sight. Each gives null for a name it
//    has nothing to offer (that name keeps the lines it has).

// A part that begins with a decimal point, set straight after a mark, is four
// dots in a row — "….5 mg" — and the point is lost among them: half a
// milligram read as five. A space sets it apart: "… .5 mg".
const POINT_FIRST = new RegExp(`^\\.[${DIGITS}]`);
const pointFirst = (s: string) => POINT_FIRST.test(s);

// A strength in the parts a combination is written in: "10 mg", "160 mg", "25 mg".
interface Part { text: string; start: number; end: number }
function plusParts(strength: string): Part[] {
  const out: Part[] = [];
  let from = 0;
  for (const piece of strength.split("+")) {
    const text = piece.trim();
    const start = from + (piece.length - piece.trimStart().length);
    if (text) out.push({ text, start, end: start + text.length });
    from += piece.length + 1;
  }
  return out;
}

// A medicine's strength in `room` letters of a line. Whole when it fits. When
// it does not, what is kept is what tells it from the OTHER strengths of the
// same medicine on the chart: the two are compared part by part, and a part
// they differ in is not the one left off — "10 mg…25 mg" beside "10 mg…12.5
// mg", "…500 mg" beside "…1000 mg". With no other strength to be told from,
// or where the parts that differ are in sight anyway, it is cut at its end.
//
// ⚕️ Cut at its end whatever the chart held, a tablet and an injection of one
// medicine in two strengths were left with one pair under one name, and — the
// form brought back over the cut strength — a dose change was shown as
// "10 mg+160 mg+…" twice (seventh review, before release). And for one round
// it was asked only of names that had come out the SAME as another: two
// labels that differed in how their form was written still read
// "10 mg+160 mg+…" for 12.5 and for 25 (eighth review; `layOut`).
function strengthFor(strength: string, others: string[], room: number, max: number): string {
  if (strength.length <= room) return strength;
  const cut = cutEnd(strength, room, max);
  const parts = plusParts(strength);
  const theirs = others.map(plusParts);
  // The parts another strength has differently.
  const wanted = parts.flatMap((p, k) => (theirs.some((t) => (t[k]?.text ?? "") !== p.text) ? [k] : []));
  if (wanted.length === 0) return cut;
  const cutShows = (k: number) => parts[k].end <= cut.length - 1;
  const last = parts.length - 1;
  const write = (keep: number[]) => {
    let s = keep[0] > 0 ? "…" : "";
    keep.forEach((k, i) => {
      if (i > 0) s += k === keep[i - 1] + 1 ? strength.slice(parts[keep[i - 1]].end, parts[k].start) : "…";
      s += s.endsWith("…") && pointFirst(parts[k].text) ? " " + parts[k].text : parts[k].text;
    });
    return keep[keep.length - 1] < last ? s + "…" : s;
  };
  const from = (k: number) => parts.slice(k).map((_, i) => k + i);
  // How many of the other strengths a way of cutting it is told from — one is,
  // when a part it has differently is in sight — and then how many of the
  // parts that differ it shows.
  //
  // ⚕️ Counted by parts alone, a THIRD strength on the chart that differed in
  // every part made every part count: the cut at the end, with two of three
  // in sight, stood level with the first part and the last, and 12.5 and 25
  // both read "10 mg+160 mg…" again (seen in a browser, eighth review).
  const worth = (inSight: (k: number) => boolean) => ({
    told: theirs.filter((t) => parts.some((p, k) => inSight(k) && (t[k]?.text ?? "") !== p.text)).length,
    shown: wanted.filter(inSight).length,
  });
  // Besides its end cut: its first part and its last; all from the first part
  // that differs; that part alone; and then the same from each later part that
  // differs — the part that tells it from the most of the others need not be
  // the first. The first of them that is worth more than the one before it was.
  const ways = [[0, last], from(wanted[0]), [wanted[0]], ...wanted.slice(1).flatMap((k) => [from(k), [k]])];
  let best = cut;
  let bestWorth = worth(cutShows);
  for (const way of ways) {
    const keep = way.filter((k, i) => way.indexOf(k) === i);
    const written = write(keep);
    if (written.length > room) continue;
    const w = worth((k) => keep.includes(k));
    if (w.told > bestWorth.told || (w.told === bestWorth.told && w.shown > bestWorth.shown)) { best = written; bestWorth = w; }
  }
  return best;
}

// 1. A medicine with its form KEPT — shortened if it must be — on one line with
// the brand, and the strength under them. What tells a tablet from an
// injection of the same medicine and strength.
function formKept(text: string, others: string[], max: number): NameLine[] | null {
  const { before, name: brand, after } = labelParts(text);
  const head = before.trim();
  const strength = after.trim();
  if (!brand || !head || !strength) return null;
  return [{ text: formAndBrand(head, brand, (before + brand).trim(), max) }, { text: strengthFor(strength, others, max, max) }];
}

// 2. A medicine with its form on a line of its OWN, cut at its end, and under
// it the brand with the strength: whole where they fit, otherwise the start of
// the brand, a mark, and the strength. What tells "Tablet (Delayed Release)."
// from "Tablet (Extended Release).", two forms that BEGIN alike: shortened to
// make room for the brand, both were "Tab…". (The form's line is not the quiet
// one here: it is what tells the two bars apart.)
function formAbove(text: string, others: string[], max: number): NameLine[] | null {
  const { before, name: brand, after } = labelParts(text);
  const head = before.trim();
  const strength = after.trim();
  if (!brand || !head) return null;
  const rest = (brand + after).trim();
  const form: NameLine = { text: cutEnd(head, max) };
  if (rest.length <= max || !strength) return [form, { text: cutEnd(rest, max) }];
  // The strength has the first claim on the line; the brand keeps its first few letters.
  const tail = strengthFor(strength, others, max - 1 - START_KEPT, max).replace(/^…\s?/, "");
  const gap = pointFirst(tail) ? " " : "";
  return [form, { text: frontOf(brand, max - 1 - gap.length - tail.length, max) + "…" + gap + tail }];
}

// Where each line's pieces stand in the name — from the first letter the line
// shows to the last — or null if they cannot be found there in order.
function located(text: string, lines: NameLine[]): { start: number; end: number }[] | null {
  const spans: { start: number; end: number }[] = [];
  let from = 0;
  for (const l of lines) {
    let start = -1;
    for (const piece of l.text.split("…").map((p) => p.trim()).filter(Boolean)) {
      const at = text.indexOf(piece, from);
      if (at < 0) return null;
      if (start < 0) start = at;
      from = at + piece.length;
    }
    if (start < 0) return null;
    spans.push({ start, end: from });
  }
  return spans;
}

// The start of `s` in at most `room` letters, for the front of a line: whole
// words where any fits — a word ends at a space, or where a plus follows it,
// and never inside an amount; otherwise its first word cut where it stands —
// unless that is a NUMBER, which is never shown in part ("12" for 12.5).
function frontOf(s: string, room: number, max: number): string {
  if (s.length <= room) return s;
  if (room <= 0) return "";
  const amounts = amountsIn(s, max);
  for (let p = room; p > 0; p--) {
    if ((/\s/.test(s[p]) || s[p] === "+") && !endsInside(amounts, p)) return s.slice(0, p).trimEnd();
  }
  const cut = s.slice(0, room);
  return endsInside(amounts, room) || /^…?\d/.test(cut) ? "" : cut;
}

// The same for what is brought into view after the mark: cut at its END if it
// must be, with a mark, and again never through a number.
function upTo(s: string, room: number, max: number): string | null {
  if (s.length <= room) return s;
  const kept = frontOf(s, room - 1, max);
  return kept ? kept + "…" : null;
}

// Where what is shown of `text` from the place `same` begins — the place two
// names part at. The whole word that holds it, where a line has `room` for the
// word up to there: an amount from its first digit ("25 mg", also when the
// place is in its unit), any other word from the last space, plus or end of an
// amount before it — a number glued to a word is part of that word ("FT3"),
// where the word fits as far as the number's end. Otherwise the place itself;
// but never from inside an amount, whose start it then is.
function partStart(text: string, same: number, room: number, max: number): { at: number; word: number } {
  const amounts = amountsIn(text, max);
  const holds = amounts.find(({ a, b }) => a <= same && same < b);
  let word = same;
  if (holds && !holds.inWord) word = holds.a;
  else while (word > 0 && !/\s/.test(text[word - 1]) && text[word - 1] !== "+" && !amounts.some(({ b, inWord }) => !inWord && b === word)) word--;
  const wordFits = same - word <= room && (!holds || holds.b - word <= room + 1);
  const outside = (p: number) => startsInside(amounts, p)?.a ?? p; // never from inside an amount
  const at = outside(wordFits ? word : same);
  // A word may begin inside an amount ("B12 pg/mL-fas…": the "pg" is read as
  // the unit of that 12), and the amount's start is then further from the
  // place than the word's was — too far, where the line would run out before
  // it. From the place itself, then.
  return { at: same - at > room ? outside(same) : at, word };
}

// 3. The lines the name already has, with the one that was CUT made to show
// both its ends: its start, a mark, and the word the names part at, which the
// cut had hidden. "5 mg + 160 m…" becomes "5 mg…12.5 mg" beside "5 mg…25 mg" —
// the first part of the strength is still there to tell it from "10 mg…", and
// nothing is shown that could be read as the whole of it.
//
// It is done for a GROUP of names at once, so that the start they share is
// kept at the same length in each: "5 mg…12.5 mg" beside "5 mg…25 mg", not
// beside "5 mg +…25 mg".
const START_KEPT = 4; // letters of the line's start that the new end may not push out
function bothEnds(group: { text: string; lines: NameLine[] }[], same: number, max: number): (NameLine[] | null)[] {
  const found = group.map(({ text, lines }) => {
    const at = located(text, lines);
    if (!at) return null;
    // The line whose cut hides the place: it ends in a mark, and the place
    // comes after what it shows and before what the next line shows.
    const k = lines.findIndex((l, i) => l.text.endsWith("…") && same >= at[i].end && same < (i + 1 < lines.length ? at[i + 1].start : text.length));
    if (k < 0) return null;
    // The whole word they part at, unless it is longer than a line.
    const from = partStart(text, same, max - START_KEPT, max).at;
    const hidden = text.slice(from, k + 1 < lines.length ? at[k + 1].start : text.length).trim();
    if (!hidden) return null;
    // What the line showed, up to that word (the cut may have fallen inside it).
    const body = lines[k].text.slice(0, -1);
    const start = body.slice(0, Math.max(0, body.length - Math.max(0, at[k].end - from))).trimEnd();
    const end = upTo(pointFirst(hidden) ? " " + hidden : hidden, max - 1 - Math.min(start.length, START_KEPT), max);
    return end ? { k, start, end } : null;
  });
  const room = max - 1 - Math.max(0, ...found.map((x) => (x ? x.end.length : 0)));
  return group.map(({ lines }, n) => {
    const x = found[n];
    if (!x) return null;
    // (Never longer than the line: an end is at most a line less its mark, and
    // the start is cut to the room the longest end leaves.)
    const line = frontOf(x.start, room, max) + "…" + x.end;
    return lines.map((l, i) => (i === x.k ? { ...l, text: line } : l));
  });
}

// 4. Two lines read from the place itself: what the names share, cut at its
// end, and under it the word they part at — or the very letter, when that word
// runs on for longer than a line could show the difference in. A mark leads
// the second line wherever something was left out before it, so that what
// stands there is never taken for the whole ("…12.5 mg", not "12.5 mg").
function fromDifference(text: string, same: number, max: number): NameLine[] | null {
  const { at: start, word } = partStart(text, same, max - 3, max);
  if (start === 0) return wrapTwo(text, max);
  const rest = text.slice(start).trimStart();
  if (!rest) return null;
  const head = cutEnd(text.slice(0, start).trimEnd(), max);
  const mark = start !== word || head.endsWith("…") ? "…" : "";
  return [{ text: head }, { text: cutEnd(mark && pointFirst(rest) ? mark + " " + rest : mark + rest, max) }];
}

/**
 * The names of ONE chart, each over at most two lines of at most `max`
 * characters, in the order given.
 *
 * Each is what `nameLines` writes for it alone — until two names that are
 * different come out the same. Those are written again, together, in the first
 * of four ways that leaves FEWER pairs alike on the whole chart than before:
 *   1. medicines that differ in their dosage form get it back, shortened, with
 *      the strength still under it ("Tab… Ondanse…" / "Inj… Ondanse…");
 *   2. or on a line of its own, cut at its end, with the start of the brand
 *      and the strength under it — for two forms that BEGIN alike ("Tablet
 *      (Dela…" / "Tablet (Exte…", each over "Pantoni…40 mg");
 *   3. the line that was cut is made to show both its ends — its start, and
 *      the word the names part at ("…Exforge HCT" over "5 mg…12.5 mg" /
 *      "5 mg…25 mg"; "…Amlod…Atenolol" / "…Amlod…Losartan" over the strength);
 *   4. failing that, the name is read from the place itself, under what the
 *      names share ("Burning sensat…" over "…2 weeks" / "…3 weeks").
 * A step is taken only if it leaves fewer pairs alike on the whole chart, so
 * the work ends and two rounds cannot turn each other back. That is all the
 * count promises: each way starts from the lines a name has by itself, not
 * from the last step's, so a later step may write a name again — and may put
 * two names together that an earlier step had told apart, so long as fewer
 * pairs are alike after it than before. A name is written the same wherever it
 * stands in the list.
 *
 * Then, the strengths of ONE medicine. A medicine that was not written again
 * above still has the lines it has by itself, and by itself a strength longer
 * than a line is cut at its end, or left off for the sake of the brand — the
 * same "10 mg+160 mg+…" for 12.5 and for 25, under two labels that differ in
 * something else. Where another strength of that medicine is on the chart,
 * the strength has the second line to itself and is cut by what it has to be
 * told from (`layOut`, `strengthFor`); the name keeps that unless it would put
 * it under one name with another. So a chart whose names are already
 * different is left as it is but for this.
 *
 * ⚕️ What is held (timelineLabel.test.ts): no "…" stands inside an amount, for
 * any chart drawn there; two STRENGTHS of one medicine never show the same
 * numbers, counted over fixed pools of forms, brands and strengths; and pairs
 * of names built to be mistaken for one another are written differently —
 * a sample of them on every run, not all. What is NOT promised: names that
 * differ from one another in more places than two short lines can show. They
 * are still written differently wherever one of the ways above allows — but a
 * label may then not say EVERY difference (it may not show the brand), and
 * where no way is left two of them stay alike: four such cases are known, and
 * each is a failing test (DEFECT-HM-NAMES).
 */
export function namesApart(names: ChartName[], max: number): NameLine[][] {
  const texts = names.map((n) => n.name.trim());
  const alone = names.map((n) => nameLines(n.name, max, n.kind));
  // How many pairs of different names are written the same.
  const alike = (ls: NameLine[][]) => {
    const as = ls.map(shown);
    let pairs = 0;
    for (let i = 0; i < as.length; i++) for (let j = i + 1; j < as.length; j++) if (texts[i] !== texts[j] && as[i] === as[j]) pairs++;
    return pairs;
  };
  // A medicine's three parts, and the OTHER strengths on the chart of the same
  // medicine (whatever its form) — what its own strength has to be told from.
  const parts = names.map((n, i) => (n.kind === "drug" ? labelParts(texts[i]) : null));
  const medicines = parts.map((p) => (p?.name ? medicineOf(p) : null));
  const others = (i: number) => {
    const mine = parts[i];
    if (!mine?.name) return [];
    const strengths = parts.flatMap((p, k) => (p && medicines[k] === medicines[i] && p.after.trim() !== mine.after.trim() ? [p.after.trim()] : []));
    return strengths.filter((s, k) => strengths.indexOf(s) === k);
  };
  let lines = alone;
  for (;;) {
    // Names written the same: grouped by what is shown, and only where the
    // group holds more than one NAME (the same name twice is one name). Taken
    // in the order of the names themselves, never of the list.
    const byShown = new Map<string, number[]>();
    lines.forEach((l, i) => byShown.set(shown(l), [...(byShown.get(shown(l)) ?? []), i]));
    const first = (g: number[]) => g.map((i) => texts[i]).sort()[0];
    const groups = [...byShown.values()].filter((g) => new Set(g.map((i) => texts[i])).size > 1).sort((a, b) => (first(a) < first(b) ? -1 : 1));
    let better = false;
    for (const g of groups) {
      const one = texts[g[0]];
      let same = one.length; // how many letters the group's names share
      for (const i of g) {
        let n = 0;
        while (n < same && n < texts[i].length && texts[i][n] === one[n]) n++;
        same = n;
      }
      // The two ways that bring a medicine's form back are for names that
      // DIFFER in it: where every name has the same form, it is not the form
      // that tells them apart, and the room is the brand's.
      const formsDiffer = new Set(g.map((i) => parts[i]?.before.trim() ?? "")).size > 1;
      // Each way answers for the whole group, in the group's order.
      const ways: (() => (NameLine[] | null)[])[] = [
        () => g.map((i) => (formsDiffer && parts[i] ? formKept(texts[i], others(i), max) : null)),
        () => g.map((i) => (formsDiffer && parts[i] ? formAbove(texts[i], others(i), max) : null)),
        () => bothEnds(g.map((i) => ({ text: texts[i], lines: alone[i] })), same, max),
        () => g.map((i) => fromDifference(texts[i], same, max)),
      ];
      const before = alike(lines);
      for (const way of ways) {
        const again = way();
        const tried = lines.map((l, i) => again[g.indexOf(i)] ?? l);
        if (alike(tried) < before) { lines = tried; better = true; break; }
      }
    }
    if (!better) break;
  }
  // The strengths of ONE medicine. A name that was not written again still has
  // the lines it has by itself — and by itself a strength longer than a line is
  // cut at its end, whatever else is on the chart: "10 mg+160 mg+…" for 12.5
  // and for 25, under two labels that differ in something else (how the form
  // was written, or which form it is) and so were never written again. Such a
  // name is laid out once more with the other strengths of its medicine beside
  // it, and keeps that unless it would put it under one name with another. In
  // the order of the names themselves, never of the list.
  const byName = texts.map((_, i) => i).sort((a, b) => (texts[a] < texts[b] ? -1 : texts[a] > texts[b] ? 1 : a - b));
  for (const i of byName) {
    if (shown(lines[i]) !== shown(alone[i])) continue;
    const again = layOut(names[i].name, max, names[i].kind, others(i)); // (no others for what is not a medicine)
    if (shown(again) === shown(alone[i])) continue;
    const tried = lines.map((l, k) => (k === i ? again : l));
    if (alike(tried) <= alike(lines)) lines = tried;
  }
  return lines;
}
