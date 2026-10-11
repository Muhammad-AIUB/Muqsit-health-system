// A caption above a box: pressing the caption puts the cursor in the box.
//
// The app writes a caption as its own element just before the box it names
// (`<label style={fieldLabel}>Bed</label><input aria-label="Bed" …/>`), and
// until 2026-10-12 nothing tied the two together: on every form, pressing
// "Mobile" or "Bed" did nothing. A screen reader was never affected — each box
// carries its name as `aria-label` — this is for the hand on the mouse or the
// thumb on a ward tablet, where the caption is as big a target as the box.
//
// Why one listener and not a `for`/`id` pair on some eighty boxes, or a
// caption that wraps its box:
//   • A caption that WRAPS forwards every click inside it to its first control.
//     That is the trap that keeps `PatientMobileLookup` out of a <label>
//     (client/CLAUDE.md): a press on its "Add New" button would land in the
//     mobile box instead.
//   • `for` on a tick box TOGGLES it. Here a caption only ever moves the
//     cursor; it never ticks, chooses or types anything.
//
// The rule, in full:
//   • only a <label> that has no control of its own (none inside it, no `for`);
//   • only the element written STRAIGHT after it — a caption names the box
//     under it, never one further along the row, and a caption over a value
//     that is merely shown (BMI, ideal body weight) moves nothing;
//   • the box itself, or the first one inside that element (a date box and the
//     mobile lookup wrap theirs);
//   • never a box that cannot be typed in — disabled, locked by a fieldset,
//     behind the patient gate (`inert`) — nor a file picker or a hidden value.

const BOX = 'input:not([type="hidden"]):not([type="file"]), select, textarea, [contenteditable="true"]';
const OWN = "input, select, textarea, button, [contenteditable]";

export function controlAfterCaption(label: HTMLLabelElement): HTMLElement | null {
  if (label.htmlFor || label.querySelector(OWN)) return null;
  const next = label.nextElementSibling;
  if (!(next instanceof HTMLElement)) return null;
  const box = next.matches(BOX) ? next : next.querySelector<HTMLElement>(BOX);
  if (!box) return null;
  if (box.matches(":disabled") || box.closest("fieldset[disabled], [inert]")) return null;
  return box;
}

/** Mounted once, in `Providers`. Returns the function that takes it off. */
export function installCaptionFocus(doc: Document = document): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const label = target.closest("label");
    if (label instanceof HTMLLabelElement) controlAfterCaption(label)?.focus();
  };
  doc.addEventListener("click", onClick);
  return () => doc.removeEventListener("click", onClick);
}
