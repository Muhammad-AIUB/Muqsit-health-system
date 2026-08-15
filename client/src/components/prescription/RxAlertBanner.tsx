"use client";

import { useMemo } from "react";
import { C } from "@/theme";
import { checkRxAlerts, type RxAlertInput } from "@/lib/rxAlerts";

// ⚕️ The "MHS is suggesting" banner. Shared by the OPD prescription editor and
// the IPD order sheet so both prescribing surfaces say the same thing the same
// way — a doctor who learns to trust the alert in one place must not silently
// lose it in the other.
//
// One consistent advisory style for every rule. The source sheets carry no
// severity column, so colouring some alerts as urgent and others as routine
// would be a clinical judgement this file has no basis to make.
//
// The matching runs HERE rather than in the caller, so the error boundary in
// RxAlerts.tsx covers the computation as well as the render. When it ran in the
// caller's `useMemo` the throw happened outside the boundary, and took the whole
// prescription editor down with it. Render this through <RxAlerts>, never
// directly.
export default function RxAlertBanner({ input }: { input: RxAlertInput }) {
  const { alerts, unreadable } = useMemo(() => checkRxAlerts(input), [input]);

  if (alerts.length === 0 && unreadable === 0) return null;

  return (
    <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {alerts.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: 10, padding: "10px 13px", background: C.warn[50], border: `0.5px solid ${C.warn[100]}`, borderRadius: 10 }}>
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1.4, flexShrink: 0 }}>⚕️</span>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.55 }}>
            <span style={{ color: C.warn[800], fontWeight: 600 }}>MHS is suggesting</span>{" "}
            <span style={{ color: C.n[900] }}>{a.message}</span>
            {/* The "Because: <drug line> + <sidebar entry>" line that used to sit
                here was removed on 2026-08-16 at the physician's request: the
                advice already names the drug and the condition, so the echo was
                noise on a screen they read on every visit. `alert.evidence` is
                still computed by the matcher — nothing on screen consumes it
                today. Do not put it back as a "fix". */}
          </div>
        </div>
      ))}

      {/* Some stored value on this record could not be read as text, so the
          rules ran against an incomplete picture. Say so. Staying quiet would
          read as "no contraindication found", which is the one wrong message a
          prescribing alert must never send. */}
      {unreadable > 0 && (
        <div style={{ display: "flex", gap: 10, padding: "10px 13px", background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, borderRadius: 10 }}>
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1.4, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.55, color: C.n[900] }}>
            <span style={{ color: C.danger[800], fontWeight: 600 }}>Prescribing check was incomplete.</span>{" "}
            {unreadable === 1 ? "1 stored entry" : `${unreadable} stored entries`} on this record could not be
            read, so the contraindication rules did not see {unreadable === 1 ? "it" : "them"}. Check the
            prescription, drug history and clinical fields yourself before prescribing.
          </div>
        </div>
      )}
    </div>
  );
}
