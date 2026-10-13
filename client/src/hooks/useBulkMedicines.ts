"use client";

import { useQuery } from "@tanstack/react-query";
import { rxHabitsApi } from "@/lib/api";
import { readBulkList } from "@/lib/bulkMedicines";

/**
 * The doctor's own medicines for the "Add Bulk Medicine" box.
 *
 * ⚕️ Used by a component that is mounted ONLY WHILE THE BOX IS OPEN
 * (`BulkMedicineBox`): every opening asks the server again (`staleTime: 0`),
 * because a prescription saved in between has changed the counts. Nothing is
 * kept once the box closes (`gcTime: 0`) — but the box does not rely on that:
 * it shows "Loading" for as long as `isFetching`, so last time's list is never
 * on screen with this time's still on its way. A list that re-sorts itself
 * under the doctor's finger is how a tick lands on the wrong medicine.
 *
 * Keyed by the workstation, so one practice's list cannot be shown while
 * working in another.
 *
 * Unlike `useRxHabits`, a failure is NOT swallowed: this is a list the doctor
 * asked for, and the box says "could not be loaded" with Try again. One quiet
 * retry first — a dropped request usually comes back on the second ask.
 */
export function useBulkMedicines(workstationId: string | null) {
  return useQuery({
    queryKey: ["rx-habits", "all", workstationId ?? "own"],
    queryFn: async () => readBulkList(await rxHabitsApi.all()),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
