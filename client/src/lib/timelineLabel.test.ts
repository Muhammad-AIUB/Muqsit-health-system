import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nameLines, namesApart, type ChartName } from "./timelineLabel";
import { splitDrugLabel } from "./rxShorthand";
import { configureProps } from "@/test/fc";

// The name written beside a bar or a lane of the Health-trend chart, in a
// column too narrow for the whole of it.
//
// ⚕️ It used to be one line, cut at its end. On a phone that column holds 13 to
// 15 characters, and in this app a medicine's label STARTS with its dosage
// form: "Tablet. Entaliv 0.5 mg" and "Tablet. Entaliv 1 mg" both read
// "Tablet. Enta…", and "Capsule (Enteric Coated). Sergel 40 mg" read
// "Capsule (Ente…" with the medicine gone. Two bars with one name — a dose
// change that cannot be read off the timeline (found in review, before it was
// released). What tells two bars apart is the brand and the strength, so that
// is what a narrow column keeps.
configureProps(300);

const texts = (name: string, max: number, kind: "drug" | "text" = "drug") => nameLines(name, max, kind).map((l) => l.text);

// ⚕️ What may never be shown in part: a number, and the short word after it
// that says what it is a number OF ("12.5 mg", "500mg", "10%", "200 IU", "12
// weeks"). Found here by walking the name a letter at a time — NOT with the
// rule's own pattern — so that the two have to agree. One too long for a line
// to hold between two marks (`max - 2`; a character less where it begins with
// a decimal point, which a space sets apart from the mark) cannot be kept
// whole by any rule, and is not looked for.
function amountsOf(name: string, max: number): { a: number; b: number }[] {
  const digit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
  const letter = (c: string | undefined) => c !== undefined && /[A-Za-zµμ]/.test(c);
  const out: { a: number; b: number }[] = [];
  let i = 0;
  while (i < name.length) {
    if (!digit(name[i])) { i++; continue; }
    let n = i;
    while (digit(name[n])) n++;
    // …and on through a point, a comma, a stroke or a hyphen with a digit after it: 12.5, 1,000, 30/70, 5-10.
    while (".,/-–".includes(name[n] ?? " ") && digit(name[n + 1])) { n++; while (digit(name[n])) n++; }
    if (letter(name[i - 1])) { i = n; continue; } // "HbA2", "B12", "D3": part of a word
    let a = i;
    if (name[a - 1] === "." && !letter(name[a - 2]) && !digit(name[a - 2])) a--; // ".5 mg" is half a milligram
    const u = name[n] === " " ? n + 1 : n;
    let b = n;
    if (name[u] === "%") b = u + 1;
    else { let e = u; while (letter(name[e])) e++; if (e > u && e - u <= 5) b = e; }
    if (b - a <= max - 2 - (name[a] === "." ? 1 : 0)) out.push({ a, b });
    i = b;
  }
  return out;
}

// Can the label's pieces be found in the name, in the order they are shown, so
// that no "…" stands strictly inside an amount — and so that where a line
// turns inside one (no mark: nothing is left off there) nothing after the turn
// is left off either? A piece may stand in a name more than once; what the
// reader has is the label, so any honest reading of it will do.
function amountsAreWhole(name: string, lines: string[], max: number): boolean {
  const amounts = amountsOf(name, max);
  const into = (p: number) => amounts.some(({ a, b }) => a < p && p < b);
  const pieces: { text: string; before: boolean; after: boolean; turn: boolean }[] = [];
  lines.forEach((line, n) => {
    const parts = line.split("…");
    const restWhole = lines.slice(n).every((l) => !l.includes("…"));
    // A mark at the end of the line above stands before this line's first
    // piece too, and one at the start of the line below after its last.
    const markAbove = n > 0 && lines[n - 1].endsWith("…");
    const markBelow = n + 1 < lines.length && lines[n + 1].startsWith("…");
    parts.forEach((raw, k) => {
      const text = raw.trim();
      if (!text) return;
      // The first piece of a later line, with no mark on either side of the turn.
      const turn = n > 0 && k === 0 && !markAbove && !restWhole;
      pieces.push({ text, before: k > 0 || markAbove, after: k < parts.length - 1 || markBelow, turn });
    });
  });
  const place = (k: number, from: number): boolean => {
    if (k === pieces.length) return true;
    const p = pieces[k];
    for (let at = name.indexOf(p.text, from); at !== -1; at = name.indexOf(p.text, at + 1)) {
      const end = at + p.text.length;
      if ((p.before || p.turn) && into(at)) continue;
      if (p.after && into(end)) continue;
      if (place(k + 1, end)) return true;
    }
    return false;
  };
  return place(0, 0);
}

describe("nameLines — a medicine", () => {
  it("a name that fits is one line, exactly as it was written", () => {
    expect(nameLines("Tablet. Napa 500 mg", 20, "drug")).toEqual([{ text: "Tablet. Napa 500 mg" }]);
    expect(texts("Napa", 8)).toEqual(["Napa"]);
  });

  it("⚕️ two strengths of one medicine stay two different names", () => {
    expect(texts("Tablet. Entaliv 0.5 mg", 15)).toEqual(["Tablet.", "Entaliv 0.5 mg"]);
    expect(texts("Tablet. Entaliv 1 mg", 15)).toEqual(["Tablet.", "Entaliv 1 mg"]);
  });

  it("⚕️ a long dosage form gives way — the brand and its strength are kept whole", () => {
    expect(texts("Capsule (Enteric Coated). Sergel 40 mg", 15)).toEqual(["Capsule (Enter…", "Sergel 40 mg"]);
    expect(texts("Oral Solution. Avolac 3.35 gm/5 ml", 19)).toEqual(["Oral Solution.", "Avolac 3.35 gm/5 ml"]);
  });

  it("the form is the quiet line; the name is not", () => {
    const [form, name] = nameLines("Tablet. Entaliv 0.5 mg", 15, "drug");
    expect(form).toEqual({ text: "Tablet.", quiet: true });
    expect(name.quiet).toBeFalsy();
  });

  it("on the narrowest phones the strength still shows: the name takes both lines and the form is left off, marked", () => {
    // 13 characters: "Entaliv 0.5 mg" is 14.
    expect(texts("Tablet. Entaliv 0.5 mg", 13)).toEqual(["…Entaliv", "0.5 mg"]);
    expect(texts("Tablet. Entaliv 1 mg", 13)).toEqual(["Tablet.", "Entaliv 1 mg"]);
  });

  it("a name too long even for a line of its own is cut at its end, and its strength keeps the second line", () => {
    expect(texts("Tablet. Sofosbuvir+Velpatasvir 400 mg/100 mg", 15)).toEqual(["…Sofosbuvir+Ve…", "400 mg/100 mg"]);
  });

  // What tells two bars of one medicine apart is the STRENGTH, and it is at the
  // end — the part a cut takes first.
  it("⚕️ when the name is too long for the column it is the NAME that is cut; the strength stays whole", () => {
    expect(texts("Tablet. Amlodipine + Olmesartan 5 mg + 20 mg", 15)).toEqual(["…Amlodipine +…", "5 mg + 20 mg"]);
    expect(texts("Tablet. Amlodipine + Olmesartan 5 mg + 40 mg", 15)).toEqual(["…Amlodipine +…", "5 mg + 40 mg"]);
    // …the same for one typed by hand, with no form in front of it.
    expect(texts("Amlodipine + Olmesartan 5 mg + 20 mg", 15)).toEqual(["Amlodipine + O…", "5 mg + 20 mg"]);
    expect(texts("Amlodipine + Olmesartan 5 mg + 40 mg", 15)).toEqual(["Amlodipine + O…", "5 mg + 40 mg"]);
  });

  // Not every word with a full stop after it is a dosage form. Set aside as
  // one, "Pot." and "Sod." were both left off behind a "…".
  it("⚕️ a first word that is not a dosage form is part of the name — potassium is not sodium", () => {
    expect(texts("Pot. chloride 600 mg SR", 15)).toEqual(["Pot. chloride", "600 mg SR"]);
    expect(texts("Sod. chloride 600 mg tab", 15)).toEqual(["Sod. chloride", "600 mg tab"]);
    expect(nameLines("Pot. chloride 600 mg", 15, "drug").some((l) => l.quiet)).toBe(false);
  });

  // A dosage form the app does not know by name ("IV Infusion.", "Oral
  // Saline.") is neither left off nor allowed to take the line: it is
  // shortened, and the brand stays in sight. Treated as part of the name, it
  // took the whole first line — "IV Infusion.…" over "1 gm/100 ml" for two
  // different medicines (third review, before release).
  it("⚕️ a dosage form it does not know by name is shortened — the brand is never the part that goes", () => {
    expect(texts("IV Infusion. Napa 1 gm/100 ml", 13)).toEqual(["IV Infu… Napa", "1 gm/100 ml"]);
    expect(texts("IV Infusion. Ace 1 gm/100 ml", 13)).toEqual(["IV Infus… Ace", "1 gm/100 ml"]);
    expect(texts("Oral Saline. Tasty Saline 10.25 gm", 13)).toEqual(["Ora… Tasty S…", "10.25 gm"]);
    expect(texts("Oral Saline. SMC Orsaline 10.25 gm", 13)).toEqual(["Ora… SMC Ors…", "10.25 gm"]);
    // With room for the brand and its strength under it, it is a quiet line
    // above them, like any other form.
    expect(nameLines("IV Infusion. Napa 1 gm", 15, "drug")).toEqual([{ text: "IV Infusion.", quiet: true }, { text: "Napa 1 gm" }]);
  });

  it("a medicine's own name typed before an abbreviated form is not left off either", () => {
    expect(texts("Napa tab. 500 mg twice daily", 15)).toEqual(["Napa tab.", "500 mg twice d…"]);
    expect(texts("Ace tab. 500 mg twice daily", 15)).toEqual(["Ace tab.", "500 mg twice d…"]);
  });

  it("a dosage form of several words is still a dosage form", () => {
    expect(texts("SC Injection. Clexane 40 mg", 15)).toEqual(["SC Injection.", "Clexane 40 mg"]);
    expect(texts("Eye Drops. Optimol 0.5%", 15)).toEqual(["Eye Drops.", "Optimol 0.5%"]);
  });

  it("a medicine typed by hand, with no form to set aside, wraps at a word", () => {
    expect(texts("Insulin Mixtard 30/70 as before", 15)).toEqual(["Insulin Mixtard", "30/70 as before"]);
  });

  it("the abbreviated forms doctors type are forms too", () => {
    expect(texts("inj Ceftriaxone 1 gm", 16)).toEqual(["inj", "Ceftriaxone 1 gm"]);
  });

  // The form is left off only when there is no room for it. Where it fits
  // beside the brand, with the strength under them, the whole name fits two
  // lines and nothing is left off at all.
  it("⚕️ a form that fits beside the brand is not left off", () => {
    expect(texts("Syrup. Napa 120 mg/5 ml", 13)).toEqual(["Syrup. Napa", "120 mg/5 ml"]);
    expect(texts("Cream. Betnovate-N 0.1% + 0.5%", 20)).toEqual(["Cream. Betnovate-N", "0.1% + 0.5%"]);
    // No room beside the brand: left off, and marked.
    expect(texts("Suspension. Napa 120 mg/5 ml", 13)).toEqual(["…Napa", "120 mg/5 ml"]);
  });

  // ⚕️ A cut used to fall wherever the line ran out — through a number, or
  // between a number and its unit: "12.5 mg + 500 mg" in thirteen characters
  // was "12.5 mg + 50…" (fifty, to the eye), and a 12.5 was "12.…". A label
  // from the medicines table has no space round the plus of a combination
  // ("5 mg+160 mg+12.5 mg"), and every example here had one until the sixth
  // review.
  it("⚕️ a strength too long for its line is cut BETWEEN its parts — never inside a number, never between a number and its unit", () => {
    expect(texts("Tablet. Jardimet 12.5 mg + 500 mg", 13)).toEqual(["…Jardimet", "12.5 mg +…"]);
    expect(texts("Tablet. Jardimet 12.5 mg+500 mg", 13)).toEqual(["…Jardimet", "12.5 mg+…"]);
    expect(texts("Tablet. Exforge HCT 5 mg+160 mg+12.5 mg", 14)).toEqual(["…Exforge HCT", "5 mg+160 mg+…"]);
    expect(texts("Tablet. Exforge HCT 10 mg + 160 mg + 12.5 mg", 16)).toEqual(["…Exforge HCT", "10 mg + 160 mg…"]);
    expect(texts("Tablet. Exforge HCT 10 mg + 160 mg + 12.5 mg", 17)).toEqual(["…Exforge HCT", "10 mg + 160 mg +…"]);
  });

  it("⚕️ the line turns BEFORE a number and its unit, not between them, where that still shows the whole name", () => {
    expect(texts("Calbo-D 500 mg+200 IU", 13)).toEqual(["Calbo-D", "500 mg+200 IU"]);
    expect(texts("Losartan 50 mg+12.5 mg", 14)).toEqual(["Losartan", "50 mg+12.5 mg"]);
  });

  // Nothing is left off here, so nothing can be misread: the name is whole, and
  // the turn of the line is a turn and no more.
  it("a name that only fits its two lines with the turn between a number and its unit is still shown whole", () => {
    expect(texts("Tablet. Exforge HCT 5 mg+160 mg+12.5 mg", 17)).toEqual(["…Exforge HCT 5", "mg+160 mg+12.5 mg"]);
  });

  // `splitDrugLabel` reads everything up to the first full stop as the dosage
  // form. Here the first full stop is the decimal point: the "form" was "Tab
  // Rivotril ." and the name under it "5 mg" — half a milligram shown as five.
  it("⚕️ a decimal point is not the full stop of a dosage form: .5 mg keeps its point", () => {
    expect(texts("Tab Rivotril .5 mg", 13)).toEqual(["Tab Rivotril", ".5 mg"]);
    expect(texts("Tablet. Rivotril .5 mg", 13)).toEqual(["…Rivotril", ".5 mg"]);
    expect(texts("Tab Rivotril .5 mg twice daily at night", 13)).toEqual(["Tab Rivotril", ".5 mg twice…"]);
  });

  it("a unit is not left standing by itself where the cut has hidden its number", () => {
    expect(texts("Amlodipine/Valsartan-5/160 mg tab", 13, "text")).toEqual(["Amlodipine/V…", "…tab"]);
    expect(texts("Amlodipine/Valsartan-5/160 mg .5 mg tab", 13, "text")).toEqual(["Amlodipine/V…", "… .5 mg tab"]);
  });

  // "120 mg/5 ml" is two amounts with a stroke between them: the turn goes
  // back past both, to the nearest place that is inside neither.
  it("the turn goes back as far as it must to stand outside every amount", () => {
    expect(texts("Linctus 120 mg/5 ml bd", 16, "text")).toEqual(["Linctus", "120 mg/5 ml bd"]);
  });

  // The limit of the rule, written down: an amount is kept whole where a line
  // can hold it between two marks — eleven characters in a line of thirteen.
  // One longer than that is cut where it stands, as any long word is. (Made up.)
  it("an amount is kept whole up to what a line holds between two marks, and one longer than that is cut where it stands", () => {
    // "1,00,000 IU" is eleven: left off whole, behind the mark.
    expect(texts("Xxxxxxxxxxxxx a 1,00,000 IU bcd", 13, "text")).toEqual(["Xxxxxxxxxxxxx", "a…"]);
    // "1,000,000 IU" is twelve.
    expect(texts("Xxxxxxxxxxxxx a 1,000,000 IU bcd", 13, "text")).toEqual(["Xxxxxxxxxxxxx", "a 1,000,000…"]);
    expect(texts("Tablet. Xyz 1234567890123 mg", 13)).toEqual(["…Xyz", "123456789012…"]);
  });

  // A name that BEGINS with a run of amounts has no place for the line to turn
  // that is not inside one: it is one line, cut where an amount ends.
  it("a name that begins with a run of amounts is one line, cut between them", () => {
    expect(texts("5 mg+160 mg+12.5 mg+1000 mg daily", 13, "text")).toEqual(["5 mg+160 mg+…"]);
  });

  it("a number inside a word is part of the word (HbA2, B12, D3), and a ratio is cut only at its stroke", () => {
    expect(texts("Vitamin B12 Neurobion Forte Injection 1000 mcg/ml", 13, "text")).toEqual(["Vitamin B12", "Neurobion Fo…"]);
    expect(texts("Inhaler. Fluticasone 100 mcg/0.5 ml", 13)).toEqual(["…Fluticasone", "100 mcg/…"]);
  });
});

// One name at a time cannot promise what the chart needs: two lines of
// thirteen letters cannot hold every medicine's label, and whatever one rule
// leaves off, some pair of medicines differs in exactly that. The fourth
// review found them with real labels, each pair under ONE name: a tablet and
// an injection of the same medicine and strength, two salts of calcium, two
// combinations that begin with the same ingredient.
//
// So the names of one chart are laid out TOGETHER (`namesApart`): each as
// `nameLines` writes it, and any that came out the same are written again so
// that what they differ in is what is shown — in the first of three ways that
// leaves fewer pairs alike than before: the dosage form brought back, the cut
// line made to show both its ends, or the name read from the place itself.
//
// The first version of it had two ways and took whichever applied, round after
// round. One round undid the other: of four strengths of one tablet, two were
// left under one name — and "12.5 mg" stood on a line by itself, with no mark,
// as if it were the whole strength of a tablet of 5 mg + 160 mg + 12.5 mg
// (fifth review, before release).
describe("namesApart — the names of one chart, together", () => {
  const drugs = (...names: string[]): ChartName[] => names.map((name) => ({ name, kind: "drug" }));
  const apart = (names: ChartName[], max: number) => namesApart(names, max).map((lines) => lines.map((l) => l.text));

  it("names that do not come out the same are left exactly as they are written one at a time", () => {
    const chart = drugs("Tablet. Entaliv 0.5 mg", "Tablet. Entaliv 1 mg", "Capsule (Enteric Coated). Sergel 40 mg", "Pot. chloride 600 mg SR");
    expect(namesApart(chart, 15)).toEqual(chart.map((n) => nameLines(n.name, 15, "drug")));
  });

  it("⚕️ the same medicine and strength in two forms: the form comes back, shortened, and the strength stays", () => {
    expect(apart(drugs("Tablet. Ondansetron 8 mg", "Injection. Ondansetron 8 mg"), 13)).toEqual([
      ["Tab… Ondanse…", "8 mg"],
      ["Inj… Ondanse…", "8 mg"],
    ]);
    expect(apart(drugs("Cream. Betnovate-N 0.1% + 0.5%", "Ointment. Betnovate-N 0.1% + 0.5%"), 13)).toEqual([
      ["Cre… Betnova…", "0.1% + 0.5%"],
      ["Oin… Betnova…", "0.1% + 0.5%"],
    ]);
  });

  it("…and only for those two: a third strength of it on the same chart keeps its own name", () => {
    expect(apart(drugs("Tablet. Ondansetron 8 mg", "Tablet. Ondansetron 4 mg", "Injection. Ondansetron 8 mg"), 13)).toEqual([
      ["Tab… Ondanse…", "8 mg"],
      ["…Ondansetron", "4 mg"],
      ["Inj… Ondanse…", "8 mg"],
    ]);
  });

  it("⚕️ two names that part inside a first word the app does not know are read from the word they part at", () => {
    expect(apart(drugs("Calcium Carb. + Vit. D3 500 mg", "Calcium Citr. + Vit. D3 500 mg"), 13)).toEqual([
      ["Calcium", "Carb. + Vit.…"],
      ["Calcium", "Citr. + Vit.…"],
    ]);
    expect(apart(drugs("Eye Drops. Moxifloxacin 0.5%", "Eye Ointment. Moxifloxacin 0.5%"), 13)).toEqual([
      ["Eye", "Drops. Moxif…"],
      ["Eye", "Ointment. Mo…"],
    ]);
  });

  it("⚕️ two combinations that begin with the same ingredient show the one they differ in — and keep their strength whole", () => {
    expect(apart(drugs("Tablet. Amlodipine + Atenolol 5 mg + 50 mg", "Tablet. Amlodipine + Losartan 5 mg + 50 mg"), 15)).toEqual([
      ["…Amlod…Atenolol", "5 mg + 50 mg"],
      ["…Amlod…Losartan", "5 mg + 50 mg"],
    ]);
  });

  // "12.5 mg" on a line by itself would be read as the strength of the tablet.
  it("⚕️ two strengths too long for a line, that differ only at their end, show BOTH ends — never the last part as if it were the whole", () => {
    const lines = apart(drugs("Tablet. Exforge HCT 5 mg + 160 mg + 12.5 mg", "Tablet. Exforge HCT 5 mg + 160 mg + 25 mg"), 13);
    expect(lines).toEqual([
      ["…Exforge HCT", "5 mg…12.5 mg"],
      ["…Exforge HCT", "5 mg…25 mg"],
    ]);
    for (const l of lines.flat()) expect(l).not.toMatch(/^\d[\d.]* mg$/);
  });

  // Four strengths of one tablet differ in TWO places: the first part and the
  // last. Showing only the place a pair differs in made the other pair alike,
  // and the next round turned it back.
  const FOUR = ["5 mg + 160 mg + 12.5 mg", "5 mg + 160 mg + 25 mg", "10 mg + 160 mg + 12.5 mg", "10 mg + 160 mg + 25 mg"];
  it("⚕️ four strengths of one tablet, differing in two places, are four names", () => {
    expect(apart(drugs(...FOUR.map((s) => `Tablet. Exforge HCT ${s}`)), 13)).toEqual([
      ["…Exforge HCT", "5 mg…12.5 mg"],
      ["…Exforge HCT", "5 mg…25 mg"],
      ["…Exforge HCT", "10 mg…12.5 mg"],
      ["…Exforge HCT", "10 mg…25 mg"],
    ]);
  });

  // A combination picked from the medicines table has NO space round its plus
  // (so the labels from real sheets in this repository's tests are written,
  // "Edeloss 20 mg+50 mg"; the table itself was not read for this). The
  // word a strength parts at was looked for between spaces, so "mg+25" was one
  // word: of "10 mg+160 mg+25 mg" the chart showed "10…mg+25 mg" — which reads
  // as a tablet of 10 mg + 25 mg, the unit beside the 10 being the hidden 160's
  // (sixth review, before release).
  const unspaced = (s: string) => s.replace(/ \+ /g, "+");
  it("⚕️ …written as the medicines table writes them, with no space round the plus: no unit is shown beside a number it does not belong to", () => {
    const lines = apart(drugs(...FOUR.map((s) => `Tablet. Exforge HCT ${unspaced(s)}`)), 13);
    expect(lines).toEqual([
      ["…Exforge HCT", "5 mg…12.5 mg"],
      ["…Exforge HCT", "5 mg…25 mg"],
      ["…Exforge HCT", "10 mg…12.5 mg"],
      ["…Exforge HCT", "10 mg…25 mg"],
    ]);
    for (const l of lines.flat()) expect(l).not.toMatch(/\d…|…mg/);
  });

  it("⚕️ two strengths that differ in a part the cut had hidden show that part WHOLE: 500 mg and 1000 mg, never 50… and 10…", () => {
    for (const plus of [" + ", "+"]) {
      const written = apart(drugs(`Tablet. Jardimet 12.5 mg${plus}500 mg`, `Tablet. Jardimet 12.5 mg${plus}1000 mg`), 13);
      expect(written, plus).toEqual([
        ["…Jardimet", "…500 mg"],
        ["…Jardimet", "…1000 mg"],
      ]);
    }
  });

  // The documents said for two reviews that a strength cut at its end shows the
  // end instead where another strength differs only there. At sixteen and
  // seventeen letters it did not: the cut fell inside the last number, "1…"
  // beside "2…", and with the two lines different nothing was written again.
  it("⚕️ …at the widths where the cut used to fall inside the last number, too", () => {
    for (const max of [16, 17]) {
      expect(apart(drugs("Tablet. Exforge HCT 10 mg + 160 mg + 12.5 mg", "Tablet. Exforge HCT 10 mg + 160 mg + 25 mg"), max), `@${max}`).toEqual([
        ["…Exforge HCT", "10 mg +…12.5 mg"],
        ["…Exforge HCT", "10 mg +…25 mg"],
      ]);
    }
  });

  // The part two strengths differ in is brought into view WHOLE even where
  // they differ in its last letter: "…g" beside "…l" would be a mark inside an
  // amount, and no amount at all. (Made-up strengths.)
  it("⚕️ two strengths that differ in the last letter of a long amount show that amount whole", () => {
    expect(apart(drugs("Tablet. Exforge HCT 5 mg + 1,00,000 mg", "Tablet. Exforge HCT 5 mg + 1,00,000 ml"), 13)).toEqual([
      ["Tablet. Exfo…", "…1,00,000 mg"],
      ["Tablet. Exfo…", "…1,00,000 ml"],
    ]);
  });

  // A number INSIDE a word is not an amount: it is a letter of the word.
  it("⚕️ two names that part at a number inside a word show the WORD: FT3 and FT4, never 3 and 4", () => {
    const chart: ChartName[] = ["FT3", "FT4"].map((t) => ({ name: `Thyroid function test — ${t}`, kind: "text" }));
    expect(apart(chart, 13)).toEqual([
      ["Thyroid", "function…FT3"],
      ["Thyroid", "function…FT4"],
    ]);
  });

  // A word begins after a plus, too: "Sofosbuvir+Velpatasvir" is two words,
  // and the second is brought into view from its first letter.
  it("two combinations written with no space round the plus show the ingredient they part in from its first letter", () => {
    expect(apart(drugs("Tablet. Sofosbuvir+Velpatasvir 400 mg+100 mg", "Tablet. Sofosbuvir+Voxilaprevir 400 mg+100 mg"), 13)).toEqual([
      ["…Sof…Velpata…", "400 mg+100 mg"],
      ["…Sof…Voxilap…", "400 mg+100 mg"],
    ]);
  });

  // The start of a line that is kept is never part of a number — also of one
  // too long for any line, which the amount rule does not cover. (Made up.)
  it("the start that is kept is never part of a number, however long the number", () => {
    expect(apart(drugs("Tablet. Xyz 1234567890123 mg + 5 mg", "Tablet. Xyz 1234567890123 mg + 10 mg"), 13)).toEqual([
      ["…Xyz", "…5 mg"],
      ["…Xyz", "…10 mg"],
    ]);
  });

  // One of two names has a part that can be brought into view and the other
  // has not (an amount too long for the room): the first is written again,
  // the second keeps the lines it had — not a line that ends in two marks.
  it("a name with nothing that can be brought into view keeps its own lines", () => {
    expect(apart(drugs("Tablet. Exforge HCT 5 mg + 160 mg + 25 mg", "Tablet. Exforge HCT 5 mg + 160 mg + 1,00,000 IU"), 13)).toEqual([
      ["…Exforge HCT", "5 mg +…25 mg"],
      ["…Exforge HCT", "5 mg +…"],
    ]);
  });

  // Four dots in a row — "….5 mg" — and the decimal point is lost among them.
  it("⚕️ a part that begins with a decimal point stands apart from the mark before it: \"… .5 mg\"", () => {
    const written = apart(drugs("Tablet. Exforge HCT 5 mg + 160 mg + .5 mg", "Tablet. Exforge HCT 5 mg + 160 mg + .25 mg"), 13);
    expect(written).toEqual([
      ["…Exforge HCT", "5 mg… .5 mg"],
      ["…Exforge HCT", "5 mg… .25 mg"],
    ]);
    const lead = apart(drugs("Tablet. Exforge HCT 12500.5 mg + 160 mg + .5 mg", "Tablet. Exforge HCT 12500.5 mg + 160 mg + .25 mg"), 13);
    expect(lead).toEqual([
      ["…Exforge HCT", "… .5 mg"],
      ["…Exforge HCT", "… .25 mg"],
    ]);
    // …and where the name is read from the place itself (the second pair of
    // four: the first has taken the two names both ends would give it).
    const four = apart(drugs(...["5 mg + .5 mg", "5 mg + .25 mg", "10 mg + .5 mg", "10 mg + .25 mg"].map((s) => `Tablet. Trimedica 40 mg + ${s}`)), 13);
    expect(four).toEqual([
      ["Tablet. Trim…", "… .5 mg"],
      ["Tablet. Trim…", "… .25 mg"],
      ["…Trimedica", "40 mg… .5 mg"],
      ["…Trimedica", "40 mg… .25 mg"],
    ]);
    for (const l of [...written, ...lead, ...four].flat()) expect(l).not.toContain("….");
  });

  // A tablet and an injection of one medicine, in two strengths of which one is
  // longer than a line. The form came back only over a strength that fitted,
  // so one of the two pairs had no way left (sixth review).
  it("⚕️ a tablet and an injection of one medicine in two strengths, one too long for a line, are four names", () => {
    const chart = drugs("inj Edeloss 10 mg+160 mg+25 mg", "Tablet. Edeloss 10 mg+160 mg+25 mg", "Tablet. Edeloss 25 mcg+125 mcg", "inj Edeloss 25 mcg+125 mcg");
    expect(apart(chart, 13)).toEqual([
      ["inj Edeloss", "10 mg+160 mg…"],
      ["Tabl… Edeloss", "10 mg+160 mg…"],
      ["Tabl… Edeloss", "25 mcg+…"],
      ["inj Edeloss", "25 mcg+…"],
    ]);
  });

  // One medicine in two forms and two strengths, each strength longer than a
  // line: four names that differ at the two ENDS of the label. One pair was left
  // under one name, and the other shown with no strength at all (sixth review).
  it("⚕️ two forms of one medicine in two strengths too long for a line are four names, at every width a phone has", () => {
    for (const plus of [" + ", "+"]) {
      const chart = drugs(...["Inhaler", "Capsule"].flatMap((f) => [`25 mcg${plus}125 mcg`, `50 mcg${plus}250 mcg`].map((s) => `${f}. Salmeterol + Fluticasone ${s}`)));
      for (let max = 13; max <= 20; max++) {
        const written = apart(chart, max).map((l) => l.join(" / "));
        expect(new Set(written).size, `"${plus}" @${max}: ${written.join(" | ")}`).toBe(4);
      }
    }
  });

  it("⚕️ …at every width a narrow chart has, for every choice of them, under a short brand and a long one", () => {
    // Made-up tablets; only the SHAPE of their strengths matters: three parts,
    // of which the first and the last vary (the second follows the first in
    // the other family).
    const OTHER = ["5 mg + 1.25 mg + 5 mg", "5 mg + 1.25 mg + 10 mg", "10 mg + 2.5 mg + 5 mg", "10 mg + 2.5 mg + 10 mg"];
    for (const brand of ["Trio", "Triplixam", "Exforge HCT", "Amlodipine + Valsartan + Hydrochlorothiazide"]) {
      for (const family of [FOUR, OTHER, FOUR.map(unspaced), OTHER.map(unspaced)]) {
        for (let pick = 1; pick < 16; pick++) {
          const chart = drugs(...family.filter((_, i) => pick & (1 << i)).map((s) => `Tablet. ${brand} ${s}`));
          for (let max = 13; max <= 20; max++) {
            const written = apart(chart, max).map((l) => l.join(" / "));
            expect(new Set(written).size, `${brand} ${pick.toString(2)} @${max}: ${written.join(" | ")}`).toBe(chart.length);
          }
        }
      }
    }
  });

  // A number is never shown in part where the start of a line is shortened to
  // make room: "12500…" for 12500.5 would be read as a number. (Made-up strengths.)
  it("⚕️ the start that is kept never ends inside a number — it goes instead, behind the mark", () => {
    const lines = apart(drugs("Tablet. Exforge HCT 12500.5 mg + 160 mg + 12.5 mg", "Tablet. Exforge HCT 12500.5 mg + 160 mg + 25 mg"), 13);
    expect(lines).toEqual([
      ["…Exforge HCT", "…12.5 mg"],
      ["…Exforge HCT", "…25 mg"],
    ]);
  });

  it("the cut may fall exactly where two names part: the letter they part at is brought into view", () => {
    const chart: ChartName[] = ["X", "Y"].map((c) => ({ name: `Pain knee abcdefghijkl${c}end`, kind: "text" }));
    expect(apart(chart, 13)).toEqual([
      ["Pain knee", "abcdefgh…Xend"],
      ["Pain knee", "abcdefgh…Yend"],
    ]);
  });

  // What "written differently" does not promise: that every label says every
  // difference. Five strengths of one made-up tablet differ in three places;
  // all five are different names, and two of the pairs no longer say whether
  // their middle part is 5 or 10. (The tooltip and the list under the chart do.)
  it("five strengths that differ in three places are five names — though not every name says every part", () => {
    const five = ["20 mg + 5 mg + 12.5 mg", "40 mg + 5 mg + 12.5 mg", "40 mg + 5 mg + 25 mg", "40 mg + 10 mg + 12.5 mg", "40 mg + 10 mg + 25 mg"];
    expect(apart(drugs(...five.map((s) => `Tablet. Trimedica ${s}`)), 13)).toEqual([
      ["…Trimedica", "20 mg + 5 mg…"],
      ["Tablet. Trim…", "…12.5 mg"],
      ["Tablet. Trim…", "…25 mg"],
      ["…Trimedica", "40 mg…12.5 mg"],
      ["…Trimedica", "40 mg…25 mg"],
    ]);
  });

  // Three places, eight strengths, thirteen letters: there is no way left for
  // the last pair. They are left alike — as all eight were before — and it is
  // written down here rather than hidden: the test below fails until a way is
  // found (DEFECT-HM-NAMES, FUNCTIONAL-AUDIT.md).
  const EIGHT = [5, 10].flatMap((a) => [160, 320].flatMap((b) => [12.5, 25].map((c) => `Tablet. Exforge HCT ${a} mg + ${b} mg + ${c} mg`)));
  it.fails("DEFECT-HM-NAMES: eight strengths that differ in three places are eight names at thirteen letters", () => {
    const written = apart(drugs(...EIGHT), 13).map((l) => l.join(" / "));
    expect(new Set(written).size).toBe(8);
  });

  it("…of those eight, seven names are different, and they are the same seven however the list is ordered", () => {
    const written = apart(drugs(...EIGHT), 13).map((l) => l.join(" / "));
    expect(new Set(written).size).toBe(7);
    const backwards = apart(drugs(...[...EIGHT].reverse()), 13).map((l) => l.join(" / ")).reverse();
    expect(backwards).toEqual(written);
  });

  // The other way two are left alike, also written down. Two dosage forms the
  // app does not know by name, that BEGIN alike — "Tablet (Delayed Release)."
  // and "Tablet (Extended Release)." — of one medicine, in two strengths. Each
  // pair is told apart from the place its forms part at, which gives both pairs
  // the same two names: the first takes them, the second cannot, and stays
  // under one (sixth review; DEFECT-HM-NAMES, FUNCTIONAL-AUDIT.md).
  const RELEASE = ["Delayed", "Extended"].flatMap((r) => ["20 mg", "40 mg"].map((s) => `Tablet (${r} Release). Pantonix ${s}`));
  it.fails("DEFECT-HM-NAMES: two forms that begin alike, of one medicine in two strengths, are four names at thirteen letters", () => {
    const written = apart(drugs(...RELEASE), 13).map((l) => l.join(" / "));
    expect(new Set(written).size).toBe(4);
  });

  it("…of those four, three names are different — and all four where the strip has room for the form above the name", () => {
    expect(new Set(apart(drugs(...RELEASE), 13).map((l) => l.join(" / "))).size).toBe(3);
    expect(apart(drugs(...RELEASE), 15)).toEqual([
      ["Tablet (Delaye…", "Pantonix 20 mg"],
      ["Tablet (Delaye…", "Pantonix 40 mg"],
      ["Tablet (Extend…", "Pantonix 20 mg"],
      ["Tablet (Extend…", "Pantonix 40 mg"],
    ]);
  });

  it("a symptom or a test's name is told from its neighbour the same way", () => {
    const chart: ChartName[] = [
      { name: "Pain in the left knee since last Friday, worse on stairs", kind: "text" },
      { name: "Pain in the left knee since last Friday, worse at night", kind: "text" },
    ];
    expect(apart(chart, 15)).toEqual([
      ["Pain in the", "left…on stairs"],
      ["Pain in the", "left…at night"],
    ]);
  });

  // Two symptoms in two places each: where they are felt, and for how long.
  // The pair that comes second cannot be given the same two ends as the first
  // (they would be alike across the pairs), so it is read from the place
  // itself — with a mark in front of what is left, because the line above was cut.
  it("⚕️ four symptoms that differ in two places are four names, and what is left of one is marked as a part", () => {
    const chart: ChartName[] = ["epigastrium", "chest"].flatMap((where) => ["2 weeks", "3 weeks"].map((long): ChartName => ({
      name: `Burning sensation in the ${where} after meals for ${long}`, kind: "text",
    })));
    const written = apart(chart, 15);
    expect(new Set(written.map((l) => l.join(" / "))).size).toBe(4);
    expect(written).toEqual([
      ["Burning sensat…", "…2 weeks"],
      ["Burning sensat…", "…3 weeks"],
      ["Burning", "sensati…2 weeks"],
      ["Burning", "sensati…3 weeks"],
    ]);
  });

  // The one kind of difference that is not told apart, and need not be.
  it("two names that differ only in their spacing are written the same: to the eye they are one name", () => {
    const [a, b] = apart(drugs("Tablet. Ondansetron 8 mg", "Tablet.  Ondansetron  8 mg"), 13);
    expect(a).toEqual(["…Ondansetron", "8 mg"]);
    expect(b).toEqual(a);
  });

  // "…2 weeks" beside "…3 weeks" for twelve weeks and thirteen would be two
  // wrong numbers. The word is brought into view from its first letter.
  it("⚕️ the word two names part in is shown WHOLE — a number above all: 12 and 13, never 2 and 3", () => {
    const chart: ChartName[] = ["12 weeks", "13 weeks"].map((long) => ({ name: `Burning sensation in the chest after meals for ${long}`, kind: "text" }));
    expect(apart(chart, 15)).toEqual([
      ["Burning", "sensat…12 weeks"],
      ["Burning", "sensat…13 weeks"],
    ]);
    expect(apart(drugs("Tablet. Exforge HCT 5 mg + 160 mg + 12.5 mg", "Tablet. Exforge HCT 5 mg + 160 mg + 12 mg"), 13)).toEqual([
      ["…Exforge HCT", "5 mg…12.5 mg"],
      ["…Exforge HCT", "5 mg…12 mg"],
    ]);
  });

  it("the same name twice is the same name: nothing to tell apart", () => {
    expect(apart(drugs("Tablet. Ondansetron 8 mg", "Tablet. Ondansetron 8 mg"), 13)).toEqual([
      ["…Ondansetron", "8 mg"],
      ["…Ondansetron", "8 mg"],
    ]);
  });

  it("a name that ends where another goes on keeps its lines, and the other shows what it goes on with", () => {
    const short = "Amlodipine + Olmesartan + Hydrochlorothiazide";
    expect(apart([{ name: short, kind: "text" }, { name: `${short} Forte`, kind: "text" }], 13)).toEqual([
      ["Amlodipine +", "Olmesartan +…"],
      ["Amlodipine +", "Olmesar…Forte"],
    ]);
  });

  // Three that all begin alike, two of which go on alike for longer still: the
  // first reading tells the third from the pair, the second the pair from
  // each other.
  it("three names, two of them alike for longer than the third, are told apart in two steps", () => {
    const start = "Tablet. Amlodipine + Olmesartan + Hydrochlorothiazide";
    const longer = `${start} + Bisoprolol + Aspirin + Clopidogrel`;
    const chart = drugs(`${start} + Atenolol 5 mg`, `${longer} + Rosuvastatin 5 mg`, `${longer} + Atorvastatin 5 mg`);
    // Alone, each of the three is "…Amlodipine…" over "5 mg".
    expect(chart.map((n) => texts(n.name, 13))).toEqual([["…Amlodipine…", "5 mg"], ["…Amlodipine…", "5 mg"], ["…Amlodipine…", "5 mg"]]);
    expect(apart(chart, 13)).toEqual([
      ["…Aml…Atenolol", "5 mg"],
      ["…Aml…Rosuvas…", "5 mg"],
      ["…Aml…Atorvas…", "5 mg"],
    ]);
  });

  // A dosage form is only looked for in a MEDICINE. A symptom that happens to
  // have a full stop after its first word is told from its neighbour like any
  // other text — not shortened to "Fev… With ch…" as if "Fever." were a form.
  it("a symptom is not taken apart as a medicine to be told from another", () => {
    const chart: ChartName[] = ["3 days", "5 days"].map((d) => ({ name: `Fever. With chills and rigor for the last ${d}`, kind: "text" }));
    expect(apart(chart, 13)).toEqual([
      ["Fever. With", "chills…3 days"],
      ["Fever. With", "chills…5 days"],
    ]);
  });

  describe("for any names", () => {
    const word = fc.stringMatching(/^[A-Za-z0-9.+/()%-]{1,14}$/);
    const words = (min: number, max: number) => fc.array(word, { minLength: min, maxLength: max }).map((ws) => ws.join(" "));
    const kind = fc.constantFrom<"drug" | "text">("drug", "text");
    const width = fc.integer({ min: 8, max: 24 });
    // Two names made to be mistaken for each other: the same beginning and the
    // same end, as long as you like, and one place in between where they differ
    // — a word, a letter inside a word, or one simply going on after the other.
    const lookalikes = fc.oneof(
      fc.tuple(words(0, 6), word, word, words(0, 5)).map(([head, a, b, tail]) => [[head, a, tail], [head, b, tail]].map((p) => p.filter(Boolean).join(" "))),
      fc.tuple(words(0, 4), word, fc.stringMatching(/^[a-z0-9]{1,3}$/), fc.stringMatching(/^[a-z0-9]{1,3}$/), words(0, 4))
        .map(([head, stem, a, b, tail]) => [[head, stem + a, tail], [head, stem + b, tail]].map((p) => p.filter(Boolean).join(" "))),
      fc.tuple(words(1, 8), words(1, 3)).map(([base, more]) => [base, `${base} ${more}`]),
      fc.tuple(words(1, 8), words(1, 8)),
    );

    it("⚕️ TWO NAMES THAT ARE DIFFERENT ARE NEVER WRITTEN THE SAME", () => {
      fc.assert(
        fc.property(lookalikes, kind, kind, width, ([a, b], ka, kb, max) => {
          fc.pre(a.trim() !== b.trim());
          const [one, two] = apart([{ name: a, kind: ka }, { name: b, kind: kb }], max);
          expect(one, `"${a}" / "${b}" @${max}`).not.toEqual(two);
        }),
        { numRuns: 20000 },
      );
    });

    // A chart: a handful of medicines made of a few forms, a few brands that
    // begin alike, and a few strengths — every one of them confusable with
    // another — and two symptoms.
    const FORMS = ["", "Tablet. ", "Injection. ", "Syrup. ", "Suspension. ", "Capsule (Enteric Coated). ", "IV Infusion. ", "Oral Suspension. ", "Oral Solution. ", "Eye Drops. ", "Eye Ointment. ", "Pot. ", "Sod. "];
    const BRANDS = ["Napa", "Ondansetron", "Amlodipine + Atenolol", "Amlodipine + Losartan", "Amlodipine + Olmesartan + Hydrochlorothiazide", "Amlodipine + Olmesartan", "Calcium Carb. + Vit. D3", "Calcium Citr. + Vit. D3", "chloride"];
    const STRENGTHS = ["8 mg", "4 mg", "5 mg + 50 mg", "5 mg + 20 mg", "5 mg + 160 mg + 12.5 mg", "5 mg + 160 mg + 25 mg", "120 mg/5 ml"];
    const medicine = fc.tuple(fc.constantFrom(...FORMS), fc.constantFrom(...BRANDS), fc.constantFrom(...STRENGTHS)).map(([f, b, s]): ChartName => ({ name: `${f}${b} ${s}`, kind: "drug" }));
    const symptom = fc.constantFrom("Pain in the left knee since last Friday, worse on stairs", "Pain in the left knee since last Friday, worse at night", "Fever").map((name): ChartName => ({ name, kind: "text" }));
    const chart = fc.array(fc.oneof({ weight: 5, arbitrary: medicine }, { weight: 1, arbitrary: symptom }), { minLength: 2, maxLength: 9 });

    it("⚕️ …on a whole chart of names that are easily mistaken for one another", () => {
      fc.assert(
        fc.property(chart, fc.integer({ min: 13, max: 20 }), (names, max) => {
          const shown = apart(names, max).map((l) => l.join("\n"));
          for (let i = 0; i < names.length; i++) {
            for (let j = i + 1; j < names.length; j++) {
              if (names[i].name === names[j].name) continue;
              expect(shown[i], `"${names[i].name}" / "${names[j].name}" @${max}`).not.toBe(shown[j]);
            }
          }
        }),
        { numRuns: 5000 },
      );
    });

    it("never more than two lines, and none longer than the column", () => {
      fc.assert(
        fc.property(fc.oneof(chart, realChart), width, (names, max) => {
          for (const lines of apart(names, max)) {
            expect(lines.length).toBeGreaterThanOrEqual(1);
            expect(lines.length).toBeLessThanOrEqual(2);
            for (const l of lines) expect(l.length).toBeLessThanOrEqual(max);
          }
        }),
      );
    });

    // Medicines as the table writes them and as they are typed: a combination
    // with and without a space round its plus, a ratio, a per cent, a decimal,
    // a number inside a brand — under forms the app knows and forms it does not.
    const R_FORMS = ["", "Tablet. ", "Capsule. ", "Injection. ", "Inhaler. ", "Syrup. ", "Capsule (Enteric Coated). ", "Tablet (Delayed Release). ", "Tablet (Extended Release). ", "IV Infusion. ", "Eye Drops. ", "inj ", "Pot. "];
    const R_BRANDS = ["Napa", "Exforge HCT", "Jardimet", "Edeloss", "Calbo-D", "Salmeterol + Fluticasone", "Amlodipine+Olmesartan", "Mixtard 30", "Neuro-B", "Pantonix", "Co-Diovan", "5-FU", "Vitamin B12"];
    const R_STRENGTHS = [
      "500 mg", "0.5 mg", ".5 mg", "40 mg", "20 mg", "2.5 mg", "25 mg", "250 mg", "1000 mg",
      "12.5 mg+500 mg", "12.5 mg+1000 mg", "12.5 mg + 500 mg", "12.5 mg + 1000 mg",
      "5 mg+160 mg+12.5 mg", "5 mg+160 mg+25 mg", "10 mg+160 mg+12.5 mg", "10 mg+160 mg+25 mg", "10 mg + 160 mg + 25 mg",
      "20 mg+50 mg", "25 mcg+125 mcg", "50 mcg+250 mcg", "25 mcg + 125 mcg", "50 mcg + 250 mcg",
      "120 mg/5 ml", "100 mcg/0.5 ml", "(400 mg+400 mg+30 mg)/5 ml", "0.1%+2%", "500 mg+200 IU", "1 gm/vial", "100 IU/ml", "80 mg/12.5 mg", "1,00,000 IU", "30/70",
    ];
    const realMedicine = fc.tuple(fc.constantFrom(...R_FORMS), fc.constantFrom(...R_BRANDS), fc.constantFrom(...R_STRENGTHS)).map(([f, b, s]): ChartName => ({ name: `${f}${b} ${s}`, kind: "drug" }));
    const realChart = fc.array(realMedicine, { minLength: 1, maxLength: 8 });
    const asDrugs = (pair: string[]) => pair.map((name): ChartName => ({ name, kind: "drug" }));
    const asTexts = (pair: string[]) => pair.map((name): ChartName => ({ name, kind: "text" }));

    // The thing itself, not the case that was reported: for ANY chart, at any
    // width, no "…" stands inside a number or between a number and its unit.
    it("⚕️ A NUMBER IS NEVER SHOWN IN PART, AND NEVER PARTED FROM ITS UNIT BY A MARK", () => {
      fc.assert(
        fc.property(fc.oneof({ weight: 4, arbitrary: realChart }, chart, lookalikes.map(asDrugs), lookalikes.map(asTexts)), width, (names, max) => {
          apart(names, max).forEach((lines, i) => {
            expect(amountsAreWhole(names[i].name, lines, max), `"${names[i].name}" @${max}: ${lines.join(" / ")}`).toBe(true);
          });
        }),
        { numRuns: 20000 },
      );
    });

    it("⚕️ …for one name by itself too, at the widths a phone has", () => {
      fc.assert(
        fc.property(realMedicine, fc.integer({ min: 13, max: 22 }), (m, max) => {
          const lines = nameLines(m.name, max, "drug").map((l) => l.text);
          expect(amountsAreWhole(m.name, lines, max), `"${m.name}" @${max}: ${lines.join(" / ")}`).toBe(true);
        }),
        { numRuns: 5000 },
      );
    });

    // Two strengths of ONE medicine, as the table writes them: the pair a dose
    // change puts on a chart.
    it("⚕️ two strengths of one medicine, written as the table writes them, are two names at every width a phone has", () => {
      fc.assert(
        fc.property(fc.constantFrom(...R_FORMS), fc.constantFrom(...R_BRANDS), fc.constantFrom(...R_STRENGTHS), fc.constantFrom(...R_STRENGTHS), fc.integer({ min: 13, max: 22 }), (f, b, s1, s2, max) => {
          fc.pre(s1.replace(/\s+/g, "") !== s2.replace(/\s+/g, ""));
          const [one, two] = apart(drugs(`${f}${b} ${s1}`, `${f}${b} ${s2}`), max);
          expect(one, `${f}${b} ${s1} / ${s2} @${max}`).not.toEqual(two);
        }),
        { numRuns: 20000 },
      );
    });

    it("⚕️ still invents nothing and reorders nothing: every line is pieces of its own name, in the order they were written", () => {
      fc.assert(
        fc.property(fc.oneof(chart, realChart, lookalikes.map((pair) => pair.map((name): ChartName => ({ name, kind: "drug" })))), width, (names, max) => {
          apart(names, max).forEach((lines, i) => {
            let from = 0;
            for (const line of lines) {
              for (const piece of line.split("…").map((p) => p.trim()).filter(Boolean)) {
                const at = names[i].name.indexOf(piece, from);
                expect(at, `"${piece}" of "${line}" in "${names[i].name}"`).toBeGreaterThanOrEqual(0);
                from = at + piece.length;
              }
            }
          });
        }),
        { numRuns: 5000 },
      );
    });

    it("a name shown without a mark (…) is the whole name", () => {
      fc.assert(
        fc.property(fc.oneof(chart, realChart, lookalikes.map((pair) => pair.map((name): ChartName => ({ name, kind: "text" })))), width, (names, max) => {
          apart(names, max).forEach((lines, i) => {
            if (lines.some((l) => l.includes("…"))) return;
            expect(lines.join("").replace(/\s+/g, "")).toBe(names[i].name.replace(/\s+/g, ""));
          });
        }),
        { numRuns: 3000 },
      );
    });

    it("a name is written the same whatever order the chart lists its names in", () => {
      fc.assert(
        fc.property(chart, fc.integer({ min: 13, max: 20 }), (names, max) => {
          const there = apart(names, max);
          const back = apart([...names].reverse(), max).reverse();
          expect(back).toEqual(there);
        }),
      );
    });

    it("a chart whose names are already different is left alone", () => {
      fc.assert(
        fc.property(chart, fc.integer({ min: 13, max: 20 }), (names, max) => {
          const alone = names.map((n) => nameLines(n.name, max, n.kind));
          const shown = alone.map((l) => l.map((x) => x.text).join("\n"));
          fc.pre(names.every((a, i) => names.every((b, j) => i === j || a.name === b.name || shown[i] !== shown[j])));
          expect(namesApart(names, max)).toEqual(alone);
        }),
      );
    });
  });
});

describe("nameLines — free text (a symptom, a test's name)", () => {
  it("wraps onto two lines at a word, and only the END is cut", () => {
    // The line turns before "3 days", not inside it: what is cut is cut after it.
    expect(texts("Fever for 3 days with chills and rigor", 15, "text")).toEqual(["Fever for", "3 days with ch…"]);
  });

  it("⚕️ two tests that start alike are told apart", () => {
    expect(texts("Serum bilirubin total", 15, "text")).toEqual(["Serum bilirubin", "total"]);
    expect(texts("Serum bilirubin direct", 15, "text")).toEqual(["Serum bilirubin", "direct"]);
  });

  it("is never taken apart as a medicine", () => {
    expect(texts("Pain. Left knee after a fall last week", 15, "text")).toEqual(["Pain. Left knee", "after a fall l…"]);
  });

  it("nothing to show is nothing drawn", () => {
    expect(nameLines("", 15, "text")).toEqual([]);
    expect(nameLines("   ", 15, "drug")).toEqual([]);
  });
});

describe("nameLines — for any name", () => {
  const word = fc.stringMatching(/^[A-Za-z0-9.+/()%-]{1,14}$/);
  const anyName = fc.array(word, { minLength: 1, maxLength: 8 }).map((ws) => ws.join(" "));
  const strip = (s: string) => s.replace(/^…/, "").replace(/…$/, "");

  it("never more than two lines, and none longer than the column", () => {
    fc.assert(
      fc.property(anyName, fc.integer({ min: 8, max: 24 }), fc.constantFrom<"drug" | "text">("drug", "text"), (name, max, kind) => {
        const lines = nameLines(name, max, kind);
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines.length).toBeLessThanOrEqual(2);
        for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(max);
      }),
    );
  });

  // A line may carry two marks — a shortened form AND a cut brand, "Ora… Tasty
  // S…" — so a line is one or more pieces, each standing where something was
  // left off after it.
  it("⚕️ invents nothing and reorders nothing: every line is pieces of the name, in the order they were written", () => {
    fc.assert(
      fc.property(anyName, fc.integer({ min: 8, max: 24 }), fc.constantFrom<"drug" | "text">("drug", "text"), (name, max, kind) => {
        let from = 0;
        for (const l of nameLines(name, max, kind)) {
          for (const piece of l.text.split("…").map((p) => p.trim()).filter(Boolean)) {
            const at = name.indexOf(piece, from);
            expect(at, `"${piece}" of "${l.text}" in "${name}"`).toBeGreaterThanOrEqual(0);
            from = at + piece.length;
          }
        }
      }),
      // Many more cases than the rest: the one slip this found — a space put
      // between a form and a brand that were typed without one — showed up in
      // two runs out of three at the usual number.
      { numRuns: 5000 },
    );
  });

  it("a mark (…) stands wherever something was left off — a name shown without one is the whole name", () => {
    fc.assert(
      fc.property(anyName, fc.integer({ min: 8, max: 24 }), fc.constantFrom<"drug" | "text">("drug", "text"), (name, max, kind) => {
        const lines = nameLines(name, max, kind);
        if (lines.some((l) => l.text.includes("…"))) return;
        // Compared without spaces: a line break stands where a space did (or,
        // in "Tab.Napa", where there was none).
        expect(lines.map((l) => l.text).join("").replace(/\s+/g, "")).toBe(name.replace(/\s+/g, ""));
      }),
    );
  });

  it("⚕️ a medicine's strength is never cut while it fits a line of its own — whatever the name in front of it", () => {
    const form = fc.constantFrom("", "Tablet. ", "Capsule (Enteric Coated). ", "Pot. ", "IV Infusion. ", "Oral Saline. ", "Mouthwash. ");
    const brand = fc.array(fc.stringMatching(/^[A-Z][a-z]{2,11}$/), { minLength: 1, maxLength: 4 }).map((ws) => ws.join(" + "));
    const strength = fc.constantFrom("5 mg", "0.5 mg", "500 mg", "5 mg + 20 mg", "400 mg/100 mg", "1 gm");
    fc.assert(
      fc.property(form, brand, strength, fc.integer({ min: 13, max: 22 }), (f, b, s, max) => {
        const label = `${f}${b} ${s}`;
        fc.pre(splitDrugLabel(label).after.trim() === s);
        const lines = nameLines(label, max, "drug").map((l) => l.text);
        expect(lines.join(" "), `${label} @${max}`).toContain(s);
      }),
    );
  });

  // What the rule for ONE name keeps, by itself, of "two medicines that are
  // different are not drawn under the same name" — and it is not all of it:
  // the first of these three leaves out brands that begin alike (`fc.pre`),
  // because a line of thirteen letters cuts them to the same thing. The whole
  // promise is `namesApart`'s, above, which sees the chart's names together.
  const HEADS = ["", "Tablet. ", "Capsule (Enteric Coated). ", "IV Infusion. ", "Oral Saline. ", "Mouthwash. ", "Pot. ", "inj "];
  const STRENGTHS = ["5 mg", "0.5 mg", "500 mg", "5 mg + 20 mg", "400 mg/100 mg", "1 gm/100 ml"];
  const brandWord = fc.stringMatching(/^[A-Z][a-z]{2,10}$/);

  it("⚕️ two medicines that differ only in their BRAND never get the same name", () => {
    fc.assert(
      fc.property(fc.constantFrom(...HEADS), brandWord, brandWord, fc.constantFrom(...STRENGTHS), fc.integer({ min: 13, max: 22 }), (head, a, b, s, max) => {
        fc.pre(a.slice(0, 3) !== b.slice(0, 3));
        const one = nameLines(`${head}${a} ${s}`, max, "drug").map((l) => l.text);
        const two = nameLines(`${head}${b} ${s}`, max, "drug").map((l) => l.text);
        expect(one, `${head}${a} / ${b} ${s} @${max}`).not.toEqual(two);
      }),
      { numRuns: 3000 },
    );
  });

  it("⚕️ …nor two that differ only in their STRENGTH", () => {
    fc.assert(
      fc.property(fc.constantFrom(...HEADS), brandWord, fc.constantFrom(...STRENGTHS), fc.constantFrom(...STRENGTHS), fc.integer({ min: 13, max: 22 }), (head, b, s1, s2, max) => {
        fc.pre(s1 !== s2);
        const one = nameLines(`${head}${b} ${s1}`, max, "drug").map((l) => l.text);
        const two = nameLines(`${head}${b} ${s2}`, max, "drug").map((l) => l.text);
        expect(one, `${head}${b} ${s1} / ${s2} @${max}`).not.toEqual(two);
      }),
      { numRuns: 3000 },
    );
  });

  it("⚕️ …nor two that differ only in a short first word that is part of the name (Pot. / Sod.)", () => {
    fc.assert(
      fc.property(fc.constantFrom("Pot", "Sod", "Cal", "Vit", "Mag", "Fe"), fc.constantFrom("Pot", "Sod", "Cal", "Vit", "Mag", "Fe"), brandWord, fc.constantFrom(...STRENGTHS), fc.integer({ min: 13, max: 22 }), (h1, h2, b, s, max) => {
        fc.pre(h1 !== h2);
        const one = nameLines(`${h1}. ${b.toLowerCase()} ${s}`, max, "drug").map((l) => l.text);
        const two = nameLines(`${h2}. ${b.toLowerCase()} ${s}`, max, "drug").map((l) => l.text);
        expect(one).not.toEqual(two);
      }),
      { numRuns: 3000 },
    );
  });

  it("⚕️ a medicine whose name and strength fit the column shows them whole, on the last line", () => {
    const form = fc.constantFrom("Tablet.", "Capsule.", "Injection.", "Capsule (Enteric Coated).", "Oral Solution.", "Syrup.");
    const brand = fc.stringMatching(/^[A-Z][a-z]{2,9}$/);
    const strength = fc.constantFrom("5 mg", "0.5 mg", "500 mg", "40 mg", "1 gm", "100 mg/5 ml");
    fc.assert(
      fc.property(form, brand, strength, fc.integer({ min: 12, max: 22 }), (f, b, s, max) => {
        const label = `${f} ${b} ${s}`;
        const rest = `${b} ${s}`;
        // Only when the label does not fit as it is, and the split reads it as written.
        fc.pre(label.length > max && rest.length <= max && splitDrugLabel(label).name === b);
        const lines = nameLines(label, max, "drug");
        expect(lines[lines.length - 1].text).toBe(rest);
      }),
    );
  });
});
