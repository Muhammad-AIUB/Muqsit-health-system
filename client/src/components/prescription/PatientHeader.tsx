"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { C, font } from "@/theme";
import { inputSm, fieldLabel } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import { isoToDdmmyyyy, parseFlexibleDate } from "@/lib/dateInput";
import MobileLookupField from "./MobileLookupField";

export default function PatientHeader({ mobile }: { mobile?: boolean }) {
  const {
    ptName, setPtName, ptAge, setPtAge, ptGender, setPtGender,
    ptAddress, setPtAddress, ptWeight, setPtWeight, ptDate, setPtDate,
    ptHospitalId, setPtHospitalId, setPtInfo, ptInfo, currentPatientId,
    monthlyCost, watchPatient, toggleWatch, activeTab, setActiveTab,
  } = useMuqsit();

  // A patient photo can 404 (deleted upload, flaky clinic network) — fall back
  // to the placeholder glyph instead of a broken-image icon. Reset on change.
  const [photoError, setPhotoError] = useState(false);
  useEffect(() => setPhotoError(false), [ptInfo.picture]);

  // Once a patient is loaded, their identity fields are read-only here — edits
  // go through Patient Settings. (Weight & Date stay editable: they're
  // per-visit, not stored patient attributes.)
  const locked = !!currentPatientId;
  const lk = (base: CSSProperties): CSSProperties =>
    locked ? { ...base, background: C.n[100], color: C.n[600], cursor: "not-allowed" } : base;
  const lockTitle = locked ? "Edit from Patient Settings" : undefined;

  // Age / Gender are shared with the Patient Settings form (ptInfo). Mirror
  // header edits into ptInfo so the two views always show the same value.
  // Editing age here clears any DOB (manual age overrides DOB).
  const onAge = (v: string) => { const a = v.replace(/\D/g, "").slice(0, 3); setPtAge(a); setPtInfo((p) => ({ ...p, age: a, dob: "" })); };
  const onGender = (v: string) => { setPtGender(v); setPtInfo((p) => ({ ...p, sex: v })); };

  return (
    <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: mobile ? 10 : 14, marginBottom: mobile ? 10 : 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: mobile ? 6 : 10 }}>
        {/* Patient profile photo — uploaded in Patient Settings, shown here. */}
        <div style={{ flex: "0 0 auto" }}>
          <label style={fieldLabel}>Photo</label>
          <div
            onClick={() => setActiveTab("pt-settings")}
            title={ptInfo.picture ? "Patient photo — change in Patient Settings" : "Add a photo in Patient Settings"}
            style={{ width: mobile ? 44 : 54, height: mobile ? 44 : 54, borderRadius: 10, overflow: "hidden", border: `0.5px solid ${C.n[200]}`, background: C.n[100], display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            {ptInfo.picture && !photoError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ptInfo.picture} alt="Patient" onError={() => setPhotoError(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: mobile ? 18 : 22, color: C.n[400] }}>👤</span>
            )}
          </div>
        </div>
        <div style={{ flex: mobile ? "1 1 45%" : "1 1 180px" }}><label style={fieldLabel}>Patient name</label><input value={ptName} onChange={(e) => setPtName(e.target.value)} placeholder="Patient name" style={lk(inputSm)} readOnly={locked} title={lockTitle} /></div>
        <div style={{ flex: "0 0 55px" }}><label style={fieldLabel}>Age</label><input value={ptAge} onChange={(e) => onAge(e.target.value)} inputMode="numeric" placeholder="—" style={lk(inputSm)} readOnly={locked} title={lockTitle} /></div>
        <div style={{ flex: "0 0 88px" }}><label style={fieldLabel}>Gender</label>
          <select value={ptGender} onChange={(e) => onGender(e.target.value)} disabled={locked} title={lockTitle} style={lk({ ...inputSm, padding: "6px 6px", cursor: locked ? "not-allowed" : "pointer" })}>
            <option value="">—</option>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </div>
        <div style={{ flex: mobile ? "1 1 100%" : "1 1 160px" }}><label style={fieldLabel}>Address</label><input value={ptAddress} onChange={(e) => setPtAddress(e.target.value)} placeholder="Address" style={lk(inputSm)} readOnly={locked} title={lockTitle} /></div>
        <div style={{ flex: "0 0 60px" }}><label style={fieldLabel}>Weight</label><input value={ptWeight} onChange={(e) => setPtWeight(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} inputMode="decimal" placeholder="kg" style={inputSm} /></div>
        <div style={{ flex: "0 0 130px" }}><label style={fieldLabel}>Date</label><DateField value={ptDate} onChange={setPtDate} /></div>
        <MobileLookupField mobile={mobile} />
        <div style={{ flex: mobile ? "1 1 45%" : "0 0 150px" }}>
          <label style={fieldLabel}>Total monthly approximate cost</label>
          <div style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13.5, fontWeight: 600, background: monthlyCost > 0 ? C.pri[50] : C.n[100], border: `0.5px solid ${monthlyCost > 0 ? C.pri[100] : C.n[200]}`, color: monthlyCost > 0 ? C.pri[600] : C.n[500], display: "flex", alignItems: "center", gap: 4, height: 29, boxSizing: "border-box" }}>
            <span style={{ fontSize: 11, fontWeight: 400 }}>৳</span>{monthlyCost > 0 ? monthlyCost.toFixed(1) : "0.0"}
          </div>
        </div>
        {/* Hospital ID — a normal inline field, in line with the others */}
        <div style={{ flex: mobile ? "1 1 45%" : "0 0 140px" }}>
          <label style={fieldLabel}>Hospital ID</label>
          <input value={ptHospitalId} onChange={(e) => setPtHospitalId(e.target.value)} placeholder="Hospital ID" style={lk({ ...inputSm, width: "100%", boxSizing: "border-box" })} readOnly={locked} title={lockTitle} />
        </div>
        <div style={{ flex: mobile ? "1 1 100%" : "1 1 auto", display: "flex", alignItems: "flex-end", gap: 6, rowGap: 6, flexWrap: "wrap", paddingBottom: 1 }}>
          <button onClick={() => setActiveTab("pt-settings")} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `0.5px solid ${activeTab === "pt-settings" ? C.info[400] : C.n[200]}`, background: activeTab === "pt-settings" ? C.info[50] : C.n[0], color: activeTab === "pt-settings" ? C.info[800] : C.n[600], display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontFamily: font }}>
            <span style={{ fontSize: 13 }}>⊕</span> Patient Settings
          </button>
          <button onClick={() => setActiveTab("idsp")} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `0.5px solid ${activeTab === "idsp" ? C.warn[400] : C.n[200]}`, background: activeTab === "idsp" ? C.warn[50] : C.n[0], color: activeTab === "idsp" ? C.warn[800] : C.n[600], display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontFamily: font }}>
            <span style={{ fontSize: 13 }}>◎</span> Integrated health monitoring and overview
          </button>
          {/* Patient's prescriptions & reports overview */}
          <button onClick={() => setActiveTab("pt-records")} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `0.5px solid ${activeTab === "pt-records" ? C.info[400] : C.n[200]}`, background: activeTab === "pt-records" ? C.info[50] : C.n[0], color: activeTab === "pt-records" ? C.info[800] : C.n[600], display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontFamily: font }}>
            <span style={{ fontSize: 13 }}>🗂</span> Patient&apos;s Prescriptions and reports
          </button>
          {/* Keep-eye toggle — third, after the two buttons */}
          <label onClick={toggleWatch} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${watchPatient ? "#f59e0b" : C.n[200]}`, background: watchPatient ? "#fffbeb" : C.n[0], userSelect: "none", whiteSpace: "nowrap", boxSizing: "border-box" }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{watchPatient ? "👁️" : "👁"}</span>
            <span style={{ fontSize: 11, fontWeight: watchPatient ? 600 : 400, color: watchPatient ? "#b45309" : C.n[600] }}>Keep eye on this patient</span>
            <input type="checkbox" checked={watchPatient} onChange={() => {}} style={{ display: "none" }} />
            <span style={{ marginLeft: 4, width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${watchPatient ? "#f59e0b" : C.n[300]}`, background: watchPatient ? "#f59e0b" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: "#fff", fontWeight: 700 }}>{watchPatient ? "✓" : ""}</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// Date field in DD/MM/YYYY format. Type the 6-digit shorthand DDMMYY
// (e.g. 030626 → 03/06/2026) or a slashed date; stored as ISO internally.
function DateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [text, setText] = useState(() => isoToDdmmyyyy(value));
  const [focused, setFocused] = useState(false);

  // Keep in sync with external changes (e.g. loading a patient) while not typing.
  useEffect(() => { if (!focused) setText(isoToDdmmyyyy(value)); }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const iso = parseFlexibleDate(text);
    if (iso) { onChange(iso); setText(isoToDdmmyyyy(iso)); }
    else setText(isoToDdmmyyyy(value)); // revert invalid input
  };

  const style: CSSProperties = { ...inputSm, boxSizing: "border-box", width: "100%" };
  return (
    <input
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      placeholder="DD/MM/YYYY"
      title="Type DDMMYY — e.g. 030626 → 03/06/2026"
      inputMode="numeric"
      style={style}
    />
  );
}
