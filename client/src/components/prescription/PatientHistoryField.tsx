"use client";

import { useState, type ReactNode } from "react";
import { C } from "@/theme";
import { btnDisabled, btnPrimary, fieldLabel, inputSm } from "@/theme/styles";
import HideToggle from "@/components/common/HideToggle";
import { LoadError } from "@/components/common/ListState";
import { useMuqsit } from "@/context/MuqsitContext";
import { ApiError, patientsApi } from "@/lib/api";
import { confirmAction, tell } from "@/lib/dialogs";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import { dhakaToday } from "@/lib/opdDay";
import type { OeFinding } from "@/lib/onExaminationSummary";
import { HX_KINDS, hasHxEntry, hxLine, patientHistory, typedHxEntry, type HxKind } from "@/lib/patientHistory";

// ⚕️ The sidebar's "History" row (physician's sheet 28/10/2026, item 7, the red
// arrow on "History (+)"): this visit's History lines, as they always were —
// and under them the PATIENT'S Disease history and Surgical / intervention
// history, moved here from the On-examination popup in the same format (a text
// box, a Date box typed DDMMYY, Add; the entries listed under them).
//
//  • Kept for the patient, for every visit to come — written to the server at
//    Add, not at Save & print (`POST /patients/:id/on-examination`, the same
//    shared history the popup's lines went to, so nothing recorded there is
//    lost or shown twice).
//  • Seen by EVERY doctor who can reach the patient — the owner's practice, its
//    assistants, a supervising doctor (unlike My Personal Note, private to its
//    writer). The server stamps who wrote it.
//  • ⊘ Hide keeps the whole History section off the printed sheet for this
//    visit, like Drug history — OFF by default, because History always printed.
//  • × asks, then takes the entry off SOFTLY (kept in the record, marked
//    removed), with Undo.
//  • Nothing is shown as recorded before the server has it; a list that could
//    not be loaded is said, with Try again — never drawn as an empty one.

const why = (e: unknown, fallback: string): string =>
  // Only the server's 400 / 403 / 409 sentences are written for a doctor.
  e instanceof ApiError && [400, 403, 409].includes(e.status) && e.message ? e.message : fallback;

const DDMMYYYY = /^\d{2}\/\d{2}\/\d{4}$/;

export default function PatientHistoryField({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  const { currentPatientId, hideHistory, setHideHistory } = useMuqsit();
  return (
    <div style={{ position: "relative" }} data-testid="history-field">
      {/* Top right of the History row, where the row's own label and + leave room. */}
      <div style={{ position: "absolute", top: 5, right: 0 }}>
        {canEdit ? (
          <HideToggle hidden={hideHistory} onToggle={() => setHideHistory((v) => !v)} what="History" />
        ) : hideHistory ? (
          <span style={{ fontSize: 11, color: C.warn[800] }}>⊘ Hidden</span>
        ) : null}
      </div>
      {children}
      {/* Keyed by the patient: what is typed and not added, or an Undo, is
          never on the screen for the next patient. */}
      <PatientHxLists key={currentPatientId ?? "none"} canEdit={canEdit} />
    </div>
  );
}

interface Draft { text: string; date: string; error: string }
const EMPTY: Draft = { text: "", date: "", error: "" };

function PatientHxLists({ canEdit }: { canEdit: boolean }) {
  const {
    currentPatientId, ptDate, onExaminationSummary, setOnExaminationSummary,
    recordStatus, retryRecord, patientIdRef,
  } = useMuqsit();
  const hx = patientHistory(onExaminationSummary);
  const [drafts, setDrafts] = useState<Record<HxKind, Draft>>({ disease: EMPTY, surgical: EMPTY });
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<{ kind: HxKind; text: string } | null>(null);
  const setDraft = (k: HxKind, d: Partial<Draft>) => setDrafts((p) => ({ ...p, [k]: { ...p[k], ...d } }));

  if (!currentPatientId) return null;
  const ready = recordStatus === "ready";
  const controls = canEdit && ready;

  // The server's answer is the stored list — taken only while the patient it
  // was sent for is still the one loaded.
  const take = (pid: string, list: unknown) => {
    if (patientIdRef.current === pid && Array.isArray(list)) setOnExaminationSummary(list as OeFinding[]);
  };

  const add = async (kind: HxKind) => {
    const pid = currentPatientId;
    if (busy || !controls) return;
    const d = drafts[kind];
    const r = typedHxEntry(d.text, d.date);
    if (!r.ok) { setDraft(kind, { error: r.reason }); return; }
    if (hasHxEntry(hx[kind], r.value)) { setDraft(kind, { error: "This is in the list already." }); return; }
    const visit = isoToDdmmyyyy(ptDate);
    const today = isoToDdmmyyyy(dhakaToday());
    setBusy(true);
    try {
      const res = await patientsApi.appendOnExamination(pid, [{ date: DDMMYYYY.test(visit) ? visit : today, text: hxLine(kind, r.value) }]);
      take(pid, res?.onExaminationSummary);
      // The boxes are locked while it is on its way, so what is cleared is what was sent.
      setDraft(kind, EMPTY);
      setRemoved(null);
    } catch (e) {
      await tell({ title: "The history was not added.", body: why(e, "Check your internet connection and try again. What you typed is still in the box."), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (kind: HxKind, text: string, label: string) => {
    const pid = currentPatientId;
    if (busy || !controls) return;
    const ok = await confirmAction({
      title: `Remove “${text}” from this patient's ${label.toLowerCase()}?`,
      body: "Every doctor of this patient stops seeing it, here and on the records page. You can Undo right after.",
      confirmLabel: "Remove",
      cancelLabel: "Keep it",
      danger: true,
    });
    // The question does not freeze the page: another patient may be open now.
    if (!ok || patientIdRef.current !== pid) return;
    setBusy(true);
    try {
      const res = await patientsApi.removeHistoryEntry(pid, kind, text);
      take(pid, res?.onExaminationSummary);
      setRemoved({ kind, text });
    } catch (e) {
      await tell({ title: "The entry was not removed.", body: why(e, "Check your internet connection and try again."), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    const pid = currentPatientId;
    const r = removed;
    if (!r || busy) return;
    setBusy(true);
    try {
      const res = await patientsApi.restoreHistoryEntry(pid, r.kind, r.text);
      take(pid, res?.onExaminationSummary);
      setRemoved(null);
    } catch (e) {
      await tell({ title: "The entry was not put back.", body: why(e, "Check your internet connection and try again."), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ paddingLeft: 14, margin: "2px 0 6px" }} data-testid="patient-history">
      {recordStatus === "error" ? (
        <LoadError compact title="Could not load this patient's disease and surgical history." onRetry={retryRecord} />
      ) : recordStatus === "loading" ? (
        <div role="status" style={{ fontSize: 11.5, color: C.n[500] }}>Loading history…</div>
      ) : (
        HX_KINDS.map(({ kind, label, placeholder }) => {
          const list = hx[kind];
          const d = drafts[kind];
          return (
            <div key={kind} style={{ marginBottom: 6 }} data-testid={`hx-${kind}`}>
              <div style={{ ...fieldLabel, marginBottom: 2 }}>{label}</div>
              {list.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {list.map((e) => (
                    <li key={e.text} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: C.n[800], padding: "1.5px 0" }}>
                      <span aria-hidden style={{ color: C.n[400] }}>•</span>
                      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{e.text}</span>
                      {controls && (
                        <button type="button" aria-label={`Remove "${e.text}"`} title="Remove from this patient's history"
                          disabled={busy} onClick={() => void remove(kind, e.text, label)}
                          style={{ border: "none", background: "none", color: C.n[500], fontSize: 13, lineHeight: 1, cursor: "pointer", padding: "0 2px", fontFamily: "inherit" }}>×</button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                !controls && <div style={{ fontSize: 11.5, color: C.n[500] }}>None recorded.</div>
              )}
              {controls && (
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap", marginTop: 3 }}>
                  <input aria-label={label} value={d.text} placeholder={placeholder} disabled={busy} maxLength={1900}
                    onChange={(ev) => setDraft(kind, { text: ev.target.value, error: "" })}
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void add(kind); } }}
                    style={{ ...inputSm, flex: "3 1 150px", minWidth: 0 }} />
                  <input aria-label={`${label} date`} value={d.date} placeholder="DDMMYY" inputMode="numeric" disabled={busy}
                    title="Type DDMMYY — e.g. 151026 → 15/10/2026. Optional."
                    onChange={(ev) => setDraft(kind, { date: ev.target.value, error: "" })}
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void add(kind); } }}
                    style={{ ...inputSm, flex: "1 1 72px", minWidth: 0 }} />
                  <button type="button" aria-label={`Add ${label.toLowerCase()}`} disabled={busy} onClick={() => void add(kind)}
                    style={{ ...btnPrimary("sm"), ...(busy ? btnDisabled : null) }}>Add</button>
                </div>
              )}
              {d.error && <div role="alert" style={{ fontSize: 11, color: C.danger[800], marginTop: 2 }}>{d.error}</div>}
            </div>
          );
        })
      )}
      {removed && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 4px", padding: "4px 8px", borderRadius: 6, background: C.n[50], border: `0.5px solid ${C.n[200]}`, fontSize: 11.5, color: C.n[700] }}>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>Removed “{removed.text}”</span>
          <button type="button" onClick={() => void undo()} disabled={busy} style={{ border: "none", background: "none", color: C.pri[600], fontWeight: 600, fontSize: 11.5, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Undo</button>
          <button type="button" aria-label="Dismiss" onClick={() => setRemoved(null)} style={{ border: "none", background: "none", color: C.n[500], fontSize: 13, cursor: "pointer", padding: 0, lineHeight: 1, fontFamily: "inherit" }}>×</button>
        </div>
      )}
    </div>
  );
}
