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
import { useMuqsit } from "@/context/MuqsitContext";
import { uploadImage, ApiError } from "@/lib/api";
import { parseInvestigationEntries, mergeFindings, groupByDate, type InvFinding } from "@/lib/investigationSummary";
import InvestigationDownload from "./InvestigationDownload";

export default function PatientRecordsView() {
  const {
    currentPatientId,
    rxImages, saveRxImages, reportImages, saveReportImages,
    investigation, investigationSummary, saveInvestigationSummary, openInvForSummary,
  } = useMuqsit();
  const [showDownload, setShowDownload] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [undo, setUndo] = useState<{ prev: InvFinding[]; label: string } | null>(null);

  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);
  const [busyRx, setBusyRx] = useState(false);
  const [busyReport, setBusyReport] = useState(false);

  // ←/→/Esc navigation in the lightbox.
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setViewer((v) => (v ? { ...v, index: Math.min(v.urls.length - 1, v.index + 1) } : v));
      else if (e.key === "ArrowLeft") setViewer((v) => (v ? { ...v, index: Math.max(0, v.index - 1) } : v));
      else if (e.key === "Escape") setViewer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  // Upload files to the server, returning their URLs (or [] on failure).
  const uploadAll = async (files: FileList): Promise<string[]> => {
    try {
      return await Promise.all(Array.from(files).map((f) => uploadImage(f)));
    } catch (e) {
      window.alert(e instanceof ApiError ? `Upload failed: ${e.message}` : "Upload failed. Is the API running?");
      return [];
    }
  };

  // ── Prescription gallery ──
  const rxItems = rxImages.map((url, i) => ({ id: String(i), url }));
  const addRx = async (files: FileList) => {
    setBusyRx(true);
    const urls = await uploadAll(files);
    if (urls.length) saveRxImages([...rxImages, ...urls]);
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
  const addReports = async (files: FileList) => {
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

  const openViewer = (urls: string[], index: number) => setViewer({ urls, index });

  return (
    <div style={{ fontFamily: font }}>
      {!currentPatientId && (
        <div style={{ fontSize: 12.5, color: C.warn[800], background: C.warn[50], border: `0.5px solid ${C.warn[100]}`, borderRadius: 8, padding: "9px 13px", marginBottom: 16 }}>
          No saved patient is loaded. Uploaded images are kept with the draft and saved to the patient when you save the prescription. Load a saved patient to see and edit their stored images.
        </div>
      )}

      <Gallery
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

      <Gallery
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.n[900] }}>Investigation reports summary</div>
          <div style={{ display: "flex", gap: 8 }}>
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
          <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: "14px 18px" }}>
            {summary.map((g, gi) => (
              <div key={gi} style={{ marginBottom: gi < summary.length - 1 ? 12 : 0 }}>
                {g.date && <div style={{ fontSize: 13, fontWeight: 600, color: C.n[900], marginBottom: 2 }}>{g.date}</div>}
                <div style={{ paddingLeft: 16 }}>
                  {g.items.map((f, idx) => (
                    <div key={idx} className={`inv-row${editingSummary ? " editing" : ""}`} style={{ fontSize: 13, color: C.n[800], lineHeight: 1.6 }}>
                      <span style={{ flex: 1 }}><span style={{ color: C.n[500] }}>{f.category} · </span>{f.test}: <b style={{ fontWeight: 600 }}>{f.value}</b></span>
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

      {/* Lightbox with ←/→ navigation */}
      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 24 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setViewer((v) => (v ? { ...v, index: Math.max(0, v.index - 1) } : v)); }}
            disabled={viewer.index === 0}
            style={navArrow(viewer.index === 0, "left")}
          >‹</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer.urls[viewer.index]} alt="" style={{ maxWidth: "82vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()} />
          <button
            onClick={(e) => { e.stopPropagation(); setViewer((v) => (v ? { ...v, index: Math.min(v.urls.length - 1, v.index + 1) } : v)); }}
            disabled={viewer.index === viewer.urls.length - 1}
            style={navArrow(viewer.index === viewer.urls.length - 1, "right")}
          >›</button>
          <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: 13, background: "rgba(0,0,0,0.5)", padding: "4px 12px", borderRadius: 999 }}>
            {viewer.index + 1} / {viewer.urls.length} · use ← → keys
          </div>
          <button onClick={() => setViewer(null)} style={{ position: "fixed", top: 18, right: 22, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.92)", color: C.n[900], fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
      )}
    </div>
  );
}

const navArrow = (disabled: boolean, side: "left" | "right"): React.CSSProperties => ({
  position: "fixed", [side]: 18, top: "50%", transform: "translateY(-50%)",
  width: 46, height: 46, borderRadius: "50%", border: "none",
  background: disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.92)",
  color: C.n[900], fontSize: 26, lineHeight: 1, cursor: disabled ? "default" : "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2001,
});

// ── A titled image gallery: upload, edit/remove, drag-reorder, open ──
function Gallery({
  title, addLabel, items, busy, onAddFiles, onRemoveMany, onReorder, onOpen, orientation, emptyText,
}: {
  title: string;
  addLabel: string;
  items: { id: string; url: string }[];
  busy: boolean;
  onAddFiles: (files: FileList) => void;
  onRemoveMany: (ids: string[]) => void;
  onReorder: (orderedIds: string[]) => void;
  onOpen: (urls: string[], index: number) => void;
  orientation: "landscape" | "portrait";
  emptyText: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const box = orientation === "landscape" ? { w: 150, h: 110 } : { w: 96, h: 132 };

  const urls = items.map((it) => it.url);

  const toggleSel = (id: string) =>
    setSelected((prev) => { const c = new Set(prev); c.has(id) ? c.delete(id) : c.add(id); return c; });

  const exitEdit = () => { setEditing(false); setSelected(new Set()); };

  const removeSelected = () => {
    if (selected.size === 0) return;
    onRemoveMany([...selected]);
    setSelected(new Set());
  };

  const onDropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const ids = items.map((it) => it.id).filter((id) => id !== dragId);
    const at = ids.indexOf(targetId);
    ids.splice(at, 0, dragId);
    onReorder(ids);
    setDragId(null);
    setOverId(null);
  };

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.n[900] }}>{title}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {busy && <span style={{ fontSize: 11, color: C.n[500] }}>Uploading…</span>}
          {editing ? (
            <>
              <button onClick={removeSelected} disabled={selected.size === 0} style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.danger[400]}`, background: selected.size ? C.danger[400] : C.n[100], color: selected.size ? "#fff" : C.n[500], fontSize: 12, fontWeight: 500, cursor: selected.size ? "pointer" : "default", fontFamily: font, whiteSpace: "nowrap" }}>
                🗑 Remove selected{selected.size ? ` (${selected.size})` : ""}
              </button>
              <button onClick={exitEdit} style={ghostBtn}>Done</button>
            </>
          ) : (
            items.length > 0 && (
              <button onClick={() => setEditing(true)} style={ghostBtn}>✎ Edit</button>
            )
          )}
          <button onClick={() => inputRef.current?.click()} disabled={busy} style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.pri[400]}`, background: busy ? C.n[100] : C.pri[400], color: busy ? C.n[500] : "#fff", fontSize: 12, fontWeight: 500, cursor: busy ? "default" : "pointer", fontFamily: font, whiteSpace: "nowrap" }}>
            ＋ {addLabel}
          </button>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files) onAddFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 12, background: C.n[0], padding: 16, minHeight: box.h + 32 }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.n[500], display: "flex", alignItems: "center", minHeight: box.h }}>{emptyText}</div>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {items.map((it, idx) => {
              const isSel = selected.has(it.id);
              return (
                <div
                  key={it.id}
                  draggable
                  onDragStart={() => setDragId(it.id)}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (overId !== it.id) setOverId(it.id); }}
                  onDrop={(e) => { e.preventDefault(); onDropOn(it.id); }}
                  onClick={() => { if (editing) toggleSel(it.id); else onOpen(urls, idx); }}
                  title={editing ? "Click to select" : "Click to view · drag to reorder"}
                  style={{
                    position: "relative", width: box.w, height: box.h, borderRadius: 8, overflow: "hidden",
                    border: `2px solid ${isSel ? C.pri[400] : overId === it.id ? C.info[400] : C.n[200]}`,
                    background: C.n[50], cursor: editing ? "pointer" : "grab",
                    opacity: dragId === it.id ? 0.4 : 1,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                  {editing && (
                    <span style={{ position: "absolute", top: 5, right: 5, width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${isSel ? C.pri[400] : "#fff"}`, background: isSel ? C.pri[400] : "rgba(0,0,0,0.35)", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                      {isSel ? "✓" : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {editing && items.length > 0 && (
        <div style={{ fontSize: 11, color: C.n[500], marginTop: 6 }}>Click images to select, then “Remove selected”. Drag any image to reorder.</div>
      )}
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`,
  background: C.n[0], color: C.n[600], fontSize: 12, fontWeight: 500,
  cursor: "pointer", fontFamily: font, whiteSpace: "nowrap",
};
