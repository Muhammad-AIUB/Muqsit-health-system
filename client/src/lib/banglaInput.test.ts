import { describe, expect, it } from "vitest";
import { applyBanglaKey, toBangla, type WordState } from "./banglaInput";

// Type a string key by key into a field, the way the keyboard handler does:
// our keys go through applyBanglaKey, anything it declines is typed as-is.
function type(keys: string[], start = ""): string {
  let value = start;
  let caret = start.length;
  let state: WordState | null = null;
  for (const key of keys) {
    const r = applyBanglaKey(value, caret, caret, key, state);
    if (r) {
      value = r.value;
      caret = r.caret;
      state = r.state;
    } else if (key === "Backspace") {
      value = value.slice(0, caret - 1) + value.slice(caret);
      caret -= 1;
      state = null;
    } else {
      value = value.slice(0, caret) + key + value.slice(caret);
      caret += key.length;
      state = null;
    }
  }
  return value;
}
const chars = (s: string) => s.split("");

describe("toBangla — Avro's own spellings", () => {
  it.each([
    ["ami", "আমি"],
    ["amar", "আমার"],
    ["bangla", "বাংলা"],
    ["khabar", "খাবার"],
    ["por", "পর"],
    ["din", "দিন"],
    ["ghumanOr", "ঘুমানোর"],
    ["age", "আগে"],
  ])("%s → %s", (roman, bangla) => {
    expect(toBangla(roman)).toBe(bangla);
  });
});

describe("applyBanglaKey — typing", () => {
  it("converts a word live, letter by letter", () => {
    expect(type(chars("khabar"))).toBe("খাবার");
  });

  it("converts each word on its own; the space is typed as-is", () => {
    expect(type(chars("khabar por"))).toBe("খাবার পর");
  });

  it("re-reads the whole word as it grows, so a later letter can change an earlier glyph", () => {
    expect(type(chars("k"))).toBe("ক");
    expect(type(chars("kh"))).toBe("খ");
  });

  it("appends after text already in the field", () => {
    expect(type(chars(" din"), "7")).toBe("7 দিন");
  });
});

describe("applyBanglaKey — ⚕️ numbers are never touched", () => {
  it("leaves a dose exactly as typed", () => {
    expect(type(chars("1+0+1"))).toBe("1+0+1");
    expect(type(chars("1/2+0+1/2"))).toBe("1/2+0+1/2");
  });

  it("keeps a decimal point a decimal point", () => {
    expect(type(chars("0.5"))).toBe("0.5");
    expect(type(chars("2.5 ml"))).toBe("2.5 ম্ল");
  });

  it("declines digits, so the dose shorthand still sees 101", () => {
    for (const d of chars("0123456789+/-")) {
      expect(applyBanglaKey("", 0, 0, d, null)).toBeNull();
    }
  });

  it("turns '.' into the dari only after a Bangla letter", () => {
    expect(type(chars("khabar por."))).toBe("খাবার পর।");
    expect(type(chars("7."))).toBe("7.");
    expect(type(chars("."), "৭")).toBe("৭.");
  });
});

describe("applyBanglaKey — editing", () => {
  it("Backspace takes back the last letter typed and re-reads the word", () => {
    expect(type([...chars("kha"), "Backspace"])).toBe("খ");
    expect(type([...chars("k"), "Backspace"])).toBe("");
  });

  it("Backspace after the word is finished deletes one character normally", () => {
    expect(applyBanglaKey("পর ", 3, 3, "Backspace", null)).toBeNull();
  });

  it("typing over a selection replaces it", () => {
    const r = applyBanglaKey("abc খাবার", 0, 3, "d", null);
    expect(r?.value).toBe("দ খাবার");
    expect(r?.caret).toBe(1);
  });

  it("starts a new word when the caret has moved away from the tracked one", () => {
    const state: WordState = { start: 0, roman: "por", out: "পর" };
    // Caret moved to the end of "পর খাবার" (not the end of the tracked word).
    const r = applyBanglaKey("পর খাবার", 8, 8, "e", state);
    expect(r?.value).toBe("পর খাবারএ");
  });

  it("starts a new word when the text under the tracked word was changed another way", () => {
    const state: WordState = { start: 0, roman: "por", out: "পর" };
    const r = applyBanglaKey("XY", 2, 2, "a", state);
    expect(r?.value).toBe("XYআ");
  });

  it("declines keys it does not own", () => {
    for (const k of ["Enter", "Tab", " ", "ArrowLeft", ",", ":", "Escape"]) {
      expect(applyBanglaKey("পর", 2, 2, k, { start: 0, roman: "por", out: "পর" })).toBeNull();
    }
  });
});
