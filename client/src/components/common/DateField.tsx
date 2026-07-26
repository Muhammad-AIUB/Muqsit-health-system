"use client";

import { useEffect, useState, type CSSProperties } from "react";
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
  placeholder?: string;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
  /** Rendered to the right of the rejection note (e.g. an implausible-date warning). */
  hint?: React.ReactNode;
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
  placeholder = "DD/MM/YYYY",
  style,
  disabled,
  title = "Type DDMMYY — e.g. 030626 → 03/06/2026",
  hint,
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToDdmmyyyy(value));
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Keep in sync with external changes (e.g. loading a patient) while not typing.
  useEffect(() => { if (!focused) setText(isoToDdmmyyyy(value)); }, [value, focused]);

  const commit = () => {
    setFocused(false);
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
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
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
