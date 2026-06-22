"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { patientChatApi } from "@/lib/api";

const chatKey = (patientId: string) => ["patient-chat", patientId];

// Per-patient team chat — polled so the care team sees each other's messages
// without a manual refresh (same pattern as the activity feed).
export function usePatientChat(patientId: string | null) {
  return useQuery({
    queryKey: chatKey(patientId ?? "none"),
    queryFn: () => patientChatApi.list(patientId as string),
    enabled: !!patientId,
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });
}

export function useSendChat(patientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body?: string; attachmentUrl?: string }) =>
      patientChatApi.send(patientId as string, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKey(patientId ?? "none") }),
  });
}
