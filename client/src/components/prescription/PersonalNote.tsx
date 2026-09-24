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

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { useAuth } from "@/context/AuthContext";
import { ApiError, patientNotesApi, type PatientNoteInfo } from "@/lib/api";
import { isBlankHtml, sanitizeHtml } from "@/lib/safeHtml";
import RichTextEditor from "@/components/common/RichTextEditor";

const INFO_ROWS: { key: keyof PatientNoteInfo; label: string }[] = [
  { key: "name", label: "Patient Name" },
  { key: "age", label: "Age" },
  { key: "sex", label: "Sex" },
  { key: "address", label: "Address" },
  { key: "mobile", label: "Mobile Number" },
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The printable page: this note alone, nothing else from the editor. */
export function personalNoteHtml(info: PatientNoteInfo, noteHtml: string, printedOn: string): string {
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
</style></head><body>
<h1>My Personal Note for This Patient</h1>
<div class="sub">Private note · printed ${esc(printedOn)}</div>
<table>${rows}</table>
<div class="label">Note</div>
<div class="note">${sanitizeHtml(noteHtml)}</div>
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

export function PersonalNoteSection() {
  const { currentPatientId } = useMuqsit();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 18, paddingTop: 12, borderTop: `0.5px dashed ${C.n[300]}` }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!currentPatientId}
        title={currentPatientId ? "Only you can see this note" : "Load a saved patient to write a personal note"}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.pri[400]}`, background: C.pri[50], color: C.pri[800], fontSize: 13.5, fontWeight: 600, fontFamily: font, cursor: currentPatientId ? "pointer" : "not-allowed", opacity: currentPatientId ? 1 : 0.55, textAlign: "left" }}
      >
        <span aria-hidden>🔒</span>
        <span style={{ flex: 1 }}>My Personal Note for This Patient</span>
      </button>
      {open && currentPatientId && <PersonalNoteBox patientId={currentPatientId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function PersonalNoteBox({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { ptName, ptAge, ptGender, ptAddress, ptPhone, activeWorkstation } = useMuqsit();
  const { user } = useAuth();
  const qc = useQueryClient();
  // Keyed by the signed-in user too, so switching account never serves another
  // person's note from cache.
  const key = ["patient-note", user?.id ?? "", activeWorkstation?.doctorId ?? "", patientId];
  const q = useQuery({ queryKey: key, queryFn: () => patientNotesApi.get(patientId), staleTime: 0 });

  const liveInfo: PatientNoteInfo = useMemo(
    () => ({ name: ptName.trim(), age: ptAge.trim(), sex: ptGender.trim(), address: ptAddress.trim(), mobile: ptPhone.trim() }),
    [ptName, ptAge, ptGender, ptAddress, ptPhone],
  );
  const saved = q.data ?? null;
  const info = saved?.patientInfo ?? liveInfo;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  // Once loaded: a note that does not exist yet opens straight into writing.
  useEffect(() => {
    if (!q.isSuccess || dirty) return;
    setDraft(saved?.html ?? "");
    if (!saved) setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isSuccess, saved?.html]);

  const save = useMutation({
    mutationFn: () => patientNotesApi.save(patientId, { html: draft, patientInfo: liveInfo }),
    onSuccess: (note) => {
      qc.setQueryData(key, note);
      setDirty(false);
      setEditing(false);
      setError("");
    },
    onError: (e) => setError(e instanceof ApiError ? `Note NOT saved: ${e.message}` : "Note NOT saved. Is the connection up?"),
  });

  const requestClose = () => {
    if (dirty && !confirmClose) { setConfirmClose(true); return; }
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const today = (() => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; })();
  const btn = (primary: boolean, disabled = false) => ({
    padding: "7px 18px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, fontFamily: font,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1,
    border: `1px solid ${primary ? C.pri[400] : C.n[300]}`, background: primary ? C.pri[400] : C.n[0], color: primary ? C.n[0] : C.n[800],
  });

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div role="dialog" aria-modal="true" aria-label="My Personal Note for This Patient" style={{ width: "min(720px, 94vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: C.n[0], borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.18)", fontFamily: font }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px 10px", borderBottom: `0.5px solid ${C.n[200]}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.n[900] }}>My Personal Note for This Patient</div>
            <div style={{ fontSize: 11.5, color: C.n[600], marginTop: 2 }}>🔒 Private — only you can see this note. It is not part of the prescription.</div>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 18, lineHeight: 1, color: C.n[500], cursor: "pointer", padding: "2px 6px" }}>×</button>
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
                    value={draft}
                    onChange={(html) => { setDraft(html); setDirty(true); setConfirmClose(false); }}
                    minHeight={220}
                    placeholder="Write your personal note…"
                    allowImages={false}
                    highlight
                  />
                ) : isBlankHtml(draft) ? (
                  <div style={{ fontSize: 13, color: C.n[500], padding: "10px 0" }}>No note yet. Press Edit to write one.</div>
                ) : (
                  <div
                    style={{ fontSize: 13.5, color: C.n[900], lineHeight: 1.5, border: `0.5px solid ${C.n[200]}`, borderRadius: 8, padding: "10px 12px", overflowWrap: "anywhere" }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(draft) }}
                  />
                )}
              </div>
              {saved && <div style={{ fontSize: 11, color: C.n[500] }}>Last saved {new Date(saved.updatedAt).toLocaleString()}</div>}
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: `0.5px solid ${C.n[200]}`, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160, fontSize: 12, color: error || confirmClose ? C.danger[800] : C.n[500] }}>
            {error || (confirmClose ? (
              <span>Unsaved changes. <button type="button" onClick={onClose} style={{ border: "none", background: "none", color: C.danger[800], textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12, fontFamily: font }}>Discard them</button> or Save.</span>
            ) : "")}
          </div>
          <button type="button" onClick={() => setEditing(true)} disabled={editing || !q.isSuccess} style={btn(false, editing || !q.isSuccess)}>Edit</button>
          <button type="button" onClick={() => save.mutate()} disabled={!dirty || save.isPending} style={btn(true, !dirty || save.isPending)}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => printHtml(personalNoteHtml(info, draft, today))}
            disabled={!q.isSuccess}
            title="Print this personal note only"
            style={btn(false, !q.isSuccess)}
          >
            🖨 Print
          </button>
        </div>
      </div>
    </div>
  );
}
