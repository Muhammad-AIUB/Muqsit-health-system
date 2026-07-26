// Shared time-axis math for the idsp tab's SVG timelines (Drug timeline,
// Health trends chart). Pure functions only — no React, no per-chart pixel
// layout (those stay local to each chart since row heights/bands differ).

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface TimeRange { lo: number; hi: number } // epoch ms, already padded

// Range spanning every given epoch-ms point, widened to >=1 month, padded 4%
// each side. null when there are no points to plot.
//
// floorLo pins the low end to a chosen instant instead of the earliest point —
// that is how the trend chart's "last 3 months" window works. Points below the
// floor still legitimately exist (a medication that started before the window
// and is still running); the caller clips them to the plot edge rather than
// dropping them, so the floor must NOT be derived from the data.
export function computeTimeRange(points: number[], floorLo?: number | null): TimeRange | null {
  if (points.length === 0 && floorLo == null) return null;
  const lo = floorLo ?? Math.min(...points);
  let hi = points.length ? Math.max(...points) : lo;
  if (hi < lo) hi = lo; // every point sits before the floor
  if (hi - lo < 1000 * 60 * 60 * 24 * 30) hi = lo + 1000 * 60 * 60 * 24 * 30; // ≥1 month wide
  const pad = (hi - lo) * 0.04;
  return { lo: lo - pad, hi: hi + pad };
}

// Linear epoch-ms → pixel-x mapper across [x0, x0 + width].
export function makeToX(range: TimeRange | null, x0: number, width: number): (t: number) => number {
  return (t: number) => x0 + (range ? ((t - range.lo) / (range.hi - range.lo)) * width : 0);
}

export interface MonthTick { label: string; x: number; showLabel: boolean }

// One gridline per month across the whole range, but only a stride-selected
// subset gets `showLabel: true` — a range spanning years would otherwise
// print a label every ~month and smear them into unreadable overlapping
// text. Gridlines still render for every month; only the text is thinned.
export function monthTicks(range: TimeRange | null, toX: (t: number) => number): MonthTick[] {
  const raw: { label: string; x: number }[] = [];
  if (!range) return [];
  let mc = new Date(range.lo);
  mc = new Date(mc.getFullYear(), mc.getMonth(), 1);
  const end = new Date(range.hi);
  while (mc <= end) {
    raw.push({ label: `${MONTHS[mc.getMonth()]} ${String(mc.getFullYear()).slice(2)}`, x: toX(mc.getTime()) });
    mc = new Date(mc.getFullYear(), mc.getMonth() + 1, 1);
  }
  const MIN_LABEL_GAP = 34; // px — roughly a "Mon YY" label's width at 9px font
  let stride = 1;
  if (raw.length > 1) {
    const avgGap = (raw[raw.length - 1].x - raw[0].x) / (raw.length - 1);
    stride = avgGap > 0 ? Math.max(1, Math.ceil(MIN_LABEL_GAP / avgGap)) : 1;
  }
  return raw.map((t, i) => ({ ...t, showLabel: i % stride === 0 }));
}

export function isInRange(t: number, range: TimeRange | null): boolean {
  return Boolean(range && t >= range.lo && t <= range.hi);
}
