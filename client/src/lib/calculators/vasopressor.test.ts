import { describe, expect, it } from "vitest";
import { calculateVasopressor } from "./vasopressor";

// Every unit the vasopressor UI offers is converted to mcg/kg/min before the
// VIS multiplier — an unknown unit used to pass through as mcg/kg/min, so
// 50 ng/kg/min norepinephrine scored VIS 5000.
const vis = (name: string, dose: number, unit: string, weight = 50) =>
  calculateVasopressor({ weight, weightUnit: "kg", drugs: [{ name, dose, unit, enabled: true }] });

describe("vasopressor unit conversion", () => {
  it("mcg/kg/min is taken as is", () => {
    expect(vis("norepinephrine", 0.1, "mcg/kg/min").score).toBe(10);
  });
  it("mcg/min divides by weight", () => {
    expect(vis("norepinephrine", 5, "mcg/min").score).toBe(10); // 5/50 = 0.1
  });
  it("mg/hr → ×1000/60 ÷ weight", () => {
    expect(vis("norepinephrine", 0.3, "mg/hr").score).toBe(10); // 300/60/50 = 0.1
  });
  it("mcg/hr → ÷60 ÷ weight", () => {
    expect(vis("norepinephrine", 300, "mcg/hr").score).toBe(10); // 300/60/50 = 0.1
  });
  it("ng/kg/min → ÷1000", () => {
    expect(vis("norepinephrine", 50, "ng/kg/min").score).toBe(5); // 0.05 × 100
  });
  it("vasopressin units/min and units/hr", () => {
    expect(vis("vasopressin", 0.04, "units/min", 40).score).toBe(10); // 0.001 × 10000
    expect(vis("vasopressin", 2.4, "units/hr", 40).score).toBe(10);
  });
  it("an unknown unit is refused, not read as mcg/kg/min", () => {
    const r = vis("norepinephrine", 50, "mcg/kg/hr");
    expect(r.score).toBeUndefined();
    expect(r.label).toBe("Invalid");
    expect(r.interpretation).toContain("mcg/kg/hr");
  });
});
