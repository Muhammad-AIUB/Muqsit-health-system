"use client";

import { useQuery } from "@tanstack/react-query";
import { rxHabitsApi } from "@/lib/api";
import { isBulkAnswer, readBulkList } from "@/lib/bulkMedicines";

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
 * ⚕️ A failure is NOT swallowed, unlike `useRxHabits`: this is a list the
 * doctor asked for, and the box says "could not be loaded" with Try again. One
 * quiet retry first — a dropped request usually comes back on the second ask.
 * Two things make sure a failure REACHES the box as one (first review, before
 * release — each was drawn as "No medicines yet"):
 *   • `networkMode: "always"`. By default React Query does not ask at all while
 *     the browser says it is offline: the request is held back, nothing is
 *     fetching and nothing has failed. Asked anyway, it fails, and is said.
 *   • An answer that is not the list (an empty body, a sign-in page a hospital's
 *     Wi-Fi put in its place) is thrown here. `readBulkList` would read it as an
 *     empty list, which is the right thing for it to do and the wrong thing to
 *     show.
 */
export function useBulkMedicines(workstationId: string | null) {
  return useQuery({
    queryKey: ["rx-habits", "all", workstationId ?? "own"],
    queryFn: async () => {
      const answer = await rxHabitsApi.all();
      if (!isBulkAnswer(answer)) throw new Error("the medicine list could not be read");
      return readBulkList(answer);
    },
    networkMode: "always",
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
