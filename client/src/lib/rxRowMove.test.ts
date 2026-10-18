import { describe, expect, it } from "vitest";
import { blockOf, canMove, moveBlock, type MovableRow } from "./rxRowMove";

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

// ⚕️ Third review (18/10/2026): a block that begins with a >>> line has no
// medicine of its own (data saved before 18/10/2026 — the pad now draws such a
// line as a line of its own, `rowsFromRxItems`; this is the second guard).
// Nothing is moved to stand directly above it: it would read as that
// medicine's taper.
describe("moveBlock never puts a medicine directly above a >>> line that has none", () => {
  const stranded = () => [taper("0+0+1"), med("Napa"), med("Bex"), typing()];

  it("▲ stops under it", () => {
    const once = moveBlock(stranded(), 2, -1); // Bex above Napa: fine
    expect(show(once)).toEqual(["↳0+0+1", "Bex", "Napa", "∅"]);
    expect(canMove(once, 1, -1)).toBe(false);
    expect(moveBlock(once, 1, -1)).toBe(once);
  });

  it("▼ never takes it under a medicine", () => {
    const rows = stranded();
    expect(canMove(rows, 0, 1)).toBe(false);
    expect(moveBlock(rows, 0, 1)).toBe(rows);
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
