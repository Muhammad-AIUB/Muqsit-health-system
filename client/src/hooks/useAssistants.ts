"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assistantsApi, type AssistantRecord, type AssistantCandidate } from "@/lib/api";

const ASSISTANTS_KEY = ["assistants"] as const;

export function useAssistants() {
  return useQuery({
    queryKey: ASSISTANTS_KEY,
    queryFn: () => assistantsApi.list(),
  });
}

// Search registered users to add — only runs when there's a query.
export function useAssistantSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: [...ASSISTANTS_KEY, "search", q],
    queryFn: () => assistantsApi.search(q),
    enabled: q.length > 0,
  });
}

const DEFAULTS_KEY = ["assistants", "defaults"] as const;

export function useAssistantDefaults() {
  return useQuery({
    queryKey: DEFAULTS_KEY,
    queryFn: () => assistantsApi.getDefaults(),
  });
}

export function useUpdateAssistantDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (permissions: string[]) => assistantsApi.setDefaults(permissions),
    // Defaults changed → both the defaults and every assistant's permissions
    // may have changed (the server propagates the delta), so refresh both.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEFAULTS_KEY });
      qc.invalidateQueries({ queryKey: ASSISTANTS_KEY });
    },
  });
}

export function useAddAssistant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assistantId: string) => assistantsApi.add(assistantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSISTANTS_KEY }),
  });
}

export function useUpdateAssistant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { permissions?: string[]; status?: "active" | "suspended" } }) =>
      assistantsApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSISTANTS_KEY }),
  });
}

export function useRemoveAssistant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assistantsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSISTANTS_KEY }),
  });
}

export type { AssistantRecord, AssistantCandidate };
