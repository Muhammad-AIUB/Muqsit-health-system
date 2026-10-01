// One place for the property-test budget.
//
// A failing property prints its seed and path (fast-check does that by
// default). To replay it, run the file with that seed:
//
//   FC_SEED=1234567 npx vitest run src/lib/dateInput.prop.test.ts
//
// With no FC_SEED every run draws a fresh seed, so three runs are three
// different samples of the input space.
import fc from "fast-check";
import { vi } from "vitest";

export function configureProps(numRuns = 300): void {
  // Hundreds of runs per property; the default 5 s per test is not a property
  // of the code on a slow or loaded machine.
  vi.setConfig({ testTimeout: 60_000 });
  const seed = Number(process.env.FC_SEED);
  fc.configureGlobal({
    numRuns,
    ...(process.env.FC_SEED && Number.isFinite(seed) ? { seed } : {}),
  });
}

/** Any string at all: full Unicode (graphemes — Bangla conjuncts included),
 *  plus raw UTF-16 code units so a lone surrogate is covered too. */
export const anyText = (maxLength = 40): fc.Arbitrary<string> =>
  fc.oneof(
    fc.string({ maxLength }),
    fc.string({ unit: "grapheme", maxLength }),
    fc.string({ unit: "binary", maxLength }),
    fc.array(fc.integer({ min: 0, max: 0xffff }), { maxLength }).map((u) => String.fromCharCode(...u)),
  );

/** Any WELL-FORMED Unicode string (no lone surrogate). For code that goes through
 *  jsdom's HTML parser: parse5 throws `RangeError: Invalid code point` on a lone
 *  low surrogate, which no real browser does — a limit of the test DOM, not of
 *  the code under test. */
export const wellFormedText = (maxLength = 40): fc.Arbitrary<string> =>
  fc.oneof(fc.string({ maxLength }), fc.string({ unit: "grapheme", maxLength }), fc.string({ unit: "binary", maxLength }));

/** A real calendar date as its three integers. */
export const calendarDate = (minYear: number, maxYear: number): fc.Arbitrary<{ y: number; m: number; d: number }> =>
  fc
    .tuple(fc.integer({ min: minYear, max: maxYear }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
    .map(([y, m, d]) => ({ y, m, d: Math.min(d, daysInMonth(y, m)) }));

export const daysInMonth = (y: number, m: number): number => new Date(y, m, 0).getDate();
export const pad2 = (n: number): string => String(n).padStart(2, "0");
export const ddmmyyyy = (x: { y: number; m: number; d: number }): string => `${pad2(x.d)}/${pad2(x.m)}/${x.y}`;
export const iso = (x: { y: number; m: number; d: number }): string => `${x.y}-${pad2(x.m)}-${pad2(x.d)}`;
