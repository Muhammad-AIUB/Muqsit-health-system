// Matching keys for a doctor's special advice.
//
// ⚕️ Typography only, never clinical content — the same rule as
// `rx-habits/normalise.ts`, which the medicine key reuses verbatim so that
// "Tablet. Napa 500 mg" and "tab napa 500mg" are one medicine while
// "Tablet. Napa 665 mg" never is. The client mirrors both functions in
// `client/src/lib/rxDrugAdvice.ts`; if the two drift, the worst outcome is
// that saved advice is not offered (a miss), never advice for another drug.

import { normaliseDrugKey } from '../rx-habits/normalise';

export type AdviceScope = 'medicine' | 'generic';
export const ADVICE_SCOPES: readonly AdviceScope[] = ['medicine', 'generic'];

/** A generic name, folded for case and whitespace only. */
export function genericKey(generic: string): string {
  return (generic ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function adviceKey(scope: AdviceScope, label: string): string {
  return scope === 'medicine' ? normaliseDrugKey(label) : genericKey(label);
}

/**
 * The doctor's lines, cleaned for storage: trimmed, blanks dropped, an exact
 * repeat kept once. The words themselves are never changed.
 */
export function cleanLines(lines: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of lines ?? []) {
    if (typeof l !== 'string') continue;
    const t = l.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
