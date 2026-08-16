import { describe, it, expect } from "vitest";
import { lastUsedLabel } from "./MedicinePad";

// ⚕️ The count and the date are shown together on purpose: they are what tells
// a routine dose apart from a one-off (design §8 rule 7). Without a year, an
// instruction last written two years ago reads exactly like one written last
// week — a stale habit that looks current is the same failure as a wrong count.
describe("lastUsedLabel", () => {
  const now = new Date("2026-08-17T00:00:00Z");

  it("omits the year for a date in the current year", () => {
    expect(lastUsedLabel("2026-08-15T09:00:00.000Z", now)).toBe("last 15 Aug");
  });

  it("shows the doctor's LOCAL date, not the UTC one", () => {
    // Production carries lastUsedAt = 2026-08-15T21:18:56.805Z, which in
    // Bangladesh (UTC+6) is 03:18 on the 16th — and the 16th is the date the
    // doctor would recognise as the visit. Rendering the UTC day here would
    // show a prescription written after midnight as the previous day.
    const d = new Date("2026-08-15T21:18:56.805Z");
    const expected = `last ${d.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]}`;
    expect(lastUsedLabel("2026-08-15T21:18:56.805Z", now)).toBe(expected);
  });

  it("SHOWS the year once it is not the current year", () => {
    expect(lastUsedLabel("2024-08-15T00:00:00.000Z", now)).toBe("last 15 Aug 2024");
  });

  it("shows the year for next year too, not just the past", () => {
    expect(lastUsedLabel("2027-01-03T00:00:00.000Z", now)).toBe("last 3 Jan 2027");
  });

  it("renders nothing it cannot read, rather than a wrong date", () => {
    // Never "1 Jan 1970": a fabricated date beside a dose is worse than none.
    expect(lastUsedLabel(undefined, now)).toBe("");
    expect(lastUsedLabel(null, now)).toBe("");
    expect(lastUsedLabel("", now)).toBe("");
    expect(lastUsedLabel("not a date", now)).toBe("");
    expect(lastUsedLabel(1755300000000 as unknown as string, now)).toBe("");
    expect(lastUsedLabel({} as unknown as string, now)).toBe("");
  });

  it("never throws", () => {
    for (const v of [NaN, [], {}, Symbol("x"), () => 1]) {
      expect(() => lastUsedLabel(v as unknown as string, now)).not.toThrow();
    }
  });
});
