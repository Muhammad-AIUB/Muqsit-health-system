"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi, type ProfileMe } from "@/lib/api";
import { safeGroups, type InvestigationGroup } from "@/lib/investigationGroups";

// Shared cache of the doctor's investigation preferences (favourite tests +
// preferred units), read from the profile. Used by the Settings → Favourite &
// unit settings page and by the Investigation popup's "Favourite" category.
const KEY = ["investigation-prefs"];

export function useInvestigationPrefs() {
  const q = useQuery<ProfileMe>({
    queryKey: KEY,
    queryFn: () => usersApi.me(),
    staleTime: 60_000,
  });
  return {
    favourites: q.data?.favouriteInvestigations ?? [],
    unitPrefs: q.data?.investigationUnitPrefs ?? {},
    groups: safeGroups(q.data?.investigationGroups),
    isLoading: q.isLoading,
    // True only once the profile actually arrived. While loading or after a
    // failed load `groups` is an empty stand-in, not the doctor's real list.
    loaded: q.data !== undefined,
  };
}

// Favourites and unit prefs are sent WHOLE and the server replaces the stored
// value, so — like the groups below — a save built on the `[]`/`{}` stand-in of
// a profile that never loaded would wipe the doctor's real list. Refused until
// the profile is in the cache.
function assertLoaded(qc: ReturnType<typeof useQueryClient>, what: string) {
  if (qc.getQueryData<ProfileMe>(KEY) === undefined) {
    throw new Error(`your saved ${what} have not loaded yet. Please wait a moment and try again.`);
  }
}

export function useSaveFavourites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (favouriteInvestigations: string[]) => {
      assertLoaded(qc, "favourites");
      return usersApi.update({ favouriteInvestigations });
    },
    // Optimistically update the cache so the UI (and the popup) react instantly.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<ProfileMe>(KEY);
      if (prev) qc.setQueryData<ProfileMe>(KEY, { ...prev, favouriteInvestigations: next });
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSaveUnitPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (investigationUnitPrefs: Record<string, string>) => {
      assertLoaded(qc, "unit settings");
      return usersApi.update({ investigationUnitPrefs });
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<ProfileMe>(KEY);
      if (prev) qc.setQueryData<ProfileMe>(KEY, { ...prev, investigationUnitPrefs: next });
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// The doctor's investigation groups. NOT optimistic: the "Add new group"
// window waits for the server and stays open with the doctor's work if the save
// fails, so a group that was never stored can't look saved.
// The server REPLACES the stored list, and callers send the whole list built
// from `groups` — so a save before the profile has loaded would be built on the
// empty stand-in and wipe every saved group. Refused until it has loaded.
export function useSaveInvestigationGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (investigationGroups: InvestigationGroup[]) => {
      if (qc.getQueryData<ProfileMe>(KEY) === undefined) {
        throw new Error("your saved groups have not loaded yet. Please wait a moment and try again.");
      }
      return usersApi.update({ investigationGroups });
    },
    onSuccess: (profile) => qc.setQueryData(KEY, profile),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
