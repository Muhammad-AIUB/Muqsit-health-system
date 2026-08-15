"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { wardsApi, type Ward, type WardCandidate } from "@/lib/api";

const WARDS_KEY = ["wards"] as const;

export function useWards() {
  return useQuery({ queryKey: WARDS_KEY, queryFn: () => wardsApi.list() });
}

/** Registered users addable to this ward's team. Only runs with a query. */
export function useWardMemberSearch(wardId: string | null, query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: [...WARDS_KEY, "search", wardId, q],
    queryFn: () => wardsApi.search(wardId as string, q),
    enabled: !!wardId && q.length > 0,
  });
}

// Every ward mutation refreshes the ward list, and also the IPD queue: a ward
// rename re-stamps the admissions on it, and deleting one unlinks them, so a
// stale bed card would name a ward that no longer exists.
function useWardMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: WARDS_KEY });
      void qc.invalidateQueries({ queryKey: ["ipd"] });
    },
  });
}

export const useCreateWard = () => useWardMutation((name: string) => wardsApi.create(name));

export const useRenameWard = () =>
  useWardMutation(({ id, name }: { id: string; name: string }) => wardsApi.rename(id, name));

export const useDeleteWard = () => useWardMutation((id: string) => wardsApi.remove(id));

export const useAddWardMember = () =>
  useWardMutation(({ wardId, userId }: { wardId: string; userId: string }) =>
    wardsApi.addMember(wardId, userId));

export const useUpdateWardMember = () =>
  useWardMutation(({ wardId, memberId, input }: {
    wardId: string;
    memberId: string;
    input: { permissions?: string[]; status?: "active" | "suspended" };
  }) => wardsApi.updateMember(wardId, memberId, input));

export const useRemoveWardMember = () =>
  useWardMutation(({ wardId, memberId }: { wardId: string; memberId: string }) =>
    wardsApi.removeMember(wardId, memberId));

export type { Ward, WardCandidate };
