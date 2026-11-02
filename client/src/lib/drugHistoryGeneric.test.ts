// ⚕️ Drug history read by the generic (physician, 02/11/2026). Display only;
// nothing is guessed: no generic or two different generics → shown as stored.
import { describe, expect, it } from "vitest";
import { genericOf, withGeneric } from "./drugHistoryGeneric";
import type { ChartRow } from "./monthlyCost";

const row = (brandName: string, genericName: string | null, dosageForm: string | null, strength: string | null): ChartRow =>
  ({ brandName, genericName, dosageForm, strength, priceRaw: null });
const ROWS = [
  row("Napa", "Paracetamol", "Tablet", "500 mg"),
  row("Napa", "Paracetamol", "Suppository", "500 mg"),
  row("Sergel", "Esomeprazole", "Capsule (Enteric Coated)", "20 mg"),
  row("Twogen", "Alpha", "Tablet", "10 mg"),
  row("Twogen", " alpha ", "Tablet", "10 mg"),
  row("Twogen", "Beta", "Tablet", "20 mg"),
  row("Twogen", "Gamma", "Tablet", "20 mg"),
  row("Nogen", null, "Tablet", "5 mg"),
];

describe("genericOf", () => {
  it("one generic: the brand replaced, the form and strength exactly as stored", () => {
    expect(genericOf("Tablet. Napa 500 mg", ROWS)).toEqual({ kind: "generic", generic: "Paracetamol", shown: "Tablet. Paracetamol 500 mg" });
    expect(genericOf("Capsule (Enteric Coated). Sergel 20 mg", ROWS)).toMatchObject({ shown: "Capsule (Enteric Coated). Esomeprazole 20 mg" });
  });

  it("matches as the app does everywhere: how it was typed set aside, form and strength not", () => {
    expect(genericOf("tab napa 500mg", ROWS)).toMatchObject({ kind: "generic", shown: "tab Paracetamol 500mg" });
    // A label with no form is every form of that name and strength — one generic here.
    expect(genericOf("Napa 500 mg", ROWS)).toMatchObject({ kind: "generic", shown: "Paracetamol 500 mg" });
    // Another strength is another medicine: not in the chart.
    expect(genericOf("Tablet. Napa 1000 mg", ROWS)).toEqual({ kind: "none" });
    expect(genericOf("Capsule (Enteric Coated). Sergel 40 mg", ROWS)).toEqual({ kind: "none" });
  });

  it("two spellings of one generic are one", () => {
    expect(genericOf("Tablet. Twogen 10 mg", ROWS)).toMatchObject({ kind: "generic", generic: "Alpha" });
  });

  it("two different generics: not guessed", () => {
    expect(genericOf("Tablet. Twogen 20 mg", ROWS)).toEqual({ kind: "several", generics: ["Beta", "Gamma"] });
  });

  it("not in the chart, or in it with no generic: none", () => {
    expect(genericOf("Tablet. Handtyped 5 mg", ROWS)).toEqual({ kind: "none" });
    expect(genericOf("Tablet. Nogen 5 mg", ROWS)).toEqual({ kind: "none" });
    expect(genericOf("Tablet. Napa 500 mg", [])).toEqual({ kind: "none" });
    expect(genericOf("", ROWS)).toEqual({ kind: "none" });
  });
});

describe("withGeneric", () => {
  it("replaces only the name", () => {
    expect(withGeneric("Tablet. Napa Extra 500 mg+65 mg", "Paracetamol + Caffeine")).toBe("Tablet. Paracetamol + Caffeine 500 mg+65 mg");
    expect(withGeneric("Syrup. Napa", "Paracetamol")).toBe("Syrup. Paracetamol");
  });
  it("gives nothing for a label with no name or a blank generic", () => {
    expect(withGeneric("", "Paracetamol")).toBeNull();
    expect(withGeneric("Tablet. Napa 500 mg", "  ")).toBeNull();
  });
});
