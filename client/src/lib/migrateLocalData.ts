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

export async function migrateLocalDataToServer(userId?: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  // The migration must be scoped to a signed-in user: the done-flag is per-user
  // so a shared browser doesn't let one doctor's sign-in consume another's data.
  if (!userId) return false;
  const ls = window.localStorage;
  const doneKey = `${DONE_KEY}_${userId}`;
  if (ls.getItem(doneKey)) return false;

  let movedSomething = false;
  // Track whether every write succeeded. A local key is dropped only after its
  // server write is confirmed, and the done-flag is set only if nothing failed —
  // so a transient error retries next session instead of permanently losing data.
  let hadError = false;

  // 1 · Prescription templates → server (drop the local copy only once every
  // template in the key persisted).
  for (const [cat, key] of Object.entries(TPL_KEYS) as [TemplateCategory, string][]) {
    const raw = ls.getItem(key);
    if (!raw) continue;
    let list: LegacyTemplate[];
    try {
      list = JSON.parse(raw) as LegacyTemplate[];
    } catch {
      ls.removeItem(key); // unparseable — nothing to migrate, safe to drop
      continue;
    }
    let allOk = true;
    for (const t of Array.isArray(list) ? list : []) {
      if (!t?.name) continue;
      try {
        await templatesApi.create({ category: cat, name: t.name, items: t.items ?? [] });
        movedSomething = true;
      } catch {
        allOk = false;
        hadError = true;
      }
    }
    if (allOk) ls.removeItem(key);
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
      ls.removeItem("mhs_rx_type");
      ls.removeItem("mhs_opd_layout");
    } catch {
      hadError = true; // keep the keys so a later session retries
    }
  } else {
    ls.removeItem("mhs_rx_type");
    ls.removeItem("mhs_opd_layout");
  }

  // 3 · Health-monitoring drug dates → each patient record.
  const hmKeys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(HM_PREFIX)) hmKeys.push(k);
  }
  for (const k of hmKeys) {
    const patientId = k.slice(HM_PREFIX.length);
    const raw = ls.getItem(k);
    if (!raw || !patientId) continue;
    let parsed: Record<string, { sf: string; upto: string }>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ls.removeItem(k); // corrupt — nothing to migrate
      continue;
    }
    try {
      await patientsApi.update(patientId, { hmDrugDates: parsed });
      movedSomething = true;
      ls.removeItem(k); // only after the owning doctor's update succeeded
    } catch {
      // The current account may not own this patient (shared browser) or the
      // write was transient — keep the local copy so the true owner can migrate
      // it on their own sign-in, rather than deleting it here.
      hadError = true;
    }
  }

  if (!hadError) ls.setItem(doneKey, "1");
  return movedSomething;
}
