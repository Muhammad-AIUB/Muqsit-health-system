// The admin's Point system for a doctor (physician's sheet, 16/11/2026): ten
// criteria, each given a value from 1 to 10 by the admin and kept. The ten names
// and their order are the sheet's, word for word. Pure, so it is pinned without a
// database (`point-system.spec.ts`).

export const POINT_CRITERIA = [
  { key: 'integrity', label: 'Integrity and honesty' },
  { key: 'academic', label: 'Academic knowledge' },
  { key: 'clinical', label: 'Clinical competence' },
  { key: 'communication', label: 'Communication' },
  { key: 'professionalism', label: 'Professionalism' },
  { key: 'empathy', label: 'Empathy and behaviour' },
  { key: 'maturity', label: 'Clinical maturity' },
  { key: 'teamwork', label: 'Teamwork and leadership' },
  { key: 'accountability', label: 'Accountability' },
  { key: 'financial', label: 'Financial ethics' },
] as const;

export type PointKey = (typeof POINT_CRITERIA)[number]['key'];
/** A criterion the admin has not scored is simply absent — never 0. */
export type PointScores = Partial<Record<PointKey, number>>;

export const POINT_MIN = 1;
export const POINT_MAX = 10;

const LABEL = new Map<string, string>(POINT_CRITERIA.map((c) => [c.key, c.label]));

export const isPointKey = (k: string): k is PointKey => LABEL.has(k);
export const isPointValue = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= POINT_MIN && v <= POINT_MAX;

/**
 * The scores as the database holds them, read for display. Tolerant on purpose:
 * a key or value that is not a criterion's (an edit by hand, an older shape) is
 * left out of what is shown, never thrown at the admin as a 500 and never
 * rewritten. What is left out is not what is stored — the next save replaces it.
 */
export function readStoredScores(json: unknown): PointScores {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return {};
  const out: PointScores = {};
  for (const c of POINT_CRITERIA) {
    const v = (json as Record<string, unknown>)[c.key];
    if (isPointValue(v)) out[c.key] = v;
  }
  return out;
}

export type ScoresVerdict = { ok: true; scores: PointScores } | { ok: false; problem: string };

/**
 * What the admin sent, checked into the set that is stored. The save is the WHOLE
 * set: a criterion that is absent or `null` is cleared. Nothing is rounded or
 * clamped — 7.5, 0, 11, "7", true and NaN are refused with the criterion named,
 * so that what is kept is exactly what the admin typed.
 */
export function checkScores(input: unknown): ScoresVerdict {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, problem: 'Send the scores as an object: { criterion: value }.' };
  }
  const scores: PointScores = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isPointKey(key)) return { ok: false, problem: `"${key}" is not one of the ten criteria.` };
    if (value === null) continue; // cleared
    if (!isPointValue(value)) {
      return { ok: false, problem: `${LABEL.get(key)} must be a whole number from ${POINT_MIN} to ${POINT_MAX}.` };
    }
    scores[key] = value;
  }
  return { ok: true, scores };
}
