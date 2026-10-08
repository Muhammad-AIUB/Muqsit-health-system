import { describe, expect, it } from "vitest";
import { dayMonth, dayMonthYear, stamp } from "./stamp";

// Built from local parts and passed through an ISO string, as the server's
// timestamps arrive — so the expectation holds in any time zone the suite runs in.
const at = (y: number, m: number, d: number, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm).toISOString();

describe("stamp — a moment the system recorded, written the same on every machine", () => {
  it("puts the day first and the month as a word", () => {
    expect(dayMonth(at(2026, 10, 9))).toBe("9 Oct");
    expect(dayMonthYear(at(2026, 10, 9))).toBe("9 Oct 2026");
  });

  // The reason this file exists: 10/9/2026 and 9/10/2026 are both "the ninth of
  // October" to somebody. A word for the month has one reading.
  it("cannot be read with day and month swapped", () => {
    expect(dayMonthYear(at(2026, 9, 10))).toBe("10 Sep 2026");
    expect(dayMonthYear(at(2026, 10, 9))).toBe("9 Oct 2026");
  });

  it("names all twelve months", () => {
    const names = Array.from({ length: 12 }, (_, i) => dayMonth(at(2026, i + 1, 1)).split(" ")[1]);
    expect(names).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  });

  it("writes the time 24-hour, two digits each", () => {
    expect(stamp(at(2026, 10, 9, 17, 4))).toBe("9 Oct 2026 · 17:04");
    expect(stamp(at(2026, 1, 3, 0, 0))).toBe("3 Jan 2026 · 00:00");
    expect(stamp(at(2026, 10, 9, 9, 30), { year: false })).toBe("9 Oct · 09:30");
  });

  it("does not depend on the machine's language", () => {
    const real = Date.prototype.toLocaleDateString;
    // A browser set to Bangla: if the formatter were asked, the month would come
    // back as a Bangla word.
    Date.prototype.toLocaleDateString = () => "৯ অক্টো";
    try {
      expect(dayMonthYear(at(2026, 10, 9))).toBe("9 Oct 2026");
    } finally {
      Date.prototype.toLocaleDateString = real;
    }
  });

  it("shows nothing for what it cannot read — never 'Invalid Date'", () => {
    for (const bad of ["", "not a date", null, undefined]) {
      expect(dayMonth(bad)).toBe("");
      expect(dayMonthYear(bad)).toBe("");
      expect(stamp(bad)).toBe("");
    }
  });
});
