"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { C } from "@/theme";
import Icon from "./Icon";

// The round "add" beside a field's label (Chief complaints, Investigation,
// Drug safety, Add Bulk Medicine…). Since 02/11/2026 it is drawn as the circled
// plus (`plusCircle`, physician: "pluser upore round er moto"), not a "+" in a
// bordered circle. The 20px box and the `hit-area` class (a larger touch target)
// stay; every caller names it with `aria-label`, since it has no text.
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  "aria-label": string;
  /** Off-looking (no hover) without being `disabled` — Bulk Medicine explains itself on press. */
  inactive?: boolean;
};

export default function AddCircleButton({ inactive, style, onMouseEnter, onMouseLeave, className, ...rest }: Props) {
  const base: CSSProperties = {
    width: 20, height: 20, padding: 0, borderRadius: "50%", border: "none", background: "transparent",
    color: inactive ? C.n[400] : C.pri[400], cursor: inactive ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.12s",
  };
  const shown = { ...base, ...style };
  const restColour = String(shown.color ?? "");
  const restBg = String(shown.background ?? "transparent");
  return (
    <button
      type="button"
      className={className ? `hit-area ${className}` : "hit-area"}
      {...rest}
      onMouseEnter={(e) => { if (!inactive && !rest.disabled) { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.color = C.pri[600]; } onMouseEnter?.(e); }}
      onMouseLeave={(e) => { e.currentTarget.style.background = restBg; e.currentTarget.style.color = restColour; onMouseLeave?.(e); }}
      style={shown}
    >
      <Icon name="plusCircle" size={20} />
    </button>
  );
}

/**
 * The words of an "add" button with the circled plus in front, in place of the
 * "+ " (or "＋ ") that used to begin them. The icon is decorative: the button's
 * name is its words ("Add medicine"), as a screen reader always read them.
 */
export function PlusLabel({ children, size = 14 }: { children: ReactNode; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, verticalAlign: "middle" }}>
      <Icon name="plusCircle" size={size} />
      <span>{children}</span>
    </span>
  );
}
