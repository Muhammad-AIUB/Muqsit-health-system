// Moving a line up or down the ℞ pad (physician's request, 2026-09-23): by drag
// on its serial number, or ▲ / ▼ while ✎ Edit is on. Both go through
// `moveBlock`, one neighbouring block per step — a drag takes one step each
// time the pointer passes a neighbour's middle (see MedicinePad's dragStep).
//
// ⚕️ What moves is a BLOCK, never a single row: a medicine together with its
// ">>>" tapering lines. A taper row carries no drug name of its own — it
// continues the medicine above it — so moving it alone would silently hand its
// dose to whichever medicine it landed under. A note line is a block of one.
// The trailing empty "start typing" row is not a line and never moves, and
// nothing ever lands after it.
//
// Nothing is edited: every row keeps every field, only the order changes.
// Pinned in rxRowMove.test.ts.

export interface MovableRow {
  drug: string;
  dose: string;
  food: string;
  duration: string;
  isMedicine: boolean;
  continuation: boolean;
}

const isBlank = (r: MovableRow) => !r.drug.trim() && !r.dose.trim() && !r.food.trim() && !r.duration.trim();

/** Rows [0, limit) can move; the trailing blank typing row (if any) cannot. */
function movableLimit(rows: MovableRow[]): number {
  return rows.length > 0 && isBlank(rows[rows.length - 1]) && !rows[rows.length - 1].continuation
    ? rows.length - 1
    : rows.length;
}

/** The block containing row `idx`, as [start, end). null for the typing row. */
export function blockOf(rows: MovableRow[], idx: number): [number, number] | null {
  const limit = movableLimit(rows);
  if (idx < 0 || idx >= limit) return null;
  let start = idx;
  while (start > 0 && rows[start].continuation) start -= 1;
  let end = start + 1;
  while (end < limit && rows[end].continuation) end += 1;
  return [start, end];
}

/** Can the block holding `idx` go one place up (-1) or down (+1)? */
export function canMove(rows: MovableRow[], idx: number, dir: -1 | 1): boolean {
  const b = blockOf(rows, idx);
  if (!b) return false;
  return dir < 0 ? b[0] > 0 : b[1] < movableLimit(rows);
}

/** Swap the block holding `idx` with its neighbour block. Unchanged if it can't. */
export function moveBlock<T extends MovableRow>(rows: T[], idx: number, dir: -1 | 1): T[] {
  const b = blockOf(rows, idx);
  if (!b || !canMove(rows, idx, dir)) return rows;
  const other = blockOf(rows, dir < 0 ? b[0] - 1 : b[1]);
  if (!other) return rows;
  const [first, second] = dir < 0 ? [other, b] : [b, other];
  return [
    ...rows.slice(0, first[0]),
    ...rows.slice(second[0], second[1]),
    ...rows.slice(first[0], first[1]),
    ...rows.slice(second[1]),
  ];
}

