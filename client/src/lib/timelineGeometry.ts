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

export interface PlacedTick extends MonthTick {
  anchor: "start" | "middle" | "end";
  /** Where the label is WRITTEN: on its line, or from the plot's edge when
   *  centring it on a line that close to the edge would hang it outside. */
  lx: number;
  /** false: a name with no gridline — the month already under way where the
   *  plot begins (its first day is to the left of the plot). */
  line: boolean;
}

// The ticks a chart may actually DRAW, out of what `monthTicks` hands back.
//
// `monthTicks` gives one tick per calendar month the range touches, and the
// first of those months starts before the range does — to the left of the
// plot. Drawn as given, its line and its label ran through whatever stands
// beside the plot: on the health-trend chart, "Mar 26" under a medicine's name.
//
//  • Only ticks inside [left, right] keep their line.
//  • The labels keep ONE rhythm — every month, or every 2nd, or every 3rd —
//    worked out again from the lines that are kept. Thinning them one at a
//    time by the gap each happened to leave gave "Jun · Aug · Sep … Feb · Apr":
//    a month is 28 to 31 days wide, so some neighbours passed and some did not,
//    and a time axis is read by its spacing before its words.
//  • A label is about 2 × `half` wide. Centred on a line within `half` of an
//    edge it would hang outside the plot, so there it is written from the edge
//    itself — as near its own line as the plot allows.
//  • If that pushes it into the next label, the edge one gives way and the
//    rhythm starts one line later (at the right-hand edge: ends one earlier).
//  • ⚕️ The month already under way at the left edge is NAMED there, with no
//    line, when there is room before the next month's own line and name. Its
//    first day is not on the plot, so it has no gridline — and without this a
//    five-week axis showed September's readings beside the one word "Oct".
const LABEL_SPACE = 3; // between two labels' boxes; an ordinary February leaves about this much

export function ticksInPlot(ticks: MonthTick[], left: number, right: number, minGap = 34, half = 14): PlacedTick[] {
  const width = 2 * half;
  const kept: PlacedTick[] = [];
  let lead: MonthTick | null = null;
  for (const t of ticks) {
    if (t.x < left) { lead = t; continue; }
    if (t.x > right) continue;
    const anchor = t.x - half < left ? "start" : t.x + half > right ? "end" : "middle";
    kept.push({ ...t, showLabel: false, anchor, lx: anchor === "start" ? left : anchor === "end" ? right : t.x, line: true });
  }
  const from = (t: PlacedTick) => (t.anchor === "start" ? t.lx : t.anchor === "end" ? t.lx - width : t.lx - half);
  const clear = (a: PlacedTick, b: PlacedTick) => from(a) + width + LABEL_SPACE <= from(b);

  let stride = 1;
  if (kept.length > 1) {
    const avgGap = (kept[kept.length - 1].x - kept[0].x) / (kept.length - 1);
    stride = avgGap > 0 ? Math.max(1, Math.ceil(minGap / avgGap)) : 1;
  }
  let first = 0;
  while (kept[first + stride] && kept[first].anchor === "start" && !clear(kept[first], kept[first + stride])) first++;
  let last = -1;
  for (let i = first; i < kept.length; i += stride) { kept[i].showLabel = true; last = i; }
  if (last - stride >= first && kept[last].anchor === "end" && !clear(kept[last - stride], kept[last])) kept[last].showLabel = false;

  const roomForLead = right - left >= width && (kept.length === 0 || kept[0].x - half >= left + width + LABEL_SPACE);
  if (lead && roomForLead) {
    kept.unshift({ label: lead.label, x: left, lx: left, showLabel: true, anchor: "start", line: false });
  }
  return kept;
}

export function isInRange(t: number, range: TimeRange | null): boolean {
  return Boolean(range && t >= range.lo && t <= range.hi);
}
