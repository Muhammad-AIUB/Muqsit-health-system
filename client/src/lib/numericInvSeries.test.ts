import { describe, expect, it } from "vitest";
import { chartableParams, numericSeriesFor, type ChartableParam } from "./numericInvSeries";
import { INV_CATS } from "@/data/investigations";
import type { InvFinding } from "./investigationSummary";

// The Health-trend chart plots a stored finding only when it can read it with
// CONFIDENCE. The module's own rules: "Returns null when the substring can't be
// identified with confidence — never guesses", "never invent [a conversion
// factor]", "Same-date re-entries are never deduped/merged", and a u1-recorded
// value's label is "the raw string, verbatim — zero transformation".
//
// ⚕️ The parameter below is SYNTHETIC on purpose (units "u-one" / "u-two", factor
// 10): these tests are about the parsing rules, and a made-up unit pair cannot
// be mistaken for a clinical conversion. The real catalogue is only checked for
// shape, never for its numbers.

const param = (over: Partial<ChartableParam> = {}): ChartableParam => ({
  test: "Synthetic", field: "Value", label: "Synthetic", category: "Test",
  unit: "u-one", u2: "u-two", c21: 10, otherFieldLabels: [], unlabelledAfter: false, ...over,
});
const finding = (date: string, value: string, test = "Synthetic"): InvFinding => ({ date, category: "Test", test, value });
// The boxes whose value is stored with no name in front of it (VALUE_LABELS in
// the popup and in the module under test).
const UNNAMED = ["Value", "Result", "Report", "Finding", "Score", "Status", "Grade"];

describe("numericSeriesFor — single-value field", () => {
  it("plots a value recorded in the field's own unit, label verbatim", () => {
    expect(numericSeriesFor([finding("01/09/2026", "12.5u-one")], param())).toEqual([
      { date: "01/09/2026", value: 12.5, label: "12.5u-one" },
    ]);
  });

  it("accepts a space between the number and the unit", () => {
    const pts = numericSeriesFor([finding("01/09/2026", "12.5 u-one")], param());
    expect(pts.map((p) => p.value)).toEqual([12.5]);
    expect(pts[0].label).toBe("12.5 u-one"); // still exactly what was stored
  });

  it("converts a value recorded in the second unit with the field's OWN factor, and shows the raw string beside it", () => {
    expect(numericSeriesFor([finding("01/09/2026", "3u-two")], param())).toEqual([
      { date: "01/09/2026", value: 30, label: "30u-one (3u-two)" },
    ]);
  });

  it("⚕️ drops a second-unit value when the field carries no conversion factor — never invents one", () => {
    expect(numericSeriesFor([finding("01/09/2026", "3u-two")], param({ c21: undefined }))).toEqual([]);
  });

  it("drops a value in a unit the field does not declare", () => {
    expect(numericSeriesFor([finding("01/09/2026", "3mg"), finding("01/09/2026", "3")], param())).toEqual([]);
  });

  it("plots a bare number only for a unitless field", () => {
    expect(numericSeriesFor([finding("01/09/2026", "3")], param({ unit: "", u2: undefined, c21: undefined }))).toEqual([
      { date: "01/09/2026", value: 3, label: "3" },
    ]);
  });

  it("drops words, dropdown results and blanks instead of plotting them as a number", () => {
    const junk = ["normal", "Positive", "", "  ", "—", "u-one", "abc 12u-one", "-5u-one"];
    expect(numericSeriesFor(junk.map((v) => finding("01/09/2026", v)), param())).toEqual([]);
  });

  it("ignores findings for other tests, however similar the name", () => {
    expect(numericSeriesFor([finding("01/09/2026", "12u-one", "Synthetic 2"), finding("01/09/2026", "12u-one", "synthetic")], param())).toEqual([]);
  });
});

describe("numericSeriesFor — one field of a multi-field test", () => {
  const hb = param({ field: "Hb", label: "Panel — Hb", otherFieldLabels: ["RBC", "Value"] });

  it("reads its own Label:value part and nobody else's", () => {
    expect(numericSeriesFor([finding("01/09/2026", "RBC:4.5u-one, Hb:11.2u-one, Value:9u-one")], hb)).toEqual([
      { date: "01/09/2026", value: 11.2, label: "11.2u-one" },
    ]);
  });

  it("⚕️ does not fall back to a bare number for a labelled field — it could be any sibling's", () => {
    expect(numericSeriesFor([finding("01/09/2026", "11.2u-one"), finding("01/09/2026", "RBC:4.5u-one")], hb)).toEqual([]);
  });

  it("a bare-value field takes the one unclaimed numeric part, and skips when there are two", () => {
    const value = param({ field: "Value", otherFieldLabels: ["RBC", "Hb"] });
    expect(numericSeriesFor([finding("01/09/2026", "RBC:4.5u-one, 9u-one")], value).map((p) => p.value)).toEqual([9]);
    expect(numericSeriesFor([finding("01/09/2026", "9u-one, 8u-one")], value)).toEqual([]);
    expect(numericSeriesFor([finding("01/09/2026", "RBC:4.5u-one")], value)).toEqual([]);
  });
});

// A number typed with a comma in it. The value's parts are joined by commas
// too, so "WBC:1,200" is stored looking exactly like a WBC of 1 followed by
// another part, "200". For a field with a unit the cut-off "1" has no unit and
// was already refused; for a field WITHOUT one it was plotted — a count of
// 1,200 drawn on the chart as 1 (found in review, 2026-10-12; in production
// until then).
describe("numericSeriesFor — a number typed with a comma, in a field with no unit", () => {
  const count = param({ field: "WBC", label: "Fluid — WBC", unit: "", u2: undefined, c21: undefined, otherFieldLabels: ["Appearance", "Protein", "ADA"] });

  it("⚕️ is never plotted as its first group: 1,200 is not 1", () => {
    expect(numericSeriesFor([finding("01/09/2026", "WBC:1,200")], count)).toEqual([]);
    expect(numericSeriesFor([finding("01/09/2026", "Appearance:Cloudy,WBC:1,200,ADA:Positive")], count)).toEqual([]);
    expect(numericSeriesFor([finding("01/09/2026", "WBC:1,50,000")], count)).toEqual([]);
  });

  it("nor a decimal typed with a comma: 1,2 is not 1", () => {
    expect(numericSeriesFor([finding("01/09/2026", "WBC:1,2")], count)).toEqual([]);
  });

  it("the same number typed without the comma is plotted, as it always was", () => {
    expect(numericSeriesFor([finding("01/09/2026", "WBC:1200")], count)).toEqual([{ date: "01/09/2026", value: 1200, label: "1200" }]);
    expect(numericSeriesFor([finding("01/09/2026", "Appearance:Cloudy,WBC:1200,ADA:Positive")], count).map((p) => p.value)).toEqual([1200]);
  });

  it("a value followed by ANOTHER box's own part is plotted, as it always was", () => {
    expect(numericSeriesFor([finding("01/09/2026", "WBC:350,Protein:2.5g/dL")], count).map((p) => p.value)).toEqual([350]);
    expect(numericSeriesFor([finding("01/09/2026", "WBC:350,ADA:Positive")], count).map((p) => p.value)).toEqual([350]);
  });

  // The first guard (2026-10-12) refused only a bare number followed by ANOTHER
  // bare number, so anything typed after the number let its first group
  // through: "WBC:1,200/cmm" was still drawn as 1 (fourth review, before
  // release). Every box that comes after WBC in this test writes its own name
  // in front of its value, so a part with no name on it straight after WBC's
  // can only be the rest of what was typed into WBC's own box.
  it("⚕️ …whatever is typed after the number: a unit, a word, a bracket", () => {
    for (const typed of ["1,200/cmm", "1,200 cells/cmm", "1,200 (N 80%)", "1,50,000/cmm", "1,2 approx", "1, 200"]) {
      expect(numericSeriesFor([finding("01/09/2026", `WBC:${typed}`)], count), typed).toEqual([]);
      expect(numericSeriesFor([finding("01/09/2026", `Appearance:Cloudy,WBC:${typed},ADA:Positive`)], count), typed).toEqual([]);
    }
  });

  // A number's own comma is followed by a digit. Words after one are a remark
  // typed into the same box, and the number in front of them is whole.
  it("words typed after the number, behind a comma, leave it readable — as they always did", () => {
    expect(numericSeriesFor([finding("01/09/2026", "WBC:350, repeat next week")], count).map((p) => p.value)).toEqual([350]);
    expect(numericSeriesFor([finding("01/09/2026", "Appearance:Cloudy,WBC:350, repeat,ADA:Positive")], count).map((p) => p.value)).toEqual([350]);
  });

  it("a part that begins with a digit is another box's when it carries that box's name (OGTT's \"1 hr\", \"2 hr\")", () => {
    const fasting = param({ field: "Fasting", label: "Load — Fasting", unit: "", u2: undefined, c21: undefined, otherFieldLabels: ["1 hr", "2 hr"] });
    expect(numericSeriesFor([finding("01/09/2026", "Fasting:5,1 hr:9,2 hr:7")], fasting).map((p) => p.value)).toEqual([5]);
    expect(numericSeriesFor([finding("01/09/2026", "Fasting:5,1 hrs later 9")], fasting)).toEqual([]);
  });

  // ETT is the one test where a box with no unit (METs) is followed by a box
  // that writes NO name in front of its text (Report). There a part with no
  // name on it may be the report, so words after the number are the report's —
  // and only a bare number, which could be either, is refused.
  it("…but where the NEXT box writes no name of its own, words after the number are that box's text", () => {
    const mets = param({ field: "METs", label: "Stress test — METs", unit: "", u2: undefined, c21: undefined, otherFieldLabels: ["Result", "Report"], unlabelledAfter: true });
    expect(numericSeriesFor([finding("01/09/2026", "Positive,METs:10,150 bpm at peak")], mets).map((p) => p.value)).toEqual([10]);
    expect(numericSeriesFor([finding("01/09/2026", "Positive,METs:10,Stopped for fatigue")], mets).map((p) => p.value)).toEqual([10]);
    // A report that is nothing but a number cannot be told from the rest of the value: not plotted.
    expect(numericSeriesFor([finding("01/09/2026", "Positive,METs:10,150")], mets)).toEqual([]);
  });

  it("a number that carries its unit is closed by it — what follows cannot be the rest of the number", () => {
    const hb = param({ field: "Hb", label: "Panel — Hb", unit: "u-one", u2: undefined, c21: undefined, otherFieldLabels: ["RBC"] });
    expect(numericSeriesFor([finding("01/09/2026", "Hb:11.2u-one, repeated")], hb).map((p) => p.value)).toEqual([11.2]);
    // …and one cut off before its unit was never plotted.
    expect(numericSeriesFor([finding("01/09/2026", "Hb:11,2u-one")], hb)).toEqual([]);
  });
});

// The same, against the catalog itself: the boxes whose number has no unit to
// close it. What is typed here is made up; only the catalog's shape is read.
describe("numericSeriesFor — the catalog's own boxes with no unit", () => {
  const params = chartableParams();
  const real = (test: string, field: string) => params.find((p) => p.test === test && p.field === field) as ChartableParam;
  const series = (p: ChartableParam, value: string) => numericSeriesFor([finding("01/09/2026", value, p.test)], p).map((x) => x.value);
  // The boxes that come after this one in its test and write their own name.
  const namedAfter = (p: ChartableParam) => {
    const fields = INV_CATS.find((c) => c.cat === p.category)!.tests.find((t) => t.name === p.test)!.fields;
    return fields.slice(fields.findIndex((f) => f.l === p.field) + 1).map((f) => f.l).filter((l) => !UNNAMED.includes(l));
  };

  it("they are these eight, and no other", () => {
    expect(params.filter((p) => p.unit === "").map((p) => `${p.test} › ${p.field}`)).toEqual([
      "Prothrombin Time › INR", "A/G Ratio › Value", "Ascites Fluid › SAAG", "Ascites Fluid › WBC",
      "Lipid Profile › TC/HDL", "DEXA Scan › T-score", "DEXA Scan › Z-score", "ETT (Treadmill) › METs",
    ]);
  });

  it("⚕️ only two numbers in the catalog are followed by a box that writes no name of its own", () => {
    // A new one is a new place where a part with no name may be someone
    // else's: look at how it reads before adding it here.
    expect(params.filter((p) => p.unlabelledAfter).map((p) => `${p.test} › ${p.field}`)).toEqual(["Echo › EF", "ETT (Treadmill) › METs"]);
  });

  it("⚕️ what the fourth review typed is not drawn as its first group", () => {
    const wbc = real("Ascites Fluid", "WBC");
    expect(series(wbc, "WBC:1,200")).toEqual([]);
    expect(series(wbc, "WBC:1,200/cmm")).toEqual([]);
    expect(series(wbc, "WBC:1,200 cells/cmm")).toEqual([]);
    expect(series(wbc, "WBC:1,200 (N 80%)")).toEqual([]);
    expect(series(real("Prothrombin Time", "INR"), "INR:2,5 (target 2-3)")).toEqual([]);
    expect(series(real("Ascites Fluid", "SAAG"), "SAAG:1,3 g/dL")).toEqual([]);
  });

  it("ETT's METs, with its report after it, is read as METs and a report", () => {
    const mets = real("ETT (Treadmill)", "METs");
    expect(series(mets, "Positive,METs:10,150 bpm at peak")).toEqual([10]);
    expect(series(mets, "Positive,METs:10,150")).toEqual([]);
  });

  it("⚕️ for every one of them: a number typed with a comma is never drawn as the part before it", () => {
    for (const p of params.filter((x) => x.unit === "" && x.field !== "Value")) {
      for (const typed of ["1,200", "1,200/cmm", "1,2 approx", "2,5 (target 2-3)", "12,5"]) {
        const got = series(p, `${p.field}:${typed}`);
        // METs may be followed by its report, so words after it are read as the report's.
        if (p.unlabelledAfter && !/^\d+,\d+$/.test(typed)) continue;
        expect(got, `${p.label} ← ${typed}`).toEqual([]);
      }
    }
    // The one box of the eight that writes no name: a single value, two numbers in it.
    const ag = real("A/G Ratio", "Value");
    for (const typed of ["1,2", "1,200", "1,2 approx"]) expect(series(ag, typed), typed).toEqual([]);
  });

  it("…and the same number typed plainly is drawn, alone or with the boxes after it filled in", () => {
    for (const p of params.filter((x) => x.unit === "" && x.field !== "Value")) {
      expect(series(p, `${p.field}:1200`), p.label).toEqual([1200]);
      for (const next of namedAfter(p)) expect(series(p, `${p.field}:1200,${next}:x`), `${p.label} then ${next}`).toEqual([1200]);
    }
    expect(series(real("A/G Ratio", "Value"), "1.2")).toEqual([1.2]);
  });
});

// DEFECT-HM-GROUPED (open; in production): a number typed with its groups is
// not plotted at all — "WBC:12,000cells/uL", "PLT:1,50,000/cmm" give no point,
// and the lane reads as if nothing had been recorded. Not plotting it is the
// safe half (above); reading 12,000 as twelve thousand is the other half, and
// what a typed comma means is the physician's to say. See FUNCTIONAL-AUDIT.md.
describe("numericSeriesFor — DEFECT-HM-GROUPED", () => {
  it.fails("a count typed with its groups is plotted as the number it is", () => {
    const wbc = param({ field: "WBC", label: "Panel — WBC", unit: "cells/uL", u2: undefined, c21: undefined, otherFieldLabels: ["Hb"] });
    expect(numericSeriesFor([finding("01/09/2026", "WBC:12,000cells/uL")], wbc).map((p) => p.value)).toEqual([12000]);
  });
});

describe("numericSeriesFor — the series", () => {
  it("is ordered oldest first by dd/mm/yyyy, whatever order the findings were stored in", () => {
    const pts = numericSeriesFor([finding("25/07/2026", "3u-one"), finding("03/06/2026", "1u-one"), finding("24/01/2025", "2u-one")], param());
    expect(pts.map((p) => p.date)).toEqual(["24/01/2025", "03/06/2026", "25/07/2026"]);
  });

  it("⚕️ keeps two readings from one date as two points, in the order recorded", () => {
    const pts = numericSeriesFor([finding("01/09/2026", "11u-one"), finding("01/09/2026", "9u-one"), finding("01/09/2026", "11u-one")], param());
    expect(pts.map((p) => p.value)).toEqual([11, 9, 11]);
  });

  it("returns an empty series for no findings, and does not mutate the findings", () => {
    expect(numericSeriesFor([], param())).toEqual([]);
    const list = [finding("25/07/2026", "3u-one"), finding("03/06/2026", "1u-one")];
    const copy = structuredClone(list);
    numericSeriesFor(list, param());
    expect(list).toEqual(copy);
  });
});

describe("chartableParams — derived from the catalogue, nothing added", () => {
  const params = chartableParams();

  it("lists exactly the numeric fields of the catalogue, one parameter each", () => {
    const numeric = INV_CATS.flatMap((c) => c.tests.flatMap((t) => t.fields.filter((f) => f.t === "num").map((f) => `${c.cat}|${t.name}|${f.l}`)));
    expect(params.map((p) => `${p.category}|${p.test}|${p.field}`)).toEqual(numeric);
    expect(params.length).toBeGreaterThan(0);
  });

  it("carries each field's units and factor exactly as the catalogue states them", () => {
    for (const p of params) {
      const field = INV_CATS.find((c) => c.cat === p.category)!.tests.find((t) => t.name === p.test)!.fields.find((f) => f.l === p.field)!;
      expect(p.unit, p.label).toBe(field.u1 ?? "");
      expect(p.u2, p.label).toBe(field.u2);
      expect(p.c21, p.label).toBe(field.c21);
    }
  });

  it("labels a single-field test by its name and a multi-field one as 'Test — Field'", () => {
    for (const p of params) {
      const test = INV_CATS.find((c) => c.cat === p.category)!.tests.find((t) => t.name === p.test)!;
      expect(p.label).toBe(test.fields.length > 1 ? `${p.test} — ${p.field}` : p.test);
      expect(p.otherFieldLabels).toEqual(test.fields.filter((f) => f.l !== p.field).map((f) => f.l));
    }
  });
});
