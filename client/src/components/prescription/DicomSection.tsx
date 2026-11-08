"use client";

// "Imaging DICOM file" (physician's sheet 07/11/2026): upload a DICOM file with
// a name and a date, see it below as an icon with both, press it to open the
// scan in the in-app viewer (`DicomViewer`, full screen). Edit removes a file —
// softly: the server keeps the row and the bytes.

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { C, font } from "@/theme";
import { btnDisabled, btnPrimary, btnSecondary, btnClose, dialogTitle, scrim, shadowDialog } from "@/theme/styles";
import { PlusLabel } from "@/components/common/AddCircleButton";
import { useMuqsit } from "@/context/MuqsitContext";
import { ApiError, patientFilesApi, type PatientFileRow } from "@/lib/api";
import { confirmAction, tell } from "@/lib/dialogs";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import { dhakaToday } from "@/lib/opdDay";
import { pressable } from "@/lib/a11y";
import { useDialog } from "@/lib/useDialog";
import { usePatientFileAccess } from "@/hooks/usePatientFileAccess";
import DateField from "@/components/common/DateField";
import { LoadError } from "@/components/common/ListState";
import { SectionHeader } from "./RecordsHistorySections";
import dynamic from "next/dynamic";

// Browser only, and fetched when a scan is opened: `dwv` is large, and its
// package points the SERVER build at a Node file that cannot be bundled.
const DicomViewer = dynamic(() => import("./DicomViewer"), { ssr: false });

const stem = (n: string) => n.replace(/\.[^.]*$/, "");
const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The file icon of the sheet: a page with a DICOM tag. */
function DicomIcon() {
  return (
    <svg width="64" height="76" viewBox="0 0 64 76" aria-hidden focusable="false">
      <path d="M6 2h34l18 18v50a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z" fill={C.n[100]} stroke={C.n[300]} strokeWidth="1.5" />
      <path d="M40 2v18h18" fill={C.n[200]} stroke={C.n[300]} strokeWidth="1.5" />
      <rect x="2" y="34" width="46" height="20" rx="3" fill={C.pri[600]} />
      <text x="25" y="48.5" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.n[0]} fontFamily={font}>DICOM</text>
    </svg>
  );
}

export default function DicomSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { currentPatientId } = useMuqsit();
  const canEdit = usePatientFileAccess() && Boolean(currentPatientId);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<PatientFileRow | null>(null);
  const q = useQuery({
    queryKey: ["patient-files", currentPatientId, "dicom"],
    queryFn: () => patientFilesApi.list(currentPatientId as string, "dicom"),
    enabled: Boolean(currentPatientId) && open,
  });
  const rows = q.data ?? [];
  const refresh = (pid: string) => qc.invalidateQueries({ queryKey: ["patient-files", pid, "dicom"] });

  const removeOne = async (r: PatientFileRow) => {
    const pid = currentPatientId;
    if (!pid) return;
    const ok = await confirmAction({
      title: `Remove “${r.name}” (${r.fileDate})?`,
      body: "It leaves this list. The file itself is kept on the server.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok || pid !== currentPatientId) return;
    try {
      await patientFilesApi.remove(pid, r.id);
      await refresh(pid);
    } catch (e) {
      tell({ title: "It was not removed.", body: e instanceof ApiError ? e.message : "The connection failed. Try again." });
    }
  };

  return (
    <section style={{ marginTop: 22 }} aria-label="Imaging DICOM file">
      <SectionHeader
        title="Imaging DICOM file"
        open={open}
        onToggle={onToggle}
        actions={
          <>
            {rows.length > 0 && canEdit && (editing
              ? <button onClick={() => setEditing(false)} style={btnSecondary("sm")}>Done</button>
              : <button onClick={() => setEditing(true)} style={btnSecondary("sm")}>✎ Edit</button>)}
            <button
              onClick={() => setAdding(true)}
              disabled={!canEdit}
              title={canEdit ? undefined : currentPatientId ? "Only the patient's own doctor can upload" : "Load a saved patient first"}
              style={{ ...btnPrimary("sm"), ...(canEdit ? null : btnDisabled) }}
            ><PlusLabel>Upload DICOM</PlusLabel></button>
          </>
        }
      />
      {!open ? null : !currentPatientId ? (
        <div style={{ fontSize: 13, color: C.n[500] }}>Load a saved patient to see their imaging files.</div>
      ) : q.isError ? (
        <LoadError compact title="Could not load the DICOM files." onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : !q.data ? (
        <div style={{ fontSize: 13, color: C.n[500] }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: C.n[500] }}>No DICOM files yet. Use <b>Upload DICOM</b> to add a scan (a .dcm file) with its name and date.</div>
      ) : (
        <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 12, background: C.n[0], padding: 16, display: "flex", flexWrap: "wrap", gap: 18 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ width: 150, textAlign: "center", position: "relative" }}>
              <div
                {...pressable()}
                onClick={() => { if (!editing) setViewing(r); }}
                aria-label={`Open ${r.name}, ${r.fileDate}`}
                title={editing ? undefined : `Open in the viewer · ${mb(r.size)}`}
                style={{ cursor: editing ? "default" : "pointer", display: "inline-block" }}
              >
                <DicomIcon />
              </div>
              <div style={{ fontSize: 12.5, color: C.n[900], fontWeight: 600, overflowWrap: "anywhere", marginTop: 4 }}>{r.name}</div>
              <div style={{ fontSize: 11.5, color: C.n[600] }}>{r.fileDate}</div>
              {editing && (
                <button
                  onClick={() => void removeOne(r)}
                  aria-label={`Remove ${r.name}`}
                  title="Remove"
                  style={{ position: "absolute", top: -6, right: 18, width: 24, height: 24, borderRadius: "50%", border: `1px solid ${C.danger[100]}`, background: C.danger[50], color: C.danger[400], cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && currentPatientId && (
        <UploadDicom
          patientId={currentPatientId}
          onClose={() => setAdding(false)}
          onDone={async () => { setAdding(false); await refresh(currentPatientId); }}
        />
      )}
      {viewing && <DicomViewer url={viewing.url} title={`${viewing.name} — ${viewing.fileDate}`} onClose={() => setViewing(null)} />}
    </section>
  );
}

// The upload box: the file, its name and its date. Nothing is sent until Upload.
function UploadDicom({ patientId, onClose, onDone }: { patientId: string; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dateIso, setDateIso] = useState(dhakaToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // A box that is uploading is not closed by a stray Escape or a click outside.
  const dialog = useDialog(true, () => { if (!busy) onClose(); });

  const upload = async () => {
    if (!file || !name.trim() || !dateIso) return;
    setBusy(true);
    setError("");
    try {
      await patientFilesApi.upload(patientId, "dicom", file, { name: name.trim(), fileDate: isoToDdmmyyyy(dateIso) });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The upload did not finish. Check the connection and try again.");
      setBusy(false);
    }
  };
  const ready = Boolean(file && name.trim() && dateIso) && !busy;
  const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 };
  const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.n[300]}`, fontSize: 13, outline: "none", fontFamily: font, background: C.n[0], color: C.n[900] };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, background: scrim, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, fontFamily: font, padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Upload DICOM file" {...dialog} style={{ background: C.n[0], borderRadius: 14, padding: 22, width: 440, maxWidth: "100%", maxHeight: "100%", overflowY: "auto", boxShadow: shadowDialog }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={dialogTitle}>Upload DICOM file</div>
          <button aria-label="Close" onClick={onClose} disabled={busy} style={btnClose}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>File (.dcm)</span>
          <input
            ref={input}
            type="file"
            accept=".dcm,.dicom,application/dicom"
            aria-label="DICOM file"
            disabled={busy}
            style={{ fontSize: 13 }}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !name.trim()) setName(stem(f.name));
            }}
          />
          {file && <div style={{ fontSize: 11.5, color: C.n[500], marginTop: 4 }}>{mb(file.size)}</div>}
        </div>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={lbl}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={busy} placeholder="e.g. MRI whole abdomen" style={inp} />
        </label>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={lbl}>Date of the scan</span>
          <div style={{ width: 160 }}><DateField value={dateIso} onChange={setDateIso} placeholder="DD/MM/YYYY" style={inp} /></div>
        </label>

        {error && <div role="alert" style={{ fontSize: 12.5, color: C.danger[800], background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, borderRadius: 8, padding: "8px 11px", marginBottom: 14 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
          {busy && <span style={{ fontSize: 12, color: C.n[600] }}>Uploading… a large scan can take a few minutes.</span>}
          <button onClick={() => void upload()} disabled={!ready} style={{ ...btnPrimary("md"), fontWeight: 600, ...(ready ? null : btnDisabled) }}>Upload</button>
        </div>
      </div>
    </div>
  );
}
