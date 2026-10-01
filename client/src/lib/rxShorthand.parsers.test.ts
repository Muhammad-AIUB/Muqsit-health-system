import { describe, expect, it } from "vitest";
import { FOOD_HINT, fmtMedicine, looksLikeMedicine, parseDuration, parseFood } from "./rxShorthand";
import type { MedicineHit } from "./api";

// The duration and food shorthand of the ℞ pad, and the medicine label. Every
// expansion asserted here is the module's own documented table (the comment
// above each parser and `FOOD_HINT`, which is what the doctor is shown) — none
// is derived here. What matters clinically is the OTHER direction: anything
// that is not exactly a shorthand must come back exactly as typed
// ("Never round, reformat, or 'normalize' an entered clinical value").
// (parseDose and splitDrugLabel are covered in rxShorthand.test.ts.)

describe("parseDuration — 7d → 7 days, c → Continue, 2m → 2 month", () => {
  it("expands the documented shorthand, in either case", () => {
    expect(parseDuration("7d")).toBe("7 days");
    expect(parseDuration("7 D")).toBe("7 days");
    expect(parseDuration("2m")).toBe("2 month");
    expect(parseDuration("2w")).toBe("2 week");
    expect(parseDuration("c")).toBe("Continue");
    expect(parseDuration("C")).toBe("Continue");
  });

  it("leaves everything else exactly as typed (trimmed)", () => {
    for (const typed of ["5 days", "Continue", "if needed", "2 month", "7", "7dd", "d", "1.5m", "7d then stop", "c/o", "until review"]) {
      expect(parseDuration(typed), typed).toBe(typed);
      expect(parseDuration(`  ${typed} `), typed).toBe(typed);
    }
  });

  it("an empty box stays empty", () => {
    expect(parseDuration("")).toBe("");
    expect(parseDuration("   ")).toBe("");
  });
});

describe("parseFood — the shorthand the hint under the box advertises", () => {
  it("expands exactly what FOOD_HINT documents", () => {
    expect(FOOD_HINT).toBe("bm/ac=before meal · am/pc=after meal · 2bm=2hr before · 2bmam=2hr before/after · wf=with food · no=none");
    expect(parseFood("bm")).toBe("Before meal");
    expect(parseFood("ac")).toBe("Before meal");
    expect(parseFood("am")).toBe("After meal");
    expect(parseFood("pc")).toBe("After meal");
    expect(parseFood("2bm")).toBe("2 hr before meal");
    expect(parseFood("2bmam")).toBe("2 hr before or after meal");
    expect(parseFood("wf")).toBe("With food");
    expect(parseFood("no")).toBe("");
  });

  it("is case-insensitive and ignores surrounding space", () => {
    expect(parseFood(" BM ")).toBe("Before meal");
    expect(parseFood("Wf")).toBe("With food");
    expect(parseFood("2 BMAM")).toBe("2 hr before or after meal");
  });

  it("leaves a typed instruction exactly as entered", () => {
    for (const typed of ["Before meal", "After meal", "food", "after food", "once every two week", "empty stomach", "bmx", "am pm", "none", "not with milk", "2", "bm 2"]) {
      expect(parseFood(typed), typed).toBe(typed);
    }
  });

  it("an empty box stays empty", () => {
    expect(parseFood("")).toBe("");
    expect(parseFood("  ")).toBe("");
  });
});

describe("fmtMedicine — 'Tablet. Napa 500mg'", () => {
  const hit = (over: Partial<MedicineHit>): MedicineHit => ({
    id: "m1", brandName: "Napa", genericName: "Paracetamol", dosageForm: "Tablet", strength: "500 mg", company: null, priceRaw: null, ...over,
  });

  it("joins form, brand and strength, the form with its full stop", () => {
    expect(fmtMedicine(hit({}))).toBe("Tablet. Napa 500 mg");
  });

  it("leaves out a part the medicines table does not have — no stray dot, no double space", () => {
    expect(fmtMedicine(hit({ dosageForm: null }))).toBe("Napa 500 mg");
    expect(fmtMedicine(hit({ strength: null }))).toBe("Tablet. Napa");
    expect(fmtMedicine(hit({ dosageForm: "", strength: "" }))).toBe("Napa");
  });

  it("never puts the generic into the label — the label is the brand line the doctor picked", () => {
    expect(fmtMedicine(hit({}))).not.toContain("Paracetamol");
  });
});

describe("looksLikeMedicine — a free-typed line that begins with a dosage form", () => {
  it("recognises the forms doctors type, full or short, in any case", () => {
    for (const typed of ["inj. Halopid", "tab Seclo", "Tablet. Napa 500 mg", "  CAP Tycil", "syp Tuscolic", "Injection X", "susp. Fimoxyl"]) {
      expect(looksLikeMedicine(typed), typed).toBe(true);
    }
  });

  it("does not take a note for a medicine", () => {
    for (const note of ["Take rest for 2 weeks", "bed rest", "advice : Hospitalization", "Take plenty of water", "table salt restriction", "capture ECG", "", "   "]) {
      expect(looksLikeMedicine(note), note).toBe(false);
    }
  });
});
