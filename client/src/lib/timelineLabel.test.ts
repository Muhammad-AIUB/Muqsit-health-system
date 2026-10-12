import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nameLines } from "./timelineLabel";
import { splitDrugLabel } from "./rxShorthand";
import { configureProps } from "@/test/fc";

// The name written beside a bar or a lane of the Health-trend chart, in a
// column too narrow for the whole of it.
//
// ⚕️ It used to be one line, cut at its end. On a phone that column holds 12 to
// 15 characters, and in this app a medicine's label STARTS with its dosage
// form: "Tablet. Entaliv 0.5 mg" and "Tablet. Entaliv 1 mg" both read
// "Tablet. Enta…", and "Capsule (Enteric Coated). Sergel 40 mg" read
// "Capsule (Ente…" with the medicine gone. Two bars with one name — a dose
// change that cannot be read off the timeline (found in review, before it was
// released). What tells two bars apart is the brand and the strength, so that
// is what a narrow column keeps.
configureProps(300);

const texts = (name: string, max: number, kind: "drug" | "text" = "drug") => nameLines(name, max, kind).map((l) => l.text);

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
});

describe("nameLines — free text (a symptom, a test's name)", () => {
  it("wraps onto two lines at a word, and only the END is cut", () => {
    expect(texts("Fever for 3 days with chills and rigor", 15, "text")).toEqual(["Fever for 3", "days with chil…"]);
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

  // What the three reviews kept finding, as one rule: two medicines that are
  // different must not be drawn under the same name.
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
