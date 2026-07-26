"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import { useActivityLog } from "@/hooks/useActivity";
import { patientsApi, prescriptionsApi } from "@/lib/api";
import { type DrugDateMap } from "@/lib/hmDates";
import { drugMentionRanges } from "@/lib/drugHistorySummary";
import { symptomMentionRanges } from "@/lib/symptomSummary";
import HealthTrendsChart from "./HealthTrendsChart";

const dedupe = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));

const todayDdmmyyyy = (() => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
})();

const EMPTY_DATES: DrugDateMap = {};

export default function HealthMonitoringView() {
  const { drugHistory, investigationSummary, currentPatientId, activeWorkstationId, isAssistantMode } = useMuqsit();
  const { user } = useAuth();
  const logActivity = useActivityLog();

  // ── Medication tracks from the Drug history, current + legacy formats ──
  const drugRanges = useMemo(() => drugMentionRanges(drugHistory, todayDdmmyyyy), [drugHistory]);

  // ── Symptoms + tests from ALL of this patient's prescriptions ──
  const { data: prescriptions } = useQuery({
    queryKey: ["prescriptions", currentPatientId],
    queryFn: () => prescriptionsApi.listByPatient(currentPatientId as string),
    enabled: Boolean(currentPatientId),
  });
  const allSymptoms = useMemo(() => dedupe((prescriptions ?? []).flatMap((p) => p.chiefComplaints ?? [])), [prescriptions]);
  const allTests = useMemo(() => dedupe((prescriptions ?? []).flatMap((p) => p.adviceTest ?? [])), [prescriptions]);
  const symptomRanges = useMemo(() => symptomMentionRanges(prescriptions ?? []), [prescriptions]);

  // ── Duration overrides for the trend chart (persisted on the patient record).
  // hmDrugDates predates the chart — it used to drive the old "Drug timeline"
  // panel and now feeds the same bars in the chart itself. hmSymptomDates is
  // its counterpart for chief complaints. Both are DISPLAY overrides: the
  // recorded ranges still come from drugHistory / the prescriptions, and
  // neither of those is ever rewritten from here. ──
  const qc = useQueryClient();
  const { data: patient } = useQuery({
    queryKey: ["patient", currentPatientId],
    queryFn: () => patientsApi.get(currentPatientId as string),
    enabled: Boolean(currentPatientId),
  });

  const [drugDates, setDrugDates] = useState<DrugDateMap>(EMPTY_DATES);
  const [symptomDates, setSymptomDates] = useState<DrugDateMap>(EMPTY_DATES);
  // Seed from the patient record whenever a different patient loads.
  useEffect(() => {
    setDrugDates((patient?.hmDrugDates as DrugDateMap) ?? EMPTY_DATES);
    setSymptomDates((patient?.hmSymptomDates as DrugDateMap) ?? EMPTY_DATES);
  }, [patient?.id, currentPatientId]);

  const saveDrugDates = useMutation({
    mutationFn: (map: DrugDateMap) => patientsApi.update(currentPatientId as string, { hmDrugDates: map }),
    onSuccess: (updated) => qc.setQueryData(["patient", currentPatientId], updated),
  });
  const saveSymptomDates = useMutation({
    mutationFn: (map: DrugDateMap) => patientsApi.update(currentPatientId as string, { hmSymptomDates: map }),
    onSuccess: (updated) => qc.setQueryData(["patient", currentPatientId], updated),
  });

  const onSaveDrugDates = (next: DrugDateMap, note: string) => {
    setDrugDates(next);
    if (!currentPatientId) return;
    saveDrugDates.mutate(next);
    logActivity("Health monitoring", note, "saved");
  };
  const onSaveSymptomDates = (next: DrugDateMap, note: string) => {
    setSymptomDates(next);
    if (!currentPatientId) return;
    saveSymptomDates.mutate(next);
    logActivity("Health monitoring", note, "saved");
  };

  // Only the OWNER doctor may adjust durations — an assistant inside this
  // workstation and a supervising doctor viewing someone else's patient both
  // get a read-only chart. The server enforces the same rule
  // (patients.controller.ts guard + the doctorId check in patients.service.ts);
  // this only decides whether the affordance is offered.
  const effectiveDoctorId = activeWorkstationId ?? user?.id ?? null;
  const canEdit = Boolean(
    !isAssistantMode && patient?.doctorId && effectiveDoctorId && patient.doctorId === effectiveDoctorId,
  );

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Integrated health monitoring and overview</div>
      <div style={{ fontSize: 12, color: C.n[600], marginBottom: 14 }}>Track disease patterns, health trends, and plan personalised care</div>

      <HealthTrendsChart
        key={currentPatientId ?? "none"}
        investigationSummary={investigationSummary}
        drugRanges={drugRanges}
        symptomRanges={symptomRanges}
        drugDates={drugDates}
        symptomDates={symptomDates}
        canEdit={canEdit}
        onSaveDrugDates={onSaveDrugDates}
        onSaveSymptomDates={onSaveSymptomDates}
      />

      {/* ── Symptoms / Lab tests recorded across all visits ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 14, alignItems: "start" }}>
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={panelTitle}>🩺 Symptoms <span style={{ color: C.n[500], fontWeight: 400 }}>· all visits</span></div>
          {allSymptoms.length === 0 ? (
            <div style={emptyMsg}>No symptoms recorded for this patient yet.</div>
          ) : (
            allSymptoms.map((s) => (
              <div key={s} style={{ display: "flex", gap: 7, fontSize: 11, color: C.n[800], padding: "2.5px 0" }}>
                <span style={{ color: C.n[500], flexShrink: 0 }}>•</span><span>{s}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={panelTitle}>🧪 Lab tests <span style={{ color: C.n[500], fontWeight: 400 }}>· all visits</span></div>
          {allTests.length === 0 ? (
            <div style={emptyMsg}>No tests advised for this patient yet.</div>
          ) : (
            allTests.map((t) => (
              <div key={t} style={{ display: "flex", gap: 7, fontSize: 11, color: C.n[800], padding: "2.5px 0" }}>
                <span style={{ color: C.n[500], flexShrink: 0 }}>•</span><span>{t}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Export ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: C.pri[50], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>↓</div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>Export Patient&apos;s Data</div><div style={{ fontSize: 11, color: C.n[600] }}>Export this patient&apos;s drugs, symptoms and tests</div></div>
          <span style={{ color: C.n[500], fontSize: 14 }}>→</span>
        </div>
      </div>
    </div>
  );
}

const panelTitle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 };
const emptyMsg: React.CSSProperties = { fontSize: 11, color: C.n[500], padding: "4px 0" };
