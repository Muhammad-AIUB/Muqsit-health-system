// ⚕️ The OPD ℞ pad's lines that cannot be written — a dose with no medicine
// name, a >>> line with no named medicine directly above it — are never in
// `rxItems` (the printed sheet reads a nameless line as a >>> line). Until
// 19/10/2026 they lived in the pad's rows only, and any redraw of the pad —
// another tab, a reload, a mirrored device, a change made elsewhere — drew it
// without them, and nothing said so. They are now HELD: the pad's rows as they
// stood, kept beside `rxItems` in the editor state, and put back only while
// they still fit the `rxItems` they were taken with. Every medicine is made up.

import { describe, expect, it } from "vitest";
import { drawPad, droppedLines, padHoldOf, readPadHold } from "./rxPadHold";
import { rowsFromRxItems, rxItemsFromRows, unwritableRows } from "./rxRows";
import { rxCellIn, rxItemsIn, rxRowsIn } from "./rxLanguage";
import type { Row } from "@/components/prescription/MedicinePad";
import type { RxItem } from "@/types";

const med = (drug: string, dose: string, food = "", duration = ""): Row => ({ drug, dose, food, duration, checked: true, isMedicine: true, continuation: false });
const taper = (dose: string): Row => ({ drug: "", dose, food: "", duration: "", checked: true, isMedicine: true, continuation: true });
const note = (text: string): Row => ({ drug: text, dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
const blank = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
const json = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const NAPA = "Tablet. Napa 500 mg";
const BEX = "Capsule. Bexidol 20 mg";
// The pad as the physician left it: Napa, then a line whose name was cleared
// with its dose still there — red, refused at Save, in no `rxItems`.
const padWithRedLine = (): Row[] => [med(NAPA, "1+1+1", "After meal", "5 days"), med("", "1+0+1", "", "7 days"), blank()];
const shown = (rows: Row[]) => rows.map((r) => (r.continuation ? `>>>${r.dose}` : r.drug || (r.dose ? `(no name) ${r.dose}` : "")));

describe("padHoldOf — what the pad holds beside rxItems", () => {
  it("the pad's rows, while any line cannot be written", () => {
    const rows = padWithRedLine();
    expect(padHoldOf(rows)).toBe(rows);
  });

  it("nothing, when every line can be written", () => {
    expect(padHoldOf([med(NAPA, "1+1+1"), taper("0+0+1"), note("Bed rest"), blank()])).toBeNull();
  });

  it("a stranded >>> line from old data is held too", () => {
    const rows = rowsFromRxItems([{ drug: "Bed rest", dose: "", duration: "", instruction: "", isNote: true }, { drug: "", dose: "0+0+1", duration: "", instruction: "", isCont: true }]);
    expect(padHoldOf(rows)).toBe(rows);
  });
});

describe("drawPad — the held lines go back only where they still fit", () => {
  it("with nothing held, the pad is drawn from rxItems as it always was", () => {
    const items: RxItem[] = [{ drug: NAPA, dose: "1+1+1", instruction: "", duration: "" }];
    expect(drawPad(items, null)).toEqual(rowsFromRxItems(items));
  });

  it("the very rxItems they were taken with: the pad comes back as it stood, red line and all", () => {
    const held = padWithRedLine();
    const rows = drawPad(rxItemsFromRows(held), held);
    expect(rows).toEqual(held);
    expect(unwritableRows(rows)).toEqual([1]);
  });

  it("after a reload: both read back from the draft's JSON", () => {
    const held = padWithRedLine();
    const rows = drawPad(json(rxItemsFromRows(held)), json(held));
    expect(shown(rows)).toEqual([NAPA, "(no name) 1+0+1", ""]);
  });

  it("rxItems written in another key order (a template, an older draft) still fit", () => {
    const held = padWithRedLine();
    const items: RxItem[] = [{ instruction: "After meal", duration: "5 days", dose: "1+1+1", drug: NAPA }];
    expect(shown(drawPad(items, held))).toEqual([NAPA, "(no name) 1+0+1", ""]);
  });

  it("medicines APPENDED since (a template, Add Bulk Medicine, Move to Rx) go after the held lines", () => {
    const held = padWithRedLine();
    const items = [...rxItemsFromRows(held), { drug: BEX, dose: "0+0+1", instruction: "", duration: "14 days" }];
    const rows = drawPad(items, held);
    expect(shown(rows)).toEqual([NAPA, "(no name) 1+0+1", BEX, ""]);
    // What the pad writes is still exactly rxItems.
    expect(rxItemsFromRows(rows)).toEqual(rxItemsFromRows(rowsFromRxItems(items)));
  });

  it("a pad that held ONLY a red line keeps it when medicines are appended", () => {
    const held = [med("", "1+0+1"), blank()];
    const rows = drawPad([{ drug: BEX, dose: "0+0+1", instruction: "", duration: "" }], held);
    expect(shown(rows)).toEqual(["(no name) 1+0+1", BEX, ""]);
  });

  // Independent review, 19/10/2026, second pass: a >>> line that begins what was
  // appended — any device on a build without the hold sends one, most often a
  // taper its doctor added to the last medicine — was drawn as a
  // line of its own, and every later snapshot from that build appended it once
  // more. It is no append: the pad is drawn as the items read (as the printed
  // sheet and every other reader of rxItems reads them), and the held lines are
  // not put back (the pad says so).
  it("a >>> line that begins what was appended is no append: the pad is drawn as the items read", () => {
    const held = [med("", "1+0+1"), med(NAPA, "1+1+1"), blank()];
    const stray: RxItem = { drug: "", dose: "0+0+1", instruction: "", duration: "", isCont: true };
    const items = [...rxItemsFromRows(held), stray];
    expect(drawPad(items, held)).toEqual(rowsFromRxItems(items));
  });

  it("items that hold a line they cannot write themselves (an older build's) never fit: drawn as they read, that line in red", () => {
    const held = padWithRedLine();
    const stranded: RxItem = { drug: "", dose: "0+0+1", instruction: "", duration: "", isCont: true };
    const items = [stranded, ...rxItemsFromRows(held)];
    const rows = drawPad(items, held);
    expect(rows).toEqual(rowsFromRxItems(items));
    expect(unwritableRows(rows)).toEqual([0]);
  });

  it("a hold that lost its typing line is drawn with one", () => {
    const held = [med(NAPA, "1+1+1"), med("", "1+0+1")];
    const rows = drawPad(rxItemsFromRows(held), held);
    expect(shown(rows)).toEqual([NAPA, "(no name) 1+0+1", ""]);
    expect(rows[rows.length - 1]).toEqual(blank());
  });

  it("only one typing line is left at the end", () => {
    const held = padWithRedLine();
    const rows = drawPad([...rxItemsFromRows(held), { drug: BEX, dose: "", instruction: "", duration: "" }], held);
    expect(rows.filter((r) => !r.drug && !r.dose && !r.food && !r.duration)).toHaveLength(1);
    expect(rows[rows.length - 1]).toEqual(blank());
  });

  describe("a STALE hold is not put back onto different rxItems", () => {
    const held = padWithRedLine();
    const W = rxItemsFromRows(held);

    it("another prescription altogether", () => {
      const items: RxItem[] = [{ drug: BEX, dose: "0+0+1", instruction: "", duration: "" }];
      expect(drawPad(items, held)).toEqual(rowsFromRxItems(items));
    });

    it("the same medicine at another dose", () => {
      const items = [{ ...W[0], dose: "1+0+1" }];
      expect(unwritableRows(drawPad(items, held))).toEqual([]);
    });

    it("a medicine taken off", () => {
      expect(drawPad([], held)).toEqual(rowsFromRxItems([]));
    });

    it("a medicine put BEFORE the ones it was taken with", () => {
      const items = [{ drug: BEX, dose: "0+0+1", instruction: "", duration: "" }, ...W];
      expect(drawPad(items, held)).toEqual(rowsFromRxItems(items));
    });
  });

  it("a hold with nothing in it that cannot be written is not used", () => {
    const held = [med(NAPA, "1+1+1"), note("Bed rest"), blank()];
    const items = rxItemsFromRows(held);
    expect(drawPad(items, held)).toEqual(rowsFromRxItems(items));
  });
});

describe("readPadHold — a hold read back from a draft or another device", () => {
  it("reads what was written", () => {
    const held = padWithRedLine();
    expect(readPadHold(json(held))).toEqual(held);
  });

  it("keeps a line's generic, start date and habit mark", () => {
    const held: Row[] = [{ ...med(NAPA, "1+1+1"), generic: "paracetamol", sf: "17 June 2026", fromHabit: true }, med("", "1+0+1"), blank()];
    expect(readPadHold(json(held))).toEqual(held);
  });

  it("a field a row may go without, written null, is read as absent — the hold is not lost for it", () => {
    const rows = readPadHold([{ ...med(NAPA, "1+1+1"), generic: null, sf: null, fromHabit: null, checked: null }, med("", "1+0+1"), blank()]);
    expect(rows?.[0]).toEqual(med(NAPA, "1+1+1"));
    expect(rows).toHaveLength(3);
  });

  it("nothing for a draft without one (an older build)", () => {
    expect(readPadHold(undefined)).toBeNull();
    expect(readPadHold(null)).toBeNull();
  });

  it("nothing for rows in which every line can be written", () => {
    expect(readPadHold(json([med(NAPA, "1+1+1"), blank()]))).toBeNull();
  });

  it("nothing for what is not a pad", () => {
    expect(readPadHold("rows")).toBeNull();
    expect(readPadHold({ 0: med("", "1+0+1") })).toBeNull();
    expect(readPadHold([med("", "1+0+1"), { drug: "", dose: 5 }])).toBeNull();
    expect(readPadHold([med("", "1+0+1"), null])).toBeNull();
    expect(readPadHold([{ ...med("", "1+0+1"), isMedicine: "yes" }])).toBeNull();
    expect(readPadHold(Array.from({ length: 501 }, () => med("", "1+0+1")))).toBeNull();
  });

  it("drops what a row does not carry", () => {
    const [first] = readPadHold([{ ...med("", "1+0+1"), injected: "<b>x</b>" }]) ?? [];
    expect(Object.keys(first ?? {}).sort()).toEqual(["checked", "continuation", "dose", "drug", "duration", "food", "isMedicine"]);
  });
});

describe("droppedLines — what left the pad that could not be written", () => {
  it("nothing, when the red line is still there", () => {
    const before = padWithRedLine();
    expect(droppedLines(before, json(before))).toEqual([]);
  });

  it("the red line, when the pad was drawn without it", () => {
    const before = padWithRedLine();
    expect(droppedLines(before, rowsFromRxItems(rxItemsFromRows(before)))).toEqual([before[1]]);
  });

  it("a line that can be written is never counted", () => {
    expect(droppedLines([med(NAPA, "1+1+1"), blank()], [blank()])).toEqual([]);
  });

  it("a red line the BAN / EN switch wrote in the other language is the same line", () => {
    const before = padWithRedLine();
    expect(droppedLines(before, rxRowsIn(before, "bn"))).toEqual([]);
    expect(droppedLines(rxRowsIn(before, "bn"), before)).toEqual([]);
  });

  // Independent review, 19/10/2026: "the same dose at the same place" was taken
  // for the line named elsewhere — and hid a real loss behind a common dose.
  it("a red line whose place another medicine with the same dose now takes is still said", () => {
    const before = padWithRedLine();
    const after = [before[0], med("Tablet. Seclo 20 mg", "1+0+1", "", "7 days"), blank()];
    expect(droppedLines(before, after)).toEqual([before[1]]);
  });

  it("counts each copy: two identical red lines, one left", () => {
    const red = med("", "1+0+1");
    expect(droppedLines([red, { ...red }, blank()], [{ ...red }, blank()])).toEqual([red]);
  });
});

describe("rxRowsIn — the BAN / EN switch on the pad's own rows", () => {
  it("writes every medicine line's dose, food and duration, red ones too, and never a name or a note", () => {
    const rows = [...padWithRedLine().slice(0, 2), taper("0+0+1"), note("Bed rest")];
    const out = rxRowsIn(rows, "bn");
    expect(out[0].food).toBe(rxCellIn("After meal", "bn"));
    expect(out[0].food).not.toBe("After meal");
    expect(out[1].dose).toBe(rxCellIn("1+0+1", "bn"));
    expect(out[2].dose).toBe(rxCellIn("0+0+1", "bn"));
    expect(out[0].drug).toBe(NAPA);
    expect(out[3]).toBe(rows[3]);
  });

  it("is the same conversion as rxItemsIn, so a converted hold still fits converted rxItems", () => {
    const held = padWithRedLine();
    const items = rxItemsIn(rxItemsFromRows(held), "bn");
    const rows = drawPad(items, rxRowsIn(held, "bn"));
    expect(unwritableRows(rows)).toEqual([1]);
    expect(rxItemsFromRows(rows)).toEqual(items);
  });

  it("the same list back when nothing changes", () => {
    const rows = [med(NAPA, "১+১+১"), blank()];
    expect(rxRowsIn(rows, "bn")).toBe(rows);
  });
});
