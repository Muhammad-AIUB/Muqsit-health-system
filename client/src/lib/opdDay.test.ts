import { describe, expect, it } from "vitest";
import { dayLabel, dayRelation, dhakaToday, isDayKey, monthGrid, monthTitle, shiftDay, shiftMonth } from "./opdDay";

// The OPD queue is booked by Dhaka calendar DAY, written `yyyy-mm-dd` — the same
// key the server files a visit under (`server/src/opd/dhaka-day.ts`). A day is a
// name, not an instant: nothing here reads a time zone but Dhaka's own, and
// nothing asks the browser to write a date in its locale.

describe("dhakaToday", () => {
  it("is the Dhaka calendar day, whatever the machine's own clock says", () => {
    expect(dhakaToday(new Date("2026-10-28T10:00:00Z"))).toBe("2026-10-28");
    // 23:59 Dhaka is 17:59 UTC; 00:00 Dhaka is 18:00 UTC the day before.
    expect(dhakaToday(new Date("2026-10-28T17:59:00Z"))).toBe("2026-10-28");
    expect(dhakaToday(new Date("2026-10-28T18:00:00Z"))).toBe("2026-10-29");
    expect(dhakaToday(new Date("2026-12-31T18:00:00Z"))).toBe("2027-01-01");
  });
});

describe("dayRelation — what a day may be asked to do", () => {
  it("past, today, future", () => {
    expect(dayRelation("2026-10-27", "2026-10-28")).toBe("past");
    expect(dayRelation("2026-10-28", "2026-10-28")).toBe("today");
    expect(dayRelation("2026-10-29", "2026-10-28")).toBe("future");
    expect(dayRelation("2026-11-01", "2026-10-31")).toBe("future");
    expect(dayRelation("2025-12-31", "2026-01-01")).toBe("past");
  });
});

describe("dayLabel", () => {
  it("writes a day as the app writes dates: dd/mm/yyyy", () => {
    expect(dayLabel("2026-10-28")).toBe("28/10/2026");
    expect(dayLabel("2026-01-05")).toBe("05/01/2026");
  });
});

describe("isDayKey", () => {
  it("accepts a real day and refuses a rolled-over one", () => {
    expect(isDayKey("2026-10-28")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("28/10/2026")).toBe(false);
    expect(isDayKey("")).toBe(false);
  });
});

describe("shiftDay", () => {
  it("moves by days across month and year ends", () => {
    expect(shiftDay("2026-10-28", 1)).toBe("2026-10-29");
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDay("2026-10-28", 7)).toBe("2026-11-04");
  });
});

describe("shiftMonth", () => {
  it("moves by months, across a year end", () => {
    expect(shiftMonth({ year: 2026, month: 9 }, 1)).toEqual({ year: 2026, month: 10 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe("monthTitle", () => {
  it("is the month's English name and year, never the browser's", () => {
    expect(monthTitle({ year: 2026, month: 9 })).toBe("October 2026");
    expect(monthTitle({ year: 2027, month: 0 })).toBe("January 2027");
  });
});

describe("monthGrid", () => {
  // 1 October 2026 is a Thursday. The week starts on Sunday, as the calendar on
  // the sheet does.
  const grid = monthGrid({ year: 2026, month: 9 });

  it("starts the first week on the right weekday, with blanks before it", () => {
    expect(grid[0]).toEqual([null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("every week has seven places", () => {
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it("holds every day of the month once, in order, and nothing else", () => {
    const days = grid.flat().filter((d): d is string => d !== null);
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-10-01");
    expect(days[30]).toBe("2026-10-31");
    expect(new Set(days).size).toBe(31);
  });

  it("a month that begins on a Sunday has no blanks before it", () => {
    // 1 February 2026 is a Sunday.
    expect(monthGrid({ year: 2026, month: 1 })[0][0]).toBe("2026-02-01");
  });

  it("knows a leap February", () => {
    const days = monthGrid({ year: 2028, month: 1 }).flat().filter(Boolean);
    expect(days).toHaveLength(29);
  });

  it("28 October 2026 is a Wednesday", () => {
    const week = grid.find((w) => w.includes("2026-10-28")) as (string | null)[];
    expect(week.indexOf("2026-10-28")).toBe(3);
  });
});
