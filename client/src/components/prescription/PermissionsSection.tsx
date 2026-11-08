"use client";

// "Permissions" (physician's sheet 07/11/2026): the patient's signed permission
// papers, as pictures — a gallery like "All reports(image)", after Diagnosis
// history. Each file is filed on its own (`patientFilesApi`, the `PatientFile`
// table): the server keeps one row per picture and a removal is soft.
//
// The sheet's "Templates form to download" button waits for the physician's
// templates; nothing is drawn for it until they exist.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMuqsit } from "@/context/MuqsitContext";
import { ApiError, patientFilesApi } from "@/lib/api";
import { compressImage } from "@/lib/compressImage";
import { tell } from "@/lib/dialogs";
import { pdfFileName } from "@/lib/galleryPdf";
import { usePatientFileAccess } from "@/hooks/usePatientFileAccess";
import ImageGallery from "@/components/common/ImageGallery";
import { LoadError } from "@/components/common/ListState";

export default function PermissionsSection({ open, onToggle, onOpenImage }: {
  open: boolean;
  onToggle: () => void;
  onOpenImage: (urls: string[], index: number) => void;
}) {
  const { currentPatientId, ptName } = useMuqsit();
  const canEdit = usePatientFileAccess();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ["patient-files", currentPatientId, "permission"];
  const q = useQuery({
    queryKey: key,
    queryFn: () => patientFilesApi.list(currentPatientId as string, "permission"),
    enabled: Boolean(currentPatientId) && open,
  });
  const rows = q.data ?? [];

  const add = async (files: File[]) => {
    const pid = currentPatientId;
    if (!pid) return;
    setBusy(true);
    const failed: string[] = [];
    // One at a time, in the order picked: a row is one picture, and the list is
    // newest first, so the batch lands as one block in a known order.
    for (const f of files) {
      try {
        await patientFilesApi.upload(pid, "permission", await compressImage(f), { fileName: f.name });
      } catch (e) {
        failed.push(`${f.name} (${e instanceof ApiError ? e.message : "upload failed"})`);
      }
    }
    await qc.invalidateQueries({ queryKey: ["patient-files", pid, "permission"] });
    setBusy(false);
    if (failed.length) tell({ title: `${files.length - failed.length} added, ${failed.length} failed`, body: failed.join("\n") });
  };

  const remove = async (ids: string[]) => {
    const pid = currentPatientId;
    if (!pid) return;
    const failed: string[] = [];
    for (const id of ids) {
      try { await patientFilesApi.remove(pid, id); } catch (e) { failed.push(e instanceof ApiError ? e.message : "could not remove"); }
    }
    await qc.invalidateQueries({ queryKey: ["patient-files", pid, "permission"] });
    if (failed.length) tell({ title: `${failed.length} not removed`, body: failed.join("\n") });
  };

  return (
    <section style={{ marginTop: 22 }} aria-label="Permissions">
      <ImageGallery
        title="Permissions"
        addLabel="Add new permissions"
        items={rows.map((r) => ({ id: r.id, url: r.url }))}
        busy={busy}
        onAddFiles={add}
        onRemoveMany={remove}
        onReorder={() => {}}
        reorderable={false}
        onOpen={onOpenImage}
        canEdit={canEdit && Boolean(currentPatientId)}
        orientation="portrait"
        pdf={{ footerTitle: "Permissions", fileName: () => pdfFileName(ptName, "Permissions") }}
        emptyText={!currentPatientId ? "Load a saved patient to see their permissions." : "No permissions yet. Upload photos or scans of the signed permission papers."}
        collapsed={!open}
        onToggleCollapsed={onToggle}
      />
      {open && currentPatientId && q.isError && (
        <LoadError compact title="Could not load the permissions." onRetry={() => void q.refetch()} retrying={q.isFetching} />
      )}
    </section>
  );
}
