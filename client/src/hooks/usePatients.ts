"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { patientsApi, type Patient, type PatientInput } from "@/lib/api";

const PATIENTS_KEY = ["patients"] as const;

export function usePatients(wsId: string | null, search?: string) {
  return useQuery({
    queryKey: [...PATIENTS_KEY, wsId ?? "", search ?? ""],
    queryFn: () => patientsApi.list(search),
    // Always treat as stale so the list is never served from an empty/wrong
    // workstation cache (the race between useWorkstations resolving and the
    // first patients fetch makes stale 30-second data a real failure mode).
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatientInput) => patientsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PATIENTS_KEY }),
  });
}

export function useUpdatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PatientInput> }) =>
      patientsApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PATIENTS_KEY }),
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => patientsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PATIENTS_KEY }),
  });
}

export type { Patient, PatientInput };
