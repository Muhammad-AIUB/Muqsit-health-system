"use client";

import type { ReactNode } from "react";
import { C, colorOf, font } from "@/theme";
import { btnPrimary, btnSecondary, pageTitle } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import { usePatients } from "@/hooks/usePatients";
import { ApiError, type Patient } from "@/lib/api";
import { normaliseSex } from "@/lib/sex";
import type { PtInfo } from "@/types";
import Icon, { type IconName } from "@/components/common/Icon";
import EmptyState from "@/components/common/EmptyState";
import { Loading, LoadError } from "@/components/common/ListState";

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
  name: "", hospitalId: "", bloodGroup: "", dob: "", age: "", sex: "", ethnicity: "", religion: "",
  mobile: "", nid: "", spouseMobile: "", relativeMobile: "", relativeRelation: "",
  district: "", fullAddress: "", monthlyIncome: "", picture: null, tags: [],
};

const initialsOf = (name: string) => (name || "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const PatientRow = ({ p, rightSlot }: { p: RowData; rightSlot?: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
    <div style={{ width: 36, height: 36, borderRadius: "50%", background: colorOf(p.color).bg, color: colorOf(p.color).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{p.init}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.n[900] }}>{p.name}</div>
      {/* Sex is dropped when the record does not have one — listing every
          sexless patient as "Male" is a claim the record never made. */}
      <div style={{ fontSize: 11, color: C.n[500] }}>
        {[p.age !== "" ? `${p.age}y` : "", normaliseSex(p.gender), p.phone].filter(Boolean).join(" · ")}
      </div>
      {p.diagnosis && <div style={{ fontSize: 11, color: C.n[600], marginTop: 1 }}>{p.diagnosis}</div>}
    </div>
    {rightSlot}
  </div>
);

const SectionHeader = ({ icon, title, count, color, action }: { icon: IconName; title: string; count: number; color: Palette; action?: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
    <Icon name={icon} size={18} style={{ color: color[800] }} />
    <span style={{ fontSize: 13, fontWeight: 600, color: C.n[800] }}>{title}</span>
    <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 10, background: color[50], color: color[800], fontWeight: 600 }}>{count}</span>
    {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
  </div>
);

const smallBtn = (filled: boolean) => (filled ? btnPrimary("sm") : btnSecondary("sm"));

export default function PatientsView() {
  const {
    setActiveTab, setPtInfo, setCurrentPatientId, setPtSettingsTab, resetEditor, loadPatient,
    activeWorkstationId,
  } = useMuqsit();

  const { data: patients = [], isLoading, isError, error, refetch, isFetching } = usePatients(activeWorkstationId);

  // Surveillance = real `watched` flag from the database.
  const watchedPatients = patients.filter((p) => p.watched);

  // Full load — sets the header and restores any in-progress (not printed) Rx.
  const loadHeader = (p: Patient) => loadPatient(p);

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
    resetEditor(); // clear any previous patient's in-progress prescription
    setPtInfo(EMPTY_PT_INFO);
    setCurrentPatientId(null);
    setPtSettingsTab("info");
    setActiveTab("pt-settings");
  };

  const toRow = (p: Patient): RowData => ({
    id: p.id,
    name: p.name,
    age: p.age != null ? p.age : "",
    // Carry the sex through as recorded, blank included. `=== "Female" ? "F" : "M"`
    // stamped M onto every patient whose sex was simply never entered.
    gender: normaliseSex(p.sex),
    init: initialsOf(p.name),
    phone: p.mobile || "",
    diagnosis: p.tags && p.tags.length ? p.tags.join(" · ") : undefined,
    color: "pri",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...pageTitle, marginBottom: 2 }}>Patient Records</div>

      {/* ── GROUP 1: Surveillance (watched flag from the API) ── */}
      <div style={{ background: C.n[0], border: `0.5px solid ${C.warn[100]}`, borderRadius: 12, padding: "14px 16px" }}>
        <SectionHeader icon="eye" title="Patients on your surveillance" count={watchedPatients.length} color={C.warn} />
        {watchedPatients.length === 0 ? (
          <EmptyState compact icon="eye" title="No patient is being watched" hint={<>Tick <strong>Keep eye on this patient</strong> in a patient&apos;s header and they are listed here.</>} />
        ) : (
          <div style={{ borderTop: `0.5px solid ${C.n[100]}` }}>
            {watchedPatients.map((p, i) => (
              <div key={p.id} style={{ borderBottom: i < watchedPatients.length - 1 ? `0.5px solid ${C.n[100]}` : "none" }}>
                <PatientRow p={{ ...toRow(p), diagnosis: "Under monitoring", color: "warn" }} rightSlot={
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: "#fffbeb", color: "#b45309", border: "0.5px solid #fde68a", fontWeight: 600, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="eye" size={13} /> Watching</span>
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
        <SectionHeader icon="folder" title="Your patients" count={patients.length} color={C.pri}
          action={<button onClick={newPatient} style={btnPrimary("sm")}>+ New patient</button>}
        />
        {isLoading ? (
          <Loading label="Loading patients…" />
        ) : isError ? (
          <LoadError title="Could not load patients." detail={error instanceof ApiError ? error.message : undefined} onRetry={() => refetch()} retrying={isFetching} />
        ) : patients.length === 0 ? (
          <EmptyState icon="folder" title="No patients yet" hint={<>Add your first one with <strong>+ New patient</strong>.</>} />
        ) : (
          <div style={{ borderTop: `0.5px solid ${C.n[100]}` }}>
            {/* ⚕️ No Delete here (physician's decision, 2026-08-30). A patient row
                sat one mis-click away from erasing a person's whole record, next
                to the Open/Edit buttons the doctor presses all day, and a browser
                confirm() is not a brake — there is no Undo behind it. The record
                is the point of the system; nothing on this screen may destroy one.
                `useDeletePatient` and the owner-only DELETE route are left intact
                and simply have no caller, so restoring the affordance (behind a
                real confirm affordance) stays a product decision. */}
            {patients.map((p, i) => (
              <div key={p.id} style={{ borderBottom: i < patients.length - 1 ? `0.5px solid ${C.n[100]}` : "none" }}>
                <PatientRow p={toRow(p)} rightSlot={
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 6, rowGap: 6, flexShrink: 0 }}>
                    <button onClick={() => openForPrescription(p)} style={smallBtn(true)}>Open</button>
                    <button onClick={() => editPatient(p)} style={smallBtn(false)}>Edit</button>
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
