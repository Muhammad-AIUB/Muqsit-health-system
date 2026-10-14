import { describe, expect, it } from "vitest";
import { habitIn, rxCellIn, rxItemsIn } from "./rxLanguage";
import type { RxItem } from "@/types";

// ⚕️ The physician's table, word for word (2026-10-14). A failure here is a
// change to what prints on a prescription — check with the physician first.
const TABLE: [string, string][] = [
  ["Before meal", "খাবারের আগে"],
  ["After meal", "খাবারের পরে"],
  ["With food", "খাবারের সাথে"],
  ["2 hr before meal", "খাবারের ২ ঘণ্টা আগে"],
  ["2 hr after meal", "খাবারের ২ ঘণ্টা পরে"],
  ["2 hr before or after meal", "খাবারের ২ ঘণ্টা আগে বা পরে"],
  ["Continue", "চলবে"],
  ["7 days", "৭ দিন"],
  ["2 week", "২ সপ্তাহ"],
  ["2 month", "২ মাস"],
  ["at night", "রাতে"],
];

describe("rxCellIn — the approved table", () => {
  it.each(TABLE)("%s → %s", (en, bn) => {
    expect(rxCellIn(en, "bn")).toBe(bn);
  });

  it.each(TABLE)("…and back: %s ← %s", (en, bn) => {
    expect(rxCellIn(bn, "en")).toBe(en);
  });

  it("reads English in any capitals", () => {
    expect(rxCellIn("Before Meal", "bn")).toBe("খাবারের আগে");
    expect(rxCellIn("CONTINUE", "bn")).toBe("চলবে");
  });

  it("takes a decimal count of hours", () => {
    expect(rxCellIn("1.5 hr before meal", "bn")).toBe("খাবারের ১.৫ ঘণ্টা আগে");
    expect(rxCellIn("খাবারের ১.৫ ঘণ্টা আগে", "en")).toBe("1.5 hr before meal");
  });

  it("reads the plural units, and writes the app's own English back", () => {
    expect(rxCellIn("1 days", "bn")).toBe("১ দিন");
    expect(rxCellIn("১ দিন", "en")).toBe("1 days");
    expect(rxCellIn("2 weeks", "bn")).toBe("২ সপ্তাহ");
    expect(rxCellIn("২ সপ্তাহ", "en")).toBe("2 week");
    expect(rxCellIn("3 months", "bn")).toBe("৩ মাস");
  });
});

describe("rxCellIn — digits", () => {
  it("writes a dose schedule in Bangla digits and back", () => {
    expect(rxCellIn("1+0+1", "bn")).toBe("১+০+১");
    expect(rxCellIn("১+০+১", "en")).toBe("1+0+1");
    expect(rxCellIn("1/2+0+1/2", "bn")).toBe("১/২+০+১/২");
    expect(rxCellIn("12+00+08", "bn")).toBe("১২+০০+০৮");
  });

  it("⚕️ keeps a decimal point a point — never the dari", () => {
    expect(rxCellIn("0.5", "bn")).toBe("০.৫");
    expect(rxCellIn("0.5", "bn")).not.toContain("।");
    expect(rxCellIn("০.৫", "en")).toBe("0.5");
  });

  it("keeps the spacing of a schedule exactly as written", () => {
    expect(rxCellIn("1 + 0 + 1", "bn")).toBe("১ + ০ + ১");
  });

  it("finishes a cell that is half Bangla already", () => {
    expect(rxCellIn("2 মাস", "bn")).toBe("২ মাস");
    expect(rxCellIn("৭ days", "en")).toBe("7 days");
  });
});

describe("rxCellIn — what it does not touch", () => {
  it("leaves text the table does not cover exactly as written", () => {
    for (const s of ["2.5 ml", "Take rest", "1m", "1-0-1", "after lunch", ""]) {
      expect(rxCellIn(s, "bn")).toBe(s);
      expect(rxCellIn(s, "en")).toBe(s);
    }
  });

  it("never rewrites an English cell when asked for English", () => {
    expect(rxCellIn("2 weeks", "en")).toBe("2 weeks");
    expect(rxCellIn("before meal", "en")).toBe("before meal");
  });

  it("never rewrites a Bangla cell when asked for Bangla", () => {
    expect(rxCellIn("খাবারের আগে", "bn")).toBe("খাবারের আগে");
    expect(rxCellIn("নিজে লেখা", "bn")).toBe("নিজে লেখা");
  });
});

const item = (over: Partial<RxItem>): RxItem => ({ drug: "Tablet. Napa 500 mg", dose: "", instruction: "", duration: "", ...over });

describe("rxItemsIn", () => {
  it("writes the three cells and nothing else", () => {
    const [out] = rxItemsIn([item({ dose: "1+0+1", instruction: "Before meal", duration: "7 days" })], "bn");
    expect(out).toEqual(item({ dose: "১+০+১", instruction: "খাবারের আগে", duration: "৭ দিন" }));
  });

  it("leaves a note line alone", () => {
    const note = item({ drug: "Take rest for 2 weeks", isNote: true });
    expect(rxItemsIn([note], "bn")[0]).toBe(note);
  });

  it("hands back the same list when nothing changes", () => {
    const list = [item({ dose: "১+০+১" })];
    expect(rxItemsIn(list, "bn")).toBe(list);
  });
});

describe("habitIn", () => {
  it("writes the habit and its tapering lines", () => {
    const h = { id: "h1", dose: "1+0+1", food: "After meal", duration: "5 days", contLines: [{ dose: "0+0+1", food: "", duration: "Continue" }] };
    expect(habitIn(h, "bn")).toEqual({
      id: "h1", dose: "১+০+১", food: "খাবারের পরে", duration: "৫ দিন",
      contLines: [{ dose: "০+০+১", food: "", duration: "চলবে" }],
    });
  });
});
