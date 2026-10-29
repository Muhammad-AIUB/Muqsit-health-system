"use client";

import { useId, useState, type ReactNode } from "react";
import { C } from "@/theme";
import { btnDisabled, btnPrimary, fieldLabel, inputMd } from "@/theme/styles";
import type { OpdScheduleAnswer, OpdScheduleInput } from "@/lib/api";
import { scheduleProblem } from "@/lib/opdSchedule";

interface Props {
  /** The day on show, yyyy-mm-dd. */
  day: string;
  /** The Dhaka calendar day today is — a day before it is locked. */
  today: string;
  /** The day's schedule as the server has it. */
  schedule: OpdScheduleAnswer;
  /** Resolves once the server has it; rejects when it could not be saved. */
  onSave: (input: OpdScheduleInput) => Promise<unknown>;
}

interface Edits {
  startTime?: string;
  breakStart?: string;
  breakEnd?: string;
  minutes?: string;
}

const SAVE_FAILED = "Could not save the schedule. Try again.";

// A server refusal (400) is a sentence written for a doctor — "The break must end
// after it starts." — and is shown as it is. Anything else is not: never the raw
// error, never "Is the API running?".
const wordsOf = (err: unknown): string =>
  typeof err === "object" && err !== null && (err as { status?: number }).status === 400 && typeof (err as Error).message === "string"
    ? (err as Error).message
    : SAVE_FAILED;

// The day's chamber schedule (physician's sheet, 28/10/2026): when the first
// patient is seen, an optional break, and the minutes set aside for each patient.
//
// ⚕️ The times a patient is told are worked out from the SAVED schedule, never
// from these boxes — what is typed stays here, in its box, until the server has
// it, and a save clears only what it SENT. The boxes belong to ONE day: another
// day starts clean (`key`), so a half-typed schedule can never be saved onto the
// day the doctor has just moved to.
export default function OpdScheduleBar(props: Props) {
  return <ScheduleBox key={props.day} {...props} />;
}

function ScheduleBox({ day, today, schedule, onSave }: Props) {
  const id = useId();
  const locked = day < today;
  const [edits, setEdits] = useState<Edits>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const server = {
    startTime: schedule.startTime,
    breakStart: schedule.breakStart ?? "",
    breakEnd: schedule.breakEnd ?? "",
    minutes: String(schedule.minutesPerPatient),
  };
  const shown = { ...server, ...edits };
  const dirty = (Object.keys(edits) as (keyof Edits)[]).some((k) => edits[k] !== server[k]);

  const edit = (key: keyof Edits, value: string) => {
    setEdits((e) => ({ ...e, [key]: value }));
    setProblem(null);
  };

  const save = async () => {
    if (saving || locked) return;
    const sent = { ...shown };
    // Only a whole, plain number is minutes: never `parseFloat` on what was typed.
    const minutes = /^\d+$/.test(sent.minutes.trim()) ? Number(sent.minutes) : Number.NaN;
    const input: OpdScheduleInput = {
      date: day,
      startTime: sent.startTime,
      breakStart: sent.breakStart || null,
      breakEnd: sent.breakEnd || null,
      minutesPerPatient: minutes,
    };
    const wrong = scheduleProblem(input);
    if (wrong) { setProblem(wrong); return; }
    setProblem(null);
    setSaving(true);
    try {
      await onSave(input);
      // Only what was SENT is let go: words typed while it was on its way stay.
      setEdits((e) => {
        const left: Edits = {};
        for (const k of Object.keys(e) as (keyof Edits)[]) if (e[k] !== sent[k]) left[k] = e[k];
        return left;
      });
    } catch (err) {
      setProblem(wordsOf(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof Edits, label: string, input: ReactNode) => (
    <div style={{ flex: "0 1 130px", minWidth: 0 }}>
      <label data-caption htmlFor={`${id}-${key}`} style={{ ...fieldLabel, display: "block" }}>{label}</label>
      {input}
    </div>
  );
  const box = { ...inputMd, width: "100%", boxSizing: "border-box" as const, opacity: locked ? 0.6 : 1 };
  const timeBox = (key: "startTime" | "breakStart" | "breakEnd", label: string) =>
    field(key, label, (
      <input
        id={`${id}-${key}`} type="time" value={shown[key]} disabled={locked}
        onChange={(e) => edit(key, e.target.value)} style={box}
      />
    ));

  return (
    <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div className="form-row" style={{ display: "flex", flexWrap: "wrap", gap: 10, rowGap: 8, alignItems: "flex-end" }}>
        {timeBox("startTime", "Start time")}
        {timeBox("breakStart", "Break from")}
        {timeBox("breakEnd", "Break to")}
        {field("minutes", "Minutes per patient", (
          <input
            id={`${id}-minutes`} type="number" inputMode="numeric" min={1} max={120} step={1}
            value={shown.minutes} disabled={locked}
            onChange={(e) => edit("minutes", e.target.value)} style={box}
          />
        ))}
        {!locked && (
          <button
            type="button" onClick={() => void save()} disabled={!dirty || saving}
            style={{ ...btnPrimary("md"), ...(dirty && !saving ? null : btnDisabled), flexShrink: 0 }}
          >
            {saving ? "Saving…" : "Save schedule"}
          </button>
        )}
      </div>

      {problem && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: C.danger[800] }}>{problem}</div>}
      {locked && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.n[600] }}>
          This date has passed — its schedule is kept as it was and cannot be changed.
        </div>
      )}
      {!locked && !schedule.saved && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.n[600] }}>
          Using the schedule of an earlier day (or the pre-set one). It is saved for this day with the first patient added, or when you press Save.
        </div>
      )}
      {!locked && dirty && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.warn[800] }}>
          Not saved yet — the times on the list are still the saved schedule's.
        </div>
      )}
    </div>
  );
}
