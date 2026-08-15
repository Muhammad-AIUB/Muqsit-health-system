import { describe, expect, it } from "vitest";
import { buildPrescriptionHtml, drugCellWidthPx, drugTextFit, type PrescriptionDoc } from "./prescriptionDoc";

// ⚕️ The printed sheet is the legal record. These pin the one rule a dispenser
// depends on: a medicine's form, name and strength print as ONE line. Measured
// against a real browser on 2026-08-16 — an A4 sheet gives the drug cell 181px
// of usable width, and "Tablet. Barcavir 0.5 mg" draws 141px at 13px.

// Stand-in for canvas metrics (vitest has no DOM). Linear in font size, like
// real text, at the ~0.47em/char DM Sans bold actually measures.
const fakeMeasure = (t: string, px: number) => t.length * px * 0.47;

const A4_CELL = 181;

describe("drugCellWidthPx", () => {
  it("matches the browser-measured A4 cell", () => {
    // Default page: 8.27in wide, 0.4in margins.
    expect(Math.round(drugCellWidthPx(undefined))).toBe(A4_CELL);
  });

  it("tracks a narrower page and wider margins", () => {
    const narrow = drugCellWidthPx({
      unit: "in", width: "6", height: "9",
      marginLeft: "0.75", marginRight: "0.75", headerHeight: "0.5", footerHeight: "0.5",
    });
    expect(narrow).toBeLessThan(A4_CELL);
    expect(narrow).toBeGreaterThan(60);
  });

  it("handles cm and never returns a unusable width for junk settings", () => {
    expect(drugCellWidthPx({
      unit: "cm", width: "21", height: "29.7",
      marginLeft: "1", marginRight: "1", headerHeight: "1", footerHeight: "1",
    })).toBeGreaterThan(100);
    expect(drugCellWidthPx({
      unit: "in", width: "", height: "", marginLeft: "-3", marginRight: "abc",
      headerHeight: "", footerHeight: "",
    })).toBeGreaterThanOrEqual(60);
  });
});

describe("drugTextFit", () => {
  it("leaves a normal medicine at full size, on one line", () => {
    const fit = drugTextFit("Tablet. Barcavir 0.5 mg", A4_CELL, fakeMeasure);
    expect(fit).toEqual({ px: 13, wrap: false });
  });

  it("steps the font down instead of wrapping a long medicine", () => {
    const fit = drugTextFit("Oral Solution. Avolac 3.35 gm/5 ml", A4_CELL, fakeMeasure);
    expect(fit.wrap).toBe(false);
    expect(fit.px).toBeLessThan(13);
    expect(fit.px).toBeGreaterThanOrEqual(8.5);
    // and the chosen size actually fits
    expect(fakeMeasure("Oral Solution. Avolac 3.35 gm/5 ml", fit.px)).toBeLessThanOrEqual(A4_CELL);
  });

  it("never goes below the legibility floor — it wraps instead", () => {
    const fit = drugTextFit("Suspension. Amoxicillin + Clavulanic acid 457 mg/5 ml pediatric drops", A4_CELL, fakeMeasure);
    expect(fit.px).toBe(8.5);
    expect(fit.wrap).toBe(true);
  });

  it("falls back to a character estimate when canvas metrics are unavailable", () => {
    const fit = drugTextFit("Tablet. Barcavir 0.5 mg", A4_CELL, () => null);
    expect(fit.wrap).toBe(false);
    expect(fit.px).toBeGreaterThan(8.5);
  });

  it("treats a blank drug (a tapering continuation row) as full size", () => {
    expect(drugTextFit("   ", A4_CELL, fakeMeasure)).toEqual({ px: 13, wrap: false });
  });
});

describe("printed Rx markup", () => {
  const doc: PrescriptionDoc = {
    doctorName: "Dr Test",
    patient: { name: "Patient", age: "39", gender: "Male", address: "", weight: "", date: "16/08/2026", phone: "01700000000" },
    clinical: [],
    rx: [
      { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After food" },
      { drug: "", dose: "1+0+0", duration: "3 days", instruction: "" },
    ],
    advice: [], adviceTest: [], followUp: "",
  };

  it("gives the drug cell the widest share and keeps the columns at 100%", () => {
    const html = buildPrescriptionHtml(doc);
    expect(html).toContain(".rx-drug { width: 44%");
    expect(html).toContain(".rx-dose { width: 21%");
    expect(html).toContain(".rx-food { width: 16%");
    expect(html).toContain(".rx-dur { width: 19%");
  });

  it("pins the drug line against wrapping", () => {
    expect(buildPrescriptionHtml(doc)).toContain("white-space:nowrap");
  });

  it("leaves a tapering continuation row unstyled so its arrow renders plainly", () => {
    const html = buildPrescriptionHtml(doc);
    expect(html).toContain('<td class="rx-drug"><span style="color:#999;padding-left:14px">↳</span></td>');
  });
});
