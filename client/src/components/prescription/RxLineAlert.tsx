"use client";

import { Component, type ReactNode } from "react";
import { C, font } from "@/theme";
import { rxAlertsByLine, type RxAlertInput } from "@/lib/rxAlerts";

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

function LineAlertBody({ input, lineIndex }: { input: RxAlertInput; lineIndex: number }) {
  const messages = rxAlertsByLine(input).get(lineIndex) ?? [];
  if (messages.length === 0) return null;
  return <Bubble messages={messages} />;
}

/**
 * The callout itself: a red speech bubble whose tail points UP at the medicine
 * directly above it, so there is never a question of which line it belongs to.
 * Two lines of the same brand at different strengths are told apart by
 * position, which is why the matcher carries a line index rather than matching
 * back by drug text.
 */
function Bubble({ messages }: { messages: string[] }) {
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
        {messages.map((m, i) => (
          <div key={i} style={{ marginTop: i === 0 ? 0 : 5, display: "flex", gap: 7 }}>
            <span aria-hidden style={{ flexShrink: 0 }}>⚠️</span>
            <span>{m}</span>
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
