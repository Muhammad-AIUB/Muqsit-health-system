"use client";

import type { ReactNode } from "react";
import { useInert } from "@/lib/inert";

// 3.docx: nothing can be written on the prescription until a patient is chosen
// (selected from the mobile-lookup suggestions, or created via Add New). While
// closed, the clinical + Rx area is shown but blurred and non-interactive — no
// prompt card; the mobile field above is the obvious starting point.
//
// ⚕️ Closed means closed to the keyboard too. Until 2026-10-06 it was only
// `pointer-events: none`, which stops a mouse: Tab from the mobile box walked
// into the blurred editor, and whatever was typed landed in the ℞ pad with no
// patient chosen (DEFECT-E2, e2e/tests/prescription.spec.ts). `inert` takes the
// whole area out of the tab order and away from assistive technology. The focus
// handler is the fallback for a browser without it: anything in here that still
// receives focus gives it straight back. Same as `Lock`.
//
// ⚕️ And open means open. See `useInert` for why the attribute needs taking off
// by hand, and why the wrapper carries a `key`: without both, the editor came
// back from behind the gate still inert — a patient chosen and nothing could be
// typed.
export default function PatientGate({ open, children }: { open: boolean; children: ReactNode }) {
  const inert = useInert<HTMLDivElement>();
  if (open) return <>{children}</>;
  return (
    <div
      key="patient-gate-closed"
      ref={inert}
      aria-disabled="true"
      onFocusCapture={(e) => (e.target as HTMLElement).blur()}
      style={{ pointerEvents: "none", userSelect: "none", filter: "blur(2px)", opacity: 0.5 }}
    >
      {children}
    </div>
  );
}
