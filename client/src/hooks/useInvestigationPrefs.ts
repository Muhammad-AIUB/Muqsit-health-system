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
  };
}

export function useSaveFavourites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (favouriteInvestigations: string[]) =>
      usersApi.update({ favouriteInvestigations }),
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
    mutationFn: (investigationUnitPrefs: Record<string, string>) =>
      usersApi.update({ investigationUnitPrefs }),
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
export function useSaveInvestigationGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (investigationGroups: InvestigationGroup[]) => usersApi.update({ investigationGroups }),
    onSuccess: (profile) => qc.setQueryData(KEY, profile),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
