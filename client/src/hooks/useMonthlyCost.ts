"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { medicinesApi } from "@/lib/api";
import { brandWordsOf } from "@/lib/medicineKey";
import { chartWordsOf, monthlyCost, readChartRows, type CostLine } from "@/lib/monthlyCost";
import type { RxItem } from "@/types";

export interface MonthlyCostView {
  /** "none": no medicine on the pad. "asking": some medicine is still being looked up. "failed": the chart could not be reached for it. */
  state: "none" | "asking" | "ready" | "failed";
  /** The sum of the medicines that were priced. */
  total: number;
  /** How many medicines were priced. */
  priced: number;
  /** The medicines that were looked up and could not be priced, with why. */
  unpriced: CostLine[];
  retry: () => void;
}

/**
 * The pad's month, priced from the medicine chart (`lib/monthlyCost.ts`).
 *
 * The chart is asked ONCE for the whole pad — the first word of each brand —
 * and asked again only when a new brand appears, 400 ms after the typing
 * stops: a medicine typed by hand changes its label at every letter. What has
 * been answered is kept for ten minutes (a price does not change while a
 * prescription is written), and kept on screen while a newer question is on
 * its way, so the medicines already priced keep their price; a medicine whose
 * brand has not been answered yet is neither priced nor counted as unpriced —
 * the box says it is still asking.
 *
 * ⚕️ A failure is never a total. Asked whatever the browser says
 * (`networkMode: "always"`), so offline is a failure that can be said, after
 * two quiet retries; and an answer that is not the chart (`readChartRows`
 * returns null) is thrown, never read as an empty chart — that would read as
 * "not in the medicine chart" for every medicine.
 */
export function useMonthlyCost(items: RxItem[]): MonthlyCostView {
  const words = useMemo(() => chartWordsOf(items), [items]);
  const key = words.join(" ");
  const [asked, setAsked] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setAsked(key), 400);
    return () => clearTimeout(t);
  }, [key]);
  const askedWords = useMemo(() => (asked ? asked.split(" ") : []), [asked]);

  const query = useQuery({
    queryKey: ["medicine-chart", asked],
    queryFn: async ({ signal }) => {
      const rows = readChartRows(await medicinesApi.byBrand(askedWords, signal));
      if (!rows) throw new Error("The medicine chart's answer could not be read.");
      return { words: askedWords, rows };
    },
    enabled: askedWords.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    networkMode: "always",
    retry: 2,
  });

  const { data, isError, refetch } = query;
  return useMemo<MonthlyCostView>(() => {
    const retry = () => void refetch();
    if (words.length === 0) return { state: "none", total: 0, priced: 0, unpriced: [], retry };
    const answered = new Set(data?.words ?? []);
    let total = 0;
    let priced = 0;
    let waiting = 0;
    const unpriced: CostLine[] = [];
    for (const l of monthlyCost(items, data?.rows ?? []).lines) {
      if (!brandWordsOf(l.label).every((w) => answered.has(w))) { waiting++; continue; }
      if (l.taka !== undefined) { total += l.taka; priced++; } else unpriced.push(l);
    }
    const state = waiting === 0 ? "ready" : isError ? "failed" : "asking";
    return { state, total, priced, unpriced, retry };
  }, [words, data, isError, items, refetch]);
}
