// Prescription template labels + shared types. The data itself lives on the
// server now (see hooks/useTemplates and lib/api templatesApi) — no longer in
// localStorage, so templates follow the doctor across devices.

import type { RxTemplateRecord, TemplateCategory } from "@/lib/api";

export type { TemplateCategory };
export type RxTemplate = RxTemplateRecord;

/**
 * Advice / Advised-tests lines of a template, appended to the visit's list
 * (24/11/2026): after what is there, blanks skipped, a line already present —
 * or repeated inside the template — written once. Text is never altered.
 */
export function withTemplateLines(prev: readonly string[], lines: readonly string[] | undefined): string[] {
  const fresh = (lines ?? []).filter((l) => typeof l === "string" && l.trim());
  return [...prev, ...fresh.filter((l, i) => !prev.includes(l) && fresh.indexOf(l) === i)];
}

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  opd: "OPD templates",
  ipd: "IPD templates",
  custom: "Customized templates",
};
