"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { patientsApi, prescriptionsApi } from "@/lib/api";
import { cellToDate, normaliseDateCell, type DrugDateMap } from "@/lib/hmDates";
import { drugMentionRanges } from "@/lib/drugHistorySummary";
import { symptomMentionRanges } from "@/lib/symptomSummary";
import { computeTimeRange, makeToX, monthTicks, isInRange } from "@/lib/timelineGeometry";
import HealthTrendsChart from "./HealthTrendsChart";

const dedupe = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));

const todayDdmmyyyy = (() => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
})();

export default function HealthMonitoringView() {
  const { drugHistory, investigationSummary, currentPatientId, hmDrugs, setHmDrugs } = useMuqsit();

  // ── Panel 1: drugs from the Drug history, current + legacy formats ──
  // (previously matched only the legacy "Current:"/"Past:" format, so any
  // patient using the current dd/mm/yyyy format got a silently empty list)
  const drugRanges = useMemo(() => drugMentionRanges(drugHistory, todayDdmmyyyy), [drugHistory]);
  const historyDrugs = useMemo(() => drugRanges.map((r) => r.name), [drugRanges]);

  // ── Panels 2 & 3: symptoms + tests from ALL of this patient's prescriptions ──
  const { data: prescriptions } = useQuery({
    queryKey: ["prescriptions", currentPatientId],
    queryFn: () => prescriptionsApi.listByPatient(currentPatientId as string),
    enabled: Boolean(currentPatientId),
  });
  const allSymptoms = useMemo(() => dedupe((prescriptions ?? []).flatMap((p) => p.chiefComplaints ?? [])), [prescriptions]);
  const allTests = useMemo(() => dedupe((prescriptions ?? []).flatMap((p) => p.adviceTest ?? [])), [prescriptions]);
  const symptomRanges = useMemo(() => symptomMentionRanges(prescriptions ?? []), [prescriptions]);

  // ── Per-drug Start-from / Upto dates (persisted on the patient record) ──
  const qc = useQueryClient();
  const { data: patient } = useQuery({
    queryKey: ["patient", currentPatientId],
    queryFn: () => patientsApi.get(currentPatientId as string),
    enabled: Boolean(currentPatientId),
  });
  const saveDates = useMutation({
    mutationFn: (map: DrugDateMap) => patientsApi.update(currentPatientId as string, { hmDrugDates: map }),
    onSuccess: (updated) => qc.setQueryData(["patient", currentPatientId], updated),
  });

  const [dates, setDates] = useState<DrugDateMap>({});
  // Seed from the patient record whenever a different patient loads.
  useEffect(() => { setDates((patient?.hmDrugDates as DrugDateMap) ?? {}); }, [patient?.id, currentPatientId]);

  const cellOf = (name: string) => dates[name] ?? { sf: "", upto: "" };
  const setCell = (name: string, field: "sf" | "upto", value: string) =>
    setDates((prev) => ({ ...prev, [name]: { ...(prev[name] ?? { sf: "", upto: "" }), [field]: value } }));
  const normaliseCell = (name: string, field: "sf" | "upto") =>
    setDates((prev) => {
      const cell = prev[name] ?? { sf: "", upto: "" };
      const next = { ...prev, [name]: { ...cell, [field]: normaliseDateCell(cell[field]) } };
      if (currentPatientId) saveDates.mutate(next);
      return next;
    });

  const toggleDrug = (name: string, on: boolean) => {
    const s = new Set(hmDrugs);
    if (on) s.add(name); else s.delete(name);
    setHmDrugs(s);
    if (currentPatientId) {
      void patientsApi.update(currentPatientId, { hmSelectedDrugs: Array.from(s) }).catch(() => {});
    }
  };

  // ── Timeline (drug bars: Start-from → Upto, or today if Upto is blank) ──
  const today = new Date();
  const bars = historyDrugs
    .filter((name) => hmDrugs.has(name))
    .map((name) => {
      const cell = cellOf(name);
      const start = cellToDate(cell.sf);
      if (!start) return null;
      const end = cellToDate(cell.upto) ?? today;
      return { name, start, end: end < start ? start : end };
    })
    .filter((b): b is { name: string; start: Date; end: Date } => b !== null);

  const range = computeTimeRange(bars.flatMap((b) => [b.start.getTime(), b.end.getTime()]));

  const LW = 150, PR = 16, PT = 18, PB = 34, RH = 30, SVG_W = 800;
  const chartH = Math.max(90, bars.length * RH + PT + PB);
  const areaW = SVG_W - LW - PR;
  const toX = makeToX(range, LW, areaW);

  const months = monthTicks(range, toX);
  const todayInRange = isInRange(today.getTime(), range);

  const dateInput: React.CSSProperties = { width: 92, padding: "3px 6px", borderRadius: 5, border: `0.5px solid ${C.n[200]}`, fontSize: 10.5, outline: "none", color: C.n[800], background: C.n[0] };

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Integrated health monitoring and overview</div>
      <div style={{ fontSize: 12, color: C.n[600], marginBottom: 14 }}>Track disease patterns, health trends, and plan personalised care</div>

      {/* ── TIMELINE ── */}
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.n[700], marginBottom: 10 }}>Drug timeline</div>
        {bars.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 0", color: C.n[400], fontSize: 12 }}>
            Tick drugs below and set their <b>Start from</b> date to visualise them here.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <svg width="100%" viewBox={`0 0 ${SVG_W} ${chartH}`} style={{ display: "block", minWidth: 360 }}>
              {months.map((m, i) => (
                <g key={i}>
                  <line x1={m.x} y1={PT} x2={m.x} y2={chartH - PB} stroke={C.n[200]} strokeWidth={0.5} />
                  {m.showLabel && <text x={m.x} y={chartH - PB + 14} textAnchor="middle" fontSize={9} fill={C.n[500]}>{m.label}</text>}
                </g>
              ))}
              <line x1={LW} y1={chartH - PB} x2={SVG_W - PR} y2={chartH - PB} stroke={C.n[300]} strokeWidth={0.5} />
              {todayInRange && (
                <>
                  <line x1={toX(today.getTime())} y1={PT} x2={toX(today.getTime())} y2={chartH - PB} stroke="#f87171" strokeWidth={1} strokeDasharray="3,3" />
                  <text x={toX(today.getTime()) + 3} y={PT + 8} fontSize={8} fill="#f87171">Today</text>
                </>
              )}
              {bars.map((b, idx) => {
                const cy = PT + idx * RH + RH / 2;
                const x1 = toX(b.start.getTime()), x2 = toX(b.end.getTime());
                return (
                  <g key={b.name}>
                    {idx % 2 === 0 && <rect x={LW} y={PT + idx * RH} width={areaW} height={RH} fill={C.n[50]} />}
                    <text x={LW - 8} y={cy + 4} textAnchor="end" fontSize={10} fill={C.n[700]}>
                      {b.name.length > 20 ? b.name.slice(0, 19) + "…" : b.name}
                    </text>
                    <rect x={x1} y={cy - 7} width={Math.max(6, x2 - x1)} height={14} rx={4} fill={C.pri[400]} opacity={0.85} />
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* ── PANELS 1/2/3 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 14, alignItems: "start" }}>
        {/* 1 · Drugs from Drug history, each with Start-from / Upto */}
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={panelTitle}>💊 Drugs <span style={{ color: C.n[400], fontWeight: 400 }}>· from drug history</span></div>
          {historyDrugs.length === 0 ? (
            <div style={emptyMsg}>No drugs in this patient&apos;s drug history yet.</div>
          ) : (
            historyDrugs.map((name) => {
              const cell = cellOf(name);
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                  <input type="checkbox" checked={hmDrugs.has(name)} onChange={(e) => toggleDrug(name, e.target.checked)} style={{ accentColor: C.pri[400], width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: C.n[800], flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>{name}</span>
                  <input value={cell.sf} onChange={(e) => setCell(name, "sf", e.target.value)} onBlur={() => normaliseCell(name, "sf")} placeholder="SF (e.g. 120614)" title="Start from — type DDMMYY" style={dateInput} />
                  <input value={cell.upto} onChange={(e) => setCell(name, "upto", e.target.value)} onBlur={() => normaliseCell(name, "upto")} placeholder="Upto (today)" title="Upto — blank = till today" style={dateInput} />
                </div>
              );
            })
          )}
        </div>

        {/* 2 · Symptoms from all prescriptions */}
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={panelTitle}>🩺 Symptoms <span style={{ color: C.n[400], fontWeight: 400 }}>· all visits</span></div>
          {allSymptoms.length === 0 ? (
            <div style={emptyMsg}>No symptoms recorded for this patient yet.</div>
          ) : (
            allSymptoms.map((s) => (
              <div key={s} style={{ display: "flex", gap: 7, fontSize: 11, color: C.n[800], padding: "2.5px 0" }}>
                <span style={{ color: C.n[400], flexShrink: 0 }}>•</span><span>{s}</span>
              </div>
            ))
          )}
        </div>

        {/* 3 · Lab tests done for this patient */}
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={panelTitle}>🧪 Lab tests <span style={{ color: C.n[400], fontWeight: 400 }}>· all visits</span></div>
          {allTests.length === 0 ? (
            <div style={emptyMsg}>No tests advised for this patient yet.</div>
          ) : (
            allTests.map((t) => (
              <div key={t} style={{ display: "flex", gap: 7, fontSize: 11, color: C.n[800], padding: "2.5px 0" }}>
                <span style={{ color: C.n[400], flexShrink: 0 }}>•</span><span>{t}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <HealthTrendsChart
        key={currentPatientId ?? "none"}
        investigationSummary={investigationSummary}
        drugRanges={drugRanges}
        symptomRanges={symptomRanges}
      />

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
