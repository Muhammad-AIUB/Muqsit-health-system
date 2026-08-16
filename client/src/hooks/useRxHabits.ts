"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rxHabitsApi, type RxHabitGroup } from "@/lib/api";

/**
 * Debounced lookup of the doctor's own prescribing habits, against
 * GET /api/rx-habits. Deliberately the same shape as `useMedicineSearch`
 * (300 ms debounce, `reqId` out-of-order guard, `<2` chars → empty) so both
 * halves of the medicine dropdown behave identically on a bad network.
 *
 * ⚕️ FAILURE IS SILENT, ALWAYS. A rejected request resolves to `[]`: a broken
 * habit fetch must never degrade the medicine dropdown, and must never put an
 * error where a doctor could read it as "you have no habits". On a clinical
 * screen "no suggestions" and "the lookup failed" must not look alike, and the
 * safe rendering of both is silence plus a working dropdown. The operator hears
 * about it in the server log instead (see rx-habits.service.ts).
 */
export function useRxHabits(query: string): {
  groups: RxHabitGroup[];
  refresh: () => void;
} {
  const [groups, setGroups] = useState<RxHabitGroup[]>([]);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  // Re-run the current query after a hide/unhide, so the group re-renders from
  // the server's truth rather than a local guess about what is now hidden.
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setGroups([]);
      return;
    }
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      rxHabitsApi
        .list(q)
        .then((r) => {
          // The response is data from a Json column at one remove — treat a
          // non-array as no suggestions rather than letting it reach render.
          if (id === reqId.current) setGroups(Array.isArray(r) ? r : []);
        })
        .catch(() => {
          if (id === reqId.current) setGroups([]);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, nonce]);

  return { groups, refresh };
}
