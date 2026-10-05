"use client";

// "Patient's Prescriptions & reports" — a full view entered from the patient
// header. Three parts:
//   1. All prescriptions — gallery of uploaded prescription images
//   2. All reports       — gallery of uploaded report images
//   3. Investigation reports summary — dated text findings
//
// Images are uploaded to the self-hosted /uploads store and their URLs are
// persisted on the Patient record (loaded back when the patient is opened).
// Galleries support: Edit mode (select → remove), drag-to-reorder, and a
// lightbox with ←/→ keyboard navigation.

import { useEffect, useMemo, useRef, useState } from "react";
import { C, font } from "@/theme";
import { tell } from "@/lib/dialogs";
import { btnDisabled, btnPrimary, btnSecondary } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import { uploadImage, ApiError } from "@/lib/api";
import { THUMB_UPLOAD, thumbFor, type ThumbMap } from "@/lib/imageThumbs";
import { parseInvestigationEntries, mergeFindings, groupByDate, type InvFinding } from "@/lib/investigationSummary";
import { groupOeByDate, type OeFinding } from "@/lib/onExaminationSummary";
import { cellToDate } from "@/lib/hmDates";
import { isImplausibleDate, YEAR_POLICY } from "@/lib/dateInput";
import InvestigationDownload from "./InvestigationDownload";
import ImageGallery from "@/components/common/ImageGallery";
import { pdfFileName } from "@/lib/galleryPdf";
import ImageLightbox from "@/components/common/ImageLightbox";
import Icon from "@/components/common/Icon";

// A dd/mm/yyyy group heading, flagged when the date sits implausibly far ahead.
// Findings written before the DDMMYY century fix could only land in 2000-2099,
// so 010198 was stored as 2098. The row still renders exactly as recorded and
// nothing is rewritten — the marker only tells the doctor where to look.
function DateHeading({ date }: { date: string }) {
  const suspicious = isImplausibleDate(cellToDate(date), YEAR_POLICY.clinical);
  return (
    <div style={{ fontSize: 13, fontWeight: 600, color: C.n[900], marginBottom: 2 }}>
      {date}
      {suspicious && (
        <span
          style={{ color: C.warn[600], marginLeft: 6, fontWeight: 400 }}
          title={`This date is more than ${YEAR_POLICY.clinical} years ahead. It may have been entered as DDMMYY before this was fixed.`}
        >
          ⚠
        </span>
      )}
    </div>
  );
}

// The exact identity `removeFinding` deletes by.
const savedKey = (f: InvFinding) => JSON.stringify([f.date, f.test, f.value]);

// A one-step Undo for a history delete. ⚕️ It carries the patient it was taken
// on: `prev` is that patient's WHOLE history, and writing it back while another
// patient is loaded would put one patient's findings into another's record.
// `status` follows the write — the bar stays until the server has the change,
// and says so when it did not land.
type UndoEntry<T> = {
  token: number; pid: string | null; prev: T[]; next: T[]; label: string;
  status: "saving" | "saved" | "restoring" | "error"; error?: string;
};
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : "the connection failed");

export default function PatientRecordsView() {
  const {
    currentPatientId, ptName,
    rxImages, saveRxImages, reportImages, saveReportImages, appendGalleryImages, imageThumbs,
    investigation, investigationSummary, saveInvestigationSummary, openInvForSummary,
    setInvestigationSummary, onExaminationSummary, setOnExaminationSummary, saveOnExaminationSummary,
  } = useMuqsit();
  const [showDownload, setShowDownload] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [undo, setUndo] = useState<UndoEntry<InvFinding> | null>(null);
  const [oeEditing, setOeEditing] = useState(false);
  const [oeUndo, setOeUndo] = useState<UndoEntry<OeFinding> | null>(null);
  const undoSeq = useRef(0);

  // ⚕️ This view stays mounted while the header lookup opens another patient,
  // so nothing taken on the previous patient may survive the switch — least of
  // all an Undo holding their whole history.
  useEffect(() => {
    setUndo(null); setOeUndo(null); setEditingSummary(false); setOeEditing(false);
  }, [currentPatientId]);

  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);
  const [busyRx, setBusyRx] = useState(false);
  const [busyReport, setBusyReport] = useState(false);

  // Upload files, keeping whatever lands.
  //
  // This used to be `Promise.all`, which rejects on the FIRST failure — so five
  // successful uploads were thrown away because the sixth timed out, and the
  // doctor was told only "Upload failed". On a flaky connection that is a
  // patient's records quietly not arriving. Now every file that uploaded is
  // kept and the ones that did not are named.
  //
  // Each image also gets a 400px copy for the grid: a tile is 150×110, and
  // pulling the full 1600px original to fill it is what made a records page
  // with dozens of images sit blank on a clinic connection. The small copy is
  // BEST-EFFORT and the full image is the record — if the thumbnail fails the
  // image is still filed and the tile falls back to it, exactly as every image
  // stored before this does. If the full image fails there is nothing to file
  // and the file is named. Same posture as the ward's paper order sheet.
  const uploadAll = async (files: File[]): Promise<{ urls: string[]; thumbs: ThumbMap }> => {
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const url = await uploadImage(f);
        let thumbUrl: string | undefined;
        try {
          thumbUrl = await uploadImage(f, THUMB_UPLOAD);
        } catch { /* best-effort — the tile falls back to the full image */ }
        return { url, thumbUrl };
      }),
    );
    const urls: string[] = [];
    const thumbs: ThumbMap = {};
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        urls.push(r.value.url);
        if (r.value.thumbUrl) thumbs[r.value.url] = r.value.thumbUrl;
      } else {
        failed.push(`${files[i].name} (${r.reason instanceof ApiError ? r.reason.message : "upload failed"})`);
      }
    });
    if (failed.length) {
      tell({
        title: urls.length ? `${urls.length} added, ${failed.length} failed` : "Nothing was added.",
        body: failed.join("\n"),
      });
    }
    return { urls, thumbs };
  };

  // ── Prescription gallery ──
  // ⚕️ Newest FIRST (physician's decision, 2026-08-30): a freshly added sheet
  // goes to the FRONT, matching the "Save & print" snapshot in MuqsitContext.
  // A batch keeps the order the doctor picked the files in and lands as one
  // block at the top. Nothing re-sorts the images already stored — the URLs
  // carry no date, so the array IS the order, and a gallery dragged into a
  // deliberate order must stay in it.
  //
  // ⚕️ The batch is appended by the context against the gallery as it is when
  // the upload FINISHES, and only if this patient is still the one loaded — see
  // `appendGalleryImages`. Building the list here, before the await, is what
  // resurrected removed images and put one patient's images in another's record.
  // The URL is the item id, never the array index: a selection made by index
  // points at a different image once an upload prepends to the list.
  const rxItems = rxImages.map((url) => ({ id: url, url, thumbUrl: thumbFor(imageThumbs, url) }));
  const notFiledForSwitch = (n: number) =>
    tell({
      title: `${n} image${n === 1 ? " was" : "s were"} NOT added`,
      body: `A different patient was opened while uploading. Open the patient again and re-add ${n === 1 ? "it" : "them"}.`,
    });
  const addRx = async (files: File[]) => {
    const forPid = currentPatientId;
    setBusyRx(true);
    const { urls, thumbs } = await uploadAll(files);
    if (urls.length && !appendGalleryImages("rx", forPid, urls, thumbs)) notFiledForSwitch(urls.length);
    setBusyRx(false);
  };
  const removeRx = (ids: string[]) => {
    const idset = new Set(ids);
    void saveRxImages(rxImages.filter((url) => !idset.has(url)));
  };
  const reorderRx = (orderedIds: string[]) => {
    const byId = new Map(rxItems.map((it) => [it.id, it.url]));
    saveRxImages(orderedIds.map((id) => byId.get(id)).filter((u): u is string => !!u));
  };

  // ── Report gallery ──
  const reportItems = reportImages.map((url) => ({ id: url, url, thumbUrl: thumbFor(imageThumbs, url) }));
  const addReports = async (files: File[]) => {
    const forPid = currentPatientId;
    setBusyReport(true);
    const { urls, thumbs } = await uploadAll(files);
    if (urls.length && !appendGalleryImages("report", forPid, urls, thumbs)) notFiledForSwitch(urls.length);
    setBusyReport(false);
  };
  const removeReports = (ids: string[]) => {
    const idset = new Set(ids);
    void saveReportImages(reportImages.filter((url) => !idset.has(url)));
  };
  const reorderReports = (orderedIds: string[]) => {
    const byId = new Map(reportItems.map((it) => [it.id, it.url]));
    saveReportImages(orderedIds.map((id) => byId.get(id)).filter((u): u is string => !!u));
  };

  // ── Full investigation history: the patient's saved findings + the live
  // editor's findings, de-duplicated and grouped by date (newest first). ──
  const allFindings = useMemo(
    () => mergeFindings(investigationSummary ?? [], parseInvestigationEntries(investigation)),
    [investigationSummary, investigation],
  );
  const summary = useMemo(() => groupByDate(allFindings), [allFindings]);
  // Only a row that is IN the saved history can be deleted from it. The rows
  // merged in from the live editor belong to today's prescription (changed
  // there, not here), so they get no × — one that removed nothing while the bar
  // said "Removed …" told the doctor a finding was gone when it was not.
  const savedFindings = useMemo(
    () => new Set((investigationSummary ?? []).map(savedKey)),
    [investigationSummary],
  );

  // Delete a finding from the patient's saved history (edit mode only), keeping
  // a one-step undo. The offer stays until the user acts on it (undo / dismiss /
  // leave Edit mode / open another patient) — it never disappears on its own.
  // Neither the delete nor the Undo is fire-and-forget: the bar follows the
  // write, and a delete the server refused is put back on screen with the reason.
  const removeFinding = (f: InvFinding) => {
    const prev = investigationSummary ?? [];
    const next = prev.filter(
      (x) => !(x.date === f.date && x.test === f.test && x.value === f.value),
    );
    if (next.length === prev.length) return; // nothing of the saved history matched
    const token = ++undoSeq.current;
    setUndo({ token, pid: currentPatientId, prev, next, label: `${f.test}: ${f.value}`, status: "saving" });
    Promise.resolve(saveInvestigationSummary(next)).then(
      () => setUndo((u) => (u && u.token === token ? { ...u, status: "saved" } : u)),
      (e) => {
        // Put the finding back only if nothing has changed the list since.
        setInvestigationSummary((cur) => (cur === next ? prev : cur));
        setUndo((u) => (u && u.token === token ? { ...u, status: "error", error: `Not removed — ${errText(e)}. The finding is still in the history.` } : u));
      },
    );
  };
  const undoRemove = () => {
    if (!undo || undo.status !== "saved") return;
    if (undo.pid !== currentPatientId) { setUndo(null); return; } // another patient is open
    const { token, prev } = undo;
    setUndo({ ...undo, status: "restoring" });
    Promise.resolve(saveInvestigationSummary(prev)).then(
      () => setUndo((u) => (u && u.token === token ? null : u)),
      (e) => setUndo((u) => (u && u.token === token ? { ...u, status: "saved", error: `Undo did not save — ${errText(e)}. Try again.` } : u)),
    );
  };

  // ── On-examination history: dated findings recorded from saved visits. ──
  const oeGroups = useMemo(() => groupOeByDate(onExaminationSummary ?? []), [onExaminationSummary]);
  const removeOe = (f: OeFinding) => {
    const prev = onExaminationSummary ?? [];
    const next = prev.filter((x) => !(x.date === f.date && x.text === f.text));
    const token = ++undoSeq.current;
    setOeUndo({ token, pid: currentPatientId, prev, next, label: f.text, status: "saving" });
    Promise.resolve(saveOnExaminationSummary(next)).then(
      () => setOeUndo((u) => (u && u.token === token ? { ...u, status: "saved" } : u)),
      (e) => {
        setOnExaminationSummary((cur) => (cur === next ? prev : cur));
        setOeUndo((u) => (u && u.token === token ? { ...u, status: "error", error: `Not removed — ${errText(e)}. The finding is still in the history.` } : u));
      },
    );
  };
  const undoOe = () => {
    if (!oeUndo || oeUndo.status !== "saved") return;
    if (oeUndo.pid !== currentPatientId) { setOeUndo(null); return; }
    const { token, prev } = oeUndo;
    setOeUndo({ ...oeUndo, status: "restoring" });
    Promise.resolve(saveOnExaminationSummary(prev)).then(
      () => setOeUndo((u) => (u && u.token === token ? null : u)),
      (e) => setOeUndo((u) => (u && u.token === token ? { ...u, status: "saved", error: `Undo did not save — ${errText(e)}. Try again.` } : u)),
    );
  };

  const openViewer = (urls: string[], index: number) => setViewer({ urls, index });

  return (
    <div style={{ fontFamily: font }}>
      {!currentPatientId && (
        <div style={{ fontSize: 12.5, color: C.warn[800], background: C.warn[50], border: `0.5px solid ${C.warn[100]}`, borderRadius: 8, padding: "9px 13px", marginBottom: 16 }}>
          No saved patient is loaded. Uploaded images are kept with the draft and saved to the patient when you save the prescription. Load a saved patient to see and edit their stored images.
        </div>
      )}

      <ImageGallery
        title="All prescriptions(Image)"
        addLabel="Add more prescription image"
        items={rxItems}
        busy={busyRx}
        onAddFiles={addRx}
        onRemoveMany={removeRx}
        onReorder={reorderRx}
        onOpen={openViewer}
        orientation="landscape"
        pdf={{ footerTitle: "All prescriptions", fileName: () => pdfFileName(ptName, "All prescriptions") }}
        emptyText="No prescription images yet. Upload photos of the patient's prescriptions."
      />

      <ImageGallery
        title="All reports(image)"
        addLabel="Add more reports"
        items={reportItems}
        busy={busyReport}
        onAddFiles={addReports}
        onRemoveMany={removeReports}
        onReorder={reorderReports}
        onOpen={openViewer}
        orientation="portrait"
        pdf={{ footerTitle: "All reports", fileName: () => pdfFileName(ptName, "All reports") }}
        emptyText="No report images yet. Upload photos of the patient's lab/investigation reports."
      />

      {/* On examination — dated history of vitals/findings written per visit */}
      <div style={{ marginTop: 8, marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.n[900] }}>On examination</div>
          {oeGroups.length > 0 && (
            oeEditing
              ? <button onClick={() => { setOeEditing(false); setOeUndo(null); }} style={ghostBtn}>Done</button>
              : <button onClick={() => setOeEditing(true)} style={ghostBtn}>✎ Edit</button>
          )}
        </div>
        {oeGroups.length === 0 ? (
          <div style={{ fontSize: 13, color: C.n[500] }}>No on-examination findings yet. They are recorded here with the visit date each time you fill <b>On examination</b> in a prescription and save.</div>
        ) : (
          <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: "14px 18px", maxHeight: 340, overflowY: "auto" }}>
            {oeGroups.map((g, gi) => (
              <div key={gi} style={{ marginBottom: gi < oeGroups.length - 1 ? 12 : 0 }}>
                <DateHeading date={g.date} />
                <div style={{ paddingLeft: 16 }}>
                  {g.items.map((f, idx) => (
                    <div key={idx} className={`inv-row${oeEditing ? " editing" : ""}`} style={{ fontSize: 13, color: C.n[800], lineHeight: 1.6 }}>
                      <span style={{ flex: 1 }}>{f.text}</span>
                      {oeEditing && (
                        <button className="inv-del" onClick={() => removeOe(f)} title="Delete from history" aria-label="Delete finding">×</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {oeUndo && <UndoBar entry={oeUndo} onUndo={undoOe} onDismiss={() => setOeUndo(null)} />}
      </div>

      {/* Investigation reports summary */}
      <div style={{ marginTop: 8 }}>
        <style>{`
          .inv-row{display:flex;align-items:center;gap:10px;border-radius:7px;padding:3px 7px;margin:0 -7px;transition:background .12s ease}
          .inv-row.editing:hover{background:${C.danger[50]}}
          .inv-del{width:25px;height:25px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
            border:1px solid ${C.danger[100]};background:${C.danger[50]};color:${C.danger[400]};font-size:15px;line-height:1;
            cursor:pointer;transition:all .12s ease;flex-shrink:0;padding:0;font-family:inherit}
          .inv-del:hover{background:${C.danger[400]};border-color:${C.danger[400]};color:#fff;transform:translateY(-1px);box-shadow:0 2px 7px ${C.danger[100]}}
          .inv-del:active{transform:translateY(0)}
          .inv-del:focus-visible{outline:2px solid ${C.danger[400]};outline-offset:2px}
          .inv-undo{animation:invUndoIn .18s ease}
          @keyframes invUndoIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
          .inv-undo-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid ${C.pri[400]};background:${C.n[0]};
            color:${C.pri[600]};font-weight:600;font-size:12.5px;padding:6px 15px;border-radius:999px;cursor:pointer;
            transition:all .12s ease;font-family:inherit}
          .inv-undo-btn:hover{background:${C.pri[50]}}
          .inv-undo-btn:focus-visible{outline:2px solid ${C.pri[400]};outline-offset:2px}
        `}</style>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, rowGap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.n[900], minWidth: 0 }}>Investigation reports summary</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {summary.length > 0 && (
              editingSummary
                ? <button onClick={() => { setEditingSummary(false); setUndo(null); }} style={ghostBtn}>Done</button>
                : <button onClick={() => setEditingSummary(true)} style={ghostBtn}>✎ Edit</button>
            )}
            <button onClick={openInvForSummary} disabled={!currentPatientId} title={currentPatientId ? undefined : "Load a saved patient first"} style={{ ...btnPrimary("sm"), ...(currentPatientId ? null : btnDisabled) }}>+ Add</button>
            <button onClick={() => setShowDownload(true)} disabled={allFindings.length === 0} style={{ ...btnSecondary("sm"), color: C.pri[600], ...(allFindings.length ? null : btnDisabled) }}><Icon name="download" size={14} /> Download</button>
          </div>
        </div>
        {summary.length === 0 ? (
          <div style={{ fontSize: 13, color: C.n[500] }}>No investigation findings entered yet. Use <b>+ Add</b> to record results.</div>
        ) : (
          <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: "14px 18px", maxHeight: 340, overflowY: "auto" }}>
            {summary.map((g, gi) => (
              <div key={gi} style={{ marginBottom: gi < summary.length - 1 ? 12 : 0 }}>
                {g.date && <DateHeading date={g.date} />}
                <div style={{ paddingLeft: 16 }}>
                  {g.items.map((f, idx) => (
                    <div key={idx} className={`inv-row${editingSummary ? " editing" : ""}`} style={{ fontSize: 13, color: C.n[800], lineHeight: 1.6 }}>
                      <span style={{ flex: 1 }}>{f.test}: <b style={{ fontWeight: 600 }}>{f.value}</b></span>
                      {editingSummary && savedFindings.has(savedKey(f)) && (
                        <button className="inv-del" onClick={() => removeFinding(f)} title="Delete from history" aria-label="Delete finding">×</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {undo && <UndoBar entry={undo} onUndo={undoRemove} onDismiss={() => setUndo(null)} />}
      </div>

      {showDownload && (
        <InvestigationDownload findings={allFindings} onClose={() => setShowDownload(false)} />
      )}

      {viewer && (
        <ImageLightbox
          urls={viewer.urls}
          index={viewer.index}
          onIndex={(index) => setViewer((v) => (v ? { ...v, index } : v))}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

// The Undo bar under a history. It reports the write it stands for: "Removing…"
// until the server confirms, then Undo; a refused write turns it red and says
// so, and Undo is offered only once there is something saved to undo.
function UndoBar<T>({ entry, onUndo, onDismiss }: { entry: UndoEntry<T>; onUndo: () => void; onDismiss: () => void }) {
  const failed = entry.status === "error";
  const verb = entry.status === "saving" ? "Removing" : entry.status === "restoring" ? "Restoring" : failed ? "Could not remove" : "Removed";
  return (
    <div className="inv-undo" role={failed || entry.error ? "alert" : undefined} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, fontSize: 12.5, color: C.n[700], background: C.n[0], border: `1px solid ${failed || entry.error ? C.danger[100] : C.n[200]}`, borderRadius: 10, padding: "10px 14px", boxShadow: "0 2px 8px rgba(15,23,32,0.06)" }}>
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.danger[400], flexShrink: 0 }} />
          <span>{verb} <b style={{ fontWeight: 600, color: C.n[900] }}>{entry.label}</b>{entry.status === "saving" || entry.status === "restoring" ? "…" : ""}</span>
        </span>
        {entry.error && <span style={{ color: C.danger[800], paddingLeft: 16 }}>{entry.error}</span>}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {!failed && (
          <button className="inv-undo-btn" onClick={onUndo} disabled={entry.status !== "saved"} style={entry.status !== "saved" ? { opacity: 0.5, cursor: "wait" } : undefined}>↺ Undo</button>
        )}
        <button onClick={onDismiss} title="Dismiss" aria-label="Dismiss" style={{ background: "none", border: "none", color: C.n[400], cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "2px 5px", borderRadius: 6 }}>×</button>
      </span>
    </div>
  );
}

const ghostBtn: React.CSSProperties = btnSecondary("sm");
