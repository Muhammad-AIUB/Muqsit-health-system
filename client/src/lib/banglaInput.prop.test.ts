import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PHONETIC_KEY, applyBanglaKey, type WordState } from "./banglaInput";
import { anyText, configureProps } from "@/test/fc";

// ⚕️ "Numbers are never converted. Only letters (plus Avro's ` and ^) feed the
// phonetic buffer; digits, +, /, - pass through as typed … So 1+0+1 and 0.5
// stay exactly as keyed … `.` becomes `।` only straight after a Bangla letter."
// (client/CLAUDE.md, BAN / EN). In BAN mode this code sits between the doctor's
// keyboard and the dose box; a converted digit is a different dose.
configureProps(300);

const BANGLA_DIGIT = /[০-৯]/;
const DOSE_KEYS = [..."0123456789+/-"];

/** The keyboard handler, exactly as banglaInput.test.ts models it: our keys go
 *  through applyBanglaKey, anything it declines is typed by the browser. */
function type(keys: string[], start = "") {
  let value = start;
  let caret = start.length;
  let state: WordState | null = null;
  for (const key of keys) {
    const r = applyBanglaKey(value, caret, caret, key, state);
    if (r) {
      ({ value, caret, state } = r);
    } else if (key === "Backspace") {
      if (caret > 0) { value = value.slice(0, caret - 1) + value.slice(caret); caret -= 1; }
      state = null;
    } else {
      value = value.slice(0, caret) + key + value.slice(caret);
      caret += key.length;
      state = null;
    }
  }
  return value;
}

const doseChar = fc.constantFrom(...DOSE_KEYS, ".", " ");
const letter = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`^");
const anyKey = fc.oneof(
  { weight: 4, arbitrary: letter },
  { weight: 4, arbitrary: doseChar },
  { weight: 1, arbitrary: fc.constantFrom("Backspace", ",", ":", "(", ")", "%") },
);

// Any field content, any caret, any tracked-word state — including a state
// that no longer matches the text (a click, a paste).
const fieldState = fc.tuple(anyText(12), fc.nat(14), fc.nat(14), fc.option(fc.record({ start: fc.nat(12), roman: fc.string({ unit: letter, maxLength: 5 }), out: anyText(5) })))
  .map(([value, a, b, state]) => {
    const s = Math.min(a, b, value.length), e = Math.min(Math.max(a, b), value.length);
    return { value, selStart: s, selEnd: e, state };
  });

describe("applyBanglaKey — ⚕️ a dose is never converted", () => {
  it("declines every digit and + / - in ANY field state, so the browser types it as keyed", () => {
    fc.assert(
      fc.property(fieldState, fc.constantFrom(...DOSE_KEYS), ({ value, selStart, selEnd, state }, key) => {
        expect(applyBanglaKey(value, selStart, selEnd, key, state)).toBeNull();
      }),
    );
  });

  it("only letters and Avro's two marks are phonetic keys", () => {
    for (const k of [...DOSE_KEYS, ".", " ", ",", ":", "Enter", "Tab", "Backspace", "০", "ক", "ab"]) {
      expect(PHONETIC_KEY.test(k)).toBe(false);
    }
  });

  it("a dose typed from digits, + / - . and spaces comes out exactly as keyed", () => {
    fc.assert(
      fc.property(fc.array(doseChar, { maxLength: 20 }), (keys) => {
        expect(type(keys)).toBe(keys.join(""));
      }),
    );
  });

  it("the same dose typed after Bangla words is still exactly as keyed", () => {
    fc.assert(
      fc.property(fc.array(letter, { minLength: 1, maxLength: 8 }), fc.array(fc.constantFrom(...DOSE_KEYS, "."), { minLength: 1, maxLength: 12 }).filter((d) => d[0] !== "."), (word, dose) => {
        const before = type([...word, " "]);
        expect(type([...word, " ", ...dose])).toBe(before + dose.join(""));
      }),
    );
  });

  it("in any mix of keys, the digits and + / - of the result are exactly the ones typed, in order", () => {
    const withoutBackspace = fc.array(anyKey.filter((k) => k !== "Backspace"), { maxLength: 30 });
    fc.assert(
      fc.property(withoutBackspace, (keys) => {
        const out = type(keys);
        const numeric = (s: string) => [...s].filter((ch) => DOSE_KEYS.includes(ch)).join("");
        expect(numeric(out)).toBe(numeric(keys.join("")));
      }),
    );
  });

  it("never produces a Bangla digit, whatever is typed", () => {
    fc.assert(
      fc.property(fc.array(anyKey, { maxLength: 30 }), (keys) => {
        expect(type(keys)).not.toMatch(BANGLA_DIGIT);
      }),
    );
  });

  it("a '.' straight after a digit is declined — it stays a decimal point", () => {
    fc.assert(
      fc.property(fc.array(anyKey, { maxLength: 20 }), fc.constantFrom(..."0123456789০১২৩৪৫৬৭৮৯"), (keys, digit) => {
        const value = type(keys) + digit;
        expect(applyBanglaKey(value, value.length, value.length, ".", null)).toBeNull();
      }),
    );
  });

  it("'.' becomes the dari only when the character before the caret is a Bangla letter", () => {
    fc.assert(
      fc.property(fieldState, ({ value, selStart, state }) => {
        const r = applyBanglaKey(value, selStart, selStart, ".", state);
        const prev = value[selStart - 1];
        const banglaLetter = !!prev && /[ঀ-৿]/.test(prev) && !BANGLA_DIGIT.test(prev);
        if (r) {
          expect(banglaLetter).toBe(true);
          expect(r.value).toBe(value.slice(0, selStart) + "।" + value.slice(selStart));
        } else {
          expect(banglaLetter).toBe(false);
        }
      }),
    );
  });
});

describe("applyBanglaKey — total, and it only touches the word being typed", () => {
  it("never throws for any key in any field state", () => {
    fc.assert(
      fc.property(fieldState, fc.oneof(anyKey, fc.constantFrom("Enter", "Tab", "ArrowLeft", "Escape", "Delete", ""), anyText(3)), ({ value, selStart, selEnd, state }, key) => {
        const r = applyBanglaKey(value, selStart, selEnd, key, state);
        if (r) {
          expect(typeof r.value).toBe("string");
          expect(r.caret).toBeGreaterThanOrEqual(0);
          expect(r.caret).toBeLessThanOrEqual(r.value.length);
        }
      }),
    );
  });

  it("a letter leaves everything before the word and after the caret untouched", () => {
    fc.assert(
      fc.property(anyText(10), anyText(10), letter, (head, tail, key) => {
        const r = applyBanglaKey(head + tail, head.length, head.length, key, null)!;
        expect(r).not.toBeNull();
        expect(r.value.startsWith(head)).toBe(true);
        expect(r.value.endsWith(tail)).toBe(true);
        expect(r.caret).toBe(r.value.length - tail.length);
      }),
    );
  });
});
