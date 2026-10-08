"use client";

import type { CSSProperties } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { TABS, MOBILE_TABS, HEADER_TABS, isPrescriptionGroup } from "./tabs";
import TabIcon from "./TabIcon";
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
  // The three patient views are not tabs of their own, so they are named here.
  // Prescriptions & reports had no name and fell through to the product's.
  const tabTitle =
    activeTab === "pt-settings" ? "Patient Settings"
      : activeTab === "idsp" ? "Health Monitoring"
        : activeTab === "pt-records" ? "Prescriptions & reports"
          : (TABS.find((t) => t.id === activeTab) || { label: "Muqsit Health System" }).label || "Muqsit Health System";

  const frameStyle: CSSProperties = preview
    ? { width: 375, margin: "0 auto", border: `0.5px solid ${C.n[200]}`, borderRadius: 32, padding: 10, background: C.n[100] }
    : { width: "100%", background: C.n[100] };
  const innerStyle: CSSProperties = preview
    ? { borderRadius: 24, overflow: "hidden", background: C.n[50], height: 760, display: "flex", flexDirection: "column", position: "relative" }
    : { overflow: "hidden", background: C.n[50], display: "flex", flexDirection: "column", position: "relative" };

  return (
    <div style={frameStyle}>
      {/* On a real phone the height comes from .mobile-shell-fill (globals.css). */}
      <div style={innerStyle} className={preview ? undefined : "mobile-shell-fill"}>
        {preview && <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 18px", fontSize: 10, color: C.n[600] }}><span style={{ fontWeight: 500 }}>5:04 PM</span><div style={{ display: "flex", gap: 4, alignItems: "center" }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: C.ok[400] }} /><span>Synced</span></div></div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", minHeight: 48, background: C.n[0], borderBottom: `1px solid ${C.n[200]}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: "0 1 auto" }}>
            <div style={{ width: 30, height: 26, borderRadius: 7, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8.5, fontWeight: 700, flexShrink: 0 }}>MHS+</div>
            <span style={{ fontSize: 15, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tabTitle}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* The phone mock shows this in its fake status bar; a real phone has
                no strip above the shell, so it lives here. */}
            {!preview && <span role="status" style={{ fontSize: 11, color: C.n[600], display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.ok[400] }} />Synced</span>}
            <WorkstationIndicator />
            <AccountMenu size={30} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {showHeader && <PatientHeader mobile />}
          {activeTab === "prescription" ? <PrescriptionView mobile /> : <TabRouter mobile />}
        </div>
        <nav aria-label="Main" style={{ display: "flex", justifyContent: "space-around", padding: "4px 4px calc(8px + env(safe-area-inset-bottom, 0px))", background: C.n[0], borderTop: `1px solid ${C.n[200]}` }}>
          {MOBILE_TABS.map((t) => {
            // Patients has no place of its own on this bar; it is reached through
            // "More", so that is the tab that stays lit while its list is open —
            // otherwise the bar showed nothing selected and no way back.
            const active = activeTab === t.id || (t.id === "prescription" && isPrescriptionGroup(activeTab)) || (t.id === "settings" && activeTab === "patients");
            // `1 1 auto`, not `1 1 0`: six equal places are 52px each on a 360px
            // phone and "Supervised" is 56 — it ran into "Research" and the two
            // read as one label. Starting from each tab's own width shares the
            // spare room out as equal gaps BETWEEN the labels instead.
            return (
              <button key={t.id} type="button" onClick={t.disabled ? undefined : () => setActiveTab(t.id)} disabled={t.disabled} title={t.disabled ? "Coming soon" : undefined} aria-current={active ? "page" : undefined} style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, minHeight: 48, padding: 0, border: "none", background: "none", fontFamily: "inherit", cursor: t.disabled ? "not-allowed" : "pointer", color: t.disabled ? C.n[400] : active ? C.pri[600] : C.n[600] }}>
                <span style={{ width: 44, height: 24, borderRadius: 12, background: active ? C.pri[50] : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}><TabIcon id={t.id === "settings" ? "more" : t.id} size={18} /></span>
                <span style={{ fontSize: 10.5, fontWeight: active ? 600 : 500, whiteSpace: "nowrap" }}>{t.label}</span>
              </button>
            );
          })}
        </nav>
        <DrugPicker mobile />
        <InvestigationPopup />
        <OePopup />
      </div>
    </div>
  );
}
