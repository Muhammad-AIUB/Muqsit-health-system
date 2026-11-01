import type { ChamberLayoutAnswer, PrescriptionLayout } from "@/lib/api";

// ⚕️ Which print settings the OPD sheet uses (multi-chamber, 01/11/2026): the
// active chamber's own when it has them, else the doctor's own — the physician's
// "different prescription settings per chamber (OPD only)". The default chamber
// (`chamberId` null) has none of its own: the doctor's settings ARE its settings.
// An answer for ANOTHER chamber (the cache of the one chosen before) is never
// used; while the chosen chamber's answer has not arrived, the doctor's own
// settings stand, as they do for a chamber with none.
export function effectiveLayout(
  doctor: PrescriptionLayout | undefined,
  chamberId: string | null,
  chamber: ChamberLayoutAnswer | undefined,
): PrescriptionLayout | undefined {
  if (!chamberId || !chamber || chamber.chamberId !== chamberId) return doctor;
  return chamber.layout ?? doctor;
}
