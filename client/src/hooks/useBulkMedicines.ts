"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError, rxHabitsApi } from "@/lib/api";
import { readBulkList } from "@/lib/bulkMedicines";

// One quiet retry, for whatever may be different the second time: a request
// that was dropped, a server that stumbled, an answer that could not be read —
// and a 401, which `apiFetch` gives when the session could not be renewed just
// then, or a 404 from an API one deploy behind the page. Not for a 403: the
// server has looked at who is asking and said no, and the retry only kept the
// doctor a second longer from reading why. (It was "not for anything below
// 500" for one round, before release: that took the retry from the expired
// session on a bad connection, where it helps most.)
const askAgain = (failures: number, error: unknown): boolean =>
  failures < 1 && !(error instanceof ApiError && error.status === 403);

/**
 * The doctor's own medicines for the "Add Bulk Medicine" box.
 *
 * Used by `BulkMedicineBox`, which is mounted only while the box is open: every
 * opening asks the server again (`staleTime: 0`), because a prescription saved
 * in between has changed the counts, and nothing is kept once it closes
 * (`gcTime: 0`). Keyed by the workstation, so one practice's list cannot be
 * shown while working in another.
 *
 * ⚕️ A failure is NOT swallowed, unlike `useRxHabits`: this is a list the doctor
 * asked for, and the box says "could not be loaded" with Try again — after one
 * quiet retry (`askAgain`), since a dropped request usually comes back on the
 * second ask. Two things make sure a failure reaches the box AS one:
 *   • `networkMode: "always"`. By default React Query does not ask at all while
 *     the browser says it is offline: nothing is fetching and nothing has
 *     failed. Asked anyway, the request fails, and that can be said.
 *   • An answer that is not the list (`readBulkList` returns null) is thrown.
 */
export function useBulkMedicines(workstationId: string | null) {
  return useQuery({
    queryKey: ["rx-habits", "all", workstationId ?? "own"],
    queryFn: async ({ signal }) => {
      const list = readBulkList(await rxHabitsApi.all(signal));
      if (!list) throw new Error("the medicine list could not be read");
      return list;
    },
    networkMode: "always",
    staleTime: 0,
    gcTime: 0,
    retry: askAgain,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
