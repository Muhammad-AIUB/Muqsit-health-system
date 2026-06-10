"use client";

import { C, font } from "@/theme";
import { MuqsitProvider, useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import Providers from "./providers/Providers";
import type { View } from "@/types";
import LoginPage from "./layout/LoginPage";
import DesktopShell from "./layout/DesktopShell";
import MobileShell from "./layout/MobileShell";

const VIEWS: View[] = ["desktop", "mobile"];

function MuqsitInner() {
  const { view, setView } = useMuqsit();
  const { user, ready } = useAuth();

  if (!ready) {
    return <div style={{ fontFamily: font, color: C.n[500], fontSize: 13, padding: 40, textAlign: "center" }}>Loading…</div>;
  }
  if (!user) return <LoginPage />;

  return (
    <div style={{ fontFamily: font, color: C.n[900] }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 24, height: 20, borderRadius: 4, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 7, fontWeight: 700 }}>MHS+</div>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Muqsit Health System</span>
        </div>
        <div style={{ display: "flex", gap: 2, background: C.n[100], borderRadius: 6, padding: 2, marginLeft: 6 }}>
          {VIEWS.map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "3px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 500, background: view === v ? "#fff" : "transparent", color: view === v ? C.n[900] : C.n[600], boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.06)" : "none", fontFamily: font }}>{v === "desktop" ? "Desktop" : "Mobile"}</button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 10, color: C.n[600], display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: C.pri[400] }} /> Synced</div>
      </div>

      {view === "desktop" && <DesktopShell />}
      {view === "mobile" && <MobileShell />}
    </div>
  );
}

export default function Muqsit() {
  return (
    <Providers>
      <MuqsitProvider>
        <MuqsitInner />
      </MuqsitProvider>
    </Providers>
  );
}
