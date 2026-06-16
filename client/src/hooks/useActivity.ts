"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activityApi, type LogActivityInput } from "@/lib/api";
import { useMuqsit } from "@/context/MuqsitContext";

const ACTIVITY_KEY = ["activity"];

// The live feed — polled so a doctor sees their assistant's actions (and their
// own from another tab) without a manual refresh.
export function useActivityFeed() {
  return useQuery({
    queryKey: ACTIVITY_KEY,
    queryFn: () => activityApi.list(50),
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });
}

// Low-level logger.
export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LogActivityInput) => activityApi.log(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACTIVITY_KEY }),
  });
}

// Convenience: log an action against the patient currently loaded in the editor.
export function useActivityLog() {
  const { ptName, currentPatientId } = useMuqsit();
  const log = useLogActivity();
  return (section: string, detail: string, action: "added" | "saved" = "added") => {
    const text = detail.trim();
    if (!text) return;
    log.mutate({
      section,
      detail: text,
      action,
      patientName: ptName.trim() || undefined,
      patientId: currentPatientId ?? undefined,
    });
  };
}
