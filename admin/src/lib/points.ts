// The admin's Point system for a doctor (physician's sheet, 16/11/2026): ten
// boxes, each "/10", the admin types a value from 1 to 10 and saves. The server
// (`server/src/admin/point-system.ts`) is what decides; this reads what was TYPED
// so the box can say what is wrong before anything is sent, and never changes it:
// 7.5 is refused, not rounded to 8.

export const POINT_MIN = 1;
export const POINT_MAX = 10;

export type ScoreRead = { ok: true; value: number | null } | { ok: false; problem: string };

export const SCORE_PROBLEM = `A whole number from ${POINT_MIN} to ${POINT_MAX}.`;

/** What was typed in one box. Empty is "not scored" (null) — never 0. */
export function readScoreInput(text: string): ScoreRead {
  const t = text.trim();
  if (t === "") return { ok: true, value: null };
  if (!/^\d{1,2}$/.test(t)) return { ok: false, problem: SCORE_PROBLEM };
  const n = Number(t);
  return n >= POINT_MIN && n <= POINT_MAX ? { ok: true, value: n } : { ok: false, problem: SCORE_PROBLEM };
}

export type ScoresBody =
  | { ok: true; scores: Record<string, number | null> }
  | { ok: false; problems: Record<string, string> };

/** The ten boxes as the body of the save: every criterion, `null` where empty. */
export function buildScoresBody(keys: string[], drafts: Record<string, string>): ScoresBody {
  const scores: Record<string, number | null> = {};
  const problems: Record<string, string> = {};
  for (const key of keys) {
    const r = readScoreInput(drafts[key] ?? "");
    if (r.ok) scores[key] = r.value;
    else problems[key] = r.problem;
  }
  return Object.keys(problems).length ? { ok: false, problems } : { ok: true, scores };
}

/** The saved scores as the boxes show them. */
export function draftsFrom(keys: string[], scores: Record<string, number | undefined>): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, scores[k] === undefined ? "" : String(scores[k])]));
}

/** Whether the boxes hold anything other than what is saved (so Save can be off when nothing changed). */
export function isChanged(keys: string[], drafts: Record<string, string>, saved: Record<string, number | undefined>): boolean {
  return keys.some((k) => {
    const r = readScoreInput(drafts[k] ?? "");
    // a box with a problem is a change (it is not what is saved)
    return !r.ok || (r.value ?? undefined) !== saved[k];
  });
}
