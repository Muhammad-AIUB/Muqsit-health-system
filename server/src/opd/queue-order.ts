// The order of one day's OPD queue (`OpdVisit.position`), worked out without a
// database so it can be tested on its own. The service reads the day's rows in
// the order shown (position, then arrival; a row an older build wrote with no
// position comes last), asks for a plan, and writes only what the plan lists —
// all under the queue's lock, so two moves never plan from the same list.

export interface QueueRow {
  id: string;
  position: number | null;
  status: string; // waiting | done
}

export interface PositionUpdate {
  id: string;
  position: number;
}

export type MovePlan =
  | { ok: true; updates: PositionUpdate[] }
  | { ok: false; reason: 'not-found' | 'done' | 'edge' };

/** Numbers the rows 1, 2, 3 … in the order given; lists only those whose
 *  position is not already that. A closed gap or a row with no position is
 *  repaired, and a queue already in order writes nothing. */
export function renumber(rows: QueueRow[]): PositionUpdate[] {
  const updates: PositionUpdate[] = [];
  rows.forEach((row, i) => {
    if (row.position !== i + 1) updates.push({ id: row.id, position: i + 1 });
  });
  return updates;
}

/** Moves one patient a place up or down: they swap places with the nearest
 *  patient still WAITING in that direction. Someone already seen keeps their
 *  place in the list, and is not moved. `rows` is the day's queue in the order
 *  shown. */
export function planMove(rows: QueueRow[], id: string, direction: 'up' | 'down'): MovePlan {
  const from = rows.findIndex((r) => r.id === id);
  if (from < 0) return { ok: false, reason: 'not-found' };
  if (rows[from].status === 'done') return { ok: false, reason: 'done' };

  const step = direction === 'up' ? -1 : 1;
  let to = from + step;
  while (to >= 0 && to < rows.length && rows[to].status === 'done') to += step;
  if (to < 0 || to >= rows.length) return { ok: false, reason: 'edge' };

  const order = rows.slice();
  [order[from], order[to]] = [order[to], order[from]];
  return { ok: true, updates: renumber(order) };
}
