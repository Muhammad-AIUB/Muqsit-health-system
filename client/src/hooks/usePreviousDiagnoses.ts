"use client";

import { useQuery } from "@tanstack/react-query";
import { useMuqsit } from "@/context/MuqsitContext";
import { prescriptionsApi } from "@/lib/api";

// ⚕️ "P.D" — every final diagnosis this patient already carries, from ALL of
// their saved visits, newest visit first. Read-only: the list is offered inside
// the Final diagnosis popup so the doctor can carry a diagnosis forward with a
// tick instead of retyping it. Nothing here is ever written back to a past
// prescription.
//
// Repeats are folded by text only (case-insensitively, keeping the most recent
// spelling) — the same diagnosis written at three visits is one line, but two
// diagnoses that merely look alike are never merged.
export function usePreviousDiagnoses(): string[] {
  const { currentPatientId } = useMuqsit();

  // Same query key as PreviousComplaintsField, so the two share one fetch.
  const { data } = useQuery({
    queryKey: ["prescriptions", currentPatientId],
    queryFn: () => prescriptionsApi.listByPatient(currentPatientId as string),
    enabled: Boolean(currentPatientId),
  });

  if (!data || data.length === 0) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    for (const d of p.finalDiagnosis ?? []) {
      const text = d.trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
  }
  return out;
}
