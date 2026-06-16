"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { prescriptionLayoutApi, type PrescriptionLayoutInput } from "@/lib/api";

export const PRESCRIPTION_LAYOUT_KEY = ["prescription-layout"];

export function usePrescriptionLayout() {
  return useQuery({ queryKey: PRESCRIPTION_LAYOUT_KEY, queryFn: () => prescriptionLayoutApi.get() });
}

export function useUpdatePrescriptionLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PrescriptionLayoutInput) => prescriptionLayoutApi.update(input),
    onSuccess: (data) => qc.setQueryData(PRESCRIPTION_LAYOUT_KEY, data),
  });
}
