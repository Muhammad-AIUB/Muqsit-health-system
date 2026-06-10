"use client";

import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import { TABS, MOBILE_TABS, HEADER_TABS, isPrescriptionGroup } from "./tabs";
import PatientHeader from "@/components/prescription/PatientHeader";
import PrescriptionView from "@/components/prescription/PrescriptionView";
import TabRouter from "@/components/TabRouter";
import DrugPicker from "@/components/prescription/DrugPicker";
import InvestigationPopup from "@/components/investigation/InvestigationPopup";
import OePopup from "@/components/examination/OePopup";

export default function MobileShell() {
  const { activeTab, setActiveTab } = useMuqsit();
  const { user, logout } = useAuth();
  const showHeader = HEADER_TABS.includes(activeTab);
  const initials = (user?.name || "DR").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const tabTitle =
    activeTab === "pt-settings" ? "Patient Settings"
      : activeTab === "idsp" ? "Health Monitoring"
        : (TABS.find((t) => t.id === activeTab) || { label: "Muqsit Health System" }).label || "Muqsit Health System";

  return (
    <div style={{ width: 375, margin: "0 auto", border: `0.5px solid ${C.n[200]}`, borderRadius: 32, padding: 10, background: C.n[100] }}>
      <div style={{ borderRadius: 24, overflow: "hidden", background: C.n[50], height: 760, display: "flex", flexDirection: "column", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 18px", fontSize: 10, color: C.n[600] }}><span style={{ fontWeight: 500 }}>5:04 PM</span><div style={{ display: "flex", gap: 4, alignItems: "center" }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: C.pri[400] }} /><span>Synced</span></div></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 14px 8px", background: C.n[0], borderBottom: `0.5px solid ${C.n[200]}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 26, height: 22, borderRadius: 5, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700 }}>MHS+</div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{tabTitle}</span>
          </div>
          <button onClick={logout} title="Log out" style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 500, cursor: "pointer" }}>{initials}</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {showHeader && <PatientHeader mobile />}
          {activeTab === "prescription" ? <PrescriptionView mobile /> : <TabRouter />}
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "6px 0 14px", background: C.n[0], borderTop: `0.5px solid ${C.n[200]}` }}>
          {MOBILE_TABS.map((t) => {
            const active = activeTab === t.id || (t.id === "prescription" && isPrescriptionGroup(activeTab));
            return (
              <div key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer", color: active ? C.pri[400] : C.n[500] }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: active ? C.pri[400] : C.n[200], color: active ? "#fff" : C.n[600], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{t.icon}</div>
                <span style={{ fontSize: 9, fontWeight: activeTab === t.id ? 500 : 400 }}>{t.label}</span>
              </div>
            );
          })}
        </div>
        <DrugPicker mobile />
        <InvestigationPopup />
        <OePopup />
      </div>
    </div>
  );
}
