import { describe, expect, it } from "vitest";
import { calculateEDD } from "./edd";
import { YEAR_POLICY, parseDateInput } from "../dateInput";

// The full clinical path the DDMMYY fix runs through: what the doctor types in
// the due-date calculator -> the ISO DateField emits -> Naegele's rule. A
// century error here moves an estimated delivery date by 100 years, so this
// pins the join rather than trusting the two halves separately.

const iso = (typed: string): string => {
  const r = parseDateInput(typed, YEAR_POLICY.past, new Date(2026, 6, 27));
  if (!r.ok) throw new Error(`expected ${typed} to parse, got ${r.reason}`);
  return r.iso;
};

describe("typed date -> EDD", () => {
  it("dates an EDD from a shorthand LMP", () => {
    expect(iso("011125")).toBe("2025-11-01");
    // Naegele: LMP + 280 days. 1 Nov 2025 + 280 = 8 Aug 2026.
    expect(calculateEDD({ method: "lmp", lmpDate: iso("011125") }).value).toBe("August 08, 2026");
  });

  it("applies the cycle-length correction on top of Naegele", () => {
    // A 32-day cycle pushes the EDD out by 4 days: 8 Aug -> 12 Aug 2026.
    expect(calculateEDD({ method: "lmp", lmpDate: "2025-11-01", cycleLength: 32 }).value)
      .toBe("August 12, 2026");
  });

  it("no longer dates a pregnancy from the next century", () => {
    // 010198 used to reach this calculator as 2098-01-01.
    expect(iso("010198")).toBe("1998-01-01");
    expect(calculateEDD({ method: "lmp", lmpDate: "1998-01-01" }).value).toContain("1998");
    expect(calculateEDD({ method: "lmp", lmpDate: "2098-01-01" }).value).toContain("2098");
  });

  it("dates from an ultrasound scan the same way", () => {
    expect(iso("010726")).toBe("2026-07-01");
    // 12w0d at the scan means 28 weeks left: 1 Jul 2026 + 196 days = 13 Jan 2027.
    expect(calculateEDD({ method: "ultrasound", scanDate: iso("010726"), gestationalWeeks: 12, gestationalDays: 0 }).value)
      .toBe("January 13, 2027");
  });

  it("refuses a future LMP before it can reach the calculator", () => {
    // `past` policy: an LMP later than today is a typo, not a pregnancy.
    expect(parseDateInput("281226", YEAR_POLICY.past, new Date(2026, 6, 27)))
      .toEqual({ ok: false, reason: "future" });
  });
});
