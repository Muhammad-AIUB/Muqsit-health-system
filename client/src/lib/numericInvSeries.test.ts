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
