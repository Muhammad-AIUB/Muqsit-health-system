import type { TabId } from "@/types";

export interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

export const TABS: TabDef[] = [
  { id: "prescription", label: "Prescription", icon: "℞" },
  { id: "opd", label: "OPD", icon: "▤" },
  { id: "ipd", label: "IPD", icon: "▥" },
  { id: "patients", label: "Patients", icon: "◉" },
  { id: "message", label: "Message", icon: "◈" },
  { id: "research", label: "Research companion", icon: "🔬" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export const MOBILE_TABS: TabDef[] = [
  { id: "prescription", label: "Rx", icon: "℞" },
  { id: "opd", label: "OPD", icon: "▤" },
  { id: "ipd", label: "IPD", icon: "▥" },
  { id: "message", label: "Message", icon: "◈" },
  { id: "research", label: "Research", icon: "🔬" },
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
};

const PATH_TO_TAB = new Map<string, TabId>(
  (Object.entries(TAB_PATHS) as [TabId, string][]).map(([tab, path]) => [path, tab]),
);

export const tabFromPath = (pathname: string): TabId | null =>
  PATH_TO_TAB.get(pathname.replace(/\/+$/, "") || "/") ?? null;

// Tabs that display the patient header above their content.
export const HEADER_TABS: TabId[] = ["prescription", "pt-settings", "idsp"];

export const isPrescriptionGroup = (activeTab: TabId) =>
  activeTab === "prescription" || activeTab === "pt-settings" || activeTab === "idsp";
