"use client";

import { useEffect, useRef, useState } from "react";
import { medicinesApi, type MedicineHit } from "@/lib/api";

// Debounced medicine search against GET /api/medicines/search.
// Skips queries shorter than 2 chars; ignores out-of-order responses.
export function useMedicineSearch(query: string): { results: MedicineHit[]; isLoading: boolean } {
  const [results, setResults] = useState<MedicineHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      medicinesApi
        .search(q)
        .then((r) => { if (id === reqId.current) setResults(r); })
        .catch(() => { if (id === reqId.current) setResults([]); })
        .finally(() => { if (id === reqId.current) setIsLoading(false); });
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, isLoading };
}

export type { MedicineHit };
