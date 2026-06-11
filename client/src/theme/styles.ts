import type { CSSProperties } from "react";
import { C, font } from "./index";

// Shared input/label styles reused across the prescription forms.
export const inputSm: CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: 6,
  border: `0.5px solid ${C.n[200]}`,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  background: C.n[0],
  color: C.n[900],
  fontFamily: font,
};

export const fieldLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: C.n[600],
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
  display: "block",
};
