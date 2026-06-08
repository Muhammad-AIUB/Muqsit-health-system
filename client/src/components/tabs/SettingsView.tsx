"use client";

import { C } from "@/theme";

const SETTINGS_ITEMS = [
  { t: "Profile", d: "Doctor name, specialization, clinic info", i: "◉" },
  { t: "Assistants & RBAC", d: "Manage assistant accounts and dynamic permissions", i: "⊕" },
  { t: "Prescription templates", d: "Create, edit, delete medicine templates", i: "℞" },
  { t: "Data export", d: "Export patient data with date range filter", i: "↓" },
  { t: "Data sharing", d: "Control which data patients can access", i: "⇄" },
  { t: "Security", d: "Password, biometric lock, 2FA settings", i: "⊛" },
  { t: "Offline & sync", d: "Sync status, conflict resolution, storage", i: "◎" },
];

export default function SettingsView() {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>Settings</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SETTINGS_ITEMS.map((s) => (
          <div key={s.t} style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: C.n[100], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{s.i}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{s.t}</div><div style={{ fontSize: 11, color: C.n[600] }}>{s.d}</div></div>
            <span style={{ color: C.n[500], fontSize: 14 }}>→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
