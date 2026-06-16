"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi, type ProfileMe } from "@/lib/api";

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
