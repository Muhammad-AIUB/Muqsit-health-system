// ⚕️ Changing ONE medicine of a patient's drug history in place (physician's
// sheet, 07/11/2026: "Edit option add hobe … date duration edit kora jabe").
//
// Until this sheet the drug history only grew: lines were APPENDED
// (`POST /patients/:id/drug-history`) and nothing stored was ever rewritten. The
// physician asked for a start date and a duration that can be put right, so this
// is the one door that changes a stored line — and it is built to be as narrow
// as the request:
//
//   • it replaces a BLOCK — a medicine line and the tapering lines under it —
//     named by its exact stored text, found by that text and not by a position a
//     client read earlier (the list a client holds is one device's copy);
//   • the new block has the same number of lines, each the same KIND as the line
//     it replaces (a medicine stays a medicine, a taper a taper; a note is never
//     touched), and every cell but the last (the duration) is the same
//     character for character: the name, the dose and the food cannot change
//     through it, and nothing can be added or taken away;
//   • the date of every line is a real calendar date, the same for the whole
//     block (a taper never moves to another visit's date).
//
// Pure — `patients.service.ts#replaceDrugHistoryBlock` does the locking and the
// write. The client's reading of the same format is `client/src/lib/drugCourse.ts`
// (a copy, pinned by a table of cases in both specs: edit one, edit both).

export const CELL_SEP = ' — ';

const DATED = /^(\d{2})\/(\d{2})\/(\d{4})(\(note\)|\(cont\))?:\s*(.*)$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;
export const MAX_BLOCK_LINES = 50;

interface Line { date: string; marker: '' | '(note)' | '(cont)'; cells: string[]; width: number; }

function readLine(raw: unknown): Line | null {
  if (typeof raw !== 'string') return null;
  const m = DATED.exec(raw);
  if (!m) return null;
  const marker = (m[4] ?? '') as Line['marker'];
  const width = marker === '(cont)' ? 3 : 4;
  const cells = m[5].split(CELL_SEP);
  if (marker === '(note)' || cells.length > width) return null;
  while (cells.length < width) cells.push('');
  return { date: `${m[1]}/${m[2]}/${m[3]}`, marker, cells, width };
}

function realDate(date: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!m) return false;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/**
 * Why `to` may not replace `from`, in words for a doctor — or null when it may.
 * (A note, a line that is not in the `dd/mm/yyyy: …` format, a changed name,
 * dose or food, a different number of lines, a date that is not on the calendar.)
 */
export function blockEditProblem(from: unknown, to: unknown): string | null {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length === 0 || from.length > MAX_BLOCK_LINES) {
    return 'There is nothing to change.';
  }
  if (from.length !== to.length) return 'A change of date or duration cannot add a line or take one away.';
  let newDate = '';
  for (let i = 0; i < from.length; i++) {
    const a = readLine(from[i]);
    const b = readLine(to[i]);
    if (!a || !b) return 'Only a medicine written with its date can be changed here — not a note or an older line.';
    const wantMarker: Line['marker'] = i === 0 ? '' : '(cont)';
    if (a.marker !== wantMarker || b.marker !== wantMarker) return 'The change must keep each line the kind it was: the medicine first, its tapering lines under it.';
    for (let c = 0; c < a.width - 1; c++) {
      if (a.cells[c] !== b.cells[c]) return 'Only the date and the duration can be changed here, not the name, the dose or the food.';
    }
    if (i === 0) newDate = b.date;
    else if (b.date !== newDate) return 'Every line of a medicine must carry the same date.';
  }
  if (!realDate(newDate)) return 'That date is not on the calendar.';
  return null;
}

/** Where `block` stands in `stored` — the first place all its lines are, in order, exactly — or -1. */
export function findBlock(stored: unknown[], block: string[]): number {
  for (let at = 0; at + block.length <= stored.length; at++) {
    let same = true;
    for (let i = 0; i < block.length; i++) {
      if (stored[at + i] !== block[i]) { same = false; break; }
    }
    if (same) return at;
  }
  return -1;
}
