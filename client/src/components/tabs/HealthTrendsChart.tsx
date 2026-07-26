"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "@/theme";
import type { InvFinding } from "@/lib/investigationSummary";
import { chartableParams, numericSeriesFor, type ChartableParam, type NumericPoint } from "@/lib/numericInvSeries";
import type { MentionRange } from "@/lib/drugHistorySummary";
import type { SymptomMentionRange } from "@/lib/symptomSummary";
import { cellToDate, type DrugDateMap } from "@/lib/hmDates";
import { isImplausibleDate, YEAR_POLICY } from "@/lib/dateInput";
import { computeTimeRange, makeToX, monthTicks, isInRange } from "@/lib/timelineGeometry";

interface Props {
  investigationSummary: InvFinding[];
  drugRanges: MentionRange[];
  symptomRanges: SymptomMentionRange[];
  // Per-patient duration OVERRIDES. Display-only: the derived range keeps coming
  // from drugHistory / the prescriptions, and neither is ever rewritten.
  drugDates: DrugDateMap;
  symptomDates: DrugDateMap;
  // Owner doctor only — mirrors the server guard in patients.controller.ts.
  canEdit: boolean;
  // Set when a save was rejected and the shown value rolled back.
  saveError: string | null;
  onSaveDrugDates: (next: DrugDateMap, note: string) => void;
  onSaveSymptomDates: (next: DrugDateMap, note: string) => void;
}

const DEFAULT_TRACK_LIMIT = 5;
// C.pri[400] and C.warn[400] are deliberately absent: they mean "medication
// bar" and "symptom bar". Keeping them out of the line palette stops a lab
// series from taking on a colour that already carries a different meaning.
// Only shades that actually exist in theme/index.ts are listed — several
// shades referenced elsewhere in the app resolve to undefined at runtime.
const SERIES_COLORS = [C.info[400], C.danger[400], C.pri[600], C.warn[600], C.info[800], C.danger[800], C.pri[800], C.warn[800]];

type WindowKey = "3m" | "6m" | "1y" | "all";
const WINDOW_OPTIONS: { key: WindowKey; label: string }[] = [
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "1y", label: "Last 1 year" },
  { key: "all", label: "All available data" },
];

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

// Both return NaN — not a fallback instant — when the stored string is not a
// real date. The previous `|| 0` turned an unreadable date into epoch 0, and
// `yy || 0` turned a missing year into 1900, so ONE malformed record stretched
// the shared axis across 126 years and squeezed every real value into a couple
// of pixels. Callers drop what they cannot place and say how many.
const DDMMYYYY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ddmmyyyyMs = (d: string): number => {
  const m = DDMMYYYY_RE.exec((d ?? "").trim());
  if (!m) return NaN;
  const dd = +m[1], mm = +m[2], yy = +m[3];
  const dt = new Date(yy, mm - 1, dd);
  // Reject rolled-over calendar dates: new Date(2026, 1, 31) is 3 March, and
  // drawing 31/02/2026 there would present a date the record never held.
  const ok = dt.getFullYear() === yy && dt.getMonth() === mm - 1 && dt.getDate() === dd;
  return ok ? dt.getTime() : NaN;
};
const isoMs = (d: string): number => {
  const t = new Date(d ?? "").getTime();
  return Number.isFinite(t) ? t : NaN;
};

// A numeric reading with its date already parsed to an instant (NaN = the
// stored date could not be read).
type PlottedPoint = NumericPoint & { ms: number };

type TrackKind = "drug" | "symptom";

// One medication/symptom row. `rec*` is what the patient's records actually
// say; `start`/`end` is what the chart draws after the doctor's override. Both
// are kept so the tooltip can show them side by side — a chart that silently
// replaced the recorded range with an opinion would be unsafe to read later.
interface Track {
  kind: TrackKind;
  name: string;
  recStart: number;
  recEnd: number;
  recFrom: string;
  recTo: string;
  start: number;
  end: number;
  from: string;
  to: string;
  overridden: boolean;
}

const buildTrack = (
  kind: TrackKind,
  name: string,
  recStart: number,
  recEnd: number,
  cell: { sf: string; upto: string } | undefined,
): Track => {
  const ovStart = cellToDate(cell?.sf ?? "");
  const ovEnd = cellToDate(cell?.upto ?? "");
  const start = ovStart ? ovStart.getTime() : recStart;
  let end = ovEnd ? ovEnd.getTime() : recEnd;
  if (end < start) end = start; // same clamp the old Drug timeline applied
  return {
    kind,
    name,
    recStart,
    recEnd,
    recFrom: msToDdmmyyyy(recStart),
    recTo: msToDdmmyyyy(recEnd),
    start,
    end,
    from: msToDdmmyyyy(start),
    to: msToDdmmyyyy(end),
    overridden: Boolean(ovStart || ovEnd),
  };
};

const cellHasOverride = (cell?: { sf: string; upto: string }) =>
  Boolean(cellToDate(cell?.sf ?? "") || cellToDate(cell?.upto ?? ""));

// An override drives the whole shared time axis, so an implausible date does
// not merely mislabel one bar — it stretches the axis and squeezes every lab
// value and every other bar into a few unreadable pixels.
//
// DDMMYY no longer forces 2000-2099 — parseShorthandDate runs the shared sliding
// century window, so 010198 is 1998. This guard stays as the backstop for a date
// typed out in full (01/01/2099) and reads the same constant the parser does, so
// the two can no longer drift apart.
const FUTURE_LIMIT_YEARS = YEAR_POLICY.clinical;
const implausibleReason = (d: Date): string | null => {
  if (isImplausibleDate(d, FUTURE_LIMIT_YEARS)) {
    return `That date is more than ${FUTURE_LIMIT_YEARS} years away — check the year, e.g. 01/01/1998.`;
  }
  if (d.getFullYear() < 1900) return "That date is before 1900 — type the full date, e.g. 01/01/1998.";
  return null;
};

// Activity `detail` is capped at 400 chars server-side (activity.dto.ts) and a
// chief complaint is free text, so the name is trimmed before it goes into the
// audit line. The stored override always keeps the full, exact key.
const activityName = (name: string) => (name.length > 120 ? name.slice(0, 119) + "…" : name);

export default function HealthTrendsChart({
  investigationSummary,
  drugRanges,
  symptomRanges,
  drugDates,
  symptomDates,
  canEdit,
  saveError,
  onSaveDrugDates,
  onSaveSymptomDates,
}: Props) {
  // ── Every catalog parameter that actually has ≥1 data point for this patient ──
  const findingsByTest = useMemo(() => {
    const m = new Map<string, InvFinding[]>();
    for (const f of investigationSummary) {
      const arr = m.get(f.test);
      if (arr) arr.push(f); else m.set(f.test, [f]);
    }
    return m;
  }, [investigationSummary]);

  // Each point carries its parsed instant. Every render below filters by window,
  // measures the axis and positions a dot from the same date, and every
  // keystroke in a duration box re-renders the whole chart — so parsing the
  // string each time meant thousands of repeated regex+Date builds per keystroke
  // on a patient with a long investigation history. Parse once, compare numbers.
  // NaN means the stored date is unreadable; the callers count those and say so.
  const paramSeries = useMemo(() => {
    const out: { param: ChartableParam; points: PlottedPoint[] }[] = [];
    for (const param of chartableParams()) {
      const findings = findingsByTest.get(param.test);
      if (!findings) continue;
      const points = numericSeriesFor(findings, param).map((p) => ({ ...p, ms: ddmmyyyyMs(p.date) }));
      if (points.length > 0) out.push({ param, points });
    }
    return out;
  }, [findingsByTest]);

  // ── Picker state — deliberately independent from the drug checkboxes that used
  // to persist to hmSelectedDrugs on every toggle. Which tracks are on screen is
  // a viewing choice, not patient data. null = defaults not yet seeded. ──
  const [selectedParams, setSelectedParams] = useState<Set<string> | null>(null);
  const [selectedDrugs, setSelectedDrugs] = useState<Set<string> | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<Set<string> | null>(null);

  // Time window. Defaults to "all" so the chart opens showing the patient's
  // whole history — narrowing is always the doctor's deliberate act, never a
  // default that quietly hides an old but relevant trend. Not persisted.
  const [windowKey, setWindowKey] = useState<WindowKey>("all");

  // Per-column edit mode + in-progress text. The committed values live on the
  // patient record; these drafts are only what is currently being typed.
  const [editDrugs, setEditDrugs] = useState(false);
  const [editSymptoms, setEditSymptoms] = useState(false);
  const [drugDraft, setDrugDraft] = useState<DrugDateMap>(drugDates);
  const [symptomDraft, setSymptomDraft] = useState<DrugDateMap>(symptomDates);
  // key → why it was rejected, so the field can say what to type instead.
  const [invalidCells, setInvalidCells] = useState<Map<string, string>>(new Map());
  // Set by Escape so the blur it triggers abandons rather than commits.
  const cancellingRef = useRef(false);

  useEffect(() => { setDrugDraft(drugDates); }, [drugDates]);
  useEffect(() => { setSymptomDraft(symptomDates); }, [symptomDates]);

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

  // ── Effective (post-override) tracks. Overrides are applied BEFORE the window
  // is, so a bar the doctor just moved into the window shows up and one they
  // moved out of it disappears — filtering on the recorded dates first would do
  // the opposite of what they asked for. ──
  // A track whose recorded dates cannot be read has no place on a time axis;
  // it is dropped rather than pinned to a made-up instant, and counted below so
  // the omission is stated instead of silent.
  const drugTracks = useMemo(
    () => drugRanges
      .map((r) => ({ r, s: ddmmyyyyMs(r.start), e: ddmmyyyyMs(r.end) }))
      .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e))
      .map(({ r, s, e }) => buildTrack("drug", r.name, s, e, drugDates[r.name])),
    [drugRanges, drugDates],
  );
  const symptomTracks = useMemo(
    () => symptomRanges
      .map((r) => ({ r, s: isoMs(r.start), e: isoMs(r.end) }))
      .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e))
      .map(({ r, s, e }) => buildTrack("symptom", r.name, s, e, symptomDates[r.name])),
    [symptomRanges, symptomDates],
  );

  // ── Time window bounds. Only the LOWER bound is clamped: a doctor can record
  // a future-dated finding or set an Upto past today, and no window may hide
  // something that was actually entered. ──
  const windowLo = useMemo<number | null>(() => {
    if (windowKey === "all") return null;
    const now = new Date();
    const day = now.getDate();
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    if (windowKey === "3m") d.setMonth(d.getMonth() - 3);
    else if (windowKey === "6m") d.setMonth(d.getMonth() - 6);
    else d.setFullYear(d.getFullYear() - 1);
    // Month-end overflow: 31 Jul minus 3 months lands on 1 May, not 30 Apr, and
    // 29 Feb minus a year lands on 1 Mar. That shortens the window by a day and
    // could drop a reading dated on the boundary, so pull it back to the last
    // day of the intended month.
    if (d.getDate() !== day) d.setDate(0);
    return d.getTime();
  }, [windowKey]);

  const tickedParams = paramSeries.filter((x) => selectedParams?.has(paramKey(x.param)));
  const tickedTracks = [
    ...drugTracks.filter((t) => selectedDrugs?.has(t.name)),
    ...symptomTracks.filter((t) => selectedSymptoms?.has(t.name)),
  ];

  // A track stays visible when it OVERLAPS the window, not only when it fits
  // inside it. A drug started two years ago and still running must never vanish
  // from "last 3 months" — that reads as "the patient is not on it".
  const tracks = tickedTracks.filter((t) => windowLo == null || t.end >= windowLo);

  // Lab points are filtered to the window, but a ticked parameter never loses
  // its lane: an empty lane says "no reading here", a missing lane would say
  // "never measured".
  const lanes = tickedParams.map(({ param, points }) => {
    const placeable = points.filter((p) => Number.isFinite(p.ms));
    return {
      param,
      points: windowLo == null ? placeable : placeable.filter((p) => p.ms >= windowLo),
      allPoints: placeable,
    };
  });

  // Anything the timeline could not place. Never silently dropped: the record
  // still holds it, and the doctor is told the chart is not showing everything.
  const unplaceable =
    paramSeries.reduce((n, x) => n + x.points.filter((p) => !Number.isFinite(p.ms)).length, 0) +
    (drugRanges.length - drugTracks.length) +
    (symptomRanges.length - symptomTracks.length);

  // Readable, drawn, but dated implausibly far ahead — almost always a record
  // written by the old DDMMYY parser, which forced every 2-digit year into
  // 2000-2099 (010198 became 2098). These are NOT dropped and NOT rewritten;
  // they are counted so the doctor knows which dates to look at.
  const aheadDated =
    paramSeries.reduce(
      (n, x) => n + x.points.filter((p) => Number.isFinite(p.ms) && isImplausibleDate(new Date(p.ms), FUTURE_LIMIT_YEARS)).length,
      0,
    ) + tracks.filter((t) => isImplausibleDate(new Date(t.end), FUTURE_LIMIT_YEARS)).length;

  const allMs = [
    ...lanes.flatMap((x) => x.points.map((p) => p.ms)),
    ...tracks.flatMap((t) => [t.start, t.end]),
  ];
  const today = new Date();
  // With a window active the axis spans the whole window even when the newest
  // reading is older than today, so "Today" lands where it belongs.
  const axisMs = windowLo == null ? allMs : [...allMs, today.getTime()];

  const seriesColors = assignSeriesColors(lanes.map((v) => v.param));
  const colorFor = (p: ChartableParam) => seriesColors.get(paramKey(p)) ?? SERIES_COLORS[0];

  const range = computeTimeRange(axisMs, windowLo);
  // Actual data extent (the axis range itself is padded, so it would overstate
  // the window). Month labels get thinned on wide ranges, so state it plainly.
  const dataFrom = allMs.length ? Math.min(...allMs) : null;
  const dataTo = allMs.length ? Math.max(...allMs) : null;

  const LW = 150, PR = 16, SVG_W = 800, RH = 28, PB = 30;
  const hasPlot = lanes.length > 0;
  const hasGantt = tracks.length > 0;
  // "Nothing ticked" and "ticked, but nothing inside this window" are different
  // problems and get different messages.
  const nothingTicked = tickedParams.length === 0 && tickedTracks.length === 0;
  const lanesWithData = lanes.filter((l) => l.points.length > 0).length;
  const emptyWindow = !nothingTicked && lanesWithData === 0 && tracks.length === 0;
  const PLOT_TOP = 14;
  // Each series gets its own vertical lane rather than sharing one band —
  // two flat/near-identical series would otherwise both normalize to the
  // same center line and their row labels would collide. The lane is taller
  // than the plotted band (LANE_PAD) so value labels have somewhere to go.
  // A lane with no in-window reading needs none of that room, so it gets a
  // short one instead of 68px of white space.
  const LANE_H = 68, LANE_PAD = 15, EMPTY_LANE_H = 26;
  const laneTops: number[] = [];
  let laneAcc = PLOT_TOP;
  for (const l of lanes) {
    laneTops.push(laneAcc);
    laneAcc += l.points.length > 0 ? LANE_H : EMPTY_LANE_H;
  }
  const PLOT_H = hasPlot ? laneAcc - PLOT_TOP : 0;
  const GANTT_TOP = PLOT_TOP + PLOT_H + (hasPlot && hasGantt ? 20 : 0);
  const bodyBottom = GANTT_TOP + tracks.length * RH;
  const chartH = Math.max(80, bodyBottom + PB);
  const areaW = SVG_W - LW - PR;
  const PLOT_L = LW, PLOT_R = SVG_W - PR;
  // Half-width of a value label, estimated from the label's OWN text. At
  // fontSize 9 a proportional character averages ~4.6px, so "9g/dL" needs ~12px
  // a side while a unit-converted "1.13mg/dL (100µmol/L)" needs ~48. The single
  // fixed 22 this replaced under-measured the long ones, so a converted value
  // near the right edge was anchored "middle" and then clipped by the plot —
  // exactly the half-cut number the labelling work was meant to rule out.
  const labelHalfW = (s: string) => Math.max(12, s.length * 2.3);
  const toX = makeToX(range, LW, areaW);
  const months = monthTicks(range, toX);
  const todayInRange = isInRange(today.getTime(), range);

  const windowLabel = WINDOW_OPTIONS.find((o) => o.key === windowKey)?.label ?? "";
  const inViewCount = lanesWithData + tracks.length;
  const tickedCount = tickedParams.length + tickedTracks.length;

  // ── Duration editing ──
  const cellKey = (kind: TrackKind, name: string, field: "sf" | "upto") => `${kind}:${name}:${field}`;

  const draftFor = (kind: TrackKind, name: string) =>
    (kind === "drug" ? drugDraft : symptomDraft)[name] ?? { sf: "", upto: "" };

  const clearInvalid = (keys: string[]) =>
    setInvalidCells((prev) => {
      if (!keys.some((k) => prev.has(k))) return prev;
      const next = new Map(prev);
      for (const k of keys) next.delete(k);
      return next;
    });

  const flagInvalid = (key: string, reason: string) =>
    setInvalidCells((prev) => new Map(prev).set(key, reason));

  const setDraftCell = (kind: TrackKind, name: string, field: "sf" | "upto", value: string) => {
    const setter = kind === "drug" ? setDrugDraft : setSymptomDraft;
    setter((prev) => ({ ...prev, [name]: { ...(prev[name] ?? { sf: "", upto: "" }), [field]: value } }));
    clearInvalid([cellKey(kind, name, field)]);
  };

  // Commit on blur. Anything non-empty that cellToDate cannot read is flagged
  // and NOT saved — storing a half-understood date is worse than no override.
  const commitCell = (kind: TrackKind, name: string, field: "sf" | "upto", track: Track) => {
    const key = cellKey(kind, name, field);
    // Escape sets this immediately before blurring; the abandoned value must not
    // be committed on the way out.
    if (cancellingRef.current) {
      cancellingRef.current = false;
      clearInvalid([key]);
      return;
    }
    const raw = (draftFor(kind, name)[field] ?? "").trim();
    let normalised = "";
    if (raw) {
      const parsed = cellToDate(raw);
      if (!parsed) {
        flagInvalid(key, "Type DDMMYY, e.g. 030626 — or a full date like 03/06/2026");
        return;
      }
      const bad = implausibleReason(parsed);
      if (bad) {
        flagInvalid(key, bad);
        return;
      }
      // Store the app's canonical dd/mm/yyyy rather than hmDates' "26 Jul 2026"
      // label, so the box, its placeholder, the tooltip, the row summary and the
      // audit line all read the same way. Values written by the old Drug
      // timeline panel are still parsed by cellToDate and are rewritten to this
      // form the next time that field is edited.
      normalised = msToDdmmyyyy(parsed.getTime());
    }
    clearInvalid([key]);
    const base = kind === "drug" ? drugDates : symptomDates;
    const current = base[name] ?? { sf: "", upto: "" };
    if (current[field] === normalised) return; // nothing actually changed
    const nextCell = { ...current, [field]: normalised };
    const next: DrugDateMap = { ...base, [name]: nextCell };
    const ovS = cellToDate(nextCell.sf), ovE = cellToDate(nextCell.upto);

    // An end before the start is a typo, not an instruction. buildTrack clamps
    // it so the bar can't draw backwards, but clamping alone would swallow the
    // mistake: the doctor would see a one-day bar and no reason for it. Say what
    // is wrong and keep what was stored.
    const effS = ovS ? ovS.getTime() : track.recStart;
    const effE = ovE ? ovE.getTime() : track.recEnd;
    if (effE < effS) {
      flagInvalid(
        key,
        field === "sf"
          ? `That start is after the end shown for this row (${msToDdmmyyyy(effE)}). Move the To date first, or pick an earlier start.`
          : `That end is before the start shown for this row (${msToDdmmyyyy(effS)}). Move the From date first, or pick a later end.`,
      );
      return;
    }

    // Drop the key when the override would show exactly the recorded range —
    // both sides cleared, or a date retyped to the value already derived. The
    // dashed bar, the ✎ and the audit line all mean "the doctor moved this away
    // from what the record says"; storing a no-op override makes every one of
    // them lie, and clutters the trail with "adjusted X – Y (recorded X – Y)".
    const shownAsRecorded =
      msToDdmmyyyy(effS) === track.recFrom && msToDdmmyyyy(effE) === track.recTo;
    if (shownAsRecorded) delete next[name];
    const label = kind === "drug" ? "medication" : "symptom";
    // Both sides of the audit line are dd/mm/yyyy — it is read alongside every
    // other date in the app, so the formats must not differ inside one sentence.
    const shownFrom = ovS ? msToDdmmyyyy(ovS.getTime()) : track.recFrom;
    const shownTo = ovE ? msToDdmmyyyy(ovE.getTime()) : track.recTo;
    // Complaint text is free-form and can be long; the activity feed caps
    // `detail` at 400 chars server-side and would 400 the whole log call.
    const shown = activityName(name);
    const note = shownAsRecorded
      ? `Cleared the ${label} duration override for "${shown}" — back to the recorded ${track.recFrom} – ${track.recTo}`
      : `Adjusted ${label} duration for "${shown}": ${shownFrom} – ${shownTo} (recorded ${track.recFrom} – ${track.recTo})`;
    (kind === "drug" ? onSaveDrugDates : onSaveSymptomDates)(next, note);
  };

  const resetOverride = (kind: TrackKind, track: Track) => {
    const base = kind === "drug" ? drugDates : symptomDates;
    if (!base[track.name]) return;
    const next: DrugDateMap = { ...base };
    delete next[track.name];
    clearInvalid([cellKey(kind, track.name, "sf"), cellKey(kind, track.name, "upto")]);
    const label = kind === "drug" ? "medication" : "symptom";
    (kind === "drug" ? onSaveDrugDates : onSaveSymptomDates)(
      next,
      `Cleared the ${label} duration override for "${activityName(track.name)}" — back to the recorded ${track.recFrom} – ${track.recTo}`,
    );
  };

  // Keyboard-only editing: without this, Enter did nothing (there is no form to
  // submit) so a doctor typing a date and pressing Enter saw no response and had
  // to know to Tab away, and there was no way to abandon a half-typed date
  // except to retype the old one. Both just move focus — the existing blur is
  // still the single commit point.
  const onCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    kind: TrackKind,
    name: string,
    field: "sf" | "upto",
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      // blur() runs the commit SYNCHRONOUSLY, before React has flushed the
      // draft we just reverted — so without this flag Escape would commit the
      // value being abandoned. With a valid entry that means Escape SAVES
      // instead of cancelling, which is the opposite of what it promises.
      cancellingRef.current = true;
      const stored = (kind === "drug" ? drugDates : symptomDates)[name]?.[field] ?? "";
      setDraftCell(kind, name, field, stored);
      e.currentTarget.blur();
    }
  };

  const renderEditRow = (kind: TrackKind, track: Track) => {
    const draft = draftFor(kind, track.name);
    const sfBad = invalidCells.get(cellKey(kind, track.name, "sf"));
    const uptoBad = invalidCells.get(cellKey(kind, track.name, "upto"));
    const overridden = cellHasOverride((kind === "drug" ? drugDates : symptomDates)[track.name]);
    return (
      <div key={track.name} style={editRow}>
        <span style={{ ...checkLabel, flex: "1 1 100%" }} title={track.name}>{track.name}</span>
        {/* Both boxes hold a date and sit side by side, so without these tags
            there is nothing to say which end is which. */}
        <span style={fieldTag}>From</span>
        <input
          value={draft.sf}
          onChange={(e) => setDraftCell(kind, track.name, "sf", e.target.value)}
          onBlur={() => commitCell(kind, track.name, "sf", track)}
          onKeyDown={(e) => onCellKeyDown(e, kind, track.name, "sf")}
          placeholder={track.recFrom}
          aria-label={`${track.name} — duration from`}
          title={sfBad ?? `From — leave empty to keep the recorded ${track.recFrom}`}
          style={dateInput(Boolean(sfBad))}
        />
        <span style={fieldTag}>To</span>
        <input
          value={draft.upto}
          onChange={(e) => setDraftCell(kind, track.name, "upto", e.target.value)}
          onBlur={() => commitCell(kind, track.name, "upto", track)}
          onKeyDown={(e) => onCellKeyDown(e, kind, track.name, "upto")}
          placeholder={track.recTo}
          aria-label={`${track.name} — duration to`}
          title={uptoBad ?? `To — leave empty to keep the recorded ${track.recTo}`}
          style={dateInput(Boolean(uptoBad))}
        />
        {(sfBad || uptoBad) && (
          <div style={{ flex: "1 1 100%", fontSize: 9.5, color: C.danger[800], lineHeight: 1.45 }}>{sfBad ?? uptoBad}</div>
        )}
        {/* The bar this row controls may be unticked, or outside the chosen
            window, so the row has to state the result itself — otherwise a date
            can be typed with nothing visibly happening. */}
        {overridden && !sfBad && !uptoBad && (
          <div style={{ flex: "1 1 100%", fontSize: 9.5, color: C.n[500], lineHeight: 1.45 }}>
            Shown as <b>{track.from === track.to ? track.from : `${track.from} – ${track.to}`}</b>
            {" · recorded "}{track.recFrom === track.recTo ? track.recFrom : `${track.recFrom} – ${track.recTo}`}
          </div>
        )}
        <button
          type="button"
          onClick={() => resetOverride(kind, track)}
          disabled={!overridden}
          title={overridden ? "Clear the override and go back to the recorded dates" : "Nothing overridden on this row"}
          style={resetBtn(overridden)}
        >
          Reset
        </button>
      </div>
    );
  };

  const pickerRow = (
    kind: TrackKind,
    t: Track,
    selected: Set<string> | null,
    setter: (s: Set<string>) => void,
  ) => (
    <label key={t.name} style={checkRow}>
      <input type="checkbox" checked={selected?.has(t.name) ?? false} onChange={() => toggle(selected, setter, t.name)} style={checkInput} />
      <span style={checkLabel} title={t.name}>{t.name}</span>
      <span style={rangeHint} title={t.overridden ? `Adjusted by hand · recorded ${t.recFrom} – ${t.recTo}` : undefined}>
        {t.overridden ? "✎ " : ""}{t.from === t.to ? t.from : `${t.from} – ${t.to}`}
      </span>
    </label>
  );

  const editToggle = (on: boolean, setOn: (v: boolean) => void, label: string) => (
    <button type="button" onClick={() => setOn(!on)} style={editBtn(on)} title={`${on ? "Finish editing" : "Edit"} ${label} durations`}>
      {on ? "Done" : "Edit"}
    </button>
  );

  return (
    <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.n[700] }}>Health trend chart</div>
        <select
          value={windowKey}
          onChange={(e) => setWindowKey(e.target.value as WindowKey)}
          title="Time window shown on the chart"
          style={windowSelect}
        >
          {WINDOW_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 10.5, color: C.n[500], marginBottom: 12 }}>
        Medication and symptom bars span first → last recorded mention for that name — not necessarily continuous use.
        A dot marks a name recorded on one date only. A dashed bar has a duration the doctor set by hand.
      </div>

      {(hasPlot || hasGantt) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8, fontSize: 10.5 }}>
          {lanes.map(({ param }) => (
            <span key={paramKey(param)} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.n[700] }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: colorFor(param), display: "inline-block", flexShrink: 0 }} />
              {param.label}
            </span>
          ))}
          {tracks.some((t) => t.kind === "drug") && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.n[700] }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: C.pri[400], display: "inline-block", flexShrink: 0 }} /> Medication
            </span>
          )}
          {tracks.some((t) => t.kind === "symptom") && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.n[700] }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: C.warn[400], display: "inline-block", flexShrink: 0 }} /> Symptom
            </span>
          )}
        </div>
      )}

      {nothingTicked ? (
        <div style={{ textAlign: "center", padding: "36px 0", color: C.n[500], fontSize: 12 }}>
          Tick a lab parameter, medication or symptom below to visualise it here.
        </div>
      ) : emptyWindow ? (
        <div style={{ textAlign: "center", padding: "36px 0", color: C.n[500], fontSize: 12 }}>
          Nothing recorded in the {windowLabel.toLowerCase()} for what you have ticked.
          Choose a wider window to see this patient&apos;s history.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          {/* The plot itself conveys nothing to a screen reader, so it gets one
              spoken summary. Per-point and per-bar <title> elements below stay
              readable individually. */}
          <svg
            width="100%"
            viewBox={`0 0 ${SVG_W} ${chartH}`}
            style={{ display: "block", minWidth: 360 }}
            role="img"
            aria-label={
              `Health trend chart, ${windowKey === "all" ? "all available data" : windowLabel.toLowerCase()}. ` +
              `${lanes.length} lab ${lanes.length === 1 ? "parameter" : "parameters"}, ` +
              `${tracks.filter((t) => t.kind === "drug").length} medication and ` +
              `${tracks.filter((t) => t.kind === "symptom").length} symptom ${tracks.length === 1 ? "bar" : "bars"}` +
              (dataFrom != null && dataTo != null ? `, spanning ${msToDdmmyyyy(dataFrom)} to ${msToDdmmyyyy(dataTo)}.` : ".")
            }
          >
            {months.map((m, i) => (
              <g key={i}>
                <line x1={m.x} y1={PLOT_TOP} x2={m.x} y2={bodyBottom} stroke={C.n[200]} strokeWidth={0.5} />
                {m.showLabel && <text x={m.x} y={chartH - PB + 14} textAnchor="middle" fontSize={9} fill={C.n[500]}>{m.label}</text>}
              </g>
            ))}
            <line x1={LW} y1={bodyBottom} x2={SVG_W - PR} y2={bodyBottom} stroke={C.n[300]} strokeWidth={0.5} />
            {/* Hairline between stacked parameters — each has its own scale,
                so they must not read as one continuous plot. */}
            {laneTops.slice(1).map((top, i) => (
              <line key={`lane-${i}`} x1={LW} x2={SVG_W - PR} y1={top} y2={top} stroke={C.n[100]} strokeWidth={0.5} />
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

            {lanes.map(({ param, points, allPoints }, si) => {
              const color = colorFor(param);
              const laneTop = laneTops[si];
              const shortLabel = param.label.length > 22 ? param.label.slice(0, 21) + "…" : param.label;

              // Ticked, but nothing recorded inside this window. Say so on the
              // lane instead of dropping it — a missing lane reads as "never
              // measured", which is a different and more dangerous claim.
              if (points.length === 0) {
                const last = allPoints[allPoints.length - 1];
                return (
                  <g key={paramKey(param)}>
                    <text x={LW - 8} y={laneTop + EMPTY_LANE_H / 2 + 3} textAnchor="end" fontSize={10} fontWeight={600} fill={C.n[500]}>
                      {shortLabel}
                    </text>
                    <text x={LW + 8} y={laneTop + EMPTY_LANE_H / 2 + 3} fontSize={9} fill={C.n[500]}>
                      {last
                        ? `No reading in this window · last was ${last.label.length > 28 ? last.label.slice(0, 27) + "…" : last.label} on ${last.date}`
                        : "No reading in this window"}
                    </text>
                  </g>
                );
              }

              const vals = points.map((p) => p.value);
              const vmin = Math.min(...vals), vmax = Math.max(...vals);
              const vspan = vmax - vmin;
              const yOf = (v: number) => {
                const norm = vspan > 0 ? (v - vmin) / vspan : 0.5;
                return laneTop + LANE_H - LANE_PAD - norm * (LANE_H - 2 * LANE_PAD);
              };
              const pxs = points.map((p) => ({ x: toX(p.ms), y: yOf(p.value), label: p.label, date: p.date }));
              // Place each value label in the first offset that collides with
              // nothing already placed and stays inside this parameter's lane.
              // A fixed stagger is not enough: two readings recorded on the
              // SAME date share an x but differ in y, so a constant offset can
              // still land them on top of each other — and two overlapping lab
              // values are unreadable, not merely untidy.
              const OFFSETS = [-7, 13, -18, 24, -29, 35];
              const LINE_H = 10;
              const placed: { x: number; y: number; hw: number }[] = [];
              const labeled = pxs.map((p) => {
                // A label must NEVER be clipped by the plot edge either — a
                // half-cut "11g/dL" reads as "1g/dL". Anchor it inward rather
                // than centring it on a point sitting near either end, measured
                // against this label's own width.
                const hw = labelHalfW(p.label);
                const anchor = p.x + hw > PLOT_R ? "end" : p.x - hw < PLOT_L ? "start" : "middle";
                let dy = OFFSETS[0];
                for (const off of OFFSETS) {
                  const ly = p.y + off;
                  if (ly < laneTop + 8 || ly > laneTop + LANE_H - 2) continue;
                  if (placed.some((q) => Math.abs(q.x - p.x) < hw + q.hw && Math.abs(q.y - ly) < LINE_H)) continue;
                  dy = off;
                  break;
                }
                placed.push({ x: p.x, y: p.y + dy, hw });
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
                    {shortLabel}
                  </text>
                </g>
              );
            })}

            {tracks.map((t, idx) => {
              const cy = GANTT_TOP + idx * RH + RH / 2;
              const rawX1 = toX(t.start), rawX2 = toX(t.end);
              // Clip to the plot, never drop: the bar keeps reporting its true
              // range in the tooltip and gets a chevron meaning "continues
              // before this window".
              const x1 = Math.max(rawX1, PLOT_L);
              const x2 = Math.min(Math.max(rawX2, PLOT_L), PLOT_R);
              const clippedLeft = rawX1 < PLOT_L - 0.5;
              const color = t.kind === "drug" ? C.pri[400] : C.warn[400];
              // Recorded on a single date only: draw a point, not a stub bar.
              // Compared on the CALENDAR DAY, not the raw timestamp — a symptom
              // range comes from Prescription.createdAt, so two visits on the
              // same day differ by hours and would otherwise draw a 3px "bar"
              // while the picker row and the tooltip both say one date.
              // (Pixel width can't decide this either: a real one-week course on
              // a multi-year axis is also sub-pixel, and calling that "recorded
              // once" would be a false claim.)
              const singleDate = t.from === t.to;
              const recorded = t.recFrom === t.recTo ? t.recFrom : `${t.recFrom} – ${t.recTo}`;
              const tip = t.overridden
                ? `${t.name} · shown ${t.from === t.to ? t.from : `${t.from} – ${t.to}`} (adjusted) · recorded ${recorded}`
                : singleDate
                  ? `${t.name} · recorded ${t.from}`
                  : `${t.name} · ${t.from} – ${t.to}`;
              return (
                <g key={`${t.kind}-${t.name}`}>
                  {idx % 2 === 0 && <rect x={LW} y={GANTT_TOP + idx * RH} width={areaW} height={RH} fill={C.n[50]} />}
                  <text x={LW - 8} y={cy + 4} textAnchor="end" fontSize={10} fill={C.n[700]}>
                    {t.name.length > 20 ? t.name.slice(0, 19) + "…" : t.name}
                  </text>
                  <title>{tip}</title>
                  {singleDate ? (
                    <circle
                      cx={x1}
                      cy={cy}
                      r={5}
                      fill={t.overridden ? C.n[0] : color}
                      stroke={color}
                      strokeWidth={t.overridden ? 1.5 : 0}
                      strokeDasharray={t.overridden ? "3,2" : undefined}
                      opacity={0.9}
                    />
                  ) : (
                    <rect
                      x={x1}
                      y={cy - 7}
                      width={Math.max(3, x2 - x1)}
                      height={14}
                      rx={4}
                      fill={color}
                      fillOpacity={t.overridden ? 0.16 : 0.85}
                      stroke={t.overridden ? color : "none"}
                      strokeWidth={t.overridden ? 1.25 : 0}
                      strokeDasharray={t.overridden ? "4,2.5" : undefined}
                    />
                  )}
                  {clippedLeft && !singleDate && (
                    <path
                      d={`M ${PLOT_L + 6} ${cy - 4.5} L ${PLOT_L + 1.5} ${cy} L ${PLOT_L + 6} ${cy + 4.5}`}
                      fill="none"
                      stroke={t.overridden ? color : C.n[0]}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <div style={{ fontSize: 9.5, color: C.n[500], textAlign: "right", marginTop: 2 }}>
            {windowKey === "all"
              ? dataFrom != null && dataTo != null
                ? `Showing ${msToDdmmyyyy(dataFrom)} – ${msToDdmmyyyy(dataTo)} · hover any point or bar for its date`
                : "hover any point or bar for its date"
              : `${windowLabel} · ${msToDdmmyyyy(windowLo as number)} – ${msToDdmmyyyy(Math.max(today.getTime(), dataTo ?? 0))} · ${inViewCount} of ${tickedCount} ticked items have data in this window · hover any point or bar for its date`}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
        <div>
          <div style={colHeaderRow}><div style={colTitle}>Lab parameters shown</div></div>
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
          <div style={colHeaderRow}>
            <div style={colTitle}>Medications shown</div>
            {canEdit && drugTracks.length > 0 && editToggle(editDrugs, setEditDrugs, "medication")}
          </div>
          <div style={{ maxHeight: 190, overflowY: "auto" }}>
            {drugTracks.length === 0 ? (
              <div style={emptyMsg}>No drugs in this patient&apos;s drug history yet.</div>
            ) : (
              [...drugTracks].sort((a, b) => a.name.localeCompare(b.name)).map((t) =>
                editDrugs ? renderEditRow("drug", t) : pickerRow("drug", t, selectedDrugs, setSelectedDrugs),
              )
            )}
          </div>
        </div>

        <div>
          <div style={colHeaderRow}>
            <div style={colTitle}>Symptoms shown</div>
            {canEdit && symptomTracks.length > 0 && editToggle(editSymptoms, setEditSymptoms, "symptom")}
          </div>
          <div style={{ maxHeight: 190, overflowY: "auto" }}>
            {symptomTracks.length === 0 ? (
              <div style={emptyMsg}>No symptoms recorded for this patient yet.</div>
            ) : (
              [...symptomTracks].sort((a, b) => a.name.localeCompare(b.name)).map((t) =>
                editSymptoms ? renderEditRow("symptom", t) : pickerRow("symptom", t, selectedSymptoms, setSelectedSymptoms),
              )
            )}
          </div>
        </div>
      </div>

      {(unplaceable > 0 || aheadDated > 0) && (
        <div style={{ fontSize: 10, color: C.warn[800], background: C.warn[50], border: `0.5px solid ${C.warn[100]}`, borderRadius: 6, padding: "7px 10px", marginTop: 8, lineHeight: 1.5 }}>
          {unplaceable > 0 && (
            <>
              {unplaceable} recorded {unplaceable === 1 ? "entry has a date" : "entries have dates"} this timeline cannot read,
              so {unplaceable === 1 ? "it is" : "they are"} not drawn here.{" "}
            </>
          )}
          {aheadDated > 0 && (
            <>
              {aheadDated} {aheadDated === 1 ? "entry is" : "entries are"} dated more than {FUTURE_LIMIT_YEARS} years
              ahead and may have been entered as DDMMYY before this was corrected — {aheadDated === 1 ? "it is" : "they are"} drawn
              where the record puts {aheadDated === 1 ? "it" : "them"}.{" "}
            </>
          )}
          Nothing has been removed from or changed in the patient&apos;s record.
        </div>
      )}

      {saveError && (
        <div style={{ fontSize: 10.5, color: C.danger[800], background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, borderRadius: 6, padding: "7px 10px", marginTop: 8, lineHeight: 1.5 }}>
          {saveError}
        </div>
      )}

      {(editDrugs || editSymptoms) && (
        <div style={{ fontSize: 10, color: C.n[500], marginTop: 8, lineHeight: 1.5 }}>
          Type <b>DDMMYY</b> (e.g. <b>030626</b>) or a full date. Leave a box empty to keep the date recorded in this
          patient&apos;s notes. Editing here only changes the chart — the prescriptions and the drug history are untouched.
        </div>
      )}
    </div>
  );
}

const colHeaderRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 8, minHeight: 20 };
const colTitle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em" };
const emptyMsg: React.CSSProperties = { fontSize: 11, color: C.n[500], padding: "4px 0" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" };
const checkInput: React.CSSProperties = { accentColor: C.pri[400], width: 13, height: 13, cursor: "pointer", flexShrink: 0 };
const checkLabel: React.CSSProperties = { fontSize: 11, color: C.n[800], flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const countBadge: React.CSSProperties = { fontSize: 9.5, color: C.n[500], flexShrink: 0 };
const rangeHint: React.CSSProperties = { fontSize: 9.5, color: C.n[500], flexShrink: 0, whiteSpace: "nowrap" };
const fieldTag: React.CSSProperties = { fontSize: 9, color: C.n[500], flexShrink: 0, letterSpacing: "0.03em" };
const windowSelect: React.CSSProperties = {
  fontSize: 11, fontFamily: "inherit", color: C.n[800], background: C.n[0],
  border: `0.5px solid ${C.n[300]}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", outline: "none",
};
const editRow: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5,
  marginBottom: 8, paddingBottom: 7, borderBottom: `0.5px solid ${C.n[100]}`,
};
const dateInput = (bad: boolean): React.CSSProperties => ({
  flex: "1 1 76px", minWidth: 0, padding: "3px 6px", borderRadius: 5,
  border: `0.5px solid ${bad ? C.danger[400] : C.n[200]}`,
  background: bad ? C.danger[50] : C.n[0],
  fontFamily: "inherit", fontSize: 10.5, outline: "none", color: C.n[800],
});
const editBtn = (on: boolean): React.CSSProperties => ({
  fontSize: 9.5, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.03em",
  color: on ? C.n[0] : C.pri[600], background: on ? C.pri[400] : C.pri[50],
  border: "none", borderRadius: 5, padding: "3px 8px", cursor: "pointer", flexShrink: 0,
});
const resetBtn = (enabled: boolean): React.CSSProperties => ({
  fontSize: 9.5, fontFamily: "inherit", color: enabled ? C.danger[800] : C.n[300],
  background: enabled ? C.danger[50] : "transparent",
  border: `0.5px solid ${enabled ? C.danger[100] : C.n[200]}`,
  borderRadius: 5, padding: "3px 7px", cursor: enabled ? "pointer" : "default", flexShrink: 0,
});
