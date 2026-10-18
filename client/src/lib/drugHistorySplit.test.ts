// ⚕️ Which Drug-history entries are "Current medications" and which are
// "Distant past" — physician's sheet, 18/10/2026, item 2, and the answer given
// in chat the same day ("only the previous visit"):
//
//   1st visit: what I add to Current stays in Current; what I add to Distant
//   past stays there.
//   2nd visit: what I prescribed on the 1st visit is Current; everything else,
//   including what was in Distant past, is Distant past.
//   3rd visit: the 2nd visit's prescription is Current; the rest is Distant past.
//
// Today's ℞ is NOT shown in Current (it is on the pad in front of the doctor);
// it is still recorded, and becomes "the previous visit" next time.

import { describe, expect, it } from "vitest";
import { splitDrugHistory } from "./drugHistorySplit";
import { rxDrugHistoryEntries } from "./rxDrugHistory";
import { NO_DATE } from "./drugHistoryAdd";
import type { RxItem } from "@/types";

const V1 = "10/09/2026";
const V2 = "01/10/2026";
const V3 = "18/10/2026";

const rx = (drug: string, dose = "1+0+1"): RxItem => ({ drug, dose, instruction: "", duration: "" });
const bodies = (rows: { body: string }[]) => rows.map((r) => r.body.split(" — ")[0]);

describe("splitDrugHistory", () => {
  it("1st visit: a hand-added Current line is Current, a Distant-past one is Distant past", () => {
    const items = [`${V1}: Seclo 20 mg — 1+0+0 —  — `, `${NO_DATE}: Losartan 50 mg —  —  — `];
    const s = splitDrugHistory(items, V1, []);
    expect(bodies(s.current)).toEqual(["Seclo 20 mg"]);
    expect(bodies(s.past)).toEqual(["Losartan 50 mg"]);
  });

  it("1st visit: today's ℞ is not listed in Current, nor in Distant past", () => {
    const pad = [rx("Tablet. Napa 500 mg")];
    const mirror = rxDrugHistoryEntries(pad, V1);
    const s = splitDrugHistory([`${V1}: Seclo 20 mg — 1+0+0 —  — `, ...mirror], V1, mirror);
    expect(bodies(s.current)).toEqual(["Seclo 20 mg"]);
    expect(s.past).toEqual([]);
  });

  it("2nd visit: the whole 1st visit is Current; the old Distant past stays Distant past", () => {
    const items = [
      `${NO_DATE}: Losartan 50 mg —  —  — `,
      `${V1}: Seclo 20 mg — 1+0+0 —  — `,          // added by hand to Current on visit 1
      ...rxDrugHistoryEntries([rx("Tablet. Napa 500 mg")], V1), // prescribed on visit 1
    ];
    const s = splitDrugHistory(items, V2, []);
    expect(bodies(s.current)).toEqual(["Seclo 20 mg", "Tablet. Napa 500 mg"]);
    expect(bodies(s.past)).toEqual(["Losartan 50 mg"]);
  });

  it("3rd visit: the 2nd visit is Current and the 1st has moved to Distant past", () => {
    const items = [
      ...rxDrugHistoryEntries([rx("Tablet. Napa 500 mg")], V1),
      ...rxDrugHistoryEntries([rx("Tablet. Famotack 20 mg")], V2),
    ];
    const s = splitDrugHistory(items, V3, []);
    expect(bodies(s.current)).toEqual(["Tablet. Famotack 20 mg"]);
    expect(bodies(s.past)).toEqual(["Tablet. Napa 500 mg"]);
  });

  it("3rd visit: a line added by hand to Current today joins the 2nd visit's", () => {
    const items = [
      ...rxDrugHistoryEntries([rx("Tablet. Famotack 20 mg")], V2),
      `${V3}: Seclo 20 mg — 1+0+0 —  — `,
    ];
    expect(bodies(splitDrugHistory(items, V3, []).current)).toEqual(["Tablet. Famotack 20 mg", "Seclo 20 mg"]);
  });

  // ⚕️ The no-date marker is 01/01/2000 — a real-looking date. It must never be
  // taken for "the previous visit", or a patient whose only history is
  // Distant past would see all of it as Current.
  it("never takes the no-date marker for the previous visit", () => {
    const s = splitDrugHistory([`${NO_DATE}: Losartan 50 mg —  —  — `], V2, []);
    expect(s.current).toEqual([]);
    expect(bodies(s.past)).toEqual(["Losartan 50 mg"]);
  });

  it("a date after the visit date is not the previous visit", () => {
    const s = splitDrugHistory([`20/12/2026: Napa —  —  — `, `${V1}: Seclo —  —  — `], V2, []);
    expect(bodies(s.current)).toEqual(["Seclo"]);
    expect(bodies(s.past)).toEqual(["Napa"]);
  });

  it("a tapering line stays with its medicine in Current", () => {
    const items = rxDrugHistoryEntries([
      rx("Tablet (Delayed Release). Mesacol 400 mg", "2+2+2"),
      { drug: "", dose: "2+0+2", instruction: "", duration: "4 week", isCont: true },
    ], V1);
    const s = splitDrugHistory(items, V2, []);
    expect(s.current.map((r) => r.kind)).toEqual(["med", "cont"]);
    expect(s.current.every((r) => r.date === V1)).toBe(true);
  });

  // The same medicine typed today by hand and also on today's ℞ is one line,
  // and it is on the pad: hidden only where the WHOLE entry matches.
  it("hides today's mirror by the exact entry only", () => {
    const mirror = rxDrugHistoryEntries([rx("Tablet. Napa 500 mg", "1+1+1")], V1);
    const handTyped = `${V1}: Tablet. Napa 500 mg — 1+0+1 —  — `;
    const s = splitDrugHistory([...mirror, handTyped], V1, mirror);
    expect(s.current.map((r) => r.raw)).toEqual([handTyped]);
  });

  it("reads legacy Current:/Past: entries as before", () => {
    const s = splitDrugHistory(["Current: Napa — 1+0+1 —  — ", "Past: Seclo —  —  — "], V2, []);
    expect(bodies(s.current)).toEqual(["Napa"]);
    expect(bodies(s.past)).toEqual(["Seclo"]);
  });

  it("keeps empty lines out", () => {
    expect(splitDrugHistory([`${V1}: `, `${V1}:    `], V2, []).current).toEqual([]);
  });

  it("names the previous visit's date", () => {
    expect(splitDrugHistory([`${V1}: Napa —  —  — `, `${V2}: Seclo —  —  — `], V3, []).previousDate).toBe(V2);
    expect(splitDrugHistory([], V3, []).previousDate).toBeNull();
  });

  // ⚕️ Second review, 18/10/2026: today's ℞ is hidden as BLOCKS — a medicine
  // with its tapering lines. Hidden line by line, a medicine whose taper had
  // been changed on the pad was hidden while its old taper stayed in Current,
  // "↳ 0+0+1" standing under the previous visit's last medicine.
  it("hides today's ℞ a whole block at a time — never a medicine without its taper", () => {
    const head = rx("Tablet (Delayed Release). Mesacol 400 mg", "2+2+2");
    const oldTaper: RxItem = { drug: "", dose: "0+0+1", instruction: "", duration: "", isCont: true };
    const newTaper: RxItem = { drug: "", dose: "1+0+1", instruction: "", duration: "", isCont: true };
    const stored = [`${V1}: Seclo 20 mg — 1+0+0 —  — `, ...rxDrugHistoryEntries([head, oldTaper], V2)];
    const pad = rxDrugHistoryEntries([head, newTaper], V2);
    const s = splitDrugHistory(stored, V2, pad);
    // The stored block is not what the pad writes: it is listed whole, never in part.
    expect(s.current.map((r) => r.kind)).toEqual(["med", "med", "cont"]);
    // And the block that IS the pad's is hidden whole.
    expect(splitDrugHistory([...rxDrugHistoryEntries([head, newTaper], V2)], V2, pad).current).toEqual([]);
  });
});

