import { describe, it, expect } from "vitest";
import {
  safeContLines,
  resolveGeneric,
  habitToRows,
  insertHabitRows,
  focusIndexAfterInsert,
} from "./rxHabitRows";
import { emptyRow, type Row } from "@/components/prescription/MedicinePad";
import type { MedicineHit, RxHabitItem } from "@/lib/api";

// ⚕️ This module decides WHAT LANDS IN A PRESCRIPTION when the doctor clicks a
// suggestion, and it runs inside the editor — where an uncaught throw unmounts
// the whole screen a doctor prescribes through. Both halves are pinned here.

const habit = (over: Partial<RxHabitItem> = {}): RxHabitItem => ({
  id: "h1",
  drugLabel: "Tablet. Napa 500mg",
  dose: "1+1+1",
  food: "after meal",
  duration: "7 days",
  contLines: [],
  patientCount: 7,
  lastUsedAt: "2026-08-15T00:00:00.000Z",
  pinned: false,
  ...over,
});

const med = (over: Partial<MedicineHit> = {}): MedicineHit => ({
  id: "m1",
  brandName: "Napa",
  genericName: "Paracetamol",
  dosageForm: "Tablet",
  strength: "500mg",
  company: "Beximco",
  priceRaw: null,
  ...over,
});

describe("habitToRows — the whole block is one unit", () => {
  it("builds a single medicine row from a plain suggestion", () => {
    const rows = habitToRows(habit());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      drug: "Tablet. Napa 500mg",
      dose: "1+1+1",
      food: "after meal",
      duration: "7 days",
      isMedicine: true,
      continuation: false,
      checked: true,
    });
  });

  it("builds the head plus one continuation row per tapering line, in order", () => {
    const rows = habitToRows(
      habit({
        drugLabel: "Tablet. Uparen 15mg",
        dose: "0+0+3",
        duration: "1 month",
        contLines: [
          { dose: "0+0+2", food: "after meal", duration: "1 month" },
          { dose: "0+0+1", food: "after meal", duration: "continue" },
        ],
      }),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.dose)).toEqual(["0+0+3", "0+0+2", "0+0+1"]);
    expect(rows.slice(1).every((r) => r.continuation && r.isMedicine)).toBe(true);
    // Continuation rows carry no drug name — that is how the pad and the saved
    // record both represent a tapering line.
    expect(rows.slice(1).every((r) => r.drug === "")).toBe(true);
  });

  it("attaches the generic when one was resolved, and nothing when not", () => {
    expect(habitToRows(habit(), "Paracetamol")[0].generic).toBe("Paracetamol");
    expect(habitToRows(habit())[0].generic).toBeUndefined();
  });

  it("never puts a generic on a continuation line", () => {
    const rows = habitToRows(
      habit({ contLines: [{ dose: "1", food: "", duration: "" }] }),
      "Paracetamol",
    );
    expect(rows[1].generic).toBeUndefined();
  });
});

describe("safeContLines — the Json column is unknown until proven otherwise", () => {
  it("reads a well-formed list", () => {
    expect(safeContLines([{ dose: "1", food: "", duration: "c" }])).toEqual([
      { dose: "1", food: "", duration: "c" },
    ]);
  });

  it("returns [] for null, undefined and non-arrays", () => {
    expect(safeContLines(null)).toEqual([]);
    expect(safeContLines(undefined)).toEqual([]);
    expect(safeContLines("1+0+1")).toEqual([]);
    expect(safeContLines({ dose: "1" })).toEqual([]);
    expect(safeContLines(7)).toEqual([]);
  });

  it("SKIPS a malformed entry rather than throwing on it", () => {
    expect(
      safeContLines([
        { dose: "1", food: "", duration: "c" },
        { dose: 2, food: "", duration: "" },
        null,
        { dose: "3", food: "", duration: "" },
      ]),
    ).toEqual([
      { dose: "1", food: "", duration: "c" },
      { dose: "3", food: "", duration: "" },
    ]);
  });
});

describe("malformed input never throws — the editor must stay on screen", () => {
  const nasty: unknown[] = [
    null,
    undefined,
    "not a habit",
    7,
    { contLines: "oops" },
    { drugLabel: 5, dose: null, food: undefined, duration: {}, contLines: [1, 2] },
    { contLines: [{ dose: "1" }] },
  ];

  it("habitToRows survives anything", () => {
    for (const v of nasty) {
      expect(() => habitToRows(v as RxHabitItem)).not.toThrow();
      const rows = habitToRows(v as RxHabitItem);
      // Whatever came in, every field the pad renders is a string.
      for (const r of rows) {
        expect(typeof r.drug).toBe("string");
        expect(typeof r.dose).toBe("string");
        expect(typeof r.food).toBe("string");
        expect(typeof r.duration).toBe("string");
      }
    }
  });

  it("insertHabitRows survives anything", () => {
    for (const v of nasty) {
      expect(() => insertHabitRows([emptyRow()], 0, v as RxHabitItem)).not.toThrow();
    }
    expect(() => insertHabitRows(null as unknown as Row[], 0, habit())).not.toThrow();
  });

  it("resolveGeneric survives anything", () => {
    expect(() => resolveGeneric("", [])).not.toThrow();
    expect(() => resolveGeneric(null as unknown as string, [null as unknown as MedicineHit])).not.toThrow();
    expect(resolveGeneric("", [med()])).toBeUndefined();
  });
});

describe("resolveGeneric — matched on the normalised key, never the raw label", () => {
  it("finds the generic for an exact label", () => {
    expect(resolveGeneric("Tablet. Napa 500mg", [med()])).toBe("Paracetamol");
  });

  it("still finds it when only the spacing differs", () => {
    // The habit was learned from "Tablet. Napa 500 mg"; the medicines table
    // emits "500mg". A raw string comparison would miss on the space alone and
    // silently drop a drug-drug alert.
    expect(resolveGeneric("Tablet. Napa 500 mg", [med()])).toBe("Paracetamol");
  });

  it("still finds it when only the case differs", () => {
    expect(resolveGeneric("TABLET. NAPA 500MG", [med()])).toBe("Paracetamol");
  });

  it("still finds it when the habit label carries an N/A strength", () => {
    expect(
      resolveGeneric("Tablet. Bicozin N/A", [
        med({ brandName: "Bicozin", strength: null, genericName: "Vitamin B Complex" }),
      ]),
    ).toBe("Vitamin B Complex");
  });

  it("still finds it across an abbreviated dosage form", () => {
    expect(resolveGeneric("Tab. Napa 500mg", [med()])).toBe("Paracetamol");
  });

  it("REFUSES a different strength — never lends the wrong generic", () => {
    expect(resolveGeneric("Tablet. Napa 665mg", [med()])).toBeUndefined();
  });

  it("REFUSES a different form qualifier", () => {
    expect(
      resolveGeneric("Tablet (Enteric Coated). Sergel 20mg", [
        med({ brandName: "Sergel", strength: "20mg", dosageForm: "Tablet", genericName: "Esomeprazole" }),
      ]),
    ).toBeUndefined();
  });

  it("returns undefined when the medicine is not in the loaded results", () => {
    expect(resolveGeneric("Tablet. Seclo 20mg", [med()])).toBeUndefined();
  });

  it("returns undefined when the matched medicine has no generic recorded", () => {
    expect(resolveGeneric("Tablet. Napa 500mg", [med({ genericName: null })])).toBeUndefined();
  });
});

describe("insertHabitRows — nothing already on the pad is overwritten", () => {
  const filled = (drug: string): Row => ({
    drug,
    dose: "x",
    food: "",
    duration: "",
    checked: true,
    isMedicine: true,
    continuation: false,
  });

  it("replaces the clicked row and appends the trailing empty row", () => {
    const rows = [emptyRow()];
    const next = insertHabitRows(rows, 0, habit());
    expect(next).toHaveLength(2);
    expect(next[0].drug).toBe("Tablet. Napa 500mg");
    expect(next[1]).toMatchObject({ drug: "", dose: "", isMedicine: false });
  });

  it("pushes the rows BELOW downward instead of overwriting them", () => {
    const rows = [filled("A"), filled("B"), filled("C"), emptyRow()];
    const next = insertHabitRows(rows, 1, habit({ contLines: [{ dose: "0+0+1", food: "", duration: "c" }] }));
    expect(next.map((r) => r.drug)).toEqual(["A", "Tablet. Napa 500mg", "", "C", ""]);
    // The suggestion's own continuation sits at index 2; "C" survived at 3.
    expect(next[2].continuation).toBe(true);
    expect(next[3].drug).toBe("C");
  });

  it("does not add a second trailing empty row when one already survives", () => {
    const rows = [emptyRow(), emptyRow()];
    const next = insertHabitRows(rows, 0, habit());
    expect(next).toHaveLength(2);
    expect(next.filter((r) => r.drug === "" && r.dose === "" && !r.continuation)).toHaveLength(1);
  });

  it("leaves the pad untouched for an out-of-range index", () => {
    const rows = [emptyRow()];
    expect(insertHabitRows(rows, 5, habit())).toBe(rows);
    expect(insertHabitRows(rows, -1, habit())).toBe(rows);
  });
});

describe("focusIndexAfterInsert — the caret goes to the NEXT medicine", () => {
  it("skips past the head when there is no taper", () => {
    expect(focusIndexAfterInsert(0, habit())).toBe(1);
  });

  it("skips past every continuation line", () => {
    expect(
      focusIndexAfterInsert(2, habit({
        contLines: [
          { dose: "a", food: "", duration: "" },
          { dose: "b", food: "", duration: "" },
        ],
      })),
    ).toBe(5);
  });

  it("does not count a malformed continuation line", () => {
    expect(
      focusIndexAfterInsert(0, habit({ contLines: "broken" as unknown as RxHabitItem["contLines"] })),
    ).toBe(1);
  });
});
