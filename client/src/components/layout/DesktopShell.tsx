"use client";

import { Fragment } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { TABS, HEADER_TABS, isPrescriptionGroup } from "./tabs";
import AccountMenu from "./AccountMenu";
import CriticalAlert from "@/components/ipd/CriticalAlert";
import PatientHeader from "@/components/prescription/PatientHeader";
import PrescriptionView from "@/components/prescription/PrescriptionView";
import TabRouter from "@/components/TabRouter";
import DrugPicker from "@/components/prescription/DrugPicker";
import InvestigationPopup from "@/components/investigation/InvestigationPopup";
import OePopup from "@/components/examination/OePopup";

export default function DesktopShell() {
  const { activeTab, setActiveTab } = useMuqsit();
  const showHeader = HEADER_TABS.includes(activeTab);

  return (
    <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 12, overflow: "hidden", background: C.n[50], position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", height: 48, background: C.n[0], borderBottom: `0.5px solid ${C.n[200]}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>MHS+</div>
          <span style={{ fontSize: 14, fontWeight: 500, marginRight: 20 }}>Muqsit Health System</span>
          <div style={{ display: "flex", gap: 1 }}>
            {TABS.map((t) => {
              const active = activeTab === t.id || (t.id === "prescription" && isPrescriptionGroup(activeTab));
              return (
                <Fragment key={t.id}>
                  <button onClick={t.disabled ? undefined : () => setActiveTab(t.id)} disabled={t.disabled} title={t.disabled ? "Coming soon" : undefined} style={{ padding: "5px 14px", borderRadius: 7, border: "none", cursor: t.disabled ? "not-allowed" : "pointer", fontSize: 12, background: active ? C.pri[50] : "transparent", color: t.disabled ? C.n[300] : active ? C.pri[600] : C.n[600], fontWeight: activeTab === t.id ? 500 : 400, display: "flex", alignItems: "center", gap: 4, fontFamily: font }}><span style={{ fontSize: 12 }}>{t.icon}</span>{t.label}</button>
                  {/* Flashing emergency beacon right after OPD when any IPD patient is Critical. */}
                  {t.id === "opd" && <CriticalAlert onClick={() => setActiveTab("ipd")} />}
                </Fragment>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input placeholder="Search by mobile..." style={{ padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, fontSize: 11, width: 170, outline: "none", background: C.n[0], color: C.n[900], fontFamily: font }} />
          <AccountMenu size={28} />
        </div>
      </div>
      <div style={{ padding: 18 }}>
        {showHeader && <PatientHeader />}
        {activeTab === "prescription" ? <PrescriptionView /> : <TabRouter />}
      </div>
      <DrugPicker />
      <InvestigationPopup />
      <OePopup />
    </div>
  );
}
