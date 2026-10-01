import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { blockOf, canMove, moveBlock, type MovableRow } from "./rxRowMove";
import { anyText, configureProps } from "@/test/fc";
import { makePad } from "@/test/fixtures";

// ⚕️ "What moves is a BLOCK, never a single row … Nothing is edited: every row
// keeps every field, only the order changes." (lib/rxRowMove.ts)
//
// The example suite checks six hand-picked moves. These check the same three
// promises over ANY pad and ANY sequence of ▲ / ▼ / drag steps:
//   1. the result is a permutation of the rows — nothing added, lost or edited;
//   2. a taper row is always directly under the same head medicine;
//   3. the trailing typing row stays last.
configureProps(300);

/** A row with an identity the code under test never sees or touches. */
type Tagged = MovableRow & { id: number };

const nonBlank = anyText(12).filter((s) => s.trim() !== "");
const cell = fc.oneof(fc.constant(""), anyText(8));

type Block = { kind: "med"; drug: string; cells: string[]; tapers: string[][] } | { kind: "note"; text: string };

const block: fc.Arbitrary<Block> = fc.oneof(
  { weight: 3, arbitrary: fc.record({
      kind: fc.constant("med" as const),
      drug: nonBlank,
      cells: fc.array(cell, { minLength: 3, maxLength: 3 }),
      // A taper may be entirely blank — a `>>>` row the doctor has not filled yet.
      tapers: fc.array(fc.array(cell, { minLength: 3, maxLength: 3 }), { maxLength: 3 }),
    }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("note" as const), text: nonBlank }) },
);

/** A well-formed pad: every taper has a head medicine above it. */
const pad: fc.Arbitrary<Tagged[]> = fc.tuple(fc.array(block, { maxLength: 8 }), fc.boolean()).map(([blocks, typing]) => {
  const rows: Omit<Tagged, "id">[] = [];
  for (const b of blocks) {
    if (b.kind === "note") {
      rows.push({ drug: b.text, dose: "", food: "", duration: "", isMedicine: false, continuation: false });
      continue;
    }
    rows.push({ drug: b.drug, dose: b.cells[0], food: b.cells[1], duration: b.cells[2], isMedicine: true, continuation: false });
    for (const t of b.tapers) rows.push({ drug: "", dose: t[0], food: t[1], duration: t[2], isMedicine: true, continuation: true });
  }
  if (typing) rows.push({ drug: "", dose: "", food: "", duration: "", isMedicine: false, continuation: false });
  return rows.map((r, id) => ({ ...r, id }));
});

/** Steps address ANY index, including ones off either end of the pad. */
const steps = fc.array(fc.tuple(fc.integer({ min: -3, max: 40 }), fc.constantFrom<-1 | 1>(-1, 1)), { maxLength: 40 });

const run = (rows: Tagged[], moves: [number, -1 | 1][]) =>
  moves.reduce((acc, [idx, dir]) => moveBlock(acc, idx, dir), rows);

/** taper id → the id of the head row it sits under (nearest non-taper above). */
function headOf(rows: Tagged[]): Map<number, number | null> {
  const out = new Map<number, number | null>();
  let head: number | null = null;
  for (const r of rows) {
    if (r.continuation) out.set(r.id, head);
    else head = r.id;
  }
  return out;
}

/** Each head's tapers, in order — the block as the doctor wrote it. */
function tapersOf(rows: Tagged[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  let head: number | null = null;
  for (const r of rows) {
    if (!r.continuation) { head = r.id; out.set(r.id, []); }
    else if (head !== null) out.get(head)!.push(r.id);
  }
  return out;
}

const isTyping = (r: MovableRow) =>
  !r.continuation && !r.drug.trim() && !r.dose.trim() && !r.food.trim() && !r.duration.trim();

describe("moveBlock — any sequence of moves, on any pad", () => {
  it("yields a permutation of the original rows: nothing added, lost or edited", () => {
    fc.assert(
      fc.property(pad, steps, (rows, moves) => {
        const before = structuredClone(rows);
        const after = run(rows, moves);
        expect(after).toHaveLength(rows.length);
        expect([...after].map((r) => r.id).sort((a, b) => a - b)).toEqual(rows.map((r) => r.id));
        // The very same row objects, each still carrying every field it had.
        for (const r of after) {
          expect(r).toBe(rows[r.id]);
          expect(r).toEqual(before[r.id]);
        }
        // …and the input array itself was not reordered in place.
        expect(rows).toEqual(before);
      }),
    );
  });

  it("⚕️ keeps every taper directly under the same head medicine, in the same order", () => {
    fc.assert(
      fc.property(pad, steps, (rows, moves) => {
        const after = run(rows, moves);
        expect(headOf(after)).toEqual(headOf(rows));
        expect(tapersOf(after)).toEqual(tapersOf(rows));
        // "Directly under": no other block ever sits between a taper and its head.
        after.forEach((r, i) => {
          if (r.continuation) expect(after[i - 1].continuation || after[i - 1].id === headOf(rows).get(r.id)).toBe(true);
        });
      }),
    );
  });

  it("keeps the trailing typing row last — nothing ever lands after it", () => {
    fc.assert(
      fc.property(pad, steps, (rows, moves) => {
        fc.pre(rows.length > 0 && isTyping(rows[rows.length - 1]));
        const after = run(rows, moves);
        expect(after[after.length - 1]).toBe(rows[rows.length - 1]);
      }),
    );
  });

  it("each single step changes nothing, or swaps exactly two neighbouring blocks", () => {
    fc.assert(
      fc.property(pad, fc.integer({ min: -3, max: 40 }), fc.constantFrom<-1 | 1>(-1, 1), (rows, idx, dir) => {
        const after = moveBlock(rows, idx, dir);
        if (!canMove(rows, idx, dir)) {
          expect(after).toBe(rows); // refused ⇒ the very same array, untouched
          return;
        }
        const b = blockOf(rows, idx)!;
        const moved = rows.slice(b[0], b[1]).map((r) => r.id);
        const at = after.findIndex((r) => r.id === moved[0]);
        // The block stays whole…
        expect(after.slice(at, at + moved.length).map((r) => r.id)).toEqual(moved);
        // …it went the way it was asked to…
        expect(Math.sign(at - b[0])).toBe(dir);
        // …and the opposite step puts everything back.
        expect(moveBlock(after, at, dir < 0 ? 1 : -1).map((r) => r.id)).toEqual(rows.map((r) => r.id));
      }),
    );
  });

  it("blockOf and canMove are total: any index, never a throw, never a block that leaves the pad", () => {
    fc.assert(
      fc.property(pad, fc.integer({ min: -50, max: 50 }), (rows, idx) => {
        const b = blockOf(rows, idx);
        if (b) {
          expect(b[0]).toBeGreaterThanOrEqual(0);
          expect(b[1]).toBeLessThanOrEqual(rows.length);
          expect(b[0]).toBeLessThanOrEqual(idx);
          expect(b[1]).toBeGreaterThan(idx);
          expect(rows[b[0]].continuation).toBe(false);
        }
        expect(typeof canMove(rows, idx, -1)).toBe("boolean");
        expect(typeof canMove(rows, idx, 1)).toBe("boolean");
      }),
    );
  });
});

describe("the fixture pad from rxRowMove.test.ts", () => {
  it("survives every walk of every block to both ends and back", () => {
    fc.assert(
      fc.property(steps, (moves) => {
        const rows = makePad().map((r, id) => ({ ...r, id }));
        const after = run(rows, moves);
        expect(tapersOf(after)).toEqual(tapersOf(rows));
        expect(after[after.length - 1]).toBe(rows[rows.length - 1]);
      }),
    );
  });
});
