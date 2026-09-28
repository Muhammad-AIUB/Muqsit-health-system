"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi, type ProfileMe } from "@/lib/api";

// Per-doctor "recently typed" chip entries for the clinical fields, stored on
// the profile ({ [fieldLabel]: string[] }). Replaces the old per-device
// localStorage cache so recents follow the doctor across devices.
const KEY = ["field-recents"];
const RECENT_LIMIT = 12;

export function useFieldRecents() {
  const qc = useQueryClient();
  const { data } = useQuery<ProfileMe>({
    queryKey: KEY,
    queryFn: () => usersApi.me(),
    staleTime: 60_000,
  });
  const map = (data?.fieldRecents ?? {}) as Record<string, string[]>;
  // The server REPLACES the whole fieldRecents map, and addRecents sends the
  // whole map — so until the profile has loaded (or if it failed) `map` is an
  // empty stand-in and saving would wipe every other field's recents.
  const loaded = data !== undefined;

  const save = useMutation({
    mutationFn: (next: Record<string, string[]>) => usersApi.update({ fieldRecents: next }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<ProfileMe>(KEY);
      if (prev) qc.setQueryData<ProfileMe>(KEY, { ...prev, fieldRecents: next });
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const getRecents = (label: string): string[] => map[label] ?? [];

  // Merge new entries newest-first, de-duplicated and capped, then persist.
  const addRecents = (label: string, newOnes: string[]) => {
    if (!loaded || !newOnes.length) return;
    const prev = map[label] ?? [];
    const merged = [...newOnes, ...prev.filter((p) => !newOnes.includes(p))].slice(0, RECENT_LIMIT);
    if (merged.length === prev.length && merged.every((v, i) => v === prev[i])) return; // no change
    save.mutate({ ...map, [label]: merged });
  };

  return { getRecents, addRecents, loaded };
}
