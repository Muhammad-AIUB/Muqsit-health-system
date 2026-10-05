"use client";

import { useEffect, useState } from "react";
import { C, font } from "@/theme";
import { MuqsitProvider, useMuqsit } from "@/context/MuqsitContext";
import { useMigrateLocalData } from "@/hooks/useMigrateLocalData";
import type { View } from "@/types";
import DesktopShell from "./layout/DesktopShell";
import MobileShell from "./layout/MobileShell";
import WorkstationSwitcher from "./layout/WorkstationSwitcher";
import DeviceMirror from "./layout/DeviceMirror";

const VIEWS: View[] = ["desktop", "mobile"];

// Auth is enforced by RequireAuth at the route level (app/page.tsx) —
// this component renders for signed-in users only.
function MuqsitInner() {
  const { view, setView } = useMuqsit();
  // One-time move of any legacy localStorage data (templates, preferences,
  // drug dates) into the server, then clear the local copies.
  useMigrateLocalData();

  // Responsive: follow the actual device width. Phones (<768px) always get the
  // mobile layout — the app previously only switched via the manual toggle, so
  // real phones were served the desktop layout. We derive `effectiveView` for
  // rendering instead of mutating the shared `view` state, so device mirroring
  // (which syncs `view`) is unaffected; the toggle still previews mobile on
  // desktop. Starts false so SSR/first client render match (no hydration flash).
  const [viewportMobile, setViewportMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setViewportMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const effectiveView: View = viewportMobile ? "mobile" : view;

  return (
    <div style={{ fontFamily: font, color: C.n[900] }}>
      {/* A quiet utility strip: sync state and the layout preview. The brand is
          NOT repeated here — both shells carry it in their own header, and two
          logos stacked 40px apart read as two different products. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginBottom: 8, minHeight: 24 }}>
        <div role="status" style={{ fontSize: 11, color: C.n[600], display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: C.ok[400] }} /> Synced</div>
        {/* Manual preview toggle — only useful on larger screens; a real phone
            gets the mobile layout from its viewport, so hide it there. */}
        {!viewportMobile && (
          <div role="group" aria-label="Layout preview" style={{ display: "flex", gap: 2, background: C.n[200], borderRadius: 8, padding: 2 }}>
            {VIEWS.map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} style={{ minHeight: 22, padding: "0 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: view === v ? 600 : 500, background: view === v ? C.n[0] : "transparent", color: view === v ? C.n[900] : C.n[600], boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.08)" : "none", fontFamily: font }}>{v === "desktop" ? "Desktop" : "Mobile"}</button>
            ))}
          </div>
        )}
      </div>

      {effectiveView === "desktop" && <DesktopShell />}
      {effectiveView === "mobile" && <MobileShell preview={!viewportMobile} />}

      {/* Practice picker — auto-selects when there's one, forces a choice when many. */}
      <WorkstationSwitcher />

      {/* Real-time multi-device mirror driver (primary only) — renders nothing. */}
      <DeviceMirror />
    </div>
  );
}

export default function Muqsit() {
  return (
    <MuqsitProvider>
      <MuqsitInner />
    </MuqsitProvider>
  );
}
