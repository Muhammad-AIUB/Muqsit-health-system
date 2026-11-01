"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError, drugSafetyApi } from "@/lib/api";
import { readDrugSafetyList } from "@/lib/drugSafety";
import { useMuqsit } from "@/context/MuqsitContext";

// One quiet retry, not for a 403 (the server has looked at who is asking).
const askAgain = (failures: number, error: unknown): boolean =>
  failures < 1 && !(error instanceof ApiError && error.status === 403);

export const drugSafetyKey = (patientId: string | null, workstationId: string | null) =>
  ["drug-safety", patientId ?? "none", workstationId ?? "own"] as const;

/**
 * ⚕️ The patient's "H/O drug hypersensitivity and High-Alert Medication" list.
 * Read by the editor's section AND by the printed sheet — one query, so what is
 * on the screen is what prints.
 *
 * A failure is said, never shown as an empty list: `networkMode: "always"` so an
 * offline browser fails rather than not asking, and an answer that is not the
 * list is thrown. Keyed by the practice too: whether an entry is `editable`
 * depends on whose practice is asking.
 */
export function usePatientDrugSafety() {
  const { currentPatientId, activeWorkstationId } = useMuqsit();
  return useQuery({
    queryKey: drugSafetyKey(currentPatientId, activeWorkstationId),
    queryFn: async ({ signal }) => {
      const list = readDrugSafetyList(await drugSafetyApi.list(currentPatientId as string, signal));
      if (!list) throw new Error("the drug hypersensitivity list could not be read");
      return list;
    },
    enabled: Boolean(currentPatientId),
    networkMode: "always",
    retry: askAgain,
    refetchOnWindowFocus: false,
  });
}
