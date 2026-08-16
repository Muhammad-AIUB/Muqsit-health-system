import { describe, it, expect } from "vitest";
import { normaliseDrugKey } from "./rxHabitKey";

// ⚕️ THE COPIES MUST AGREE.
//
// `rxHabitKey.ts` mirrors `server/src/rx-habits/normalise.ts#normaliseDrugKey`,
// and the expectations below are deliberately the SAME literal strings as
// `server/src/rx-habits/normalise.spec.ts`. If either copy is edited alone, one
// of the two suites goes red — which is the only thing standing between a
// well-meaning edit and a generic-based prescribing alert that silently stops
// firing on the fastest path through the editor.
//
// Changing an expectation here means changing it in normalise.spec.ts too, and
// only after checking why the rule exists.

describe("normaliseDrugKey (client mirror) — exact outputs", () => {
  const cases: Array<[string, string]> = [
    ["  TABLET.   Napa   500mg ", "tablet. napa 500mg"],
    ["Tablet. Napa 500 mg", "tablet. napa 500mg"],
    ["Cap. Tycil 500 mg", "capsule. tycil 500mg"],
    ["tab Seclo", "tablet. seclo"],
    ["inj. Halopid", "injection. halopid"],
    ["Tablet (Enteric Coated). Pantonix 40 mg", "tablet (enteric coated). pantonix 40mg"],
    ["Tablet (Modified Release). Dimerol MR 30 mg", "tablet (modified release). dimerol mr 30mg"],
    ["Tablet (Extended Release). Alfumax ER 10 mg", "tablet (extended release). alfumax er 10mg"],
    ["SC Injection. Diasulin", "sc injection. diasulin"],
    ["SC Inj. Diasulin", "sc injection. diasulin"],
    ["Oral Solution. Avolac 3.35 gm/5 ml", "oral solution. avolac 3.35gm/5ml"],
    ["Tablet. Bicozin N/A", "tablet. bicozin"],
    ["Tablet. N/A Brand 5mg", "tablet. n/a brand 5mg"],
    ["Metformin 500 mg", "metformin 500mg"],
    ["Napa 0.5 mg", "napa 0.5mg"],
    ["", ""],
    ["   ", ""],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(normaliseDrugKey(input)).toBe(expected);
    });
  }
});

describe("normaliseDrugKey (client mirror) — what must NEVER fold", () => {
  it("two strengths of one brand", () => {
    expect(normaliseDrugKey("Tablet. Napa 500mg")).not.toBe(normaliseDrugKey("Tablet. Napa 665mg"));
  });

  it("enteric-coated vs plain", () => {
    expect(normaliseDrugKey("Capsule (Enteric Coated). Sergel 20 mg")).not.toBe(
      normaliseDrugKey("Capsule. Sergel 20 mg"),
    );
  });

  it("SC vs plain injection", () => {
    expect(normaliseDrugKey("SC Injection. Diasulin")).not.toBe(
      normaliseDrugKey("Injection. Diasulin"),
    );
  });

  it("different units are never converted", () => {
    expect(normaliseDrugKey("Tablet. X 0.5g")).not.toBe(normaliseDrugKey("Tablet. X 500mg"));
  });
});
