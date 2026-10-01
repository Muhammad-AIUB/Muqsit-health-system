import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  YEAR_POLICY,
  ddmmyyyyMs,
  ddmmyyyyMsStrict,
  isoToDdmmyyyy,
  parseDateInput,
  parseFlexibleDate,
  resolveTwoDigitYear,
} from "./dateInput";
import { anyText, calendarDate, configureProps, daysInMonth, ddmmyyyy, iso, pad2 } from "@/test/fc";
import { FIXED_NOW } from "@/test/fixtures";

// Property tests for the date rules in client/CLAUDE.md ("Date parsing",
// "Ordering by a stored date", "Two-digit years"). They assert INVARIANTS only
// — round-trip, agreement between two spellings of one date, totality,
// ordering — never a clinical value. The example-based suite beside this file
// (dateInput.test.ts) pins the specific cases.
configureProps(300);

const NOW = FIXED_NOW; // 27 Jul 2026 — never the wall clock
const POLICIES = [YEAR_POLICY.past, YEAR_POLICY.clinical] as const;
const policy = fc.constantFrom(...POLICIES);

// Strings that LOOK like what a doctor types — digits and the three separators
// — so the parsers' accepting branches are actually reached, not just "abc".
const dateish = fc.oneof(
  fc.string({ unit: fc.constantFrom(..."0123456789/.- "), maxLength: 12 }),
  fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 9999 }), fc.constantFrom("/", ".", "-", ""))
    .map(([d, m, y, sep]) => `${pad2(d)}${sep}${pad2(m)}${sep}${y}`),
);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const isoMs = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

describe("parseDateInput / parseFlexibleDate — total", () => {
  it("never throws, and always answers in one of the three documented shapes", () => {
    fc.assert(
      fc.property(fc.oneof(anyText(), dateish), policy, (s, pol) => {
        const r = parseDateInput(s, pol, NOW);
        if (r.ok) {
          expect(r.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        } else {
          expect(["malformed", "future"]).toContain(r.reason);
        }
        // "future" is the `past` policy's own refusal and nobody else's.
        if (!r.ok && r.reason === "future") expect(pol).toBe(YEAR_POLICY.past);
        const flexible = parseFlexibleDate(s, pol);
        expect(flexible === null || /^\d{4}-\d{2}-\d{2}$/.test(flexible)).toBe(true);
      }),
    );
  });

  // "reject rolled-over calendar dates (31/02/2026 must not become 3 March)":
  // whatever is accepted names a day that exists.
  it("only ever accepts a date that exists on the calendar, inside 1900 … today+100", () => {
    fc.assert(
      fc.property(dateish, policy, (s, pol) => {
        const r = parseDateInput(s, pol, NOW);
        fc.pre(r.ok);
        if (!r.ok) return;
        const [y, m, d] = r.iso.split("-").map(Number);
        expect(m).toBeGreaterThanOrEqual(1);
        expect(m).toBeLessThanOrEqual(12);
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(daysInMonth(y, m));
        expect(y).toBeGreaterThanOrEqual(1900);
        expect(y).toBeLessThanOrEqual(NOW.getFullYear() + 100);
      }),
    );
  });
});

describe("parseDateInput — round trip", () => {
  it("every valid date written dd/mm/yyyy parses back to the same ISO date", () => {
    fc.assert(
      fc.property(calendarDate(1900, NOW.getFullYear() + 100), (x) => {
        expect(parseDateInput(ddmmyyyy(x), YEAR_POLICY.clinical, NOW)).toEqual({ ok: true, iso: iso(x) });
        // …and the formatter is the exact inverse of the parser.
        expect(isoToDdmmyyyy(iso(x))).toBe(ddmmyyyy(x));
        expect(parseDateInput(isoToDdmmyyyy(iso(x)), YEAR_POLICY.clinical, NOW)).toEqual({ ok: true, iso: iso(x) });
      }),
    );
  });

  it("a full year is taken at face value under every policy, in every spelling", () => {
    fc.assert(
      fc.property(calendarDate(1900, NOW.getFullYear()), fc.constantFrom("/", ".", "-", ""), (x, sep) => {
        fc.pre(new Date(x.y, x.m - 1, x.d).getTime() <= startOfDay(NOW)); // not in the future
        const typed = `${pad2(x.d)}${sep}${pad2(x.m)}${sep}${x.y}`;
        for (const pol of POLICIES) {
          expect(parseDateInput(typed, pol, NOW)).toEqual({ ok: true, iso: iso(x) });
        }
      }),
    );
  });

  it("refuses every day that does not exist, instead of rolling it over", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1900, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }), (y, m, d) => {
        fc.pre(d > daysInMonth(y, m));
        expect(parseDateInput(`${pad2(d)}/${pad2(m)}/${y}`, YEAR_POLICY.clinical, NOW)).toEqual({ ok: false, reason: "malformed" });
      }),
    );
  });
});

describe("DDMMYY shorthand", () => {
  // Any wall clock, not just today's: the window is anchored on the year.
  const anyNow = fc
    .tuple(fc.integer({ min: 2000, max: 2094 }), fc.integer({ min: 0, max: 11 }), fc.integer({ min: 1, max: 28 }))
    .map(([y, m, d]) => new Date(y, m, d));

  it("agrees with the slashed 2-digit form and with the year typed in full, under the same policy", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 39 }), fc.integer({ min: 0, max: 19 }), fc.integer({ min: 0, max: 99 }), policy, anyNow,
        (d, m, yy, pol, now) => {
          const short = parseDateInput(`${pad2(d)}${pad2(m)}${pad2(yy)}`, pol, now);
          const slashed = parseDateInput(`${pad2(d)}/${pad2(m)}/${pad2(yy)}`, pol, now);
          const full = parseDateInput(`${pad2(d)}/${pad2(m)}/${resolveTwoDigitYear(yy, pol, now)}`, pol, now);
          const eight = parseDateInput(`${pad2(d)}${pad2(m)}${resolveTwoDigitYear(yy, pol, now)}`, pol, now);
          expect(short).toEqual(slashed);
          expect(short).toEqual(full);
          expect(short).toEqual(eight);
        },
      ),
    );
  });
});

describe("YEAR_POLICY.past", () => {
  it("never returns a date later than today, whatever was typed", () => {
    const anyNow = fc
      .tuple(fc.integer({ min: 2000, max: 2094 }), fc.integer({ min: 0, max: 11 }), fc.integer({ min: 1, max: 28 }), fc.integer({ min: 0, max: 23 }))
      .map(([y, m, d, h]) => new Date(y, m, d, h, 30));
    fc.assert(
      fc.property(fc.oneof(dateish, anyText()), anyNow, (s, now) => {
        const r = parseDateInput(s, YEAR_POLICY.past, now);
        if (r.ok) expect(isoMs(r.iso)).toBeLessThanOrEqual(startOfDay(now));
      }),
    );
  });

  it("accepts every real date up to and including today", () => {
    fc.assert(
      fc.property(calendarDate(1900, NOW.getFullYear()), (x) => {
        fc.pre(new Date(x.y, x.m - 1, x.d).getTime() <= startOfDay(NOW));
        expect(parseDateInput(ddmmyyyy(x), YEAR_POLICY.past, NOW)).toEqual({ ok: true, iso: iso(x) });
      }),
    );
  });

  it("says 'future' — not 'malformed' — for every real date after today", () => {
    fc.assert(
      fc.property(calendarDate(NOW.getFullYear(), NOW.getFullYear() + 100), (x) => {
        fc.pre(new Date(x.y, x.m - 1, x.d).getTime() > startOfDay(NOW));
        expect(parseDateInput(ddmmyyyy(x), YEAR_POLICY.past, NOW)).toEqual({ ok: false, reason: "future" });
      }),
    );
  });
});

describe("resolveTwoDigitYear", () => {
  const yy = fc.integer({ min: 0, max: 99 });
  const allowance = fc.integer({ min: 0, max: 20 });

  it("always ends in the two digits typed, never lands past the allowance, never more than a century back", () => {
    fc.assert(
      fc.property(yy, allowance, fc.integer({ min: 1950, max: 2399 }), (y2, a, nowY) => {
        const r = resolveTwoDigitYear(y2, a, new Date(nowY, 5, 15));
        expect(r % 100).toBe(y2);
        expect(r).toBeLessThanOrEqual(nowY + a);
        expect(r).toBeGreaterThan(nowY - 100);
      }),
    );
  });

  // The window the two digits are read in: the hundred years ending at
  // now + allowance. Holds for every year in which the allowance does not
  // reach across a century boundary (all of 2000–2094 for `clinical`).
  it("is within (now − 100 + allowance, now + allowance] while the allowance stays inside the century", () => {
    fc.assert(
      fc.property(yy, allowance, fc.integer({ min: 1950, max: 2399 }), (y2, a, nowY) => {
        fc.pre((nowY % 100) + a < 100);
        const r = resolveTwoDigitYear(y2, a, new Date(nowY, 5, 15));
        expect(r).toBeLessThanOrEqual(nowY + a);
        expect(r).toBeGreaterThan(nowY - 100 + a);
      }),
    );
  });

  // DEFECT-D1: in the last `allowance` years of a century the forward reading is never tried — a 2-digit year resolves ~100 years back instead of a few years ahead.
  // Minimal counter-example: resolveTwoDigitYear(0, YEAR_POLICY.clinical, new Date(2095, 0, 1)) === 2000
  // (the window (1995, 2100] contains exactly one year ending in 00, and it is 2100).
  // Source: src/lib/dateInput.ts:22-24 — `Math.floor(nowY / 100) * 100 + yy` only ever
  // builds the CURRENT century, so the next one is unreachable. client/CLAUDE.md says the
  // window "survives 2099, unlike a baked-in 2000". Latent until 2095; nothing is wrong today.
  it.fails("DEFECT-D1: stays inside the window when the allowance crosses a century boundary", () => {
    expect(resolveTwoDigitYear(0, YEAR_POLICY.clinical, new Date(2095, 0, 1))).toBe(2100);
  });
  it.fails("DEFECT-D1 (property): the same window in the last years of a century", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2095, max: 2099 }), fc.integer({ min: 0, max: 4 }), (nowY, k) => {
        const a = YEAR_POLICY.clinical;
        const y2 = k % ((nowY % 100) + a - 99); // a year whose forward reading is inside the allowance
        const r = resolveTwoDigitYear(y2, a, new Date(nowY, 0, 1));
        expect(r).toBeGreaterThan(nowY - 100 + a);
      }),
    );
  });
});

describe("ddmmyyyyMs / ddmmyyyyMsStrict", () => {
  // 1900 … 2199: the range the app accepts as a date at all. (Years 0000–0099
  // are outside it — JS reads them as 19xx.)
  const real = calendarDate(1900, 2199);

  it("never throw, on anything", () => {
    fc.assert(
      fc.property(fc.oneof(anyText(), dateish, fc.anything()), (v) => {
        const lenient = ddmmyyyyMs(v);
        const strict = ddmmyyyyMsStrict(v);
        // Lenient is always a finite number (0 for junk) — never NaN, which
        // would poison a sort comparator.
        expect(Number.isFinite(lenient)).toBe(true);
        expect(typeof strict).toBe("number");
        // Whenever strict can place a date, lenient places it at the same instant.
        if (!Number.isNaN(strict)) expect(lenient).toBe(strict);
      }),
    );
  });

  it("agree on every real calendar date, at local midnight of that day", () => {
    fc.assert(
      fc.property(real, fc.boolean(), (x, padded) => {
        const s = padded ? ddmmyyyy(x) : `${x.d}/${x.m}/${x.y}`;
        const expected = new Date(x.y, x.m - 1, x.d).getTime();
        expect(ddmmyyyyMsStrict(s)).toBe(expected);
        expect(ddmmyyyyMs(s)).toBe(expected);
      }),
    );
  });

  it("strict returns NaN for every rolled-over date; lenient still places it", () => {
    const rolled = fc.oneof(
      // a day past the end of its month
      fc.tuple(fc.integer({ min: 1900, max: 2199 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 29, max: 99 }))
        .filter(([y, m, d]) => d > daysInMonth(y, m)),
      // a month that does not exist, a day 0
      fc.tuple(fc.integer({ min: 1900, max: 2199 }), fc.integer({ min: 13, max: 99 }), fc.integer({ min: 1, max: 28 })),
      fc.tuple(fc.integer({ min: 1900, max: 2199 }), fc.constantFrom(0), fc.integer({ min: 1, max: 28 })),
      fc.tuple(fc.integer({ min: 1900, max: 2199 }), fc.integer({ min: 1, max: 12 }), fc.constantFrom(0)),
    );
    fc.assert(
      fc.property(rolled, ([y, m, d]) => {
        const s = `${pad2(d)}/${pad2(m)}/${y}`;
        expect(ddmmyyyyMsStrict(s)).toBeNaN();
        expect(Number.isFinite(ddmmyyyyMs(s))).toBe(true);
      }),
    );
  });

  it("ordering by ddmmyyyyMs is chronological ordering", () => {
    const cmp = (a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) =>
      Math.sign(a.y - b.y || a.m - b.m || a.d - b.d);
    fc.assert(
      fc.property(real, real, (a, b) => {
        expect(Math.sign(ddmmyyyyMs(ddmmyyyy(a)) - ddmmyyyyMs(ddmmyyyy(b)))).toBe(cmp(a, b));
      }),
    );
  });

  it("sorting a list by ddmmyyyyMs gives the same order as sorting by (year, month, day)", () => {
    fc.assert(
      fc.property(fc.array(real, { maxLength: 30 }), (dates) => {
        const byMs = [...dates].map(ddmmyyyy).sort((a, b) => ddmmyyyyMs(a) - ddmmyyyyMs(b));
        const byCalendar = [...dates].sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d).map(ddmmyyyy);
        expect(byMs).toEqual(byCalendar);
      }),
    );
  });
});
