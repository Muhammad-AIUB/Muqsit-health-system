"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { C } from "@/theme";
import { inputSm } from "@/theme/styles";
import { isoToDdmmyyyy, parseDateInput, YEAR_POLICY } from "@/lib/dateInput";

export interface DateFieldProps {
  /** ISO "YYYY-MM-DD", or "" when unset. */
  value: string;
  onChange: (iso: string) => void;
  /**
   * How far ahead this field may legitimately point. `YEAR_POLICY.past` (0) also
   * turns on the day-level check, so a birth date can never land after today.
   */
  futureAllowanceYears?: number;
  /** Noun used in the future-date note. Only read when the allowance is 0. */
  pastLabel?: string;
  /**
   * May the field be emptied? True for anything optional — a date of birth, an
   * optional calculator input, a filter bound — where the native picker this
   * replaced had a clear button. False (the default) for the prescription visit
   * date, which must always hold one, and which reverted on empty before too.
   */
  allowEmpty?: boolean;
  placeholder?: string;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
  /** Rendered under the rejection note (e.g. an implausible-date warning). */
  hint?: ReactNode;
}

// Date field in DD/MM/YYYY format. Type the 6-digit shorthand DDMMYY
// (e.g. 030626 → 03/06/2026) or a slashed date; stored as ISO internally.
//
// On a failed parse the box reverts to the last valid date — it must never
// display a value the app did not accept — AND says why underneath. Reverting
// alone used to swallow the reason, which is how a doctor could type a birth
// year and never learn it had been rejected.
export default function DateField({
  value,
  onChange,
  futureAllowanceYears = YEAR_POLICY.clinical,
  pastLabel = "This date",
  allowEmpty = false,
  placeholder = "DD/MM/YYYY",
  style,
  disabled,
  title = "Type DDMMYY — e.g. 030626 → 03/06/2026. Enter commits, Escape cancels.",
  hint,
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToDdmmyyyy(value));
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Escape has to be announced through a ref, not state: blur() runs commit()
  // synchronously, before React would flush a state update, so a state flag
  // would still be false by the time commit() reads it and Escape would save
  // the very value it was meant to discard. Same trap as HealthTrendsChart.
  const cancelRef = useRef(false);

  // Keep in sync with external changes (e.g. loading a patient) while not typing.
  useEffect(() => { if (!focused) setText(isoToDdmmyyyy(value)); }, [value, focused]);

  // Drop a stale rejection note when the field is handed a different date —
  // loading another patient must not carry the last patient's error with it.
  // Keyed on `value` alone on purpose: a rejected entry leaves `value` untouched,
  // so the note it just set survives. Adding `focused` here would wipe the note
  // in the same tick commit() sets it.
  useEffect(() => { setNote(null); }, [value]);

  const commit = () => {
    setFocused(false);
    // Escape: put back what was stored and say nothing. Abandoning an edit is not
    // an error, so it must not leave a rejection note behind either.
    if (cancelRef.current) {
      cancelRef.current = false;
      setText(isoToDdmmyyyy(value));
      setNote(null);
      return;
    }
    // Emptying an optional field is an instruction, not a typo. Without this the
    // doctor could never take a wrong date of birth back out: parseDateInput("")
    // is "malformed", so the box reverted to the value they were trying to drop.
    if (allowEmpty && !text.trim()) {
      onChange("");
      setText("");
      setNote(null);
      return;
    }
    const r = parseDateInput(text, futureAllowanceYears);
    if (r.ok) {
      onChange(r.iso);
      setText(isoToDdmmyyyy(r.iso));
      setNote(null);
      return;
    }
    setText(isoToDdmmyyyy(value)); // revert invalid input
    setNote(
      r.reason === "future"
        ? `${pastLabel} cannot be in the future.`
        : "Not a valid date. Type DDMMYY (030398) or DD/MM/YYYY.",
    );
  };

  const inputStyle: CSSProperties = { ...inputSm, boxSizing: "border-box", width: "100%", ...style };

  return (
    <div style={{ width: "100%" }}>
      <input
        value={text}
        onFocus={() => { setFocused(true); setNote(null); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") { cancelRef.current = true; e.currentTarget.blur(); }
        }}
        placeholder={placeholder}
        title={title}
        inputMode="numeric"
        disabled={disabled}
        style={inputStyle}
      />
      {note && (
        <div style={{ fontSize: 9, color: C.danger[800], marginTop: 2, lineHeight: 1.3 }}>{note}</div>
      )}
      {hint}
    </div>
  );
}
