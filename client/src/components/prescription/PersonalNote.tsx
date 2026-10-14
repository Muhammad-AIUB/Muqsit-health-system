"use client";

// ⚕️ "My Personal Note for This Patient" (physician's request, 2026-09-24).
//
//  • STRICTLY PRIVATE to the signed-in user. The server keys the note by the
//    authenticated user, never the workstation doctor, so an assistant, the
//    practice owner or a supervising doctor each see only their OWN note —
//    see server/src/patient-notes. It is never written to the activity feed,
//    never mirrored to another device and never part of the prescription.
//  • One evolving note per patient: a new visit does not reset it.
//  • Name / age / sex / address / mobile are filled from the patient's details
//    the first time, then kept exactly as they were at that first save.
//  • Edit, Save (not optimistic — the box stays open with the text if the save
//    fails) and Print, which prints this note alone.
//  • The box is opened FOR a patient and is that patient's until it is closed,
//    whatever the editor behind it moves on to (2026-10-12).

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { C, font, PAPER } from "@/theme";
import { effectVar } from "@/theme/palette";
import { btnPrimary, btnSecondary, dialogTitle, scrim, btnDisabled, shadowDialog, btnClose } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import { ApiError, patientNotesApi, type PatientNoteInfo } from "@/lib/api";
import { isBlankHtml, sanitizeHtml } from "@/lib/safeHtml";
import { hasSensitive, sensitiveCss, stripSensitive } from "@/lib/sensitive";
import RichTextEditor from "@/components/common/RichTextEditor";
import Icon from "@/components/common/Icon";
import { stamp } from "@/lib/stamp";
import { useDialog } from "@/lib/useDialog";

const INFO_ROWS: { key: keyof PatientNoteInfo; label: string }[] = [
  { key: "name", label: "Patient Name" },
  { key: "age", label: "Age" },
  { key: "sex", label: "Sex" },
  { key: "address", label: "Address" },
  { key: "mobile", label: "Mobile Number" },
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The printable page: this note alone, nothing else from the editor.
 *  Sensitive runs print only when `sensitive` is true — the doctor's choice at
 *  Print. Leaving them out is the default, so a caller that forgets to ask
 *  never puts them on paper. */
export function personalNoteHtml(info: PatientNoteInfo, noteHtml: string, printedOn: string, opts: { sensitive?: boolean } = {}): string {
  const body = opts.sensitive ? sanitizeHtml(noteHtml) : stripSensitive(noteHtml);
  const rows = INFO_ROWS.map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(info[r.key] ?? "") || "—"}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Personal note</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Arial, "Nirmala UI", "Noto Sans Bengali", sans-serif; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 11px; margin-bottom: 12px; }
  table { border-collapse: collapse; margin-bottom: 14px; }
  th { text-align: left; font-weight: 600; padding: 3px 14px 3px 0; color: #444; vertical-align: top; }
  td { padding: 3px 0; }
  .label { font-weight: 600; margin-bottom: 6px; }
  .note { line-height: 1.5; overflow-wrap: anywhere; }
  ${sensitiveCss(".note", { inert: true })}
</style></head><body>
<h1>My Personal Note for This Patient</h1>
<div class="sub">Private note · printed ${esc(printedOn)}</div>
<table>${rows}</table>
<div class="label">Note</div>
<div class="note">${body}</div>
</body></html>`;
}

function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 150);
}

/** Whose note is open, and the details the header showed when it was opened. */
interface OpenNote { patientId: string; details: PatientNoteInfo }

export function PersonalNoteSection() {
  const { currentPatientId, ptName, ptAge, ptGender, ptAddress, ptPhone } = useMuqsit();
  // ⚕️ The note is opened FOR a patient, and it is that patient's until it is
  // closed. It used to be handed `currentPatientId` on every render, and that
  // can change under an open note: another device picks the next patient from
  // the search box (device mirroring), or a patient chosen from the OPD queue
  // finishes loading after the note was opened. The box then held one
  // patient's typed words over the other's details — and Save wrote them into
  // the other's note; a print question asked about one note printed the other
  // (fourth review, 2026-10-12; e2e/tests/personal-note.spec.ts runs it with
  // two browsers).
  //
  // What this does NOT cover: the editor being CLEARED, or left for another
  // tab, from the other device. `PatientGate` and the tab router redraw the
  // editor then, and this section with it — the note closes, and words typed
  // and not saved are lost, as they always were (FUNCTIONAL-AUDIT.md).
  const [openFor, setOpenFor] = useState<OpenNote | null>(null);
  const open = () => {
    // Not while a note is open. This button stays in the page behind the note:
    // a mouse cannot reach it and Tab does not leave the note, but a screen
    // reader or a voice command can press it — and pressed with another
    // patient in the editor, it would hand the open box, typed words and all,
    // to that patient.
    if (!currentPatientId || openFor) return;
    setOpenFor({
      patientId: currentPatientId,
      details: { name: ptName.trim(), age: ptAge.trim(), sex: ptGender.trim(), address: ptAddress.trim(), mobile: ptPhone.trim() },
    });
  };
  return (
    <div style={{ marginTop: 18, paddingTop: 12, borderTop: `0.5px dashed ${C.n[300]}` }}>
      <button
        type="button"
        onClick={open}
        disabled={!currentPatientId}
        title={currentPatientId ? "Only you can see this note" : "Load a saved patient to write a personal note"}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.pri[400]}`, background: C.pri[50], color: C.pri[800], fontSize: 13.5, fontWeight: 600, fontFamily: font, cursor: currentPatientId ? "pointer" : "not-allowed", opacity: currentPatientId ? 1 : 0.55, textAlign: "left" }}
      >
        <Icon name="lock" size={16} />
        <span style={{ flex: 1 }}>My Personal Note for This Patient</span>
      </button>
      {openFor && <PersonalNoteBox {...openFor} onClose={() => setOpenFor(null)} />}
    </div>
  );
}

function PersonalNoteBox({ patientId, details, onClose }: OpenNote & { onClose: () => void }) {
  const { activeWorkstation } = useMuqsit();
  const { user } = useAuth();
  const qc = useQueryClient();
  // Keyed by the signed-in user too, so switching account never serves another
  // person's note from cache.
  const key = ["patient-note", user?.id ?? "", activeWorkstation?.doctorId ?? "", patientId];
  const q = useQuery({ queryKey: key, queryFn: () => patientNotesApi.get(patientId), staleTime: 0 });

  const saved = q.data ?? null;
  const info = saved?.patientInfo ?? details;

  // ⚕️ The note has ONE text: what has been typed since it was loaded or last
  // saved, and until something is, the saved note. The box shows it, Save
  // sends it and Print prints it — nothing reads anything else.
  //
  // It used to be a `draft` that an effect copied the loaded note into, with a
  // separate "changed" flag beside it. The copy arrived one render late (Print
  // pressed in that instant printed an empty note and skipped its question —
  // three tests of it failed one run in four), and the flag could say "saved"
  // over text that was not: see `save` below.
  const [edited, setEdited] = useState<string | null>(null);
  const editedNow = useRef<string | null>(null); // the same, for a save that comes back later
  const setTyped = (html: string | null) => { editedNow.current = html; setEdited(html); };
  const text = edited ?? saved?.html ?? "";
  const dirty = edited !== null;

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [askPrint, setAskPrint] = useState(false);

  // A note with sensitive text asks how to print it; any other prints at once.
  const onPrint = () => {
    if (hasSensitive(text)) { setAskPrint(true); return; }
    printHtml(personalNoteHtml(info, text, today));
  };
  const printAs = (sensitive: boolean) => {
    setAskPrint(false);
    printHtml(personalNoteHtml(info, text, today, { sensitive }));
  };

  // A note that does not exist yet opens straight into writing.
  const noNoteYet = q.isSuccess && !saved;
  useEffect(() => { if (noNoteYet) setEditing(true); }, [noNoteYet]);

  const save = useMutation({
    mutationFn: (html: string) => patientNotesApi.save(patientId, { html, patientInfo: details }),
    onSuccess: (note, sent) => {
      qc.setQueryData(key, note);
      setError("");
      // ⚕️ Only what was SENT has been saved. The box stays open for writing
      // while the request is on its way, and whatever was typed in that time
      // is still unsaved: it stays, the editor stays, and Save can be pressed
      // again. Marked saved with the rest, it was either thrown away when the
      // saved note was copied back in, or — when the text sent was the text
      // already saved — left on the screen looking saved, to be lost on Close.
      if (editedNow.current !== sent) return;
      setTyped(null);
      setEditing(false);
      setConfirmClose(false); // nothing is unsaved any more: the line that said so goes
    },
    onError: (e) => setError(e instanceof ApiError ? `Note NOT saved: ${e.message}` : "Note NOT saved. Is the connection up?"),
  });

  const requestClose = () => {
    if (dirty && !confirmClose) { setConfirmClose(true); return; }
    onClose();
  };
  // Two popups, one inside the other, and the hook gives each the keyboard
  // while it is the one on top: the "how should it be printed?" question owns
  // Escape and Tab while it is up, then the note has them back.
  const dialog = useDialog(true, requestClose);
  const printQuestion = useDialog(askPrint, () => setAskPrint(false));

  const today = (() => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; })();
  const btn = (primary: boolean, disabled = false) => ({
    ...(primary ? btnPrimary("md") : btnSecondary("md")), fontWeight: 600,
    ...(disabled ? btnDisabled : null),
  });

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
      style={{ position: "fixed", inset: 0, background: scrim, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div role="dialog" aria-modal="true" aria-label="My Personal Note for This Patient" {...dialog} style={{ position: "relative", width: "min(720px, 100%)", maxHeight: "100%", display: "flex", flexDirection: "column", background: C.n[0], borderRadius: 12, boxShadow: shadowDialog, fontFamily: font }}>
        <style>{sensitiveCss(".pn-view", { inert: true })}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `0.5px solid ${C.n[200]}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...dialogTitle }}>My Personal Note for This Patient</div>
            <div style={{ fontSize: 11.5, color: C.n[600], marginTop: 2 }}><Icon name="lock" size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Private — only you can see this note. It is not part of the prescription.</div>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close" style={btnClose}>×</button>
        </div>

        <div style={{ padding: "12px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {q.isLoading && <div style={{ fontSize: 12.5, color: C.n[500] }}>Loading your note…</div>}
          {q.isError && (
            <div role="alert" style={{ fontSize: 12.5, color: C.danger[800], background: C.danger[50], borderRadius: 8, padding: "8px 11px" }}>
              Your note could not be loaded. <button type="button" onClick={() => q.refetch()} style={{ border: "none", background: "none", color: C.danger[800], textDecoration: "underline", cursor: "pointer", padding: 0, fontFamily: font }}>Try again</button>
            </div>
          )}
          {q.isSuccess && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "5px 16px", fontSize: 13, background: C.n[50], border: `0.5px solid ${C.n[200]}`, borderRadius: 8, padding: "10px 12px" }}>
                {INFO_ROWS.map((r) => (
                  <div key={r.key} style={{ display: "contents" }}>
                    <div style={{ color: C.n[600], fontWeight: 500 }}>{r.label}</div>
                    <div style={{ color: C.n[900], overflowWrap: "anywhere" }}>{info[r.key] || "—"}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Note</div>
                {editing ? (
                  <RichTextEditor
                    value={text}
                    // The editor reports its text every time the focus leaves it,
                    // typed in or not. The same text is not a change — taken as
                    // one, tabbing through an untouched note made it ask about
                    // unsaved changes that did not exist.
                    onChange={(html) => { if (html === text) return; setTyped(html); setConfirmClose(false); }}
                    minHeight={220}
                    placeholder="Write your personal note…"
                    allowImages={false}
                    highlight
                    sensitive
                  />
                ) : isBlankHtml(text) ? (
                  <div style={{ fontSize: 13, color: C.n[500], padding: "10px 0" }}>No note yet. Press Edit to write one.</div>
                ) : (
                  <div
                    className="pn-view"
                    // Paper in both modes, as the editor is (theme PAPER).
                    style={{ fontSize: 13.5, color: PAPER.color, background: PAPER.background, lineHeight: 1.5, border: `0.5px solid ${C.n[200]}`, borderRadius: 8, padding: "10px 12px", overflowWrap: "anywhere" }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
                  />
                )}
              </div>
              {saved && <div style={{ fontSize: 11, color: C.n[500] }}>Last saved {stamp(saved.updatedAt)}</div>}
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: `0.5px solid ${C.n[200]}`, flexWrap: "wrap" }}>
          {/* The message keeps room only when there is one. Empty, it used to
              hold 160px all the same, and on a phone that left Edit alone at the
              right of one line with Save and Print at the left of the next. Now
              the three stand together at the right, under the message if any. */}
          <div style={{ flex: error || confirmClose ? "1 1 240px" : "1 1 0", minWidth: 0, fontSize: 12, color: error || confirmClose ? C.danger[800] : C.n[500] }}>
            {error || (confirmClose ? (
              <span>Unsaved changes. <button type="button" onClick={onClose} style={{ border: "none", background: "none", color: C.danger[800], textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12, fontFamily: font }}>Discard them</button> or Save.</span>
            ) : "")}
          </div>
          <button type="button" onClick={() => setEditing(true)} disabled={editing || !q.isSuccess} style={{ ...btn(false, editing || !q.isSuccess), marginLeft: "auto" }}>Edit</button>
          <button type="button" onClick={() => save.mutate(text)} disabled={!dirty || save.isPending} style={btn(true, !dirty || save.isPending)}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onPrint}
            disabled={!q.isSuccess}
            title="Print this personal note only"
            style={btn(false, !q.isSuccess)}
          >
            <Icon name="printer" size={15} /> Print
          </button>
        </div>

        {askPrint && (
          <div
            onMouseDown={(e) => { if (e.target === e.currentTarget) setAskPrint(false); }}
            style={{ position: "absolute", inset: 0, background: effectVar("veil-surface"), borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          >
            <div role="dialog" aria-modal="true" aria-label="Print the note" {...printQuestion} style={{ width: "min(380px, 100%)", background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, boxShadow: shadowDialog, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.n[900] }}>This note has sensitive information</div>
              <div style={{ fontSize: 12.5, color: C.n[600] }}>How should it be printed?</div>
              <button type="button" onClick={() => printAs(true)} style={{ ...btn(false), justifyContent: "flex-start" }}><Icon name="lock" size={14} /> Print with sensitive information</button>
              <button type="button" onClick={() => printAs(false)} style={{ ...btn(true), textAlign: "left" }}>Print without sensitive information</button>
              <button type="button" onClick={() => setAskPrint(false)} style={{ border: "none", background: "none", color: C.n[600], fontSize: 12.5, cursor: "pointer", fontFamily: font, alignSelf: "flex-end" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
