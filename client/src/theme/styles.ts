import type { CSSProperties } from "react";
import { C, font } from "./index";

// Shared input/label styles reused across the prescription forms.
export const inputSm: CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${C.n[300]}`,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  background: C.n[0],
  color: C.n[900],
  fontFamily: font,
};

// A field that sits in a row with an `md` button, at the same height.
export const inputMd: CSSProperties = { ...inputSm, minHeight: 36, padding: "0 12px", borderRadius: 8 };

// ── Surfaces and headings ─────────────────────────────────────
// The veil behind a popup. One value — eleven popups used eight different
// greys, so the page behind looked a different distance away each time.
export const scrim = "rgba(32,33,36,0.45)";

// How far something stands off the page. Three heights and one light: 27
// places had written 21 different shadows, so two popups side by side looked
// lit from two rooms. Tinted with the neutral ink, not pure black, so a shadow
// on the cool grey page does not go muddy.
//   shadowCard   — a surface resting on the page (the app shell, an Undo bar)
//   shadowMenu   — a list hung from a field (medicine list, patient lookup, account menu)
//   shadowDialog — a popup standing over the veil
export const shadowCard = "0 1px 2px rgba(60,64,67,0.06), 0 2px 8px rgba(60,64,67,0.05)";
export const shadowMenu = "0 1px 3px rgba(32,33,36,0.10), 0 8px 24px rgba(32,33,36,0.16)";
export const shadowDialog = "0 2px 6px rgba(32,33,36,0.10), 0 16px 44px rgba(32,33,36,0.22)";

// The name of the screen you are on ("OPD queue management", "Settings").
// It was 16px/500, lighter than the 13px/600 card headings beneath it.
export const pageTitle: CSSProperties = { fontSize: 18, fontWeight: 600, color: C.n[900], letterSpacing: "-0.01em", lineHeight: 1.3 };

// The name of a popup. They ran from 14px/500 to 16px/700.
export const dialogTitle: CSSProperties = { fontSize: 16, fontWeight: 600, color: C.n[900], lineHeight: 1.3 };

// ── Buttons ───────────────────────────────────────────────────
// One scale for the whole app, so the same action is the same size on every
// screen (the primary button alone had 16 hand-written paddings). Height comes
// from `minHeight`, not padding, so a label's font can never change it.
//   sm — a button inside a list row or a panel's toolbar (Open, Edit, Prescribe)
//   md — the main action of a screen, a form or a dialog (Save, Done, Admit)
//   lg — the one action a whole page exists for (Save & print, Create account)
// `body { zoom: 1.12 }` applies on top: ~34px, ~40px and ~47px on screen.
export type BtnSize = "sm" | "md" | "lg";

const BTN_SIZE: Record<BtnSize, CSSProperties> = {
  sm: { minHeight: 30, padding: "0 12px", fontSize: 12 },
  md: { minHeight: 36, padding: "0 16px", fontSize: 13 },
  lg: { minHeight: 42, padding: "0 20px", fontSize: 14 },
};

const btnBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 8,
  fontWeight: 500,
  fontFamily: font,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

// Filled: the ONE main action in a view.
export const btnPrimary = (size: BtnSize = "md"): CSSProperties => ({
  ...btnBase, ...BTN_SIZE[size], border: `1px solid ${C.pri[400]}`, background: C.pri[400], color: C.n[0],
});

// Outlined on white: every other action.
export const btnSecondary = (size: BtnSize = "md"): CSSProperties => ({
  ...btnBase, ...BTN_SIZE[size], border: `1px solid ${C.n[300]}`, background: C.n[0], color: C.n[800],
});

// Tinted: a secondary action that should still read as "ours" (Save draft).
export const btnTonal = (size: BtnSize = "md"): CSSProperties => ({
  ...btnBase, ...BTN_SIZE[size], border: `1px solid ${C.pri[100]}`, background: C.pri[50], color: C.pri[600],
});

// Filled red: the button that takes something away, and only where the doctor
// is being asked to confirm it (see `confirmAction`). A row's own "Remove" stays
// outlined — a column of red buttons down a list is an alarm nobody reads.
export const btnDanger = (size: BtnSize = "md"): CSSProperties => ({
  ...btnBase, ...BTN_SIZE[size], border: `1px solid ${C.danger[800]}`, background: C.danger[800], color: C.n[0],
});

// What any of the four looks like while it cannot be pressed. Spread it LAST.
export const btnDisabled: CSSProperties = {
  border: `1px solid ${C.n[200]}`, background: C.n[100], color: C.n[400], cursor: "not-allowed",
};

// The × in the corner of a popup. There were two of them — a boxed one and a
// bare glyph with no edge — so the same control looked different from one
// popup to the next, and the bare one was an 18px character to hit. The boxed
// one also had no `flexShrink: 0`: beside a long subtitle on a phone it was
// squeezed to a sliver 12px wide.
export const btnClose: CSSProperties = {
  width: 30, height: 30, padding: 0, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: 8, border: `1px solid ${C.n[200]}`, background: C.n[0], color: C.n[600],
  fontSize: 17, lineHeight: 1, fontFamily: font, cursor: "pointer",
};

export const fieldLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: C.n[600],
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
  // Reserve a uniform two-line height with the text pinned to the bottom, so
  // short labels and ones that wrap (e.g. "Total monthly approximate cost") all
  // align — keeping every input on the same baseline.
  display: "flex",
  alignItems: "flex-end",
  minHeight: 26,
  lineHeight: 1.2,
};
