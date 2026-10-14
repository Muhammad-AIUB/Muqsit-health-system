// ⚕️ "Is this medicine on the pad already?" — the one answer the "Add Bulk
// Medicine" box and Drug history's "Move to Rx" both use. Two ways it can be
// wrong, and both reach a prescription: two medicines taken for one (the second
// is reported as "already on ℞" and left off), and one medicine taken for two
// (the same line is written twice). The labels are made up.

import { describe, expect, it } from "vitest";
import { brandWordsOf, instructionKey, medicineKey, MedicineMap, sameMedicine } from "@/lib/medicineKey";

const same = (a: string, b: string) => sameMedicine(a, b);

describe("medicineKey — the same medicine, however its label was typed", () => {
  const PICKED = "Tablet. Napa 500 mg"; // as the medicine list writes it

  it.each([
    "Tablet. Napa 500mg",
    "tablet. napa 500 MG",
    "  Tablet.   Napa  500 mg ",
    "Tab Napa 500 mg",
    "TAB. NAPA 500MG",
    "Tablet.\tNapa 500 mg",
    "Tablet. Napa 500 mg N/A",
  ])("%s is the medicine the list writes as Tablet. Napa 500 mg", (typed) => {
    expect(same(typed, PICKED)).toBe(true);
  });

  it.each([
    ["another strength", "Tablet. Napa 665 mg"],
    ["a strength ten times as large", "Tablet. Napa 5000 mg"],
    ["another unit", "Tablet. Napa 500 mcg"],
    ["another dosage form", "Syrup. Napa 500 mg"],
    ["a form with a qualifier", "Tablet (Extended Release). Napa 500 mg"],
    ["another brand that begins the same", "Tablet. Napa Extra 500 mg"],
    ["no strength at all", "Tablet. Napa"],
    ["no dosage form, and another strength", "Napa 665 mg"],
  ])("⚕️ %s is another medicine: %s", (_what, other) => {
    expect(same(other, PICKED)).toBe(false);
  });

  it("a combination keeps every one of its strengths", () => {
    expect(same("Tablet. Edeloss 20 mg+50 mg", "tablet. edeloss 20mg+50mg")).toBe(true);
    expect(same("Tablet. Edeloss 20 mg+50 mg", "Tablet. Edeloss 20 mg+25 mg")).toBe(false);
    expect(same("Tablet. Exforge HCT 5 mg+160 mg+12.5 mg", "Tablet. Exforge HCT 5 mg+160 mg+25 mg")).toBe(false);
  });

  it("a decimal point is part of the strength", () => {
    expect(same("Tablet. Entaliv 0.5 mg", "Tablet. Entaliv 5 mg")).toBe(false);
    expect(same("Tablet. Entaliv 0.5 mg", "tab entaliv 0.5mg")).toBe(true);
  });

  // ⚕️ A decimal typed with no 0 in front of it. The key under this one reads
  // the label's FIRST full stop as the end of a dosage form (`Tablet.`), so in
  // `Tab Rivotril .5 mg` the decimal point was taken for one — and 0.5 mg and
  // 5 mg came out as one medicine: ticked at the same dose, the second was
  // reported "already on ℞" and left off (found in review, before release).
  it.each([
    ["Tab Rivotril .5 mg", "Tab Rivotril. 5 mg"],
    ["Tab Alprazolam .25 mg", "Tab Alprazolam. 25 mg"],
    ["Rivotril .5 mg", "Rivotril. 5 mg"],
    ["Tablet. Rivotril .5 mg", "Tablet. Rivotril 5 mg"],
  ])("⚕️ %s is not %s: a point with a digit after it is a decimal point", (decimal, whole) => {
    expect(same(decimal, whole)).toBe(false);
  });

  it("…and `.5 mg` is the 0.5 mg the medicine list writes", () => {
    expect(same("Tab Rivotril .5 mg", "Tablet. Rivotril 0.5 mg")).toBe(true);
    expect(same("Tablet. Alprazolam .25 mg", "Tablet. Alprazolam 0.25 mg")).toBe(true);
  });

  // More of how a label is TYPED, set aside: the same medicine written with
  // other spaces, or with the full stop after its form left off. Each pair is
  // one line of a prescription that would otherwise go on the pad twice.
  it.each([
    ["spaces round the plus", "Tablet. Edeloss 20 mg + 50 mg", "Tablet. Edeloss 20 mg+50 mg"],
    ["spaces round the stroke", "Injection. Napa 1 gm / 100 ml", "Injection. Napa 1 gm/100 ml"],
    ["a space before the percent sign", "Cream. Fusid 2 %", "Cream. Fusid 2%"],
    ["a space after a number, before a word the key does not know as a unit", "Injection. Insulin 100 units/ml", "Injection. Insulin 100units/ml"],
    ["no space before a bracket", "Capsule(Enteric Coated). Sergel 20 mg", "Capsule (Enteric Coated). Sergel 20 mg"],
    ["spaces inside a bracket", "Capsule ( Enteric Coated ). Sergel 20 mg", "Capsule (Enteric Coated). Sergel 20 mg"],
    ["a full stop at the end of the label", "Tablet. Napa 500 mg.", "Tablet. Napa 500 mg"],
    ["the form written out with no full stop after it", "Tablet Napa 500 mg", "Tablet. Napa 500 mg"],
    ["…another form so", "Syrup Napa 120 mg/5 ml", "Syrup. Napa 120 mg/5 ml"],
    ["…and with a decimal strength", "Tablet Entaliv 0.5 mg", "Tablet. Entaliv 0.5 mg"],
    ["…and with a full stop at the end", "Tablet Napa.", "Tablet. Napa"],
    // A form that HAS its full stop, after a qualifier, is not touched: the
    // full form and its short word are one form, qualifier and all (review).
    ["a qualified form written out, as the list writes it", "Capsule (Enteric Coated). Sergel 40 mg", "Cap (enteric coated). Sergel 40mg"],
    ["…another", "Tablet (Extended Release). Napa 500 mg", "Tab (Extended Release). Napa 500 mg"],
    ["…a qualifier with no bracket", "Tablet SR. Napa 500 mg", "Tab SR. Napa 500 mg"],
    ["…another", "Injection SC. Napa 1 gm", "Inj SC. Napa 1 gm"],
    ["…a short word that is part of the name", "Tablet Vit. B Complex", "Tab Vit. B Complex"],
    ["a decimal after a plus", "Tablet. Exa 1 mg+.5 mg", "Tablet. Exa 1 mg + 0.5 mg"],
    ["a decimal after a bracket", "Tablet. Exa (.5 mg)", "Tablet. Exa (0.5 mg)"],
    // …but a point glued to a word is not padded: here it is the form's own.
    ["a full stop glued to the form's short word", "Inj.5-FU 500 mg", "Injection. 5-FU 500 mg"],
    // The form rule follows the key's own: five words before a full stop are a
    // name, not a form, so the form written out in front of them is still read.
    ["the form written out before a long name that has a full stop in it", "Tablet Napa Extra Night Time. 500 mg", "Tablet. Napa Extra Night Time. 500 mg"],
  ])("%s is how it was typed: %s", (_what, typed, picked) => {
    expect(same(typed, picked)).toBe(true);
  });

  // What setting the typing aside must NOT do.
  it.each([
    ["a unit written another way is not converted", "Tablet. Napa 1 gm", "Tablet. Napa 1 g"],
    ["a form written out is still that form", "Tablet Napa 500 mg", "Capsule. Napa 500 mg"],
    ["a qualifier is kept when the form is written out", "Tablet (Extended Release) Napa 500 mg", "Tablet. Napa 500 mg"],
    ["another strength of a combination, however it is spaced", "Tablet. Edeloss 20 mg + 50 mg", "Tablet. Edeloss 20 mg+25 mg"],
    ["a word that only begins like a form", "Tablets Napa 500 mg", "Tablet. Napa 500 mg"],
    ["two numbers with a space between them are not one number", "Tablet. Edeloss 20 50 mg", "Tablet. Edeloss 2050 mg"],
  ])("⚕️ %s: %s", (_what, a, b) => {
    expect(same(a, b)).toBe(false);
  });

  // The key drops a trailing "N/A" (the medicine list writes one where it has
  // no strength). A label that is nothing but that is still a label: it must
  // not come out as the empty key, which every blank line shares.
  it("a label the key reads as nothing is compared as it was typed, without its capitals — never as a blank", () => {
    expect(medicineKey("N/A")).toBe("n/a");
    expect(same("N/A", "")).toBe(false);
    expect(medicineKey("")).toBe("");
    expect(medicineKey("   ")).toBe("");
    expect(medicineKey(".")).toBe("."); // a full stop alone is still not a blank
  });

  it("never throws on what is not a label", () => {
    expect(medicineKey(undefined as unknown as string)).toBe("");
    expect(medicineKey(null as unknown as string)).toBe("");
    expect(sameMedicine(undefined as unknown as string, "Tablet. Napa 500 mg")).toBe(false);
  });
});

// ⚕️ A label typed WITHOUT its dosage form is the same medicine as one with a
// form, where the name and the strength are the same (physician's decision,
// 2026-10-14). The strength is never set aside: Sergel 20 mg and Sergel 40 mg
// are two medicines, with a form or without one. And two forms are never one —
// not even through a label that has none.
describe("sameMedicine — a label with no dosage form", () => {
  it.each([
    ["Napa 500 mg", "Tablet. Napa 500 mg"],
    ["napa 500mg", "Tablet. Napa 500 mg"],
    ["Napa 500 mg", "Tab Napa 500 mg"],
    ["Sergel 40 mg", "Capsule (Enteric Coated). Sergel 40 mg"],
    ["Edeloss 20 mg + 50 mg", "Tablet. Edeloss 20 mg+50 mg"],
    ["Rivotril .5 mg", "Tablet. Rivotril 0.5 mg"],
    ["Napa", "Tablet. Napa"],
    ["Napa 500 mg", "Napa 500mg"],
  ])("⚕️ %s is %s", (bare, picked) => {
    expect(same(bare, picked)).toBe(true);
    expect(same(picked, bare)).toBe(true);
  });

  it.each([
    ["Sergel 20 mg", "Capsule (Enteric Coated). Sergel 40 mg"],
    ["Sergel 40 mg", "Capsule (Enteric Coated). Sergel 20 mg"],
    ["Sergel 20 mg", "Sergel 40 mg"],
    ["Napa 500 mg", "Tablet. Napa 665 mg"],
    ["Napa 500 mg", "Tablet. Napa"],
    ["Napa", "Tablet. Napa 500 mg"],
    ["Napa 500 mg", "Tablet. Napa Extra 500 mg"],
    ["Napa 500 mg", "Tablet. Napa 500 mcg"],
    ["Edeloss 20 mg+50 mg", "Tablet. Edeloss 20 mg+25 mg"],
    ["Rivotril 5 mg", "Tablet. Rivotril 0.5 mg"],
  ])("⚕️ %s is not %s: the strength or the name differs", (a, b) => {
    expect(same(a, b)).toBe(false);
    expect(same(b, a)).toBe(false);
  });

  it("⚕️ two forms are never one medicine — not even through a label with none", () => {
    expect(same("Tablet. Napa 500 mg", "Napa 500 mg")).toBe(true);
    expect(same("Napa 500 mg", "Suppository. Napa 500 mg")).toBe(true);
    expect(same("Tablet. Napa 500 mg", "Suppository. Napa 500 mg")).toBe(false);
    expect(same("Capsule (Enteric Coated). Sergel 40 mg", "Capsule. Sergel 40 mg")).toBe(false);
  });

  it("a blank is no medicine, and matches none", () => {
    expect(same("", "")).toBe(false);
    expect(same("  ", "Tablet. Napa 500 mg")).toBe(false);
    expect(same("Tablet.", "Tablet. Napa 500 mg")).toBe(false);
  });
});

// The question the pad is asked over many lines at once: is this medicine —
// and, for a line, this dose, food and duration — among them?
describe("MedicineMap", () => {
  it("finds a medicine by the same rule, and gives back what was held under it", () => {
    const map = new MedicineMap<string>();
    map.add("Tablet. Napa 500 mg", "a");
    map.add("Napa 665 mg", "b");
    expect(map.get("tab napa 500mg")).toEqual(["a"]);
    expect(map.get("Napa 500 mg")).toEqual(["a"]);
    expect(map.get("Tablet. Napa 665 mg")).toEqual(["b"]);
    expect(map.get("Syrup. Napa 500 mg")).toEqual([]);
    expect(map.has("Syrup. Napa 665 mg")).toBe(true); // "Napa 665 mg" has no form
    expect(map.has("Tablet. Napa 1000 mg")).toBe(false);
    expect(map.size).toBe(2);
  });

  it("a medicine held in two forms: a label with no form finds both, a form finds its own", () => {
    const map = new MedicineMap<string>();
    map.add("Tablet. Napa 500 mg", "tablet");
    map.add("Suppository. Napa 500 mg", "suppository");
    expect(map.get("Napa 500 mg")).toEqual(["tablet", "suppository"]);
    expect(map.get("Tablet. Napa 500 mg")).toEqual(["tablet"]);
  });

  it("with a line's dose, food and duration beside the medicine, both have to match", () => {
    const map = new MedicineMap<true>();
    map.add("Tablet. Napa 500 mg", true, "1+0+1|after meal|5 days");
    expect(map.has("Napa 500 mg", "1+0+1|after meal|5 days")).toBe(true);
    expect(map.has("Tablet. Napa 500 mg", "1+1+1|after meal|5 days")).toBe(false);
    expect(map.has("Tablet. Napa 500 mg")).toBe(false);
  });

  it("holds no blank medicine", () => {
    const map = new MedicineMap<true>();
    map.add("", true);
    map.add("   ", true);
    expect(map.size).toBe(0);
    expect(map.has("")).toBe(false);
  });
});

// What the medicine chart is asked for, to price a line: the first word of the
// brand. Taken as written AND with how it was typed set aside, so that the
// form written out with no full stop (`Tablet Napa`) still finds Napa, and a
// brand that begins with a number and a letter (`3 G Cef`) still finds `3`.
describe("brandWordsOf", () => {
  it.each([
    ["Tablet. Napa 500 mg", ["napa"]],
    ["Tab Napa 500mg", ["napa"]],
    ["Napa 500 mg", ["napa"]],
    ["Capsule (Enteric Coated). Sergel 40 mg", ["sergel"]],
    ["  TABLET.   NAPA  500 mg ", ["napa"]],
    ["Tablet Napa 500 mg", ["tablet", "napa"]],
    ["Injection. 3 G Cef 1 gm", ["3", "3g"]],
    // A form of five words is not read as one (`normaliseDrugKey` takes four
    // at most), so the word after its full stop is asked for too (review).
    ["Dry Powder Inhalation Capsule (DPI). Seretide 250 mcg", ["dry", "seretide"]],
  ])("%s → %j", (label, words) => {
    expect(brandWordsOf(label)).toEqual(words);
  });

  it("a blank label asks for nothing", () => {
    expect(brandWordsOf("")).toEqual([]);
    expect(brandWordsOf(undefined as unknown as string)).toEqual([]);
  });
});

// ⚕️ The dose, the food and the duration: how they were TYPED is set aside —
// capitals and spaces, nothing else (physician's decision, 2026-10-14). A
// different notation is a different instruction: whether `1-0-1` is `1+0+1`,
// or `1/2` is `0.5`, is not this function's to decide.
describe("instructionKey — a dose, a food or a duration, however it was spaced or capitalised", () => {
  it.each([
    ["1 + 0 + 1", "1+0+1"],
    [" 1+0+1 ", "1+0+1"],
    ["1/2 + 0 + 1/2", "1/2+0+1/2"],
    ["1 / 2+0+1 / 2", "1/2+0+1/2"],
    ["After meal", "after meal"],
    ["AFTER  MEAL", "After meal"],
    ["2 hr before meal", "2hr before meal"],
    ["5 days", "5 Days"],
    ["5 days", "5days"],
    ["7 দিন", "7দিন"],
    ["1+0+1 ( চামচ )", "1+0+1 (চামচ)"],
    ["1+0+1(চামচ)", "1+0+1 (চামচ)"],
    ["Continue", "continue"],
  ])("%s is %s", (a, b) => {
    expect(instructionKey(a)).toBe(instructionKey(b));
  });

  it.each([
    ["1+0+1", "1-0-1"],
    ["1+0+1", "101"],
    ["1+0+1", "1+0+2"],
    ["1/2+0+1/2", "0.5+0+0.5"],
    ["2 2+2", "22+2"],
    ["After meal", "After meal."],
    ["After meal", "Before meal"],
    ["5 days", "5 day"],
    ["5 days", "15 days"],
    ["1 month", "1 week"],
  ])("⚕️ %s is not %s", (a, b) => {
    expect(instructionKey(a)).not.toBe(instructionKey(b));
  });

  it("a blank is blank, and never throws", () => {
    expect(instructionKey("")).toBe("");
    expect(instructionKey("   ")).toBe("");
    expect(instructionKey(undefined as unknown as string)).toBe("");
  });
});

// ⚕️ BAN writes the ℞ cells in Bangla (physician's decision, 2026-10-14), so the
// same instruction can stand on the pad in either language — and "already on
// ℞" must still see one instruction, or Move to Rx writes the line twice.
describe("instructionKey — the same instruction written in Bangla", () => {
  it.each([
    ["খাবারের আগে", "Before meal"],
    ["খাবারের ২ ঘণ্টা পরে", "2 hr after meal"],
    ["১+০+১", "1+0+1"],
    ["১/২+০+১/২", "1/2+0+1/2"],
    ["৭ দিন", "7 days"],
    ["২ সপ্তাহ", "2 week"],
    ["চলবে", "Continue"],
    ["রাতে", "at night"],
  ])("%s is %s", (a, b) => {
    expect(instructionKey(a)).toBe(instructionKey(b));
  });

  it.each([
    ["খাবারের আগে", "After meal"],
    ["১+০+১", "1+0+2"],
    ["৭ দিন", "7 week"],
  ])("⚕️ %s is not %s", (a, b) => {
    expect(instructionKey(a)).not.toBe(instructionKey(b));
  });
});
