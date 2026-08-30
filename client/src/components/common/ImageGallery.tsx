"use client";

import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import { C, font } from "@/theme";

// ── A titled image gallery: upload, edit/remove, drag-reorder, open ─────────
//
// Extracted from `PatientRecordsView` (2026-08-26) so the ward's paper
// order-sheet panel is the same component as the patient's prescription and
// report galleries rather than a fourth copy of it. Behaviour for the two
// original callers is unchanged; what is new is optional and off by default:
// OS-file drag & drop, a per-item label, a separate thumbnail, and the ability
// to turn reordering OFF.
//
// `reorderable` is not decoration. For the paper order sheet the list order IS
// the chronology of the ward round, and a draggable chronology on a
// medico-legal document is a way to falsify it.

export interface GalleryItem {
  id: string;
  url: string;
  /** Small copy for the grid. Falls back to `url` — every image stored before
   *  thumbnails existed has none, and nothing was migrated. */
  thumbUrl?: string;
  /** Doctor-typed, shown under the tile when `onLabel` is given. */
  label?: string;
  /** Read-only line under the tile (e.g. when the page was added). */
  caption?: string;
}

export default function ImageGallery({
  title,
  addLabel,
  items,
  busy,
  onAddFiles,
  onRemoveMany,
  onReorder,
  onOpen,
  onLabel,
  orientation,
  emptyText,
  reorderable = true,
  canEdit = true,
  labelPlaceholder = "Label…",
  size = "md",
  fit = "cover",
}: {
  title: string;
  addLabel: string;
  items: GalleryItem[];
  busy: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveMany: (ids: string[]) => void;
  onReorder?: (orderedIds: string[]) => void;
  onOpen: (urls: string[], index: number) => void;
  /** Provide to make each tile labellable. Saved on blur, never per keystroke. */
  onLabel?: (id: string, label: string) => void;
  orientation: "landscape" | "portrait";
  emptyText: string;
  reorderable?: boolean;
  /** False hides every mutating affordance — viewing is never gated. */
  canEdit?: boolean;
  labelPlaceholder?: string;
  /** "lg" draws a tile a doctor can READ from, not just recognise. Opt-in:
   *  the ward's paper order sheet is a handwritten document the doctor has to
   *  make out at a glance, while the patient's prescription and report
   *  galleries are index grids of sheets they open one at a time. */
  size?: "md" | "lg";
  /** ⚕️ "contain" shows the WHOLE page, letterboxed. "cover" fills the tile by
   *  cropping — fine for a picture, wrong for a document, where the cropped
   *  strip can be the line that carries the dose. */
  fit?: "cover" | "contain";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [fileOver, setFileOver] = useState(false);
  // The "lg" portrait tile is 270×370 on purpose — as large as it can be and
  // still be drawn from real pixels: the small copy uploaded with each page is
  // 400px on its long side (THUMB_MAX_DIM), so a taller tile than this would
  // upscale the thumbnail and hand the doctor a blurrier page, not a bigger one.
  const box = TILE[size][orientation];

  const canReorder = reorderable && Boolean(onReorder) && canEdit;
  const urls = items.map((it) => it.url);

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const c = new Set(prev);
      if (c.has(id)) c.delete(id);
      else c.add(id);
      return c;
    });

  const exitEdit = () => { setEditing(false); setSelected(new Set()); };

  const removeSelected = () => {
    if (selected.size === 0) return;
    onRemoveMany([...selected]);
    setSelected(new Set());
  };

  const reorderOnto = (targetId: string) => {
    if (!onReorder || !dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const ids = items.map((it) => it.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    onReorder(ids);
    setDragId(null);
    setOverId(null);
  };

  // One drop handler for both kinds of drag. A photo dragged in from the desktop
  // and a tile dragged within the grid look the same to the browser until you
  // ask whether the payload carries files — so ask, rather than putting the two
  // on separate elements and hoping the right one wins.
  const isFileDrag = (e: DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const onDropAnywhere = (e: DragEvent, targetId?: string) => {
    e.preventDefault();
    // A drop on a TILE also bubbles to the container, which carries the same
    // handler — without this, one dropped photo was uploaded twice and the
    // patient's record grew a duplicate page for every drag.
    e.stopPropagation();
    setFileOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) {
      if (canEdit && !busy) onAddFiles(files);
      setDragId(null);
      setOverId(null);
      return;
    }
    if (targetId) reorderOnto(targetId);
  };

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, rowGap: 8, marginBottom: 10 }}>
        {/* Empty when the caller supplies its own heading (the IPD panes have
            their own house style for it) — do not render a blank one. */}
        {title ? <div style={{ fontSize: 15, fontWeight: 600, color: C.n[900], minWidth: 0 }}>{title}</div> : <span />}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {busy && <span style={{ fontSize: 11, color: C.n[500] }}>Uploading…</span>}
          {canEdit && (editing ? (
            <>
              <button onClick={removeSelected} disabled={selected.size === 0} style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.danger[400]}`, background: selected.size ? C.danger[400] : C.n[100], color: selected.size ? "#fff" : C.n[500], fontSize: 12, fontWeight: 500, cursor: selected.size ? "pointer" : "default", fontFamily: font, whiteSpace: "nowrap" }}>
                🗑 Remove selected{selected.size ? ` (${selected.size})` : ""}
              </button>
              <button onClick={exitEdit} style={ghostBtn}>Done</button>
            </>
          ) : (
            items.length > 0 && <button onClick={() => setEditing(true)} style={ghostBtn}>✎ Edit</button>
          ))}
          {canEdit && (
            <>
              <button onClick={() => inputRef.current?.click()} disabled={busy} style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.pri[400]}`, background: busy ? C.n[100] : C.pri[400], color: busy ? C.n[500] : "#fff", fontSize: 12, fontWeight: 500, cursor: busy ? "default" : "pointer", fontFamily: font, whiteSpace: "nowrap" }}>
                ＋ {addLabel}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                aria-label={addLabel}
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) onAddFiles(files);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      </div>

      <div
        data-testid="image-gallery-drop"
        onDragOver={(e) => { if (canEdit && isFileDrag(e)) { e.preventDefault(); setFileOver(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setFileOver(false); }}
        onDrop={(e) => onDropAnywhere(e)}
        style={{
          border: `${fileOver ? 2 : 0.5}px ${fileOver ? "dashed" : "solid"} ${fileOver ? C.pri[400] : C.n[200]}`,
          borderRadius: 12,
          background: fileOver ? C.pri[50] : C.n[0],
          padding: 16,
          minHeight: box.h + 32,
        }}
      >
        {items.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.n[500], display: "flex", alignItems: "center", minHeight: box.h }}>
            {fileOver ? "Drop the images here" : emptyText}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {items.map((it, idx) => {
              const isSel = selected.has(it.id);
              return (
                <div key={it.id} style={{ width: box.w }}>
                  <div
                    data-testid={`gallery-tile-${it.id}`}
                    draggable={canReorder}
                    onDragStart={() => canReorder && setDragId(it.id)}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                    onDragOver={(e) => {
                      if (isFileDrag(e)) { if (canEdit) { e.preventDefault(); setFileOver(true); } return; }
                      if (!canReorder) return;
                      e.preventDefault();
                      if (overId !== it.id) setOverId(it.id);
                    }}
                    onDrop={(e) => onDropAnywhere(e, it.id)}
                    onClick={() => { if (editing) toggleSel(it.id); else onOpen(urls, idx); }}
                    title={editing ? "Click to select" : canReorder ? "Click to view · drag to reorder" : "Click to view"}
                    style={{
                      position: "relative", width: box.w, height: box.h, borderRadius: 8, overflow: "hidden",
                      border: `2px solid ${isSel ? C.pri[400] : overId === it.id ? C.info[400] : C.n[200]}`,
                      background: C.n[50], cursor: editing ? "pointer" : canReorder ? "grab" : "pointer",
                      opacity: dragId === it.id ? 0.4 : 1,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.thumbUrl || it.url}
                      // Never an empty alt: on this screen the image IS the
                      // content, and a scanned order-sheet page that a screen
                      // reader skips entirely is not "decorative".
                      alt={it.label || it.caption || `Image ${idx + 1}`}
                      draggable={false}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: fit, pointerEvents: "none" }}
                    />
                    {editing && (
                      <span style={{ position: "absolute", top: 5, right: 5, width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${isSel ? C.pri[400] : "#fff"}`, background: isSel ? C.pri[400] : "rgba(0,0,0,0.35)", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                        {isSel ? "✓" : ""}
                      </span>
                    )}
                  </div>

                  {it.caption && (
                    <div style={{ fontSize: 10, color: C.n[500], marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.caption}
                    </div>
                  )}

                  {onLabel && (
                    canEdit ? (
                      // Saved on BLUR, never per keystroke: every save is a write
                      // to the patient's record and an audit line beside it.
                      <input
                        defaultValue={it.label ?? ""}
                        placeholder={labelPlaceholder}
                        aria-label={`Label for image ${idx + 1}`}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next !== (it.label ?? "")) onLabel(it.id, next);
                        }}
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 3, padding: "3px 6px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, fontSize: 11, fontFamily: font, color: C.n[900], outline: "none", background: C.n[0] }}
                      />
                    ) : (
                      it.label && <div style={{ fontSize: 11, color: C.n[800], marginTop: 3 }}>{it.label}</div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && items.length > 0 && (
        <div style={{ fontSize: 11, color: C.n[500], marginTop: 6 }}>
          Click images to select, then “Remove selected”.{canReorder ? " Drag any image to reorder." : ""}
        </div>
      )}
    </div>
  );
}

const TILE = {
  md: { landscape: { w: 150, h: 110 }, portrait: { w: 96, h: 132 } },
  lg: { landscape: { w: 370, h: 270 }, portrait: { w: 270, h: 370 } },
} as const;

const ghostBtn: CSSProperties = {
  padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`,
  background: C.n[0], color: C.n[600], fontSize: 12, fontWeight: 500,
  cursor: "pointer", fontFamily: font, whiteSpace: "nowrap",
};
