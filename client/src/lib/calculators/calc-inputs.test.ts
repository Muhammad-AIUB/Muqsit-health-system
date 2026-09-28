import { describe, expect, it } from "vitest";
import { INPUT_OVERRIDES } from "./calc-inputs";
import { getCalculator } from "./calculator-registry";

describe("Original AIH — response to therapy", () => {
  const field = INPUT_OVERRIDES["original-aih"].find((f) => f.id === "responseTherapy")!;

  it("offers a 0-point option so the pre-treatment cutoffs are reachable", () => {
    expect(field.options?.map((o) => o.value)).toEqual([0, 2, 3]);
  });

  it("scores a pre-treatment 16 as Definite (>15), not the post-treatment >17", () => {
    const inputs = {
      sex: 2, alpAstAltRatio: 2, serumGlobulinsIgg: 2, antibodies: 3, optionalAutoantibodies: 0,
      ama: 0, hepatitisViralMarkers: 3, hepatotoxicDrugs: 1, alcoholIntake: 0, interfaceHepatitis: 3,
      lymphoplasmacytic: 0, rosetting: 0, biliaryChanges: 0, otherChanges: 0, autoimmuneDisease: 0,
      responseTherapy: 0,
    };
    const r = getCalculator("original-aih")!.calculate(inputs);
    expect(r.score).toBe(16);
    expect(r.label).toBe("Definite AIH");
  });
});

describe("Cockcroft-Gault sex options", () => {
  it("offers male and female so the required choice can be made", () => {
    const sex = getCalculator("cockcroft-gault")!.inputs.find((f) => f.id === "sex")!;
    expect(sex.options?.map((o) => o.value)).toEqual(["male", "female"]);
  });
});
