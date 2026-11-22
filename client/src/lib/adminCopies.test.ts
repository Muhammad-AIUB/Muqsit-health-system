import { describe, expect, it } from "vitest";
import * as client from "./statistics";
import * as clientDays from "./opdDay";
import * as admin from "../../../admin/src/lib/statistics";
import {
  buildScoresBody, draftsFrom, isChanged, POINT_MAX, POINT_MIN, readScoreInput, SCORE_PROBLEM,
} from "../../../admin/src/lib/points";

// The admin console is a separate package: it cannot import the doctor app, so its
// "Dr's patient data" tab (physician's sheet, 16/11/2026 — "whatever the doctor
// sees") carries COPIES of the doctor's Statistics helpers, and its Point system
// carries the one reader of a typed score. The admin has no test runner of its own
// (and the deploy runs none for it), so they are held here: the same cases run
// against both copies, and the admin's own helpers have their cases below. If the
// two ever read a number differently, this fails — "edit one, edit both".

const attempt = <T>(f: () => T): { ok: true; value: T } | { ok: false; error: string } => {
  try { return { ok: true, value: f() }; } catch (e) { return { ok: false, error: (e as Error).message }; }
};

describe("admin copy of lib/statistics.ts reads every answer exactly as the doctor app does", () => {
  const months = ["2026-01", "2026-11", "2026-12", "1999-12", "2100-02"];
  it.each(months)("shiftMonthKey / monthCaption / shortMonth agree for %s", (m) => {
    for (const d of [-25, -13, -1, 0, 1, 2, 11, 12, 13, 36]) {
      expect(admin.shiftMonthKey(m, d)).toBe(client.shiftMonthKey(m, d));
    }
    expect(admin.monthCaption(m)).toBe(client.monthCaption(m));
    expect(admin.shortMonth(m)).toBe(client.shortMonth(m));
  });

  it("shiftYearKey, dayNumber and averageText agree", () => {
    for (const y of ["2026", "1999", "2100"]) for (const d of [-2, 0, 1, 40]) expect(admin.shiftYearKey(y, d)).toBe(client.shiftYearKey(y, d));
    for (const day of ["2026-11-03", "2026-11-10", "2026-02-28"]) expect(admin.dayNumber(day)).toBe(client.dayNumber(day));
    for (const n of [null, 0, 1, 2.25, 3.333, 10, 0.05]) expect(admin.averageText(n)).toBe(client.averageText(n));
  });

  it("axisFor agrees over a spread of sizes — 0 to a hundred thousand", () => {
    const sizes = [-1, 0, 0.5, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 17, 24, 25, 26, 49, 50, 99, 100, 101, 250, 999, 1000, 1234, 99_999, 100_000];
    for (const s of sizes) expect(admin.axisFor(s)).toEqual(client.axisFor(s));
  });

  it("the day helpers agree with opdDay (dhakaToday, dayLabel, shiftMonth, monthTitle)", () => {
    for (const at of ["2026-11-16T00:00:00Z", "2026-11-16T17:59:59Z", "2026-11-16T18:00:00Z", "2026-12-31T23:59:59Z", "2026-01-01T00:00:00Z"]) {
      expect(admin.dhakaToday(new Date(at))).toBe(clientDays.dhakaToday(new Date(at)));
    }
    expect(admin.dayLabel("2026-11-03")).toBe(clientDays.dayLabel("2026-11-03"));
    for (const ref of [{ year: 2026, month: 0 }, { year: 2026, month: 11 }]) {
      for (const d of [-13, -1, 0, 1, 13]) expect(admin.shiftMonth(ref, d)).toEqual(clientDays.shiftMonth(ref, d));
      expect(admin.monthTitle(ref)).toBe(clientDays.monthTitle(ref));
    }
  });

  const overall = { totalVisits: 10, averageMonthly: 2.5, averageDaily: null, thisMonth: 3, previousMonth: 4, firstSeenDay: "2026-08-01", days: 100, months: 4, today: "2026-11-16" };
  const answers: [string, "readDays" | "readMonths" | "readOverall" | "readDiagnoses", unknown][] = [
    ["good days", "readDays", { month: "2026-11", days: [{ day: "2026-11-01", total: 3, seen: 2 }] }],
    ["days: negative count", "readDays", { month: "2026-11", days: [{ day: "2026-11-01", total: -1, seen: 0 }] }],
    ["days: string count", "readDays", { month: "2026-11", days: [{ day: "2026-11-01", total: "3", seen: 2 }] }],
    ["days: missing list", "readDays", { month: "2026-11" }],
    ["days: sign-in page", "readDays", "<html>sign in</html>"],
    ["good months", "readMonths", { year: "2026", months: [{ month: "2026-01", total: 5, seen: 4 }] }],
    ["months: NaN", "readMonths", { year: "2026", months: [{ month: "2026-01", total: NaN, seen: 4 }] }],
    ["months: list not object", "readMonths", []],
    ["good overall", "readOverall", overall],
    ["overall: no today", "readOverall", { ...overall, today: undefined }],
    ["overall: bad today", "readOverall", { ...overall, today: "16/11/2026" }],
    ["overall: average negative", "readOverall", { ...overall, averageMonthly: -1 }],
    ["overall: average zero is allowed", "readOverall", { ...overall, averageDaily: 0 }],
    ["overall: empty", "readOverall", {}],
    ["good diagnoses", "readDiagnoses", { diagnoses: [{ name: "DM", patients: 4 }] }],
    ["diagnoses: no name", "readDiagnoses", { diagnoses: [{ patients: 4 }] }],
    ["diagnoses: empty body", "readDiagnoses", null],
  ];
  it.each(answers)("%s is read — or refused — the same way", (_label, reader, body) => {
    const a = attempt(() => (admin[reader] as (x: unknown) => unknown)(body));
    const c = attempt(() => (client[reader] as (x: unknown) => unknown)(body));
    expect(a).toEqual(c);
  });
});

describe("admin readChambers — the dropdown's list is checked before it is drawn", () => {
  it("accepts the server's list, including none", () => {
    expect(admin.readChambers([])).toEqual([]);
    expect(admin.readChambers([{ id: "c1", name: "Main chamber", isDefault: true }])).toHaveLength(1);
  });
  it.each([[null], [{}], ["x"], [[{ id: 1, name: "a" }]], [[{ id: "a" }]], [[null]]])("%j is refused", (body) => {
    expect(() => admin.readChambers(body)).toThrow(/not the chambers/);
  });
});

describe("the Point system's boxes — what was typed (physician's sheet, 16/11/2026)", () => {
  it("the range is 1 to 10", () => {
    expect([POINT_MIN, POINT_MAX]).toEqual([1, 10]);
  });

  it.each([
    ["1", 1], ["5", 5], ["10", 10], [" 7 ", 7], ["07", 7], ["9", 9],
  ])("%j is %j", (typed, value) => expect(readScoreInput(typed)).toEqual({ ok: true, value }));

  it.each([[""], ["   "], ["\t"]])("%j is not scored (null) — never 0", (typed) => {
    expect(readScoreInput(typed)).toEqual({ ok: true, value: null });
  });

  it.each([["0"], ["00"], ["11"], ["99"], ["7.5"], ["7,5"], ["-3"], ["+7"], ["abc"], ["7a"], ["१०"], ["১০"], ["1e1"], ["१"], ["100"], ["1 0"]])(
    "%j is refused, with the sentence under the box (not rounded, not clamped)",
    (typed) => {
      expect(readScoreInput(typed)).toEqual({ ok: false, problem: SCORE_PROBLEM });
    },
  );

  const keys = ["a", "b", "c"];

  it("buildScoresBody sends every criterion — null where the box is empty", () => {
    expect(buildScoresBody(keys, { a: "8", b: "", c: "10" })).toEqual({ ok: true, scores: { a: 8, b: null, c: 10 } });
    // a key with no draft at all reads as empty
    expect(buildScoresBody(keys, { a: "8" })).toEqual({ ok: true, scores: { a: 8, b: null, c: null } });
  });

  it("buildScoresBody sends NOTHING while any box is wrong, and names every wrong one", () => {
    const r = buildScoresBody(keys, { a: "11", b: "5", c: "x" });
    expect(r).toEqual({ ok: false, problems: { a: SCORE_PROBLEM, c: SCORE_PROBLEM } });
  });

  it("draftsFrom shows what is saved, and an unscored criterion as an empty box", () => {
    expect(draftsFrom(keys, { a: 8, c: 10 })).toEqual({ a: "8", b: "", c: "10" });
    expect(draftsFrom(keys, {})).toEqual({ a: "", b: "", c: "" });
  });

  it("isChanged: the boxes as saved are not a change; a different, cleared, added or wrong box is", () => {
    const saved = { a: 8, c: 10 };
    expect(isChanged(keys, draftsFrom(keys, saved), saved)).toBe(false);
    expect(isChanged(keys, { a: "9", b: "", c: "10" }, saved)).toBe(true); // changed
    expect(isChanged(keys, { a: "", b: "", c: "10" }, saved)).toBe(true); // cleared
    expect(isChanged(keys, { a: "8", b: "3", c: "10" }, saved)).toBe(true); // added
    expect(isChanged(keys, { a: "8", b: "x", c: "10" }, saved)).toBe(true); // wrong is not what is saved
    expect(isChanged(keys, { a: " 8 ", b: "", c: " 10 " }, saved)).toBe(false); // spaces around the same value: no change
    expect(isChanged(keys, { a: "08", b: "", c: "10" }, saved)).toBe(false); // a leading zero is the same value
    expect(isChanged(keys, { a: "8", b: "", c: "010" }, saved)).toBe(true); // three digits is not a score at all
  });
});
