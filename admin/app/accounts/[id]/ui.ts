// Colours and shared styles of the account page's tabs (16/11/2026). `C` is
// hand-copied like the other two (`app/page.tsx`, `page.tsx` here): `pri` is the
// brand and anything pressable, `ok` a status that is fine — the same roles as
// the doctor app's `C` (client/src/theme/palette.ts), light values only (the admin
// console has no night mode).

import type { CSSProperties } from "react";

export const C = {
  pri: "#1A73E8",
  priDark: "#185ABC",
  priLight: "#E8F0FE",
  ok100: "#9FE1CB",
  ok400: "#1D9E75",
  okDark: "#0F6E56",
  okLight: "#E1F5EE",
  danger: "#E24B4A",
  dangerDark: "#A32D2D",
  dangerLight: "#FCEBEB",
  border: "#E3E6EA",
  n50: "#F8F9FA",
  n100: "#F1F3F4",
  n400: "#8E949A",
  n500: "#6B7075",
  n600: "#565A5F",
  n700: "#44474A",
  n800: "#303438",
  n900: "#202124",
  white: "#fff",
} as const;

export const card: CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" };
export const h2: CSSProperties = { fontSize: 15, fontWeight: 600, color: C.n900, margin: 0 };
export const note: CSSProperties = { fontSize: 12.5, color: C.n600, lineHeight: 1.55 };
export const btnPri: CSSProperties = { padding: "9px 18px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
export const btnOff: CSSProperties = { background: C.n100, color: C.n400, cursor: "not-allowed" };
export const btnGhost: CSSProperties = { padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.n900, fontSize: 12.5, fontWeight: 500, cursor: "pointer" };
export const control: CSSProperties = { minHeight: 34, padding: "0 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.n900, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" };
export const errBox: CSSProperties = { fontSize: 12.5, color: C.dangerDark, background: C.dangerLight, borderRadius: 8, padding: "8px 12px" };

/** A horizontal tab, as the doctor app's Statistics menu draws it. */
export const tabStyle = (on: boolean): CSSProperties => ({
  padding: "10px 14px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  fontSize: 13.5,
  fontWeight: on ? 600 : 400,
  color: on ? C.priDark : C.n700,
  borderBottom: `2px solid ${on ? C.pri : "transparent"}`,
  marginBottom: -1,
});
