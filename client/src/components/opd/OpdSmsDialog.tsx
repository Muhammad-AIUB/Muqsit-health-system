"use client";

import { useRef, useState } from "react";
import { C, font } from "@/theme";
import { btnClose, btnDisabled, btnPrimary, btnSecondary, dialogTitle, fieldLabel, inputMd, scrim, shadowDialog } from "@/theme/styles";
import { useDialog } from "@/lib/useDialog";
import { confirmAction, tell } from "@/lib/dialogs";
import { ApiError, smsApi, type SmsLanguage, type SmsPlan, type SmsSendAnswer } from "@/lib/api";
import { clockText } from "@/lib/opdSchedule";
import { dayLabel } from "@/lib/opdDay";
import { Loading } from "@/components/common/ListState";
import { useInvalidateSms } from "@/hooks/useSms";

interface Props {
  /** The day on show, yyyy-mm-dd — today or a later day (the button is off for a past one). */
  day: string;
  onClose: () => void;
  /** "Buy SMS": Settings → Payment. */
  onBuy: () => void;
}

type Step =
  | { kind: "language" }
  | { kind: "loading"; language: SmsLanguage }
  | { kind: "preview"; plan: SmsPlan }
  | { kind: "failed"; language: SmsLanguage; message: string }
  | { kind: "sending"; plan: SmsPlan }
  | { kind: "done"; answer: SmsSendAnswer }
  | { kind: "unknown" };

const LANGUAGE_WORD: Record<SmsLanguage, string> = { bn: "Bangla", en: "English" };

// The server's own sentence is shown for the refusals it words for a doctor;
// anything else is said here.
const serverWords = (e: unknown) =>
  e instanceof ApiError && [400, 403, 409, 503].includes(e.status) ? e.message : null;

const taka = (n: number) => `${n} taka`;

// ⚕️ "Send SMS to all patients" of a day's queue (physician's sheet, 28/10/2026).
// It asks Bangla or English first, then shows what the SERVER would send — every
// patient, their number, the exact message, how many SMS each counts as — with
// the total, the balance, and Send. Nothing is sent before Send is pressed, and
// nothing is sent again by itself: a send whose answer is lost may have gone.
export default function OpdSmsDialog({ day, onClose, onBuy }: Props) {
  // A send moves the balance and the ledger (Settings → Payment).
  const invalidateSms = useInvalidateSms();
  const [step, setStep] = useState<Step>({ kind: "language" });
  const [chamberId, setChamberId] = useState<string | undefined>(undefined);
  const sending = useRef(false);
  // While the messages are going the box stays: closed, the results would be lost.
  const close = () => { if (!sending.current) onClose(); };
  const dialog = useDialog(true, close);

  const load = async (language: SmsLanguage, chamber = chamberId) => {
    setStep({ kind: "loading", language });
    try {
      const plan = await smsApi.preview({ date: day, language, ...(chamber ? { chamberId: chamber } : {}) });
      setStep({ kind: "preview", plan });
    } catch (e) {
      setStep({ kind: "failed", language, message: serverWords(e) ?? "Could not check the SMS. Try again." });
    }
  };

  const send = async (plan: SmsPlan, confirmRepeat = false): Promise<void> => {
    if (sending.current) return;
    sending.current = true;
    setStep({ kind: "sending", plan });
    let answer: SmsSendAnswer | null = null;
    let error: unknown = null;
    try {
      answer = await smsApi.send({
        date: plan.day,
        language: plan.language,
        ...(plan.chamberId ? { chamberId: plan.chamberId } : {}),
        previewSignature: plan.signature,
        ...(confirmRepeat ? { confirmRepeat: true } : {}),
      });
    } catch (e) {
      error = e;
    } finally {
      sending.current = false;
    }
    if (answer) {
      setStep({ kind: "done", answer });
      void invalidateSms();
      return;
    }
    const code = error instanceof ApiError ? error.code : undefined;
    if (code === "SMS_REPEAT") {
      const again = await confirmAction({
        title: "Send these SMS again?",
        body: `${(error as ApiError).message} Nothing has been sent this time.`,
        confirmLabel: "Send again",
        danger: true,
      });
      if (again) return send(plan, true);
      setStep({ kind: "preview", plan });
      return;
    }
    const words = serverWords(error);
    if (words) {
      // Refused before anything went: say why, and check again.
      await tell({ title: "SMS not sent", body: words, tone: "danger" });
      return load(plan.language, plan.chamberId ?? undefined);
    }
    // ⚕️ No answer: the messages may have gone. Never sent again by itself.
    setStep({ kind: "unknown" });
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{ position: "fixed", inset: 0, background: scrim, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Send SMS to all patients" {...dialog}
        style={{ width: "min(640px, 100%)", maxHeight: "100%", overflowY: "auto", background: C.n[0], borderRadius: 12, boxShadow: shadowDialog, fontFamily: font, padding: 16, boxSizing: "border-box" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={dialogTitle}>Send SMS to all patients</div>
          <button type="button" onClick={close} aria-label="Close" style={btnClose}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: C.n[600], marginBottom: 12, fontVariantNumeric: "tabular-nums" }}>{dayLabel(day)}</div>

        {step.kind === "language" && (
          <div>
            <div style={{ fontSize: 13.5, color: C.n[900], marginBottom: 10 }}>Send the SMS in Bangla or in English?</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => load("bn")} style={btnPrimary("md")}>বাংলা (Bangla)</button>
              <button type="button" onClick={() => load("en")} style={btnPrimary("md")}>English</button>
            </div>
            <div style={{ fontSize: 12, color: C.n[600], marginTop: 10 }}>
              Nothing is sent yet. You will see every message and its cost first.
            </div>
          </div>
        )}

        {step.kind === "loading" && <Loading label={`Checking the ${LANGUAGE_WORD[step.language]} SMS…`} />}

        {step.kind === "failed" && (
          <div>
            <div role="alert" style={{ fontSize: 13, color: C.danger[800], marginBottom: 10 }}>{step.message}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => load(step.language)} style={btnPrimary("md")}>Try again</button>
              <button type="button" onClick={() => setStep({ kind: "language" })} style={btnSecondary("md")}>Back</button>
            </div>
          </div>
        )}

        {(step.kind === "preview" || step.kind === "sending") && (
          <PlanView
            plan={step.plan}
            sending={step.kind === "sending"}
            chamberId={chamberId}
            onChamber={(id) => { setChamberId(id); void load(step.plan.language, id); }}
            onBack={() => setStep({ kind: "language" })}
            onSend={() => send(step.plan)}
            onBuy={onBuy}
          />
        )}

        {step.kind === "done" && <ResultView answer={step.answer} onClose={close} />}

        {step.kind === "unknown" && (
          <div>
            <div role="alert" style={{ fontSize: 13, color: C.danger[800], marginBottom: 10 }}>
              The answer from the server did not arrive. Some or all of the SMS may have been sent.
              Check the SMS balance and its history in Settings → Payment before sending again — sent again, patients would get them twice.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={onBuy} style={btnSecondary("md")}>Open Settings → Payment</button>
              <button type="button" onClick={close} style={btnSecondary("md")}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanView({ plan, sending, chamberId, onChamber, onBack, onSend, onBuy }: {
  plan: SmsPlan;
  sending: boolean;
  chamberId: string | undefined;
  onChamber: (id: string) => void;
  onBack: () => void;
  onSend: () => void;
  onBuy: () => void;
}) {
  const short = plan.balance < plan.cost;
  const ready = plan.problems.length === 0 && plan.recipients > 0;
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.n[700], marginBottom: 10 }}>
        Language: <b>{LANGUAGE_WORD[plan.language]}</b>
        {plan.doctorName && <> · Doctor: <b>{plan.doctorName}</b></>}
      </div>

      {plan.chambers.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <label data-caption htmlFor="sms-chamber" style={fieldLabel}>Chamber the patients are coming to</label>
          <select
            id="sms-chamber"
            value={chamberId ?? plan.chamberId ?? ""}
            disabled={sending}
            onChange={(e) => onChamber(e.target.value)}
            style={{ ...inputMd, width: "100%" }}
          >
            <option value="" disabled>Choose a chamber</option>
            {plan.chambers.map((c) => <option key={c.id} value={c.id}>{c.address}</option>)}
          </select>
        </div>
      )}

      {plan.problems.length > 0 && (
        <div role="alert" style={{ background: C.warn[50], border: `0.5px solid ${C.warn[100]}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: C.warn[800], marginBottom: 12 }}>
          {plan.problems.map((p) => <div key={p}>{p}</div>)}
        </div>
      )}

      {!plan.gatewayConfigured && (
        <div role="alert" style={{ background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: C.danger[800], marginBottom: 12 }}>
          SMS gateway is not configured. No SMS can be sent and nothing will be charged.
        </div>
      )}

      <ol aria-label="Patients" style={{ listStyle: "none", margin: 0, padding: 0, border: `0.5px solid ${C.n[200]}`, borderRadius: 8, maxHeight: 280, overflowY: "auto" }}>
        {plan.rows.map((r) => (
          <li key={r.visitId} data-sms-row style={{ padding: "8px 10px", borderBottom: `0.5px solid ${C.n[100]}`, fontSize: 12.5 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontWeight: 600, color: C.n[900], fontVariantNumeric: "tabular-nums" }}>{r.serial}.</span>
              <span style={{ fontWeight: 600, color: C.n[900] }}>{r.name}</span>
              {r.mobile && <span style={{ color: C.n[700], fontVariantNumeric: "tabular-nums" }}>{r.mobile}</span>}
              {r.minutes !== null && <span style={{ color: C.n[700], fontVariantNumeric: "tabular-nums" }}>{clockText(r.minutes)}</span>}
              <span style={{ marginLeft: "auto", color: r.skip ? C.warn[800] : C.n[700], fontVariantNumeric: "tabular-nums" }}>
                {r.skip ? "Not sent" : r.message ? `${r.segments} SMS` : ""}
              </span>
            </div>
            {r.skip && <div style={{ color: C.warn[800], marginTop: 2 }}>{r.skip}</div>}
            {r.message && <div data-sms-message style={{ color: C.n[700], marginTop: 3, whiteSpace: "pre-wrap" }}>{r.message}</div>}
          </li>
        ))}
      </ol>

      <div style={{ marginTop: 12, fontSize: 13, color: C.n[900], fontVariantNumeric: "tabular-nums" }}>
        <div data-sms-total>
          {plan.recipients} patient{plan.recipients === 1 ? "" : "s"} · {plan.segments} SMS × {taka(plan.costPerSegment)} = <b>{taka(plan.cost)}</b>
        </div>
        <div data-sms-balance style={{ color: C.n[700], marginTop: 2 }}>SMS balance: {taka(plan.balance)}</div>
        {plan.language === "bn" && <div style={{ fontSize: 11.5, color: C.n[600], marginTop: 2 }}>A Bangla message counts as more SMS than the same message in English.</div>}
      </div>

      {ready && short && (
        <div role="alert" style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: C.danger[800] }}>Not enough SMS balance.</div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {ready && short ? (
          <button type="button" onClick={onBuy} style={btnPrimary("md")}>Buy SMS</button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!plan.canSend || sending}
            style={plan.canSend && !sending ? btnPrimary("md") : { ...btnPrimary("md"), ...btnDisabled }}
          >
            {sending ? "Sending…" : `Send ${plan.segments} SMS (${taka(plan.cost)})`}
          </button>
        )}
        <button type="button" onClick={onBack} disabled={sending} style={sending ? { ...btnSecondary("md"), ...btnDisabled } : btnSecondary("md")}>Change language</button>
      </div>
      {sending && <div role="status" style={{ fontSize: 12, color: C.n[600], marginTop: 8 }}>Sending one by one — keep this box open.</div>}
    </div>
  );
}

const STATUS_WORD = { sent: "Sent", failed: "Failed", skipped: "Not sent" } as const;

function ResultView({ answer, onClose }: { answer: SmsSendAnswer; onClose: () => void }) {
  return (
    <div>
      <div role="status" data-sms-summary style={{ fontSize: 13.5, fontWeight: 600, color: answer.failed > 0 ? C.danger[800] : C.ok[800], marginBottom: 6 }}>
        {answer.sent} sent · {answer.failed} failed · {answer.skipped} not sent
      </div>
      <div style={{ fontSize: 12.5, color: C.n[700], marginBottom: 10, fontVariantNumeric: "tabular-nums" }}>
        Charged {taka(answer.charged)} (only for SMS that were sent) · SMS balance now {taka(answer.balance)}
      </div>
      <ol aria-label="Results" style={{ listStyle: "none", margin: 0, padding: 0, border: `0.5px solid ${C.n[200]}`, borderRadius: 8, maxHeight: 300, overflowY: "auto" }}>
        {answer.results.map((r) => (
          <li key={r.visitId} data-sms-result={r.status} style={{ padding: "7px 10px", borderBottom: `0.5px solid ${C.n[100]}`, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: C.n[900] }}>{r.serial}. {r.name}</span>
            {r.mobile && <span style={{ color: C.n[700], marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>{r.mobile}</span>}
            <span style={{ marginLeft: 8, fontWeight: 600, color: r.status === "sent" ? C.ok[800] : r.status === "failed" ? C.danger[800] : C.warn[800] }}>
              {STATUS_WORD[r.status]}
            </span>
            {r.status !== "sent" && <div style={{ color: C.n[700], marginTop: 2 }}>{r.detail}</div>}
          </li>
        ))}
      </ol>
      <div style={{ marginTop: 14 }}>
        <button type="button" onClick={onClose} style={btnSecondary("md")}>Close</button>
      </div>
    </div>
  );
}
