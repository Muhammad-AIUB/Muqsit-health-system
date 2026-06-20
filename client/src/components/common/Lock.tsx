"use client";

import type { ReactNode } from "react";
import { C } from "@/theme";

// Renders its children but makes them non-interactive when `locked` — the
// assistant can SEE the section but can't click or edit it (matches the spec:
// "see the whole page but clicking won't work except granted sections"). Used
// for sections that aren't ExpandableFields (which gate themselves by label).
export default function Lock({ locked, children }: { locked: boolean; children: ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div style={{ position: "relative", opacity: 0.65 }} title="View only — you don't have access to edit this section">
      <div style={{ pointerEvents: "none", userSelect: "none" }}>{children}</div>
      <span style={{ position: "absolute", top: 0, right: 2, fontSize: 11, color: C.n[400] }}>🔒</span>
    </div>
  );
}
