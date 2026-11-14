"use client";

import { C, font } from "@/theme";
import { axisFor } from "@/lib/statistics";

// One bar chart for Settings → Statistics (physician's sheet, 11/11/2026), drawn
// by hand as an SVG like the Health-trend chart — no chart library in the app.
//
// - "days": a pair of bars for every day of the month — the light one is the
//   day's total serial (everyone booked), the dark one is how many were seen.
// - "months": one bar for every month of the year — the patients seen, its
//   number written above it.
//
// ⚕️ The drawing is NOT shrunk to a narrow screen: a count a doctor cannot read
// is one they will guess. It keeps its size and the box scrolls sideways (the
// Health-trend chart's rule). Every colour is a `C` variable, so night mode
// needs nothing; the light bar carries an outline, because a pale green alone
// has no contrast against a white page.

export type BarDatum = {
  key: string;
  /** The label under the bar: the day number, or the month's three letters. */
  label: string;
  total: number;
  seen: number;
  /** The tooltip, in words: "Tue 3 Nov: 12 booked, 9 seen". */
  tip: string;
};

const PAD = { left: 56, right: 14, top: 18, bottom: 54 };
const PLOT_H = 200;
// On a wide screen the drawing grows only so far (1.4×): a chart a screen tall
// pushes the overall numbers under it out of sight, and it is centred, not
// stretched. On a narrow one it never shrinks — the box scrolls sideways.
const MAX_SCALE = 1.4;
const HEIGHT = PAD.top + PLOT_H + PAD.bottom;
const GROUP_W = { days: 24, months: 52 } as const;

export default function VisitBarChart({ mode, bars, caption, ariaLabel }: {
  mode: "days" | "months";
  bars: BarDatum[];
  /** Under the axis: the month ("November 2026") or the year ("2026"). */
  caption: string;
  ariaLabel: string;
}) {
  const groupW = GROUP_W[mode];
  const width = PAD.left + PAD.right + groupW * bars.length;
  // The scale covers what is DRAWN: both bars of a day, only the seen bar of a month.
  const biggest = Math.max(0, ...bars.map((b) => (mode === "days" ? Math.max(b.total, b.seen) : b.seen)));
  const { top, ticks } = axisFor(biggest);
  const y = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H;
  const h = (v: number) => (v / top) * PLOT_H;

  const barW = mode === "days" ? 8 : 30;
  const gap = mode === "days" ? 1 : 0;

  return (
    <div data-stats-chart={mode} style={{ overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        style={{ display: "block", width: "100%", minWidth: width, maxWidth: width * MAX_SCALE, margin: "0 auto", height: "auto", fontFamily: font }}
      >
        {/* the scale */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={C.n[200]} strokeWidth={t === 0 ? 1 : 0.7} strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={C.n[600]}>{t}</text>
          </g>
        ))}
        <text transform={`translate(14 ${PAD.top + PLOT_H / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill={C.n[600]}>Patients</text>

        {bars.map((b, i) => {
          const x0 = PAD.left + i * groupW;
          const cx = x0 + groupW / 2;
          return (
            <g key={b.key} data-bar={b.key}>
              <title>{b.tip}</title>
              {/* the whole column answers the pointer, so a day with nobody still has its tooltip */}
              <rect x={x0} y={PAD.top} width={groupW} height={PLOT_H} fill="none" pointerEvents="all" />
              {mode === "days" ? (
                <>
                  <rect data-kind="total" x={cx - barW - gap / 2} y={y(b.total)} width={barW} height={h(b.total)} fill={C.ok[100]} stroke={C.ok[400]} strokeWidth={b.total > 0 ? 0.8 : 0} />
                  <rect data-kind="seen" x={cx + gap / 2} y={y(b.seen)} width={barW} height={h(b.seen)} fill={C.ok[600]} />
                </>
              ) : (
                <>
                  <rect data-kind="seen" x={cx - barW / 2} y={y(b.seen)} width={barW} height={h(b.seen)} rx={2} fill={C.ok[600]} />
                  {b.seen > 0 && <text data-kind="value" x={cx} y={y(b.seen) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill={C.n[800]}>{b.seen}</text>}
                </>
              )}
              <text x={cx} y={PAD.top + PLOT_H + 16} textAnchor="middle" fontSize={mode === "days" ? 10 : 11.5} fill={C.n[600]}>{b.label}</text>
            </g>
          );
        })}

        <text x={PAD.left + (groupW * bars.length) / 2} y={HEIGHT - 10} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.n[800]}>{caption}</text>
      </svg>
    </div>
  );
}
