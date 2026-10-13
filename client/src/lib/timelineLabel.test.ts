import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
// rule's own pattern — so that the two have to agree:
//   • a number is digits with points and commas inside it, wherever it stands
//     (also glued to a word: "B12"); a point in front of it is part of it
//     (".5");
//   • its unit is the word of one to five letters after it, or a per cent
//     sign, with or without spaces between;
//   • numbers joined by a stroke or a hyphen (30/70, 5-10) are ONE number —
//     unless that is more than a line can hold between two marks (`max - 2`; a
//     character less where it begins with a point), when each stands by itself;
//   • an amount longer than that is `loose`: its number is still whole, and a
//     mark may stand after it; a single number longer than that is not looked
//     for at all — no line could hold it.
interface FoundAmount { a: number; n: number; b: number; loose: boolean }
function amountsOf(name: string, max: number): FoundAmount[] {
  const digit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
  const letter = (c: string | undefined) => c !== undefined && /[A-Za-zµμ]/.test(c);
  const out: FoundAmount[] = [];
  const numberEnd = (i: number) => {
    let n = i;
    while (digit(name[n])) n++;
    while (".,".includes(name[n] ?? " ") && digit(name[n + 1])) { n++; while (digit(name[n])) n++; }
    return n;
  };
  const unitEnd = (n: number) => {
    let u = n;
    while (name[u] === " ") u++;
    if (name[u] === "%") return u + 1;
    let e = u;
    while (letter(name[e])) e++;
    return e > u && e - u <= 5 ? e : n;
  };
  // The number that stands from `i` to `n`, with its unit — if a line can hold the number.
  const take = (i: number, n: number) => {
    let a = i;
    if (name[a - 1] === "." && !letter(name[a - 2]) && !digit(name[a - 2])) a--;
    const limit = max - 2 - (name[a] === "." ? 1 : 0);
    if (n - a > limit) return false;
    const b = unitEnd(n);
    out.push({ a, n, b, loose: b - a > limit });
    return true;
  };
  let i = 0;
  while (i < name.length) {
    if (!digit(name[i])) { i++; continue; }
    const starts = [i];
    let n = numberEnd(i);
    while ("/-–".includes(name[n] ?? " ") && digit(name[n + 1])) { starts.push(n + 1); n = numberEnd(n + 1); }
    if (!take(i, n)) for (const s of starts) take(s, numberEnd(s));
    i = Math.max(n, unitEnd(n));
  }
  return out;
}

// Can the label's pieces be found in the name, in the order they are shown, so
// that no piece ENDS before a mark inside an amount (but after the number of a
// loose one), none BEGINS after a mark inside one — and where a line turns
// inside one (no mark: nothing is left off there) nothing after the turn is
// left off either? A piece may stand in a name more than once; what the reader
// has is the label, so any honest reading of it will do.
function amountsAreWhole(name: string, lines: string[], max: number): boolean {
  const amounts = amountsOf(name, max);
  const into = (p: number) => amounts.some(({ a, b }) => a < p && p < b);
  const endsInto = (p: number) => amounts.some(({ a, n, b, loose }) => a < p && p < b && !(loose && p === n));
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
      if (p.after && endsInto(end)) continue;
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

  // …and with that point read as no form's full stop, the label was left with
  // no brand and no strength to lay out: wrapped at a word, "Tab" stood over
  // "Clonazepam…" and the half milligram was not shown at all — a strength
  // that fits a line of its own (eighth review, before release).
  it("⚕️ …and the strength behind that point has its line, however long the name in front of it", () => {
    expect(texts("Tab Clonazepam .5 mg", 13)).toEqual(["Tab Clonazep…", ".5 mg"]);
    expect(texts("Tab Clonazepam .5 mg", 14)).toEqual(["Tab Clonazepam", ".5 mg"]);
  });

  // Four dots in a row again: the mark of a form left off, straight before a
  // name that begins with a decimal point.
  it("a name that begins with a decimal point stands apart from the mark of the form left off before it", () => {
    expect(texts("Tablet. .150 mg strength of it", 13)).toEqual(["… .150 mg", "strength of…"]);
    // …on the line the brand shares with the mark, too (the first fix was on one of two paths: ninth review).
    expect(texts("Tablet. .5 Rivotril 2 mg", 13)).toEqual(["… .5 Rivotril", "2 mg"]);
    expect(texts("Tab. .5 mg Rivotril 1 tab at night", 14)).toEqual(["… .5 mg Rivot…", "1 tab at night"]);
  });

  // What a line shows is looked for in the name, to know what its cut hid. A
  // short piece — the "25" left after a hidden "12125 mg" — was found at its
  // FIRST place, inside the hidden number, and what was brought into view
  // stopped there: "121", three digits of five (the same property; about one
  // label in four million pairs, in a line of ten letters; made-up names).
  it("⚕️ a piece of a line that also stands inside a hidden number is not taken for that number's end", () => {
    const chart: ChartName[] = ["1", "2"].map((x) => ({ name: `Longwordname-${x}2125 mg 25`, kind: "text" }));
    expect(namesApart(chart, 13).map((lines) => lines.map((l) => l.text))).toEqual([
      ["Long…12125 mg", "…25"],
      ["Long…22125 mg", "…25"],
    ]);
  });

  // A full stop that is no decimal point where it stands — straight after a
  // unit, "mg.25 ml" — would become one if what follows a mark began with it:
  // "… .25 ml", a quarter of what was written. (Found by the property that no
  // mark parts a number from its unit, on one run of many; made-up name.)
  it("⚕️ a full stop after a unit does not become a decimal point behind a mark", () => {
    expect(texts("Abcdefghijklmn5 mg.25 ml x", 13, "text")).toEqual(["Abcdefghijkl…", "…25 ml x"]);
    // After a per cent sign it IS the number's point, and stays with its number.
    expect(texts("Abcdefghijklmn5 %.25 ml x", 13, "text")).toEqual(["Abcdefghijkl…", "… .25 ml x"]);
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

  // ⚕️ The seventh review's labels. The rule had left a number alone where it
  // was glued to a word, and had not looked for an amount at all once it was
  // longer than a line could hold whole — so a twelve-character amount was cut
  // where the line ran out: "Penicillin 1…" for 1,200,000 IU.
  it("⚕️ a number glued to a word is not cut either, and its unit is not left standing after the mark", () => {
    expect(texts("Tab. Ciprofloxacin500mg twice daily", 17)).toEqual(["…Ciprofloxacin…", "twice daily"]);
    expect(texts("Tablet. Neurobion B12 Forte 500 mcg", 14)).toEqual(["…Neurobion B…", "500 mcg"]);
    expect(texts("Paracetamol500 mg twice daily", 13, "text")).toEqual(["Paracetamol…", "…twice daily"]);
  });

  it("⚕️ an amount too long to keep whole keeps its NUMBER whole: 1,200,000 IU is never \"1…\"", () => {
    expect(texts("Injection. Benzathine Penicillin 1,200,000 IU/vial", 13)).toEqual(["…Benzathine", "Penicillin…"]);
    // Twelve characters: whole where the line ends with it…
    expect(texts("Injection. Penicillin 1,200,000 IU/vial", 13)).toEqual(["…Penicillin", "1,200,000 IU…"]);
    // …and thirteen: the number, and the unit behind the mark.
    expect(texts("Injection. Abc 10,000,000 IU/vial", 13)).toEqual(["…Abc", "10,000,000…"]);
  });

  it("⚕️ a run of numbers too long for a line is cut at one of its strokes, never inside a number", () => {
    expect(texts("Tab Rimstar 4-FDC 150/75/400/275 mg", 14)).toEqual(["…Rimstar 4-FDC", "150/75/400/…"]);
    expect(texts("Tab Rimstar 4-FDC 150/75/400/275 mg", 13)).toEqual(["…Rimstar", "4-FDC 150/75…"]);
  });

  // What counts as the unit: the word of one to five letters after the number,
  // whatever stands between them.
  it("a unit is a word of one to five letters after the number — \"3 weeks\" is an amount, \"3 months\" and \"30 Penfill\" are a number and a word", () => {
    expect(texts("Fever for 3 weeks with chills and rigor", 15, "text")).toEqual(["Fever for", "3 weeks with c…"]);
    expect(texts("Fever for 3 months with chills and rigor", 15, "text")).toEqual(["Fever for 3", "months with ch…"]);
    expect(texts("Insulin Mixtard 30 Penfill", 13, "text")).toEqual(["Insulin", "Mixtard 30 P…"]);
  });

  // The limit of that guess, written down: "as" is taken for the unit of 30/70,
  // so the two go together — and where they do not fit together the 30/70 is
  // left off, on a line that would have held it by itself. It only ever hides.
  it("what a unit is, is a guess: a short word after a number is kept with it, and they are left off together", () => {
    expect(texts("Insulin Mixtard 30/70 as before", 15, "text")).toEqual(["Insulin Mixtard", "30/70 as before"]);
    expect(texts("Insulin Mixtard 30/70 as before", 14, "text")).toEqual(["Insulin", "Mixtard…"]);
  });

  it("…with two spaces between them as with one, and a dash between two numbers makes one of them", () => {
    expect(texts("IV Infusion. Napa 1  gm + 100  ml + 5 mg", 13)).toEqual(["IV Infu… Napa", "1  gm +…"]);
    expect(texts("Xxxxxxxxxxxxx abcdef 15–20 ml daily", 13, "text")).toEqual(["Xxxxxxxxxxxxx", "abcdef…"]);
  });

  // An amount that begins with a point has a character less: a space sets it
  // apart from a mark before it. Eleven characters is one too many for it to be
  // kept whole in thirteen, so its number stands and its unit goes.
  it("an amount that begins with a decimal point is kept whole up to one character less", () => {
    expect(texts("Xxxxxxxxxxxxx a .1234567 mg bcd", 13, "text")).toEqual(["Xxxxxxxxxxxxx", "a .1234567…"]);
    // Ten characters: whole, or not at all.
    expect(texts("Xxxxxxxxxxxxx ab .123456 mg bcd", 13, "text")).toEqual(["Xxxxxxxxxxxxx", "ab…"]);
    expect(texts("Xxxxxxxxxxxxx a .123456 mg bcd", 13, "text")).toEqual(["Xxxxxxxxxxxxx", "a .123456 mg…"]);
  });

  // The Bangla digits and letters are known too: a symptom typed in Bangla has
  // its number and the word after it kept together like any other.
  it("⚕️ a number and its unit written in Bangla are an amount too", () => {
    expect(texts("Xxxxxxxxxxxxx abcdef ১২ দিন daily", 13, "text")).toEqual(["Xxxxxxxxxxxxx", "abcdef…"]);
    expect(texts("Xxxxxxxxxxxxx abcdefgh ১২৩৪৫ x", 13, "text")).toEqual(["Xxxxxxxxxxxxx", "abcdefgh…"]);
  });

  // `\p{…}` classes and `matchAll` would have been the first in the doctor
  // app, and a browser without one (Firefox before 78) cannot load the page
  // that holds it. This file is in the page every doctor opens first.
  it("the rule is written without the two things an older browser does not have", () => {
    const source = readFileSync(resolve(__dirname, "timelineLabel.ts"), "utf8");
    expect(source).not.toMatch(/matchAll\(|\/[a-z]*u[a-z]*;|["`]u["`]\)/);
    expect(source.replace(/^\s*\/\/.*$/gm, "")).not.toContain("\\p{");
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
// that what they differ in is what is shown — in the first of four ways that
// leaves fewer pairs alike than before: the dosage form brought back beside
// the brand, the form on a line of its own, the cut line made to show both its
// ends, or the name read from the place itself. And a medicine's strength
// that is longer than a line is cut by the other strengths of that medicine on
// the chart, whether its name came out the same as another's or not.
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

  // What stands before the first full stop reads as a form the app does not
  // know, and two of those that begin alike are both shortened to the same
  // thing beside the brand ("Cal…", "Eye…"). They get a line of their own, and
  // the brand and the strength the line under it. (Read from the place they
  // part at, the first was "Calcium" over "Carb. + Vit.…" — no strength — and
  // the second "Eye" over "Drops. Moxif…".)
  it("⚕️ two names that part inside what reads as a form have it on a line of its own, with the brand and the strength under it", () => {
    expect(apart(drugs("Calcium Carb. + Vit. D3 500 mg", "Calcium Citr. + Vit. D3 500 mg"), 13)).toEqual([
      ["Calcium Carb.", "+ Vit.…500 mg"],
      ["Calcium Citr.", "+ Vit.…500 mg"],
    ]);
    expect(apart(drugs("Eye Drops. Moxifloxacin 0.5%", "Eye Ointment. Moxifloxacin 0.5%"), 13)).toEqual([
      ["Eye Drops.", "Moxiflox…0.5%"],
      ["Eye Ointment.", "Moxiflox…0.5%"],
    ]);
    // The form's line is not the quiet one here: it is what tells them apart.
    expect(namesApart(drugs("Eye Drops. Moxifloxacin 0.5%", "Eye Ointment. Moxifloxacin 0.5%"), 13).flat().some((l) => l.quiet)).toBe(false);
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

  // One of two names has a part that can be brought into view beside the start
  // of its line and the other has not (an amount too long for the room): the
  // first is written again; the second kept the lines it had — "5 mg +…", not
  // a line that ends in two marks — and, being a strength of the same
  // medicine, is then cut by what it has to be told from: its last part, alone
  // behind a mark (eighth review; it used to stay "5 mg +…").
  it("a name whose cut line cannot show both its ends is not given a line that ends in two marks", () => {
    expect(apart(drugs("Tablet. Exforge HCT 5 mg + 160 mg + 25 mg", "Tablet. Exforge HCT 5 mg + 160 mg + 1,00,000 IU"), 13)).toEqual([
      ["…Exforge HCT", "5 mg +…25 mg"],
      ["…Exforge HCT", "…1,00,000 IU"],
    ]);
    // …and a symptom, which has no strength to be cut by, keeps the lines it had.
    const texts = (...names: string[]): ChartName[] => names.map((name) => ({ name, kind: "text" }));
    expect(apart(texts("Pain in knee 5 days + 160 mg + 25 mg", "Pain in knee 5 days + 160 mg + 1,00,000 IU"), 13)).toEqual([
      ["Pain in knee", "5 days…25 mg"],
      ["Pain in knee", "5 days +…"],
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
    // …under a form that came back, and under one on a line of its own.
    const forms = apart(drugs(...["Tablet", "Injection"].flatMap((f) => [".5 mg", ".25 mg"].map((s) => `${f}. Exforge HCT 5 mg + 160 mg + ${s}`))), 13);
    expect(forms.map((l) => l[1])).toEqual(["5 mg… .5 mg", "5 mg… .25 mg", "5 mg… .5 mg", "5 mg… .25 mg"]);
    const above = apart(drugs(...["Delayed", "Extended"].flatMap((r) => [".5 mg", "2 mg"].map((s) => `Tablet (${r} Release). Rivotrilum ${s}`))), 13);
    expect(above).toEqual([
      ["Tablet (Dela…", "Rivotr… .5 mg"],
      ["Tablet (Dela…", "Rivotril…2 mg"],
      ["Tablet (Exte…", "Rivotr… .5 mg"],
      ["Tablet (Exte…", "Rivotril…2 mg"],
    ]);
    for (const l of [...written, ...lead, ...four, ...forms, ...above].flat()) expect(l).not.toContain("….");
  });

  // `splitDrugLabel` looks for the strength at the first word that begins with
  // a digit, so ".5 mg" was part of the brand — and where "Rivotrilum .5 mg"
  // did not fit a line, the strength was left off whole.
  it("⚕️ a strength that begins with a decimal point is a strength: it has its line, like any other", () => {
    expect(texts("Tablet (Delayed Release). Rivotrilum .5 mg", 13)).toEqual(["Tab… Rivotri…", ".5 mg"]);
    expect(texts("Tablet. Rivotrilum .5 mg", 13)).toEqual(["…Rivotrilum", ".5 mg"]);
  });

  it("a number glued to a word is part of the word two names part at, wherever in the word it stands", () => {
    const chart: ChartName[] = ["B6", "B9"].map((b) => ({ name: `Serum level of vitamin B12/${b}`, kind: "text" }));
    expect(apart(chart, 13)).toEqual([
      ["Serum level", "of…B12/B6"],
      ["Serum level", "of…B12/B9"],
    ]);
  });

  // The word two names part in may BEGIN inside an amount: after "B12", the
  // "pg" of "pg/mL-fasA" reads as the unit of that 12. What is shown then
  // starts at the amount — never inside it — and the place was asked for
  // "wherever the word fits", with the fit measured from the WORD: from the
  // amount, three letters further back, the line ran out before the letter
  // the names part at, and both read "…12 pg/mL-fa…". (Found by the pair
  // property below, about one run in four — a test whose outcome varies; in
  // the code since the seventh review's amounts.) Where the place cannot be
  // reached from the amount, it is shown from the place itself.
  // (Made-up names; what matters is the shape.)
  it("⚕️ a word that begins inside an amount is shown from the place two names part at, where the amount is too far back to reach it", () => {
    const chart: ChartName[] = ["A", "B"].map((x) => ({ name: `Serum vitamin B12 pg/mL-fas${x}`, kind: "text" }));
    expect(apart(chart, 13)).toEqual([
      ["Serum vitamin", "B12 pg/mL-f…A"],
      ["Serum vitamin", "B12 pg/mL-f…B"],
    ]);
    // …and where the place is itself the number of another amount ("A1 %"),
    // what has to be reached is the END of that amount: measured only to the
    // place, the line ran out between the two (ninth review).
    const inAnAmount: ChartName[] = ["1", "2"].map((x) => ({ name: `Serum B12 pg/mL-A${x} % of total`, kind: "text" }));
    expect(apart(inAnAmount, 14)).toEqual([
      ["Serum", "B12 pg…1 % of…"],
      ["Serum", "B12 pg…2 % of…"],
    ]);
    // Where the amount is near enough for the line to reach the place from
    // it, it is still shown from the amount — the number is in sight.
    const near: ChartName[] = ["A", "B"].map((x) => ({ name: `Serum vitamin of B12 pg/mL-${x} x`, kind: "text" }));
    expect(apart(near, 13)).toEqual([
      ["Serum vitami…", "…12 pg/mL-A x"],
      ["Serum vitami…", "…12 pg/mL-B x"],
    ]);
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

  // ⚕️ The strength under a form that came back is cut so that what it differs
  // in from the OTHER strengths of that medicine on the chart stays in sight.
  // Cut at its end whatever the chart held, it did two things (seventh review):
  it("⚕️ a tablet and an injection of one medicine in two strengths are four names — the form, and the part of the strength they differ in", () => {
    // …a tablet and an injection of one strength stayed under one name, because
    // the form over the cut strength was the name the other strength already had;
    const four = (max: number) => apart(drugs(...["Tablet", "Injection"].flatMap((f) => ["12.5 mg", "25 mg"].map((s) => `${f}. Edeloss 10 mg+160 mg+${s}`))), max);
    expect(four(13)).toEqual([
      ["Tabl… Edeloss", "10 mg…12.5 mg"],
      ["Tabl… Edeloss", "10 mg…25 mg"],
      ["Inje… Edeloss", "10 mg…12.5 mg"],
      ["Inje… Edeloss", "10 mg…25 mg"],
    ]);
    expect(four(15)).toEqual([
      ["Tablet. Edeloss", "10 mg…12.5 mg"],
      ["Tablet. Edeloss", "10 mg…25 mg"],
      ["Inject… Edeloss", "10 mg…12.5 mg"],
      ["Inject… Edeloss", "10 mg…25 mg"],
    ]);
    // …also where the strengths have two parts and differ in the second.
    expect(apart(drugs(...["Tablet", "Injection"].flatMap((f) => ["500 mg", "1000 mg"].map((s) => `${f}. Napa 12.5 mg+${s}`))), 13)).toEqual([
      ["Tablet. Napa", "…500 mg"],
      ["Tablet. Napa", "…1000 mg"],
      ["Injecti… Napa", "…500 mg"],
      ["Injecti… Napa", "…1000 mg"],
    ]);
  });

  it("⚕️ a dose change is not hidden to tell apart two ways of writing one medicine", () => {
    // …and with a third bar that is one of the two strengths written another
    // way ("Tab" for "Tablet."), the form came back over "10 mg+160 mg+…" for
    // both — no label on the chart said 12.5 or 25 any more. (The first bar,
    // which is not written again to be told from the others, said
    // "10 mg+160 mg+…" until the eighth review: the 25 was on the chart, the
    // 12.5 was not.)
    for (const max of [15, 16]) {
      const [low, high, typed] = apart(drugs("Tablet. Exforge HCT 10 mg+160 mg+12.5 mg", "Tablet. Exforge HCT 10 mg+160 mg+25 mg", "Tab Exforge HCT 10 mg+160 mg+25 mg"), max);
      expect(low, `@${max}`).toEqual(["…Exforge HCT", "10 mg…12.5 mg"]);
      expect(high[1], `@${max}`).toBe("10 mg…25 mg");
      expect(typed, `@${max}`).toEqual(["Tab Exforge HCT", "10 mg…25 mg"]);
      expect(high).not.toEqual(typed);
    }
  });

  // …and where the three labels were different to BEGIN with, nothing was
  // written again at all: the other way of writing was one the app does not
  // read as a form ("Tablet" with no full stop), or another form altogether,
  // and the first bar and the third both read "10 mg+160 mg+…" — 12.5 beside
  // 25, and no label said which (eighth review, before release). A strength
  // that has to be cut is cut by what it has to be told from wherever it
  // stands, not only under a form that came back.
  it("⚕️ a dose change is not hidden either where the labels were different to begin with", () => {
    for (const max of [15, 16]) {
      expect(apart(drugs("Tablet. Edeloss 10 mg+160 mg+12.5 mg", "Tablet. Edeloss 10 mg+160 mg+25 mg", "Tablet Edeloss 10 mg+160 mg+25 mg"), max), `@${max}`).toEqual([
        ["Tablet. Edeloss", "10 mg…12.5 mg"],
        ["…Edeloss 10", "mg+160 mg+25 mg"], // whole, and left as it is
        ["Tablet Edeloss", "10 mg…25 mg"],
      ]);
    }
    expect(apart(drugs("Tablet. Napa 5 mg+160 mg+12.5 mg", "Capsule (Enteric Coated). Napa 5 mg+160 mg+25 mg"), 13)).toEqual([
      ["Tablet. Napa", "5 mg…12.5 mg"],
      ["Capsule… Napa", "5 mg…25 mg"],
    ]);
  });

  // A THIRD strength of the medicine on the chart, different in every part,
  // made every part of the other two "a part that differs" — and the cut at
  // the end, which shows two of the three, counted for as much as the first
  // part with the last: "10 mg+160 mg…" again, for 12.5 and for 25. What is
  // kept is what tells a strength from the MOST of the others, not what shows
  // the most parts. (Seen in a browser, on a made-up chart, before this was
  // committed; every count below has TWO strengths of a medicine on a chart.)
  it("⚕️ …nor by a third strength of the medicine that differs in every part", () => {
    for (const [third, whole] of [["20 mg+50 mg", ["…Edeloss", "20 mg+50 mg"]], ["40 mg", ["Tablet.", "Edeloss 40 mg"]]] as const) {
      const [other, low, high] = apart(drugs(`Tablet. Edeloss ${third}`, "Tablet. Edeloss 10 mg+160 mg+12.5 mg", "Tablet Edeloss 10 mg+160 mg+25 mg"), 13);
      expect(other, third).toEqual(whole);
      expect(low, third).toEqual(["…Edeloss", "10 mg…12.5 mg"]);
      expect(high, third).toEqual(["Tablet Edelo…", "10 mg…25 mg"]);
    }
    // …and the part that tells it from the most of them may not be the FIRST
    // part that differs: beside a strength with another first part, the first
    // part alone told one of two others apart — as the cut at the end did —
    // and the second part, which tells both, was never tried.
    expect(apart(drugs("Tablet. Edeloss 40 mg", "Capsule (Enteric Coated). Edeloss 12.5 mg+500 mg", "Tablet Edeloss 12.5 mg+1000 mg"), 13)).toEqual([
      ["Tablet.", "Edeloss 40 mg"],
      ["Caps… Edeloss", "…500 mg"],
      ["Tablet Edelo…", "…1000 mg"],
    ]);
    // …with what follows it, where that fits (made-up strengths).
    expect(apart(drugs("Tablet. Edeloss 40 mg", "Capsule (Enteric Coated). Edeloss 12.5 mg+500 mg+5 mg", "Tablet Edeloss 12.5 mg+1000 mg+5 mg"), 13).slice(1)).toEqual([
      ["Caps… Edeloss", "…500 mg+5 mg"],
      ["Tablet Edelo…", "…1000 mg+5 mg"],
    ]);
    // …and alone between two marks, where it does not.
    expect(apart(drugs("Tablet. Edeloss 40 mg", "Capsule (Enteric Coated). Edeloss 12.5 mg+500 mg+12.5 mg+200 IU", "Tablet Edeloss 12.5 mg+1000 mg+12.5 mg+200 IU"), 13).slice(1)).toEqual([
      ["Caps… Edeloss", "…500 mg…"],
      ["Tablet Edelo…", "…1000 mg…"],
    ]);
  });

  // Told from the same number of others, the cut that shows MORE of what
  // differs is the one taken: both ends of a strength that differs at both.
  it("two strengths that differ in their first part and their last show both, under two ways of writing the form", () => {
    expect(apart(drugs("Tablet. Edeloss 5 mg+160 mg+12.5 mg", "Tablet Edeloss 10 mg+160 mg+25 mg"), 13)).toEqual([
      ["…Edeloss", "5 mg…12.5 mg"],
      ["Tablet Edelo…", "10 mg…25 mg"],
    ]);
  });

  it("…and only by the strengths of the SAME medicine: another medicine's on the chart changes nothing", () => {
    const alone = apart(drugs("Tablet. Edeloss 10 mg+160 mg+12.5 mg"), 13);
    expect(alone).toEqual([["…Edeloss", "10 mg+160 mg…"]]);
    expect(apart(drugs("Tablet. Edeloss 10 mg+160 mg+12.5 mg", "Tablet. Napa 5 mg+160 mg+25 mg"), 13)[0]).toEqual(alone[0]);
    // A short first word that is part of the name is part of the medicine:
    // potassium chloride is not told from sodium chloride by its strength.
    expect(apart(drugs("Pot. chloride 10 mg+160 mg+12.5 mg", "Sod. chloride 5 mg+160 mg+25 mg"), 13)[0]).toEqual(["Pot. chloride", "10 mg+160 mg…"]);
    // …and so is any first word that is not a dosage form.
    expect(apart(drugs("Potassium chloride 10 mg+160 mg+12.5 mg", "Sodium chloride 5 mg+160 mg+25 mg"), 13)[0]).toEqual(["Potassium", "chloride…"]);
    // The SAME strength under another form is nothing to be told from: with
    // no other strength on the chart a name keeps as much of its brand as two
    // lines hold.
    const one = "Tablet. Amlodipine + Olmesartan 10 mg+160 mg+12.5 mg";
    expect(apart(drugs(one), 13)[0]).toEqual(["…Amlodipine +", "Olmesartan…"]);
    expect(apart(drugs(one, "Capsule (Enteric Coated). Amlodipine + Olmesartan 10 mg+160 mg+12.5 mg"), 13)[0]).toEqual(["…Amlodipine +", "Olmesartan…"]);
    // With another strength of it there, the strength has the second line.
    expect(apart(drugs(one, "Capsule (Enteric Coated). Amlodipine + Olmesartan 5 mg+160 mg+12.5 mg"), 13)).toEqual([
      ["…Amlodipine…", "10 mg+160 mg…"],
      ["Cap… Amlodip…", "5 mg+160 mg+…"],
    ]);
  });

  // ⚕️ Giving the strength the second line cuts the BRAND at its end — and the
  // end of a brand may be all that tells two medicines apart: "Exforge HCT"
  // beside "Exforge", "Amlodipine + Atenolol" beside "Amlodipine +
  // Olmesartan". For one round (on `dev`, never released) the pass took the
  // line whenever the strings stayed different, and "Tablet Exforg…" stood
  // over a strength with nothing left to say it was the HCT (ninth review).
  // A name keeps the lines it has by itself where the rewrite would leave no
  // more of its brand in sight than it shares with another medicine on the
  // chart.
  it("⚕️ the strength does not take the line from the word that tells two MEDICINES apart", () => {
    // (At fifteen letters the cut leaves "Tablet Exforge…" — all of "Exforge",
    // and nothing to say whether more follows: no more than the two share.)
    for (const max of [14, 15]) {
      expect(apart(drugs("Tablet Exforge HCT 5 mg+160 mg+12.5 mg", "Tablet Exforge HCT 10 mg+160 mg+25 mg", "Tablet Exforge 10 mg+160 mg"), max), `@${max}`).toEqual([
        ["Tablet Exforge", "HCT 5 mg+…"],
        ["Tablet Exforge", "HCT 10 mg+…"],
        ["Tablet Exforge", "10 mg+160 mg"],
      ]);
    }
    const atenolol = apart(drugs(...["Olmesartan", "Atenolol"].flatMap((b) => ["5 mg+160 mg+12.5 mg", "50 mg+500 mg"].map((s) => `Tablet. Amlodipine + ${b} ${s}`))), 14)[2];
    expect(atenolol).toEqual(["…Amlodipine +", "Atenolol 5 mg…"]);
    // A medicine whose WHOLE name another one begins with has nothing to lose
    // by the cut — by itself it could not be told from the other either.
    expect(apart(drugs("Tablet. Amlodipine + Olmesartan 5 mg+160 mg+12.5 mg", "Tablet Amlodipine + Olmesartan 5 mg+160 mg+25 mg", "Tablet. Amlodipine + Olmesartan Plus 40 mg"), 14).slice(0, 2).map((l) => l[1])).toEqual(["5 mg…12.5 mg", "5 mg…25 mg"]);
    // Where the two medicines share nothing the cut could hide, the strength has the line as before.
    expect(apart(drugs("Tablet. Edeloss 10 mg+160 mg+12.5 mg", "Tablet Edeloss 10 mg+160 mg+25 mg", "Tablet. Exforge 10 mg+160 mg"), 13).slice(0, 2)).toEqual([
      ["…Edeloss", "10 mg…12.5 mg"],
      ["Tablet Edelo…", "10 mg…25 mg"],
    ]);
  });

  // The strength's line is refused, too, where it would be the line ANOTHER
  // strength takes: by themselves these two show the place they differ in
  // ("D400" / "D800", inside a part longer than a line), and with the
  // strength on a line of its own both would read "1 + 2 + Vit-…".
  // (Made-up names; found by the pair property with the refusal switched off.)
  it("⚕️ the strength does not take the line where two strengths would then read the same", () => {
    expect(apart(drugs("Calbo 1 + 2 + Vit-D400 softgel caps", "Calbo 1 + 2 + Vit-D800 softgel caps"), 13)).toEqual([
      ["Calbo 1 + 2 +", "Vit-D400 sof…"],
      ["Calbo 1 + 2 +", "Vit-D800 sof…"],
    ]);
  });

  it("the same medicine written with NO strength is no other strength to be told from", () => {
    expect(apart(drugs("Tablet. Exforge HCT", "Tablet Exforge HCT 10 mg+160 mg+25 mg"), 14)[1]).toEqual(["Tablet Exforge", "HCT 10 mg+…"]);
  });

  it("⚕️ the same medicine typed in another case is the same medicine", () => {
    expect(apart(drugs("Tablet. Exforge HCT 10 mg+160 mg+12.5 mg", "tab exforge hct 10 mg+160 mg+25 mg"), 13)).toEqual([
      ["…Exforge HCT", "10 mg…12.5 mg"],
      ["…exforge hct", "10 mg…25 mg"],
    ]);
  });

  it("a medicine written with no strength, beside the same medicine with one, keeps its lines: there is no strength to give a line to", () => {
    const brand = "Tablet. Amlodipine + Olmesartan + Hydrochlorothiazide";
    expect(apart(drugs(brand, `${brand} 5 mg+160 mg+12.5 mg`, `${brand} 5 mg+160 mg+25 mg`), 13)[0]).toEqual(["…Amlodipine +", "Olmesartan +…"]);
  });

  // Four strengths that differ in their first part AND their last, in two
  // forms: each name is told from seven others.
  it("⚕️ a tablet and an injection of one medicine in four strengths are eight names, each with the two parts its strength differs in", () => {
    const eight = ["Tablet", "Injection"].flatMap((f) => FOUR.map((s) => `${f}. Exforge HCT ${unspaced(s)}`));
    expect(apart(drugs(...eight), 13)).toEqual([
      ["Tab… Exforge…", "5 mg…12.5 mg"],
      ["Tab… Exforge…", "5 mg…25 mg"],
      ["Tab… Exforge…", "10 mg…12.5 mg"],
      ["Tab… Exforge…", "10 mg…25 mg"],
      ["Inj… Exforge…", "5 mg…12.5 mg"],
      ["Inj… Exforge…", "5 mg…25 mg"],
      ["Inj… Exforge…", "10 mg…12.5 mg"],
      ["Inj… Exforge…", "10 mg…25 mg"],
    ]);
  });

  // (Made-up strengths; what matters is which part differs.)
  it("the part of a strength that differs is the one kept: with what follows it where that fits, alone between two marks where it does not", () => {
    const two = (rest: string) => apart(drugs(...["Tablet", "Injection"].flatMap((f) => ["500 mg", "1000 mg"].map((s) => `${f}. Napa 12.5 mg+${s}${rest}`))), 13).map((l) => l[1]);
    expect(two("+5 mg")).toEqual(["…500 mg+5 mg", "…1000 mg+5 mg", "…500 mg+5 mg", "…1000 mg+5 mg"]);
    expect(two("+12.5 mg+200 IU")).toEqual(["…500 mg…", "…1000 mg…", "…500 mg…", "…1000 mg…"]);
  });

  // A part counts as shown by the cut at the end only if ALL of it is: here the
  // cut falls after "100 IU", two letters short of the end of the part the
  // strengths differ in. (Made-up strengths; what matters is where the cut falls.)
  it("a part the cut at the end shows all but the end of is not in sight: it is brought into view whole", () => {
    const chart = drugs(...["Tablet", "Injection"].flatMap((f) => ["12.5 mg+100 IU/g", "12.5 mg+100 IU/l"].map((s) => `${f}. Napa ${s}`)));
    expect(apart(chart, 15)).toEqual([
      ["Tablet. Napa", "…100 IU/g"],
      ["Tablet. Napa", "…100 IU/l"],
      ["Injection. Napa", "…100 IU/g"],
      ["Injection. Napa", "…100 IU/l"],
    ]);
  });

  it("a strength with nothing on the chart to be told from is cut at its end", () => {
    expect(apart(drugs("inj Edeloss 10 mg+160 mg+25 mg", "Tablet. Edeloss 10 mg+160 mg+25 mg"), 13)).toEqual([
      ["inj Edeloss", "10 mg+160 mg…"],
      ["Tabl… Edeloss", "10 mg+160 mg…"],
    ]);
  });

  // One medicine in two forms and two strengths, each strength longer than a
  // line: four names that differ at the two ENDS of the label. One pair was left
  // under one name, and the other shown with no strength at all (sixth review).
  // (This one medicine and these two strengths; every such chart of fixed pools
  // is counted further down.)
  it("⚕️ two forms of Salmeterol + Fluticasone in two strengths too long for a line are four names, at every width a phone has", () => {
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

  // ── What is NOT told apart, written down rather than left for a reader to
  // find (DEFECT-HM-NAMES, FUNCTIONAL-AUDIT.md). Four cases are known. Each is
  // a failing test until a way is found, with what is drawn today beside it.
  // (The bar's tooltip and the list under the chart carry every name in full.)
  const different = (names: ChartName[], max: number) => new Set(apart(names, max).map((l) => l.join(" / "))).size;

  // 1. Three places, eight strengths: there is no way left for the last pair.
  // They are left alike — as all eight were before. With a space round the
  // plus that is so in a line of thirteen to sixteen letters, with none in
  // thirteen and fourteen; from there up they are eight names. (For two
  // reviews this said "at thirteen letters", of the one width it had tried.)
  const EIGHT = [5, 10].flatMap((a) => [160, 320].flatMap((b) => [12.5, 25].map((c) => `Tablet. Exforge HCT ${a} mg + ${b} mg + ${c} mg`)));
  const UNSPACED_EIGHT = EIGHT.map((name) => name.replace(/ \+ /g, "+"));
  it.fails("DEFECT-HM-NAMES: eight strengths that differ in three places are eight names at every width", () => {
    for (let max = 13; max <= 20; max++) for (const eight of [EIGHT, UNSPACED_EIGHT]) expect(different(drugs(...eight), max), `@${max}`).toBe(8);
  });

  it("…today seven of those eight are different up to sixteen letters (fourteen, with no space round the plus) — the same seven however the list is ordered", () => {
    for (let max = 13; max <= 20; max++) {
      expect(different(drugs(...EIGHT), max), `@${max}`).toBe(max <= 16 ? 7 : 8);
      expect(different(drugs(...UNSPACED_EIGHT), max), `no space @${max}`).toBe(max <= 14 ? 7 : 8);
    }
    const written = apart(drugs(...EIGHT), 13).map((l) => l.join(" / "));
    const backwards = apart(drugs(...[...EIGHT].reverse()), 13).map((l) => l.join(" / ")).reverse();
    expect(backwards).toEqual(written);
  });

  // 2. Two forms of two medicines whose names differ only at the END of a long
  // brand, with no strength under either: the form on a line of its own tells
  // the first pair apart, and is then the name the second pair would get.
  // (Made-up names. Eighth review; the same in the code before it.)
  const BRAND_ENDS = ["Tablet", "Injection"].flatMap((f) => ["Forte", "Plus"].map((v) => `${f}. Vitamin B Complex ${v}`));
  it.fails("DEFECT-HM-NAMES: two forms of two medicines that differ at the end of a long brand are four names at every width", () => {
    for (let max = 13; max <= 20; max++) expect(different(drugs(...BRAND_ENDS), max), `@${max}`).toBe(4);
  });

  it("…today the tablet and the injection of one of them are one name up to seventeen letters", () => {
    expect(apart(drugs(...BRAND_ENDS), 13)).toEqual([
      ["Tablet.", "Vitamin B Co…"],
      ["…Vitamin B", "Complex Plus"],
      ["Injection.", "Vitamin B Co…"],
      ["…Vitamin B", "Complex Plus"],
    ]);
    for (let max = 13; max <= 20; max++) expect(different(drugs(...BRAND_ENDS), max), `@${max}`).toBe(max <= 17 ? 3 : 4);
  });

  // 3. The same with a strength written in BRACKETS, which is not read as a
  // strength at all (it does not begin with a digit) and so is the end of a
  // long brand. (Eighth review; the same in the code before it.)
  const BRACKETED = ["Suspension", "Syrup"].flatMap((f) => ["(400 mg+400 mg+30 mg)/5 ml", "(800 mg+800 mg+60 mg)/10 ml"].map((s) => `${f}. Entacyd Plus ${s}`));
  it.fails("DEFECT-HM-NAMES: two forms of a medicine in two strengths written in brackets are four names at every width", () => {
    for (let max = 13; max <= 20; max++) expect(different(drugs(...BRACKETED), max), `@${max}`).toBe(4);
  });

  it("…today the two forms of one strength are one name up to eighteen letters", () => {
    expect(apart(drugs(...BRACKETED), 13)).toEqual([
      ["Suspension.", "Entacyd Plus…"],
      ["…Entacyd Plus", "(800 mg+…"],
      ["Syrup.", "Entacyd Plus…"],
      ["…Entacyd Plus", "(800 mg+…"],
    ]);
    for (let max = 13; max <= 20; max++) expect(different(drugs(...BRACKETED), max), `@${max}`).toBe(max <= 18 ? 3 : 4);
  });

  // 4. Two names whose only difference is in the UNIT of an amount too long to
  // keep whole (twelve characters, in a line of thirteen — and so on up: an
  // amount long enough is too long for any line): such an amount keeps its
  // number and may lose its unit behind the mark, and the unit is all there
  // is to tell them by. Found by the property below (2026-10-13). The two
  // strengths of the last example are told apart even so — a strength has a
  // line to itself there, and this unit fits it; a longer amount would not.
  const LONG_AMOUNT = ["CFU", "RBC"].map((unit) => `Colony count in urine culture 1,00,000 ${unit} per ml`);
  const symptoms = (names: string[]): ChartName[] => names.map((name) => ({ name, kind: "text" }));
  it.fails("DEFECT-HM-NAMES: two names that differ only in the unit of an amount too long to keep whole are two names", () => {
    expect(different(symptoms(LONG_AMOUNT), 13)).toBe(2);
  });

  it("…today both are cut before the amount in thirteen letters; with one more, each shows its unit — and two strengths do in thirteen", () => {
    expect(apart(symptoms(LONG_AMOUNT), 13)).toEqual([
      ["Colony count", "in urine cul…"],
      ["Colony count", "in urine cul…"],
    ]);
    expect(apart(symptoms(LONG_AMOUNT), 14)).toEqual([
      ["Colony count…", "…1,00,000 CFU…"],
      ["Colony count…", "…1,00,000 RBC…"],
    ]);
    expect(apart(drugs(...["IU", "mg"].map((unit) => `Injection. Benzathine Penicillin 1,200,000 ${unit} deep IM`)), 13)).toEqual([
      ["…Benzathine…", "1,200,000 IU…"],
      ["…Benzathine…", "1,200,000 mg…"],
    ]);
  });

  // Two dosage forms the app does not know by name, that BEGIN alike — "Tablet
  // (Delayed Release)." and "Tablet (Extended Release)." — of one medicine, in
  // two strengths. Shortened to make room for the brand both forms were "Tab…";
  // read from the place they part at, both PAIRS came out as "Tablet" over
  // "(Delayed Rel…" / "(Extended Re…", so the first pair took those names and
  // the second stayed under one — with no medicine and no strength in either
  // (sixth review, where it was written down as a failing test; seventh, where
  // it was shown not to be a matter of thirteen letters only).
  it("⚕️ two forms that begin alike, of one medicine in two strengths, are four names — each with its form, its medicine and its strength", () => {
    const release = (brand: string) => ["Delayed", "Extended"].flatMap((r) => ["20 mg", "40 mg"].map((s) => `Tablet (${r} Release). ${brand} ${s}`));
    expect(apart(drugs(...release("Pantonix")), 13)).toEqual([
      ["Tablet (Dela…", "Pantoni…20 mg"],
      ["Tablet (Dela…", "Pantoni…40 mg"],
      ["Tablet (Exte…", "Pantoni…20 mg"],
      ["Tablet (Exte…", "Pantoni…40 mg"],
    ]);
    // With room for the brand and the strength under the form, nothing needs writing again.
    expect(apart(drugs(...release("Pantonix")), 15)).toEqual([
      ["Tablet (Delaye…", "Pantonix 20 mg"],
      ["Tablet (Delaye…", "Pantonix 40 mg"],
      ["Tablet (Extend…", "Pantonix 20 mg"],
      ["Tablet (Extend…", "Pantonix 40 mg"],
    ]);
    for (const brand of ["Pantonix", "Ondansetron", "Amlodipine + Olmesartan"]) {
      for (let max = 13; max <= 20; max++) {
        const written = apart(drugs(...release(brand)), max).map((l) => l.join(" / "));
        expect(new Set(written).size, `${brand} @${max}: ${written.join(" | ")}`).toBe(4);
        written.forEach((w, i) => expect(w, `${brand} @${max}`).toContain(i % 2 ? "40 mg" : "20 mg"));
      }
    }
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

    // ⚕️ A sample, and what a sample is worth. This draws 20,000 pairs a run,
    // each run a different 20,000. The seventh review's change to the rule
    // left about one pair in eighty thousand alike — this test failing one
    // run in four — and was released on a run that passed. On 2026-10-13 a
    // run failed; drawn two million times, 27 pairs were alike, where the
    // code before that change left none. Nineteen were a defect (a word that
    // begins inside an amount; fixed, and pinned further up). The rest are
    // one shape that is a limit: two names whose first difference is in the
    // UNIT of an amount too long to keep whole — such an amount keeps its
    // number, and its unit may go behind the mark. Those pairs are left out
    // here BY NAME and written down above as what they are (DEFECT-HM-NAMES,
    // the fourth case). An independent draw of two million then found two
    // more pairs alike, and two at real widths the first fix had missed
    // (ninth review); with those closed, three million pairs drawn at random
    // were all told apart but for that one shape. "Never", of a sample, means
    // "not in the pairs drawn" — and this one has been wrong before.
    const partInTheUnitOfALongAmount = (a: string, b: string, max: number) => {
      let same = 0;
      while (same < a.length && same < b.length && a[same] === b[same]) same++;
      return [a, b].some((name) => amountsOf(name, max).some(({ n, b: end, loose }) => loose && n <= same && same < end));
    };

    it("⚕️ TWO NAMES THAT ARE DIFFERENT ARE NEVER WRITTEN THE SAME", () => {
      fc.assert(
        fc.property(lookalikes, kind, kind, width, ([a, b], ka, kb, max) => {
          fc.pre(a.trim() !== b.trim());
          fc.pre(!partInTheUnitOfALongAmount(a.trim(), b.trim(), max));
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

    // Nothing is written again to tell apart names that are different already.
    // One thing still looks at the rest of such a chart: a medicine's strength
    // that is longer than a line, where another strength of that medicine is
    // on it — it has the second line to itself, cut by what it has to be told
    // from ("a dose change is not hidden either…", above). Until the eighth
    // review this said "is left alone", and it was: "10 mg+160 mg+…" twice.
    it("a chart whose names are already different is left alone — but for a strength too long for a line, beside another strength of its medicine", () => {
      fc.assert(
        fc.property(chart, fc.integer({ min: 13, max: 20 }), (names, max) => {
          const alone = names.map((n) => nameLines(n.name, max, n.kind));
          const shown = alone.map((l) => l.map((x) => x.text).join("\n"));
          fc.pre(names.every((a, i) => names.every((b, j) => i === j || a.name === b.name || shown[i] !== shown[j])));
          const of = names.map((n) => { const p = splitDrugLabel(n.name); return { brand: p.name, strength: p.after.trim() }; });
          namesApart(names, max).forEach((lines, i) => {
            const mayBeCutByAnother = names[i].kind === "drug" && of[i].strength.length > max
              && names.some((other, j) => other.kind === "drug" && of[j].brand === of[i].brand && of[j].strength !== of[i].strength);
            if (!mayBeCutByAnother || lines.length < 2) return expect(lines, `"${names[i].name}" @${max}`).toEqual(alone[i]);
            // Written again or not, nothing but its strength stands on the second line then — or the name is as it was.
            const strengthOnly = lines[1].text.split("…").map((p) => p.trim()).filter(Boolean).every((piece) => of[i].strength.includes(piece));
            expect(strengthOnly || shown[i] === lines.map((l) => l.text).join("\n"), `"${names[i].name}" @${max}: ${lines.map((l) => l.text).join(" / ")}`).toBe(true);
          });
        }),
      );
    });
  });
});

// ⚕️ Counted, not sampled. The property above — a random chart of confusable
// names — passed through two reviews while about one chart in a hundred of ONE
// shape was not told apart: a medicine in two forms and two strengths. A
// sample of a few thousand charts hardly ever draws that shape, and a test
// that says "every" has to go through every one (seventh review).
//
// So that shape, and the two the next reviews found — three bars, one of them
// a strength written another way; two bars under two forms — are gone through
// whole over fixed pools: every pair of forms, every pair of strengths, at
// every width a phone has. What is held is more than "the labels differ": two
// STRENGTHS of one medicine never show the same numbers — a dose change that
// reads "10 mg+160 mg+…" twice is two labels that differ and say nothing.
//
// The pools are made up. Their shapes are real: forms the app knows and forms
// it does not (two pairs of which begin alike), a form typed by hand, a brand
// of one word and of three, and strengths of one, two and three parts, written
// with and without a space round the plus. What is counted is these pools and
// no others: a strength in brackets, a brand that differs at its end, eight
// strengths of one tablet are among the known cases further up, not here.
describe("namesApart — counted over fixed pools, at every width from 13 to 20", () => {
  const FORMS = ["Tablet. ", "Injection. ", "Tab ", "inj ", "Capsule (Enteric Coated). ", "Tablet (Delayed Release). ", "Tablet (Extended Release). ", "Oral Suspension. ", "Oral Solution. ", "IV Infusion. "];
  const BRANDS = ["Napa", "Edeloss", "Exforge HCT", "Ondansetron", "Amlodipine + Olmesartan"];
  const STRENGTHS = [
    "40 mg", "20 mg", "12.5 mg+500 mg", "12.5 mg+1000 mg",
    "5 mg+160 mg+12.5 mg", "5 mg+160 mg+25 mg", "10 mg+160 mg+12.5 mg", "10 mg+160 mg+25 mg",
    "25 mcg+125 mcg", "50 mcg+250 mcg", "5 mg + 20 mg", "5 mg + 50 mg", "120 mg/5 ml", "100 IU/ml",
  ];
  const numbersShown = (lines: string[]) => (lines.join(" ").match(/\d+(?:[.,/]\d+)*/g) ?? []).join(" ");
  const lay = (names: string[], max: number) => namesApart(names.map((name): ChartName => ({ name, kind: "drug" })), max).map((l) => l.map((x) => x.text));

  it("⚕️ one medicine in two forms and two strengths is four names, and no two strengths of it show the same numbers", () => {
    let charts = 0;
    const wrong: string[] = [];
    for (let max = 13; max <= 20; max++) for (const brand of BRANDS) {
      for (let f1 = 0; f1 < FORMS.length; f1++) for (let f2 = f1 + 1; f2 < FORMS.length; f2++) {
        for (let s1 = 0; s1 < STRENGTHS.length; s1++) for (let s2 = s1 + 1; s2 < STRENGTHS.length; s2++) {
          const names = [FORMS[f1], FORMS[f2]].flatMap((f) => [STRENGTHS[s1], STRENGTHS[s2]].map((s) => `${f}${brand} ${s}`));
          const lines = lay(names, max);
          charts++;
          const four = new Set(lines.map((l) => l.join("\n"))).size === 4;
          // names 0 and 2 have one strength, 1 and 3 the other
          const told = [[0, 1], [2, 3], [0, 3], [1, 2]].every(([i, j]) => numbersShown(lines[i]) !== numbersShown(lines[j]));
          if (!(four && told)) wrong.push(`@${max} ${names.join(" | ")}  =>  ${lines.map((l) => l.join(" / ")).join(" | ")}`);
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(wrong).toHaveLength(0);
    expect(charts).toBe(163_800);
  }, 300_000);

  // The same medicine and strength written two ways — picked from the list as
  // "Tablet." and typed by hand as "Tab" — beside another strength of it. The
  // two that are one medicine may be told apart; the dose change may not be
  // what is given up for it.
  //
  // ⚕️ This was counted over FOUR ways of writing a form, all of them words the
  // app knows, and said of "one of them written another way". With the third
  // bar under a form it does not know by name — or under "Tablet" with no full
  // stop, which is read as the start of the brand — the three labels were
  // different to begin with, nothing was written again, and 288 of the 524,160
  // charts of the ten forms above read "10 mg+160 mg+…" for 12.5 and for 25
  // (eighth review, before release). It is counted now over every way a form
  // is written here: those ten, a form word with no full stop, and none.
  const WRITTEN = [...FORMS, "Tablet ", "Injection ", ""];
  it("⚕️ two strengths of a medicine, and one of them written another way, are three names — and the other strength never shows the same numbers", () => {
    let charts = 0;
    const wrong: string[] = [];
    for (let max = 13; max <= 20; max++) for (const brand of ["Edeloss", "Amlodipine + Olmesartan"]) {
      for (const f1 of WRITTEN) for (const f2 of WRITTEN) {
        if (f1 === f2) continue;
        for (const s1 of STRENGTHS) for (const s2 of STRENGTHS) {
          if (s1 === s2) continue;
          const names = [`${f1}${brand} ${s1}`, `${f1}${brand} ${s2}`, `${f2}${brand} ${s2}`];
          const lines = lay(names, max);
          charts++;
          const three = new Set(lines.map((l) => l.join("\n"))).size === 3;
          const told = numbersShown(lines[0]) !== numbersShown(lines[1]) && numbersShown(lines[0]) !== numbersShown(lines[2]);
          if (!(three && told)) wrong.push(`@${max} ${names.join(" | ")}  =>  ${lines.map((l) => l.join(" / ")).join(" | ")}`);
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(wrong).toHaveLength(0);
    expect(charts).toBe(454_272);
  }, 600_000);

  // Two bars: one medicine in two forms (or written two ways) AND two
  // strengths. Their labels differ whatever is cut — so nothing was written
  // again, and where both strengths were longer than a line both were cut at
  // their end: "…Napa" over "5 mg+160 mg+…" beside "Capsule… Napa" over the
  // same, for 12.5 and for 25 (eighth review). Two labels that show NO number
  // count as showing the same numbers.
  it("⚕️ two strengths of a medicine under two forms are two names that never show the same numbers", () => {
    let charts = 0;
    const wrong: string[] = [];
    for (let max = 13; max <= 20; max++) for (const brand of ["Napa", "Edeloss", "Amlodipine + Olmesartan"]) {
      for (const f1 of WRITTEN) for (const f2 of WRITTEN) {
        if (f1 === f2) continue;
        for (let s1 = 0; s1 < STRENGTHS.length; s1++) for (let s2 = s1 + 1; s2 < STRENGTHS.length; s2++) {
          const names = [`${f1}${brand} ${STRENGTHS[s1]}`, `${f2}${brand} ${STRENGTHS[s2]}`];
          const lines = lay(names, max);
          charts++;
          if (numbersShown(lines[0]) === numbersShown(lines[1])) wrong.push(`@${max} ${names.join(" | ")}  =>  ${lines.map((l) => l.join(" / ")).join(" | ")}`);
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(wrong).toHaveLength(0);
    expect(charts).toBe(340_704);
  }, 600_000);

  // ⚕️ What the strength's line may NOT cost: the word that tells two medicines
  // apart. Two medicines that begin alike — "Exforge" and "Exforge HCT" — one
  // of them in two strengths, under every pair of five ways of writing a form.
  // A name that came out by itself with more of its medicine in sight than the
  // two share must still have that (ninth review: for one round, on `dev`, the
  // strength took the line and "Tablet Exforg…" stood for the HCT — worse than
  // the release before it in one chart in forty of this pool).
  it("⚕️ a medicine's name is never cut back to what it shares with another medicine on the chart, to make room for a strength", () => {
    const ALIKE = [["Exforge", "Exforge HCT"], ["Napa Extra", "Napa Extend"], ["Seretide Evohaler", "Seretide Accuhaler"], ["Amlodipine + Olmesartan", "Amlodipine + Atenolol"], ["Calbo", "Calbo-D"], ["Neuro-B", "Neuro-B Forte"], ["Co-Diovan", "Co-Diovan Plus"]];
    const WAYS = ["Tablet. ", "Tablet ", "Tab ", "Capsule (Enteric Coated). ", ""];
    const LONG = ["12.5 mg+500 mg", "12.5 mg+1000 mg", "5 mg+160 mg+12.5 mg", "5 mg+160 mg+25 mg", "10 mg+160 mg+12.5 mg", "10 mg+160 mg+25 mg", "25 mcg+125 mcg", "50 mcg+250 mcg", "10 mg+160 mg", "40 mg"];
    const inSight = (medicine: string, lines: string[]) => {
      const written = lines.join(" ");
      let n = medicine.length;
      while (n > 0 && (medicine[n - 1] === " " || !written.includes(medicine.slice(0, n)))) n--;
      return n;
    };
    let charts = 0;
    const wrong: string[] = [];
    for (let max = 13; max <= 20; max++) for (const [a, b] of ALIKE) for (const f1 of WAYS) for (const f2 of WAYS) {
      let shared = 0;
      while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
      for (let s1 = 0; s1 < LONG.length; s1++) for (let s2 = s1 + 1; s2 < LONG.length; s2++) for (const s3 of [LONG[s1], LONG[9]]) {
        const medicines = [a, a, b];
        const names = [`${f1}${a} ${LONG[s1]}`, `${f1}${a} ${LONG[s2]}`, `${f2}${b} ${s3}`];
        const alone = names.map((n) => nameLines(n, max, "drug").map((l) => l.text));
        const lines = lay(names, max);
        charts++;
        names.forEach((name, i) => {
          // (A name that came out the same as another by itself is written again to be told apart: another matter.)
          if (alone.some((other, k) => k !== i && names[k] !== name && other.join("\n") === alone[i].join("\n"))) return;
          if (inSight(medicines[i], lines[i]) <= shared && shared < inSight(medicines[i], alone[i])) wrong.push(`@${max} ${name}  =>  ${lines[i].join(" / ")}  (by itself: ${alone[i].join(" / ")})`);
        });
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(wrong).toHaveLength(0);
    expect(charts).toBe(126_000);
  }, 600_000);
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
