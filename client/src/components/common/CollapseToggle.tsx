"use client";

// The arrow in front of a section's title on "Patient's Prescriptions &
// reports" (physician's sheet 07/11/2026, item 1): every section starts
// collapsed, one press on the arrow opens it, a second press closes it. Only
// the section's BODY is hidden; its buttons (Download, Add, Edit …) stay where
// they are, as drawn on the sheet.

import { useCallback, useState } from "react";
import { C } from "@/theme";
import Icon from "@/components/common/Icon";

export function CollapseToggle({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
      title={open ? "Collapse" : "Expand"}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, padding: 0,
        marginRight: 6, flexShrink: 0, border: "none", background: "none", borderRadius: 6, cursor: "pointer", color: C.n[700],
      }}
    >
      <Icon name="chevronRight" size={18} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .12s ease" }} />
    </button>
  );
}

/** Which sections are open. Everything starts closed. */
export function useOpenSections() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = useCallback((key: string) => setOpen((o) => ({ ...o, [key]: !o[key] })), []);
  return { isOpen: (key: string) => Boolean(open[key]), toggle };
}
