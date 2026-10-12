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
  unit: "u-one", u2: "u-two", c21: 10, otherFieldLabels: [], ...over,
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
    // A part with another box's name on it is not a second candidate, though the name begins with a digit.
    const fasting = param({ field: "Value", otherFieldLabels: ["1 hr", "2 hr"] });
    expect(numericSeriesFor([finding("01/09/2026", "95u-one,1 hr:160u-one,2 hr:130u-one")], fasting).map((p) => p.value)).toEqual([95]);
  });
});

// ⚕️ A number typed with a comma in it.
//
// The parts of a stored value are joined by commas too — by a comma and nothing
// else, no space. So a comma with a DIGIT DIRECTLY ON EACH SIDE of it cannot be
// read: "WBC:1,200" is a WBC of 1,200, or of 1.2 typed the continental way, or
// a 1 followed by another box's "200", and the string does not say which. What
// stands on either side of such a comma is not plotted.
//
// It was found three times, in production each time:
//   • "WBC:1,200" in a box with no unit was drawn as 1 (third review);
//   • the guard for that knew only a bare number after the comma, so
//     "1,200/cmm" was still drawn as 1 (fourth review);
//   • and the same comma was never looked at from its OTHER side: a ferritin
//     typed ">2,000" is stored ">2,000ng/mL", and was drawn as 0 — the part
//     after the comma, "000ng/mL", read as a value of its own (fifth review).
//     That one is in every box that has a unit.
// A comma followed by a SPACE is punctuation — "350, repeat next week",
// "2.5, 3 days after the dose change" — and the number before it stands.
describe("numericSeriesFor — a comma inside a number", () => {
  const noUnit = { unit: "", u2: undefined, c21: undefined };
  const oneUnit = { u2: undefined, c21: undefined };
  // One box of several, with its name in front of its value and no unit.
  const count = param({ field: "WBC", label: "Fluid — WBC", ...noUnit, otherFieldLabels: ["Appearance", "Protein", "ADA"] });
  // The only box of its test: its value is stored with no name, and a unit.
  const alone = param(oneUnit);
  const read = (value: string, p: ChartableParam) => numericSeriesFor([finding("01/09/2026", value)], p).map((x) => x.value);

  it("⚕️ is never plotted as its first group: 1,200 is not 1", () => {
    expect(read("WBC:1,200", count)).toEqual([]);
    expect(read("Appearance:Cloudy,WBC:1,200,ADA:Positive", count)).toEqual([]);
    expect(read("WBC:1,50,000", count)).toEqual([]);
  });

  it("nor a decimal typed with a comma: 1,2 is not 1", () => {
    expect(read("WBC:1,2", count)).toEqual([]);
  });

  it("⚕️ …whatever is typed after the number: a unit, a word, a bracket", () => {
    for (const typed of ["1,200/cmm", "1,200 cells/cmm", "1,200 (N 80%)", "1,50,000/cmm", "1,2 approx"]) {
      expect(read(`WBC:${typed}`, count), typed).toEqual([]);
      expect(read(`Appearance:Cloudy,WBC:${typed},ADA:Positive`, count), typed).toEqual([]);
    }
  });

  it("⚕️ nor as its LAST group: >2,000 is not 0, and <0,5 is not 5", () => {
    for (const typed of [">2,000", ">10,500", "approx 1,200", "<0,5", "~1,50,000", "up to 2,5"]) {
      expect(read(`${typed}u-one`, alone), typed).toEqual([]);
      expect(read(typed, param(noUnit)), `${typed} (no unit)`).toEqual([]);
      // …behind another box's own part, and behind a box that writes no name.
      expect(read(`RBC:4.5u-one,${typed}u-one`, param({ ...oneUnit, otherFieldLabels: ["RBC"] })), typed).toEqual([]);
      expect(read(`Deficient,${typed}u-one`, param({ ...oneUnit, otherFieldLabels: ["Result"] })), typed).toEqual([]);
    }
  });

  it("the same number typed without the comma is plotted, as it always was", () => {
    expect(numericSeriesFor([finding("01/09/2026", "WBC:1200")], count)).toEqual([{ date: "01/09/2026", value: 1200, label: "1200" }]);
    expect(read("Appearance:Cloudy,WBC:1200,ADA:Positive", count)).toEqual([1200]);
    expect(read("2000u-one", alone)).toEqual([2000]);
  });

  it("a value followed by ANOTHER box's own part is plotted, as it always was", () => {
    expect(read("WBC:350,Protein:2.5g/dL", count)).toEqual([350]);
    expect(read("WBC:350,ADA:Positive", count)).toEqual([350]);
  });

  it("a part that begins with a digit is another box's when it carries that box's name (OGTT's \"1 hr\", \"2 hr\")", () => {
    const fasting = param({ field: "Fasting", label: "Load — Fasting", ...noUnit, otherFieldLabels: ["1 hr", "2 hr"] });
    expect(read("Fasting:5,1 hr:9,2 hr:7", fasting)).toEqual([5]);
    expect(read("Fasting:5,1 hrs later 9", fasting)).toEqual([]);
  });

  // The space is what a doctor types after a comma that ends a thought, and
  // what nothing in the app ever puts between the parts of a value.
  it("⚕️ a comma followed by a space is punctuation: the number before it stands, as in production", () => {
    expect(read("WBC:350, repeat next week", count)).toEqual([350]);
    expect(read("WBC:350, 80% lymphocytes", count)).toEqual([350]);
    expect(read("Appearance:Cloudy,WBC:350, repeat,ADA:Positive", count)).toEqual([350]);
    expect(read("12.5u-one, repeat", alone)).toEqual([12.5]);
    expect(read("high, 12.5u-one", alone)).toEqual([12.5]);
    expect(read("see note 2, 12.5u-one", alone)).toEqual([12.5]);
  });

  it("…but two bare numbers are not read, however they are spaced", () => {
    expect(read("WBC:1, 200", count)).toEqual([]);
    expect(read("WBC:1,200", count)).toEqual([]);
  });

  // ETT's METs is followed by the Report box, which writes NO name in front of
  // its text. "METs:10,150 bpm at peak" is METs 10 and a report — or a METs of
  // 10,150 typed with words after it, as "METs:10,5 METs" is 10.5. Nothing in
  // the string says which, so neither is plotted.
  it("⚕️ a box that writes no name may follow — and then nothing says whose the digits are", () => {
    const mets = param({ field: "METs", label: "Stress test — METs", ...noUnit, otherFieldLabels: ["Result", "Report"] });
    expect(read("Positive,METs:10,150 bpm at peak", mets)).toEqual([]);
    expect(read("Positive,METs:10,5 METs", mets)).toEqual([]);
    expect(read("Positive,METs:10,150", mets)).toEqual([]);
    // Words are the report's.
    expect(read("Positive,METs:10,Stopped for fatigue", mets)).toEqual([10]);
    expect(read("Positive,METs:10", mets)).toEqual([10]);
  });

  it("a number that carries its unit is closed by it — digits after the comma are not the rest of it", () => {
    const hb = param({ field: "Hb", label: "Panel — Hb", ...oneUnit, otherFieldLabels: ["RBC"] });
    expect(read("Hb:11.2u-one,3 days after the last dose", hb)).toEqual([11.2]);
    expect(read("Hb:11.2u-one, repeated", hb)).toEqual([11.2]);
    // …and one cut off before its unit was never plotted.
    expect(read("Hb:11,2u-one", hb)).toEqual([]);
  });
});

// The same, against the catalog itself. What is typed here is made up; only the
// catalog's shape is read.
describe("numericSeriesFor — every chartable box of the catalog", () => {
  const params = chartableParams();
  const real = (test: string, field: string) => params.find((p) => p.test === test && p.field === field) as ChartableParam;
  const series = (p: ChartableParam, value: string) => numericSeriesFor([finding("01/09/2026", value, p.test)], p).map((x) => x.value);
  // What the popup stores when ONE box of a test is filled in: its name in
  // front unless it is one of the unnamed boxes, what was typed, its unit
  // (`collectTestParts` in InvestigationPopup.tsx).
  const stored = (p: ChartableParam, typed: string) => `${UNNAMED.includes(p.field) ? "" : `${p.field}:`}${typed}${p.unit}`;
  // The boxes that come after this one in its test and write their own name.
  const namedAfter = (p: ChartableParam) => {
    const fields = INV_CATS.find((c) => c.cat === p.category)!.tests.find((t) => t.name === p.test)!.fields;
    return fields.slice(fields.findIndex((f) => f.l === p.field) + 1).map((f) => f.l).filter((l) => !UNNAMED.includes(l));
  };

  it("⚕️ a number typed with a comma is never drawn as a piece of itself — in any of them", () => {
    expect(params.length).toBeGreaterThan(150);
    for (const p of params) {
      for (const typed of ["1,200", "1,50,000", "2,5", "12,5", ">2,000", ">10,500", "<0,5", "approx 1,200", "1,200 (N 80%)", "2,5 (target 2-3)"]) {
        expect(series(p, stored(p, typed)), `${p.label} ← ${typed}`).toEqual([]);
      }
    }
  });

  it("…and the same number typed plainly is drawn, alone or with a box after it filled in", () => {
    for (const p of params) {
      expect(series(p, stored(p, "1200")), p.label).toEqual([1200]);
      for (const next of namedAfter(p)) expect(series(p, `${stored(p, "1200")},${next}:x`), `${p.label} then ${next}`).toEqual([1200]);
    }
  });

  it("the boxes with no unit to close a number are these eight, and no other", () => {
    expect(params.filter((p) => p.unit === "").map((p) => `${p.test} › ${p.field}`)).toEqual([
      "Prothrombin Time › INR", "A/G Ratio › Value", "Ascites Fluid › SAAG", "Ascites Fluid › WBC",
      "Lipid Profile › TC/HDL", "DEXA Scan › T-score", "DEXA Scan › Z-score", "ETT (Treadmill) › METs",
    ]);
  });

  it("⚕️ what the reviews typed, in the boxes they typed it in", () => {
    const wbc = real("Ascites Fluid", "WBC");
    for (const typed of ["WBC:1,200", "WBC:1,200/cmm", "WBC:1,200 cells/cmm", "WBC:1,200 (N 80%)"]) expect(series(wbc, typed), typed).toEqual([]);
    expect(series(real("Prothrombin Time", "INR"), "INR:2,5 (target 2-3)")).toEqual([]);
    expect(series(real("Ascites Fluid", "SAAG"), "SAAG:1,3 g/dL")).toEqual([]);
    // A result above its assay's range, typed with its groups, in a one-box test with a unit.
    const ferritin = params.find((p) => /ferritin/i.test(p.test)) as ChartableParam;
    expect(ferritin.unit).not.toBe("");
    expect(series(ferritin, stored(ferritin, ">2,000"))).toEqual([]);
    expect(series(ferritin, stored(ferritin, "2000"))).toEqual([2000]);
  });

  // (The fourth round's rule had stopped drawing these; the fifth put them back.)
  it("a remark after a comma and a space keeps its reading, as in production", () => {
    expect(series(real("Prothrombin Time", "INR"), "INR:2.5, 3 days after dose change")).toEqual([2.5]);
    expect(series(real("Ascites Fluid", "WBC"), "WBC:350, 80% lymphocytes")).toEqual([350]);
  });

  // DEFECT-HM-SPACED (open; in production). "A comma followed by a space is
  // punctuation" is right for a remark and wrong for a NUMBER typed with a
  // space inside it — and the string does not say which it has. Such a number
  // is still drawn as a piece of itself. Telling "1, 200/cmm" from "2.5, 3 days
  // after dose change" is reading what a comma MEANS, which is the physician's
  // to say, like the groups below. See FUNCTIONAL-AUDIT.md.
  const SPACED = ["1, 200/cmm", "> 2, 000", "approx 1, 200", ",5"];
  it.fails("DEFECT-HM-SPACED: a number typed with a comma and a space inside it is not drawn as a piece of itself — in any box", () => {
    for (const p of params) for (const typed of SPACED) expect(series(p, stored(p, typed)), `${p.label} ← ${typed}`).toEqual([]);
  });

  // What is drawn today, written down so that a change to it is seen: the part
  // in FRONT of the comma where the box writes its name and has no unit, and
  // the part AFTER it where the box writes no name and the number does not
  // begin its text.
  it("…what is drawn today: 1 for \"1, 200/cmm\" in a named box with no unit; 0, 200 and 5 in a box that writes no name", () => {
    expect(series(real("Ascites Fluid", "WBC"), "WBC:1, 200/cmm")).toEqual([1]);
    const ferritin = params.find((p) => /ferritin/i.test(p.test)) as ChartableParam;
    expect(series(ferritin, stored(ferritin, "> 2, 000"))).toEqual([0]);
    expect(series(ferritin, stored(ferritin, "approx 1, 200"))).toEqual([200]);
    expect(series(ferritin, stored(ferritin, ",5"))).toEqual([5]);
    // …and nothing where the number does begin the text of a box that writes no name.
    expect(series(ferritin, stored(ferritin, "1, 200"))).toEqual([]);
  });

  it("ETT's METs is not read when the report after it begins with a number", () => {
    const mets = real("ETT (Treadmill)", "METs");
    expect(series(mets, "Positive,METs:10,150 bpm at peak")).toEqual([]);
    expect(series(mets, "Positive,METs:10,Stopped at stage 3")).toEqual([10]);
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
