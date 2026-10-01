import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ageFromDob, displayAge, incrementedAge } from "./age";
import { calendarDate, configureProps, iso } from "@/test/fc";

// "Age comes from lib/age.ts#ageFromDob, everywhere … Age drives dosing — one
// function." (client/CLAUDE.md). These are calendar invariants, not clinical
// values: an age is a whole number of birthdays passed.
//
// The DOB is an ISO date string, as stored (`Patient.dob`); "today" is a local
// Date, as every caller passes it. Like age.test.ts beside it, this assumes the
// suite runs at or east of UTC (the doctors are in UTC+6): `new Date("1990-07-27")`
// is UTC midnight, which is still the 27th locally there.
configureProps(300);

type Ymd = { y: number; m: number; d: number };
const local = (x: Ymd, hour = 0) => new Date(x.y, x.m - 1, x.d, hour);
const addDays = (dt: Date, n: number) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n, dt.getHours());

const dob = calendarDate(1900, 2026);
const hour = fc.integer({ min: 0, max: 23 });

describe("ageFromDob", () => {
  it("is a whole number ≥ 0 for every DOB that is not in the future", () => {
    fc.assert(
      fc.property(dob, fc.integer({ min: 0, max: 45_000 }), hour, (b, daysLater, h) => {
        const now = addDays(local(b, h), daysLater);
        const age = ageFromDob(iso(b), now);
        expect(age).not.toBeNull();
        expect(Number.isInteger(age)).toBe(true);
        expect(age!).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("never reports a negative age — a future DOB is null, not a number below zero", () => {
    fc.assert(
      fc.property(dob, fc.integer({ min: -45_000, max: 45_000 }), hour, (b, offset, h) => {
        const age = ageFromDob(iso(b), addDays(local(b, h), offset));
        expect(age === null || age >= 0).toBe(true);
      }),
    );
  });

  it("never goes down as today advances", () => {
    fc.assert(
      fc.property(dob, fc.integer({ min: 0, max: 45_000 }), fc.integer({ min: 0, max: 45_000 }), hour, hour, (b, a1, a2, h1, h2) => {
        const [lo, hi] = a1 <= a2 ? [a1, a2] : [a2, a1];
        const earlier = ageFromDob(iso(b), addDays(local(b, h1), lo))!;
        const later = ageFromDob(iso(b), addDays(local(b, lo === hi ? Math.max(h1, h2) : h2), hi))!;
        expect(later).toBeGreaterThanOrEqual(earlier);
      }),
    );
  });

  it("goes up by exactly 1 on the birthday, and on no other day", () => {
    fc.assert(
      fc.property(dob, fc.integer({ min: 0, max: 45_000 }), hour, (b, daysLater, h) => {
        fc.pre(!(b.m === 2 && b.d === 29)); // a leap-day birth has its own property below
        const today = addDays(local(b, h), daysLater);
        const tomorrow = addDays(today, 1);
        const step = ageFromDob(iso(b), tomorrow)! - ageFromDob(iso(b), today)!;
        const tomorrowIsBirthday = tomorrow.getMonth() + 1 === b.m && tomorrow.getDate() === b.d;
        expect(step).toBe(tomorrowIsBirthday ? 1 : 0);
      }),
    );
  });

  it("is exactly the number of birthdays reached: k−1 the day before the k-th, k on it", () => {
    fc.assert(
      fc.property(dob, fc.integer({ min: 1, max: 120 }), (b, k) => {
        fc.pre(!(b.m === 2 && b.d === 29));
        const birthday = new Date(b.y + k, b.m - 1, b.d);
        expect(ageFromDob(iso(b), birthday)).toBe(k);
        expect(ageFromDob(iso(b), addDays(birthday, -1))).toBe(k - 1);
        // …and it is the same answer at any hour of the birthday.
        expect(ageFromDob(iso(b), new Date(b.y + k, b.m - 1, b.d, 23, 59))).toBe(k);
      }),
    );
  });

  it("a leap-day birth still ages exactly once a year, never twice and never not at all", () => {
    const leapYear = fc.integer({ min: 476, max: 506 }).map((q) => q * 4).filter((y) => y % 100 !== 0 || y % 400 === 0);
    fc.assert(
      fc.property(leapYear, fc.integer({ min: 1, max: 100 }), (y, k) => {
        const b = { y, m: 2, d: 29 };
        // 28 Feb of year y+k is before the birthday; 1 Mar is after it, leap year or not.
        expect(ageFromDob(iso(b), new Date(y + k, 1, 28))).toBe(k - 1);
        expect(ageFromDob(iso(b), new Date(y + k, 2, 1))).toBe(k);
      }),
    );
  });

  it("never throws and never returns a non-number for an unreadable DOB", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constantFrom(null, undefined, "")), (s) => {
        const age = ageFromDob(s as string | null | undefined, new Date(2026, 6, 27));
        expect(age === null || (Number.isInteger(age) && age >= 0)).toBe(true);
      }),
    );
  });
});

describe("displayAge", () => {
  // "Date of birth wins": a manual age stored beside a DOB is never shown.
  it("shows the DOB's age whatever manual age is stored beside it", () => {
    fc.assert(
      fc.property(dob, fc.integer({ min: 0, max: 45_000 }), fc.option(fc.integer({ min: 0, max: 130 })), fc.option(fc.integer({ min: 1990, max: 2030 })), (b, daysLater, age, asOf) => {
        const now = addDays(local(b), daysLater);
        expect(displayAge({ dob: iso(b), age, ageAsOfYear: asOf }, now)).toBe(String(ageFromDob(iso(b), now)));
      }),
    );
  });

  it("is blank — never a guess — when neither a DOB nor an age is recorded", () => {
    fc.assert(
      fc.property(fc.option(fc.integer({ min: 1990, max: 2030 })), (asOf) => {
        expect(displayAge({ dob: null, age: null, ageAsOfYear: asOf }, new Date(2026, 6, 27))).toBe("");
        expect(incrementedAge(null, asOf, new Date(2026, 6, 27))).toBeNull();
      }),
    );
  });
});
