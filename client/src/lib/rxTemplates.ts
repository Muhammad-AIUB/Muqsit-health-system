// Doctor-authored prescription templates, grouped by category (OPD / IPD /
// Customized). A template is just a named list of Rx items the doctor can drop
// into a prescription. Stored locally per category.

import type { RxItem } from "@/types";

export type TemplateCategory = "opd" | "ipd" | "custom";

export interface RxTemplate {
  id: string;
  name: string;
  items: RxItem[];
}

const KEY: Record<TemplateCategory, string> = {
  opd: "mhs_rx_templates_opd",
  ipd: "mhs_rx_templates_ipd",
  custom: "mhs_rx_templates_custom",
};

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  opd: "OPD templates",
  ipd: "IPD templates",
  custom: "Customized templates",
};

export function getTemplates(cat: TemplateCategory): RxTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY[cat]);
    const parsed = raw ? (JSON.parse(raw) as RxTemplate[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(cat: TemplateCategory, list: RxTemplate[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY[cat], JSON.stringify(list));
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// Add a new template (no id) or update an existing one (with id). Returns the
// saved template (with its id).
export function saveTemplate(cat: TemplateCategory, tpl: Omit<RxTemplate, "id"> & { id?: string }): RxTemplate {
  const list = getTemplates(cat);
  if (tpl.id) {
    const saved: RxTemplate = { id: tpl.id, name: tpl.name, items: tpl.items };
    writeAll(cat, list.map((t) => (t.id === tpl.id ? saved : t)));
    return saved;
  }
  const saved: RxTemplate = { id: newId(), name: tpl.name, items: tpl.items };
  writeAll(cat, [...list, saved]);
  return saved;
}

export function deleteTemplate(cat: TemplateCategory, id: string): void {
  writeAll(cat, getTemplates(cat).filter((t) => t.id !== id));
}
