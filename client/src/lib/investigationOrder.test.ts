// ⚕️ The order a doctor reads a year of labs in. A red test here means a
// prescription printed its findings in an order nobody can scan.

import { describe, it, expect } from "vitest";
import { findingDateMs, sortDateGroups, sortFindingsByDate } from "@/lib/investigationOrder";
import { ddmmyyyyMs } from "@/lib/dateInput";

describe("findingDateMs", () => {
  it("reads the dd/mm/yyyy prefix through the app's one date parser", () => {
    expect(findingDateMs("08/09/2026:CBC:Hb 11.7 g/dL")).toBe(ddmmyyyyMs("08/09/2026"));
    expect(findingDateMs("24/01/2025:CBC:Hb 11.7 g/dL")).toBe(ddmmyyyyMs("24/01/2025"));
  });

  // ⚕️ The trap the root CLAUDE.md names: JS reads a slashed date as
  // month/day/year, so 25/07 is Invalid Date and 03/06 silently becomes 6 March.
  it("orders 25/07 after 03/06 of the same year, which new Date() cannot", () => {
    expect(findingDateMs("25/07/2026:X:1")).toBeGreaterThan(findingDateMs("03/06/2026:X:1"));
  });

  it("orders by year, then month, then day", () => {
    expect(findingDateMs("01/01/2026:X:1")).toBeGreaterThan(findingDateMs("31/12/2025:X:1"));
    expect(findingDateMs("01/02/2026:X:1")).toBeGreaterThan(findingDateMs("28/01/2026:X:1"));
  });

  it("is 0 for an entry with no date, and never throws", () => {
    expect(findingDateMs("Urine R/E normal")).toBe(0);
    expect(findingDateMs("8/9/2026:X:1")).toBe(0);   // not the stored shape
    expect(findingDateMs("")).toBe(0);
    expect(findingDateMs(null)).toBe(0);
    expect(findingDateMs(undefined)).toBe(0);
  });
});

describe("sortFindingsByDate", () => {
  // The reported sheet's own opening run, in the order it printed.
  const REPORTED = [
    "08/09/2026:CBC:Hb 11.7 g/dL, WBC 2.2 cells/uL, PLT 60/uL",
    "08/09/2026:Lipid Profile:TG 186 mg/dL",
    "19/06/2026:USG:Region WA, Chronic liver disease",
    "24/01/2025:CBC:Hb 11.7 g/dL",
    "08/09/2026:Prothrombin Time:Patient 17.7 sec",
    "23/01/2025:HbA1c:7.4 %",
    "19/09/2026:AFP:5.57 ng/mL",
  ];

  it("puts the most recent date at the top and the oldest at the bottom", () => {
    const out = sortFindingsByDate(REPORTED);
    expect(out.map((s) => s.slice(0, 10))).toEqual([
      "19/09/2026",
      "08/09/2026", "08/09/2026", "08/09/2026",
      "19/06/2026",
      "24/01/2025",
      "23/01/2025",
    ]);
  });

  // ⚕️ Hb, then WBC, then PLT is how a blood count is read. Re-sorting inside a
  // visit would shuffle a panel into nonsense.
  it("keeps the doctor's own order inside one date", () => {
    const out = sortFindingsByDate([
      "08/09/2026:CBC:Hb 11.7",
      "24/01/2025:X:1",
      "08/09/2026:CBC:WBC 2.2",
      "08/09/2026:CBC:PLT 60",
    ]);
    expect(out).toEqual([
      "08/09/2026:CBC:Hb 11.7",
      "08/09/2026:CBC:WBC 2.2",
      "08/09/2026:CBC:PLT 60",
      "24/01/2025:X:1",
    ]);
  });

  it("groups every finding of one date together, however far apart they were typed", () => {
    const out = sortFindingsByDate([
      "08/09/2026:A:1", "23/01/2025:B:2", "08/09/2026:C:3", "23/01/2025:D:4", "08/09/2026:E:5",
    ]);
    expect(out.map((s) => s.slice(0, 10))).toEqual([
      "08/09/2026", "08/09/2026", "08/09/2026", "23/01/2025", "23/01/2025",
    ]);
  });

  // An undated line cannot be placed in time; the top would give it a recency
  // nobody claimed for it.
  it("sends an undated finding to the end, keeping its own order", () => {
    const out = sortFindingsByDate(["Urine R/E normal", "08/09/2026:A:1", "Seen elsewhere"]);
    expect(out).toEqual(["08/09/2026:A:1", "Urine R/E normal", "Seen elsewhere"]);
  });

  it("adds nothing, drops nothing, changes no text", () => {
    const out = sortFindingsByDate(REPORTED);
    expect(out).toHaveLength(REPORTED.length);
    expect([...out].sort()).toEqual([...REPORTED].sort());
  });

  it("is idempotent, and survives empty input", () => {
    const once = sortFindingsByDate(REPORTED);
    expect(sortFindingsByDate(once)).toEqual(once);
    expect(sortFindingsByDate([])).toEqual([]);
    expect(sortFindingsByDate(undefined as unknown as string[])).toEqual([]);
  });
});

describe("sortDateGroups", () => {
  it("orders the sidebar's date groups newest first", () => {
    const out = sortDateGroups([
      { date: "24/01/2025" }, { date: "08/09/2026" }, { date: "19/06/2026" },
    ]);
    expect(out.map((g) => g.date)).toEqual(["08/09/2026", "19/06/2026", "24/01/2025"]);
  });

  it("leaves an undated group at the end", () => {
    const out = sortDateGroups([{ date: "" }, { date: "08/09/2026" }, { date: "23/01/2025" }]);
    expect(out.map((g) => g.date)).toEqual(["08/09/2026", "23/01/2025", ""]);
  });

  it("survives empty input", () => {
    expect(sortDateGroups([])).toEqual([]);
    expect(sortDateGroups(undefined as unknown as { date: string }[])).toEqual([]);
  });
});
