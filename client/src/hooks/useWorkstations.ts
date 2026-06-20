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
  });
}
