"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { doctorPhrasesApi, type DoctorPhrase, type PhraseSource } from "@/lib/api";

/**
 * Debounced lookup of the phrases THIS doctor has written before on one surface
 * — the ADVICE list or a free-typed ℞ note line — against
 * GET /api/doctor-phrases. Same shape as `useRxHabits` (300 ms debounce,
 * `reqId` out-of-order guard) so every learned-suggestion surface in the app
 * behaves identically on a bad network.
 *
 * Unlike the medicine lookup there is no minimum query length: a doctor who
 * opens the Advice box with nothing typed should see the lines they write most
 * often, which is exactly what an empty query returns.
 *
 * ⚕️ FAILURE IS SILENT, ALWAYS. A rejected request resolves to `[]`. On a
 * clinical screen "you have no saved phrases" and "the lookup failed" must not
 * look alike, and the safe rendering of both is silence plus a field that still
 * takes typing. The operator hears about it in the server log instead.
 */
export function useDoctorPhrases(
  source: PhraseSource,
  query: string,
  enabled = true,
): { phrases: DoctorPhrase[]; refresh: () => void } {
  const [phrases, setPhrases] = useState<DoctorPhrase[]>([]);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  // Re-run after a hide, so the list re-renders from the server's truth rather
  // than a local guess about what is now hidden.
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setPhrases([]);
      return;
    }
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      doctorPhrasesApi
        .list(source, query.trim())
        .then((r) => {
          if (id === reqId.current) setPhrases(Array.isArray(r) ? r : []);
        })
        .catch(() => {
          if (id === reqId.current) setPhrases([]);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [source, query, enabled, nonce]);

  return { phrases, refresh };
}
