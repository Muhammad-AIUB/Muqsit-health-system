"use client";

import { useQuery } from "@tanstack/react-query";
import { workstationsApi, type Workstation } from "@/lib/api";

// The practices the signed-in user can work in — their own (purchased tiers)
// plus every doctor they actively assist. Drives the "Your workstations" switcher.
export function useWorkstations() {
  return useQuery<Workstation[]>({
    queryKey: ["workstations"],
    queryFn: () => workstationsApi.list(),
    staleTime: 60_000,
    // Never surface a transient failure (login refresh race, server restart,
    // network blip) to the user: keep retrying silently with capped backoff
    // until the list loads. The query never reaches the error state, so the
    // secondary-upgrade gate can only fire on a SUCCESSFUL empty result.
    retry: true,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
    refetchOnWindowFocus: true,
  });
}
