"use client";

import type { CSSProperties } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { TABS, MOBILE_TABS, HEADER_TABS, isPrescriptionGroup } from "./tabs";
import AccountMenu from "./AccountMenu";
import { WorkstationIndicator } from "./WorkstationSwitcher";
import PatientHeader from "@/components/prescription/PatientHeader";
import PrescriptionView from "@/components/prescription/PrescriptionView";
import TabRouter from "@/components/TabRouter";
import DrugPicker from "@/components/prescription/DrugPicker";
import InvestigationPopup from "@/components/investigation/InvestigationPopup";
import OePopup from "@/components/examination/OePopup";

// `preview` = rendered as a 375px phone mock on a desktop (the manual "Mobile"
// toggle). On a real phone the shell fills the viewport instead — no bezel, no
// fake status bar — so this mobile layout IS the device layout.
export default function MobileShell({ preview = false }: { preview?: boolean }) {
  const { activeTab, setActiveTab } = useMuqsit();
  const showHeader = HEADER_TABS.includes(activeTab);
  const tabTitle =
    activeTab === "pt-settings" ? "Patient Settings"
      : activeTab === "idsp" ? "Health Monitoring"
        : (TABS.find((t) => t.id === activeTab) || { label: "Muqsit Health System" }).label || "Muqsit Health System";

  const frameStyle: CSSProperties = preview
    ? { width: 375, margin: "0 auto", border: `0.5px solid ${C.n[200]}`, borderRadius: 32, padding: 10, background: C.n[100] }
    : { width: "100%", background: C.n[100] };
  const innerStyle: CSSProperties = preview
    ? { borderRadius: 24, overflow: "hidden", background: C.n[50], height: 760, display: "flex", flexDirection: "column", position: "relative" }
    : { overflow: "hidden", background: C.n[50], minHeight: "100dvh", display: "flex", flexDirection: "column", position: "relative" };

  return (
    <div style={frameStyle}>
      <div style={innerStyle}>
        {preview && <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 18px", fontSize: 10, color: C.n[600] }}><span style={{ fontWeight: 500 }}>5:04 PM</span><div style={{ display: "flex", gap: 4, alignItems: "center" }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: C.pri[400] }} /><span>Synced</span></div></div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 14px 8px", background: C.n[0], borderBottom: `0.5px solid ${C.n[200]}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: "0 1 auto" }}>
            <div style={{ width: 26, height: 22, borderRadius: 5, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>MHS+</div>
            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tabTitle}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <WorkstationIndicator />
            <AccountMenu size={24} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {showHeader && <PatientHeader mobile />}
          {activeTab === "prescription" ? <PrescriptionView mobile /> : <TabRouter />}
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "6px 0 14px", background: C.n[0], borderTop: `0.5px solid ${C.n[200]}` }}>
          {MOBILE_TABS.map((t) => {
            const active = activeTab === t.id || (t.id === "prescription" && isPrescriptionGroup(activeTab));
            return (
              <div key={t.id} onClick={t.disabled ? undefined : () => setActiveTab(t.id)} title={t.disabled ? "Coming soon" : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, minHeight: 44, cursor: t.disabled ? "not-allowed" : "pointer", color: t.disabled ? C.n[300] : active ? C.pri[400] : C.n[500], opacity: t.disabled ? 0.6 : 1 }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: active ? C.pri[400] : C.n[200], color: active ? "#fff" : C.n[600], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{t.icon}</div>
                <span style={{ fontSize: 10, fontWeight: activeTab === t.id ? 500 : 400 }}>{t.label}</span>
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
