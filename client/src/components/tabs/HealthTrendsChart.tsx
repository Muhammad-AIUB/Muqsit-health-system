"use client";

import { useEffect, useMemo, useState } from "react";
import { C } from "@/theme";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import type { InvFinding } from "@/lib/investigationSummary";
import { chartableParams, numericSeriesFor, type ChartableParam, type NumericPoint } from "@/lib/numericInvSeries";
import type { MentionRange } from "@/lib/drugHistorySummary";
import type { SymptomMentionRange } from "@/lib/symptomSummary";
import { computeTimeRange, makeToX, monthTicks, isInRange } from "@/lib/timelineGeometry";

interface Props {
  investigationSummary: InvFinding[];
  drugRanges: MentionRange[];
  symptomRanges: SymptomMentionRange[];
}

const DEFAULT_TRACK_LIMIT = 5;
// Only shades actually defined in theme/index.ts — several referenced shades
// elsewhere in the app (C.pri[300], C.n[400], C.warn[200]...) are undefined
// at runtime, so this rotation is deliberately restricted to real ones.
const SERIES_COLORS = [C.pri[400], C.info[400], C.warn[400], C.danger[400], C.pri[600], C.warn[600], C.info[800], C.danger[800], C.pri[800]];

const paramKey = (p: ChartableParam) => `${p.test}::${p.field}`;

// Deterministic on the parameter's identity, not its position in the
// currently-selected list — so toggling one checkbox never reassigns
// another series' color.
const seriesColor = (p: ChartableParam) => {
  const key = paramKey(p);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return SERIES_COLORS[Math.abs(h) % SERIES_COLORS.length];
};

const ddmmyyyyMs = (d: string): number => {
  const [dd, mm, yy] = d.split("/").map(Number);
  return new Date(yy || 0, (mm || 1) - 1, dd || 1).getTime() || 0;
};
const isoMs = (d: string): number => new Date(d).getTime() || 0;

export default function HealthTrendsChart({ investigationSummary, drugRanges, symptomRanges }: Props) {
  // ── Every catalog parameter that actually has ≥1 data point for this patient ──
  const findingsByTest = useMemo(() => {
    const m = new Map<string, InvFinding[]>();
    for (const f of investigationSummary) {
      const arr = m.get(f.test);
      if (arr) arr.push(f); else m.set(f.test, [f]);
    }
    return m;
  }, [investigationSummary]);

  const paramSeries = useMemo(() => {
    const out: { param: ChartableParam; points: NumericPoint[] }[] = [];
    for (const param of chartableParams()) {
      const findings = findingsByTest.get(param.test);
      if (!findings) continue;
      const points = numericSeriesFor(findings, param);
      if (points.length > 0) out.push({ param, points });
    }
    return out;
  }, [findingsByTest]);

  // ── Picker state — deliberately independent from Panel 1's hmDrugs/hmSelectedDrugs:
  // that persists server-side on every toggle, and this feature has no server
  // persistence in v1. null = defaults not yet seeded. ──
  const [selectedParams, setSelectedParams] = useState<Set<string> | null>(null);
  const [selectedDrugs, setSelectedDrugs] = useState<Set<string> | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<Set<string> | null>(null);

  // Guarded on length > 0, not just `!== null` — investigationSummary/
  // drugRanges/symptomRanges can all still be empty on the first render or
  // two after a patient loads (context state populates over a few ticks).
  // Seeding from a transiently-empty list would lock in an empty selection
  // before the real data ever arrives.
  useEffect(() => {
    if (selectedParams !== null || paramSeries.length === 0) return;
    const top = [...paramSeries]
      .filter((x) => x.points.length >= 2)
      .sort((a, b) => b.points.length - a.points.length)
      .slice(0, DEFAULT_TRACK_LIMIT);
    setSelectedParams(new Set(top.map((x) => paramKey(x.param))));
  }, [paramSeries, selectedParams]);

  useEffect(() => {
    if (selectedDrugs !== null || drugRanges.length === 0) return;
    const top = [...drugRanges].sort((a, b) => ddmmyyyyMs(b.end) - ddmmyyyyMs(a.end)).slice(0, DEFAULT_TRACK_LIMIT);
    setSelectedDrugs(new Set(top.map((r) => r.name)));
  }, [drugRanges, selectedDrugs]);

  useEffect(() => {
    if (selectedSymptoms !== null || symptomRanges.length === 0) return;
    const top = [...symptomRanges].sort((a, b) => isoMs(b.end) - isoMs(a.end)).slice(0, DEFAULT_TRACK_LIMIT);
    setSelectedSymptoms(new Set(top.map((r) => r.name)));
  }, [symptomRanges, selectedSymptoms]);

  const toggle = (set: Set<string> | null, setter: (s: Set<string>) => void, key: string) => {
    const s = new Set(set ?? []);
    if (s.has(key)) s.delete(key); else s.add(key);
    setter(s);
  };

  // ── Visible series/tracks ──
  const visibleParams = paramSeries.filter((x) => selectedParams?.has(paramKey(x.param)));
  const visibleDrugs = drugRanges.filter((r) => selectedDrugs?.has(r.name));
  const visibleSymptoms = symptomRanges.filter((r) => selectedSymptoms?.has(r.name));

  const tracks = [
    ...visibleDrugs.map((r) => ({ kind: "drug" as const, name: r.name, start: ddmmyyyyMs(r.start), end: ddmmyyyyMs(r.end) })),
    ...visibleSymptoms.map((r) => ({ kind: "symptom" as const, name: r.name, start: isoMs(r.start), end: isoMs(r.end) })),
  ];

  const allMs = [
    ...visibleParams.flatMap((x) => x.points.map((p) => ddmmyyyyMs(p.date))),
    ...tracks.flatMap((t) => [t.start, t.end]),
  ];
  const range = computeTimeRange(allMs);

  const LW = 150, PR = 16, SVG_W = 800, RH = 28, PB = 30;
  const hasPlot = visibleParams.length > 0;
  const hasGantt = tracks.length > 0;
  const PLOT_TOP = 14;
  // Each series gets its own vertical lane rather than sharing one band —
  // two flat/near-identical series would otherwise both normalize to the
  // same center line and their row labels would collide.
  const LANE_H = 45;
  const PLOT_H = hasPlot ? visibleParams.length * LANE_H : 0;
  const GANTT_TOP = PLOT_TOP + PLOT_H + (hasPlot && hasGantt ? 20 : 0);
  const bodyBottom = GANTT_TOP + tracks.length * RH;
  const chartH = Math.max(80, bodyBottom + PB);
  const areaW = SVG_W - LW - PR;
  const toX = makeToX(range, LW, areaW);
  const months = monthTicks(range, toX);
  const today = new Date();
  const todayInRange = isInRange(today.getTime(), range);

  return (
    <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.n[700], marginBottom: 4 }}>Health trend chart</div>
      <div style={{ fontSize: 10.5, color: C.n[500], marginBottom: 12 }}>
        Medication and symptom bars span first → last recorded mention for that name — not necessarily continuous use.
      </div>

      {(hasPlot || hasGantt) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8, fontSize: 10.5 }}>
          {visibleParams.map(({ param }) => (
            <span key={paramKey(param)} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.n[700] }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: seriesColor(param), display: "inline-block", flexShrink: 0 }} />
              {param.label}
            </span>
          ))}
          {visibleDrugs.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.n[700] }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: C.pri[400], display: "inline-block", flexShrink: 0 }} /> Medication
            </span>
          )}
          {visibleSymptoms.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.n[700] }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: C.warn[400], display: "inline-block", flexShrink: 0 }} /> Symptom
            </span>
          )}
        </div>
      )}

      {!hasPlot && !hasGantt ? (
        <div style={{ textAlign: "center", padding: "36px 0", color: C.n[400], fontSize: 12 }}>
          Tick a lab parameter, medication or symptom below to visualise it here.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <svg width="100%" viewBox={`0 0 ${SVG_W} ${chartH}`} style={{ display: "block", minWidth: 360 }}>
            {months.map((m, i) => (
              <g key={i}>
                <line x1={m.x} y1={PLOT_TOP} x2={m.x} y2={bodyBottom} stroke={C.n[200]} strokeWidth={0.5} />
                {m.showLabel && <text x={m.x} y={chartH - PB + 14} textAnchor="middle" fontSize={9} fill={C.n[500]}>{m.label}</text>}
              </g>
            ))}
            <line x1={LW} y1={bodyBottom} x2={SVG_W - PR} y2={bodyBottom} stroke={C.n[300]} strokeWidth={0.5} />
            {todayInRange && (
              <>
                <line x1={toX(today.getTime())} y1={PLOT_TOP} x2={toX(today.getTime())} y2={bodyBottom} stroke="#f87171" strokeWidth={1} strokeDasharray="3,3" />
                <text x={toX(today.getTime()) + 3} y={PLOT_TOP + 8} fontSize={8} fill="#f87171">Today</text>
              </>
            )}

            {hasPlot && visibleParams.map(({ param, points }, si) => {
              const color = seriesColor(param);
              const vals = points.map((p) => p.value);
              const vmin = Math.min(...vals), vmax = Math.max(...vals);
              const vspan = vmax - vmin;
              const laneTop = PLOT_TOP + si * LANE_H;
              const yOf = (v: number) => {
                const norm = vspan > 0 ? (v - vmin) / vspan : 0.5;
                return laneTop + LANE_H - 10 - norm * (LANE_H - 20);
              };
              const pxs = points.map((p) => ({ x: toX(ddmmyyyyMs(p.date)), y: yOf(p.value), label: p.label }));
              // Stagger label height when consecutive points sit too close
              // horizontally to read their text side by side — common for
              // closely-spaced visits (e.g. daily inpatient monitoring).
              const MIN_LABEL_X_GAP = 34;
              let lastLabelX = -Infinity, flip = false;
              const labeled = pxs.map((p) => {
                flip = p.x - lastLabelX < MIN_LABEL_X_GAP ? !flip : false;
                lastLabelX = p.x;
                return { ...p, dy: flip ? -16 : -7 };
              });
              return (
                <g key={paramKey(param)}>
                  <polyline points={pxs.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={1.75} />
                  {labeled.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r={2.5} fill={color} />
                      <text x={p.x} y={p.y + p.dy} textAnchor="middle" fontSize={9} fill={color}>{p.label}</text>
                    </g>
                  ))}
                  <text x={LW - 8} y={pxs[0].y + 3} textAnchor="end" fontSize={10} fontWeight={600} fill={color}>{param.label}</text>
                </g>
              );
            })}

            {tracks.map((t, idx) => {
              const cy = GANTT_TOP + idx * RH + RH / 2;
              const x1 = toX(t.start), x2 = toX(t.end);
              const color = t.kind === "drug" ? C.pri[400] : C.warn[400];
              return (
                <g key={`${t.kind}-${t.name}`}>
                  {idx % 2 === 0 && <rect x={LW} y={GANTT_TOP + idx * RH} width={areaW} height={RH} fill={C.n[50]} />}
                  <text x={LW - 8} y={cy + 4} textAnchor="end" fontSize={10} fill={C.n[700]}>
                    {t.name.length > 20 ? t.name.slice(0, 19) + "…" : t.name}
                  </text>
                  <rect x={x1} y={cy - 7} width={Math.max(6, x2 - x1)} height={14} rx={4} fill={color} opacity={0.85} />
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
        <div>
          <div style={colTitle}>Lab parameters shown</div>
          <div style={{ maxHeight: 190, overflowY: "auto" }}>
            {paramSeries.length === 0 ? (
              <div style={emptyMsg}>No numeric investigation results recorded yet.</div>
            ) : (
              [...paramSeries].sort((a, b) => a.param.label.localeCompare(b.param.label)).map(({ param, points }) => {
                const key = paramKey(param);
                return (
                  <label key={key} style={checkRow}>
                    <input type="checkbox" checked={selectedParams?.has(key) ?? false} onChange={() => toggle(selectedParams, setSelectedParams, key)} style={checkInput} />
                    <span style={checkLabel} title={param.label}>{param.label}{param.unit ? ` (${param.unit})` : ""}</span>
                    <span style={countBadge}>×{points.length}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div>
          <div style={colTitle}>Medications shown</div>
          <div style={{ maxHeight: 190, overflowY: "auto" }}>
            {drugRanges.length === 0 ? (
              <div style={emptyMsg}>No drugs in this patient&apos;s drug history yet.</div>
            ) : (
              [...drugRanges].sort((a, b) => a.name.localeCompare(b.name)).map((r) => (
                <label key={r.name} style={checkRow}>
                  <input type="checkbox" checked={selectedDrugs?.has(r.name) ?? false} onChange={() => toggle(selectedDrugs, setSelectedDrugs, r.name)} style={checkInput} />
                  <span style={checkLabel} title={r.name}>{r.name}</span>
                  <span style={rangeHint}>{r.start === r.end ? r.start : `${r.start} – ${r.end}`}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div>
          <div style={colTitle}>Symptoms shown</div>
          <div style={{ maxHeight: 190, overflowY: "auto" }}>
            {symptomRanges.length === 0 ? (
              <div style={emptyMsg}>No symptoms recorded for this patient yet.</div>
            ) : (
              [...symptomRanges].sort((a, b) => a.name.localeCompare(b.name)).map((r) => {
                const start = isoToDdmmyyyy(r.start), end = isoToDdmmyyyy(r.end);
                return (
                  <label key={r.name} style={checkRow}>
                    <input type="checkbox" checked={selectedSymptoms?.has(r.name) ?? false} onChange={() => toggle(selectedSymptoms, setSelectedSymptoms, r.name)} style={checkInput} />
                    <span style={checkLabel} title={r.name}>{r.name}</span>
                    <span style={rangeHint}>{start === end ? start : `${start} – ${end}`}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const colTitle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 };
const emptyMsg: React.CSSProperties = { fontSize: 11, color: C.n[500], padding: "4px 0" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" };
const checkInput: React.CSSProperties = { accentColor: C.pri[400], width: 13, height: 13, cursor: "pointer", flexShrink: 0 };
const checkLabel: React.CSSProperties = { fontSize: 11, color: C.n[800], flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const countBadge: React.CSSProperties = { fontSize: 9.5, color: C.n[500], flexShrink: 0 };
const rangeHint: React.CSSProperties = { fontSize: 9.5, color: C.n[500], flexShrink: 0, whiteSpace: "nowrap" };
