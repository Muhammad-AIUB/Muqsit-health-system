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

// ── Three ways of writing a name again, so that the place where it differs
//    from the names it was taken for is in sight. Each gives null for a name it
//    has nothing to offer (that name keeps the lines it has).

// 1. A medicine with its form KEPT — shortened if it must be — on one line with
// the brand, and the strength under them. What tells a tablet from an
// injection of the same medicine and strength.
function formKept(text: string, max: number): NameLine[] | null {
  const { before, name: brand, after } = splitDrugLabel(text);
  const head = before.trim();
  const strength = after.trim();
  if (!brand || !head || !strength || strength.length > max) return null;
  return [{ text: formAndBrand(head, brand, (before + brand).trim(), max) }, { text: strength }];
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
// words where any fits; otherwise its first word cut where it stands — unless
// that word is a NUMBER, which is never shown in part ("12" for 12.5).
function frontOf(s: string, room: number): string {
  if (s.length <= room) return s;
  if (room <= 0) return "";
  const cut = s.slice(0, room);
  if (/\s/.test(s[room])) return cut.trimEnd();
  const lastSpace = cut.search(/\s\S*$/);
  if (lastSpace > 0) return cut.slice(0, lastSpace).trimEnd();
  return /^…?\d/.test(cut) ? "" : cut;
}

// The same for what is brought into view after the mark: cut at its END if it
// must be, with a mark, and again never through a number.
function upTo(s: string, room: number): string | null {
  if (s.length <= room) return s;
  const kept = frontOf(s, room - 1);
  return kept ? kept + "…" : null;
}

// 2. The lines the name already has, with the one that was CUT made to show
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
    const word = text.slice(0, same).search(/\S*$/);
    const from = same - word <= max - START_KEPT ? word : same; // the whole word they part at, unless it is longer than a line
    const hidden = text.slice(from, k + 1 < lines.length ? at[k + 1].start : text.length).trim();
    if (!hidden) return null;
    // What the line showed, up to that word (the cut may have fallen inside it).
    const body = lines[k].text.slice(0, -1);
    const start = body.slice(0, Math.max(0, body.length - Math.max(0, at[k].end - from))).trimEnd();
    const end = upTo(hidden, max - 1 - Math.min(start.length, START_KEPT));
    return end ? { k, start, end } : null;
  });
  const room = max - 1 - Math.max(0, ...found.map((x) => (x ? x.end.length : 0)));
  return group.map(({ lines }, n) => {
    const x = found[n];
    if (!x) return null;
    const line = frontOf(x.start, room) + "…" + x.end;
    return line.length > max ? null : lines.map((l, i) => (i === x.k ? { ...l, text: line } : l));
  });
}

// 3. Two lines read from the place itself: what the names share, cut at its
// end, and under it the word they part at — or the very letter, when that word
// runs on for longer than a line could show the difference in. A mark leads
// the second line wherever something was left out before it, so that what
// stands there is never taken for the whole ("…12.5 mg", not "12.5 mg").
function fromDifference(text: string, same: number, max: number): NameLine[] | null {
  const word = text.slice(0, same).search(/\S*$/);
  const start = same - word <= max - 3 ? word : same;
  if (start === 0) return wrapTwo(text, max);
  const rest = text.slice(start).trimStart();
  if (!rest) return null;
  const head = cutEnd(text.slice(0, start).trimEnd(), max);
  const mark = start !== word || head.endsWith("…") ? "…" : "";
  return [{ text: head }, { text: cutEnd(mark + rest, max) }];
}

/**
 * The names of ONE chart, each over at most two lines of at most `max`
 * characters, in the order given.
 *
 * Each is what `nameLines` writes for it alone — until two names that are
 * different come out the same. Those are written again, together, in the first
 * of three ways that leaves FEWER pairs alike on the whole chart than before:
 *   1. medicines that differ in their dosage form get it back, shortened, with
 *      the strength still under it ("Tab… Ondanse…" / "Inj… Ondanse…");
 *   2. the line that was cut is made to show both its ends — its start, and
 *      the word the names part at ("…Exforge HCT" over "5 mg…12.5 mg" /
 *      "5 mg…25 mg"; "…Amlod…Atenolol" / "…Amlod…Losartan" over the strength);
 *   3. failing that, the name is read from the place itself, under what the
 *      names share ("Calcium" over "Carb. + Vit.…" / "Citr. + Vit.…").
 * Nothing is ever undone: a step is taken only if it leaves fewer pairs alike,
 * so the work ends, and a pair once told apart stays apart. A name is written
 * the same wherever it stands in the list, and a chart whose names are already
 * different is not touched.
 *
 * ⚕️ What is held (timelineLabel.test.ts): any TWO names that differ in more
 * than their spacing are written differently; so is every pair on a chart of
 * names built to be mistaken for one another, and on a chart of the strengths
 * of a three-part tablet that differ in two of their parts. What is NOT
 * promised: names that differ from one another in more places than two short
 * lines can show. They are still written differently wherever one of the ways
 * above allows — but a label may then not say EVERY difference, and where no
 * way is left two of them stay alike (DEFECT-HM-NAMES in the tests).
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
      // Each way answers for the whole group, in the group's order.
      const ways: (() => (NameLine[] | null)[])[] = [
        () => g.map((i) => (names[i].kind === "drug" ? formKept(texts[i], max) : null)),
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
    if (!better) return lines;
  }
}
