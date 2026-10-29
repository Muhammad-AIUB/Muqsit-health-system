"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { opdApi, type OpdScheduleAnswer, type OpdScheduleInput, type OpdVisit, type OpdVisitInput } from "@/lib/api";

const OPD_KEY = ["opd"] as const;
const dayKey = (day: string) => [...OPD_KEY, "day", day] as const;
const scheduleKey = (day: string) => [...OPD_KEY, "schedule", day] as const;

// A day's queue (default: today). One cache entry per day, so going back to a
// day shows it at once and a refresh settles it.
export function useOpdQueue(day?: string) {
  return useQuery({
    queryKey: day ? dayKey(day) : OPD_KEY,
    queryFn: () => opdApi.list(day),
  });
}

// A day's chamber schedule. Not kept between days on its own: each day's is the
// server's answer for THAT day (its own, or the latest earlier day's).
export function useOpdSchedule(day: string) {
  return useQuery({ queryKey: scheduleKey(day), queryFn: () => opdApi.schedule(day) });
}

export function useAddOpdVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OpdVisitInput) => opdApi.create(input),
    // Every day's queue and schedule: the first visit added to a day saves the
    // schedule that day took from an earlier one.
    onSuccess: () => qc.invalidateQueries({ queryKey: OPD_KEY }),
  });
}

export function useSetOpdStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "waiting" | "done" }) =>
      opdApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: OPD_KEY }),
  });
}

// Move a patient one place up or down. The answer is the day's queue as the
// server now has it; it is shown at once, then every list is read again.
export function useMoveOpdVisit(day: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "up" | "down" }) => opdApi.move(id, direction),
    onSuccess: (rows) => {
      qc.setQueryData(dayKey(day), rows);
      void qc.invalidateQueries({ queryKey: OPD_KEY });
    },
  });
}

export function useSaveOpdSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OpdScheduleInput) => opdApi.saveSchedule(input),
    onSuccess: (answer) => {
      qc.setQueryData(scheduleKey(answer.day), answer);
      void qc.invalidateQueries({ queryKey: OPD_KEY });
    },
  });
}

export type { OpdScheduleAnswer, OpdScheduleInput, OpdVisit, OpdVisitInput };
