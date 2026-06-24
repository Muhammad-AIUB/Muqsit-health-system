"use client";

import type { ReactNode } from "react";

// 3.docx: nothing can be written on the prescription until a patient is chosen
// (selected from the mobile-lookup suggestions, or created via Add New). While
// closed, the clinical + Rx area is shown but blurred and non-interactive — no
// prompt card; the mobile field above is the obvious starting point.
export default function PatientGate({ open, children }: { open: boolean; children: ReactNode }) {
  if (open) return <>{children}</>;
  return (
    <div style={{ pointerEvents: "none", userSelect: "none", filter: "blur(2px)", opacity: 0.5 }}>{children}</div>
  );
}
