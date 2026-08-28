"use client";

import { Component, type ReactNode } from "react";
import { C, font } from "@/theme";
import { rxAlertsByLine, type RxAlert, type RxAlertInput } from "@/lib/rxAlerts";
import { useMuqsit } from "@/context/MuqsitContext";

// ⚕️ The prescribing warning on the ℞ pad: ONE blinking sign, then the advice
// under the medicine it belongs to.
//
// Three shapes in three days, all the physician's:
//   2026-08-17  a red bubble under the medicine, shown the moment a rule fired
//   2026-08-28  the bubble gone; one blinking sign, advice in a floating panel
//   2026-08-28  the panel dropped — it moved around the screen on a scroll.
// What stands: the pad is a writing surface, so a single sign lights up in the
// toolbar the moment ANY warned medicine is written — one sign however many
// warnings there are — and pressing it reveals each warning **in the flow,
// directly under its own medicine line**, where it scrolls with that line and
// can never be read against the wrong drug.
//
// Nothing is hidden by the sign. The "MHS is suggesting" banner in
// Notifications, Chats & Reports still lists every alert in full at all times,
// and every warning a visit raised is still written to the activity feed on
// save, ignored or not.
//
// Same containment rules as RxAlerts.tsx, for the same reason: this renders
// INSIDE the ℞ pad, and React unmounts the whole tree on an uncaught render
// error. Losing a warning is survivable; losing the editor a doctor prescribes
// through is not. So the boundary is here, the matching runs in a CHILD of it,
// and the fallback SAYS the check did not run — a doctor who sees nothing
// reads it as "no contraindication".

// ⚕️ The rule whose warning the doctor may set aside on the pad.
//
// The physician asked for it on entecavir — the drug they prescribe as Barcavir
// — and for that rule ONLY. It is keyed on the rule's own drug label, not on
// the brand typed into the pad, so every entecavir brand behaves the same:
// Barcavir and Entaliv are the same medicine and must not offer the doctor two
// different affordances. No other rule gets the button; widening this is a
// clinical decision, not a tidy-up.
const IGNORABLE_RULE_DRUGS = new Set(["Entecavir"]);

/** Every ℞ line that is warning about something, and what about. */
export function padAlerts(input: RxAlertInput, ignored: ReadonlySet<string>): { rxIndex: number; alerts: RxAlert[] }[] {
  const out: { rxIndex: number; alerts: RxAlert[] }[] = [];
  for (const [rxIndex, alerts] of [...rxAlertsByLine(input).entries()].sort((a, b) => a[0] - b[0])) {
    const shown = alerts.filter((a) => !ignored.has(a.id));
    if (shown.length) out.push({ rxIndex, alerts: shown });
  }
  return out;
}

// ── The sign ────────────────────────────────────────────────

export default function RxAlertSign(props: { input: RxAlertInput; open: boolean; onToggle: () => void }) {
  return (
    <PadAlertBoundary inline>
      <SignBody {...props} />
    </PadAlertBoundary>
  );
}

function SignBody({ input, open, onToggle }: { input: RxAlertInput; open: boolean; onToggle: () => void }) {
  const { ignoredAlerts } = useMuqsit();
  const lines = padAlerts(input, ignoredAlerts);
  const count = lines.reduce((n, l) => n + l.alerts.length, 0);
  if (count === 0) return null;

  const label = `${count} prescribing warning${count === 1 ? "" : "s"} — press to ${open ? "hide" : "read"}`;
  return (
    <>
      {/* A small solid dot rather than a thin outlined ring: at this size an
          outline and a hairline "!" read as a stray character, while a filled
          disc reads as a signal. The halo does the attracting, so the dot never
          fades below 0.4 — a warning that blinks all the way out is a warning a
          doctor can look straight past. Both stop under reduced motion; the dot
          itself stays red and visible either way. */}
      <style>{`
        @keyframes mhs-rx-alert-blink { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes mhs-rx-alert-halo {
          0% { box-shadow: 0 0 0 0 rgba(226,75,74,0.5) }
          70%, 100% { box-shadow: 0 0 0 7px rgba(226,75,74,0) }
        }
        .mhs-rx-alert-sign {
          animation: mhs-rx-alert-blink 1.3s ease-in-out infinite,
                     mhs-rx-alert-halo 1.3s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .mhs-rx-alert-sign { animation: none } }
      `}</style>
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        aria-expanded={open}
        title={label}
        // 24px of button around a 15px dot: small to the eye, still a fingertip
        // target on a phone.
        style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0, padding: 0,
          border: "none", background: open ? C.danger[50] : "transparent",
          cursor: "pointer", fontFamily: font,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span
          aria-hidden
          className={open ? undefined : "mhs-rx-alert-sign"}
          style={{
            width: 15, height: 15, borderRadius: "50%",
            background: open ? C.danger[800] : C.danger[400], color: C.n[0],
            fontSize: 10.5, fontWeight: 700, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >!</span>
      </button>
    </>
  );
}

// ── The warning itself, under its medicine ──────────────────

export function RxLineWarning({ input, lineIndex }: { input: RxAlertInput; lineIndex: number }) {
  return (
    <PadAlertBoundary>
      <LineWarningBody input={input} lineIndex={lineIndex} />
    </PadAlertBoundary>
  );
}

function LineWarningBody({ input, lineIndex }: { input: RxAlertInput; lineIndex: number }) {
  const { ignoredAlerts, ignoreAlert } = useMuqsit();
  // Ignoring puts this warning out and nothing else: the advisory in
  // "Notifications, Chats & Reports" stays up, and the visit is logged with the
  // warning either way.
  const shown = (rxAlertsByLine(input).get(lineIndex) ?? []).filter((a) => !ignoredAlerts.has(a.id));
  if (shown.length === 0) return null;
  return <Bubble alerts={shown} onIgnore={ignoreAlert} />;
}

/**
 * A red speech bubble whose tail points UP at the medicine directly above it,
 * so there is never a question of which line it belongs to. It sits in the
 * flow, not over it: a floating panel moved around the screen whenever the pad
 * or the page scrolled, and advice that drifts away from its drug is advice
 * that can be read against the wrong one.
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
            outline. */}
        <span aria-hidden style={{ position: "absolute", top: -9, left: 16, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: `9px solid ${C.danger[400]}` }} />
        <span aria-hidden style={{ position: "absolute", top: -7, left: 17.5, width: 0, height: 0, borderLeft: "6.5px solid transparent", borderRight: "6.5px solid transparent", borderBottom: `8px solid ${C.n[0]}` }} />
        {alerts.map((a, i) => (
          <div key={a.id} style={{ marginTop: i === 0 ? 0 : 6, display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
            <span aria-hidden style={{ flexShrink: 0 }}>⚠️</span>
            {/* pre-line: a message can be a dosing table (entecavir + CKD), and
                its line breaks are the table. See data/rxAlerts.ts. */}
            <span style={{ whiteSpace: "pre-line" }}>{a.message}</span>
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

class PadAlertBoundary extends Component<{ children: ReactNode; inline?: boolean }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("[rx-pad-alerts] prescribing check failed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Fails loud: silence here would read as "these medicines are fine".
    const text = "⚠️ Prescribing check did not run — no warning here means “not checked”.";
    if (this.props.inline) {
      return <span style={{ fontSize: 11.5, color: C.danger[800], fontFamily: font }}>{text}</span>;
    }
    return (
      <div style={{ width: "100%", paddingLeft: 30, marginBottom: 6, fontSize: 11.5, color: C.danger[800], fontFamily: font }}>
        {text}
      </div>
    );
  }
}
