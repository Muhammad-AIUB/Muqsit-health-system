"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import {
  averageText, dayLabel, dayNumber, dhakaToday, monthCaption, readChambers, readDays, readDiagnoses,
  readMonths, readOverall, shiftMonthKey, shiftYearKey, shortMonth,
} from "@/lib/statistics";
import BarChart, { type BarDatum } from "./BarChart";
import { btnGhost, C, card, control, errBox, h2, note, tabStyle } from "./ui";
import { useLoad } from "./useLoad";

// Account → "Dr's patient data" (physician's sheet, 16/11/2026): "11.11.26 ar
// moto dr jeita dekhbe oitai dekhbe" — the doctor's Settings → Statistics
// (11/11/2026) exactly as the doctor sees it: Patient statistics and Disease
// statistics. Read only, numbers only: no patient is named or opened here. The
// server answers through the same service and the same chamber rule as the
// doctor's own page (`GET /admin/users/:id/statistics/…`).

type Tab = "patients" | "diseases";
const TABS: { id: Tab; name: string }[] = [
  { id: "patients", name: "Patient statistics" },
  { id: "diseases", name: "Disease statistics" },
];

export default function PatientData({ id, name }: { id: string; name: string }) {
  const [tab, setTab] = useState<Tab>("patients");
  return (
    <div>
      <div style={{ ...note, marginBottom: 12 }}>
        What <b style={{ color: C.n900 }}>{name}</b> sees in Settings → Statistics. Read only.
      </div>
      <div role="tablist" aria-label="Dr's patient data" style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`pd-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="pd-panel" onClick={() => setTab(t.id)} style={tabStyle(tab === t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="pd-panel" aria-labelledby={`pd-tab-${tab}`}>
        {tab === "patients" ? <PatientStatistics id={id} /> : <DiseaseStatistics id={id} />}
      </div>
    </div>
  );
}

// ── Patient statistics ─────────────────────────────────────────────────
type View = "days" | "months";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// A day's weekday from its name alone — UTC arithmetic, no locale, no time zone.
const weekdayOf = (day: string) => WEEKDAYS[new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay()];

function PatientStatistics({ id }: { id: string }) {
  const [chamber, setChamber] = useState("all");
  const [view, setView] = useState<View>("days");
  const [month, setMonth] = useState(() => dhakaToday().slice(0, 7));
  const [year, setYear] = useState(() => dhakaToday().slice(0, 4));

  const chambers = useLoad(() => adminApi.statChambers(id).then(readChambers), `chambers:${id}`, "Chambers did not load.");
  // A chamber that is not in the list is not asked for (the server would say 404): the total.
  const asked = chamber === "all" || chambers.data?.some((c) => c.id === chamber) ? chamber : "all";

  const byDay = useLoad(
    () => (view === "days" ? adminApi.statDays(id, month, asked).then(readDays) : Promise.resolve(null)),
    `days:${id}:${view}:${asked}:${month}`,
    "Could not load the patient numbers.",
  );
  const byMonth = useLoad(
    () => (view === "months" ? adminApi.statMonths(id, year, asked).then(readMonths) : Promise.resolve(null)),
    `months:${id}:${view}:${asked}:${year}`,
    "Could not load the patient numbers.",
  );
  const overall = useLoad(() => adminApi.statOverall(id, asked).then(readOverall), `overall:${id}:${asked}`, "Could not load the overall numbers.");

  const chart = view === "days" ? byDay : byMonth;

  return (
    <div>
      {/* the two choices of the sheet: which chamber, and by days or by months */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.n700 }}>
          Chamber
          <select aria-label="Chamber" value={asked} onChange={(e) => setChamber(e.target.value)} style={{ ...control, maxWidth: 220 }}>
            <option value="all">All chamber total</option>
            {(chambers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {chambers.error && <span role="status" style={{ fontSize: 12, color: C.n600 }}>Chambers did not load — showing the total of all.</span>}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.n700, marginLeft: "auto" }}>
          Show
          <select aria-label="Show" value={view} onChange={(e) => setView(e.target.value as View)} style={control}>
            <option value="days">By days</option>
            <option value="months">By months</option>
          </select>
        </label>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <button type="button" aria-label={view === "days" ? "Previous month" : "Previous year"} onClick={() => (view === "days" ? setMonth(shiftMonthKey(month, -1)) : setYear(shiftYearKey(year, -1)))} style={{ ...btnGhost, padding: "6px 10px" }}>‹</button>
            <div data-stats-period style={{ minWidth: 130, textAlign: "center", fontSize: 13.5, fontWeight: 600, color: C.n800 }}>
              {view === "days" ? monthCaption(month) : year}
            </div>
            <button type="button" aria-label={view === "days" ? "Next month" : "Next year"} onClick={() => (view === "days" ? setMonth(shiftMonthKey(month, 1)) : setYear(shiftYearKey(year, 1)))} style={{ ...btnGhost, padding: "6px 10px" }}>›</button>
          </div>
          <Legend mode={view} />
        </div>

        {chart.error ? (
          <Failed text={chart.error} onRetry={chart.retry} />
        ) : chart.loading ? (
          <Loading />
        ) : view === "days" && byDay.data ? (
          <DaysChart data={byDay.data} />
        ) : view === "months" && byMonth.data ? (
          <MonthsChart data={byMonth.data} />
        ) : null}
      </div>

      <div style={{ ...h2, margin: "18px 0 8px" }}>Over all number</div>
      {overall.error ? (
        <div style={card}><Failed text={overall.error} onRetry={overall.retry} /></div>
      ) : overall.loading || !overall.data ? (
        <div style={card}><Loading /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
          <Stat id="total" label="Total visit" value={String(overall.data.totalVisits)} sub={overall.data.firstSeenDay ? `Seen patients since ${dayLabel(overall.data.firstSeenDay)}` : "Seen patients so far"} />
          <Stat id="monthly" label="Average monthly visits" value={averageText(overall.data.averageMonthly)} sub={overall.data.months > 0 ? `Over ${overall.data.months} calendar month${overall.data.months === 1 ? "" : "s"}` : "No visit seen yet"} />
          <Stat id="daily" label="Average daily visits" value={averageText(overall.data.averageDaily)} sub={overall.data.days > 0 ? `Over ${overall.data.days} calendar day${overall.data.days === 1 ? "" : "s"}` : "No visit seen yet"} />
          <Stat id="thisMonth" label="This month's visit (up to today)" value={String(overall.data.thisMonth)} sub={monthCaption(overall.data.today.slice(0, 7))} />
          <Stat id="previousMonth" label="Previous month visit" value={String(overall.data.previousMonth)} sub={monthCaption(shiftMonthKey(overall.data.today.slice(0, 7), -1))} />
        </div>
      )}
      <div style={{ ...note, fontSize: 11.5, marginTop: 10 }}>
        Seen = Completed in the OPD queue: Done pressed, or the prescription printed. Only patients put on the OPD queue are counted.
      </div>
    </div>
  );
}

function DaysChart({ data }: { data: { month: string; days: { day: string; total: number; seen: number }[] } }) {
  const bars: BarDatum[] = data.days.map((d) => ({
    key: d.day,
    label: dayNumber(d.day),
    total: d.total,
    seen: d.seen,
    tip: `${weekdayOf(d.day)} ${dayLabel(d.day)}: ${d.total} total serial, ${d.seen} seen`,
  }));
  const total = data.days.reduce((n, d) => n + d.total, 0);
  const seen = data.days.reduce((n, d) => n + d.seen, 0);
  return (
    <>
      <BarChart mode="days" bars={bars} caption={monthCaption(data.month)} ariaLabel={`Patients per day, ${monthCaption(data.month)}: ${total} total serial, ${seen} seen`} />
      <Summary items={[["Total serial", total], ["Seen", seen]]} />
    </>
  );
}

function MonthsChart({ data }: { data: { year: string; months: { month: string; total: number; seen: number }[] } }) {
  const bars: BarDatum[] = data.months.map((m) => ({
    key: m.month,
    label: shortMonth(m.month),
    total: m.total,
    seen: m.seen,
    tip: `${monthCaption(m.month)}: ${m.seen} seen, ${m.total} total serial`,
  }));
  const total = data.months.reduce((n, m) => n + m.total, 0);
  const seen = data.months.reduce((n, m) => n + m.seen, 0);
  return (
    <>
      <BarChart mode="months" bars={bars} caption={data.year} ariaLabel={`Patients seen per month, ${data.year}: ${seen} seen, ${total} total serial`} />
      <Summary items={[["Seen", seen], ["Total serial", total]]} />
    </>
  );
}

function Summary({ items }: { items: [string, number][] }) {
  return (
    <div data-stats-summary style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.n700, marginTop: 6 }}>
      {items.map(([label, n]) => <span key={label}>{label}: <b style={{ color: C.n900, fontVariantNumeric: "tabular-nums" }}>{n}</b></span>)}
    </div>
  );
}

function Legend({ mode }: { mode: View }) {
  const chip = (fill: string, stroke: string | undefined, text: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.n700 }}>
      <span aria-hidden style={{ width: 11, height: 11, borderRadius: 2, background: fill, border: stroke ? `1px solid ${stroke}` : "none", display: "inline-block" }} />
      {text}
    </span>
  );
  return (
    <div data-stats-legend style={{ display: "inline-flex", gap: 14, marginLeft: "auto", flexWrap: "wrap" }}>
      {mode === "days" && chip(C.ok100, C.ok400, "Total serial")}
      {chip(C.okDark, undefined, "Seen patients")}
    </div>
  );
}

function Stat({ id, label, value, sub }: { id: string; label: string; value: string; sub: string }) {
  return (
    <div data-stat={id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: C.n600 }}>{label}</div>
      <div data-stat-value style={{ fontSize: 24, fontWeight: 600, color: C.n900, fontVariantNumeric: "tabular-nums", lineHeight: 1.25, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.n600, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ── Disease statistics ─────────────────────────────────────────────────
// Every Final diagnosis written on the doctor's prescriptions, with the number of
// DIFFERENT patients who have it (a patient seen five times with DM is one). Two
// writings are one only when they differ in capitals and spacing — `DM` and
// `Diabetes mellitus` are two lines, and which names mean one disease is the
// physician's to say, not the app's to guess. A prescription holds no chamber.
function DiseaseStatistics({ id }: { id: string }) {
  const q = useLoad(() => adminApi.statDiseases(id).then(readDiagnoses), `diseases:${id}`, "Could not load the disease numbers.");
  return (
    <div>
      <div style={h2}>Final diagnosis</div>
      <div style={{ ...note, margin: "2px 0 10px" }}>
        What was written as the Final diagnosis on this doctor&apos;s prescriptions, and how many different patients have it. All chambers together.
      </div>
      <div style={{ ...card, padding: "6px 16px" }}>
        {q.error ? (
          <Failed text={q.error} onRetry={q.retry} />
        ) : q.loading || !q.data ? (
          <Loading />
        ) : q.data.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.n600, padding: "14px 0" }}>No Final diagnosis has been written on a prescription yet.</div>
        ) : (
          <ul data-disease-list style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {q.data.map((d, i) => {
              const widest = q.data![0].patients || 1;
              return (
                <li key={`${i}:${d.name}`} data-disease={d.name} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "9px 0", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.n900, overflowWrap: "anywhere" }}>{d.name}</span>
                  <span aria-hidden style={{ flex: "0 0 90px", height: 6, borderRadius: 3, background: C.n100, overflow: "hidden", alignSelf: "center" }}>
                    <span style={{ display: "block", height: "100%", width: `${Math.max(3, Math.round((d.patients / widest) * 100))}%`, background: C.n400 }} />
                  </span>
                  <span data-disease-count style={{ flex: "0 0 auto", minWidth: 44, textAlign: "right", fontSize: 13.5, fontWeight: 600, color: C.n900, fontVariantNumeric: "tabular-nums" }}>{d.patients}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── States ─────────────────────────────────────────────────────────────
function Loading() {
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.n600, padding: "14px 0" }}>
      <span className="spinner" aria-hidden />Loading numbers…
    </div>
  );
}

function Failed({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" style={{ ...errBox, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span>{text}</span>
      <button type="button" onClick={onRetry} style={btnGhost}>Try again</button>
    </div>
  );
}
