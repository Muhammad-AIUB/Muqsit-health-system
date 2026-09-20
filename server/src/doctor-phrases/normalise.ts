/**
 * Typography-only normalisation for a free-typed clinical phrase.
 *
 * ⚕️ This is the matching key for `DoctorPhraseHabit`, and the rule it inherits
 * from `rx-habits/normalise.ts` is the one that matters most: it folds HOW the
 * doctor typed something, never WHAT they said.
 *
 * Folded (four things, and only these):
 *   1. leading and trailing whitespace
 *   2. runs of internal whitespace, to one space
 *   3. letter case
 *   4. a single trailing full stop
 *
 * Everything else is content. It must never drop a word, a number, a unit, a
 * parenthesised qualifier or any punctuation that is not that one trailing dot:
 * "Insulin as before" and "Inj. Insulin as before" are two different
 * instructions, and so are "Review after 7 days" and "Review after 15 days".
 * Folding two different instructions into one is the failure this whole file is
 * designed against — the same reason the medicine key keeps the strength.
 */
export function phraseSignature(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .trim();
}

/**
 * The shortest phrase worth remembering.
 *
 * A one- or two-character line is a stray keystroke, not an instruction, and
 * offering it back would put noise at the top of a list the doctor is meant to
 * trust.
 */
export const MIN_PHRASE_LEN = 3;

/** True when this phrase is worth learning at all. */
export function isLearnablePhrase(text: unknown): boolean {
  return phraseSignature(text).length >= MIN_PHRASE_LEN;
}

/** The two surfaces a phrase can be written on. They never share a list. */
export const PHRASE_SOURCES = ['advice', 'rxNote'] as const;
export type PhraseSource = (typeof PHRASE_SOURCES)[number];

export function isPhraseSource(v: unknown): v is PhraseSource {
  return typeof v === 'string' && (PHRASE_SOURCES as readonly string[]).includes(v);
}
