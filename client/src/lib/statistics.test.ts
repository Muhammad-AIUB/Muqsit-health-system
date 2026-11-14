import { describe, expect, it } from "vitest";
import {
  averageText,
  axisFor,
  dayNumber,
  monthCaption,
  readDays,
  readDiagnoses,
  readMonths,
  readOverall,
  shiftMonthKey,
  shiftYearKey,
  shortMonth,
} from "./statistics";

// The pure parts of Settings → Statistics (physician's sheet, 11/11/2026): which
// month or year comes next, the axis a chart is drawn on, and the check that an
// answer IS what the chart expects before it is drawn — a reader that never
// throws turns "the server said something else" into a chart of nothing.

describe("moving along months and years", () => {
  it("steps a month key forward and back, across a year end", () => {
    expect(shiftMonthKey("2026-11", 1)).toBe("2026-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-11", 0)).toBe("2026-11");
    expect(shiftMonthKey("2026-03", -14)).toBe("2025-01");
  });

  it("steps a year key", () => {
    expect(shiftYearKey("2026", 1)).toBe("2027");
    expect(shiftYearKey("2026", -1)).toBe("2025");
  });

  it("names a month in words and in three letters, never through the browser's locale", () => {
    expect(monthCaption("2026-11")).toBe("November 2026");
    expect(monthCaption("2026-01")).toBe("January 2026");
    expect(shortMonth("2026-09")).toBe("Sep");
    expect(shortMonth("2026-12")).toBe("Dec");
    expect(dayNumber("2026-11-03")).toBe("3");
    expect(dayNumber("2026-11-30")).toBe("30");
  });
});

describe("axisFor — a scale a doctor can read, always from 0, whole numbers only", () => {
  it("rounds the top up to a tidy step above the biggest bar", () => {
    expect(axisFor(87)).toEqual({ top: 100, ticks: [0, 25, 50, 75, 100] });
    expect(axisFor(100)).toEqual({ top: 100, ticks: [0, 25, 50, 75, 100] });
    expect(axisFor(3564)).toEqual({ top: 4000, ticks: [0, 1000, 2000, 3000, 4000] });
  });

  it("never has a top below the biggest bar", () => {
    for (const max of [1, 2, 3, 7, 9, 10, 11, 19, 20, 21, 49, 50, 51, 99, 101, 999, 1001, 45204]) {
      const { top, ticks } = axisFor(max);
      expect(top).toBeGreaterThanOrEqual(max);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBe(top);
      for (const t of ticks) expect(Number.isInteger(t)).toBe(true);
    }
  });

  it("a small count keeps whole-number steps: 3 patients is 0 to 4, not 0.75 steps", () => {
    const { ticks } = axisFor(3);
    expect(ticks.every((t) => Number.isInteger(t))).toBe(true);
    expect(ticks).toEqual([0, 1, 2, 3, 4]);
  });

  it("nothing at all still has a scale to draw on", () => {
    const { top, ticks } = axisFor(0);
    expect(top).toBeGreaterThan(0);
    expect(ticks[0]).toBe(0);
  });
});

describe("averageText", () => {
  it("one decimal place, and a dash — never 0 — when there is no average", () => {
    expect(averageText(3.3)).toBe("3.3");
    expect(averageText(10)).toBe("10.0");
    expect(averageText(253.3)).toBe("253.3");
    expect(averageText(null)).toBe("—");
  });
});

describe("the readers check an answer before it is drawn", () => {
  const goodDays = { month: "2026-11", days: [{ day: "2026-11-01", total: 3, seen: 2 }] };

  it("accept what the server sends", () => {
    expect(readDays(goodDays)).toEqual(goodDays);
    expect(readMonths({ year: "2026", months: [{ month: "2026-01", total: 5, seen: 4 }] }).months).toHaveLength(1);
    expect(readOverall({ totalVisits: 6, averageMonthly: null, averageDaily: 2.5, thisMonth: 1, previousMonth: 0, firstSeenDay: null, days: 3, months: 1, today: "2026-11-15" }).totalVisits).toBe(6);
    expect(readDiagnoses({ diagnoses: [{ name: "DM", patients: 3 }] })).toEqual([{ name: "DM", patients: 3 }]);
    expect(readDiagnoses({ diagnoses: [] })).toEqual([]);
  });

  it("refuse anything that is not that — an empty body, a sign-in page, a list where an object belongs, a number that is not one", () => {
    for (const bad of [undefined, null, "", "<html>sign in</html>", [], 5, {}]) {
      expect(() => readDays(bad)).toThrow();
      expect(() => readMonths(bad)).toThrow();
      expect(() => readOverall(bad)).toThrow();
      expect(() => readDiagnoses(bad)).toThrow();
    }
    expect(() => readDays({ month: "2026-11", days: [{ day: "2026-11-01", total: "3", seen: 2 }] })).toThrow();
    expect(() => readDays({ month: "2026-11", days: [{ day: "2026-11-01", total: 3, seen: NaN }] })).toThrow();
    expect(() => readDays({ month: "2026-11", days: [{ day: "2026-11-01", total: -1, seen: 0 }] })).toThrow();
    expect(() => readMonths({ year: "2026", months: "none" })).toThrow();
    expect(() => readDiagnoses({ diagnoses: [{ name: "DM", patients: "3" }] })).toThrow();
    expect(() => readOverall({ totalVisits: 6, averageMonthly: "2", averageDaily: 2.5, thisMonth: 1, previousMonth: 0, firstSeenDay: null, days: 3, months: 1, today: "2026-11-15" })).toThrow();
    // an answer from an older server, with no `today`, is not the overall numbers: the months could not be named
    expect(() => readOverall({ totalVisits: 6, averageMonthly: null, averageDaily: 2.5, thisMonth: 1, previousMonth: 0, firstSeenDay: null, days: 3, months: 1 })).toThrow();
  });
});
