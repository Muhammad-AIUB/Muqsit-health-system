"use client";

import { useEffect, useState } from "react";
import { C, font } from "@/theme";
import { btnDisabled, btnPrimary, btnSecondary, dialogTitle, fieldLabel, inputSm, scrim, shadowDialog } from "@/theme/styles";
import { patientAccessApi, patientsApi, type AccessCandidate, type Patient } from "@/lib/api";
import { askFailure, candidateLine, CODE_DIGITS, readCodeInput, secondsLeft, verifyFailure } from "@/lib/patientAccess";
import { useDialog } from "@/lib/useDialog";

// Opening ANOTHER practice's patient with the patient's own code (physician's
// sheet, 16/11/2026). Two steps in one box:
//   1. Ask — a text message with a 6-digit code goes to the number the patient
//      gave; nothing of the patient's record is shown yet.
//   2. Enter — the patient reads the code out, the doctor types it. Only a right
//      code opens the patient, in this practice, from then on.
// The server counts the tries and the minutes (`server/src/patient-access/`);
// this box only says what happened, in a doctor's words, and what to do next.

type Step = "ask" | "enter";

export default function AccessCodeDialog({
  patient, onClose, onOpened,
}: {
  patient: AccessCandidate;
  onClose: () => void;
  /** The patient, now open in this practice. */
  onOpened: (p: Patient) => void;
}) {
  const dialog = useDialog(true, onClose);
  const [step, setStep] = useState<Step>("ask");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sentTo, setSentTo] = useState("");
  // When the last code went out and how long before another may be asked for;
  // `now` is the clock the "Send a new code" button reads.
  const [sent, setSent] = useState<{ at: number; after: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wait = sent ? secondsLeft(sent.at, sent.after, now) : 0;

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), 500);
    return () => clearTimeout(t);
  }, [wait, now]);

  const ask = async () => {
    setBusy(true); setErr("");
    try {
      const answer = await patientAccessApi.requestCode(patient.id);
      setSentTo(answer.sentTo);
      setTyped("");
      setNow(Date.now());
      setSent({ at: Date.now(), after: answer.resendAfterSeconds });
      setStep("enter");
    } catch (e) {
      const next = askFailure(e);
      setErr(next.message);
      if (next.enter) setStep("enter");
    } finally {
      setBusy(false);
    }
  };

  const code = readCodeInput(typed);

  const open = async () => {
    if (!code) return;
    setBusy(true); setErr("");
    try {
      await patientAccessApi.verify(patient.id, code);
      // The patient is open in this practice now: read them as any of its own.
      onOpened(await patientsApi.get(patient.id));
    } catch (e) {
      const next = verifyFailure(e);
      setErr(next.message);
      if (next.again) { setStep("ask"); setTyped(""); }
    } finally {
      setBusy(false);
    }
  };

  const line = candidateLine(patient);

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, background: scrim, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: font, padding: 16 }}
    >
      <div role="dialog" aria-modal="true" aria-label={`Open ${patient.name} with the patient's code`} {...dialog} style={{ background: C.n[0], borderRadius: 14, padding: 22, width: 440, maxWidth: "100%", boxShadow: shadowDialog }}>
        <div style={{ ...dialogTitle, marginBottom: 6 }}>Open {patient.name}</div>
        {line && <div style={{ fontSize: 12, color: C.n[600], marginBottom: 12 }}>{line}</div>}

        {step === "ask" ? (
          <>
            <div style={{ fontSize: 13, color: C.n[800], lineHeight: 1.55 }}>
              This patient is on another doctor&apos;s list. To open the record, the patient has to say yes: a text message with a
              {" "}{CODE_DIGITS}-digit code will be sent to the patient&apos;s phone, and the patient reads the code to you.
            </div>
            {err && <div role="alert" style={errBox}>{err}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              <button type="button" onClick={() => { setErr(""); setStep("enter"); }} disabled={busy} style={linkBtn}>I already have a code</button>
              <span style={{ display: "inline-flex", gap: 10 }}>
                <button type="button" onClick={onClose} disabled={busy} style={{ ...btnSecondary("md"), ...(busy ? btnDisabled : null) }}>Cancel</button>
                <button type="button" onClick={ask} disabled={busy} style={{ ...btnPrimary("md"), fontWeight: 600, ...(busy ? btnDisabled : null) }}>{busy ? "Sending…" : "Send code"}</button>
              </span>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (!busy) void open(); }}>
            <div style={{ fontSize: 13, color: C.n[800], lineHeight: 1.55 }}>
              {sentTo ? <>A code was sent to <b>{sentTo}</b>. </> : null}Ask the patient for the {CODE_DIGITS}-digit code and type it here.
            </div>
            <label data-caption style={{ ...fieldLabel, marginTop: 12 }}>Code from the patient</label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => { setTyped(e.target.value); setErr(""); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Code from the patient"
              placeholder={"0".repeat(CODE_DIGITS)}
              maxLength={CODE_DIGITS + 2}
              style={{ ...inputSm, letterSpacing: "0.2em", fontVariantNumeric: "tabular-nums", fontSize: 16 }}
            />
            {typed.trim() !== "" && !code && <div style={{ fontSize: 11.5, color: C.n[600], marginTop: 4 }}>The code is {CODE_DIGITS} digits.</div>}
            {err && <div role="alert" style={errBox}>{err}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              <button type="button" onClick={ask} disabled={busy || wait > 0} style={{ ...linkBtn, ...(busy || wait > 0 ? { color: C.n[400], cursor: "not-allowed" } : null) }}>
                {wait > 0 ? `Send a new code (${wait}s)` : "Send a new code"}
              </button>
              <span style={{ display: "inline-flex", gap: 10 }}>
                <button type="button" onClick={onClose} disabled={busy} style={{ ...btnSecondary("md"), ...(busy ? btnDisabled : null) }}>Cancel</button>
                <button type="submit" disabled={busy || !code} style={{ ...btnPrimary("md"), fontWeight: 600, ...(busy || !code ? btnDisabled : null) }}>{busy ? "Checking…" : "Open patient"}</button>
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const errBox = {
  marginTop: 12, fontSize: 12, color: C.danger[800], background: C.danger[50],
  border: `1px solid ${C.danger[100]}`, borderRadius: 8, padding: "8px 12px",
} as const;
const linkBtn = {
  border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: font,
  fontSize: 12.5, color: C.pri[600], textDecoration: "underline",
} as const;
