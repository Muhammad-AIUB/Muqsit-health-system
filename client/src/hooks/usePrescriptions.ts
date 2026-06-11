"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  prescriptionsApi,
  type PrescriptionInput,
  type PrescriptionRecord,
} from "@/lib/api";

export function usePatientPrescriptions(patientId: string | null) {
  return useQuery({
    queryKey: ["prescriptions", patientId ?? ""],
    queryFn: () => prescriptionsApi.listByPatient(patientId as string),
    enabled: Boolean(patientId),
  });
}

export function useCreatePrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PrescriptionInput) => prescriptionsApi.create(input),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["prescriptions", vars.patientId] }),
  });
}

export type { PrescriptionInput, PrescriptionRecord };
