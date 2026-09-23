"use client";

import { C } from "@/theme";

// ⚕️ "⊘ Hide" — the one control that keeps a sidebar field off the PRINTED
// prescription (physician's decision, 2026-09-21: Investigation report findings;
// extended the same day to Drug history).
//
// It is shared so the two can never drift apart: one tooltip wording, one amber,
// one pressed state. A doctor who learns what the amber ⊘ means on one field
// must be able to read it the same way on every other.
//
// What it does NOT do, anywhere it is used: remove, fade or truncate anything on
// screen. A hidden field stays fully readable in the sidebar — a line the doctor
// cannot read is a line they cannot check before they print.
export default function HideToggle({
  hidden, count, onToggle, what,
}: {
  hidden: boolean;
  /** Shown as "Hidden (N)" when the field hides individual lines. Omit for a
   *  whole-field toggle, which has nothing to count. */
  count?: number;
  onToggle: () => void;
  /** Named in the accessible label, e.g. "Drug history". */
  what: string;
}) {
  const label = hidden ? (typeof count === "number" ? `Hidden (${count})` : "Hidden") : "Hide";
  return (
    <button
      onClick={onToggle}
      // The physician's own wording, verbatim. Do not reword it: it is what
      // tells the doctor this affects the paper and not the record.
      title={hidden ? "Show again in printed prescription" : "Hide in Printed Prescription"}
      aria-pressed={hidden}
      aria-label={`${hidden ? "Show" : "Hide"} ${what} in printed prescription`}
      style={{
        fontSize: 11, lineHeight: 1.4, borderRadius: 6, padding: "1px 8px", cursor: "pointer",
        fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
        color: hidden ? C.warn[800] : C.n[600],
        background: hidden ? C.warn[100] : "transparent",
        border: `0.5px solid ${hidden ? C.warn[400] : C.n[300]}`,
        fontWeight: hidden ? 600 : 400,
      }}
    >⊘ {label}</button>
  );
}
