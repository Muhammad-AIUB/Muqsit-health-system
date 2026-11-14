"use client";

import { useQuery } from "@tanstack/react-query";
import { statisticsApi } from "@/lib/api";
import { readDays, readDiagnoses, readMonths, readOverall } from "@/lib/statistics";

// Settings → Statistics (physician's sheet, 11/11/2026). Every key carries the
// PRACTICE: a figure held for one practice is never read as another's while a
// switch is on its way. Asked whatever the browser says about being online
// (`networkMode: "always"`), so a failure is said rather than read as "nobody";
// an answer is checked to BE what the chart expects before it is read, and none
// is kept between visits — a count that was right at ten o'clock is not what a
// doctor expects to read at noon (`staleTime` 0, the default, and a short
// `gcTime`).

const KEY = ["statistics"] as const;
const BASE = { networkMode: "always", gcTime: 60_000 } as const;

/** `all` = the total of every chamber; otherwise a chamber's id. */
export function useVisitsByDay(practiceId: string | null, chamber: string, month: string) {
  return useQuery({
    ...BASE,
    queryKey: [...KEY, practiceId, "days", chamber, month],
    enabled: !!practiceId,
    queryFn: async () => readDays(await statisticsApi.days(month, chamber)),
  });
}

export function useVisitsByMonth(practiceId: string | null, chamber: string, year: string) {
  return useQuery({
    ...BASE,
    queryKey: [...KEY, practiceId, "months", chamber, year],
    enabled: !!practiceId,
    queryFn: async () => readMonths(await statisticsApi.months(year, chamber)),
  });
}

export function useVisitsOverall(practiceId: string | null, chamber: string) {
  return useQuery({
    ...BASE,
    queryKey: [...KEY, practiceId, "overall", chamber],
    enabled: !!practiceId,
    queryFn: async () => readOverall(await statisticsApi.overall(chamber)),
  });
}

// The practice's whole prescription record — a prescription holds no chamber.
export function useDiseaseStats(practiceId: string | null) {
  return useQuery({
    ...BASE,
    queryKey: [...KEY, practiceId, "diseases"],
    enabled: !!practiceId,
    queryFn: async () => readDiagnoses(await statisticsApi.diseases()),
  });
}
