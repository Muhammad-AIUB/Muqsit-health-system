"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { C, font } from "@/theme";
import { uploadImage, type IpdAnalogueSheet } from "@/lib/api";
import ImageGallery from "@/components/common/ImageGallery";
import ImageLightbox from "@/components/common/ImageLightbox";
import {
  checkSheetFiles,
  describeOutcome,
  uploadSheetFiles,
  visibleSheets,
} from "@/lib/ipdAnalogue";
import {
  useAddAnalogueSheets,
  useLabelAnalogueSheet,
  useRemoveAnalogueSheet,
  useRestoreAnalogueSheet,
} from "@/hooks/useIpd";

// ── The ward's PAPER order sheet, photographed ─────────────────────────────
//
// Three things here are safety, not style:
//
// 1. **Every change is written the moment it happens**, through the per-page
//    `/ipd/:id/analogue` routes — never the admission's Save button. A doctor
//    who photographs six pages and is called away mid-round must not lose them,
//    and a whole-`clinical` write would also carry along whatever half-typed
//    fields were in the editor at that moment.
// 2. **Reordering is off.** For this panel the list order IS the chronology of
//    the ward round, and a draggable chronology on a medico-legal document is a
//    way to falsify it. `addedAt` is the server's, for the same reason.
// 3. **Removal is soft and Undo is a WRITE.** The bar clears only when the
//    server confirms the restore; if that fails the page goes back in the list
//    and the bar says why. A bar that disappears on a write that did not land
//    tells the doctor a page came back when it did not.

const fmtAdded = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${d.toLocaleString("default", { month: "short" })} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

export default function AnalogueSheetPanel({
  admissionId,
  sheets,
  canEdit = true,
}: {
  admissionId: string;
  sheets?: IpdAnalogueSheet[] | null;
  canEdit?: boolean;
}) {
  const add = useAddAnalogueSheets();
  const label = useLabelAnalogueSheet();
  const remove = useRemoveAnalogueSheet();
  const restore = useRestoreAnalogueSheet();

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [undo, setUndo] = useState<{ ids: string[]; note: string; error?: string } | null>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);

  const pages = useMemo(() => visibleSheets(sheets), [sheets]);

  const items = pages.map((s) => ({
    id: s.id,
    url: s.url,
    thumbUrl: s.thumbUrl,
    label: s.label,
    caption: fmtAdded(s.addedAt),
  }));

  // On a round the CURRENT order is what is wanted, and it is the last page.
  // Clicking a page still opens that page — the scroll only decides what is
  // under the doctor's eye when the panel appears.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tiles = boxRef.current?.querySelectorAll('[data-testid^="gallery-tile-"]');
    tiles?.[tiles.length - 1]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Only when the panel first shows pages — not on every label edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length > 0]);

  const onAddFiles = async (files: File[]) => {
    setMsg("");
    const { accepted, rejected } = checkSheetFiles(files);
    if (accepted.length === 0) {
      setMsg(describeOutcome(0, rejected));
      return;
    }
    setBusy(true);
    try {
      const { uploaded, failed } = await uploadSheetFiles(accepted, uploadImage);
      if (uploaded.length) {
        await add.mutateAsync({ id: admissionId, sheets: uploaded });
      }
      setMsg(describeOutcome(uploaded.length, [...rejected, ...failed]));
    } catch (e) {
      // The files reached the store but the record write did not. Say exactly
      // that: "nothing was added" would be a lie about where the data is, and
      // the doctor's next move is to try again, not to re-photograph.
      setMsg(
        `The pages uploaded but could not be filed on this admission (${
          e instanceof Error ? e.message : "unknown error"
        }). Try again.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const onRemoveMany = async (ids: string[]) => {
    const n = ids.length;
    const what = n === 1 ? "this page" : `these ${n} pages`;
    if (!window.confirm(`Remove ${what} from the order sheet?\n\nYou can undo this.`)) return;
    setMsg("");
    try {
      for (const sheetId of ids) await remove.mutateAsync({ id: admissionId, sheetId });
      setUndo({ ids, note: n === 1 ? "Removed 1 page" : `Removed ${n} pages` });
    } catch (e) {
      setMsg(`Could not remove: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  const doUndo = async () => {
    if (!undo) return;
    try {
      for (const sheetId of undo.ids) await restore.mutateAsync({ id: admissionId, sheetId });
      setUndo(null);
    } catch (e) {
      // Keep the bar. The page is still removed, and the doctor needs to know
      // the undo did not happen.
      setUndo({ ...undo, error: `Undo failed: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  };

  const onLabel = async (sheetId: string, next: string) => {
    setMsg("");
    try {
      await label.mutateAsync({ id: admissionId, sheetId, label: next });
    } catch (e) {
      setMsg(`Label not saved: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  return (
    <div ref={boxRef}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.pri[600], borderBottom: `1px solid ${C.pri[100]}`, paddingBottom: 6, marginBottom: 10 }}>
        Analogue order sheet
      </div>

      <ImageGallery
        title=""
        addLabel="Add page"
        items={items}
        busy={busy || add.isPending}
        onAddFiles={(f) => void onAddFiles(f)}
        onRemoveMany={(ids) => void onRemoveMany(ids)}
        onOpen={(urls, index) => setViewer({ urls, index })}
        onLabel={(id, v) => void onLabel(id, v)}
        orientation="portrait"
        // ⚕️ Big tiles, whole page. This is a photographed paper order sheet:
        // the doctor has to make out handwriting on it, and a cropped thumbnail
        // can hide the very line that carries the dose. The full-resolution
        // page is still one click away in the viewer.
        size="lg"
        fit="contain"
        reorderable={false}
        canEdit={canEdit}
        labelPlaceholder="Day 3 night…"
        emptyText={
          canEdit
            ? "No pages yet. Photograph the paper order sheet and drop the images here, or use “Add page”."
            : "No pages of the paper order sheet have been added."
        }
      />

      {msg && (
        <div style={{ fontSize: 12, color: msg.includes("added.") ? C.pri[600] : C.warn[800], marginTop: -12, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {undo && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: -8, marginBottom: 12, fontSize: 12.5, color: C.n[700], background: C.n[0], border: `1px solid ${undo.error ? C.danger[400] : C.n[200]}`, borderRadius: 10, padding: "10px 14px" }}>
          <span>
            <b style={{ fontWeight: 600, color: C.n[900] }}>{undo.note}</b>
            {undo.error && <span style={{ color: C.danger[800] }}> — {undo.error}</span>}
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => void doUndo()}
              disabled={restore.isPending}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.pri[400]}`, background: C.n[0], color: C.pri[600], borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}
            >
              ↺ {undo.error ? "Try again" : "Undo"}
            </button>
            <button onClick={() => setUndo(null)} title="Dismiss" aria-label="Dismiss" style={{ background: "none", border: "none", color: C.n[400], cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "2px 5px", borderRadius: 6 }}>×</button>
          </span>
        </div>
      )}

      {/* A removed page is recoverable long after this bar is gone — it is
          soft-deleted, and the admission's event feed says who removed it. */}
      {canEdit && pages.length > 0 && (
        <div style={{ fontSize: 11, color: C.n[500] }}>
          Pages stay in the order they were added, and are saved as soon as they upload.
        </div>
      )}

      {viewer && (
        <ImageLightbox
          urls={viewer.urls}
          index={viewer.index}
          onIndex={(index) => setViewer((v) => (v ? { ...v, index } : v))}
          onClose={() => setViewer(null)}
          alt="Order sheet page"
        />
      )}
    </div>
  );
}
