import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isOneValue, shownValue } from "./findingParts";
import { calculateANC } from "./calculators/anc";
import { INV_CATS } from "@/data/investigations";
import type { InvTest } from "@/types";
import { configureProps } from "@/test/fc";

// A stored result is its parts joined by commas with no space
// ("Hb:13.5g/dL,WBC:12000"), and the Investigation popup's "Added results"
// panel shows it with a space after each comma, to be read.
//
// ⚕️ It put that space after EVERY comma — the one inside a number too. A
// calculator's "ANC 1,500 cells/µL" was shown as "ANC 1, 500 cells/µL", and a
// platelet count typed the way it is written here, "1,50,000", as
// "1, 50, 000": a number the doctor entered, shown as three.
//
// The string alone cannot say which comma is which. A first attempt kept
// whatever LOOKED like a grouped number together, and that fused two parts into
// one number: ETT's "METs:10" beside a report beginning "150 bpm" read
// "METs:10,150 bpm" (caught in the second review, before release). So the rule
// asks the catalog instead: a value that can only be ONE part — a calculator's
// sentence, a test with one box, the doctor's own free text — is shown exactly
// as stored; a test with several boxes keeps the space after every comma, as it
// always has.
configureProps(200);

const ALL: InvTest[] = INV_CATS.flatMap((c) => c.tests);
const byName = (name: string) => {
  const t = ALL.find((x) => x.name === name);
  if (!t) throw new Error(`the catalog has no test called ${name}`);
  return t;
};
// The popup's own rule for which fields are stored without their label
// (VALUE_LABELS in InvestigationPopup.tsx).
const BARE = ["Value", "Result", "Report", "Finding", "Score", "Status", "Grade"];
/** A value stored the way the popup stores it: label, value, unit — joined by commas. */
const stored = (test: InvTest, values: (string | undefined)[]) =>
  test.fields
    .map((f, i) => (values[i] ? (BARE.includes(f.l) ? "" : f.l + ":") + values[i] + (f.u1 ?? "") : null))
    .filter((p): p is string => p !== null)
    .join(",");
const shown = (testName: string, raw: string) => shownValue(raw, isOneValue(testName, ALL.find((t) => t.name === testName)));

describe("a value that can only be ONE part is shown exactly as it is stored", () => {
  it("⚕️ a calculator's sentence keeps its 1,500", () => {
    const { interpretation } = calculateANC({ neutrophilsPct: 50, bandsPct: 0, wbcCount: 3 });
    expect(interpretation).toContain("ANC 1,500 cells/µL");
    const raw = `ANC: 1500 cells/µL — ${interpretation}`;
    expect(shown("Absolute Neutrophil Count (ANC)", raw)).toBe(raw);
    expect(byName("Absolute Neutrophil Count (ANC)").calc).toBeTruthy();
  });

  it("⚕️ a test with one box: a count typed the lakh way stays one number", () => {
    const one = ALL.find((t) => !t.calc && t.fields.length === 1 && t.fields[0].t === "num") as InvTest;
    expect(one).toBeTruthy();
    for (const typed of ["1,50,000", "12,000", "1,234,567", "১,৫০,০০০"]) {
      const raw = stored(one, [typed]);
      expect(shown(one.name, raw)).toBe(raw);
    }
  });

  it("a one-box result written in words keeps the doctor's own commas", () => {
    const one = ALL.find((t) => !t.calc && t.fields.length === 1 && t.fields[0].t === "text") as InvTest;
    expect(one).toBeTruthy();
    expect(shown(one.name, "clear,no focal lesion")).toBe("clear,no focal lesion");
  });

  it("the doctor's own free text is theirs", () => {
    expect(isOneValue("", undefined)).toBe(true);
    expect(shown("", "Platelets 1,50,000,Hb 9")).toBe("Platelets 1,50,000,Hb 9");
  });

  it("⚕️ for EVERY calculator and every one-box test in the catalog, nothing is added", () => {
    const ones = ALL.filter((t) => t.calc || t.fields.length <= 1);
    expect(ones.length).toBeGreaterThan(500);
    for (const t of ones) {
      for (const raw of ["1,500", "ANC 1,500 cells/µL — Normal. No risk.", "a,b,c", "12,34,567/cmm"]) {
        expect(shown(t.name, raw), t.name).toBe(raw);
      }
    }
  });
});

describe("a test with several boxes keeps the space after every comma, as it always has", () => {
  it("puts a space after the comma between two parts", () => {
    expect(shownValue("Hb:13.5g/dL,WBC:12000", false)).toBe("Hb:13.5g/dL, WBC:12000");
    expect(shownValue("Region:Chest,clear", false)).toBe("Region:Chest, clear");
  });

  it("leaves a comma that already has its space, and one that ends the text", () => {
    expect(shownValue("clear, no focal lesion", false)).toBe("clear, no focal lesion");
    expect(shownValue("normal,", false)).toBe("normal,");
    expect(shownValue("", false)).toBe("");
  });

  // The cases the first attempt got wrong: a part with no unit, then a part with
  // no label that begins with a number.
  it("⚕️ ETT: the METs and a report that begins with a number never read as one number", () => {
    const ett = byName("ETT (Treadmill)");
    const raw = stored(ett, ["Positive", "10", "150 bpm at peak"]);
    expect(raw).toBe("Positive,METs:10,150 bpm at peak");
    expect(shown(ett.name, raw)).toBe("Positive, METs:10, 150 bpm at peak");
  });

  it("⚕️ Mammography: BIRADS and a measurement after it stay two values", () => {
    const m = byName("Mammography");
    const raw = stored(m, ["Left", "4", "120 mm from nipple"]);
    expect(shown(m.name, raw)).toBe(raw.replace(/,/g, ", "));
    expect(shown(m.name, raw)).toContain("BIRADS:4, 120 mm");
  });

  it("⚕️ for EVERY test in the catalog with more than one box: no two parts are ever shown without a space between them", () => {
    const many = ALL.filter((t) => !t.calc && t.fields.length > 1);
    expect(many.length).toBeGreaterThan(40);
    for (const t of many) {
      // Every box filled with something that starts AND ends in digits — the
      // values most able to run into their neighbours.
      const values = t.fields.map((_, i) => String(100 + i * 50));
      const raw = stored(t, values);
      const out = shown(t.name, raw);
      const parts = raw.split(",");
      expect(parts).toHaveLength(t.fields.length);
      expect(out, t.name).toBe(parts.join(", "));
    }
  });

  it("a name the catalog no longer has is shown as it always was", () => {
    expect(isOneValue("A test since removed", undefined)).toBe(false);
    expect(shown("A test since removed", "a:1,b:2")).toBe("a:1, b:2");
  });

  // DEFECT-INV-GROUPED (open, older than this file, never made worse by it):
  // in a test with SEVERAL boxes the string cannot say whether "12,000" is one
  // count or the values of two boxes, so a number typed with its groups is
  // still set apart at its commas in the "Added results" panel. The record, the
  // sidebar and the printed sheet show it as typed. Closing this needs the
  // parts to be stored apart, not a cleverer guess — see FUNCTIONAL-AUDIT.md.
  it.fails("DEFECT-INV-GROUPED: a grouped number typed into a test of several boxes is shown whole", () => {
    expect(shownValue("WBC:12,000cells/uL,Hb:9g/dL", false)).toBe("WBC:12,000cells/uL, Hb:9g/dL");
  });
});

describe("whatever it is given", () => {
  it("⚕️ it only ever ADDS spaces — no character is changed, dropped or moved", () => {
    const piece = fc.stringMatching(/^[A-Za-z0-9:.,/ %µ-]{0,24}$/);
    fc.assert(
      fc.property(piece, fc.boolean(), (raw, one) => {
        const out = shownValue(raw, one);
        expect(out.replace(/ /g, "")).toBe(raw.replace(/ /g, ""));
        expect(out.length).toBeGreaterThanOrEqual(raw.length);
        expect(shownValue(out, one)).toBe(out); // shown again, it does not grow
      }),
    );
  });
});
