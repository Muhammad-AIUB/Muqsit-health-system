"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ipdApi,
  type IpdAdmission,
  type IpdAdmissionInput,
  type IpdAdmissionUpdateInput,
  type IpdEventRecord,
} from "@/lib/api";

const IPD_KEY = ["ipd"] as const;
const eventsKey = (admissionId: string) => ["ipd", admissionId, "events"] as const;

export function useIpdList() {
  return useQuery({ queryKey: IPD_KEY, queryFn: () => ipdApi.list() });
}

export function useAdmitIpd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IpdAdmissionInput) => ipdApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: IPD_KEY }),
  });
}

export function useSetIpdStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => ipdApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: IPD_KEY }),
  });
}

export function useUpdateIpd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: IpdAdmissionUpdateInput }) => ipdApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: IPD_KEY }),
  });
}

export function useIpdEvents(admissionId: string | null) {
  return useQuery({
    queryKey: eventsKey(admissionId ?? ""),
    queryFn: () => ipdApi.events(admissionId as string),
    enabled: Boolean(admissionId),
  });
}

export function useAddIpdEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => ipdApi.addEvent(id, note),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: eventsKey(vars.id) }),
  });
}

export type { IpdAdmission, IpdAdmissionInput, IpdAdmissionUpdateInput, IpdEventRecord };
