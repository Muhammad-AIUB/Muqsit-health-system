"use client";

import { C, font } from "@/theme";
import { inputSm, fieldLabel } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";

export default function PatientHeader({ mobile }: { mobile?: boolean }) {
  const {
    ptName, setPtName, ptAge, setPtAge, ptGender, setPtGender,
    ptAddress, setPtAddress, ptWeight, setPtWeight, ptDate, setPtDate,
    ptPhone, setPtPhone,
    monthlyCost, watchPatient, toggleWatch, activeTab, setActiveTab,
  } = useMuqsit();

  return (
    <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: mobile ? 10 : 14, marginBottom: mobile ? 10 : 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: mobile ? 6 : 10 }}>
        <div style={{ flex: mobile ? "1 1 45%" : "1 1 180px" }}><label style={fieldLabel}>Patient name</label><input value={ptName} onChange={(e) => setPtName(e.target.value)} placeholder="Patient name" style={inputSm} /></div>
        <div style={{ flex: "0 0 55px" }}><label style={fieldLabel}>Age</label><input value={ptAge} onChange={(e) => setPtAge(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="—" style={inputSm} /></div>
        <div style={{ flex: "0 0 88px" }}><label style={fieldLabel}>Gender</label>
          <select value={ptGender} onChange={(e) => setPtGender(e.target.value)} style={{ ...inputSm, padding: "6px 6px", cursor: "pointer" }}>
            <option>Male</option>
            <option>Female</option>
          </select>
        </div>
        <div style={{ flex: mobile ? "1 1 100%" : "1 1 160px" }}><label style={fieldLabel}>Address</label><input value={ptAddress} onChange={(e) => setPtAddress(e.target.value)} placeholder="Address" style={inputSm} /></div>
        <div style={{ flex: "0 0 60px" }}><label style={fieldLabel}>Weight</label><input value={ptWeight} onChange={(e) => setPtWeight(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} inputMode="decimal" placeholder="kg" style={inputSm} /></div>
        <div style={{ flex: "0 0 130px" }}><label style={fieldLabel}>Date</label><input type="date" value={ptDate} onChange={(e) => setPtDate(e.target.value)} style={{ ...inputSm, cursor: "pointer" }} /></div>
        {!mobile && <div style={{ flex: "0 0 140px" }}><label style={fieldLabel}>Mobile</label><input value={ptPhone} onChange={(e) => setPtPhone(e.target.value.replace(/[^\d+ -]/g, "").slice(0, 16))} inputMode="tel" placeholder="01XXXXXXXXX" style={inputSm} /></div>}
        <div style={{ flex: mobile ? "1 1 45%" : "0 0 150px" }}>
          <label style={fieldLabel}>Total monthly cost</label>
          <div style={{ padding: "6px 10px", borderRadius: 6, fontSize: 14, fontWeight: 600, background: monthlyCost > 0 ? C.pri[50] : C.n[100], border: `0.5px solid ${monthlyCost > 0 ? C.pri[100] : C.n[200]}`, color: monthlyCost > 0 ? C.pri[600] : C.n[500], display: "flex", alignItems: "center", gap: 4, minHeight: 30 }}>
            <span style={{ fontSize: 11, fontWeight: 400 }}>৳</span>{monthlyCost > 0 ? monthlyCost.toFixed(1) : "0.0"}
          </div>
        </div>
        {/* Watch checkbox */}
        <div style={{ flex: mobile ? "1 1 100%" : "0 0 auto", display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
          <label onClick={toggleWatch} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${watchPatient ? "#f59e0b" : C.n[200]}`, background: watchPatient ? "#fffbeb" : C.n[0], userSelect: "none", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{watchPatient ? "👁️" : "👁"}</span>
            <span style={{ fontSize: 11, fontWeight: watchPatient ? 600 : 400, color: watchPatient ? "#b45309" : C.n[600] }}>Keep eye on this patient</span>
            <input type="checkbox" checked={watchPatient} onChange={() => {}} style={{ display: "none" }} />
            <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${watchPatient ? "#f59e0b" : C.n[300]}`, background: watchPatient ? "#f59e0b" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: "#fff", fontWeight: 700 }}>{watchPatient ? "✓" : ""}</span>
          </label>
        </div>

        <div style={{ flex: mobile ? "1 1 100%" : "0 0 auto", display: "flex", alignItems: "flex-end", gap: 6, paddingBottom: 1 }}>
          <button onClick={() => setActiveTab("pt-settings")} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `0.5px solid ${activeTab === "pt-settings" ? C.info[400] : C.n[200]}`, background: activeTab === "pt-settings" ? C.info[50] : C.n[0], color: activeTab === "pt-settings" ? C.info[800] : C.n[600], display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontFamily: font }}>
            <span style={{ fontSize: 13 }}>⊕</span> Patient Settings
          </button>
          <button onClick={() => setActiveTab("idsp")} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `0.5px solid ${activeTab === "idsp" ? C.warn[400] : C.n[200]}`, background: activeTab === "idsp" ? C.warn[50] : C.n[0], color: activeTab === "idsp" ? C.warn[800] : C.n[600], display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontFamily: font }}>
            <span style={{ fontSize: 13 }}>◎</span> Integrated health monitoring and overview
          </button>
        </div>
      </div>
    </div>
  );
}
