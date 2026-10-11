import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MONTHS, computeTimeRange, isInRange, makeToX, monthTicks, ticksInPlot } from "./timelineGeometry";
import { configureProps } from "@/test/fc";

// The time axis of the Health-trend chart. Where a reading is DRAWN is a claim
// about when it was taken, so the axis maths is checked as geometry: the range
// always contains what it was built from, the mapping is linear and monotonic,
// and there is exactly one gridline per calendar month. (client/CLAUDE.md,
// "Health monitoring tab": "Window ≠ filter … clamps only the LOWER bound".)
configureProps(300);

const DAY = 86_400_000;
const MONTH = 30 * DAY;
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const epoch = fc.integer({ min: at(1990, 1, 1), max: at(2100, 1, 1) });

describe("computeTimeRange", () => {
  it("is null when there is nothing to plot and no window", () => {
    expect(computeTimeRange([])).toBeNull();
    expect(computeTimeRange([], null)).toBeNull();
    expect(computeTimeRange([], undefined)).toBeNull();
  });

  it("widens a single point to a month and pads 4% on each side", () => {
    const t = at(2026, 9, 7);
    const r = computeTimeRange([t])!;
    expect(r.lo).toBeCloseTo(t - MONTH * 0.04, 3);
    expect(r.hi).toBeCloseTo(t + MONTH + MONTH * 0.04, 3);
  });

  it("with a window floor, starts at the floor — not at the earliest point", () => {
    const floor = at(2026, 6, 7);
    const r = computeTimeRange([at(2024, 1, 10), at(2026, 9, 7)], floor)!;
    const span = at(2026, 9, 7) - floor;
    expect(r.lo).toBeCloseTo(floor - span * 0.04, 3);
    expect(r.hi).toBeCloseTo(at(2026, 9, 7) + span * 0.04, 3);
  });

  it("still gives a month-wide axis when every point sits before the floor, or there are none", () => {
    const floor = at(2026, 6, 7);
    for (const pts of [[at(2024, 1, 10)], []]) {
      const r = computeTimeRange(pts, floor)!;
      expect(r.hi - r.lo).toBeCloseTo(MONTH * 1.08, 3);
      expect(r.lo).toBeLessThan(floor);
    }
  });

  it("always contains every point it was built from (no floor), is ≥ a month wide and never inverted", () => {
    fc.assert(
      fc.property(fc.array(epoch, { minLength: 1, maxLength: 20 }), (pts) => {
        const r = computeTimeRange(pts)!;
        expect(r.hi).toBeGreaterThan(r.lo);
        expect(r.hi - r.lo).toBeGreaterThanOrEqual(MONTH);
        for (const p of pts) expect(isInRange(p, r)).toBe(true);
      }),
    );
  });

  it("with a floor, contains the floor and every point at or after it", () => {
    fc.assert(
      fc.property(fc.array(epoch, { maxLength: 20 }), epoch, (pts, floor) => {
        const r = computeTimeRange(pts, floor)!;
        expect(isInRange(floor, r)).toBe(true);
        for (const p of pts) if (p >= floor) expect(isInRange(p, r)).toBe(true);
      }),
    );
  });
});

describe("makeToX", () => {
  it("maps the range's two ends onto the plot's two edges, linearly", () => {
    const r = { lo: 1000, hi: 3000 };
    const toX = makeToX(r, 50, 400);
    expect(toX(1000)).toBe(50);
    expect(toX(3000)).toBe(450);
    expect(toX(2000)).toBe(250);
  });

  it("puts everything at the left edge when there is no range, instead of NaN", () => {
    expect(makeToX(null, 50, 400)(123456)).toBe(50);
  });

  it("is monotonic: a later instant is never drawn to the left of an earlier one", () => {
    fc.assert(
      fc.property(fc.array(epoch, { minLength: 2, maxLength: 12 }), fc.integer({ min: 0, max: 200 }), fc.integer({ min: 50, max: 2000 }), (pts, x0, width) => {
        const r = computeTimeRange(pts)!;
        const toX = makeToX(r, x0, width);
        const sorted = [...pts].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) expect(toX(sorted[i])).toBeGreaterThanOrEqual(toX(sorted[i - 1]));
        // Every plotted point lands inside the plot.
        for (const p of pts) {
          expect(toX(p)).toBeGreaterThanOrEqual(x0);
          expect(toX(p)).toBeLessThanOrEqual(x0 + width);
        }
      }),
    );
  });
});

describe("monthTicks", () => {
  it("has none without a range", () => {
    expect(monthTicks(null, (t) => t)).toEqual([]);
  });

  it("draws one gridline per calendar month the range touches, labelled 'Mon YY'", () => {
    const r = { lo: at(2025, 11, 20), hi: at(2026, 2, 3) };
    const ticks = monthTicks(r, makeToX(r, 0, 1000));
    expect(ticks.map((t) => t.label)).toEqual(["Nov 25", "Dec 25", "Jan 26", "Feb 26"]);
  });

  it("thins the LABELS on a long range but keeps every gridline", () => {
    const r = { lo: at(2016, 1, 1), hi: at(2026, 1, 1) };
    const ticks = monthTicks(r, makeToX(r, 0, 600));
    expect(ticks).toHaveLength(121);
    const shown = ticks.filter((t) => t.showLabel);
    expect(shown.length).toBeLessThan(ticks.length);
    expect(ticks[0].showLabel).toBe(true);
    // Labels that are shown are at least a label's width apart.
    for (let i = 1; i < shown.length; i++) expect(shown[i].x - shown[i - 1].x).toBeGreaterThanOrEqual(34);
  });

  it("gridlines are in time order, one per month, for any range", () => {
    fc.assert(
      fc.property(epoch, fc.integer({ min: 0, max: 3650 }), (lo, days) => {
        const r = { lo, hi: lo + days * DAY };
        const ticks = monthTicks(r, makeToX(r, 0, 800));
        const a = new Date(r.lo), b = new Date(r.hi);
        expect(ticks).toHaveLength((b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);
        for (let i = 1; i < ticks.length; i++) expect(ticks[i].x).toBeGreaterThan(ticks[i - 1].x);
        for (const t of ticks) expect(MONTHS).toContain(t.label.slice(0, 3));
      }),
    );
  });
});

describe("isInRange", () => {
  it("is inclusive at both ends and false without a range", () => {
    const r = { lo: 10, hi: 20 };
    expect([9, 10, 15, 20, 21].map((t) => isInRange(t, r))).toEqual([false, true, true, true, false]);
    expect(isInRange(15, null)).toBe(false);
  });
});

// monthTicks hands back one tick per calendar month the range TOUCHES, and the
// first of those months starts before the range does — to the left of the plot.
// Drawn as given, its line and its label ran through the column of names beside
// the plot: "Mar 26" stood under a medicine's name as if it were that
// medicine's date.
describe("ticksInPlot", () => {
  const tick = (x: number, label = "Jan 26", showLabel = true) => ({ x, label, showLabel });

  it("keeps only the ticks that fall inside the plot", () => {
    const placed = ticksInPlot([tick(125), tick(150), tick(400), tick(784), tick(790)], 150, 784);
    expect(placed.map((t) => t.x)).toEqual([150, 400, 784]);
  });

  it("⚕️ the first month ON the plot is labelled, whatever the thinning had chosen before", () => {
    // A long range: every third month was labelled, starting from the one that
    // has just been dropped. The left of the axis must not be left bare.
    const ticks = [tick(140, "Mar 26", true), tick(160, "Apr 26", false), tick(180, "May 26", false), tick(200, "Jun 26", true)];
    const placed = ticksInPlot(ticks, 150, 784);
    expect(placed[0]).toMatchObject({ label: "Apr 26", showLabel: true });
  });

  it("keeps the labels it shows at least a label's width apart", () => {
    const ticks = Array.from({ length: 40 }, (_, i) => tick(150 + i * 12, `M${i}`));
    const shown = ticksInPlot(ticks, 150, 784).filter((t) => t.showLabel);
    expect(shown.length).toBeGreaterThan(3);
    for (let i = 1; i < shown.length; i++) expect(shown[i].x - shown[i - 1].x).toBeGreaterThanOrEqual(34);
  });

  it("still returns every in-plot gridline — only the labels are thinned", () => {
    const ticks = Array.from({ length: 40 }, (_, i) => tick(150 + i * 12, `M${i}`));
    expect(ticksInPlot(ticks, 150, 784)).toHaveLength(40);
  });

  it("sets a label inward when centring it would hang it outside the plot", () => {
    const [left, mid, right] = ticksInPlot([tick(155), tick(400), tick(780)], 150, 784);
    expect(left.anchor).toBe("start");
    expect(mid.anchor).toBe("middle");
    expect(right.anchor).toBe("end");
  });

  it("for any real range, every label it shows lies wholly inside the plot", () => {
    fc.assert(
      fc.property(epoch, fc.integer({ min: 30, max: 3650 }), (lo, days) => {
        const r = { lo, hi: lo + days * DAY };
        const L = 150, R = 784, HALF = 14;
        for (const t of ticksInPlot(monthTicks(r, makeToX(r, L, R - L)), L, R)) {
          expect(t.x).toBeGreaterThanOrEqual(L);
          expect(t.x).toBeLessThanOrEqual(R);
          if (!t.showLabel) continue;
          const from = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - 2 * HALF : t.x - HALF;
          expect(from).toBeGreaterThanOrEqual(L);
          expect(from + 2 * HALF).toBeLessThanOrEqual(R);
        }
      }),
    );
  });
});
