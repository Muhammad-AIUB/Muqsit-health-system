import { describe, expect, it } from "vitest";
import {
  bulkToRxItems, instructionOf, patientsLabel, readBulkList, searchBulk, sortBulk, type BulkMedicine,
} from "./bulkMedicines";
import { moveSummary } from "./drugHistorySelect";
import type { RxItem } from "@/types";

// The "Add Bulk Medicine" box: what the server sends, read and turned into
// lines of the ℞ pad. ⚕️ Nothing here may invent a dose, part a taper from its
// medicine, lose a generic, or throw — it runs inside the prescription editor.
// Every medicine, dose and count is made up.

const med = (over: Partial<BulkMedicine> = {}): BulkMedicine => ({
  id: "h1", drugLabel: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days",
  contLines: [], patientCount: 30, ...over,
});
const NAPA = med();
const SERGEL = med({ id: "h2", drugLabel: "Capsule. Sergel 20 mg", generic: "Esomeprazole", dose: "1+0+1", food: "Before meal", duration: "14 days", patientCount: 22 });
const DELTA = med({ id: "h3", drugLabel: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", patientCount: 6, contLines: [{ dose: "1+0+0", food: "After meal", duration: "5 days" }] });
const ACE = med({ id: "h4", drugLabel: "Tablet. Ace 500 mg", dose: "", food: "", duration: "", patientCount: 6 });

describe("readBulkList — what the server sent, read without trusting it", () => {
  it("reads a well-formed response", () => {
    const out = readBulkList({
      medicines: [{ ...NAPA, drugKey: "tablet. napa 500mg", lastUsedAt: "2026-10-01T00:00:00.000Z" }, SERGEL],
      truncated: false,
    });
    expect(out).toEqual({ medicines: [NAPA, SERGEL], truncated: false, unreadable: 0 });
  });

  it.each([null, undefined, 7, "x", [], {}, { medicines: "no" }, { medicines: null }])(
    "gives an empty list for %j — never a throw",
    (value) => {
      expect(readBulkList(value)).toEqual({ medicines: [], truncated: false, unreadable: 0 });
    },
  );

  it("⚕️ leaves out — and counts — a medicine it cannot read whole", () => {
    const out = readBulkList({
      medicines: [
        NAPA,
        null,
        "Tablet. Text 5 mg",
        { ...SERGEL, id: "" },                                   // nothing to tick it by
        { ...SERGEL, id: "x1", drugLabel: "   " },               // no name
        { ...SERGEL, id: "x2", contLines: "1+0+0" },             // a taper that is not a list
        { ...SERGEL, id: "x3", contLines: [{ dose: "1+0+0" }] }, // half a taper line
        { ...NAPA },                                             // the same row twice
      ],
      truncated: true,
    });
    expect(out.medicines).toEqual([NAPA]);
    expect(out.unreadable).toBe(7);
    expect(out.truncated).toBe(true);
  });

  it("⚕️ invents nothing: a missing dose, food or duration is blank, a missing count is 0, a missing generic is absent", () => {
    const out = readBulkList({ medicines: [{ id: "h9", drugLabel: "Tablet. Bare 5 mg" }] });
    expect(out.medicines).toEqual([
      { id: "h9", drugLabel: "Tablet. Bare 5 mg", dose: "", food: "", duration: "", contLines: [], patientCount: 0 },
    ]);
    expect("generic" in out.medicines[0]).toBe(false);
  });

  it("a cell that is not text is blank, never a number or an object turned into words", () => {
    const out = readBulkList({ medicines: [{ id: "h9", drugLabel: "Tablet. Odd 5 mg", dose: 2, food: { a: 1 }, duration: null, generic: 7, patientCount: "30" }] });
    expect(out.medicines).toEqual([
      { id: "h9", drugLabel: "Tablet. Odd 5 mg", dose: "", food: "", duration: "", contLines: [], patientCount: 0 },
    ]);
  });

  it("only `truncated: true` is truncated", () => {
    expect(readBulkList({ medicines: [], truncated: "yes" }).truncated).toBe(false);
    expect(readBulkList({ medicines: [], truncated: 1 }).truncated).toBe(false);
  });
});

describe("sortBulk", () => {
  const list = [SERGEL, ACE, NAPA, DELTA];

  it("Popular: most patients first; the same count in A-to-Z order of the brand", () => {
    expect(sortBulk(list, "popular").map((m) => m.drugLabel)).toEqual([
      "Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Ace 500 mg", "Tablet. Deltasone 5 mg",
    ]);
  });

  it("Alphabetical: by the BRAND, not by the dosage form the label starts with", () => {
    expect(sortBulk(list, "alphabetical").map((m) => m.drugLabel)).toEqual([
      "Tablet. Ace 500 mg", "Tablet. Deltasone 5 mg", "Tablet. Napa 500 mg", "Capsule. Sergel 20 mg",
    ]);
  });

  it("Alphabetical does not care about capitals", () => {
    const mixed = [med({ id: "a", drugLabel: "Tablet. napa 500 mg" }), med({ id: "b", drugLabel: "Tablet. Ace 500 mg" }), med({ id: "c", drugLabel: "Tablet. Zimax 500 mg" })];
    expect(sortBulk(mixed, "alphabetical").map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  it("is the same whatever order the list came in", () => {
    const one = [SERGEL, ACE, NAPA, DELTA];
    const other = [DELTA, NAPA, ACE, SERGEL];
    expect(sortBulk(other, "popular")).toEqual(sortBulk(one, "popular"));
    expect(sortBulk(other, "alphabetical")).toEqual(sortBulk(one, "alphabetical"));
  });

  // The list is React Query's cached data: sorted in place, the cache would be
  // reordered under every other reader of it.
  it("leaves the list it was given alone", () => {
    const own = [SERGEL, ACE, NAPA, DELTA]; // in neither order
    sortBulk(own, "popular");
    expect(own).toEqual([SERGEL, ACE, NAPA, DELTA]);
    sortBulk(own, "alphabetical");
    expect(own).toEqual([SERGEL, ACE, NAPA, DELTA]);
  });

  it("two strengths of one brand stay in a fixed order", () => {
    const two = [med({ id: "b", drugLabel: "Tablet. Napa 665 mg", patientCount: 1 }), med({ id: "a", drugLabel: "Tablet. Napa 500 mg", patientCount: 1 })];
    expect(sortBulk(two, "alphabetical").map((m) => m.drugLabel)).toEqual(["Tablet. Napa 500 mg", "Tablet. Napa 665 mg"]);
    expect(sortBulk(two, "popular").map((m) => m.drugLabel)).toEqual(["Tablet. Napa 500 mg", "Tablet. Napa 665 mg"]);
  });

  it("a label with no readable brand is filed under itself", () => {
    const odd = [med({ id: "z", drugLabel: "Zinc" }), med({ id: "a", drugLabel: "500" }), med({ id: "m", drugLabel: "Tablet. Napa 500 mg" })];
    expect(sortBulk(odd, "alphabetical").map((m) => m.id)).toEqual(["a", "m", "z"]);
  });
});

describe("searchBulk", () => {
  const list = [NAPA, SERGEL, DELTA, ACE];

  it("nothing typed is the whole list", () => {
    expect(searchBulk(list, "")).toEqual(list);
    expect(searchBulk(list, "   ")).toEqual(list);
  });

  it("finds a medicine by any part of its name, in any case", () => {
    expect(searchBulk(list, "napa").map((m) => m.id)).toEqual(["h1"]);
    expect(searchBulk(list, "500").map((m) => m.id)).toEqual(["h1", "h4"]);
    expect(searchBulk(list, "TABLET ace").map((m) => m.id)).toEqual(["h4"]);
  });

  it("finds a medicine by its generic", () => {
    expect(searchBulk(list, "esomep").map((m) => m.id)).toEqual(["h2"]);
  });

  it("keeps the order it was given", () => {
    expect(searchBulk([ACE, NAPA], "500").map((m) => m.id)).toEqual(["h4", "h1"]);
  });

  it("gives nothing when nothing matches", () => {
    expect(searchBulk(list, "zzz")).toEqual([]);
  });
});

describe("what a row says", () => {
  it("the instruction is the cells that were written, in the pad's order", () => {
    expect(instructionOf(NAPA)).toBe("1+1+1 · After meal · 5 days");
    expect(instructionOf({ dose: "1+0+0", food: "", duration: "Continue" })).toBe("1+0+0 · Continue");
    expect(instructionOf({ dose: "", food: "Before meal", duration: "" })).toBe("Before meal");
    expect(instructionOf(ACE)).toBe("");
  });

  it("the count is of PATIENTS", () => {
    expect(patientsLabel(30)).toBe("30 patients");
    expect(patientsLabel(1)).toBe("1 patient");
    expect(patientsLabel(0)).toBe("0 patients");
  });
});

describe("bulkToRxItems — the ticked medicines as lines of the pad", () => {
  it("⚕️ a medicine becomes one line with exactly what was written — and a blank stays blank", () => {
    expect(bulkToRxItems([NAPA, ACE], []).items).toEqual([
      { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal", isCont: false },
      { drug: "Tablet. Ace 500 mg", dose: "", duration: "", instruction: "", isCont: false },
    ]);
  });

  it("⚕️ the generic goes with its medicine — it is what makes a prescribing alert fire", () => {
    expect(bulkToRxItems([SERGEL], []).items[0].generic).toBe("Esomeprazole");
    expect("generic" in bulkToRxItems([NAPA], []).items[0]).toBe(false);
  });

  it("⚕️ a taper goes under its own medicine, as continuation lines with no drug name", () => {
    const { items } = bulkToRxItems([NAPA, DELTA, SERGEL], []);
    expect(items.map((it) => [it.drug, it.dose, it.isCont])).toEqual([
      ["Tablet. Napa 500 mg", "1+1+1", false],
      ["Tablet. Deltasone 5 mg", "2+0+0", false],
      ["", "1+0+0", true],
      ["Capsule. Sergel 20 mg", "1+0+1", false],
    ]);
    expect(items[2]).toEqual({ drug: "", dose: "1+0+0", duration: "5 days", instruction: "After meal", isCont: true });
  });

  // `fromHabit` is what makes a save write "N of M ℞ lines inserted from
  // "Your usual"" to the activity feed. A line added from this box was not.
  it("does not mark its lines as inserted from \"Your usual\"", () => {
    const { items } = bulkToRxItems([NAPA, DELTA], []);
    expect(items).toHaveLength(3);
    expect(items.some((it) => "fromHabit" in it)).toBe(false);
  });

  it("keeps the order it was given, and counts medicines, not lines", () => {
    const out = bulkToRxItems([DELTA, NAPA], []);
    expect(out.added).toBe(2);
    expect(out.skipped).toBe(0);
    expect(out.items).toHaveLength(3);
    expect(out.items[0].drug).toBe("Tablet. Deltasone 5 mg");
  });

  it("a line already on the pad — the same drug, dose, instruction and duration — is skipped, taper and all", () => {
    const pad: RxItem[] = [
      { drug: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", instruction: "After meal" },
      { drug: "Tablet. Napa 500 mg", dose: "1+0+1", duration: "5 days", instruction: "After meal" }, // another dose: not the same line
    ];
    const out = bulkToRxItems([DELTA, NAPA], pad);
    expect(out.added).toBe(1);
    expect(out.skipped).toBe(1);
    expect(out.items.map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg"]);
    expect(moveSummary(out.added, out.skipped)).toBe("1 added · 1 already on ℞");
  });

  it("does not change the pad it was shown or the medicines it was given", () => {
    const pad: RxItem[] = [{ drug: "Tablet. Napa 500 mg", dose: "1+0+1", duration: "5 days", instruction: "After meal" }];
    const padBefore = JSON.stringify(pad);
    const picked = [DELTA];
    const pickedBefore = JSON.stringify(picked);
    bulkToRxItems(picked, pad);
    expect(JSON.stringify(pad)).toBe(padBefore);
    expect(JSON.stringify(picked)).toBe(pickedBefore);
  });

  it("nothing ticked is nothing added", () => {
    expect(bulkToRxItems([], [])).toEqual({ items: [], added: 0, skipped: 0 });
  });
});
