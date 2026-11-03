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
      // A removed entry is not "already there": the same words written again
      // after a removal are a new entry, never silently dropped (02/11/2026).
      if (isRemoved(o)) continue;
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

// ── Disease / Surgical history (physician's sheet 28/10/2026, item 7) ─────
// The prescription sidebar's History block keeps the patient's Disease history
// and Surgical / intervention history as entries of this same list, written
// `Disease Hx: <text>` / `Surgical Hx: <text>` — the lines the On-examination
// popup wrote before it, so every entry recorded there reads back unchanged.
// They are removed SOFTLY: the entry stays, stamped `removedAt` / `removedBy`,
// and every reader leaves it out; Undo takes the stamp off again.

export type HxKind = 'disease' | 'surgical';
export const HX_PREFIX: Record<HxKind, string> = { disease: 'Disease Hx:', surgical: 'Surgical Hx:' };

export const isRemoved = (o: Record<string, unknown>): boolean =>
  typeof o.removedAt === 'string' && o.removedAt.length > 0;

// The identity of a history entry — the client's (`lib/patientRecords.ts`):
// the words after the label, case and outer spacing aside. The visit date is
// NOT part of it: the same history written at two visits is one entry, and
// taking it off takes off every copy of it.
const hxKey = (text: unknown): string => String(text ?? '').trim().toLowerCase();

function hxMatches(e: unknown, kind: HxKind, key: string): e is Record<string, unknown> {
  if (!e || typeof e !== 'object') return false;
  const t = (e as Record<string, unknown>).text;
  if (typeof t !== 'string' || !t.startsWith(HX_PREFIX[kind])) return false;
  return hxKey(t.slice(HX_PREFIX[kind].length)) === key;
}

/**
 * Marks every entry of one history item removed (`removed` given) or takes the
 * mark off again (`removed` null). Every other entry is kept exactly as stored.
 * `changed` is how many entries were marked or unmarked — 0 means there was
 * nothing to do, which the caller says rather than pretend it happened.
 */
export function setHxRemoved(
  stored: unknown[],
  kind: HxKind,
  text: string,
  removed: { at: string; by: string } | null,
): { next: unknown[]; changed: number } {
  const key = hxKey(text);
  let changed = 0;
  const next = stored.map((e) => {
    if (!key || !hxMatches(e, kind, key)) return e;
    if (removed && !isRemoved(e)) {
      changed++;
      return { ...e, removedAt: removed.at, ...(removed.by ? { removedBy: removed.by } : {}) };
    }
    if (!removed && isRemoved(e)) {
      changed++;
      const { removedAt: _a, removedBy: _b, ...kept } = e;
      void _a; void _b;
      return kept;
    }
    return e;
  });
  return { next, changed };
}
