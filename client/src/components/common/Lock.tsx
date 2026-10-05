"use client";

import type { ReactNode } from "react";
import { C } from "@/theme";
import Icon from "@/components/common/Icon";
import { useInert } from "@/lib/inert";

// Renders its children but makes them non-interactive when `locked` — the
// assistant can SEE the section but can't click or edit it (matches the spec:
// "see the whole page but clicking won't work except granted sections"). Used
// for sections that aren't ExpandableFields (which gate themselves by label).
export default function Lock({ locked, children }: { locked: boolean; children: ReactNode }) {
  const inert = useInert<HTMLDivElement>();
  if (!locked) return <>{children}</>;
  return (
    // Keyed, and `inert` set through `useInert`: see there for how an unlocked
    // section used to come back still inert.
    <div key="lock-closed" style={{ position: "relative", opacity: 0.65 }} title="View only — you don't have access to edit this section">
      {/* `inert`, not just pointer-events: without it Tab still walks into the
          inputs and buttons inside and an assistant without the key edits a
          locked section from the keyboard. The focus handler is the fallback
          for a browser without `inert`: anything that still receives focus in
          here gives it straight back. */}
      <div ref={inert} aria-disabled="true" onFocusCapture={(e) => (e.target as HTMLElement).blur()} style={{ pointerEvents: "none", userSelect: "none" }}>{children}</div>
      <span aria-hidden style={{ position: "absolute", top: 0, right: 2, color: C.n[400], display: "flex" }}><Icon name="lock" size={12} /></span>
    </div>
  );
}
