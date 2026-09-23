import { describe, expect, it } from "vitest";
import { blockOf, canMove, moveBlock, moveBlockTo, type MovableRow } from "./rxRowMove";

const med = (drug: string, dose = ""): MovableRow => ({ drug, dose, food: "", duration: "", isMedicine: true, continuation: false });
const taper = (dose: string): MovableRow => ({ drug: "", dose, food: "", duration: "", isMedicine: true, continuation: true });
const note = (drug: string): MovableRow => ({ drug, dose: "", food: "", duration: "", isMedicine: false, continuation: false });
const typing = (): MovableRow => note("");

// A readable picture of the pad: medicines by name, tapers as "↳dose".
const show = (rows: MovableRow[]) => rows.map((r) => (r.continuation ? `↳${r.dose}` : r.drug || "∅"));

// Napa, then Pred with two tapering lines, a note, Omep, and the typing row.
const pad = () => [
  med("Napa", "1+1+1"),
  med("Pred", "2+0+0"), taper("1+0+0"), taper("1/2+0+0"),
  note("Insulin as before"),
  med("Omep", "1+0+1"),
  typing(),
];

describe("blockOf", () => {
  it("a medicine's block carries its tapering lines", () => {
    expect(blockOf(pad(), 1)).toEqual([1, 4]);
  });
  it("a taper row belongs to the medicine above it", () => {
    expect(blockOf(pad(), 3)).toEqual([1, 4]);
  });
  it("a note is a block of one", () => {
    expect(blockOf(pad(), 4)).toEqual([4, 5]);
  });
  it("the typing row is not a block", () => {
    expect(blockOf(pad(), 6)).toBeNull();
  });
});

describe("moveBlock (▲ / ▼)", () => {
  it("⚕️ moves a medicine WITH its tapers, never without them", () => {
    expect(show(moveBlock(pad(), 1, -1))).toEqual(["Pred", "↳1+0+0", "↳1/2+0+0", "Napa", "Insulin as before", "Omep", "∅"]);
  });
  it("moving from a taper row moves the whole block", () => {
    expect(show(moveBlock(pad(), 2, 1))).toEqual(["Napa", "Insulin as before", "Pred", "↳1+0+0", "↳1/2+0+0", "Omep", "∅"]);
  });
  it("steps over a whole neighbouring block, not one row of it", () => {
    expect(show(moveBlock(pad(), 0, 1))).toEqual(["Pred", "↳1+0+0", "↳1/2+0+0", "Napa", "Insulin as before", "Omep", "∅"]);
  });
  it("the typing row stays last — nothing moves below it", () => {
    expect(canMove(pad(), 5, 1)).toBe(false);
    expect(moveBlock(pad(), 5, 1)).toEqual(pad());
  });
  it("the first block cannot go up", () => {
    expect(canMove(pad(), 0, -1)).toBe(false);
  });
  it("changes only the order — every field of every row survives", () => {
    const rows = pad();
    const moved = moveBlock(rows, 5, -1);
    expect([...moved].sort((a, b) => a.drug.localeCompare(b.drug) || a.dose.localeCompare(b.dose)))
      .toEqual([...rows].sort((a, b) => a.drug.localeCompare(b.drug) || a.dose.localeCompare(b.dose)));
  });
});

describe("moveBlockTo (drag)", () => {
  it("drops a block before a later one", () => {
    expect(show(moveBlockTo(pad(), 0, 5, "before"))).toEqual(["Pred", "↳1+0+0", "↳1/2+0+0", "Insulin as before", "Napa", "Omep", "∅"]);
  });
  it("drops a block after a later one", () => {
    expect(show(moveBlockTo(pad(), 0, 5, "after"))).toEqual(["Pred", "↳1+0+0", "↳1/2+0+0", "Insulin as before", "Omep", "Napa", "∅"]);
  });
  it("drops a later block before an earlier one", () => {
    expect(show(moveBlockTo(pad(), 5, 0, "before"))).toEqual(["Omep", "Napa", "Pred", "↳1+0+0", "↳1/2+0+0", "Insulin as before", "∅"]);
  });
  it("⚕️ dropping onto a taper row lands at a block edge, never inside another medicine's tapers", () => {
    expect(show(moveBlockTo(pad(), 5, 2, "before"))).toEqual(["Napa", "Omep", "Pred", "↳1+0+0", "↳1/2+0+0", "Insulin as before", "∅"]);
    expect(show(moveBlockTo(pad(), 0, 2, "after"))).toEqual(["Pred", "↳1+0+0", "↳1/2+0+0", "Napa", "Insulin as before", "Omep", "∅"]);
  });
  it("dropping onto its own block or the typing row changes nothing", () => {
    const rows = pad();
    expect(moveBlockTo(rows, 1, 3, "after")).toBe(rows);
    expect(moveBlockTo(rows, 0, 6, "before")).toBe(rows);
  });
});
