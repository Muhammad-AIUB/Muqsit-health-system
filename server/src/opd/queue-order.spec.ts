import { planMove, renumber, type QueueRow } from './queue-order';

// The OPD queue's order is `position`, and a patient is moved up or down
// (physician's sheet, 28/10/2026). Three things are held here, none needing a
// database:
//   - a patient is swapped with the nearest patient still WAITING in that
//     direction — someone already seen keeps their place in the list;
//   - a patient already seen is not moved;
//   - rows an older build wrote with no position are numbered in the order shown
//     before anything is moved, so the order the doctor saw is the one kept.

const waiting = (id: string, position: number | null): QueueRow => ({ id, position, status: 'waiting' });
const done = (id: string, position: number | null): QueueRow => ({ id, position, status: 'done' });
const apply = (rows: QueueRow[], updates: { id: string; position: number }[]) => {
  const next = new Map(updates.map((u) => [u.id, u.position]));
  return rows
    .map((r) => ({ id: r.id, position: next.get(r.id) ?? r.position }))
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((r) => r.id);
};

describe('planMove', () => {
  const rows = [waiting('a', 1), waiting('b', 2), waiting('c', 3)];

  it('moving up swaps with the one above', () => {
    const plan = planMove(rows, 'c', 'up');
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(apply(rows, plan.updates)).toEqual(['a', 'c', 'b']);
  });

  it('moving down swaps with the one below', () => {
    const plan = planMove(rows, 'a', 'down');
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(apply(rows, plan.updates)).toEqual(['b', 'a', 'c']);
  });

  it('writes only the two rows that changed', () => {
    const plan = planMove(rows, 'c', 'up');
    expect(plan.ok && plan.updates.map((u) => u.id).sort()).toEqual(['b', 'c']);
  });

  it('the first cannot go up and the last cannot go down', () => {
    expect(planMove(rows, 'a', 'up')).toEqual({ ok: false, reason: 'edge' });
    expect(planMove(rows, 'c', 'down')).toEqual({ ok: false, reason: 'edge' });
  });

  it('jumps over a patient already seen, who keeps their place', () => {
    const list = [waiting('a', 1), done('b', 2), waiting('c', 3)];
    const plan = planMove(list, 'c', 'up');
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(apply(list, plan.updates)).toEqual(['c', 'b', 'a']);
  });

  it('a patient already seen is not moved', () => {
    expect(planMove([waiting('a', 1), done('b', 2)], 'b', 'up')).toEqual({ ok: false, reason: 'done' });
  });

  it('with only seen patients above, a waiting patient is at the edge', () => {
    expect(planMove([done('a', 1), waiting('b', 2)], 'b', 'up')).toEqual({ ok: false, reason: 'edge' });
  });

  it('an unknown id is not found', () => {
    expect(planMove(rows, 'zzz', 'up')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('numbers rows with no position in the order shown, then moves', () => {
    // Rows an older build wrote: the order shown is the order given.
    const list = [waiting('a', null), waiting('b', null), waiting('c', null)];
    const plan = planMove(list, 'c', 'up');
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(apply(list, plan.updates)).toEqual(['a', 'c', 'b']);
      // Every row now has a position: all three are written.
      expect(plan.updates.map((u) => u.id).sort()).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('renumber', () => {
  it('rows already numbered 1..n need no writes', () => {
    expect(renumber([waiting('a', 1), waiting('b', 2)])).toEqual([]);
  });

  it('closes a gap, keeping the order', () => {
    expect(renumber([waiting('a', 1), waiting('b', 5)])).toEqual([{ id: 'b', position: 2 }]);
  });

  it('numbers rows that have none, in the order given', () => {
    expect(renumber([waiting('a', null), waiting('b', null)])).toEqual([
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('nothing queued, nothing to write', () => {
    expect(renumber([])).toEqual([]);
  });
});
