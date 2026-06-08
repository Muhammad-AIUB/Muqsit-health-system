"use client";

import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { ptHealthDrugs, ptHealthSymptoms, ptHealthTests } from "@/data/health";
import type { HealthDrug, HealthSymptom, HealthTest } from "@/types";

type Track =
  | { type: "drug"; item: HealthDrug }
  | { type: "symptom"; item: HealthSymptom }
  | { type: "test"; item: HealthTest };

const IDSP_MENU = [
  { t: "Disease trend analysis", d: "View disease patterns — weekly, monthly, seasonal trends", i: "📊", c: C.info },
  { t: "IDSP Form P/L/S reporting", d: "Generate and submit presumptive, lab-confirmed, and syndromic forms", i: "📋", c: C.warn },
  { t: "Outbreak detection", d: "Automated alerts when case counts exceed threshold", i: "⚠️", c: C.danger },
  { t: "Area-wise mapping", d: "Geographic heatmap of disease cases by patient address", i: "🗺️", c: C.pri },
  { t: "Vaccination tracking", d: "Track immunization coverage and pending vaccinations", i: "💉", c: C.info },
  { t: "Export IDSP data", d: "Export surveillance reports for health authorities", i: "↓", c: C.pri },
];

export default function HealthMonitoringView() {
  const { hmDrugs, setHmDrugs, hmSymptoms, setHmSymptoms, hmTests, setHmTests } = useMuqsit();

  const RANGE_START = new Date("2026-01-01");
  const RANGE_END = new Date("2026-05-17");
  const toXPct = (ds: string) => ((new Date(ds).getTime() - RANGE_START.getTime()) / (RANGE_END.getTime() - RANGE_START.getTime())) * 100;

  const selDrugs = ptHealthDrugs.filter((d) => hmDrugs.has(d.name));
  const selSymptoms = ptHealthSymptoms.filter((s) => hmSymptoms.has(s.name));
  const selTests = ptHealthTests.filter((t) => hmTests.has(t.name));
  const tracks: Track[] = [
    ...selDrugs.map((d): Track => ({ type: "drug", item: d })),
    ...selSymptoms.map((s): Track => ({ type: "symptom", item: s })),
    ...selTests.map((t): Track => ({ type: "test", item: t })),
  ];

  const LW = 148, PR = 16, PT = 20, PB = 36, RH = 34, SVG_W = 800;
  const chartH = Math.max(90, tracks.length * RH + PT + PB);
  const areaW = SVG_W - LW - PR;
  const toX = (ds: string) => LW + (toXPct(ds) / 100) * areaW;

  const months: { label: string; x: number }[] = [];
  let mc = new Date(RANGE_START);
  while (mc <= RANGE_END) {
    months.push({ label: mc.toLocaleString("default", { month: "short" }), x: toX(mc.toISOString().slice(0, 10)) });
    mc = new Date(mc.getFullYear(), mc.getMonth() + 1, 1);
  }
  const todayX = toX("2026-05-17");

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Integrated health monitoring and overview</div>
      <div style={{ fontSize: 12, color: C.n[600], marginBottom: 14 }}>Track disease patterns, health trends, and plan personalised care</div>

      {/* ── TIMELINE CHART ── */}
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.n[700], marginBottom: 10 }}>Timeline · Jan – May 2026</div>
        {tracks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 0", color: C.n[400], fontSize: 12 }}>
            Select drugs, symptoms, or tests below to visualise on the timeline
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <svg width="100%" viewBox={`0 0 ${SVG_W} ${chartH}`} style={{ display: "block", minWidth: 360 }}>
              {/* gridlines + month labels */}
              {months.map((m) => (
                <g key={m.label}>
                  <line x1={m.x} y1={PT} x2={m.x} y2={chartH - PB} stroke={C.n[200]} strokeWidth={0.5} />
                  <text x={m.x} y={chartH - PB + 14} textAnchor="middle" fontSize={9} fill={C.n[500]}>{m.label}</text>
                </g>
              ))}
              {/* x-axis */}
              <line x1={LW} y1={chartH - PB} x2={SVG_W - PR} y2={chartH - PB} stroke={C.n[300]} strokeWidth={0.5} />
              {/* today line */}
              <line x1={todayX} y1={PT} x2={todayX} y2={chartH - PB} stroke="#f87171" strokeWidth={1} strokeDasharray="3,3" />
              <text x={todayX + 3} y={PT + 8} fontSize={8} fill="#f87171">Today</text>

              {tracks.map((track, idx) => {
                const item = track.item;
                const cy = PT + idx * RH + RH / 2;
                const rowBg = idx % 2 === 0;
                return (
                  <g key={item.name}>
                    {rowBg && <rect x={LW} y={PT + idx * RH} width={areaW} height={RH} fill={C.n[50]} />}
                    <text x={LW - 8} y={cy + 4} textAnchor="end" fontSize={10} fill={C.n[700]}>
                      {item.name.length > 18 ? item.name.slice(0, 17) + "…" : item.name}
                    </text>

                    {track.type === "drug" && (() => {
                      const drug = track.item;
                      const x1 = toX(drug.start), x2 = toX(drug.end);
                      return (
                        <g>
                          <rect x={x1} y={cy - 8} width={Math.max(6, x2 - x1)} height={16} rx={4} fill={drug.color} opacity={0.85} />
                        </g>
                      );
                    })()}

                    {track.type === "symptom" && track.item.data.map((pt) => {
                      const cx = toX(pt.d), r = 4 + pt.v * 1.4;
                      return (
                        <g key={pt.d}>
                          <circle cx={cx} cy={cy} r={r} fill={track.item.color} opacity={0.75} />
                          <text x={cx} y={cy + 3} textAnchor="middle" fontSize={7} fill="#fff" fontWeight="600">{pt.v}</text>
                        </g>
                      );
                    })}

                    {track.type === "test" && (() => {
                      const test = track.item;
                      if (!test.data.length) return null;
                      const vals = test.data.map((p) => p.v);
                      const maxV = Math.max(...vals) * 1.25 || 1;
                      const pts = test.data.map((pt) => ({
                        cx: toX(pt.d),
                        cy: cy + 12 - (pt.v / maxV) * 24,
                        v: pt.v,
                      }));
                      const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.cx},${p.cy}`).join(" ");
                      return (
                        <g>
                          {pts.length > 1 && <path d={path} fill="none" stroke={test.color} strokeWidth={1.5} strokeLinejoin="round" />}
                          {pts.map((p, i) => (
                            <g key={i}>
                              <circle cx={p.cx} cy={p.cy} r={3.5} fill={test.color} />
                              <text x={p.cx} y={p.cy - 5} textAnchor="middle" fontSize={8} fill={test.color} fontWeight="600">{p.v}</text>
                            </g>
                          ))}
                        </g>
                      );
                    })()}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* ── CHECKBOXES ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        {/* Drugs */}
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>💊 Drugs</div>
          {ptHealthDrugs.map((d) => (
            <label key={d.name} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={hmDrugs.has(d.name)} onChange={(e) => { const s = new Set(hmDrugs); if (e.target.checked) s.add(d.name); else s.delete(d.name); setHmDrugs(s); }} style={{ accentColor: d.color, width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.n[800], lineHeight: 1.3 }}>{d.name}</span>
            </label>
          ))}
        </div>

        {/* Symptoms */}
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>🩺 Symptoms</div>
          <label style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox"
              checked={hmSymptoms.size === ptHealthSymptoms.length && ptHealthSymptoms.length > 0}
              onChange={(e) => setHmSymptoms(e.target.checked ? new Set(ptHealthSymptoms.map((s) => s.name)) : new Set())}
              style={{ width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.n[500], fontStyle: "italic" }}>All symptoms</span>
          </label>
          {ptHealthSymptoms.map((s) => (
            <label key={s.name} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={hmSymptoms.has(s.name)} onChange={(e) => { const ns = new Set(hmSymptoms); if (e.target.checked) ns.add(s.name); else ns.delete(s.name); setHmSymptoms(ns); }} style={{ accentColor: s.color, width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.n[800] }}>{s.name}</span>
            </label>
          ))}
        </div>

        {/* Tests */}
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>🧪 Lab Tests</div>
          {ptHealthTests.map((t) => (
            <label key={t.name} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={hmTests.has(t.name)} onChange={(e) => { const ns = new Set(hmTests); if (e.target.checked) ns.add(t.name); else ns.delete(t.name); setHmTests(ns); }} style={{ accentColor: t.color, width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.n[800] }}>{t.name} <span style={{ color: C.n[400], fontSize: 10 }}>({t.unit})</span></span>
            </label>
          ))}
        </div>
      </div>

      {/* ── STATS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        <div style={{ background: C.danger[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.danger[800] }}>Active alerts</div><div style={{ fontSize: 22, fontWeight: 500, color: C.danger[800] }}>3</div><div style={{ fontSize: 10, color: C.danger[800], marginTop: 2 }}>Dengue, Typhoid, Viral</div></div>
        <div style={{ background: C.warn[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.warn[800] }}>This week cases</div><div style={{ fontSize: 22, fontWeight: 500, color: C.warn[800] }}>47</div><div style={{ fontSize: 10, color: C.warn[800], marginTop: 2 }}>↑ 12% from last week</div></div>
        <div style={{ background: C.pri[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.pri[600] }}>Reports submitted</div><div style={{ fontSize: 22, fontWeight: 500, color: C.pri[600] }}>12</div><div style={{ fontSize: 10, color: C.pri[600], marginTop: 2 }}>All up to date</div></div>
      </div>

      {/* ── MENU ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {IDSP_MENU.map((s) => (
          <div key={s.t} style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: s.c[50], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{s.i}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{s.t}</div><div style={{ fontSize: 11, color: C.n[600] }}>{s.d}</div></div>
            <span style={{ color: C.n[500], fontSize: 14 }}>→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
