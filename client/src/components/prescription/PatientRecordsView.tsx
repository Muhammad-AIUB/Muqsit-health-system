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

import { useMemo, useState } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { uploadImage, ApiError } from "@/lib/api";
import { parseInvestigationEntries, mergeFindings, groupByDate, type InvFinding } from "@/lib/investigationSummary";
import { groupOeByDate, type OeFinding } from "@/lib/onExaminationSummary";
import { cellToDate } from "@/lib/hmDates";
import { isImplausibleDate, YEAR_POLICY } from "@/lib/dateInput";
import InvestigationDownload from "./InvestigationDownload";
import ImageGallery from "@/components/common/ImageGallery";
import ImageLightbox from "@/components/common/ImageLightbox";

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

export default function PatientRecordsView() {
  const {
    currentPatientId,
    rxImages, saveRxImages, reportImages, saveReportImages,
    investigation, investigationSummary, saveInvestigationSummary, openInvForSummary,
    onExaminationSummary, saveOnExaminationSummary,
  } = useMuqsit();
  const [showDownload, setShowDownload] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [undo, setUndo] = useState<{ prev: InvFinding[]; label: string } | null>(null);
  const [oeEditing, setOeEditing] = useState(false);
  const [oeUndo, setOeUndo] = useState<{ prev: OeFinding[]; label: string } | null>(null);

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
  const uploadAll = async (files: File[]): Promise<string[]> => {
    const results = await Promise.allSettled(files.map((f) => uploadImage(f)));
    const urls: string[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") urls.push(r.value);
      else failed.push(`${files[i].name} (${r.reason instanceof ApiError ? r.reason.message : "upload failed"})`);
    });
    if (failed.length) {
      window.alert(
        urls.length
          ? `${urls.length} added, ${failed.length} failed: ${failed.join(", ")}`
          : `Nothing was added. ${failed.join(", ")}`,
      );
    }
    return urls;
  };

  // ── Prescription gallery ──
  // ⚕️ Newest FIRST (physician's decision, 2026-08-30): a freshly added sheet
  // goes to the FRONT, matching the "Save & print" snapshot in MuqsitContext.
  // A batch keeps the order the doctor picked the files in and lands as one
  // block at the top. Nothing re-sorts the images already stored — the URLs
  // carry no date, so the array IS the order, and a gallery dragged into a
  // deliberate order must stay in it.
  const rxItems = rxImages.map((url, i) => ({ id: String(i), url }));
  const addRx = async (files: File[]) => {
    setBusyRx(true);
    const urls = await uploadAll(files);
    if (urls.length) saveRxImages([...urls, ...rxImages]);
    setBusyRx(false);
  };
  const removeRx = (ids: string[]) => {
    const idset = new Set(ids);
    saveRxImages(rxImages.filter((_, i) => !idset.has(String(i))));
  };
  const reorderRx = (orderedIds: string[]) => {
    const byId = new Map(rxItems.map((it) => [it.id, it.url]));
    saveRxImages(orderedIds.map((id) => byId.get(id)).filter((u): u is string => !!u));
  };

  // ── Report gallery ──
  const reportItems = reportImages.map((url, i) => ({ id: String(i), url }));
  const addReports = async (files: File[]) => {
    setBusyReport(true);
    const urls = await uploadAll(files);
    if (urls.length) saveReportImages([...reportImages, ...urls]);
    setBusyReport(false);
  };
  const removeReports = (ids: string[]) => {
    const idset = new Set(ids);
    saveReportImages(reportImages.filter((_, i) => !idset.has(String(i))));
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

  // Delete a finding from the patient's saved history (edit mode only), keeping
  // a one-step undo. The offer stays until the user acts on it (undo / dismiss /
  // leave Edit mode) — it never disappears on its own.
  const removeFinding = (f: InvFinding) => {
    const prev = investigationSummary ?? [];
    saveInvestigationSummary(prev.filter(
      (x) => !(x.date === f.date && x.test === f.test && x.value === f.value),
    ));
    setUndo({ prev, label: `${f.test}: ${f.value}` });
  };
  const undoRemove = () => {
    if (!undo) return;
    saveInvestigationSummary(undo.prev);
    setUndo(null);
  };

  // ── On-examination history: dated findings recorded from saved visits. ──
  const oeGroups = useMemo(() => groupOeByDate(onExaminationSummary ?? []), [onExaminationSummary]);
  const removeOe = (f: OeFinding) => {
    const prev = onExaminationSummary ?? [];
    saveOnExaminationSummary(prev.filter((x) => !(x.date === f.date && x.text === f.text)));
    setOeUndo({ prev, label: f.text });
  };
  const undoOe = () => {
    if (!oeUndo) return;
    saveOnExaminationSummary(oeUndo.prev);
    setOeUndo(null);
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
        emptyText="No report images yet. Upload photos of the patient's lab/investigation reports."
      />

      {/* On examination — dated history of vitals/findings written per visit */}
      <div style={{ marginTop: 8, marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.n[900] }}>On examination</div>
          {oeGroups.length > 0 && (
            oeEditing
              ? <button onClick={() => { setOeEditing(false); setOeUndo(null); }} style={{ ...ghostBtn, padding: "6px 14px", borderRadius: 7 }}>Done</button>
              : <button onClick={() => setOeEditing(true)} style={{ ...ghostBtn, padding: "6px 14px", borderRadius: 7 }}>✎ Edit</button>
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
        {oeUndo && (
          <div className="inv-undo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, fontSize: 12.5, color: C.n[700], background: C.n[0], border: `1px solid ${C.n[200]}`, borderRadius: 10, padding: "10px 14px", boxShadow: "0 2px 8px rgba(15,23,32,0.06)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.danger[400], flexShrink: 0 }} />
              <span>Removed <b style={{ fontWeight: 600, color: C.n[900] }}>{oeUndo.label}</b></span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button className="inv-undo-btn" onClick={undoOe}>↺ Undo</button>
              <button onClick={() => setOeUndo(null)} title="Dismiss" aria-label="Dismiss" style={{ background: "none", border: "none", color: C.n[400], cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "2px 5px", borderRadius: 6 }}>×</button>
            </span>
          </div>
        )}
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
                ? <button onClick={() => { setEditingSummary(false); setUndo(null); }} style={{ ...ghostBtn, padding: "6px 14px", borderRadius: 7 }}>Done</button>
                : <button onClick={() => setEditingSummary(true)} style={{ ...ghostBtn, padding: "6px 14px", borderRadius: 7 }}>✎ Edit</button>
            )}
            <button onClick={openInvForSummary} disabled={!currentPatientId} title={currentPatientId ? undefined : "Load a saved patient first"} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: currentPatientId ? C.pri[400] : C.n[200], color: currentPatientId ? "#fff" : C.n[500], fontSize: 12, fontWeight: 500, cursor: currentPatientId ? "pointer" : "not-allowed", fontFamily: font }}>+ Add</button>
            <button onClick={() => setShowDownload(true)} disabled={allFindings.length === 0} style={{ padding: "6px 14px", borderRadius: 7, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: allFindings.length ? C.pri[600] : C.n[400], fontSize: 12, fontWeight: 500, cursor: allFindings.length ? "pointer" : "not-allowed", fontFamily: font }}>⬇ Download</button>
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
                      {editingSummary && (
                        <button className="inv-del" onClick={() => removeFinding(f)} title="Delete from history" aria-label="Delete finding">×</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {undo && (
          <div className="inv-undo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, fontSize: 12.5, color: C.n[700], background: C.n[0], border: `1px solid ${C.n[200]}`, borderRadius: 10, padding: "10px 14px", boxShadow: "0 2px 8px rgba(15,23,32,0.06)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.danger[400], flexShrink: 0 }} />
              <span>Removed <b style={{ fontWeight: 600, color: C.n[900] }}>{undo.label}</b></span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button className="inv-undo-btn" onClick={undoRemove}>↺ Undo</button>
              <button onClick={() => setUndo(null)} title="Dismiss" aria-label="Dismiss" style={{ background: "none", border: "none", color: C.n[400], cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "2px 5px", borderRadius: 6 }}>×</button>
            </span>
          </div>
        )}
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

const ghostBtn: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`,
  background: C.n[0], color: C.n[600], fontSize: 12, fontWeight: 500,
  cursor: "pointer", fontFamily: font, whiteSpace: "nowrap",
};
