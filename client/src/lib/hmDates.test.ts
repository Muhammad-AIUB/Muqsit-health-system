import { describe, expect, it } from "vitest";
import { cellToDate, normaliseDateCell, parseShorthandDate } from "./hmDates";

// parseShorthandDate has no injectable clock (it feeds normaliseDateCell and
// cellToDate, which are called from render paths), so these assert on the
// century rather than a literal year. resolveTwoDigitYear itself is fully
// clock-injected and covered in dateInput.test.ts.

describe("parseShorthandDate", () => {
  it("reads a pre-2000 shorthand year backwards", () => {
    // The whole point of the fix: this used to return 2098.
    expect(parseShorthandDate("010198")?.iso).toBe("1998-01-01");
    expect(parseShorthandDate("010198")?.label).toBe("1 Jan 1998");
  });

  it("still reads a recent shorthand year forwards", () => {
    expect(parseShorthandDate("120614")?.iso).toBe("2014-06-12");
    expect(parseShorthandDate("120614")?.label).toBe("12 Jun 2014");
  });

  it("rejects anything that is not six digits", () => {
    expect(parseShorthandDate("12061")).toBeNull();
    expect(parseShorthandDate("1206144")).toBeNull();
    expect(parseShorthandDate("")).toBeNull();
  });

  it("rejects impossible calendar dates", () => {
    expect(parseShorthandDate("310214")).toBeNull(); // 31 Feb
    expect(parseShorthandDate("320114")).toBeNull(); // day 32
    expect(parseShorthandDate("011314")).toBeNull(); // month 13
  });
});

describe("normaliseDateCell", () => {
  it("turns shorthand into a label and leaves everything else alone", () => {
    expect(normaliseDateCell("010198")).toBe("1 Jan 1998");
    expect(normaliseDateCell("  25/07/2026 ")).toBe("25/07/2026");
    expect(normaliseDateCell("")).toBe("");
  });
});

describe("cellToDate", () => {
  it("parses dd/mm/yyyy explicitly, past the 12th", () => {
    // new Date("25/07/2026") is Invalid Date; new Date("03/06/2026") is 6 March.
    const d = cellToDate("25/07/2026");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6); // July
    expect(d?.getDate()).toBe(25);

    const e = cellToDate("03/06/2026");
    expect(e?.getMonth()).toBe(5); // June, not March
    expect(e?.getDate()).toBe(3);
  });

  it("reads a shorthand cell through the shared century window", () => {
    expect(cellToDate("010198")?.getFullYear()).toBe(1998);
  });

  it("returns null for an empty or rolled-over date", () => {
    expect(cellToDate("")).toBeNull();
    expect(cellToDate("   ")).toBeNull();
    expect(cellToDate("31/02/2026")).toBeNull();
  });
});
