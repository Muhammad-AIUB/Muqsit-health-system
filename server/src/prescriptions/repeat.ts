import type { Prescription, PrescriptionItem } from '@prisma/client';
import type { CreatePrescriptionDto, RxItemDto } from './dto/prescription.dto';

// ⚕️ Is a prescription being saved the very one already on record? Only then
// is the stored one answered instead of a second row (`PrescriptionsService
// #create`). "The very one" is EVERY field the request can carry and every
// line, as it would be stored: a field left out of this comparison would make
// two prescriptions that differ only there look the same, and the second one's
// value would be lost. `repeat.spec.ts` holds that every property of the DTOs
// is compared, so a field added to the DTO without a line here fails it.

/** A save sent again within this long of the last is a candidate repeat. */
export const REPEAT_WINDOW_MS = 30 * 60 * 1000;

/** The DTO's text lists, each stored as a String[] defaulting to []. */
export const LIST_FIELDS = [
  'chiefComplaints', 'previousComplaints', 'history', 'investigation', 'drugHistory',
  'onExamination', 'note', 'plan', 'provisionalDiagnosis', 'associatedIllness',
  'finalDiagnosis', 'advice', 'adviceTest',
] as const;
/** The DTO's optional texts, each stored as String? (absent = null). */
export const TEXT_FIELDS = ['followUpNum', 'followUpUnit'] as const;
/** The DTO's flags, stored as Boolean defaulting to false. */
export const FLAG_FIELDS = ['followUpMandatory'] as const;
/** What the request carries beside the fields above. */
export const OTHER_FIELDS = ['patientId', 'items'] as const;
/** Every property of a line, compared below. */
export const ITEM_FIELDS = ['drug', 'dose', 'duration', 'instruction', 'order', 'isNote', 'sf', 'isCont'] as const;

type Fields = Omit<CreatePrescriptionDto, 'patientId' | 'items'>;
type Line = RxItemDto & { order: number };

const sameList = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) => {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

export function sameContent(
  stored: Prescription & { items: PrescriptionItem[] },
  fields: Fields,
  lines: Line[],
): boolean {
  for (const k of LIST_FIELDS) if (!sameList(stored[k], fields[k])) return false;
  for (const k of TEXT_FIELDS) if ((stored[k] ?? null) !== (fields[k] ?? null)) return false;
  for (const k of FLAG_FIELDS) if (stored[k] !== (fields[k] ?? false)) return false;
  if (stored.items.length !== lines.length) return false;
  return lines.every((l, i) => {
    const s = stored.items[i];
    return (
      s.drug === l.drug &&
      s.dose === l.dose &&
      s.duration === l.duration &&
      s.instruction === l.instruction &&
      s.order === l.order &&
      s.isNote === (l.isNote ?? false) &&
      (s.sf ?? null) === (l.sf ?? null) &&
      // Nullable on purpose (schema.prisma): absent is null, never false.
      (s.isCont ?? null) === (l.isCont ?? null)
    );
  });
}
