import { describe, it, expect } from "vitest";
import { rowsFromRxItems, rxItemsFromRows } from "./rxRows";
import { contRow, emptyRow, type Row } from "@/components/prescription/MedicinePad";
import type { RxItem } from "@/types";

// ⚕️ A tapering schedule is one instruction, and this conversion is where it can
// silently become two medicines — on the printed sheet, in the editor, and in
// what the prescribing-habit learner is taught.
//
// Two tests, two eras, and BOTH must keep passing:
//   · rows written from 2026-08-17 carry `isCont`;
//   · rows written before it carry only a blank drug, and must not be guessed at.

const med = (over: Partial<Row> & { drug: string }): Row => ({
  dose: "", food: "", duration: "", checked: true, isMedicine: true, continuation: false, ...over,
});

describe("rxItemsFromRows — the taper flag is recorded", () => {
  it("marks a continuation row isCont and a head row not", () => {
    const items = rxItemsFromRows([
      med({ drug: "Tablet. Uparen 15mg", dose: "0+0+3", duration: "1 month" }),
      { ...contRow(), dose: "0+0+1", duration: "continue" },
      emptyRow(),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ drug: "Tablet. Uparen 15mg", isCont: false });
    expect(items[1]).toMatchObject({ drug: "", dose: "0+0+1", isCont: true });
  });

  it("does not put isCont on a free-typed note", () => {
    const items = rxItemsFromRows([
      { drug: "Take rest", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false },
    ]);
    expect(items[0]).toMatchObject({ isNote: true });
    expect(items[0].isCont).toBeUndefined();
  });

  it("still drops a completely empty continuation row", () => {
    expect(rxItemsFromRows([med({ drug: "Tablet. A 5mg", dose: "1" }), contRow()])).toHaveLength(1);
  });
});

describe("rowsFromRxItems — a saved taper comes back as a continuation", () => {
  it("reads isCont even though the drug name was filled back in", () => {
    // This is exactly what the server returns: savePrescription fills the
    // medicine's name into the continuation so the printed sheet is
    // self-contained. Without honouring isCont the editor would show the same
    // medicine twice.
    const items: RxItem[] = [
      { drug: "Capsule. Levat 4 mg", dose: "0+0+1", duration: "7 days", instruction: "", isCont: false },
      { drug: "Capsule. Levat 4 mg", dose: "0+0+2", duration: "Continue", instruction: "", isCont: true },
    ];
    const rows = rowsFromRxItems(items);
    expect(rows[0]).toMatchObject({ drug: "Capsule. Levat 4 mg", continuation: false });
    expect(rows[1]).toMatchObject({ continuation: true, dose: "0+0+2" });
    // A continuation row renders `↳`, so it must not also carry the drug text.
    expect(rows[1].drug).toBe("");
  });

  it("falls back to the blank drug for rows saved before the flag existed", () => {
    const rows = rowsFromRxItems([
      { drug: "Tablet. A 5mg", dose: "1", duration: "", instruction: "" },
      { drug: "", dose: "2", duration: "", instruction: "" },
    ]);
    expect(rows[0].continuation).toBe(false);
    expect(rows[1].continuation).toBe(true);
  });

  it("treats isCont === false as a real answer, not a missing one", () => {
    // Two full lines of the same medicine, deliberately NOT a taper.
    const rows = rowsFromRxItems([
      { drug: "Tablet. A 5mg", dose: "1", duration: "", instruction: "", isCont: false },
      { drug: "Tablet. A 5mg", dose: "2", duration: "", instruction: "", isCont: false },
    ]);
    expect(rows[0].continuation).toBe(false);
    expect(rows[1].continuation).toBe(false);
    expect(rows[1].drug).toBe("Tablet. A 5mg");
  });

  it("never turns a note into a continuation", () => {
    const rows = rowsFromRxItems([
      { drug: "Tablet. A 5mg", dose: "1", duration: "", instruction: "" },
      { drug: "Drink water", dose: "", duration: "", instruction: "", isNote: true },
    ]);
    expect(rows[1]).toMatchObject({ isMedicine: false, continuation: false, drug: "Drink water" });
  });

  it("appends the trailing empty row", () => {
    const rows = rowsFromRxItems([{ drug: "Tablet. A 5mg", dose: "1", duration: "", instruction: "" }]);
    expect(rows[rows.length - 1]).toMatchObject({ drug: "", isMedicine: false });
  });
});

describe("round trip — a taper survives rows → items → rows", () => {
  it("keeps one head and one continuation, in order", () => {
    const before: Row[] = [
      med({ drug: "Tablet. Uparen 15mg", dose: "0+0+3", food: "after meal", duration: "1 month" }),
      { ...contRow(), dose: "0+0+1", food: "after meal", duration: "continue" },
      emptyRow(),
    ];
    const after = rowsFromRxItems(rxItemsFromRows(before));
    expect(after.filter((r) => r.isMedicine)).toHaveLength(2);
    expect(after[0]).toMatchObject({ drug: "Tablet. Uparen 15mg", continuation: false, dose: "0+0+3" });
    expect(after[1]).toMatchObject({ drug: "", continuation: true, dose: "0+0+1" });
  });

  it("survives the name fill-back the server payload applies", () => {
    // MuqsitContext fills `drug` into continuations before sending. Simulate it.
    const items = rxItemsFromRows([
      med({ drug: "Tablet. X 5mg", dose: "3" }),
      { ...contRow(), dose: "1" },
      emptyRow(),
    ]);
    let lastDrug = "";
    const sent = items.map((r) => {
      if (r.isNote) return r;
      if (r.drug.trim()) lastDrug = r.drug.trim();
      return { ...r, drug: r.drug.trim() || lastDrug };
    });
    expect(sent[1].drug).toBe("Tablet. X 5mg"); // filled back in, as today
    const rows = rowsFromRxItems(sent);
    expect(rows[1].continuation).toBe(true); // and still read back as a taper
  });
});
