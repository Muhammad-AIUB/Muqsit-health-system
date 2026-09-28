import { describe, expect, it } from "vitest";
import { calculateTSAT } from "./tsat";

const tsat = (tibcMethod: "tibc" | "transferrin", tibcValue: number, tibcUnit: string, serumIron = 100, serumIronUnit = "µg/dL") =>
  calculateTSAT({ serumIron, serumIronUnit, tibcMethod, tibcValue, tibcUnit });

describe("TSAT unit handling", () => {
  it("TIBC in µg/dL and µmol/L", () => {
    expect(tsat("tibc", 400, "µg/dL").score).toBe(25);
    expect(tsat("tibc", 400 / 5.585, "µmol/L").score).toBe(25);
  });
  it("transferrin in mg/dL, g/L and g/dL (factor 1.389, mass-unit arithmetic)", () => {
    expect(tsat("transferrin", 288, "mg/dL").score).toBe(25); // 288 × 1.389 = 400.0
    expect(tsat("transferrin", 2.88, "g/L").score).toBe(25);
    expect(tsat("transferrin", 0.288, "g/dL").score).toBe(25);
  });
  it("refuses unsupported (method, unit) pairs instead of passing the number through", () => {
    // TIBC 2.5 g/L used to be read as 2.5 µg/dL → TSAT 3200%.
    for (const [m, u] of [["tibc", "g/L"], ["tibc", "g/dL"], ["transferrin", "µmol/L"], ["transferrin", "µg/dL"]] as const) {
      const r = tsat(m, 2.5, u);
      expect(r.label).toBe("Invalid");
      expect(r.score).toBeUndefined();
      expect(r.interpretation).toContain(u);
    }
  });
  it("refuses an unsupported serum iron unit", () => {
    const r = tsat("tibc", 400, "µg/dL", 100, "mg/L");
    expect(r.label).toBe("Invalid");
    expect(r.score).toBeUndefined();
  });
});
