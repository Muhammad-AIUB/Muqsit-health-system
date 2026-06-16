// Prescription template labels + shared types. The data itself lives on the
// server now (see hooks/useTemplates and lib/api templatesApi) — no longer in
// localStorage, so templates follow the doctor across devices.

import type { RxTemplateRecord, TemplateCategory } from "@/lib/api";

export type { TemplateCategory };
export type RxTemplate = RxTemplateRecord;

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  opd: "OPD templates",
  ipd: "IPD templates",
  custom: "Customized templates",
};
