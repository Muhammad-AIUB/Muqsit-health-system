"use client";

import type { ReactNode } from "react";
import { C, colorOf, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { usePatients, useDeletePatient } from "@/hooks/usePatients";
import { patientToPtInfo } from "@/lib/patientForm";
import type { Patient } from "@/lib/api";
import type { PtInfo } from "@/types";

interface RowData {
  id: string;
  name: string;
  age: number | string;
  gender: string;
  init: string;
  phone: string;
  diagnosis?: string;
  color: string;
}

type Palette = Record<number, string>;

const EMPTY_PT_INFO: PtInfo = {
  name: "", hospitalId: "", bloodGroup: "", dob: "", age: "", sex: "Male", ethnicity: "", religion: "Islam",
  mobile: "", spouseMobile: "", relativeMobile: "", relativeRelation: "",
  district: "", fullAddress: "", monthlyIncome: "", picture: null, tags: [],
};

const initialsOf = (name: string) => (name || "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const PatientRow = ({ p, rightSlot }: { p: RowData; rightSlot?: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
    <div style={{ width: 36, height: 36, borderRadius: "50%", background: colorOf(p.color).bg, color: colorOf(p.color).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{p.init}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.n[900] }}>{p.name}</div>
      <div style={{ fontSize: 11, color: C.n[500] }}>{p.age !== "" ? `${p.age}y · ` : ""}{p.gender === "F" ? "Female" : "Male"}{p.phone ? ` · ${p.phone}` : ""}</div>
      {p.diagnosis && <div style={{ fontSize: 11, color: C.n[600], marginTop: 1 }}>{p.diagnosis}</div>}
    </div>
    {rightSlot}
  </div>
);

const SectionHeader = ({ icon, title, count, color, action }: { icon: string; title: string; count: number; color: Palette; action?: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
    <span style={{ fontSize: 16 }}>{icon}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: C.n[800] }}>{title}</span>
    <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 10, background: color[50], color: color[800], fontWeight: 600 }}>{count}</span>
    {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
  </div>
);

const smallBtn = (filled: boolean) => ({
  padding: "4px 12px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontFamily: font,
  border: filled ? "none" : `0.5px solid ${C.n[200]}`,
  background: filled ? C.pri[400] : C.n[0],
  color: filled ? "#fff" : C.n[700],
});

export default function PatientsView() {
  const {
    setPtName, setPtAge, setPtGender, setPtPhone, setActiveTab,
    setPtInfo, setCurrentPatientId, setPtSettingsTab, setWatchPatient,
  } = useMuqsit();

  const { data: patients = [], isLoading, isError, error } = usePatients();
  const deletePatient = useDeletePatient();

  // Surveillance = real `watched` flag from the database.
  const watchedPatients = patients.filter((p) => p.watched);

  const loadHeader = (p: Patient) => {
    setPtName(p.name);
    setPtAge(p.age != null ? String(p.age) : "");
    setPtGender(p.sex || "Male");
    setPtPhone(p.mobile || "");
    setPtInfo(patientToPtInfo(p));
    setCurrentPatientId(p.id);
    setWatchPatient(p.watched); // sync the "Keep eye" checkbox with the record
  };

  const openForPrescription = (p: Patient) => {
    loadHeader(p);
    setActiveTab("prescription");
  };

  const editPatient = (p: Patient) => {
    loadHeader(p);
    setPtSettingsTab("info");
    setActiveTab("pt-settings");
  };

  const newPatient = () => {
    setPtInfo(EMPTY_PT_INFO);
    setCurrentPatientId(null);
    setPtSettingsTab("info");
    setActiveTab("pt-settings");
  };

  const handleDelete = (p: Patient) => {
    if (window.confirm(`Delete ${p.name}? This cannot be undone.`)) {
      deletePatient.mutate(p.id);
    }
  };

  const toRow = (p: Patient): RowData => ({
    id: p.id,
    name: p.name,
    age: p.age != null ? p.age : "",
    gender: p.sex === "Female" ? "F" : "M",
    init: initialsOf(p.name),
    phone: p.mobile || "",
    diagnosis: p.tags && p.tags.length ? p.tags.join(" · ") : undefined,
    color: "pri",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 2 }}>Patient Records</div>

      {/* ── GROUP 1: Surveillance (watched flag from the API) ── */}
      <div style={{ background: C.n[0], border: `0.5px solid ${C.warn[100]}`, borderRadius: 12, padding: "14px 16px" }}>
        <SectionHeader icon="👁️" title="Patients on your surveillance" count={watchedPatients.length} color={C.warn} />
        {watchedPatients.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: C.n[500], fontSize: 12 }}>
            No patients flagged — tick <strong>&quot;Keep eye on this patient&quot;</strong> in the prescription header to add one here
          </div>
        ) : (
          <div style={{ borderTop: `0.5px solid ${C.n[100]}` }}>
            {watchedPatients.map((p, i) => (
              <div key={p.id} style={{ borderBottom: i < watchedPatients.length - 1 ? `0.5px solid ${C.n[100]}` : "none" }}>
                <PatientRow p={{ ...toRow(p), diagnosis: "Under monitoring", color: "warn" }} rightSlot={
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, background: "#fffbeb", color: "#b45309", border: "0.5px solid #fde68a", fontWeight: 600, whiteSpace: "nowrap" }}>👁️ Watching</span>
                    <button onClick={() => openForPrescription(p)} style={smallBtn(true)}>Open</button>
                  </div>
                } />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── GROUP 2: All patients (from API) ── */}
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "14px 16px" }}>
        <SectionHeader icon="🗂️" title="Your patients" count={patients.length} color={C.pri}
          action={<button onClick={newPatient} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: font }}>+ New patient</button>}
        />
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: C.n[500], fontSize: 12 }}>Loading patients…</div>
        ) : isError ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: C.danger[800], fontSize: 12 }}>
            Couldn&apos;t load patients{error instanceof Error ? ` — ${error.message}` : ""}
          </div>
        ) : patients.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: C.n[400], fontSize: 12 }}>
            No patients yet — click <strong>+ New patient</strong> to add your first one.
          </div>
        ) : (
          <div style={{ borderTop: `0.5px solid ${C.n[100]}` }}>
            {patients.map((p, i) => (
              <div key={p.id} style={{ borderBottom: i < patients.length - 1 ? `0.5px solid ${C.n[100]}` : "none" }}>
                <PatientRow p={toRow(p)} rightSlot={
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openForPrescription(p)} style={smallBtn(true)}>Open</button>
                    <button onClick={() => editPatient(p)} style={smallBtn(false)}>Edit</button>
                    <button onClick={() => handleDelete(p)} disabled={deletePatient.isPending} style={{ ...smallBtn(false), color: C.danger[800], borderColor: C.danger[100] }}>Delete</button>
                  </div>
                } />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
