"use client";

import { useQuery } from "@tanstack/react-query";
import { useMuqsit } from "@/context/MuqsitContext";
import { patientsApi } from "@/lib/api";

/**
 * Whether the screen may OFFER to add or remove the patient's Permissions /
 * Imaging DICOM files: the patient's own practice only, and for an assistant
 * only with `pt.info` — the same test the server applies (`patient-files`).
 * The server is still the boundary; this only keeps a button from being offered
 * that would be refused. Unknown while the record loads or cannot be read: no.
 */
export function usePatientFileAccess(): boolean {
  const { currentPatientId, can, activeWorkstationId, authUserId } = useMuqsit();
  const mayWrite = can("pt.info");
  const { data: record } = useQuery({
    queryKey: ["patient", currentPatientId],
    queryFn: () => patientsApi.get(currentPatientId as string),
    enabled: Boolean(currentPatientId) && mayWrite,
  });
  const practiceId = activeWorkstationId ?? authUserId;
  return Boolean(mayWrite && record?.doctorId && practiceId && record.doctorId === practiceId);
}
