import { describe, expect, it } from "vitest";
import {
  bulkSummary, bulkToRxItems, instructionOf, isBulkAnswer, nothingAddedNote, patientsLabel, readBulkList, searchBulk,
  sortBulk, type BulkMedicine,
} from "./bulkMedicines";
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

  it("a line already on the pad — the same drug, dose, instruction and duration — is skipped; another dose of it is not", () => {
    const pad: RxItem[] = [
      { drug: "Capsule. Sergel 20 mg", dose: "1+0+1", duration: "14 days", instruction: "Before meal" },
      { drug: "Tablet. Napa 500 mg", dose: "1+0+1", duration: "5 days", instruction: "After meal" }, // another dose: not the same line
    ];
    const out = bulkToRxItems([SERGEL, NAPA], pad);
    expect(out.added).toBe(1);
    expect(out.skipped).toBe(1);
    expect(out.otherTaper).toBe(0);
    expect(out.items.map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg"]);
    expect(bulkSummary(out)).toBe("1 added · 1 already on ℞");
  });

  it("each of the four cells counts: a line that differs in only one is another line", () => {
    const on = (over: Partial<RxItem>): RxItem[] => [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal", ...over }];
    expect(bulkToRxItems([NAPA], on({})).added).toBe(0);
    expect(bulkToRxItems([NAPA], on({ dose: "1+0+1" })).added).toBe(1);
    expect(bulkToRxItems([NAPA], on({ instruction: "Before meal" })).added).toBe(1);
    expect(bulkToRxItems([NAPA], on({ duration: "7 days" })).added).toBe(1);
    expect(bulkToRxItems([NAPA], on({ drug: "Tablet. Napa 665 mg" })).added).toBe(1);
  });

  // The box's label is the medicine as this doctor LAST wrote it; the pad's may
  // have been picked from the medicine list. The same medicine and strength
  // written with another space or capital is still the same line — compared as
  // the app compares medicines everywhere else (lib/rxHabitKey.ts).
  it("⚕️ the same medicine written with other spacing or capitals is not added a second time", () => {
    for (const written of ["Tablet. Napa 500mg", "tablet. napa 500 MG", "  Tablet.   Napa 500 mg ", "Tab Napa 500 mg"]) {
      const out = bulkToRxItems([NAPA], [{ drug: written, dose: "1+1+1", duration: "5 days", instruction: "After meal" }]);
      expect([written, out.added, out.skipped]).toEqual([written, 0, 1]);
    }
  });

  it("two ticked rows that are the same line are added once", () => {
    const again = med({ id: "dup", drugLabel: "Tablet. Napa 500mg" });
    const out = bulkToRxItems([NAPA, again], []);
    expect([out.added, out.skipped, out.otherTaper]).toEqual([1, 1, 0]);
    expect(out.items.map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg"]);
  });

  it("⚕️ …but another strength, or another form, is another medicine", () => {
    for (const other of ["Tablet. Napa 665 mg", "Syrup. Napa 500 mg", "Tablet. Napa Extra 500 mg", "Tablet (Extended Release). Napa 500 mg"]) {
      const out = bulkToRxItems([NAPA], [{ drug: other, dose: "1+1+1", duration: "5 days", instruction: "After meal" }]);
      expect([other, out.added]).toEqual([other, 1]);
    }
  });
});

// ⚕️ A medicine is skipped when its FIRST line is on the pad. Its tapering
// lines are then not added either — and for one review round the box said
// "already on ℞ with the same instruction" of a medicine that stood on the pad
// WITHOUT the taper shown in the box (first review, before release). The skip
// stays (a medicine is never written twice); what is said about it is true.
describe("bulkToRxItems — a tapering medicine whose first line is already on the pad", () => {
  const HEAD: RxItem = { drug: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", instruction: "After meal", isCont: false };
  const cont = (dose: string, over: Partial<RxItem> = {}): RxItem => ({ drug: "", dose, duration: "5 days", instruction: "After meal", isCont: true, ...over });

  it("on the pad with NO taper: skipped, nothing of it added, and counted as standing there without its tapering lines", () => {
    const out = bulkToRxItems([DELTA, NAPA], [HEAD]);
    expect(out.items.map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg"]);
    expect([out.added, out.skipped, out.otherTaper]).toEqual([1, 1, 1]);
    expect(bulkSummary(out)).toBe("1 added · 1 already on ℞ — its tapering lines differ there");
  });

  it("on the pad with the SAME taper: skipped, and nothing more to say", () => {
    const out = bulkToRxItems([DELTA], [HEAD, cont("1+0+0")]);
    expect([out.added, out.skipped, out.otherTaper]).toEqual([0, 1, 0]);
    expect(bulkSummary(out)).toBe("0 added · 1 already on ℞");
  });

  it("on the pad with ANOTHER taper — a line changed, one more, one fewer, another order", () => {
    const TWO = med({ id: "t", drugLabel: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", contLines: [{ dose: "1+0+0", food: "After meal", duration: "5 days" }, { dose: "0.5+0+0", food: "After meal", duration: "5 days" }] });
    expect(bulkToRxItems([DELTA], [HEAD, cont("0.5+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([DELTA], [HEAD, cont("1+0+0"), cont("0.5+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([TWO], [HEAD, cont("1+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([TWO], [HEAD, cont("0.5+0+0"), cont("1+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([TWO], [HEAD, cont("1+0+0"), cont("0.5+0+0")]).otherTaper).toBe(0);
    expect(bulkToRxItems([DELTA], [HEAD, cont("1+0+0", { duration: "7 days" })]).otherTaper).toBe(1);
    expect(bulkToRxItems([DELTA], [HEAD, cont("1+0+0", { instruction: "Before meal" })]).otherTaper).toBe(1);
  });

  it("⚕️ a taper on the pad belongs to the medicine ABOVE it and stops at the next medicine or note", () => {
    const napaLine: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal", isCont: false };
    // The 1+0+0 line stands under Napa, not under Deltasone.
    expect(bulkToRxItems([DELTA], [HEAD, napaLine, cont("1+0+0")]).otherTaper).toBe(1);
    // A note ends the block above it.
    expect(bulkToRxItems([DELTA], [HEAD, { drug: "after dialysis", dose: "", duration: "", instruction: "", isNote: true }, cont("1+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([DELTA], [napaLine, HEAD, cont("1+0+0"), napaLine]).otherTaper).toBe(0);
  });

  it("reads a taper as the pad does: marked `isCont`, or — on older lines — a line with no drug name", () => {
    // Read back from the server a taper has its medicine's name filled in.
    expect(bulkToRxItems([DELTA], [HEAD, cont("1+0+0", { drug: "Tablet. Deltasone 5 mg" })]).otherTaper).toBe(0);
    // Saved before the flag existed: no `isCont` at all, a blank drug.
    const legacy: RxItem = { drug: "", dose: "1+0+0", duration: "5 days", instruction: "After meal" };
    expect(bulkToRxItems([DELTA], [{ ...HEAD, isCont: undefined }, legacy]).otherTaper).toBe(0);
  });

  it("the same medicine twice on the pad: it is enough that ONE of them has the taper shown", () => {
    expect(bulkToRxItems([DELTA], [HEAD, HEAD, cont("1+0+0")]).otherTaper).toBe(0);
  });

  it("a medicine with NO taper in the box, on the pad WITH one, is another instruction too", () => {
    const line: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal" };
    expect(bulkToRxItems([NAPA], [line, cont("1+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([NAPA], [line]).otherTaper).toBe(0);
  });
});

describe("what is said after Add", () => {
  it("the line beside the +", () => {
    expect(bulkSummary({ added: 3, skipped: 0, otherTaper: 0 })).toBe("3 added");
    expect(bulkSummary({ added: 3, skipped: 2, otherTaper: 0 })).toBe("3 added · 2 already on ℞");
    expect(bulkSummary({ added: 3, skipped: 1, otherTaper: 1 })).toBe("3 added · 1 already on ℞ — its tapering lines differ there");
    expect(bulkSummary({ added: 3, skipped: 2, otherTaper: 1 })).toBe("3 added · 2 already on ℞ — the tapering lines of 1 differ there");
    expect(bulkSummary({ added: 3, skipped: 2, otherTaper: 2 })).toBe("3 added · 2 already on ℞ — the tapering lines of 2 differ there");
  });

  it("the line in the box when nothing was added", () => {
    expect(nothingAddedNote(1, 0)).toBe("That medicine is already on ℞ with the same instruction — nothing was added.");
    expect(nothingAddedNote(3, 0)).toBe("Those medicines are already on ℞ with the same instructions — nothing was added.");
    expect(nothingAddedNote(1, 1)).toBe("That medicine is already on ℞, but its tapering lines there are not the ones shown here — nothing was added. Change them on the pad.");
    expect(nothingAddedNote(3, 1)).toBe("Those medicines are already on ℞ — nothing was added. The tapering lines of 1 are not the ones shown here: change them on the pad.");
    expect(nothingAddedNote(3, 2)).toBe("Those medicines are already on ℞ — nothing was added. The tapering lines of 2 are not the ones shown here: change them on the pad.");
  });
});

describe("isBulkAnswer — is this the list at all?", () => {
  it("an object with a list of medicines is, whatever else it holds", () => {
    expect(isBulkAnswer({ medicines: [] })).toBe(true);
    expect(isBulkAnswer({ medicines: [NAPA], truncated: false, more: 1 })).toBe(true);
  });

  // ⚕️ Read as an empty list, each of these was drawn as "No medicines yet".
  it.each([null, undefined, "", "<html>Sign in to the network</html>", 0, [], {}, { medicines: null }, { medicines: "none" }, { message: "ok" }])(
    "%j is not — it is a failure to load, never an empty history",
    (value) => {
      expect(isBulkAnswer(value)).toBe(false);
    },
  );
});

describe("readBulkList — rows the SERVER left out are counted too", () => {
  it("adds its own count to the server's", () => {
    expect(readBulkList({ medicines: [NAPA], unreadable: 2 }).unreadable).toBe(2);
    expect(readBulkList({ medicines: [NAPA, null], unreadable: 2 }).unreadable).toBe(3);
  });

  it("a count that is not a whole number of rows is not believed", () => {
    for (const bad of ["2", -1, 1.5, NaN, Infinity, null, {}]) expect(readBulkList({ medicines: [NAPA], unreadable: bad }).unreadable).toBe(0);
  });
});

describe("bulkToRxItems — the rest", () => {
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
    expect(bulkToRxItems([], [])).toEqual({ items: [], added: 0, skipped: 0, otherTaper: 0 });
  });
});
