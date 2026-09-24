// When the ℞ pad starts offering the doctor's LEARNED lines — "Your usual"
// medicine lines and "Your usual notes" (physician's request, 2026-09-25).
// At one or two letters they popped up on nearly every keystroke and matched
// too loosely to help. Spaces do not count, so a padded "n a" cannot open them.
// The medicine list is NOT gated by this; it keeps its own 2-letter start in
// hooks/useMedicineSearch.ts, because a medicine name is often short.

export const RX_SUGGEST_MIN_CHARS = 3;

export function rxSuggestReady(text: string): boolean {
  return text.replace(/\s+/g, "").length >= RX_SUGGEST_MIN_CHARS;
}
