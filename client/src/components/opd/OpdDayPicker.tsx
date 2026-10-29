"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { C, font } from "@/theme";
import { btnClose, btnSecondary, dialogTitle, scrim, shadowDialog } from "@/theme/styles";
import { useDialog } from "@/lib/useDialog";
import { dayRelation, monthGrid, monthOf, monthTitle, shiftDay, shiftMonth, type MonthRef } from "@/lib/opdDay";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  /** The day on show, yyyy-mm-dd. */
  value: string;
  /** The Dhaka calendar day today is. */
  today: string;
  /** A day was chosen. The popup does not close itself: the caller decides. */
  onPick: (day: string) => void;
  onClose: () => void;
}

// The calendar the OPD queue's date opens (physician's sheet, 28/10/2026). Every
// day can be looked at; the days that have passed are marked locked, because the
// queue keeps them as they were. The keys that MOVE along the days never CHOOSE
// one — choosing changes the whole screen under the doctor's hands, so only a
// click, Enter or Space does it (the same rule as the Investigation calendar).
export default function OpdDayPicker({ value, today, onPick, onClose }: Props) {
  const dialog = useDialog(true, onClose);
  const [month, setMonth] = useState<MonthRef>(() => monthOf(value));
  // The day the focus is on, and the grid's one Tab stop.
  const [cursor, setCursor] = useState(value);
  const moved = useRef(false);

  // After the keys move the cursor the day may have been drawn only now (a new
  // month): the focus follows once it is in the page.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    document.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)?.focus();
  }, [cursor, month]);

  const grid = monthGrid(month);
  const inMonth = (d: string) => d.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}`);
  // The cursor can be in another month (the arrow buttons turned the page): the
  // first day then holds the Tab stop, so the grid is never unreachable.
  const stop = inMonth(cursor) ? cursor : `${month.year}-${String(month.month + 1).padStart(2, "0")}-01`;

  const goTo = (day: string) => {
    moved.current = true;
    setCursor(day);
    setMonth(monthOf(day));
  };

  const byMonths = (from: string, months: number) => {
    const target = shiftMonth(monthOf(from), months);
    const last = new Date(Date.UTC(target.year, target.month + 1, 0)).getUTCDate();
    const wanted = Number(from.slice(8, 10));
    return `${target.year}-${String(target.month + 1).padStart(2, "0")}-${String(Math.min(wanted, last)).padStart(2, "0")}`;
  };

  const onKey = (e: KeyboardEvent) => {
    const from = (document.activeElement as HTMLElement | null)?.dataset?.day;
    if (!from) return;
    const next: Record<string, string> = {
      ArrowRight: shiftDay(from, 1),
      ArrowLeft: shiftDay(from, -1),
      ArrowDown: shiftDay(from, 7),
      ArrowUp: shiftDay(from, -7),
      PageDown: byMonths(from, 1),
      PageUp: byMonths(from, -1),
    };
    const to = next[e.key];
    if (!to) return;
    e.preventDefault();
    goTo(to);
  };

  const turn = (months: number) => setMonth((m) => shiftMonth(m, months));

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: scrim, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Choose a date" {...dialog}
        style={{ width: "min(320px, 100%)", maxHeight: "100%", overflowY: "auto", background: C.n[0], borderRadius: 12, boxShadow: shadowDialog, fontFamily: font, padding: 14, boxSizing: "border-box" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div style={dialogTitle}>Choose a date</div>
          <button type="button" onClick={onClose} aria-label="Close" style={btnClose}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <button type="button" aria-label="Previous month" onClick={() => turn(-1)} style={{ ...btnSecondary("sm"), minWidth: 32 }}>‹</button>
          <div aria-live="polite" style={{ fontSize: 14, fontWeight: 600, color: C.n[900] }}>{monthTitle(month)}</div>
          <button type="button" aria-label="Next month" onClick={() => turn(1)} style={{ ...btnSecondary("sm"), minWidth: 32 }}>›</button>
        </div>

        <div role="grid" aria-label={monthTitle(month)} onKeyDown={onKey}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} role="columnheader" style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: C.n[600], padding: "4px 0" }}>{w}</div>
            ))}
          </div>
          {grid.map((week, i) => (
            <div key={i} role="row" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {week.map((d, j) => {
                if (!d) return <div key={j} role="gridcell" />;
                const rel = dayRelation(d, today);
                const chosen = d === value;
                const n = Number(d.slice(8, 10));
                const name = `${n} ${monthTitle(month)}${rel === "today" ? ", today" : rel === "past" ? ", locked (has passed)" : ""}`;
                return (
                  <div key={j} role="gridcell" style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      type="button"
                      data-day={d}
                      data-relation={rel}
                      aria-label={name}
                      aria-pressed={chosen}
                      tabIndex={d === stop ? 0 : -1}
                      onClick={() => onPick(d)}
                      style={{
                        width: 34, height: 34, borderRadius: 8, fontFamily: font, fontSize: 13, cursor: "pointer",
                        fontVariantNumeric: "tabular-nums", fontWeight: chosen || rel === "today" ? 600 : 400,
                        border: rel === "today" && !chosen ? `1px solid ${C.pri[400]}` : "1px solid transparent",
                        background: chosen ? C.pri[400] : "transparent",
                        color: chosen ? C.n[0] : rel === "past" ? C.n[500] : C.n[900],
                      }}
                    >
                      {n}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => onPick(today)} style={btnSecondary("sm")}>Today</button>
          <div style={{ fontSize: 11, color: C.n[600], textAlign: "right", lineHeight: 1.3 }}>
            Days that have passed are locked: you can look at them, not change them.
          </div>
        </div>
      </div>
    </div>
  );
}
