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
});

// One name at a time cannot promise what the chart needs: two lines of
// thirteen letters cannot hold every medicine's label, and whatever one rule
// leaves off, some pair of medicines differs in exactly that. The fourth
// review found them with real labels, each pair under ONE name: a tablet and
// an injection of the same medicine and strength, two salts of calcium, two
// combinations that begin with the same ingredient.
//
// So the names of one chart are laid out TOGETHER (`namesApart`): each as
// `nameLines` writes it, and any that came out the same are laid out again so
// that what they differ in is what is shown.
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

  it("⚕️ two combinations that begin with the same ingredient show the one they differ in", () => {
    expect(apart(drugs("Tablet. Amlodipine + Atenolol 5 mg + 50 mg", "Tablet. Amlodipine + Losartan 5 mg + 50 mg"), 15)).toEqual([
      ["Tablet. Amlodi…", "Atenolol 5 mg…"],
      ["Tablet. Amlodi…", "Losartan 5 mg…"],
    ]);
  });

  it("⚕️ two strengths too long for a line, that differ only at their end, show that end", () => {
    expect(apart(drugs("Tablet. Exforge HCT 5 mg + 160 mg + 12.5 mg", "Tablet. Exforge HCT 5 mg + 160 mg + 25 mg"), 13)).toEqual([
      ["Tablet. Exfo…", "12.5 mg"],
      ["Tablet. Exfo…", "25 mg"],
    ]);
  });

  it("a symptom or a test's name is told from its neighbour the same way", () => {
    const chart: ChartName[] = [
      { name: "Pain in the left knee since last Friday, worse on stairs", kind: "text" },
      { name: "Pain in the left knee since last Friday, worse at night", kind: "text" },
    ];
    expect(apart(chart, 15)).toEqual([
      ["Pain in the le…", "on stairs"],
      ["Pain in the le…", "at night"],
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
      ["Amlodipine +…", "…Forte"],
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
      ["Tablet. Amlo…", "Atenolol 5 mg"],
      ["Tablet. Amlo…", "Rosuvastatin…"],
      ["Tablet. Amlo…", "Atorvastatin…"],
    ]);
  });

  // A dosage form is only looked for in a MEDICINE. A symptom that happens to
  // have a full stop after its first word is read from where it differs, like
  // any other text — not shortened to "Fev… With ch…" as if "Fever." were a form.
  it("a symptom is not taken apart as a medicine to be told from another", () => {
    const chart: ChartName[] = ["3 days", "5 days"].map((d) => ({ name: `Fever. With chills and rigor for the last ${d}`, kind: "text" }));
    expect(apart(chart, 13)).toEqual([
      ["Fever. With…", "3 days"],
      ["Fever. With…", "5 days"],
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
        fc.property(chart, width, (names, max) => {
          for (const lines of apart(names, max)) {
            expect(lines.length).toBeGreaterThanOrEqual(1);
            expect(lines.length).toBeLessThanOrEqual(2);
            for (const l of lines) expect(l.length).toBeLessThanOrEqual(max);
          }
        }),
      );
    });

    it("⚕️ still invents nothing and reorders nothing: every line is pieces of its own name, in the order they were written", () => {
      fc.assert(
        fc.property(fc.oneof(chart, lookalikes.map((pair) => pair.map((name): ChartName => ({ name, kind: "drug" })))), width, (names, max) => {
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
        fc.property(fc.oneof(chart, lookalikes.map((pair) => pair.map((name): ChartName => ({ name, kind: "text" })))), width, (names, max) => {
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
