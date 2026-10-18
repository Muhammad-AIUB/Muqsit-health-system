"use client";

import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import OpdView from "./tabs/OpdView";
import IpdView from "./tabs/IpdView";
import PatientSettingsView from "./tabs/PatientSettingsView";
import HealthMonitoringView from "./tabs/HealthMonitoringView";
import PatientRecordsView from "./prescription/PatientRecordsView";
import PatientsView from "./tabs/PatientsView";
import MessageView from "./tabs/MessageView";
import SettingsView from "./tabs/SettingsView";
import RevisionNotesView from "./tabs/RevisionNotesView";
import Icon from "@/components/common/Icon";

// A locked feature reached by deep link (the nav tab is already greyed out).
// Research companion is gated to a higher account tier — kept here so /research
// shows a clear message instead of the working view. (ResearchView itself is
// retained for when the tier is activated.)
function ComingSoon({ title }: { title: string }) {
  return (
    <div style={{ textAlign: "center", padding: "70px 0", color: C.n[500] }}>
      <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}><Icon name="lock" size={30} /></div>
      <div style={{ fontSize: 15, fontWeight: 500, color: C.n[800] }}>{title}</div>
      <div style={{ fontSize: 12.5, marginTop: 6 }}>This feature isn’t available on your account yet.</div>
    </div>
  );
}

// Renders the active non-prescription tab (mirrors the original renderPage switch).
// `mobile` is set by the phone shell: its bottom bar has no place for Patients,
// so the "More" page (Settings) is told to offer the way there.
export default function TabRouter({ mobile = false }: { mobile?: boolean }) {
  const { activeTab } = useMuqsit();

  switch (activeTab) {
    case "opd": return <OpdView />;
    case "ipd": return <IpdView />;
    case "pt-settings": return <PatientSettingsView />;
    case "idsp": return <HealthMonitoringView />;
    case "pt-records": return <PatientRecordsView />;
    case "patients": return <PatientsView />;
    case "message": return <MessageView />;
    case "research": return <ComingSoon title="Research companion" />;
    case "settings": return <SettingsView mobile={mobile} />;
    case "revision": return <RevisionNotesView />;
    default: return null;
  }
}
