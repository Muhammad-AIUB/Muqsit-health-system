// What a patient's parked visit (the editor snapshot, `Patient.incompleteRx` or a
// supervising practice's `SupervisedDraft.data`) says about how far the doctor has
// got — for the OPD queue's Status. Pure and total: the snapshot is a Json column,
// so every read here is of an `unknown`.
//
// ⚕️ Which fields count is the physician's: "Chief complaints or any data entry"
// is History taken; medicines or investigations written, not yet printed, is
// Prescription pending. The names are the editor snapshot's own
// (client MuqsitContext). Change the lists here, nowhere else.

export type PadStage = 'history' | 'pending' | null;

export const HISTORY_FIELDS = [
  'chiefComplaints',
  'previousComplaints',
  'history',
  'onExamination',
  'note',
  'plan',
  'provisionalDiagnosis',
  'associatedIllness',
  'finalDiagnosis',
  'advice',
  'adviceTest',
] as const;
export const PENDING_FIELDS = ['investigation'] as const;

const filled = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.some(filled);
  if (typeof v === 'string') return v.trim() !== '';
  if (v && typeof v === 'object') return Object.keys(v).length > 0;
  return false;
};

const medicineWritten = (d: Record<string, unknown>): boolean => {
  const items = d.rxItems;
  if (
    Array.isArray(items) &&
    items.some(
      (i) =>
        i && typeof i === 'object' && filled((i as { drug?: unknown }).drug),
    )
  ) {
    return true;
  }
  // A pad line the pad cannot write is held beside the items — still work.
  return Array.isArray(d.rxPadHeld) && d.rxPadHeld.length > 0;
};

// `today` is the Dhaka day, `yyyy-mm-dd`, like the snapshot's `ptDate`. A draft
// of another day is not today's visit (it is parked, not yet reopened), and one
// with no date cannot be told: both say nothing rather than a wrong stage.
export function padStage(draft: unknown, today: string): PadStage {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
  const d = draft as Record<string, unknown>;
  if (d.ptDate !== today) return null;
  if (medicineWritten(d) || PENDING_FIELDS.some((f) => filled(d[f])))
    return 'pending';
  if (HISTORY_FIELDS.some((f) => filled(d[f]))) return 'history';
  return null;
}
