"use client";

import { C, font } from "@/theme";
import { inputSm, fieldLabel } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import PatientMobileLookup from "./PatientMobileLookup";

// Prescription-header wiring of the shared patient mobile-lookup: reads/writes
// the editor's mobile (mirrored into the Patient Settings form), and loads the
// chosen patient into the editor. Once a patient is loaded the field locks (a
// "Change" button clears it to look up a different patient).
export default function MobileLookupField({ mobile }: { mobile?: boolean }) {
  const {
    ptPhone, setPtPhone, setPtInfo, loadPatient, currentPatientId,
    resetEditor, setCurrentPatientId,
  } = useMuqsit();

  if (currentPatientId) {
    return (
      <div style={{ flex: mobile ? "1 1 100%" : "0 0 150px" }}>
        <label style={fieldLabel}>Mobile</label>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={ptPhone} readOnly title="Edit from Patient Settings" style={{ ...inputSm, flex: 1, background: C.n[100], color: C.n[600], cursor: "not-allowed" }} />
          <button
            type="button"
            onClick={() => { resetEditor(); setCurrentPatientId(null); }}
            title="Look up a different patient"
            style={{ padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.pri[600], fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", fontFamily: font }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <PatientMobileLookup
      value={ptPhone}
      onChange={(d) => { setPtPhone(d); setPtInfo((p) => ({ ...p, mobile: d })); }}
      onPick={loadPatient}
      currentPatientId={currentPatientId}
      wrapStyle={{ flex: mobile ? "1 1 100%" : "0 0 150px" }}
    />
  );
}
