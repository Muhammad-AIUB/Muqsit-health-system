import { describe, expect, it } from "vitest";
import { buildDrugHistoryEntry, drugHistoryEntriesFromPad, isDuplicateDrugHistoryEntry, NO_DATE, unwritableLines, type DrugHistoryAddInput } from "./drugHistoryAdd";
import { contRow, emptyRow, type Row } from "@/components/prescription/MedicinePad";

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

// ⚕️ "+ Add medicine" types into the ℞ pad's own rows since the physician's
// sheet of 15/10/2026 (item 1: "2 jaigai e add medicine er philosophy
// prescription er idea follow korbe"). What the doctor typed there becomes
// history entries exactly as the ℞ → Drug-history mirror writes them: a
// medicine, its >>> tapering lines under it as (cont), a note as (note) — every
// character as typed, nothing invented, all stamped with the tab's date.
describe("drugHistoryEntriesFromPad", () => {
  const med = (drug: string, dose = "", food = "", duration = ""): Row => ({ ...emptyRow(), drug, dose, food, duration, isMedicine: true });
  const taper = (dose: string, food = "", duration = ""): Row => ({ ...contRow(), dose, food, duration });
  const note = (text: string): Row => ({ ...emptyRow(), drug: text });

  it("writes each medicine line as typed, in pad order, under the tab's date", () => {
    const r = drugHistoryEntriesFromPad([med("Tablet. Napa 500 mg", "1+0+1", "After meal", "5 days"), med("Capsule. Sergel 20 mg", "1+0+0"), emptyRow()], "15/10/2026", []);
    expect(r.entries).toEqual([
      "15/10/2026: Tablet. Napa 500 mg — 1+0+1 — After meal — 5 days",
      "15/10/2026: Capsule. Sergel 20 mg — 1+0+0 —  — ",
    ]);
    expect(r.skipped).toEqual([]);
  });

  it("keeps a tapering line with its medicine, as (cont)", () => {
    const r = drugHistoryEntriesFromPad([med("Tablet. Lenva 4 mg", "0+0+1", "", "7 days"), taper("0+0+2", "", "Continue"), emptyRow()], NO_DATE, []);
    expect(r.entries).toEqual([
      "01/01/2000: Tablet. Lenva 4 mg — 0+0+1 —  — 7 days",
      "01/01/2000(cont): 0+0+2 —  — Continue",
    ]);
  });

  it("writes a note as a note — a line the pad did not take for a medicine is not made one", () => {
    const r = drugHistoryEntriesFromPad([note("No regular medication"), emptyRow()], "15/10/2026", []);
    expect(r.entries).toEqual(["15/10/2026(note): No regular medication"]);
  });

  it("writes nothing for blank lines", () => {
    expect(drugHistoryEntriesFromPad([emptyRow(), med("   "), taper(""), emptyRow()], "15/10/2026", []).entries).toEqual([]);
  });

  it("skips an exact repeat of what the tab already holds, and names it", () => {
    const existing: DrugHistoryAddInput[] = [{ drug: "Tablet. Napa 500 mg", dose: "1+0+1", food: "After meal", duration: "5 days" }];
    const r = drugHistoryEntriesFromPad([med("tab napa 500mg", "1 + 0 + 1", "after meal", "5 days"), med("Tablet. Napa 500 mg", "1+1+1")], "15/10/2026", existing);
    expect(r.entries).toEqual(["15/10/2026: Tablet. Napa 500 mg — 1+1+1 —  — "]);
    expect(r.skipped).toEqual(["tab napa 500mg"]);
  });

  it("the same line typed twice in one go is written once", () => {
    const r = drugHistoryEntriesFromPad([med("Tablet. Napa 500 mg", "1+0+1"), med("Tablet. Napa 500 mg", "1+0+1")], "15/10/2026", []);
    expect(r.entries).toHaveLength(1);
    expect(r.skipped).toEqual(["Tablet. Napa 500 mg"]);
  });

  it("⚕️ a medicine with tapering lines is never skipped — the regimen is more than its first line", () => {
    const existing: DrugHistoryAddInput[] = [{ drug: "Tablet. Lenva 4 mg", dose: "0+0+1", food: "", duration: "7 days" }];
    const r = drugHistoryEntriesFromPad([med("Tablet. Lenva 4 mg", "0+0+1", "", "7 days"), taper("0+0+2", "", "Continue")], NO_DATE, existing);
    expect(r.entries).toHaveLength(2);
    expect(r.skipped).toEqual([]);
  });
});

// ⚕️ Independent review before release (17/10/2026): the pad's own reading
// drops a line it cannot write — a dose with no medicine name, a >>> line
// with no medicine above it — and Add then cleared the pad: typed cells gone,
// nothing said. Such a line is counted, and Add adds nothing until it is fixed.
describe("unwritableLines", () => {
  const med = (drug: string, dose = "", food = "", duration = ""): Row => ({ ...emptyRow(), drug, dose, food, duration, isMedicine: true });
  const taper = (dose: string, food = "", duration = ""): Row => ({ ...contRow(), dose, food, duration });
  const note = (text: string): Row => ({ ...emptyRow(), drug: text });

  it("a pad of medicines, their tapers and notes has none", () => {
    expect(unwritableLines([med("Tablet. Napa 500 mg", "1+1+1"), taper("1+0+1"), note("bed rest"), emptyRow()])).toBe(0);
  });

  it("⚕️ a dose, a food or a duration with no medicine name is one", () => {
    expect(unwritableLines([med("", "1+0+1")])).toBe(1);
    expect(unwritableLines([med("  ", "", "After meal")])).toBe(1);
    expect(unwritableLines([{ ...emptyRow(), duration: "7 days" }])).toBe(1);
  });

  it("⚕️ a >>> line with no medicine above it is one — at the top, or under a note", () => {
    expect(unwritableLines([taper("1+0+1")])).toBe(1);
    expect(unwritableLines([note("bed rest"), taper("1+0+1")])).toBe(1);
    expect(unwritableLines([med("", ""), taper("1+0+1")])).toBe(1);
  });

  it("an empty >>> line or an empty row is nothing to lose", () => {
    expect(unwritableLines([taper(""), emptyRow()])).toBe(0);
  });
});
