"use client";

import { Component, type ReactNode } from "react";
import { C } from "@/theme";
import RxAlertBanner from "./RxAlertBanner";
import type { RxAlertInput } from "@/lib/rxAlerts";

// ⚕️ The prescribing advisory, with its blast radius contained.
//
// This is the ONLY component the prescribing screens should render — the raw
// banner is deliberately not used directly at any call site, so the guard below
// cannot be forgotten when a third prescribing surface is added.
//
// Why a boundary at all when `checkRxAlerts` is written to be total: this
// renders INSIDE the prescription editor and the IPD order sheet. React unmounts
// the whole tree on an uncaught render error, so one bad stored value used to
// take out the entire screen a doctor prescribes through — the page went white
// with "Application error: a client-side exception has occurred" and no
// prescription could be written at all. Losing the advisory is survivable;
// losing the editor is not. Rules will keep being added to this feature, so the
// guard has to outlive the specific bug that prompted it.
//
// The matching runs inside RxAlertBanner, a CHILD of the boundary — not here.
// An error thrown in this component's own render would be outside the boundary
// it is rendering, and would blank the page exactly as before.
export default function RxAlerts({ input }: { input: RxAlertInput }) {
  return (
    <RxAlertErrorBoundary>
      <RxAlertBanner input={input} />
    </RxAlertErrorBoundary>
  );
}

// Fails LOUD, not silent. A doctor who sees nothing here would reasonably read
// it as "no contraindication", and a prescribing alert that quietly stops
// checking is worse than one that was never built.
class RxAlertErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Keep the detail reachable in the browser console. The doctor gets the
    // plain-language notice below; whoever debugs this needs the stack.
    console.error("[rx-alerts] prescribing alert check failed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ display: "flex", gap: 10, padding: "10px 13px", marginBottom: 10, background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, borderRadius: 10 }}>
        <span aria-hidden style={{ fontSize: 13, lineHeight: 1.4, flexShrink: 0 }}>⚠️</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.55, color: C.n[900] }}>
          <span style={{ color: C.danger[800], fontWeight: 600 }}>Prescribing alerts are unavailable.</span>{" "}
          The contraindication check could not run on this record, so no alert here means
          &ldquo;not checked&rdquo;, not &ldquo;nothing found&rdquo;. Everything else on this page still works.
        </div>
      </div>
    );
  }
}
