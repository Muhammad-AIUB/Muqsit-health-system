import { describe, expect, it } from "vitest";
import {
  categoryOfTest,
  filterByDate,
  groupByCategory,
  groupByDate,
  mergeFindings,
  parseInvestigationEntries,
  type InvFinding,
} from "./investigationSummary";
import { INV_CATS } from "@/data/investigations";
import { ddmmyyyyMs } from "./dateInput";

// The patient's permanent investigation history. A finding is stored in the
// editor as the string `dd/mm/yyyy:TestName:value` (client/CLAUDE.md, "Storage
// string protocols") and merged into `Patient.investigationSummary` on save —
// "merge-on-save (deduped), grouped by date newest-first on the records page".
// Parsing must never reword a value, and merging must never drop one.

const f = (date: string, test: string, value: string, category = "Other"): InvFinding => ({ date, category, test, value });

describe("parseInvestigationEntries", () => {
  it("reads dd/mm/yyyy:Test:value, keeping the value exactly as typed", () => {
    expect(parseInvestigationEntries(["01/09/2026:Hb:11.2 g/dl"])).toEqual([
      { date: "01/09/2026", category: categoryOfTest("Hb"), test: "Hb", value: "11.2 g/dl" },
    ]);
  });

  it("keeps every colon after the test name inside the value", () => {
    const [x] = parseInvestigationEntries(["01/09/2026:CBC:Hb:12,WBC:8000"]);
    expect(x.test).toBe("CBC");
    expect(x.value).toBe("Hb:12,WBC:8000");
  });

  it("skips image-attachment markers and Report-pool rows — they are not results", () => {
    expect(parseInvestigationEntries([
      "01/09/2026:Hb:[image attached]",
      "01/09/2026:Report 1:[image attached]",
      "01/09/2026:Report 2:something",
      "01/09/2026:report 12:x",
    ])).toEqual([]);
  });

  it("skips what it cannot read rather than guessing: no date, no test, blank, short year", () => {
    expect(parseInvestigationEntries(["", "Hb:10", "01/09/26:Hb:10", "2026-09-01:Hb:10", "01/09/2026:Hb", "01/09/2026::10", "01/09/2026:  :10"])).toEqual([]);
  });

  it("keeps a test that has a name but no value yet (the value is empty, not invented)", () => {
    expect(parseInvestigationEntries(["01/09/2026:Hb:"])).toEqual([{ date: "01/09/2026", category: categoryOfTest("Hb"), test: "Hb", value: "" }]);
  });

  it("keeps the order the findings were written in, and every one of them", () => {
    const entries = ["08/09/2026:Hb:11", "19/06/2026:WBC:9000", "24/01/2025:PLT:250000", "08/09/2026:Hb:11"];
    expect(parseInvestigationEntries(entries).map((x) => `${x.date}:${x.test}:${x.value}`)).toEqual(entries);
  });
});

describe("categoryOfTest", () => {
  it("files every catalogue test under the first real category that lists it", () => {
    const first = new Map<string, string>();
    for (const c of INV_CATS) {
      if (c.cat === "Favourite") continue;
      for (const t of c.tests ?? []) if (!first.has(t.name.trim().toLowerCase())) first.set(t.name.trim().toLowerCase(), c.cat);
    }
    expect(first.size).toBeGreaterThan(0);
    for (const [name, cat] of first) expect(categoryOfTest(name), name).toBe(cat);
  });

  it("is case- and space-insensitive, and never files anything under Favourite", () => {
    expect(categoryOfTest("  alt/sgpt ")).toBe(categoryOfTest("ALT/SGPT"));
    for (const c of INV_CATS) for (const t of c.tests ?? []) expect(categoryOfTest(t.name)).not.toBe("Favourite");
  });

  it("files a test the catalogue does not know under Other — never under a guessed category", () => {
    expect(categoryOfTest("A test nobody catalogued")).toBe("Other");
    expect(categoryOfTest("")).toBe("Other");
  });
});

describe("mergeFindings", () => {
  const a = f("01/09/2026", "Hb", "11.2 g/dl");
  const b = f("01/09/2026", "WBC", "9000");

  it("appends new findings after the existing ones, in order", () => {
    expect(mergeFindings([a], [b])).toEqual([a, b]);
  });

  it("does not store the same date+test+value twice (case-insensitively)", () => {
    expect(mergeFindings([a], [a, f("01/09/2026", "hb", "11.2 G/DL")])).toEqual([a]);
    expect(mergeFindings([], [a, { ...a }])).toEqual([a]);
  });

  it("⚕️ keeps two different values for one test on one date — a re-test is not a duplicate", () => {
    const again = f("01/09/2026", "Hb", "10.8 g/dl");
    expect(mergeFindings([a], [again])).toEqual([a, again]);
  });

  it("keeps the same result on another date", () => {
    const later = f("08/09/2026", "Hb", "11.2 g/dl");
    expect(mergeFindings([a], [later])).toEqual([a, later]);
  });

  it("never drops or reorders what was already stored, and never mutates its inputs", () => {
    const stored = [b, a, { ...a }]; // an already-duplicated history stays as it is
    const copy = structuredClone(stored);
    const out = mergeFindings(stored, [a]);
    expect(out).toEqual(copy);
    expect(stored).toEqual(copy);
    expect(out).not.toBe(stored);
  });
});

describe("groupByDate", () => {
  it("groups by date, newest date first, the written order kept inside a date", () => {
    const list = [f("19/06/2026", "Hb", "1"), f("08/09/2026", "Hb", "2"), f("24/01/2025", "Hb", "3"), f("08/09/2026", "WBC", "4"), f("19/06/2026", "PLT", "5")];
    const groups = groupByDate(list);
    expect(groups.map((g) => g.date)).toEqual(["08/09/2026", "19/06/2026", "24/01/2025"]);
    expect(groups[0].items.map((x) => x.value)).toEqual(["2", "4"]);
    expect(groups[1].items.map((x) => x.value)).toEqual(["1", "5"]);
    // Nothing lost.
    expect(groups.flatMap((g) => g.items)).toHaveLength(list.length);
  });

  // 25/07 vs 03/06: `new Date(str)` would read the first as Invalid and the
  // second as 6 March (client/CLAUDE.md, "Date parsing").
  it("orders dd/mm/yyyy as day/month, not month/day", () => {
    expect(groupByDate([f("03/06/2026", "Hb", "1"), f("25/07/2026", "Hb", "2")]).map((g) => g.date)).toEqual(["25/07/2026", "03/06/2026"]);
  });

  it("puts a group with an unreadable date after the dated ones", () => {
    expect(groupByDate([f("rubbish", "Hb", "1"), f("08/09/2026", "Hb", "2")]).map((g) => g.date)).toEqual(["08/09/2026", "rubbish"]);
  });
});

describe("groupByCategory", () => {
  it("groups by category alphabetically, newest finding first inside each", () => {
    const list = [f("19/06/2026", "Hb", "1", "Hematology"), f("08/09/2026", "ALT/SGPT", "2", "LFT / Liver"), f("08/09/2026", "Hb", "3", "Hematology")];
    const groups = groupByCategory(list);
    expect(groups.map((g) => g.category)).toEqual(["Hematology", "LFT / Liver"]);
    expect(groups[0].items.map((x) => x.value)).toEqual(["3", "1"]);
    expect(groups.flatMap((g) => g.items)).toHaveLength(list.length);
  });
});

describe("filterByDate", () => {
  const list = [f("24/01/2025", "Hb", "1"), f("19/06/2026", "Hb", "2"), f("08/09/2026", "Hb", "3")];

  it("keeps everything when both bounds are open", () => {
    expect(filterByDate(list, null, null)).toEqual(list);
  });

  it("is inclusive at both ends, in real epoch milliseconds", () => {
    const from = ddmmyyyyMs("19/06/2026"), to = ddmmyyyyMs("08/09/2026");
    expect(filterByDate(list, from, to).map((x) => x.value)).toEqual(["2", "3"]);
    expect(filterByDate(list, from + 1, to - 1)).toEqual([]);
    expect(filterByDate(list, null, from).map((x) => x.value)).toEqual(["1", "2"]);
    expect(filterByDate(list, to, null).map((x) => x.value)).toEqual(["3"]);
  });

  it("never mutates the list it filters", () => {
    const copy = structuredClone(list);
    filterByDate(list, ddmmyyyyMs("19/06/2026"), null);
    expect(list).toEqual(copy);
  });
});
