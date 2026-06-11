"use client";

import { useQuery } from "@tanstack/react-query";
import { researchApi, type ResearchHit } from "@/lib/api";

export function useResearchSearch(q: string) {
  return useQuery({
    queryKey: ["research", q],
    queryFn: () => researchApi.search(q),
    enabled: q.trim().length > 0,
  });
}

export type { ResearchHit };
