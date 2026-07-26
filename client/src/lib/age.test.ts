import { describe, expect, it } from "vitest";
import { ageFromDob, displayAge, incrementedAge } from "./age";

// Age drives weight/age-dependent dosing, so the boundary that matters is the
// birthday itself. These pin the calendar behaviour that PatientSettingsView's
// form, the prescription header and the patient list all now share.
const NOW = new Date(2026, 6, 27); // 27 Jul 2026

describe("ageFromDob", () => {
  it("counts calendar years, not elapsed-milliseconds / 365.25", () => {
    // The regression this replaced: 30 years of accumulated leap days made the
    // divide-and-floor version read 29 here.
    expect(ageFromDob("1996-07-27", NOW)).toBe(30);
    expect(ageFromDob("1998-03-03", NOW)).toBe(28);
    expect(ageFromDob("2000-07-11", NOW)).toBe(26);
  });

  it("ticks over on the birthday, not before it", () => {
    expect(ageFromDob("1990-07-26", NOW)).toBe(36); // yesterday
    expect(ageFromDob("1990-07-27", NOW)).toBe(36); // today
    expect(ageFromDob("1990-07-28", NOW)).toBe(35); // tomorrow
  });

  it("handles a leap-day birth", () => {
    expect(ageFromDob("2004-02-29", NOW)).toBe(22);
  });

  it("returns null when there is nothing to compute", () => {
    expect(ageFromDob(null, NOW)).toBeNull();
    expect(ageFromDob(undefined, NOW)).toBeNull();
    expect(ageFromDob("", NOW)).toBeNull();
    expect(ageFromDob("nonsense", NOW)).toBeNull();
  });

  it("refuses to report a negative age for a future birth date", () => {
    // Legacy records can hold one; the UI flags it rather than showing "-72".
    expect(ageFromDob("2098-03-03", NOW)).toBeNull();
  });
});

describe("incrementedAge", () => {
  it("ages a manually entered value forward from its base year", () => {
    expect(incrementedAge(53, 2024, NOW)).toBe(55);
    expect(incrementedAge(40, 2026, NOW)).toBe(40);
  });

  it("shows a legacy value with no base year as-is", () => {
    expect(incrementedAge(50, null, NOW)).toBe(50);
    expect(incrementedAge(null, 2020, NOW)).toBeNull();
  });
});

describe("displayAge", () => {
  it("prefers the date of birth over a manual age", () => {
    expect(displayAge({ dob: "1996-07-27", age: 12, ageAsOfYear: 2020 }, NOW)).toBe("30");
  });

  it("falls back to the incremented manual age", () => {
    expect(displayAge({ dob: null, age: 53, ageAsOfYear: 2024 }, NOW)).toBe("55");
    expect(displayAge({ dob: null, age: null, ageAsOfYear: null }, NOW)).toBe("");
  });
});
