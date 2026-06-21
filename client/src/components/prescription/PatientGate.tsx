"use client";

import type { ReactNode } from "react";
import { C, font } from "@/theme";

// 3.docx: nothing can be written on the prescription until a patient is chosen
// (selected from the mobile-lookup suggestions, or created via Add New). While
// closed, the clinical + Rx area is shown but blurred and non-interactive, with
// a prompt pointing the doctor back to the mobile field.
export default function PatientGate({ open, children }: { open: boolean; children: ReactNode }) {
  if (open) return <>{children}</>;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ pointerEvents: "none", userSelect: "none", filter: "blur(2px)", opacity: 0.5 }}>{children}</div>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 48 }}>
        <div
          style={{
            background: C.n[0],
            border: `1px solid ${C.pri[100]}`,
            borderRadius: 12,
            padding: "16px 22px",
            maxWidth: 380,
            textAlign: "center",
            boxShadow: "0 8px 28px rgba(15,110,86,0.12)",
            fontFamily: font,
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 6 }}>📱</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.n[900], marginBottom: 4 }}>Enter a mobile number to begin</div>
          <div style={{ fontSize: 12, color: C.n[600], lineHeight: 1.5 }}>
            Type the patient&apos;s mobile number above, then pick them from the suggestions — or add a new patient. The prescription unlocks once a patient is selected.
          </div>
        </div>
      </div>
    </div>
  );
}
