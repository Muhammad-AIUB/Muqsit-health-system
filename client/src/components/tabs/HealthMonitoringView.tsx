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
  // Cleared on every patient change below: a failure message about the previous
  // patient sitting over the next patient's chart is worse than no message.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Re-seed whenever a different patient loads AND whenever the stored maps
  // themselves change. Keying on patient.id alone made this component the
  // source of truth for the whole map, so a refetch (window focus, or this
  // doctor's other tab / mirrored device saving an override) never reached the
  // chart — and the next save here would PUT the stale whole map back and drop
  // the other tab's edit, since the server takes whole-value writes on JSON
  // columns. Comparing the serialised server value keeps the record authoritative.
  const serverDrugDates = JSON.stringify(patient?.hmDrugDates ?? null);
  const serverSymptomDates = JSON.stringify(patient?.hmSymptomDates ?? null);
  useEffect(() => {
    setDrugDates((patient?.hmDrugDates as DrugDateMap) ?? EMPTY_DATES);
    setSymptomDates((patient?.hmSymptomDates as DrugDateMap) ?? EMPTY_DATES);
  }, [patient?.id, currentPatientId, serverDrugDates, serverSymptomDates]);

  useEffect(() => { setSaveError(null); }, [currentPatientId]);

  // A failed save must never leave the chart showing a duration the server does
  // not have: the doctor would read it back as recorded, and on the next visit
  // it would be silently gone. So the optimistic value is rolled back and said
  // out loud, and the activity entry is only written once the save landed.
  const SAVE_FAILED = "Could not save that duration — the chart has been put back to what is stored. Check the connection and try again.";

  // The patient this write belongs to travels WITH the write. Reading it from a
  // closure would leave a blur that fires as the doctor switches patients — the
  // lookup steals focus out of a date box — able to land one patient's override
  // map on another patient's record. Cheap to carry; impossible to get wrong.
  interface SavePayload { patientId: string; map: DrugDateMap; prev: DrugDateMap; note: string }

  const saveDrugDates = useMutation({
    mutationFn: ({ patientId, map }: SavePayload) => patientsApi.update(patientId, { hmDrugDates: map }),
    onSuccess: (updated, vars) => {
      qc.setQueryData(["patient", vars.patientId], updated);
      logActivity("Health monitoring", vars.note, "saved");
    },
    onError: (_err, vars) => { setDrugDates(vars.prev); setSaveError(SAVE_FAILED); },
  });
  const saveSymptomDates = useMutation({
    mutationFn: ({ patientId, map }: SavePayload) => patientsApi.update(patientId, { hmSymptomDates: map }),
    onSuccess: (updated, vars) => {
      qc.setQueryData(["patient", vars.patientId], updated);
      logActivity("Health monitoring", vars.note, "saved");
    },
    onError: (_err, vars) => { setSymptomDates(vars.prev); setSaveError(SAVE_FAILED); },
  });

  const onSaveDrugDates = (next: DrugDateMap, note: string) => {
    if (!currentPatientId) return;
    const prev = drugDates;
    setDrugDates(next);
    setSaveError(null);
    saveDrugDates.mutate({ patientId: currentPatientId, map: next, prev, note });
  };
  const onSaveSymptomDates = (next: DrugDateMap, note: string) => {
    if (!currentPatientId) return;
    const prev = symptomDates;
    setSymptomDates(next);
    setSaveError(null);
    saveSymptomDates.mutate({ patientId: currentPatientId, map: next, prev, note });
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
        saveError={saveError}
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
