// ⚕️ The patient's shared on-examination history: `{date, text, by?}` entries,
// the shape `client/src/lib/onExaminationSummary.ts` reads. Pure, so the append
// rule is pinned without a database (`on-examination.spec.ts`).

// The identity of an entry — the client's `oeKey`: the visit date and the text
// with case and outer spacing set aside. The author is NOT part of it: the same
// finding on the same date is one finding, whoever wrote it first.
export const oeKey = (date: unknown, text: unknown): string =>
  `${String(date ?? '')}|${String(text ?? '').trim().toLowerCase()}`;

// Appends what is new; every stored entry is kept exactly as stored (an entry
// that is not an object, or has no `by`, is passed through untouched). Blank
// text is never written. `by` is put on the new entries only, and only when
// there is a name to put.
export function appendOeEntries(
  stored: unknown[],
  additions: Array<{ date: string; text: string }>,
  by: string,
): unknown[] {
  const seen = new Set<string>();
  for (const e of stored) {
    if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>;
      seen.add(oeKey(o.date, o.text));
    }
  }
  const out = [...stored];
  for (const a of additions) {
    const text = a.text.trim();
    if (!text) continue;
    const k = oeKey(a.date, text);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(by ? { date: a.date, text, by } : { date: a.date, text });
  }
  return out;
}
