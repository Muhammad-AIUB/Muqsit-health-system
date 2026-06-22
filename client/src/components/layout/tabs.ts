import type { TabId } from "@/types";

export interface TabDef {
  id: TabId;
  label: string;
  icon: string;
  // Visible in the nav but greyed out and non-clickable (e.g. a feature that's
  // only available on a higher account tier, or temporarily switched off).
  disabled?: boolean;
}

export const TABS: TabDef[] = [
  { id: "prescription", label: "Prescription", icon: "℞" },
  { id: "opd", label: "OPD", icon: "▤" },
  { id: "ipd", label: "IPD", icon: "▥" },
  { id: "patients", label: "Patients", icon: "◉" },
  { id: "message", label: "Supervised", icon: "◈" },
  { id: "research", label: "Research companion", icon: "🔬", disabled: true },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export const MOBILE_TABS: TabDef[] = [
  { id: "prescription", label: "Rx", icon: "℞" },
  { id: "opd", label: "OPD", icon: "▤" },
  { id: "ipd", label: "IPD", icon: "▥" },
  { id: "message", label: "Supervised", icon: "◈" },
  { id: "research", label: "Research", icon: "🔬", disabled: true },
  { id: "settings", label: "More", icon: "⋯" },
];

// ── URL routing for tabs ──────────────────────────────────────
// Every in-app tab has a real URL so refresh, deep links and the browser
// back/forward buttons all work.
export const TAB_PATHS: Record<TabId, string> = {
  prescription: "/prescription",
  opd: "/opd",
  ipd: "/ipd",
  patients: "/patients",
  message: "/message",
  research: "/research",
  settings: "/settings",
  "pt-settings": "/patient-settings",
  idsp: "/health-monitoring",
  "pt-records": "/patient-records",
};

const PATH_TO_TAB = new Map<string, TabId>(
  (Object.entries(TAB_PATHS) as [TabId, string][]).map(([tab, path]) => [path, tab]),
);

export const tabFromPath = (pathname: string): TabId | null => {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const exact = PATH_TO_TAB.get(clean);
  if (exact) return exact;
  // Sub-paths (e.g. /settings/assistants) resolve to their parent tab.
  const firstSeg = "/" + (clean.split("/").filter(Boolean)[0] ?? "");
  return PATH_TO_TAB.get(firstSeg) ?? null;
};

// ── Settings sub-sections ─────────────────────────────────────
// Sections inside the Settings tab that have their own URL under
// /settings/<slug>. Used by the app/settings/[section] route to
// validate deep links and by SettingsView for shallow navigation.
export const SETTINGS_SECTION_SLUGS = new Set<string>(["assistants", "profile", "prescription-settings", "prescription-templates", "favourite-settings"]);

// Tabs that display the patient header above their content.
export const HEADER_TABS: TabId[] = ["prescription", "pt-settings", "idsp", "pt-records"];

export const isPrescriptionGroup = (activeTab: TabId) =>
  activeTab === "prescription" || activeTab === "pt-settings" || activeTab === "idsp" || activeTab === "pt-records";
