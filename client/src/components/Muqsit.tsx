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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 24, height: 20, borderRadius: 4, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 7, fontWeight: 700 }}>MHS+</div>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Muqsit Health System</span>
        </div>
        {/* Manual preview toggle — only useful on larger screens; a real phone
            gets the mobile layout from its viewport, so hide it there. */}
        {!viewportMobile && (
          <div style={{ display: "flex", gap: 2, background: C.n[100], borderRadius: 6, padding: 2, marginLeft: 6 }}>
            {VIEWS.map((v) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "3px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 500, background: view === v ? "#fff" : "transparent", color: view === v ? C.n[900] : C.n[600], boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.06)" : "none", fontFamily: font }}>{v === "desktop" ? "Desktop" : "Mobile"}</button>
            ))}
          </div>
        )}
        <div style={{ marginLeft: "auto", fontSize: 10, color: C.n[600], display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: C.pri[400] }} /> Synced</div>
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
