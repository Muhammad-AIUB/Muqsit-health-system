"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chambersApi, type ChamberLayoutAnswer, type OpdChamber, type PrescriptionLayoutInput } from "@/lib/api";

export const CHAMBERS_KEY = ["chambers"];
export const chamberLayoutKey = (id: string | null) => ["chamber-layout", id];

/** The practice's live chambers, the default first. An answer that is not a
 *  list is an error, never "no chambers". */
export function useChambers(practiceId: string | null | undefined) {
  return useQuery({
    // Keyed by the practice: a list held for one practice is never read as
    // another's while the switch is on its way.
    queryKey: [...CHAMBERS_KEY, practiceId ?? null],
    enabled: !!practiceId,
    queryFn: async (): Promise<OpdChamber[]> => {
      const list = await chambersApi.list();
      if (!Array.isArray(list)) throw new Error("not a chamber list");
      return list;
    },
    networkMode: "always",
  });
}

export function useCreateChamber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; address?: string }) => chambersApi.create(input),
    onSettled: () => qc.invalidateQueries({ queryKey: CHAMBERS_KEY }),
  });
}

export function useUpdateChamber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; address?: string }) => chambersApi.update(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: CHAMBERS_KEY }),
  });
}

export function useRemoveChamber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chambersApi.remove(id),
    onSettled: () => qc.invalidateQueries({ queryKey: CHAMBERS_KEY }),
  });
}

/** A chamber's own print settings (null = the doctor's own print). Off for the
 *  default/none (`id` null). */
export function useChamberLayout(id: string | null) {
  return useQuery({
    queryKey: chamberLayoutKey(id),
    queryFn: () => chambersApi.layout(id as string),
    enabled: !!id,
  });
}

export function useSaveChamberLayout(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PrescriptionLayoutInput) => chambersApi.saveLayout(id as string, input),
    onSuccess: (data: ChamberLayoutAnswer) => qc.setQueryData(chamberLayoutKey(id), data),
  });
}

export function useClearChamberLayout(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => chambersApi.clearLayout(id as string),
    onSuccess: (data: ChamberLayoutAnswer) => qc.setQueryData(chamberLayoutKey(id), data),
  });
}
