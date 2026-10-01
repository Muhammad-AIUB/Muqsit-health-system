import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { looksLikeMedicine, parseDose, parseDuration, parseFood, splitDrugLabel } from "./rxShorthand";
import { anyText, configureProps } from "@/test/fc";

// ⚕️ `splitDrugLabel` decides which part of a medicine label prints in bold.
// Its contract (lib/rxShorthand.ts): "The three pieces are INDEX RANGES of the
// string passed in, so `before + name + after` is always byte-identical to it —
// including every space. Nothing is reworded, reordered, dropped or converted".
// On the printed sheet that is the difference between emphasis and a rewritten
// medicine name, so it is checked here against ANY string, not five examples.
configureProps(500);

// Labels shaped like the real ones: form, brand, strength, with messy spacing.
// Every literal is taken from rxShorthand.test.ts / rxHabitKey.test.ts /
// prescriptionDoc.test.ts — no medicine is invented here.
const form = fc.constantFrom(
  "", "Tablet.", "Capsule.", "Tablet (Enteric Coated).", "SC Injection.", "Oral Solution.", "tab", "inj.", "Cap.", "syp", "susp",
);
const brand = fc.constantFrom("Napa", "Seclo", "Barcavir", "5-FU", "Bicozin", "Avolac", "Dimerol MR", "নাপা", "প্যারাসিটামল", "N/A Brand");
const strength = fc.constantFrom("", "500 mg", "500mg", "0.5 mg", "3.35 gm/5 ml", "N/A", "n/a", "20% 100ml", "৫০০ মিগ্রা");
const gap = fc.constantFrom("", " ", "  ", "\t", " ", "\n");
const shaped = fc.tuple(gap, form, gap, brand, gap, strength, gap).map((parts) => parts.join(""));

const label = fc.oneof(anyText(60), shaped, fc.tuple(shaped, anyText(10)).map(([a, b]) => a + b));

describe("splitDrugLabel", () => {
  it("reassembles byte-for-byte into the input, for any string (Unicode and Bangla included)", () => {
    fc.assert(
      fc.property(label, (s) => {
        const { before, name, after } = splitDrugLabel(s);
        expect(before + name + after).toBe(s);
        // Index ranges of the input, in order — so the lengths add up exactly too.
        expect(before.length + name.length + after.length).toBe(s.length);
      }),
    );
  });

  it("never throws and always returns three strings", () => {
    fc.assert(
      fc.property(label, (s) => {
        const r = splitDrugLabel(s);
        expect(typeof r.before).toBe("string");
        expect(typeof r.name).toBe("string");
        expect(typeof r.after).toBe("string");
      }),
    );
  });

  it("the emphasised name carries no stray space on either side", () => {
    fc.assert(
      fc.property(label, (s) => {
        const { name } = splitDrugLabel(s);
        expect(name).toBe(name.trim());
      }),
    );
  });

  it("a label with nothing but white space has no name to emphasise", () => {
    fc.assert(
      fc.property(fc.array(gap, { maxLength: 6 }).map((g) => g.join("")), (s) => {
        expect(splitDrugLabel(s)).toEqual({ before: s, name: "", after: "" });
      }),
    );
  });
});

// "Never round, reformat, or 'normalize' an entered clinical value" — the
// shorthand parsers may EXPAND a recognised shorthand, and must hand anything
// else back exactly as typed (trimmed). Totality + the pass-through, no formula.
describe("dose / duration / food shorthand — total, and words pass through untouched", () => {
  it("never throw on any string", () => {
    fc.assert(
      fc.property(anyText(30), (s) => {
        expect(typeof parseDose(s)).toBe("string");
        expect(typeof parseDuration(s)).toBe("string");
        expect(typeof parseFood(s)).toBe("string");
        expect(typeof looksLikeMedicine(s)).toBe("boolean");
      }),
    );
  });

  it("parseDose leaves a dose that already carries a '+' exactly as typed", () => {
    fc.assert(
      fc.property(anyText(12), anyText(12), (a, b) => {
        const s = `${a}+${b}`;
        expect(parseDose(s)).toBe(s.trim());
      }),
    );
  });

  // 35e7039: "parseDose only expands pure shorthand: '2.5 ml' used to print '2+1/2'."
  // (Pinned by example in rxShorthand.test.ts; this is the same rule for any words.)
  it("parseDose never rebuilds a dose that contains anything but digits and dots", () => {
    const wordy = fc
      .tuple(fc.string({ unit: fc.constantFrom(..."0123456789."), maxLength: 6 }), fc.string({ unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz% /-"), minLength: 1, maxLength: 10 }), fc.string({ unit: fc.constantFrom(..."0123456789."), maxLength: 4 }))
      .map((p) => p.join(""))
      .filter((s) => /[^\d.\s]/.test(s));
    fc.assert(
      fc.property(wordy, (s) => {
        expect(parseDose(s)).toBe(s.trim());
      }),
    );
  });

  it("a digits-only dose keeps every digit, in order", () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: 1, maxLength: 9 }), (digits) => {
        expect(parseDose(digits).replace(/\+/g, "")).toBe(digits);
      }),
    );
  });
});
