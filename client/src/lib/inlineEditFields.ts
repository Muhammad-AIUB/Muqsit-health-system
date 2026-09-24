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
// correction should not cost a modal. Note and Plan joined on 2026-09-07, in
// the same decision that split the old single "Note / plan" field in two —
// the physician asked for its edit to work "like final diagnosis".
//
// ⚠️ "Plan" is ALSO the IPD clinical sheet's own label, and the IPD sheet must
// keep its popup. It does: `isInlineEditField` is read by `LeftColumn` (the OPD
// sidebar) and by `RightColumn` for Advised tests only, and `IpdDetailView`
// never passes `inlineEdit`.
//
// Widening this further is a product decision, not a tidy-up. The two safety
// rules of the in-place edit hold for every field on the list: a blanked box is
// a mis-key and keeps what the line had (removal stays a deliberate act: the
// `+` popup, or the line's own × with Undo), and the boxes are a staged copy, so nothing reaches the field
// until the edit is finished.
//
// The "Previous diagnosis" side panel (`previousItems`) is a SEPARATE opt-in
// and stays Final-diagnosis-only — it is a carry-forward picker, not an editor.
export const INLINE_EDIT_FIELDS = [
  "Chief complaints",
  "Provisional diagnosis",
  "Final diagnosis",
  "Note",
  "Plan",
  // 2026-09-25, physician: "edit system will be like chief complaints". The OPD
  // ℞ side's own list — read by RightColumn for this one label. The IPD sheet
  // names its list "Advice tests" and never passes inlineEdit.
  "Advised tests / investigation",
] as const;

export function isInlineEditField(label: string): boolean {
  return (INLINE_EDIT_FIELDS as readonly string[]).includes(label);
}
