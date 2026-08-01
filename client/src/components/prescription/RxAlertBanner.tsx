"use client";

import { C } from "@/theme";
import type { RxAlert } from "@/lib/rxAlerts";

// ⚕️ The "MHS is suggesting" banner. Shared by the OPD prescription editor and
// the IPD order sheet so both prescribing surfaces say the same thing the same
// way — a doctor who learns to trust the alert in one place must not silently
// lose it in the other.
//
// One consistent advisory style for every rule. The source sheets carry no
// severity column, so colouring some alerts as urgent and others as routine
// would be a clinical judgement this file has no basis to make.
export default function RxAlertBanner({ alerts }: { alerts: RxAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {alerts.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: 10, padding: "10px 13px", background: C.warn[50], border: `0.5px solid ${C.warn[100]}`, borderRadius: 10 }}>
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1.4, flexShrink: 0 }}>⚕️</span>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.55 }}>
            <span style={{ color: C.warn[800], fontWeight: 600 }}>MHS is suggesting</span>{" "}
            <span style={{ color: C.n[900] }}>{a.message}</span>
            {/* Why it fired. A doctor must be able to check the trigger, not
                just trust the banner. */}
            <div style={{ marginTop: 4, fontSize: 11, color: C.warn[600] }}>
              Because: {a.evidence.map((e) => `${e.text} (${e.field})`).join(" + ")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
