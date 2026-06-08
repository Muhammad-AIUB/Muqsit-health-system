"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { patientsApi, type Patient, type PatientInput } from "@/lib/api";

const PATIENTS_KEY = ["patients"] as const;

export function usePatients(search?: string) {
  return useQuery({
    queryKey: [...PATIENTS_KEY, search ?? ""],
    queryFn: () => patientsApi.list(search),
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
