"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import { useSupervisedPatients } from "@/hooks/useChat";
import { displayAge } from "@/lib/age";
import PatientChat from "@/components/prescription/PatientChat";

// 4.docx: a supervising doctor's home — the patients other doctors assigned them
// to supervise. Selecting one opens that patient's team chat (cross-doctor).
export default function MessageView() {
  const { data: patients = [], isLoading } = useSupervisedPatients();
  const [selId, setSelId] = useState<string | null>(null);
  const selected = patients.find((p) => p.id === selId) ?? null;

  const meta = (p: { dob: string | null; age: number | null; ageAsOfYear: number | null; sex: string | null; mobile: string | null }) =>
    [displayAge(p) ? `${displayAge(p)}y` : "", p.sex, p.mobile].filter(Boolean).join(" · ");

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Supervised patients</div>
      <div style={{ fontSize: 12, color: C.n[500], marginBottom: 14 }}>
        Patients other doctors have assigned you to supervise. Open one to join its team chat.
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: C.n[500], fontSize: 13 }}>Loading…</div>
      ) : patients.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", color: C.n[500] }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>◈</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.n[800] }}>No supervised patients yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>When a doctor adds you as a supervising doctor on a patient, it appears here.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "start" }}>
          <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, overflow: "hidden" }}>
            {patients.map((p, i) => {
              const on = p.id === selId;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelId(p.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 13px", border: "none", borderBottom: i < patients.length - 1 ? `0.5px solid ${C.n[100]}` : "none", background: on ? C.pri[50] : C.n[0], cursor: "pointer", fontFamily: font }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: on ? C.pri[700] : C.n[900] }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.n[500] }}>{meta(p) || "—"}</div>
                  <div style={{ fontSize: 10.5, color: C.n[400], marginTop: 1 }}>Owner: {p.ownerName || "—"}</div>
                </button>
              );
            })}
          </div>

          <div>
            {selected ? (
              <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: C.n[500] }}>
                  {[meta(selected), selected.hospitalId ? `ID ${selected.hospitalId}` : "", `Owner: ${selected.ownerName || "—"}`].filter(Boolean).join(" · ")}
                </div>
                <PatientChat patientId={selected.id} patientName={selected.name} />
              </div>
            ) : (
              <div style={{ padding: 50, textAlign: "center", color: C.n[500], fontSize: 13, border: `0.5px dashed ${C.n[200]}`, borderRadius: 10 }}>
                Select a patient to open the chat.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
