import { describe, expect, it } from "vitest";
import {
  bulkSummary, bulkToRxItems, instructionOf, medicinesOnPad, nothingAddedNote, patientsLabel,
  readBulkList, searchBulk, sortBulk, type BulkMedicine,
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

const line = (drug: string, dose: string, instruction: string, duration: string, over: Partial<RxItem> = {}): RxItem =>
  ({ drug, dose, duration, instruction, isCont: false, ...over });
const taper = (dose: string, over: Partial<RxItem> = {}): RxItem =>
  ({ drug: "", dose, duration: "5 days", instruction: "After meal", isCont: true, ...over });
const note = (text: string): RxItem => ({ drug: text, dose: "", duration: "", instruction: "", isNote: true });

describe("readBulkList — what the server sent, read without trusting it", () => {
  it("reads a well-formed response", () => {
    const out = readBulkList({
      medicines: [{ ...NAPA, drugKey: "tablet. napa 500mg", lastUsedAt: "2026-10-01T00:00:00.000Z" }, SERGEL],
      truncated: false,
    });
    expect(out).toEqual({ medicines: [{ ...NAPA, lastUsedAt: "2026-10-01T00:00:00.000Z" }, SERGEL], truncated: false, unreadable: 0 });
  });

  // ⚕️ Read as an EMPTY list, each of these was drawn as "No medicines yet" — to
  // a doctor with years of prescriptions. "Not the list" is null, and the
  // caller treats it as a failed load.
  it.each([null, undefined, "", 7, "<html>Sign in to the network</html>", [], {}, { medicines: "no" }, { medicines: null }, { message: "ok" }])(
    "%j is not the list: null, never an empty list and never a throw",
    (value) => {
      expect(readBulkList(value)).toBeNull();
    },
  );

  it("a list with nothing in it IS the list", () => {
    expect(readBulkList({ medicines: [] })).toEqual({ medicines: [], truncated: false, unreadable: 0 });
  });

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
    expect(out?.medicines).toEqual([NAPA]);
    expect(out?.unreadable).toBe(7);
    expect(out?.truncated).toBe(true);
  });

  it("rows the SERVER left out are counted with its own", () => {
    expect(readBulkList({ medicines: [NAPA], unreadable: 2 })?.unreadable).toBe(2);
    expect(readBulkList({ medicines: [NAPA, null], unreadable: 2 })?.unreadable).toBe(3);
    for (const bad of ["2", -1, 1.5, NaN, Infinity, null, {}]) expect(readBulkList({ medicines: [NAPA], unreadable: bad })?.unreadable).toBe(0);
  });

  it("⚕️ invents nothing: a missing dose, food or duration is blank, a missing count is 0, a missing generic or date is absent", () => {
    const out = readBulkList({ medicines: [{ id: "h9", drugLabel: "Tablet. Bare 5 mg" }] });
    expect(out?.medicines).toEqual([
      { id: "h9", drugLabel: "Tablet. Bare 5 mg", dose: "", food: "", duration: "", contLines: [], patientCount: 0 },
    ]);
  });

  it("a cell that is not text is blank, never a number or an object turned into words", () => {
    const out = readBulkList({ medicines: [{ id: "h9", drugLabel: "Tablet. Odd 5 mg", dose: 2, food: { a: 1 }, duration: null, generic: 7, patientCount: "30", lastUsedAt: 20261001 }] });
    expect(out?.medicines).toEqual([
      { id: "h9", drugLabel: "Tablet. Odd 5 mg", dose: "", food: "", duration: "", contLines: [], patientCount: 0 },
    ]);
  });

  it("only `truncated: true` is truncated", () => {
    expect(readBulkList({ medicines: [], truncated: "yes" })?.truncated).toBe(false);
    expect(readBulkList({ medicines: [], truncated: 1 })?.truncated).toBe(false);
  });
});

describe("sortBulk", () => {
  const names = (list: BulkMedicine[]) => list.map((m) => m.drugLabel);

  it("Popular: most patients first; the same count in A-to-Z order of the brand", () => {
    expect(names(sortBulk([SERGEL, ACE, NAPA, DELTA], "popular"))).toEqual([
      "Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Ace 500 mg", "Tablet. Deltasone 5 mg",
    ]);
  });

  it("Alphabetical: by the BRAND, not by the dosage form the label starts with", () => {
    expect(names(sortBulk([SERGEL, ACE, NAPA, DELTA], "alphabetical"))).toEqual([
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
    expect(names(sortBulk(two, "alphabetical"))).toEqual(["Tablet. Napa 500 mg", "Tablet. Napa 665 mg"]);
    expect(names(sortBulk(two, "popular"))).toEqual(["Tablet. Napa 500 mg", "Tablet. Napa 665 mg"]);
  });

  it("a label with no dosage form is filed under itself", () => {
    const odd = [med({ id: "z", drugLabel: "Zinc" }), med({ id: "a", drugLabel: "500" }), med({ id: "m", drugLabel: "Tablet. Napa 500 mg" })];
    expect(sortBulk(odd, "alphabetical").map((m) => m.id)).toEqual(["a", "m", "z"]);
  });

  it("the same medicines sort to the same order every time, at a size that matters", () => {
    const many = Array.from({ length: 500 }, (_, i) => med({ id: `m${i}`, drugLabel: `Tablet. Brand${(i * 7919) % 500} ${5 + (i % 3)} mg`, patientCount: i % 9 }));
    const once = sortBulk(many, "popular").map((m) => m.id);
    expect(sortBulk([...many].reverse(), "popular").map((m) => m.id)).toEqual(once);
    expect(new Set(once).size).toBe(500);
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

  it("is shown in the language asked for, as it would be added (2026-10-15)", () => {
    expect(instructionOf(NAPA, "bn")).toBe("১+১+১ · খাবারের পরে · ৫ দিন");
    expect(instructionOf({ dose: "১+০+০", food: "", duration: "চলবে" }, "en")).toBe("1+0+0 · Continue");
    expect(instructionOf({ dose: "1+0+1", food: "after lunch", duration: "" }, "bn")).toBe("১+০+১ · after lunch");
    expect(instructionOf(NAPA)).toBe("1+1+1 · After meal · 5 days"); // no language: as stored
  });

  it("the count is of PATIENTS", () => {
    expect(patientsLabel(30)).toBe("30 patients");
    expect(patientsLabel(1)).toBe("1 patient");
    expect(patientsLabel(0)).toBe("0 patients");
  });
});

// ⚕️ Which medicines stand on the pad — at ANY dose. The box marks them, so
// that a doctor about to tick one sees it is there already.
describe("medicinesOnPad", () => {
  // ⚕️ A note that reads as a medicine names it on the prescription, and is
  // counted (physician's decision, 2026-10-14). A tapering line names nothing.
  it("is the medicines the pad names — its lines and its notes, not its tapering lines", () => {
    const pad = [note("bed rest"), note("Tablet. Ace 500 mg"), line("Tablet. Napa 500 mg", "1+1+1", "After meal", "3 days"), line("Tablet. Deltasone 5 mg", "2+0+0", "", ""), taper("1+0+0", { drug: "Tablet. Prednisolone 5 mg" }), taper("0.5+0+0")];
    const there = medicinesOnPad(pad);
    expect(["Tablet. Napa 500 mg", "Tablet. Deltasone 5 mg", "Tablet. Ace 500 mg", "Bed rest"].map((m) => there.has(m))).toEqual([true, true, true, true]);
    expect(there.has("Tablet. Prednisolone 5 mg")).toBe(false);
    expect(there.size).toBe(4);
  });

  it("a medicine is the same medicine however it is spaced or capitalised — and another strength is another", () => {
    const pad = medicinesOnPad([line("tab napa 500MG", "", "", "")]);
    expect(pad.has("Tablet. Napa 500 mg")).toBe(true);
    expect(pad.has("Tablet. Napa 665 mg")).toBe(false);
    expect(pad.has("Syrup. Napa 500 mg")).toBe(false);
  });

  it("⚕️ a medicine written without its dosage form is the one with it — at the same strength only", () => {
    const pad = medicinesOnPad([line("Sergel 40 mg", "1+0+1", "", "")]);
    expect(pad.has("Capsule (Enteric Coated). Sergel 40 mg")).toBe(true);
    expect(pad.has("Capsule (Enteric Coated). Sergel 20 mg")).toBe(false);
    expect(medicinesOnPad([line("Capsule (Enteric Coated). Sergel 40 mg", "", "", "")]).has("Sergel 40 mg")).toBe(true);
  });

  it("an empty pad, or one that is not there, holds none", () => {
    expect(medicinesOnPad([]).size).toBe(0);
    expect(medicinesOnPad(undefined as unknown as RxItem[]).size).toBe(0);
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
    expect([out.added, out.repeated.length, out.skipped, out.otherTaper]).toEqual([2, 0, 0, 0]);
    expect(out.items).toHaveLength(3);
    expect(out.items[0].drug).toBe("Tablet. Deltasone 5 mg");
  });

  it("does not change the pad it was shown or the medicines it was given", () => {
    const pad = [line("Tablet. Napa 500 mg", "1+0+1", "After meal", "5 days")];
    const padBefore = JSON.stringify(pad);
    const picked = [DELTA];
    const pickedBefore = JSON.stringify(picked);
    bulkToRxItems(picked, pad);
    expect(JSON.stringify(pad)).toBe(padBefore);
    expect(JSON.stringify(picked)).toBe(pickedBefore);
  });

  it("nothing ticked is nothing added", () => {
    expect(bulkToRxItems([], [])).toEqual({ items: [], added: 0, repeated: [], skipped: 0, otherTaper: 0 });
  });
});

// A LINE is not written twice: the same medicine with the same dose, timing and
// duration. (The rule of Drug history's "Move to Rx", by the physician's
// decision.) The same medicine at ANOTHER dose is another line, and it is
// added — and counted, so that the box can say the medicine is now there twice.
describe("bulkToRxItems — what is on the pad already", () => {
  const onPad = (over: Partial<RxItem> = {}) => [line("Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days", over)];

  it("the same line is skipped", () => {
    const out = bulkToRxItems([NAPA, SERGEL], onPad());
    expect(out.items.map((it) => it.drug)).toEqual(["Capsule. Sergel 20 mg"]);
    expect([out.added, out.repeated.length, out.skipped, out.otherTaper]).toEqual([1, 0, 1, 0]);
  });

  it("⚕️ the same medicine at another dose, timing or duration is ADDED — and counted as now standing there more than once", () => {
    for (const other of [{ dose: "1+0+1" }, { instruction: "Before meal" }, { duration: "3 days" }]) {
      const out = bulkToRxItems([NAPA], onPad(other));
      expect(out.items.map((it) => [it.drug, it.dose, it.instruction, it.duration])).toEqual([["Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days"]]);
      expect([out.added, out.repeated.length, out.skipped]).toEqual([1, 1, 0]);
      expect(out.repeated).toEqual(["Tablet. Napa 500 mg"]); // by the name it is added under
    }
  });

  it("another strength, another form or another brand is another medicine: added, and not counted as a repeat", () => {
    for (const other of ["Tablet. Napa 665 mg", "Syrup. Napa 500 mg", "Tablet. Napa Extra 500 mg", "Tablet (Extended Release). Napa 500 mg"]) {
      const out = bulkToRxItems([NAPA], onPad({ drug: other }));
      expect([other, out.added, out.repeated.length, out.skipped]).toEqual([other, 1, 0, 0]);
    }
  });

  // The box's label is the medicine as this doctor LAST wrote it; the pad's may
  // have been picked from the medicine list. Compared letter for letter,
  // `Tablet. Napa 500mg` went on the pad beside `Tablet. Napa 500 mg`.
  it("⚕️ the same medicine written with other spacing or capitals is the same line", () => {
    for (const written of ["Tablet. Napa 500mg", "tablet. napa 500 MG", "  Tablet.   Napa 500 mg ", "Tab Napa 500 mg"]) {
      const out = bulkToRxItems([NAPA], onPad({ drug: written }));
      expect([written, out.added, out.skipped]).toEqual([written, 0, 1]);
    }
  });

  it("two ticked rows that are the same line are added once", () => {
    const out = bulkToRxItems([NAPA, med({ id: "dup", drugLabel: "Tablet. Napa 500mg" })], []);
    expect([out.added, out.repeated.length, out.skipped]).toEqual([1, 0, 1]);
    expect(out.items.map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg"]);
  });

  // ⚕️ A note that reads as the medicine IS a line of it — one with no dose,
  // food or duration (physician's decision, 2026-10-14). Beside a medicine
  // with an instruction it is another line, and the box says the medicine is
  // now there more than once; for one with nothing written it is the same
  // line, and nothing is added: the name would have been printed twice.
  it("⚕️ a note that reads as the medicine: the same line when nothing is written, another one when a dose is", () => {
    const withDose = bulkToRxItems([NAPA], [note("Tablet. Napa 500 mg")]);
    expect([withDose.added, withDose.repeated, withDose.skipped]).toEqual([1, ["Tablet. Napa 500 mg"], 0]);
    const nothing = bulkToRxItems([ACE], [note("tab ace 500mg")]);
    expect([nothing.added, nothing.repeated.length, nothing.skipped, nothing.otherTaper]).toEqual([0, 0, 1, 0]);
  });

  // ⚕️ A note stands for a line with NOTHING in it — no tapering lines either.
  // A medicine whose doses are all in its tapering lines is added beside it,
  // tapers and all, and said to be on ℞ more than once (review, before release).
  it("⚕️ …but a medicine whose doses are in its tapering lines is not that note: added", () => {
    const TAPER_ONLY = med({ id: "t", drugLabel: "Tablet. Deltasone 5 mg", dose: "", food: "", duration: "", contLines: [{ dose: "4+0+0", food: "After meal", duration: "7 days" }] });
    const out = bulkToRxItems([TAPER_ONLY], [note("Tablet. Deltasone 5 mg")]);
    expect([out.added, out.repeated.length, out.skipped, out.otherTaper]).toEqual([1, 1, 0, 0]);
    expect(out.items.map((it) => [it.dose, it.isCont])).toEqual([["", false], ["4+0+0", true]]);
  });

  it("…and a note is a line of its own: a taper under it belongs to nothing", () => {
    const out = bulkToRxItems([DELTA], [note("Tablet. Deltasone 5 mg"), taper("1+0+0")]);
    expect([out.added, out.repeated.length, out.skipped]).toEqual([1, 1, 0]);
    // Not the note's own tapering line either: the note stands with none.
    const ace = bulkToRxItems([ACE], [note("Tablet. Ace 500 mg"), taper("1+0+0")]);
    expect([ace.added, ace.skipped, ace.otherTaper]).toEqual([0, 1, 0]);
  });

  // ⚕️ The dose, the food and the duration: capitals and spaces set aside, and
  // nothing else (physician's decision, 2026-10-14).
  it("⚕️ the same line typed with other spaces or capitals is skipped — first line and tapering lines alike", () => {
    for (const over of [{ dose: "1 + 1 + 1" }, { instruction: "after meal" }, { duration: "5 Days" }, { duration: "5days" }]) {
      const out = bulkToRxItems([NAPA], onPad(over));
      expect([over, out.added, out.skipped]).toEqual([over, 0, 1]);
    }
    const head = line("Tablet. Deltasone 5 mg", "2 + 0 + 0", "after meal", "5 DAYS");
    const out = bulkToRxItems([DELTA], [head, taper("1 + 0 + 0", { instruction: "AFTER MEAL", duration: "5 days" })]);
    expect([out.added, out.skipped, out.otherTaper]).toEqual([0, 1, 0]);
  });

  it("⚕️ another notation is another line: added", () => {
    for (const over of [{ dose: "1-1-1" }, { dose: "111" }, { instruction: "After meal." }, { duration: "5 day" }]) {
      const out = bulkToRxItems([NAPA], onPad(over));
      expect([over, out.added, out.skipped]).toEqual([over, 1, 0]);
    }
  });

  it("⚕️ a medicine written without its form on the pad is the same medicine: the same line skipped, another dose a repeat", () => {
    expect(bulkToRxItems([NAPA], onPad({ drug: "Napa 500 mg" })).skipped).toBe(1);
    const other = bulkToRxItems([NAPA], onPad({ drug: "Napa 500 mg", dose: "1+0+1" }));
    expect([other.added, other.repeated]).toEqual([1, ["Tablet. Napa 500 mg"]]);
    const sergel40 = bulkToRxItems([SERGEL], [line("Sergel 40 mg", "1+0+1", "Before meal", "14 days")]);
    expect([sergel40.added, sergel40.repeated.length, sergel40.skipped]).toEqual([1, 0, 0]); // Sergel 20 mg is not 40
  });
});

// ⚕️ Only the FIRST line is compared for the skip. With Deltasone on the pad
// WITHOUT a taper, the box's Deltasone — which has one — is skipped, and its
// tapering lines are not added. That is counted, so the box does not say "the
// same instruction" of an instruction that is not on the prescription.
describe("bulkToRxItems — a tapering medicine whose first line is already on the pad", () => {
  const HEAD = line("Tablet. Deltasone 5 mg", "2+0+0", "After meal", "5 days");

  it("on the pad with NO taper: skipped, nothing of it added, and counted", () => {
    const out = bulkToRxItems([DELTA, NAPA], [HEAD]);
    expect(out.items.map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg"]);
    expect([out.added, out.skipped, out.otherTaper]).toEqual([1, 1, 1]);
  });

  it("on the pad with the SAME taper: skipped, and nothing more to say", () => {
    const out = bulkToRxItems([DELTA], [HEAD, taper("1+0+0")]);
    expect([out.added, out.skipped, out.otherTaper]).toEqual([0, 1, 0]);
  });

  it("on the pad with ANOTHER taper — a line changed, one more, one fewer, another order", () => {
    const TWO = med({ id: "t", drugLabel: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", contLines: [{ dose: "1+0+0", food: "After meal", duration: "5 days" }, { dose: "0.5+0+0", food: "After meal", duration: "5 days" }] });
    expect(bulkToRxItems([DELTA], [HEAD, taper("0.5+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([DELTA], [HEAD, taper("1+0+0"), taper("0.5+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([TWO], [HEAD, taper("1+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([TWO], [HEAD, taper("0.5+0+0"), taper("1+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([TWO], [HEAD, taper("1+0+0"), taper("0.5+0+0")]).otherTaper).toBe(0);
    expect(bulkToRxItems([DELTA], [HEAD, taper("1+0+0", { duration: "7 days" })]).otherTaper).toBe(1);
    expect(bulkToRxItems([DELTA], [HEAD, taper("1+0+0", { instruction: "Before meal" })]).otherTaper).toBe(1);
  });

  it("⚕️ a taper on the pad belongs to the medicine ABOVE it and stops at the next medicine or note", () => {
    const napa = line("Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days");
    expect(bulkToRxItems([DELTA], [HEAD, napa, taper("1+0+0")]).otherTaper).toBe(1); // it stands under Napa
    expect(bulkToRxItems([DELTA], [HEAD, note("after dialysis"), taper("1+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([DELTA], [napa, HEAD, taper("1+0+0"), napa]).otherTaper).toBe(0);
  });

  it("reads a taper as the pad does: marked `isCont`, or — on older lines — a line with no drug name", () => {
    // Read back from the server a taper has its medicine's name filled in.
    expect(bulkToRxItems([DELTA], [HEAD, taper("1+0+0", { drug: "Tablet. Deltasone 5 mg" })]).otherTaper).toBe(0);
    // Saved before the flag existed: no `isCont` at all, a blank drug.
    const legacy: RxItem = { drug: "", dose: "1+0+0", duration: "5 days", instruction: "After meal" };
    expect(bulkToRxItems([DELTA], [{ ...HEAD, isCont: undefined }, legacy]).otherTaper).toBe(0);
  });

  it("the same medicine twice on the pad: it is enough that ONE of them has the taper shown", () => {
    expect(bulkToRxItems([DELTA], [HEAD, HEAD, taper("1+0+0")]).otherTaper).toBe(0);
  });

  it("a medicine with NO taper in the box, on the pad WITH one, is another instruction too", () => {
    const napa = line("Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days");
    expect(bulkToRxItems([NAPA], [napa, taper("1+0+0")]).otherTaper).toBe(1);
    expect(bulkToRxItems([NAPA], [napa]).otherTaper).toBe(0);
  });
});

describe("what is said after Add", () => {
  const said = (added: number, repeated: string[], skipped: number, otherTaper: number) => bulkSummary({ added, repeated, skipped, otherTaper });
  const N = "Tablet. Napa 500 mg", S = "Capsule. Sergel 20 mg", D = "Tablet. Deltasone 5 mg";

  it("the line beside the +", () => {
    expect(said(3, [], 0, 0)).toBe("3 added");
    expect(said(3, [], 2, 0)).toBe("3 added · 2 already on ℞");
    expect(said(3, [], 1, 1)).toBe("3 added · 1 already on ℞ — its tapering lines differ there");
    expect(said(3, [], 2, 1)).toBe("3 added · 2 already on ℞ — the tapering lines of 1 differ there");
  });

  // The pad has scrolled to the lines just added, and the line that was there
  // before may be above its edge: "1 of them" left the doctor to find which.
  it("⚕️ says WHICH medicine now stands on the prescription more than once, by the name it has on the pad", () => {
    expect(said(1, [N], 0, 0)).toBe("1 added · it is now on ℞ more than once"); // the one added: no name needed
    expect(said(3, [N], 0, 0)).toBe("3 added · “Tablet. Napa 500 mg” is now on ℞ more than once");
    expect(said(2, [N, S], 0, 0)).toBe("2 added · “Tablet. Napa 500 mg” and “Capsule. Sergel 20 mg” are now on ℞ more than once");
    expect(said(3, [N, S], 1, 0)).toBe("3 added · “Tablet. Napa 500 mg” and “Capsule. Sergel 20 mg” are now on ℞ more than once · 1 already on ℞");
  });

  it("…and how many, once they are more than a line can name", () => {
    expect(said(5, [N, S, D], 0, 0)).toBe("5 added · 3 of them are now on ℞ more than once");
  });

  it("the line in the box when nothing was added", () => {
    expect(nothingAddedNote(1, 0)).toBe("That medicine is already on ℞ with the same instruction — nothing was added.");
    expect(nothingAddedNote(3, 0)).toBe("Those medicines are already on ℞ with the same instructions — nothing was added.");
    expect(nothingAddedNote(1, 1)).toBe("That medicine is already on ℞, but its tapering lines there are not the ones shown here — nothing was added. Change them on the pad.");
    expect(nothingAddedNote(3, 1)).toBe("Those medicines are already on ℞ — nothing was added. The tapering lines of 1 are not the ones shown here: change them on the pad.");
  });
});
