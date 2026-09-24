"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { drugAdviceApi } from "@/lib/api";
import type { AdviceScope } from "@/lib/rxDrugAdvice";

const KEY = ["drug-advice"] as const;

/**
 * The workstation doctor's saved special advice (℞ pad •••). Keyed by the
 * workstation so an assistant switching practice never sees the other
 * doctor's advice from cache.
 *
 * ⚕️ Callers must treat "not loaded yet" and "failed" as UNKNOWN, never as
 * "no advice": the Advice-section mirror would otherwise withdraw lines it
 * added before a reload (see MuqsitContext).
 */
export function useDrugAdvice(wsId: string | null) {
  return useQuery({
    queryKey: [...KEY, wsId ?? ""],
    queryFn: () => drugAdviceApi.list(),
    staleTime: 60_000,
  });
}

/** Not optimistic: the box waits for the server, so unsaved never looks saved. */
export function useSaveDrugAdvice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { scope: AdviceScope; label: string; lines: string[] }) => drugAdviceApi.save(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
