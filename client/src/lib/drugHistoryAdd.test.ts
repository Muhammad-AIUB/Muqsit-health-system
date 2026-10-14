import { describe, expect, it } from "vitest";
import { buildDrugHistoryEntry, isDuplicateDrugHistoryEntry, NO_DATE, type DrugHistoryAddInput } from "./drugHistoryAdd";

describe("buildDrugHistoryEntry", () => {
  it("joins the four cells with the stored separator", () => {
    expect(buildDrugHistoryEntry("14/10/2026", { drug: "Tablet. Napa 500 mg", dose: "1+0+1", food: "After meal", duration: "5 days" }))
      .toBe("14/10/2026: Tablet. Napa 500 mg — 1+0+1 — After meal — 5 days");
  });

  it("keeps a blank cell blank — nothing is invented", () => {
    expect(buildDrugHistoryEntry("14/10/2026", { drug: "Tablet. Napa 500 mg", dose: "", food: "", duration: "" }))
      .toBe("14/10/2026: Tablet. Napa 500 mg —  —  — ");
  });

  it("trims surrounding whitespace from every cell", () => {
    expect(buildDrugHistoryEntry("14/10/2026", { drug: "  Tablet. Napa 500 mg  ", dose: " 1+0+1 ", food: " After meal ", duration: " 5 days " }))
      .toBe("14/10/2026: Tablet. Napa 500 mg — 1+0+1 — After meal — 5 days");
  });

  it("stamps the no-date marker for a Distant-past addition", () => {
    expect(buildDrugHistoryEntry(NO_DATE, { drug: "Metformin 500mg", dose: "", food: "", duration: "" }))
      .toBe("01/01/2000: Metformin 500mg —  —  — ");
  });
});

describe("isDuplicateDrugHistoryEntry", () => {
  const existing: DrugHistoryAddInput[] = [
    { drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" },
  ];

  it("is a duplicate: same medicine, same instruction", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }, existing)).toBe(true);
  });

  it("is a duplicate even when the medicine and instruction were typed another way", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "tab napa 500mg", dose: "1 + 1 + 1", food: "after meal", duration: "5 days" }, existing)).toBe(true);
  });

  it("is NOT a duplicate at a different dose — a different dose is always a new line", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "Tablet. Napa 500 mg", dose: "1+0+1", food: "After meal", duration: "5 days" }, existing)).toBe(false);
  });

  it("is NOT a duplicate for a different medicine", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "Tablet. Napa One 1000 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }, existing)).toBe(false);
  });

  it("is never a duplicate against an empty tab", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }, [])).toBe(false);
  });
});
