import { describe, expect, it } from "vitest";
import {
  YEAR_POLICY,
  isImplausibleDate,
  isoToDdmmyyyy,
  parseDateInput,
  parseFlexibleDate,
  resolveTwoDigitYear,
} from "./dateInput";

// Every case injects `now` explicitly. A date suite that reads the wall clock
// starts failing on some future Tuesday for reasons unrelated to the code.
const NOW = new Date(2026, 6, 27); // 27 Jul 2026, local midnight

describe("resolveTwoDigitYear", () => {
  it("reads a 2-digit year backwards when the forward reading is beyond the allowance", () => {
    // The reported bug: 98 used to become 2098 everywhere.
    expect(resolveTwoDigitYear(98, YEAR_POLICY.past, NOW)).toBe(1998);
    expect(resolveTwoDigitYear(98, YEAR_POLICY.clinical, NOW)).toBe(1998);
  });

  it("keeps the current century when the year is not in the future", () => {
    expect(resolveTwoDigitYear(26, YEAR_POLICY.past, NOW)).toBe(2026);
    expect(resolveTwoDigitYear(0, YEAR_POLICY.past, NOW)).toBe(2000);
    expect(resolveTwoDigitYear(14, YEAR_POLICY.past, NOW)).toBe(2014);
  });

  it("lets a clinical date point a few years ahead but a birth date none", () => {
    // A 2027 follow-up must stay 2027. A global "never future" rule would have
    // turned it into 1927 — the same century bug pointing the other way.
    expect(resolveTwoDigitYear(27, YEAR_POLICY.clinical, NOW)).toBe(2027);
    expect(resolveTwoDigitYear(27, YEAR_POLICY.past, NOW)).toBe(1927);
  });

  it("uses the allowance as the exact boundary", () => {
    expect(resolveTwoDigitYear(31, YEAR_POLICY.clinical, NOW)).toBe(2031); // == limit
    expect(resolveTwoDigitYear(32, YEAR_POLICY.clinical, NOW)).toBe(1932); // one past it
  });

  it("still works after the century rolls over", () => {
    expect(resolveTwoDigitYear(98, YEAR_POLICY.past, new Date(2101, 0, 1))).toBe(2098);
    expect(resolveTwoDigitYear(5, YEAR_POLICY.past, new Date(2099, 0, 1))).toBe(2005);
  });
});

describe("parseDateInput", () => {
  it("resolves the reported case to 1998, not 2098", () => {
    expect(parseDateInput("030398", YEAR_POLICY.past, NOW)).toEqual({ ok: true, iso: "1998-03-03" });
    expect(parseDateInput("030398", YEAR_POLICY.clinical, NOW)).toEqual({ ok: true, iso: "1998-03-03" });
  });

  it("keeps the existing visit-date shorthand working", () => {
    expect(parseDateInput("030626", YEAR_POLICY.clinical, NOW)).toEqual({ ok: true, iso: "2026-06-03" });
    expect(parseDateInput("030128", YEAR_POLICY.clinical, NOW)).toEqual({ ok: true, iso: "2028-01-03" });
  });

  it("never adjusts a year typed in full", () => {
    expect(parseDateInput("03/03/1998", YEAR_POLICY.past, NOW)).toEqual({ ok: true, iso: "1998-03-03" });
    expect(parseDateInput("03031998", YEAR_POLICY.past, NOW)).toEqual({ ok: true, iso: "1998-03-03" });
    expect(parseDateInput("03/12/1926", YEAR_POLICY.past, NOW)).toEqual({ ok: true, iso: "1926-12-03" });
  });

  it("applies the century window to slashed 2-digit years too", () => {
    expect(parseDateInput("03/03/98", YEAR_POLICY.past, NOW)).toEqual({ ok: true, iso: "1998-03-03" });
    expect(parseDateInput("3-6-26", YEAR_POLICY.clinical, NOW)).toEqual({ ok: true, iso: "2026-06-03" });
  });

  it("accepts today itself as a birth date", () => {
    expect(parseDateInput("270726", YEAR_POLICY.past, NOW)).toEqual({ ok: true, iso: "2026-07-27" });
  });

  it("refuses a birth date later than today instead of guessing a century", () => {
    // 031226 resolves to Dec 2026 by the year window, which is still unborn.
    // Guessing 1926 would be a second silent century move.
    expect(parseDateInput("031226", YEAR_POLICY.past, NOW)).toEqual({ ok: false, reason: "future" });
    expect(parseDateInput("280726", YEAR_POLICY.past, NOW)).toEqual({ ok: false, reason: "future" });
  });

  it("allows a future date when the policy permits one", () => {
    expect(parseDateInput("031226", YEAR_POLICY.clinical, NOW)).toEqual({ ok: true, iso: "2026-12-03" });
  });

  it("rejects impossible calendar dates rather than rolling them over", () => {
    expect(parseDateInput("310226", YEAR_POLICY.clinical, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(parseDateInput("31/02/2026", YEAR_POLICY.clinical, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(parseDateInput("31/04/2026", YEAR_POLICY.clinical, NOW)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects input that is not a date at all", () => {
    for (const bad of ["", "   ", "abc", "0303", "0303267", "00/01/2026", "03/13/2026"]) {
      expect(parseDateInput(bad, YEAR_POLICY.clinical, NOW)).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("rejects a year outside any plausible range, however it was typed", () => {
    // 03/03/998 used to pass as year 998 — an age of 1028, printed verbatim on
    // the prescription, since prescriptionDoc emits the date string as-is.
    expect(parseDateInput("03/03/998", YEAR_POLICY.clinical, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(parseDateInput("03/03/9998", YEAR_POLICY.clinical, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(parseDateInput("03/03/1899", YEAR_POLICY.past, NOW)).toEqual({ ok: false, reason: "malformed" });
  });

  it("keeps the bounds wide enough that no real date trips them", () => {
    expect(parseDateInput("03/03/1900", YEAR_POLICY.past, NOW)).toEqual({ ok: true, iso: "1900-03-03" });
    expect(parseDateInput("03/03/1912", YEAR_POLICY.past, NOW)).toEqual({ ok: true, iso: "1912-03-03" });
    expect(parseDateInput("03/03/2126", YEAR_POLICY.clinical, NOW)).toEqual({ ok: true, iso: "2126-03-03" });
  });
});

describe("parseFlexibleDate", () => {
  it("keeps its old string-or-null shape for existing callers", () => {
    expect(parseFlexibleDate("030626")).toBe("2026-06-03");
    expect(parseFlexibleDate("garbage")).toBeNull();
  });
});

describe("isImplausibleDate", () => {
  it("does not flag a date it cannot read", () => {
    // Unreadable is not the same claim as wrong; those keep their own handling.
    expect(isImplausibleDate(null, YEAR_POLICY.clinical, NOW)).toBe(false);
    expect(isImplausibleDate(undefined, YEAR_POLICY.clinical, NOW)).toBe(false);
    expect(isImplausibleDate(new Date("nonsense"), YEAR_POLICY.clinical, NOW)).toBe(false);
  });

  it("flags a date stored beyond the allowance", () => {
    expect(isImplausibleDate(new Date(2098, 2, 3), YEAR_POLICY.clinical, NOW)).toBe(true);
    expect(isImplausibleDate(new Date(2028, 0, 1), YEAR_POLICY.clinical, NOW)).toBe(false);
  });

  it("treats today as plausible and tomorrow as not, for birth dates", () => {
    expect(isImplausibleDate(new Date(2026, 6, 27), YEAR_POLICY.past, NOW)).toBe(false);
    expect(isImplausibleDate(new Date(2026, 6, 28), YEAR_POLICY.past, NOW)).toBe(true);
  });
});

describe("isoToDdmmyyyy", () => {
  it("formats ISO and passes anything else through", () => {
    expect(isoToDdmmyyyy("1998-03-03")).toBe("03/03/1998");
    expect(isoToDdmmyyyy("")).toBe("");
    expect(isoToDdmmyyyy("03/03/1998")).toBe("03/03/1998");
  });
});
