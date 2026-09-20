// ⚕️ Which investigation findings reach the PRINTED prescription.
//
// Two separate reasons a stored finding never prints, and they must not be
// confused with each other:
//
//  1. **It was never printable.** An `[image attached]` marker is a pointer to
//     an uploaded report, not a result, and a `dd/mm/yyyy:Report N` entry is a
//     staging row from the report pool. Neither has ever printed; both are
//     filtered here so the rule lives in one place instead of inline in
//     `PrescriptionView`.
//  2. **The doctor hid it** (physician's decision, 2026-09-21). The ⊘ Hide
//     control in `InvestigationFindingsField` marks findings that must not
//     appear on the paper the patient carries away.
//
// The hide is a decision about the DOCUMENT, never about the record:
//  • the finding stays in `Prescription.investigation` and stays on screen, in
//    full — it is marked, never removed, dimmed or truncated;
//  • the mark is keyed by the EXACT stored string, so it can only ever suppress
//    the one line the doctor ticked;
//  • it lives in the visit's draft, so it survives a reload and a patient switch
//    and lasts until the doctor unhides it — and a new visit, whose findings
//    list is empty, starts with nothing hidden.
//
// The printed sheet and the snapshot image kept in the patient's record are
// built from the same HTML, so they can never disagree about what was handed
// over.

/** An uploaded report's marker line — a pointer to an image, not a result. */
const IMAGE_ATTACHED = "[image attached]";
/** A report-pool staging row: `dd/mm/yyyy:Report 3` with or without a value. */
const POOL_ENTRY_RE = /^\d{2}\/\d{2}\/\d{4}:Report \d+(:|$)/i;

/** True when the printed sheet would ever carry this stored finding. */
export function isPrintableFinding(item: unknown): item is string {
  if (typeof item !== "string") return false;
  const s = item.trim();
  if (!s) return false;
  if (s.includes(IMAGE_ATTACHED)) return false;
  return !POOL_ENTRY_RE.test(s);
}

/**
 * The findings the printed prescription shows: everything printable, minus what
 * the doctor hid. Matching is on the exact stored string — a mark can never
 * suppress a line other than the one it was put on.
 */
export function printableInvestigation(items: string[], hidden: string[] = []): string[] {
  const off = new Set((hidden ?? []).filter((h): h is string => typeof h === "string"));
  return (items ?? []).filter((it) => isPrintableFinding(it) && !off.has(it));
}

/** Every printable finding — what the ⊘ Hide master switch marks in one press. */
export function allPrintable(items: string[]): string[] {
  return (items ?? []).filter(isPrintableFinding);
}

/** Add or remove one finding's mark. A line that never prints is not markable. */
export function toggleHidden(hidden: string[], item: string): string[] {
  if (!isPrintableFinding(item)) return hidden ?? [];
  const list = hidden ?? [];
  return list.includes(item) ? list.filter((h) => h !== item) : [...list, item];
}

/**
 * Drop marks whose finding is no longer in the list.
 *
 * ⚕️ Without this a mark would outlive the line it was put on, and a finding
 * re-added later — same words, different clinical moment — would come back
 * already hidden, with nothing on screen to say why.
 */
export function pruneHidden(hidden: string[], items: string[]): string[] {
  const live = new Set(allPrintable(items));
  return (hidden ?? []).filter((h) => live.has(h));
}
