"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { C } from "@/theme";
import ManageAssistantsView from "./ManageAssistantsView";
import ProfileSettingsView from "./ProfileSettingsView";
import PrescriptionSettingsView from "./PrescriptionSettingsView";

const SETTINGS_ITEMS = [
  { t: "Profile", d: "Doctor name, specialization, clinic info", i: "◉", section: "profile" as const },
  { t: "Manage your assistants", d: "Role based access control & dynamic permission", i: "⊕", section: "assistants" as const },
  { t: "Prescription settings", d: "Set up your prescription paper size, format etc", i: "⚙", section: "prescription-settings" as const },
  { t: "Prescription templates", d: "Create, edit, delete medicine templates", i: "℞" },
];

type Section = "home" | "assistants" | "profile" | "prescription-settings";

const SECTION_PATH: Record<Section, string> = {
  home: "/settings",
  assistants: "/settings/assistants",
  profile: "/settings/profile",
  "prescription-settings": "/settings/prescription-settings",
};

const sectionFromPath = (pathname: string): Section => {
  const clean = pathname.replace(/\/+$/, "");
  if (clean === "/settings/assistants") return "assistants";
  if (clean === "/settings/profile") return "profile";
  if (clean === "/settings/prescription-settings") return "prescription-settings";
  return "home";
};

export default function SettingsView() {
  // The active section mirrors the URL (/settings, /settings/assistants).
  // usePathname() is the source of truth for the real route — so a refresh
  // or deep link to /settings/assistants lands on the right section, and
  // browser back/forward (which Next reflects in usePathname) stays in sync.
  const pathname = usePathname();
  const [section, setSection] = useState<Section>(() => sectionFromPath(pathname));

  // Follow real route changes (initial load, refresh, browser nav).
  useEffect(() => {
    setSection(sectionFromPath(pathname));
  }, [pathname]);

  // In-app navigation uses a shallow history update (no remount), matching
  // the tab-switch pattern in MuqsitContext; section state changes immediately.
  const go = (next: Section) => {
    setSection(next);
    const path = SECTION_PATH[next];
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  };

  if (section === "assistants") {
    return <ManageAssistantsView onBack={() => go("home")} />;
  }
  if (section === "profile") {
    return <ProfileSettingsView onBack={() => go("home")} />;
  }
  if (section === "prescription-settings") {
    return <PrescriptionSettingsView onBack={() => go("home")} />;
  }

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>Settings</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SETTINGS_ITEMS.map((s) => (
          <div
            key={s.t}
            onClick={s.section ? () => go(s.section) : undefined}
            style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 8, background: C.n[100], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{s.i}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{s.t}</div><div style={{ fontSize: 11, color: C.n[600] }}>{s.d}</div></div>
            <span style={{ color: C.n[500], fontSize: 14 }}>→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
