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
  { id: "chat", label: "Chat", icon: "◈" },
  { id: "research", label: "Research companion", icon: "🔬" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export const MOBILE_TABS: TabDef[] = [
  { id: "prescription", label: "Rx", icon: "℞" },
  { id: "opd", label: "OPD", icon: "▤" },
  { id: "ipd", label: "IPD", icon: "▥" },
  { id: "chat", label: "Chat", icon: "◈" },
  { id: "research", label: "Research", icon: "🔬" },
  { id: "settings", label: "More", icon: "⋯" },
];

// Tabs that display the patient header above their content.
export const HEADER_TABS: TabId[] = ["prescription", "pt-settings", "idsp"];

export const isPrescriptionGroup = (activeTab: TabId) =>
  activeTab === "prescription" || activeTab === "pt-settings" || activeTab === "idsp";
