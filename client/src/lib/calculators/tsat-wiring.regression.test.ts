import { describe, expect, it } from "vitest";
import { CALCULATORS } from "./calculator-registry";
import { calculateTSAT } from "./tsat";

// Regression for 35e7039 — "TSAT reads the TIBC unit the doctor picked".
//
// CalcRenderer stores a field's unit under `<fieldId>Unit`, and the TSAT field
// is `tibcValue` — so the unit arrives as `tibcValueUnit`. The registry used to
// read `inputs.tibcUnit`, which is never set, and silently fell back to µg/dL:
// a TIBC entered in µmol/L was calculated as if it were µg/dL.
//
// No clinical number is asserted here that the suite does not already hold:
// the wiring must hand `calculateTSAT` exactly the unit that was picked, so the
// registry's answer is compared with `calculateTSAT` called directly, using the
// inputs from tsat.test.ts.
const tsat = CALCULATORS.find((c) => c.id === "tsat")!;
const strip = <T extends { timestamp?: unknown }>(r: T) => ({ ...r, timestamp: undefined });

describe("35e7039: the TSAT calculator passes on the TIBC unit the doctor picked", () => {
  it("is registered", () => {
    expect(tsat).toBeTruthy();
  });

  it.each([
    ["tibc", 400, "µg/dL"],
    ["tibc", 400 / 5.585, "µmol/L"],
    ["transferrin", 288, "mg/dL"],
    ["transferrin", 2.88, "g/L"],
    ["transferrin", 0.288, "g/dL"],
  ] as const)("%s %s %s gives the same result as calculateTSAT with that unit", (tibcMethod, tibcValue, unit) => {
    const viaRegistry = tsat.calculate({ serumIron: 100, serumIronUnit: "µg/dL", tibcMethod, tibcValue, tibcValueUnit: unit });
    const direct = calculateTSAT({ serumIron: 100, serumIronUnit: "µg/dL", tibcMethod, tibcValue, tibcUnit: unit });
    expect(strip(viaRegistry)).toEqual(strip(direct));
  });

  it("a unit other than µg/dL changes the answer — it is not ignored", () => {
    const inMicromol = tsat.calculate({ serumIron: 100, serumIronUnit: "µg/dL", tibcMethod: "tibc", tibcValue: 400 / 5.585, tibcValueUnit: "µmol/L" });
    const sameNumberAsMicrogram = tsat.calculate({ serumIron: 100, serumIronUnit: "µg/dL", tibcMethod: "tibc", tibcValue: 400 / 5.585, tibcValueUnit: "µg/dL" });
    expect(inMicromol.score).toBe(25); // the value tsat.test.ts pins for this input
    expect(sameNumberAsMicrogram.score).not.toBe(inMicromol.score);
  });

  it("an unsupported unit is refused through the registry too, not passed through as µg/dL", () => {
    const r = tsat.calculate({ serumIron: 100, serumIronUnit: "µg/dL", tibcMethod: "tibc", tibcValue: 2.5, tibcValueUnit: "g/L" });
    expect(r.label).toBe("Invalid");
    expect(r.score).toBeUndefined();
  });
});
