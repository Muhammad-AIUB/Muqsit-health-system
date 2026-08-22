"use client";

import { Component, type ReactNode } from "react";
import { C, font } from "@/theme";
import { rxAlertsByLine, type RxAlert, type RxAlertInput } from "@/lib/rxAlerts";
import { useMuqsit } from "@/context/MuqsitContext";

// ⚕️ The prescribing warning, drawn against the medicine that raised it.
//
// The banner in "Notifications, Chats & Reports" sits well below the ℞ pad; by
// the time a doctor has written six medicines it is off screen. This puts the
// SAME sentence — from the same matcher, never a second copy — on the line
// itself, and `prescriptionDoc` prints it in the same place on the sheet.
//
// Same containment rules as RxAlerts.tsx, for the same reason: this renders
// INSIDE the ℞ pad, and React unmounts the whole tree on an uncaught render
// error. Losing a warning bubble is survivable; losing the editor a doctor
// prescribes through is not. So:
//   · the boundary is here, and the matching runs in a CHILD of it;
//   · the fallback SAYS the check did not run, because a doctor who sees
//     nothing reads it as "no contraindication".
export default function RxLineAlert({ input, lineIndex }: { input: RxAlertInput; lineIndex: number }) {
  return (
    <LineAlertBoundary>
      <LineAlertBody input={input} lineIndex={lineIndex} />
    </LineAlertBoundary>
  );
}

// ⚕️ The rule whose warning the doctor may set aside on the pad.
//
// The physician asked for it on entecavir — the drug they prescribe as Barcavir
// — and for that rule ONLY. It is keyed on the rule's own drug label, not on
// the brand typed into the pad, so every entecavir brand behaves the same:
// Barcavir and Entaliv are the same medicine and must not offer the doctor two
// different affordances. No other rule gets the button; widening this is a
// clinical decision, not a tidy-up.
const IGNORABLE_RULE_DRUGS = new Set(["Entecavir"]);

function LineAlertBody({ input, lineIndex }: { input: RxAlertInput; lineIndex: number }) {
  const { ignoredAlerts, ignoreAlert } = useMuqsit();
  const alerts = rxAlertsByLine(input).get(lineIndex) ?? [];
  // Ignoring hides the bubble HERE and nowhere else: the advisory in
  // "Notifications, Chats & Reports" stays up, and the visit is logged with the
  // warning either way.
  const shown = alerts.filter((a) => !ignoredAlerts.has(a.id));
  if (shown.length === 0) return null;
  return <Bubble alerts={shown} onIgnore={ignoreAlert} />;
}

/**
 * The callout itself: a red speech bubble whose tail points UP at the medicine
 * directly above it, so there is never a question of which line it belongs to.
 * Two lines of the same brand at different strengths are told apart by
 * position, which is why the matcher carries a line index rather than matching
 * back by drug text.
 */
function Bubble({ alerts, onIgnore }: { alerts: RxAlert[]; onIgnore: (id: string) => void }) {
  return (
    <div style={{ width: "100%", paddingLeft: 30, marginTop: -2, marginBottom: 6 }}>
      <div
        role="alert"
        style={{
          position: "relative",
          display: "inline-block",
          maxWidth: "min(640px, 100%)",
          background: C.n[0],
          border: `1.5px solid ${C.danger[400]}`,
          borderRadius: 10,
          padding: "7px 12px",
          fontFamily: font,
          fontSize: 12,
          lineHeight: 1.45,
          color: C.danger[800],
        }}
      >
        {/* Tail — two stacked triangles so the border reads as a continuous
            outline, matching the printed sheet's bubble. */}
        <span aria-hidden style={{ position: "absolute", top: -9, left: 16, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: `9px solid ${C.danger[400]}` }} />
        <span aria-hidden style={{ position: "absolute", top: -7, left: 17.5, width: 0, height: 0, borderLeft: "6.5px solid transparent", borderRight: "6.5px solid transparent", borderBottom: `8px solid ${C.n[0]}` }} />
        {alerts.map((a, i) => (
          <div key={a.id} style={{ marginTop: i === 0 ? 0 : 5, display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
            <span aria-hidden style={{ flexShrink: 0 }}>⚠️</span>
            <span>{a.message}</span>
            {IGNORABLE_RULE_DRUGS.has(a.drug) && (
              <button
                type="button"
                onClick={() => onIgnore(a.id)}
                title="Hide this warning for this prescription. It stays in the patient's log."
                style={{
                  flexShrink: 0, marginLeft: 2, padding: "2px 9px", borderRadius: 999,
                  border: `1px solid ${C.danger[400]}`, background: C.n[0], color: C.danger[800],
                  fontFamily: font, fontSize: 11, fontWeight: 500, cursor: "pointer", lineHeight: 1.5,
                }}
              >
                Ignore Warning
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

class LineAlertBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("[rx-line-alert] per-line prescribing check failed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Fails loud: silence here would read as "this medicine is fine".
    return (
      <div style={{ width: "100%", paddingLeft: 30, marginBottom: 6, fontSize: 11.5, color: C.danger[800], fontFamily: font }}>
        ⚠️ Prescribing check did not run for this line — no warning here means “not checked”.
      </div>
    );
  }
}
