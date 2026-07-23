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
// C.pri[400] and C.warn[400] are deliberately absent: they mean "medication
// bar" and "symptom bar". Keeping them out of the line palette stops a lab
// series from taking on a colour that already carries a different meaning.
// Only shades that actually exist in theme/index.ts are listed — several
// shades referenced elsewhere in the app resolve to undefined at runtime.
const SERIES_COLORS = [C.info[400], C.danger[400], C.pri[600], C.warn[600], C.info[800], C.danger[800], C.pri[800], C.warn[800]];

const paramKey = (p: ChartableParam) => `${p.test}::${p.field}`;

const hashIndex = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % SERIES_COLORS.length;
};

// A parameter's preferred colour is a stable hash of its identity, so it does
// not shift as other series are toggled. But two visible series must never
// share a colour, so a collision falls through to the next free slot —
// resolved in a fixed key order rather than selection order.
const assignSeriesColors = (params: ChartableParam[]): Map<string, string> => {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const p of [...params].sort((a, b) => paramKey(a).localeCompare(paramKey(b)))) {
    const start = hashIndex(paramKey(p));
    let color = SERIES_COLORS[start];
    for (let i = 1; i <= SERIES_COLORS.length && used.has(color); i++) {
      color = SERIES_COLORS[(start + i) % SERIES_COLORS.length];
    }
    used.add(color);
    out.set(paramKey(p), color);
  }
  return out;
};

const msToDdmmyyyy = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
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
    ...visibleDrugs.map((r) => ({ kind: "drug" as const, name: r.name, start: ddmmyyyyMs(r.start), end: ddmmyyyyMs(r.end), from: r.start, to: r.end })),
    ...visibleSymptoms.map((r) => ({ kind: "symptom" as const, name: r.name, start: isoMs(r.start), end: isoMs(r.end), from: isoToDdmmyyyy(r.start), to: isoToDdmmyyyy(r.end) })),
  ];

  const allMs = [
    ...visibleParams.flatMap((x) => x.points.map((p) => ddmmyyyyMs(p.date))),
    ...tracks.flatMap((t) => [t.start, t.end]),
  ];
  const seriesColors = assignSeriesColors(visibleParams.map((v) => v.param));
  const colorFor = (p: ChartableParam) => seriesColors.get(paramKey(p)) ?? SERIES_COLORS[0];

  const range = computeTimeRange(allMs);
  // Actual data extent (the axis range itself is padded, so it would overstate
  // the window). Month labels get thinned on wide ranges, so state it plainly.
  const dataFrom = allMs.length ? Math.min(...allMs) : null;
  const dataTo = allMs.length ? Math.max(...allMs) : null;

  const LW = 150, PR = 16, SVG_W = 800, RH = 28, PB = 30;
  const hasPlot = visibleParams.length > 0;
  const hasGantt = tracks.length > 0;
  const PLOT_TOP = 14;
  // Each series gets its own vertical lane rather than sharing one band —
  // two flat/near-identical series would otherwise both normalize to the
  // same center line and their row labels would collide. The lane is taller
  // than the plotted band (LANE_PAD) so value labels have somewhere to go.
  const LANE_H = 68, LANE_PAD = 15;
  const PLOT_H = hasPlot ? visibleParams.length * LANE_H : 0;
  const GANTT_TOP = PLOT_TOP + PLOT_H + (hasPlot && hasGantt ? 20 : 0);
  const bodyBottom = GANTT_TOP + tracks.length * RH;
  const chartH = Math.max(80, bodyBottom + PB);
  const areaW = SVG_W - LW - PR;
  const PLOT_L = LW, PLOT_R = SVG_W - PR;
  const LABEL_HALF_W = 22; // ~half a "423mg/dL"-sized label at 9px
  const toX = makeToX(range, LW, areaW);
  const months = monthTicks(range, toX);
  const today = new Date();
  const todayInRange = isInRange(today.getTime(), range);

  return (
    <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.n[700], marginBottom: 4 }}>Health trend chart</div>
      <div style={{ fontSize: 10.5, color: C.n[500], marginBottom: 12 }}>
        Medication and symptom bars span first → last recorded mention for that name — not necessarily continuous use.
        A dot marks a name recorded on one date only.
      </div>

      {(hasPlot || hasGantt) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8, fontSize: 10.5 }}>
          {visibleParams.map(({ param }) => (
            <span key={paramKey(param)} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.n[700] }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: colorFor(param), display: "inline-block", flexShrink: 0 }} />
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
            {/* Hairline between stacked parameters — each has its own scale,
                so they must not read as one continuous plot. */}
            {visibleParams.slice(1).map((_, i) => (
              <line key={`lane-${i}`} x1={LW} x2={SVG_W - PR} y1={PLOT_TOP + (i + 1) * LANE_H} y2={PLOT_TOP + (i + 1) * LANE_H} stroke={C.n[100]} strokeWidth={0.5} />
            ))}
            {todayInRange && (
              <>
                <line x1={toX(today.getTime())} y1={PLOT_TOP} x2={toX(today.getTime())} y2={bodyBottom} stroke="#f87171" strokeWidth={1} strokeDasharray="3,3" />
                <text
                  x={toX(today.getTime()) + (toX(today.getTime()) > PLOT_R - 30 ? -3 : 3)}
                  y={PLOT_TOP - 4}
                  textAnchor={toX(today.getTime()) > PLOT_R - 30 ? "end" : "start"}
                  fontSize={8}
                  fill="#f87171"
                >
                  Today
                </text>
              </>
            )}

            {hasPlot && visibleParams.map(({ param, points }, si) => {
              const color = colorFor(param);
              const vals = points.map((p) => p.value);
              const vmin = Math.min(...vals), vmax = Math.max(...vals);
              const vspan = vmax - vmin;
              const laneTop = PLOT_TOP + si * LANE_H;
              const yOf = (v: number) => {
                const norm = vspan > 0 ? (v - vmin) / vspan : 0.5;
                return laneTop + LANE_H - LANE_PAD - norm * (LANE_H - 2 * LANE_PAD);
              };
              const pxs = points.map((p) => ({ x: toX(ddmmyyyyMs(p.date)), y: yOf(p.value), label: p.label, date: p.date }));
              // Place each value label in the first offset that collides with
              // nothing already placed and stays inside this parameter's lane.
              // A fixed stagger is not enough: two readings recorded on the
              // SAME date share an x but differ in y, so a constant offset can
              // still land them on top of each other — and two overlapping lab
              // values are unreadable, not merely untidy.
              const OFFSETS = [-7, 13, -18, 24, -29, 35];
              const LINE_H = 10;
              const placed: { x: number; y: number }[] = [];
              const labeled = pxs.map((p) => {
                // A label must NEVER be clipped by the plot edge either — a
                // half-cut "11g/dL" reads as "1g/dL". Anchor it inward rather
                // than centring it on a point sitting near either end.
                const anchor = p.x + LABEL_HALF_W > PLOT_R ? "end" : p.x - LABEL_HALF_W < PLOT_L ? "start" : "middle";
                let dy = OFFSETS[0];
                for (const off of OFFSETS) {
                  const ly = p.y + off;
                  if (ly < laneTop + 8 || ly > laneTop + LANE_H - 2) continue;
                  if (placed.some((q) => Math.abs(q.x - p.x) < LABEL_HALF_W * 2 && Math.abs(q.y - ly) < LINE_H)) continue;
                  dy = off;
                  break;
                }
                placed.push({ x: p.x, y: p.y + dy });
                return { ...p, dy, anchor };
              });
              return (
                <g key={paramKey(param)}>
                  <polyline points={pxs.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={1.75} />
                  {labeled.map((p, i) => {
                    // The most recent reading is what gets scanned first.
                    const latest = i === labeled.length - 1;
                    return (
                      <g key={i}>
                        <title>{`${param.label} · ${p.date} · ${p.label}`}</title>
                        <circle cx={p.x} cy={p.y} r={latest ? 4 : 2.5} fill={color} />
                        <text x={p.x} y={p.y + p.dy} textAnchor={p.anchor} fontSize={9} fontWeight={latest ? 700 : 400} fill={color}>{p.label}</text>
                      </g>
                    );
                  })}
                  <text x={LW - 8} y={laneTop + LANE_H / 2 + 3} textAnchor="end" fontSize={10} fontWeight={600} fill={color}>
                    {param.label.length > 22 ? param.label.slice(0, 21) + "…" : param.label}
                  </text>
                </g>
              );
            })}

            {tracks.map((t, idx) => {
              const cy = GANTT_TOP + idx * RH + RH / 2;
              const x1 = toX(t.start), x2 = toX(t.end);
              const color = t.kind === "drug" ? C.pri[400] : C.warn[400];
              // Recorded on a single date only: draw a point, not a stub bar.
              // A 6px-wide bar reads as "used for a short period", which is a
              // claim the data doesn't support — there is just one mention.
              const singleMention = x2 - x1 < 3;
              return (
                <g key={`${t.kind}-${t.name}`}>
                  {idx % 2 === 0 && <rect x={LW} y={GANTT_TOP + idx * RH} width={areaW} height={RH} fill={C.n[50]} />}
                  <text x={LW - 8} y={cy + 4} textAnchor="end" fontSize={10} fill={C.n[700]}>
                    {t.name.length > 20 ? t.name.slice(0, 19) + "…" : t.name}
                  </text>
                  <title>{singleMention ? `${t.name} · recorded ${t.from}` : `${t.name} · ${t.from} – ${t.to}`}</title>
                  {singleMention ? (
                    <circle cx={x1} cy={cy} r={5} fill={color} opacity={0.85} />
                  ) : (
                    <rect x={x1} y={cy - 7} width={x2 - x1} height={14} rx={4} fill={color} opacity={0.85} />
                  )}
                </g>
              );
            })}
          </svg>
          {dataFrom != null && dataTo != null && (
            <div style={{ fontSize: 9.5, color: C.n[500], textAlign: "right", marginTop: 2 }}>
              Showing {msToDdmmyyyy(dataFrom)} – {msToDdmmyyyy(dataTo)} · hover any point or bar for its date
            </div>
          )}
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
