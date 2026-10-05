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

// What any of the three looks like while it cannot be pressed. Spread it LAST.
export const btnDisabled: CSSProperties = {
  border: `1px solid ${C.n[200]}`, background: C.n[100], color: C.n[400], cursor: "not-allowed",
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
