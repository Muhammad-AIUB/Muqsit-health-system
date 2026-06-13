"use client";

import { useMuqsit } from "@/context/MuqsitContext";
import OpdView from "./tabs/OpdView";
import IpdView from "./tabs/IpdView";
import PatientSettingsView from "./tabs/PatientSettingsView";
import HealthMonitoringView from "./tabs/HealthMonitoringView";
import PatientsView from "./tabs/PatientsView";
import MessageView from "./tabs/MessageView";
import ResearchView from "./tabs/ResearchView";
import SettingsView from "./tabs/SettingsView";

// Renders the active non-prescription tab (mirrors the original renderPage switch).
export default function TabRouter() {
  const { activeTab } = useMuqsit();

  switch (activeTab) {
    case "opd": return <OpdView />;
    case "ipd": return <IpdView />;
    case "pt-settings": return <PatientSettingsView />;
    case "idsp": return <HealthMonitoringView />;
    case "patients": return <PatientsView />;
    case "message": return <MessageView />;
    case "research": return <ResearchView />;
    case "settings": return <SettingsView />;
    default: return null;
  }
}
