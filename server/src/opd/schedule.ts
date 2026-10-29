// What a day's OPD schedule may be (`OpdDaySetting`). A COPY of the checks in
// `client/src/lib/opdSchedule.ts#scheduleProblem`: the client says what is wrong
// before it sends, this refuses what got through anyway (an old tab, another
// client) — and the message is the one the doctor reads, so both say it the same
// way. `schedule.spec.ts` ⇄ `opdSchedule.test.ts` hold one table of cases:
// edit one, edit both.

export interface OpdSchedule {
  startTime: string; // "HH:mm"
  breakStart: string | null; // "HH:mm", with breakEnd or neither
  breakEnd: string | null;
  minutesPerPatient: number;
}

// What a day with no schedule of its own, and none before it, takes — the
// sheet's own example. A copy of `client/src/lib/opdSchedule.ts`.
export const DEFAULT_OPD_SCHEDULE: OpdSchedule = {
  startTime: '18:00',
  breakStart: null,
  breakEnd: null,
  minutesPerPatient: 10,
};

export const MIN_MINUTES_PER_PATIENT = 1;
export const MAX_MINUTES_PER_PATIENT = 120;

function parseClock(text: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** What is wrong with a schedule, in the doctor's words — or `null`. */
export function scheduleProblem(s: OpdSchedule): string | null {
  if (parseClock(s.startTime) === null) return 'Enter the start time, for example 18:00.';
  const n = s.minutesPerPatient;
  if (!Number.isInteger(n) || n < MIN_MINUTES_PER_PATIENT || n > MAX_MINUTES_PER_PATIENT) {
    return `Time for each patient must be a whole number of minutes, from ${MIN_MINUTES_PER_PATIENT} to ${MAX_MINUTES_PER_PATIENT}.`;
  }
  if (s.breakStart === null && s.breakEnd === null) return null;
  const from = parseClock(s.breakStart);
  const to = parseClock(s.breakEnd);
  if (from === null || to === null) return 'A break needs both its start and its end.';
  if (to <= from) return 'The break must end after it starts.';
  return null;
}
