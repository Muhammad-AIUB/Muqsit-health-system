import { HabitMedicine, RxItemLike, blocksFrom, sanitiseContLines } from './rx-habits.service';

// ⚕️ What the doctor has actually ordered on the WARD (physician, 24/11/2026:
// "whatever is used in IPD, IPD suggestions will appear first").
//
// The OPD habits (`DoctorRxHabit`) are learned from outpatient prescriptions
// only; the ward's orders live in each admission's `clinical.rxItems`. For the
// IPD "Add Bulk Medicine" box those admissions are read directly — nothing is
// stored, nothing is written, and an admission's orders are only ever read.
//
// Every character is the doctor's own: a dose, food or duration is taken from
// what was written, never completed or reworded. A medicine's usual instruction
// is the one written for the most admissions, the newest winning a tie; its
// last three distinct instructions are its choices — the same shape the OPD
// list has, so the box needs nothing new.

export interface IpdOrders {
  /** When the admission began: the "last used" of everything ordered on it. */
  admittedAt: Date;
  /** The admission's `clinical` column, as stored (unknown: any shape is possible). */
  clinical: unknown;
}

const MAX_RECENT = 3;

/** The ℞ lines of one admission's clinical sheet, or none when it holds no list. */
function rxItemsOf(clinical: unknown): RxItemLike[] {
  if (!clinical || typeof clinical !== 'object' || Array.isArray(clinical)) return [];
  const items = (clinical as Record<string, unknown>).rxItems;
  if (!Array.isArray(items)) return [];
  return items.filter((it): it is RxItemLike => !!it && typeof it === 'object' && typeof (it as RxItemLike).drug === 'string');
}

interface Use {
  signature: string;
  dose: string;
  food: string;
  duration: string;
  contLines: HabitMedicine['contLines'];
  admissions: number;
  lastUsedAt: Date;
}

/**
 * The medicines used on the ward, most used first (distinct admissions, then the
 * newest), each with its usual instruction and its last three. `generic` is not
 * filled here: the caller asks the catalogue for it, as it does for every list.
 */
export function ipdMedicines(admissions: readonly IpdOrders[]): HabitMedicine[] {
  interface Med { drugKey: string; drugLabel: string; labelAt: Date; admissionIds: Set<number>; uses: Map<string, Use>; lastUsedAt: Date }
  const byKey = new Map<string, Med>();

  admissions.forEach((adm, n) => {
    for (const b of blocksFrom(rxItemsOf(adm.clinical))) {
      // A taper that cannot be read is left out WHOLE, as everywhere else.
      const contLines = sanitiseContLines(b.contLines);
      if (contLines === null) continue;
      let m = byKey.get(b.drugKey);
      if (!m) {
        m = { drugKey: b.drugKey, drugLabel: b.drugLabel, labelAt: adm.admittedAt, admissionIds: new Set(), uses: new Map(), lastUsedAt: adm.admittedAt };
        byKey.set(b.drugKey, m);
      }
      m.admissionIds.add(n);
      if (adm.admittedAt >= m.labelAt) { m.drugLabel = b.drugLabel; m.labelAt = adm.admittedAt; }
      if (adm.admittedAt > m.lastUsedAt) m.lastUsedAt = adm.admittedAt;
      const u = m.uses.get(b.signature);
      if (u) {
        u.admissions += 1;
        if (adm.admittedAt > u.lastUsedAt) u.lastUsedAt = adm.admittedAt;
      } else {
        m.uses.set(b.signature, { signature: b.signature, dose: b.dose, food: b.food, duration: b.duration, contLines, admissions: 1, lastUsedAt: adm.admittedAt });
      }
    }
  });

  const out: HabitMedicine[] = [];
  for (const m of byKey.values()) {
    const uses = [...m.uses.values()];
    const usual = [...uses].sort((a, b) => b.admissions - a.admissions || +b.lastUsedAt - +a.lastUsedAt)[0];
    const recent = [...uses].sort((a, b) => +b.lastUsedAt - +a.lastUsedAt).slice(0, MAX_RECENT);
    out.push({
      id: `ipd:${m.drugKey}`,
      drugKey: m.drugKey,
      drugLabel: m.drugLabel,
      dose: usual.dose,
      food: usual.food,
      duration: usual.duration,
      contLines: usual.contLines,
      patientCount: m.admissionIds.size,
      lastUsedAt: m.lastUsedAt,
      recent: recent.map((u) => ({
        id: `ipd:${m.drugKey}:${u.signature}`,
        dose: u.dose,
        food: u.food,
        duration: u.duration,
        contLines: u.contLines,
        patientCount: u.admissions,
        lastUsedAt: u.lastUsedAt,
      })),
    });
  }
  return out.sort((a, b) => b.patientCount - a.patientCount || +b.lastUsedAt - +a.lastUsedAt || a.drugKey.localeCompare(b.drugKey));
}
