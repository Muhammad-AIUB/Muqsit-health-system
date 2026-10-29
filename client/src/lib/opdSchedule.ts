// The chamber's serial times (physician's sheet, 28/10/2026). Given the day's
// start time, an optional break and the minutes set aside for each patient, the
// Nth patient is told a time: the first at the start, each next one a step later,
// and nobody inside the break — whoever would begin in it goes to its end. A
// patient who begins before the break may run into it: the slot is let to be
// long, and the next one waits for the break to end.
//
//   start 6 PM, break 8–9 PM, 10 minutes: 1st 6:00 · 2nd 6:10 · … · 12th 7:50 · 13th 9:00
//
// Times are minutes since midnight and are worked out, never stored: a changed
// setting moves every time with it. The server keeps the settings
// (`OpdDaySetting`), and refuses what `scheduleProblem` refuses.

export interface OpdSchedule {
  startTime: string; // "HH:mm"
  breakStart: string | null; // "HH:mm", with breakEnd or neither
  breakEnd: string | null;
  minutesPerPatient: number;
}

// The pre-set values the doctor changes when needed: the sheet's own example.
export const DEFAULT_OPD_SCHEDULE: OpdSchedule = {
  startTime: "18:00",
  breakStart: null,
  breakEnd: null,
  minutesPerPatient: 10,
};

export const MIN_MINUTES_PER_PATIENT = 1;
export const MAX_MINUTES_PER_PATIENT = 120;

const DAY_MINUTES = 24 * 60;

/** "HH:mm" as minutes since midnight; `null` for anything else. */
export function parseClock(text: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** What is wrong with a schedule, in the doctor's words — or `null`. */
export function scheduleProblem(s: OpdSchedule): string | null {
  if (parseClock(s.startTime) === null) return "Enter the start time, for example 18:00.";
  const n = s.minutesPerPatient;
  if (!Number.isInteger(n) || n < MIN_MINUTES_PER_PATIENT || n > MAX_MINUTES_PER_PATIENT) {
    return `Time for each patient must be a whole number of minutes, from ${MIN_MINUTES_PER_PATIENT} to ${MAX_MINUTES_PER_PATIENT}.`;
  }
  if (s.breakStart === null && s.breakEnd === null) return null;
  const from = parseClock(s.breakStart);
  const to = parseClock(s.breakEnd);
  if (from === null || to === null) return "A break needs both its start and its end.";
  if (to <= from) return "The break must end after it starts.";
  return null;
}

/** The time of each of `count` serials, in minutes since midnight. A schedule
 *  that cannot be read gives no times — nothing is guessed. */
export function slotTimes(count: number, s: OpdSchedule): number[] {
  if (!(count > 0) || scheduleProblem(s) !== null) return [];
  const start = parseClock(s.startTime) as number;
  const from = s.breakStart === null ? null : (parseClock(s.breakStart) as number);
  const to = s.breakEnd === null ? null : (parseClock(s.breakEnd) as number);
  const outOfBreak = (t: number) => (from !== null && to !== null && t >= from && t < to ? to : t);

  const times: number[] = [];
  let next = outOfBreak(start);
  for (let i = 0; i < count; i++) {
    times.push(next);
    next = outOfBreak(next + s.minutesPerPatient);
  }
  return times;
}

/** `6:00 PM`; past midnight it says so rather than read as the same evening. */
export function clockText(minutes: number): string {
  const nextDay = minutes >= DAY_MINUTES;
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const text = `${h12}:${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
  return nextDay ? `${text} (next day)` : text;
}
