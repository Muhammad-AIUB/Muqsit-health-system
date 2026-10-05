"use client";

import { Fragment } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { TABS, HEADER_TABS, isPrescriptionGroup } from "./tabs";
import TabIcon from "./TabIcon";
import AccountMenu from "./AccountMenu";
import MirrorToggle from "./MirrorToggle";
import { BanglaTyping, LanguageToggle } from "./BanglaTyping";
import PatientSearch from "./PatientSearch";
import { WorkstationIndicator } from "./WorkstationSwitcher";
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
    <div style={{ border: `1px solid ${C.n[200]}`, borderRadius: 12, overflow: "hidden", background: C.n[50], position: "relative", boxShadow: "0 1px 2px rgba(60,64,67,0.06), 0 2px 8px rgba(60,64,67,0.05)" }}>
      {/* Two rows on purpose. On one row the header needed ~1300px, and with the
          page zoom a 1366px laptop has ~1220 — so it wrapped wherever it happened
          to break. Row 1 says who and where; row 2 is the navigation. */}
      <div style={{ background: C.n[0], borderBottom: `1px solid ${C.n[200]}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, rowGap: 8, padding: "10px 20px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.02em", flexShrink: 0 }}>MHS+</div>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.n[900], whiteSpace: "nowrap" }}>Muqsit Health System</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <MirrorToggle />
            <WorkstationIndicator />
            <PatientSearch />
            <AccountMenu size={32} />
          </div>
        </div>
        <div style={{ padding: "0 14px 8px" }}>
          <nav aria-label="Main" style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", rowGap: 4 }}>
            {TABS.map((t) => {
              const active = activeTab === t.id || (t.id === "prescription" && isPrescriptionGroup(activeTab));
              return (
                <Fragment key={t.id}>
                  <button onClick={t.disabled ? undefined : () => setActiveTab(t.id)} disabled={t.disabled} title={t.disabled ? "Coming soon" : undefined} aria-current={active ? "page" : undefined} style={{ minHeight: 34, padding: "0 12px", borderRadius: 8, border: "none", cursor: t.disabled ? "not-allowed" : "pointer", fontSize: 13, background: active ? C.pri[50] : "transparent", color: t.disabled ? C.n[400] : active ? C.pri[600] : C.n[600], fontWeight: active ? 600 : 500, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontFamily: font }}><TabIcon id={t.id} />{t.label}</button>
                  {/* Flashing emergency beacon right after OPD when any IPD patient is Critical. */}
                  {t.id === "opd" && <CriticalAlert onClick={() => setActiveTab("ipd")} />}
                </Fragment>
              );
            })}
            {/* BAN / EN sits at the end of the tab row, beside Settings. */}
            <div style={{ display: "flex", alignItems: "center", marginLeft: 8 }}>
              <LanguageToggle />
            </div>
          </nav>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        {showHeader && <PatientHeader />}
        {activeTab === "prescription" ? <PrescriptionView /> : <TabRouter />}
      </div>
      <DrugPicker />
      <InvestigationPopup />
      <OePopup />
      <BanglaTyping />
    </div>
  );
}
