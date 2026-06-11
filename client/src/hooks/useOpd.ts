"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { opdApi, type OpdVisit, type OpdVisitInput } from "@/lib/api";

const OPD_KEY = ["opd"] as const;

export function useOpdQueue() {
  return useQuery({ queryKey: OPD_KEY, queryFn: () => opdApi.list() });
}

export function useAddOpdVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OpdVisitInput) => opdApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: OPD_KEY }),
  });
}

export function useSetOpdStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "waiting" | "done" }) =>
      opdApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: OPD_KEY }),
  });
}

export type { OpdVisit, OpdVisitInput };
