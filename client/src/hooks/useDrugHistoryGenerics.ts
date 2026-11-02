"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { medicinesApi } from "@/lib/api";
import { brandWordsOf } from "@/lib/medicineKey";
import { readChartRows } from "@/lib/monthlyCost";
import { genericOf, type GenericAnswer } from "@/lib/drugHistoryGeneric";

export interface DrugHistoryGenerics {
  /** "asking": still looking up; "failed": the chart could not be reached — shown as stored. */
  state: "none" | "asking" | "ready" | "failed";
  /** This label's answer, or null while it is not known (asking, failed). */
  answer: (label: string) => GenericAnswer | null;
  retry: () => void;
  retrying: boolean;
}

/**
 * The generics of the medicines a Drug-history list shows (`lib/drugHistoryGeneric.ts`).
 * The chart is asked ONCE for the whole list — the first word of each brand,
 * as the monthly-cost box asks — only while `enabled` (the list is open), and
 * the answer is kept ten minutes. Asked whatever the browser says
 * (`networkMode: "always"`), two quiet retries; an answer that is not the chart
 * is a failure, never read as "no generic" for every medicine.
 */
export function useDrugHistoryGenerics(labels: string[], enabled: boolean): DrugHistoryGenerics {
  const words = useMemo(() => {
    const w = new Set<string>();
    for (const l of labels) for (const x of brandWordsOf(l)) w.add(x);
    return [...w].sort();
  }, [labels]);
  const key = words.join(" ");

  const query = useQuery({
    queryKey: ["medicine-generics", key],
    queryFn: async ({ signal }) => {
      const rows = readChartRows(await medicinesApi.byBrand(words, signal));
      if (!rows) throw new Error("The medicine chart's answer could not be read.");
      return rows;
    },
    enabled: enabled && words.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
    networkMode: "always",
    retry: 2,
  });

  const { data, isError, refetch, isFetching } = query;
  const answer = useCallback((label: string) => (data ? genericOf(label, data) : null), [data]);
  const state: DrugHistoryGenerics["state"] = words.length === 0 ? "none" : data ? "ready" : isError ? "failed" : "asking";
  return { state, answer, retry: () => void refetch(), retrying: isFetching };
}
