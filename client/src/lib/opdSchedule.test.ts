import { describe, expect, it } from "vitest";
import { DEFAULT_OPD_SCHEDULE, clockText, parseClock, scheduleProblem, slotTimes, type OpdSchedule } from "./opdSchedule";

// The chamber's serial times (physician's sheet, 28/10/2026): the first patient
// is at the start time, each next one a fixed number of minutes later, and the
// break is skipped — a patient is never given a time inside it. The times are
// told to patients, so every rule below is the physician's own, not a guess:
//   1st 6:00 PM · 2nd 6:10 PM · … · 12th 7:50 PM · 13th 9:00 PM
//   (start 6 PM, break 8 PM–9 PM, 10 minutes each).
// A patient may start before the break and run into it ("break cut, the slot is
// let to be long"); whoever would start inside the break goes to its end.

const sheet: OpdSchedule = { startTime: "18:00", breakStart: "20:00", breakEnd: "21:00", minutesPerPatient: 10 };
const at = (h: number, m = 0) => h * 60 + m;

describe("slotTimes — the physician's example", () => {
  it("6:00 PM, then every 10 minutes, the break skipped", () => {
    const t = slotTimes(13, sheet);
    expect(t[0]).toBe(at(18, 0));
    expect(t[1]).toBe(at(18, 10));
    expect(t[2]).toBe(at(18, 20));
    expect(t[11]).toBe(at(19, 50)); // the 12th
    expect(t[12]).toBe(at(21, 0)); // the 13th, after the break
  });

  it("goes on at the same pace after the break", () => {
    const t = slotTimes(15, sheet);
    expect(t.slice(12)).toEqual([at(21, 0), at(21, 10), at(21, 20)]);
  });
});

describe("slotTimes — the break", () => {
  it("a slot that would begin exactly when the break begins goes to its end", () => {
    const t = slotTimes(20, { ...sheet, minutesPerPatient: 15 });
    // 6:00 … 7:45, and 8:00 is the break.
    expect(t[7]).toBe(at(19, 45));
    expect(t[8]).toBe(at(21, 0));
  });

  it("a patient who starts before the break may run into it; the next one waits for its end", () => {
    // 13 minutes: …, 7:57 (the 10th) ends 8:10, inside the break.
    const t = slotTimes(12, { ...sheet, minutesPerPatient: 13 });
    expect(t[9]).toBe(at(19, 57));
    expect(t[10]).toBe(at(21, 0));
    expect(t[11]).toBe(at(21, 13));
  });

  it("a slot that begins exactly when the break ends is not moved", () => {
    const t = slotTimes(2, { startTime: "21:00", breakStart: "20:00", breakEnd: "21:00", minutesPerPatient: 10 });
    expect(t).toEqual([at(21, 0), at(21, 10)]);
  });

  it("a start time inside the break is moved to its end", () => {
    expect(slotTimes(2, { ...sheet, startTime: "20:30" })).toEqual([at(21, 0), at(21, 10)]);
  });

  it("no break: every slot is one step after the last", () => {
    const t = slotTimes(4, { ...sheet, breakStart: null, breakEnd: null });
    expect(t).toEqual([at(18, 0), at(18, 10), at(18, 20), at(18, 30)]);
  });

  it("a break that is shorter than a slot is still skipped once", () => {
    const t = slotTimes(3, { startTime: "19:50", breakStart: "20:00", breakEnd: "20:05", minutesPerPatient: 10 });
    expect(t).toEqual([at(19, 50), at(20, 5), at(20, 15)]);
  });
});

describe("slotTimes — counts", () => {
  it("nobody queued, no times", () => {
    expect(slotTimes(0, sheet)).toEqual([]);
  });

  it("gives one time per serial and none is earlier than the one before", () => {
    const t = slotTimes(60, sheet);
    expect(t).toHaveLength(60);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });

  it("nothing is invented for a schedule that cannot be read: no times", () => {
    expect(slotTimes(3, { ...sheet, startTime: "6pm" })).toEqual([]);
    expect(slotTimes(3, { ...sheet, minutesPerPatient: 0 })).toEqual([]);
    expect(slotTimes(3, { ...sheet, breakStart: "20:00", breakEnd: null })).toEqual([]);
  });
});

describe("clockText", () => {
  it("writes a time as the physician's sheet does", () => {
    expect(clockText(at(18, 0))).toBe("6:00 PM");
    expect(clockText(at(19, 50))).toBe("7:50 PM");
    expect(clockText(at(0, 5))).toBe("12:05 AM");
    expect(clockText(at(12, 0))).toBe("12:00 PM");
    expect(clockText(at(9, 5))).toBe("9:05 AM");
  });

  it("says so when a slot is past midnight, never passes it off as the same evening", () => {
    expect(clockText(at(24, 10))).toBe("12:10 AM (next day)");
  });
});

describe("parseClock", () => {
  it("reads HH:mm", () => {
    expect(parseClock("18:00")).toBe(at(18, 0));
    expect(parseClock("06:05")).toBe(at(6, 5));
    expect(parseClock("00:00")).toBe(0);
  });

  it("refuses what is not a time", () => {
    for (const bad of ["", "6pm", "24:00", "12:60", "1:5", "ab:cd", "18:00:00", null, undefined]) {
      expect(parseClock(bad as string)).toBeNull();
    }
  });
});

describe("scheduleProblem — said in the doctor's words, nothing stored for a typo", () => {
  it("a good schedule has no problem", () => {
    expect(scheduleProblem(sheet)).toBeNull();
    expect(scheduleProblem({ ...sheet, breakStart: null, breakEnd: null })).toBeNull();
  });

  it("a break needs both of its ends", () => {
    expect(scheduleProblem({ ...sheet, breakEnd: null })).toMatch(/break/i);
    expect(scheduleProblem({ ...sheet, breakStart: null })).toMatch(/break/i);
  });

  it("a break ends after it begins", () => {
    expect(scheduleProblem({ ...sheet, breakStart: "21:00", breakEnd: "20:00" })).toMatch(/after/i);
    expect(scheduleProblem({ ...sheet, breakStart: "20:00", breakEnd: "20:00" })).toMatch(/after/i);
  });

  it("the time for each patient is a whole number of minutes, 1 to 120", () => {
    for (const bad of [0, -5, 121, 2.5, Number.NaN]) {
      expect(scheduleProblem({ ...sheet, minutesPerPatient: bad }), String(bad)).toMatch(/minutes/i);
    }
    expect(scheduleProblem({ ...sheet, minutesPerPatient: 1 })).toBeNull();
    expect(scheduleProblem({ ...sheet, minutesPerPatient: 120 })).toBeNull();
  });

  it("the start time must be a time", () => {
    expect(scheduleProblem({ ...sheet, startTime: "" })).toMatch(/start/i);
  });
});

describe("DEFAULT_OPD_SCHEDULE", () => {
  it("is itself a schedule that can be used", () => {
    expect(scheduleProblem(DEFAULT_OPD_SCHEDULE)).toBeNull();
    expect(slotTimes(3, DEFAULT_OPD_SCHEDULE)).toHaveLength(3);
  });
});
