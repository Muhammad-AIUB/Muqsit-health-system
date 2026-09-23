// BAN / EN — phonetic Bangla typing (Avro style) in the fields the physician
// named, and English everywhere else (physician's decision, 2026-09-23).
//
// A doctor on an ordinary English keyboard types the SOUND of the word —
// "khabar por" — and it becomes "খাবার পর" as they type. The rule table is
// OmicronLab's own Avro Phonetic (vendored, MPL-1.1), so a doctor who already
// types with Avro gets exactly the spelling they are used to.
//
// ⚕️ Three rules keep this from ever changing a clinical value:
//   • Only LETTERS are converted. Digits, "+", "/", "-" and a decimal point are
//     never touched: a dose typed as `1+0+1` or `0.5` stays exactly that, so the
//     dose shorthand (`101` → `1+0+1`) keeps working in BAN mode and a
//     half-tablet can never come out as Avro's "০।৫" (a sentence mark where the
//     decimal point was). Avro itself turns digits Bangla; we deliberately don't.
//   • "." becomes the dari "।" only straight after a Bangla letter — the end of a
//     Bangla sentence. After a digit it is a decimal point and stays ".".
//   • Only fields that opt in (`data-bangla="on"`) are converted. Everywhere
//     else — medicine names, search, dates, mobile numbers — BAN mode types
//     English and says so, because a medicine search or a date typed in Bangla
//     would silently find nothing.
//
// This module is pure (no DOM) so every rule above is pinned in
// banglaInput.test.ts; `BanglaTyping.tsx` wires it to the keyboard.

import avro from "@/vendor/avro-phonetic/avro-lib.js";

/** Spread onto an <input>/<textarea> to let BAN mode type Bangla into it.
 *  Everything without it types English in BAN mode (and says so). */
export const BANGLA_ATTR = { "data-bangla": "on" } as const;

/** The fields the physician opened to Bangla (2026-09-23). The ℞ pad's
 *  dose / food / duration opt in through MedicinePad's `bangla` prop. */
export const BANGLA_FIELDS: readonly string[] = ["Chief complaints", "Previous complaints", "Note", "Plan", "Advice"];

/** The keys that feed the phonetic buffer: letters plus Avro's two word-level
 *  marks, "`" (break a conjunct) and "^" (chandrabindu). Nothing else. */
export const PHONETIC_KEY = /^[a-zA-Z`^]$/;

/** One Bangla word from its roman spelling, by Avro's own rules. */
export function toBangla(roman: string): string {
  return avro.parse(roman);
}

/** The word being typed: where it starts in the value, what was typed for it,
 *  and the Bangla currently standing in its place. */
export interface WordState {
  start: number;
  roman: string;
  out: string;
}

export interface KeyResult {
  value: string;
  caret: number;
  /** null once the word is finished (or emptied by Backspace). */
  state: WordState | null;
}

// The Bengali block minus its digits (০-৯, U+09E6–U+09EF): a "." after a
// number is a decimal point in either script.
const isBanglaLetter = (ch: string | undefined): boolean =>
  !!ch && /[ঀ-৥ৰ-৿]/.test(ch);

// The tracked word is only continued if the text still says what we left
// there and the caret is at its end — a click, an arrow key or an edit made
// some other way breaks the chain, and the next letter starts a new word.
function continues(value: string, caret: number, state: WordState | null): state is WordState {
  return (
    !!state &&
    caret === state.start + state.out.length &&
    value.slice(state.start, caret) === state.out
  );
}

/**
 * What one key press does to a Bangla-enabled field.
 *
 * Returns `null` when the key is not ours to handle — the browser then types
 * it as usual (digits, space, punctuation, arrows, Enter, Tab…).
 */
export function applyBanglaKey(
  value: string,
  selStart: number,
  selEnd: number,
  key: string,
  state: WordState | null,
): KeyResult | null {
  const hasSelection = selEnd > selStart;

  if (PHONETIC_KEY.test(key)) {
    const base = hasSelection ? value.slice(0, selStart) + value.slice(selEnd) : value;
    const caret = selStart;
    const prev = !hasSelection && continues(base, caret, state) ? state : { start: caret, roman: "", out: "" };
    const roman = prev.roman + key;
    const out = toBangla(roman);
    const next = base.slice(0, prev.start) + out + base.slice(prev.start + prev.out.length);
    return { value: next, caret: prev.start + out.length, state: { start: prev.start, roman, out } };
  }

  if (key === "Backspace" && !hasSelection && continues(value, selStart, state)) {
    // Backspace takes back the last LETTER typed, not the last Bangla glyph —
    // "kha" ← leaves "kh" (খ), exactly as Avro behaves.
    const roman = state.roman.slice(0, -1);
    const out = roman ? toBangla(roman) : "";
    const next = value.slice(0, state.start) + out + value.slice(state.start + state.out.length);
    return { value: next, caret: state.start + out.length, state: roman ? { start: state.start, roman, out } : null };
  }

  if (key === "." && isBanglaLetter(value[selStart - 1]) && !hasSelection) {
    const next = value.slice(0, selStart) + "।" + value.slice(selEnd);
    return { value: next, caret: selStart + 1, state: null };
  }

  return null;
}
