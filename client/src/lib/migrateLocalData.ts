// One-time migration of legacy browser-localStorage data into the server.
// Runs once per browser after sign-in: it reads the old keys, pushes their
// contents to the API, then deletes the local copies so nothing data-bearing
// is left in localStorage. Intentional local keys (login "remember", signup
// draft, recent-suggestion lists) are left untouched.

import {
  patientsApi,
  prescriptionLayoutApi,
  templatesApi,
  type TemplateCategory,
  type TemplateItem,
} from "@/lib/api";

const DONE_KEY = "mhs_local_migrated_v1";

const TPL_KEYS: Record<TemplateCategory, string> = {
  opd: "mhs_rx_templates_opd",
  ipd: "mhs_rx_templates_ipd",
  custom: "mhs_rx_templates_custom",
};

const HM_PREFIX = "mhs_hm_dates_";

type LegacyTemplate = { name?: string; items?: TemplateItem[] };

export async function migrateLocalDataToServer(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const ls = window.localStorage;
  if (ls.getItem(DONE_KEY)) return false;

  let movedSomething = false;

  // 1 · Prescription templates → server (then drop the local copy).
  for (const [cat, key] of Object.entries(TPL_KEYS) as [TemplateCategory, string][]) {
    const raw = ls.getItem(key);
    if (!raw) continue;
    try {
      const list = JSON.parse(raw) as LegacyTemplate[];
      for (const t of Array.isArray(list) ? list : []) {
        if (!t?.name) continue;
        await templatesApi.create({ category: cat, name: t.name, items: t.items ?? [] });
        movedSomething = true;
      }
    } catch {
      /* corrupt entry — drop it below regardless */
    }
    ls.removeItem(key);
  }

  // 2 · Prescription type + OPD layout preference → server.
  const rxType = ls.getItem("mhs_rx_type");
  const opdLayout = ls.getItem("mhs_opd_layout");
  if (rxType || opdLayout) {
    try {
      await prescriptionLayoutApi.update({
        ...(rxType === "opd" || rxType === "ipd" ? { rxType } : {}),
        ...(opdLayout === "single" || opdLayout === "extra" ? { opdLayout } : {}),
      });
      movedSomething = true;
    } catch {
      /* ignore */
    }
  }
  ls.removeItem("mhs_rx_type");
  ls.removeItem("mhs_opd_layout");

  // 3 · Health-monitoring drug dates → each patient record.
  const hmKeys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(HM_PREFIX)) hmKeys.push(k);
  }
  for (const k of hmKeys) {
    const patientId = k.slice(HM_PREFIX.length);
    const raw = ls.getItem(k);
    if (raw && patientId) {
      try {
        await patientsApi.update(patientId, { hmDrugDates: JSON.parse(raw) });
        movedSomething = true;
      } catch {
        /* patient may no longer exist — drop the local copy anyway */
      }
    }
    ls.removeItem(k);
  }

  ls.setItem(DONE_KEY, "1");
  return movedSomething;
}
