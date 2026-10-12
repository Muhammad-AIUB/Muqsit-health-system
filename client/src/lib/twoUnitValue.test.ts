import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { otherUnit, recordedValue } from "./twoUnitValue";
import { INV_CATS } from "@/data/investigations";
import { configureProps } from "@/test/fc";

// The two rules of a two-unit result box (see twoUnitValue.ts). The factor used
// in the examples is SYNTHETIC (10, and 0.1 back) — these are tests of what is
// converted and what is recorded, not of any clinical conversion. The catalog's
// own factors are only ever multiplied by, never written here.
configureProps(300);

describe("otherUnit — what typing in one unit puts in the other", () => {
  it("a plain number is multiplied by the factor and kept to two places, as it always was", () => {
    expect(otherUnit("12", 10)).toBe("120");
    expect(otherUnit("12.5", 10)).toBe("125");
    expect(otherUnit("1.234", 0.1)).toBe("0.12");
    expect(otherUnit(".5", 10)).toBe("5");
    expect(otherUnit(" 12 ", 10)).toBe("120");
    expect(otherUnit("0", 10)).toBe("0");
  });

  it("…also on the way to one: \"12.\" is 12", () => {
    expect(otherUnit("12.", 10)).toBe("120");
  });

  it("⚕️ a number typed with a comma is not converted — not from its first group, not at all", () => {
    for (const typed of ["1,20,000", "120,000", "1,2", "1,200.5", "12,"]) expect(otherUnit(typed, 10), typed).toBe("");
  });

  it("⚕️ nor anything else that only BEGINS with a number", () => {
    for (const typed of ["1.2 x 10^5", "1.2e5", "12.5 (haemolysed)", "20-30", "12.5.1", "12 mg", "5/6", "1 2"]) expect(otherUnit(typed, 10), typed).toBe("");
  });

  it("nor what does not begin with one", () => {
    for (const typed of ["", " ", ">2000", "<0.5", "-5", "+5", "normal", "approx 12", ".", "Infinity", "NaN"]) expect(otherUnit(typed, 10), JSON.stringify(typed)).toBe("");
  });

  it("no factor in the catalog, no conversion — never one made up", () => {
    expect(otherUnit("12", undefined)).toBe("");
    expect(otherUnit("12", 0)).toBe("");
  });

  it("⚕️ for any text at all: either it is one plain number and is converted whole, or nothing is put in the other box", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 12 }), fc.stringMatching(/^[0-9.,eE x^+\-<>()/ ]{0,12}$/)), (typed) => {
        const got = otherUnit(typed, 10);
        const plain = /^\s*(\d+\.?\d*|\.\d+)\s*$/.test(typed);
        if (plain) expect(got).toBe((Math.round(Number(typed.trim()) * 10 * 100) / 100).toString());
        else expect(got, JSON.stringify(typed)).toBe("");
      }),
      { numRuns: 5000 },
    );
  });

  it("every two-unit box of the catalog has a factor in each direction, so a plain number is always converted", () => {
    const boxes = INV_CATS.flatMap((c) => c.tests.flatMap((t) => t.fields.filter((f) => f.u2).map((f) => ({ name: `${t.name} / ${f.l}`, f }))));
    expect(boxes.length).toBe(40);
    for (const { name, f } of boxes) {
      expect(otherUnit("1", f.c12), name).not.toBe("");
      expect(otherUnit("1", f.c21), name).not.toBe("");
    }
  });
});

describe("recordedValue — what is recorded for a box", () => {
  const first = (value?: string) => ({ value, unit: "u-one" });
  const second = (value?: string) => ({ value, unit: "u-two" });

  it("the preferred unit's value, when its box holds one", () => {
    expect(recordedValue(first("12"), second("120"), false)).toEqual({ value: "12", unit: "u-one" });
    expect(recordedValue(first("12"), second("120"), true)).toEqual({ value: "120", unit: "u-two" });
  });

  it("⚕️ otherwise what was typed, in the unit of the box it was typed in — never nothing", () => {
    expect(recordedValue(first(""), second("1,20,000"), false)).toEqual({ value: "1,20,000", unit: "u-two" });
    expect(recordedValue(first("1,20,000"), second(""), true)).toEqual({ value: "1,20,000", unit: "u-one" });
    expect(recordedValue(first(undefined), second(">2000"), false)).toEqual({ value: ">2000", unit: "u-two" });
  });

  it("a box with one unit is recorded as it always was", () => {
    expect(recordedValue(first("12"), null, false)).toEqual({ value: "12", unit: "u-one" });
    expect(recordedValue({ value: "Positive" }, null, false)).toEqual({ value: "Positive", unit: "" });
    // A preference left over for a box that has one unit changes nothing.
    expect(recordedValue(first("12"), null, true)).toEqual({ value: "12", unit: "u-one" });
  });

  it("nothing typed is nothing recorded", () => {
    expect(recordedValue(first(""), second(""), false)).toBeNull();
    expect(recordedValue(first(undefined), second(undefined), true)).toBeNull();
    expect(recordedValue(first(undefined), null, false)).toBeNull();
  });

  // A stray space in the box of the unit that is NOT preferred was recorded —
  // and printed — as a result with a unit and no value ("S. Creatinine:
  // umol/L"), where before the two-unit rule nothing was (sixth review, before
  // release). The preferred box is as it always was, like a box with one unit.
  it("⚕️ a box that holds only spaces is not what is recorded in place of an empty preferred box", () => {
    expect(recordedValue(first(""), second(" "), false)).toBeNull();
    expect(recordedValue(first("   "), second(""), true)).toBeNull();
    expect(recordedValue(first(undefined), second("\t"), false)).toBeNull();
    // …while a value typed with spaces round it is still recorded as typed.
    expect(recordedValue(first(""), second(" >2000 "), false)).toEqual({ value: " >2000 ", unit: "u-two" });
  });

  it("⚕️ what is recorded is always one of the two texts as typed, whole — for any two texts", () => {
    const typed = fc.oneof(fc.string({ maxLength: 10 }), fc.constantFrom("", " ", "   ", "\t", " 5", "5 "));
    fc.assert(
      fc.property(typed, typed, fc.boolean(), (a, b, prefer) => {
        const got = recordedValue(first(a), second(b), prefer);
        // Nothing in the preferred box, and nothing but spaces in the other.
        if (!(prefer ? b : a) && !(prefer ? a : b).trim()) { expect(got).toBeNull(); return; }
        expect(got).not.toBeNull();
        // One of the two texts, whole, with the unit of the box it stood in…
        expect((got!.value === a && got!.unit === "u-one") || (got!.value === b && got!.unit === "u-two")).toBe(true);
        // …and the preferred box's, whenever that box is not empty.
        if (prefer ? b : a) expect(got).toEqual(prefer ? { value: b, unit: "u-two" } : { value: a, unit: "u-one" });
      }),
    );
  });
});
