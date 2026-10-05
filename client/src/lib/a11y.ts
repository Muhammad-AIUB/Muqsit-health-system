import type { KeyboardEvent } from "react";

// Keyboard access for the places where a row, a card or a word is clickable
// but is not a <button>. Until 2026-10-05 nothing in the app set a `tabIndex`,
// so 26 of these could be used with a mouse and not at all with a keyboard:
// the Settings rows, template categories, an attached report, "Resend code".
//
// Spread it beside the element's own onClick — it calls that onClick, so the
// handler is written once:
//
//   <div onClick={() => go(section)} {...pressable()}>
//
// Pass `false` while the element cannot be pressed (a "Coming soon" row). It
// then says so to a screen reader and stays OUT of the tab order: a stop that
// does nothing is worse than no stop.
export const pressable = (enabled: boolean = true) =>
  enabled
    ? ({ role: "button", tabIndex: 0, onKeyDown: pressOnKey } as const)
    : ({ "aria-disabled": true } as const);

export function pressOnKey(e: KeyboardEvent<HTMLElement>) {
  // A key typed in a field INSIDE the element is that field's business —
  // without this, a space typed into a note box in a row would press the row.
  if (e.target !== e.currentTarget) return;
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault(); // Space would otherwise scroll the page
  e.currentTarget.click();
}
