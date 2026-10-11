import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { spacedParts } from "./findingParts";
import { calculateANC } from "./calculators/anc";
import { configureProps } from "@/test/fc";

// A stored result is its parts joined by commas with no space
// ("Hb:13.5g/dL,WBC:12000"), and the Investigation popup's "Added results"
// panel shows it with a space after each comma, to be read.
//
// ⚕️ It put that space after EVERY comma — the one inside a number too. A
// calculator's "ANC 1,500 cells/µL" was shown as "ANC 1, 500 cells/µL", and a
// platelet count typed the way it is written here, "1,50,000", as
// "1, 50, 000": a number the doctor entered, shown as three. The rule on this
// screen is to show a value exactly as it was typed.
configureProps(300);

describe("spacedParts — room between the parts of a result", () => {
  it("puts a space after the comma between two parts", () => {
    expect(spacedParts("Hb:13.5g/dL,WBC:12000")).toBe("Hb:13.5g/dL, WBC:12000");
    expect(spacedParts("Region:Chest,Report:normal")).toBe("Region:Chest, Report:normal");
  });

  it("leaves a comma that already has its space, and one that ends the text", () => {
    expect(spacedParts("clear, no focal lesion")).toBe("clear, no focal lesion");
    expect(spacedParts("normal,")).toBe("normal,");
    expect(spacedParts("")).toBe("");
  });

  it("⚕️ a number written with its thousands is shown as it was written", () => {
    expect(spacedParts("ANC 1,500 cells/µL — Mild neutropenia. Usually minimal risk.")).toBe("ANC 1,500 cells/µL — Mild neutropenia. Usually minimal risk.");
    expect(spacedParts("Total Blood Volume: 5,200 mL | RBC Volume: 2,340 mL")).toBe("Total Blood Volume: 5,200 mL | RBC Volume: 2,340 mL");
    expect(spacedParts("CCI 12,400 ≥ 7,500")).toBe("CCI 12,400 ≥ 7,500");
    expect(spacedParts("1,234,567")).toBe("1,234,567");
    expect(spacedParts("1,500.5")).toBe("1,500.5");
  });

  it("⚕️ …and one written the lakh way", () => {
    expect(spacedParts("1,50,000")).toBe("1,50,000");
    expect(spacedParts("PLT:1,50,000/cmm,Hb:9g/dL")).toBe("PLT:1,50,000/cmm, Hb:9g/dL");
    expect(spacedParts("12,34,567")).toBe("12,34,567");
  });

  it("⚕️ what a calculator hands over reads the same in the panel", () => {
    const { interpretation } = calculateANC({ neutrophilsPct: 50, bandsPct: 0, wbcCount: 3 });
    expect(interpretation).toContain("1,500");
    expect(spacedParts(`ANC: 1500 cells/µL — ${interpretation}`)).toBe(`ANC: 1500 cells/µL — ${interpretation}`);
  });

  // Two digits with a comma between them are not always one number: the parts
  // of a result are joined by a comma too. Only what is WRITTEN as a grouped
  // number — groups of three after the first, or the lakh way — is kept
  // together; anything else is two parts, and reads as two.
  it("a comma between two digits that is not a grouped number still parts two values", () => {
    expect(spacedParts("BIRADS:4,2 cm mass")).toBe("BIRADS:4, 2 cm mass");
    expect(spacedParts("METs:10,3 mm ST depression")).toBe("METs:10, 3 mm ST depression");
    expect(spacedParts("Vol:1500,300")).toBe("Vol:1500, 300");
    expect(spacedParts("0.5,100")).toBe("0.5, 100");
    expect(spacedParts("12/09/2026,13/09/2026")).toBe("12/09/2026, 13/09/2026");
  });

  it("a grouped number straight after another part keeps together, and is still set apart from it", () => {
    expect(spacedParts("WBC:12000,1,500")).toBe("WBC:12000, 1,500");
    expect(spacedParts("12,000,5")).toBe("12,000, 5");
  });

  it("⚕️ for any text: it only ever ADDS spaces — no character is changed, dropped or moved", () => {
    const piece = fc.stringMatching(/^[A-Za-z0-9:.,/ %µ-]{0,24}$/);
    fc.assert(
      fc.property(piece, (raw) => {
        const shown = spacedParts(raw);
        expect(shown.replace(/ /g, "")).toBe(raw.replace(/ /g, ""));
        expect(shown.length).toBeGreaterThanOrEqual(raw.length);
        expect(spacedParts(shown)).toBe(shown); // shown again, it does not grow
      }),
    );
  });

  it("⚕️ for any grouped number: it comes out exactly as it went in", () => {
    const western = fc.tuple(fc.integer({ min: 1, max: 999 }), fc.array(fc.integer({ min: 0, max: 999 }), { minLength: 1, maxLength: 3 }))
      .map(([head, groups]) => [String(head), ...groups.map((g) => String(g).padStart(3, "0"))].join(","));
    const lakh = fc.tuple(fc.integer({ min: 1, max: 99 }), fc.array(fc.integer({ min: 0, max: 99 }), { maxLength: 2 }), fc.integer({ min: 0, max: 999 }))
      .map(([head, pairs, last]) => [String(head), ...pairs.map((p) => String(p).padStart(2, "0")), String(last).padStart(3, "0")].join(","));
    fc.assert(
      fc.property(fc.oneof(western, lakh), fc.constantFrom("", "PLT:", "ANC ", "Hb:9g/dL,PLT:"), fc.constantFrom("", " cells/µL", "/cmm", " mL,Hb:9"), (n, before, after) => {
        expect(spacedParts(before + n + after)).toContain(n);
      }),
    );
  });
});
