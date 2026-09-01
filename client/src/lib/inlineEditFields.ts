// ⚕️ Which clinical sidebar lists are corrected IN PLACE.
//
// `ExpandableField`'s `inlineEdit` prop turns the ✎ Edit button beside the `+`
// into "open a box on every entry at once" instead of "open the popup". It is
// opt-in per field and this list is the whole opt-in — a field not named here
// keeps the popup flow behind that same-looking button.
//
// Final diagnosis has worked this way since the physician's decision of
// 2026-08-28. Chief complaints and Provisional diagnosis joined it on
// 2026-09-01 at the physician's request: those are the three lists a doctor
// re-reads and re-words while the patient is still in front of them, so the
// correction should not cost a modal.
//
// Widening this further is a product decision, not a tidy-up. The two safety
// rules of the in-place edit hold for every field on the list: a blanked box is
// a mis-key and keeps what the line had (removal stays a deliberate act in the
// `+` popup), and the boxes are a staged copy, so nothing reaches the field
// until the edit is finished.
//
// The "Previous diagnosis" side panel (`previousItems`) is a SEPARATE opt-in
// and stays Final-diagnosis-only — it is a carry-forward picker, not an editor.
export const INLINE_EDIT_FIELDS = [
  "Chief complaints",
  "Provisional diagnosis",
  "Final diagnosis",
] as const;

export function isInlineEditField(label: string): boolean {
  return (INLINE_EDIT_FIELDS as readonly string[]).includes(label);
}
