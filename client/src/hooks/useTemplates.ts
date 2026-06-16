"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { templatesApi, type RxTemplateRecord, type TemplateCategory, type TemplateItem } from "@/lib/api";

const listKey = (cat?: TemplateCategory) => ["templates", cat ?? "all"];

export function useTemplates(category?: TemplateCategory) {
  return useQuery({ queryKey: listKey(category), queryFn: () => templatesApi.list(category) });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; category: TemplateCategory; name: string; items: TemplateItem[] }): Promise<RxTemplateRecord> =>
      v.id
        ? templatesApi.update(v.id, { name: v.name, items: v.items })
        : templatesApi.create({ category: v.category, name: v.name, items: v.items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templatesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}
