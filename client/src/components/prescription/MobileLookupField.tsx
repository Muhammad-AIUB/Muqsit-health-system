"use client";

import { useMuqsit } from "@/context/MuqsitContext";
import PatientMobileLookup from "./PatientMobileLookup";

// Prescription-header wiring of the shared patient mobile-lookup: reads/writes
// the editor's mobile (mirrored into the Patient Settings form), and loads the
// chosen patient into the editor.
export default function MobileLookupField({ mobile }: { mobile?: boolean }) {
  const { ptPhone, setPtPhone, setPtInfo, loadPatient, currentPatientId } = useMuqsit();

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
