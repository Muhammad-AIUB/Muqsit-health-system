import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { findingDateMs, sortDateGroups, sortFindingsByDate } from "./investigationOrder";
import { anyText, calendarDate, configureProps, ddmmyyyy } from "@/test/fc";

// ⚕️ "Findings are ordered NEWEST DATE FIRST, on screen and on paper … inside
// one date the doctor's own order is kept … an undated finding sorts LAST"
// and "Ordering changes nothing else: no finding is added, dropped, merged or
// reworded" (client/CLAUDE.md, lib/investigationOrder.ts). The printed sheet's
// finding order comes from here.
configureProps(300);

// A handful of dates, so many findings share one — that is where stability
// matters. 1971+ : see DEFECT-D2 below for what happens before 1970.
const datePool = fc.array(calendarDate(1971, 2100).map(ddmmyyyy), { minLength: 1, maxLength: 5 });

// Test/value text is free: colons, slashes, Bangla, anything. `#n` makes every
// finding distinguishable, so a swap inside a date cannot hide.
const tail = anyText(12);
const undated = fc.oneof(
  tail.filter((s) => !/^\d{2}\/\d{2}\/\d{4}:/.test(s)),
  fc.constantFrom("", "Current: X", "Hb:10", "08/09/26:Hb:10", "2026-09-08:Hb:10", "8/9/2026:Hb:10"),
);

const findings: fc.Arbitrary<string[]> = datePool.chain((dates) =>
  fc.array(
    fc.oneof(
      { weight: 4, arbitrary: fc.tuple(fc.constantFrom(...dates), tail).map(([d, t]) => `${d}:${t}`) },
      { weight: 1, arbitrary: undated },
    ),
    { maxLength: 30 },
  ).map((items) => items.map((it, i) => `${it}#${i}`)),
);

const multiset = (xs: string[]) => [...xs].sort();

describe("sortFindingsByDate", () => {
  it("is a permutation: no finding added, dropped, merged or reworded", () => {
    fc.assert(
      fc.property(findings, (items) => {
        const input = [...items];
        const out = sortFindingsByDate(items);
        expect(multiset(out)).toEqual(multiset(input));
        expect(items).toEqual(input); // and the caller's array is not reordered in place
      }),
    );
  });

  it("is idempotent: sorting a sorted list changes nothing", () => {
    fc.assert(
      fc.property(findings, (items) => {
        const once = sortFindingsByDate(items);
        expect(sortFindingsByDate(once)).toEqual(once);
      }),
    );
  });

  it("puts newer dates before older ones", () => {
    fc.assert(
      fc.property(findings, (items) => {
        const keys = sortFindingsByDate(items).map(findingDateMs);
        for (let i = 1; i < keys.length; i++) expect(keys[i]).toBeLessThanOrEqual(keys[i - 1]);
      }),
    );
  });

  it("⚕️ keeps the doctor's own order inside one date (stable)", () => {
    fc.assert(
      fc.property(findings, (items) => {
        const out = sortFindingsByDate(items);
        const byKey = (xs: string[]) => {
          const m = new Map<number, string[]>();
          for (const x of xs) m.set(findingDateMs(x), [...(m.get(findingDateMs(x)) ?? []), x]);
          return m;
        };
        expect(byKey(out)).toEqual(byKey(items));
      }),
    );
  });

  it("puts every undated entry after every dated one, in the order written", () => {
    fc.assert(
      fc.property(findings, (items) => {
        const out = sortFindingsByDate(items);
        const firstUndated = out.findIndex((x) => findingDateMs(x) === 0);
        if (firstUndated >= 0) {
          expect(out.slice(firstUndated).every((x) => findingDateMs(x) === 0)).toBe(true);
          expect(out.slice(firstUndated)).toEqual(items.filter((x) => findingDateMs(x) === 0));
        }
      }),
    );
  });

  it("is total: never throws, whatever the list holds", () => {
    fc.assert(
      fc.property(fc.array(fc.anything(), { maxLength: 12 }), (junk) => {
        const out = sortFindingsByDate(junk as string[]);
        expect(out).toHaveLength(junk.length);
        expect(sortFindingsByDate(null as unknown as string[])).toEqual([]);
        for (const j of junk) expect(Number.isFinite(findingDateMs(j))).toBe(true);
      }),
    );
  });

  // DEFECT-D2: a finding dated on or before 01/01/1970 (local) sorts AFTER an undated one — the "0 = undated" sentinel is not below every real date.
  // Minimal counter-example: sortFindingsByDate(["note", "15/06/1969:Hb:10"]) returns
  //   ["note", "15/06/1969:Hb:10"]  — the undated entry is first, the dated one last.
  // Source: src/lib/investigationOrder.ts:34-38 + :50 (`b.key - a.key`, key 0 for
  // undated) on top of src/lib/dateInput.ts:159-165 (`ddmmyyyyMs` is negative before
  // 1970). client/CLAUDE.md: "an undated finding sorts LAST" and "A malformed value
  // returns 0, which sorts older than every real clinical date" — true only from 1970 on.
  // Reachable: parseDateInput accepts any year ≥ 1900 for a finding's date.
  it.fails("DEFECT-D2: an undated entry sorts last even beside a finding dated before 1970", () => {
    expect(sortFindingsByDate(["note", "15/06/1969:Hb:10"])).toEqual(["15/06/1969:Hb:10", "note"]);
  });
  it.fails("DEFECT-D2 (property): undated last, for finding dates 1900–1969", () => {
    fc.assert(
      fc.property(calendarDate(1900, 1969).map(ddmmyyyy), (d) => {
        const out = sortFindingsByDate(["note", `${d}:Hb:10`]);
        expect(out[out.length - 1]).toBe("note");
      }),
    );
  });
});

describe("sortDateGroups — the sidebar's date groups, same order as the printed list", () => {
  const groups = datePool.chain((dates) =>
    fc.array(fc.oneof({ weight: 4, arbitrary: fc.constantFrom(...dates) }, { weight: 1, arbitrary: fc.constantFrom("", "Current", "rubbish") }), { maxLength: 20 })
      .map((ds) => ds.map((date, i) => ({ date, i }))),
  );

  it("is an idempotent, stable permutation with undated groups last", () => {
    fc.assert(
      fc.property(groups, (gs) => {
        const out = sortDateGroups(gs);
        expect([...out].sort((a, b) => a.i - b.i)).toEqual(gs);
        expect(sortDateGroups(out)).toEqual(out);
        for (let k = 1; k < out.length; k++) {
          const prev = findingDateMs(`${out[k - 1].date}:`), cur = findingDateMs(`${out[k].date}:`);
          expect(cur).toBeLessThanOrEqual(prev);
          if (cur === prev) expect(out[k].i).toBeGreaterThan(out[k - 1].i); // stable
        }
      }),
    );
  });

  it("orders the groups exactly as sortFindingsByDate orders the findings", () => {
    fc.assert(
      fc.property(groups, (gs) => {
        const asFindings = gs.map((g) => `${g.date}:x#${g.i}`);
        expect(sortDateGroups(gs).map((g) => `${g.date}:x#${g.i}`)).toEqual(sortFindingsByDate(asFindings));
      }),
    );
  });
});
