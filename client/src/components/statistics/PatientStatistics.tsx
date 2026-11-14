"use client";

import { useEffect, useState } from "react";
import { C, font } from "@/theme";
import { btnSecondary } from "@/theme/styles";
import Icon from "@/components/common/Icon";
import { Loading, LoadError } from "@/components/common/ListState";
import { useChamberOwner } from "@/components/layout/ChamberPicker";
import { useChambers } from "@/hooks/useChambers";
import { useVisitsByDay, useVisitsByMonth, useVisitsOverall } from "@/hooks/useStatistics";
import { dayLabel, dhakaToday } from "@/lib/opdDay";
import { averageText, dayNumber, monthCaption, shiftMonthKey, shiftYearKey, shortMonth } from "@/lib/statistics";
import VisitBarChart, { type BarDatum } from "./VisitBarChart";

type View = "days" | "months";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// A day's weekday from its name alone — UTC arithmetic, no locale, no time zone.
const weekdayOf = (day: string) => WEEKDAYS[new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay()];

const controlStyle = { minHeight: 34, padding: "0 8px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[900], fontSize: 12.5, fontFamily: font, cursor: "pointer" } as const;

// Settings → Statistics → Patient statistics (physician's sheet, 11/11/2026).
// Total serial = every OPD queue row of a day; seen = Completed in the queue
// (Done pressed, or the prescription printed). A visit is counted in the chamber
// it was booked in; "All chamber total" adds them up.
export default function PatientStatistics() {
  const who = useChamberOwner();
  const practiceId = who?.practiceId ?? null;
  const chambers = useChambers(practiceId);

  const [chamber, setChamber] = useState("all");
  const [view, setView] = useState<View>("days");
  const [month, setMonth] = useState(() => dhakaToday().slice(0, 7));
  const [year, setYear] = useState(() => dhakaToday().slice(0, 4));

  // A chamber removed since it was chosen is not asked for again (the server
  // would answer 404): back to the total.
  useEffect(() => {
    if (chamber !== "all" && chambers.isSuccess && !chambers.data.some((c) => c.id === chamber)) setChamber("all");
  }, [chamber, chambers.isSuccess, chambers.data]);

  const inView = chamber === "all" || chambers.data?.some((c) => c.id === chamber);
  const asked = inView ? chamber : "all";

  const byDay = useVisitsByDay(view === "days" ? practiceId : null, asked, month);
  const byMonth = useVisitsByMonth(view === "months" ? practiceId : null, asked, year);
  const overall = useVisitsOverall(practiceId, asked);

  const chart = view === "days" ? byDay : byMonth;

  return (
    <div>
      {/* the two choices of the sheet: which chamber, and by days or by months */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.n[700] }}>
          <Icon name="chamber" size={16} />
          <select aria-label="Chamber" value={asked} onChange={(e) => setChamber(e.target.value)} style={{ ...controlStyle, maxWidth: 220 }}>
            <option value="all">All chamber total</option>
            {(chambers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {chambers.isError && <span role="status" style={{ fontSize: 12, color: C.n[600] }}>Chambers did not load — showing the total of all.</span>}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.n[700], marginLeft: "auto" }}>
          <Icon name="calendar" size={16} />
          <select aria-label="Show" value={view} onChange={(e) => setView(e.target.value as View)} style={controlStyle}>
            <option value="days">By days</option>
            <option value="months">By months</option>
          </select>
        </label>
      </div>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <button type="button" aria-label={view === "days" ? "Previous month" : "Previous year"} onClick={() => (view === "days" ? setMonth(shiftMonthKey(month, -1)) : setYear(shiftYearKey(year, -1)))} style={{ ...btnSecondary("sm"), padding: "0 8px" }}>
              <Icon name="chevronRight" size={14} style={{ transform: "rotate(180deg)" }} />
            </button>
            <div data-stats-period style={{ minWidth: 130, textAlign: "center", fontSize: 13.5, fontWeight: 600, color: C.n[800] }}>
              {view === "days" ? monthCaption(month) : year}
            </div>
            <button type="button" aria-label={view === "days" ? "Next month" : "Next year"} onClick={() => (view === "days" ? setMonth(shiftMonthKey(month, 1)) : setYear(shiftYearKey(year, 1)))} style={{ ...btnSecondary("sm"), padding: "0 8px" }}>
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
          <Legend mode={view} />
        </div>

        {chart.error ? (
          <LoadError compact title="Could not load the patient numbers." onRetry={() => chart.refetch()} retrying={chart.isFetching} />
        ) : !chart.data ? (
          <Loading compact label="Loading numbers…" />
        ) : view === "days" && byDay.data ? (
          <DaysChart data={byDay.data} />
        ) : view === "months" && byMonth.data ? (
          <MonthsChart data={byMonth.data} />
        ) : null}
      </Card>

      <div style={{ fontSize: 14, fontWeight: 600, margin: "18px 0 8px", color: C.n[900] }}>Over all number</div>
      {overall.error ? (
        <Card><LoadError compact title="Could not load the overall numbers." onRetry={() => overall.refetch()} retrying={overall.isFetching} /></Card>
      ) : !overall.data ? (
        <Card><Loading compact label="Loading numbers…" /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
          <Stat id="total" label="Total visit" value={String(overall.data.totalVisits)} note={overall.data.firstSeenDay ? `Seen patients since ${dayLabel(overall.data.firstSeenDay)}` : "Seen patients so far"} />
          <Stat id="monthly" label="Average monthly visits" value={averageText(overall.data.averageMonthly)} note={overall.data.months > 0 ? `Over ${overall.data.months} calendar month${overall.data.months === 1 ? "" : "s"}` : "No visit seen yet"} />
          <Stat id="daily" label="Average daily visits" value={averageText(overall.data.averageDaily)} note={overall.data.days > 0 ? `Over ${overall.data.days} calendar day${overall.data.days === 1 ? "" : "s"}` : "No visit seen yet"} />
          <Stat id="thisMonth" label="This month's visit (up to today)" value={String(overall.data.thisMonth)} note={`${monthCaption(overall.data.today.slice(0, 7))}`} />
          <Stat id="previousMonth" label="Previous month visit" value={String(overall.data.previousMonth)} note={monthCaption(shiftMonthKey(overall.data.today.slice(0, 7), -1))} />
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.n[600], marginTop: 10, lineHeight: 1.5 }}>
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
      <VisitBarChart mode="days" bars={bars} caption={monthCaption(data.month)} ariaLabel={`Patients per day, ${monthCaption(data.month)}: ${total} total serial, ${seen} seen`} />
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
      <VisitBarChart mode="months" bars={bars} caption={data.year} ariaLabel={`Patients seen per month, ${data.year}: ${seen} seen, ${total} total serial`} />
      <Summary items={[["Seen", seen], ["Total serial", total]]} />
    </>
  );
}

function Summary({ items }: { items: [string, number][] }) {
  return (
    <div data-stats-summary style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.n[700], marginTop: 6 }}>
      {items.map(([label, n]) => <span key={label}>{label}: <b style={{ color: C.n[900], fontVariantNumeric: "tabular-nums" }}>{n}</b></span>)}
    </div>
  );
}

function Legend({ mode }: { mode: View }) {
  const chip = (fill: string, stroke: string | undefined, text: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.n[700] }}>
      <span aria-hidden style={{ width: 11, height: 11, borderRadius: 2, background: fill, border: stroke ? `1px solid ${stroke}` : "none", display: "inline-block" }} />
      {text}
    </span>
  );
  return (
    <div data-stats-legend style={{ display: "inline-flex", gap: 14, marginLeft: "auto", flexWrap: "wrap" }}>
      {mode === "days" && chip(C.ok[100], C.ok[400], "Total serial")}
      {chip(C.ok[600], undefined, "Seen patients")}
    </div>
  );
}

function Stat({ id, label, value, note }: { id: string; label: string; value: string; note: string }) {
  return (
    <div data-stat={id} style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: C.n[600] }}>{label}</div>
      <div data-stat-value style={{ fontSize: 24, fontWeight: 600, color: C.n[900], fontVariantNumeric: "tabular-nums", lineHeight: 1.25, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.n[600], marginTop: 2 }}>{note}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "14px 16px" }}>{children}</div>;
}
