import { scheduleProblem, type OpdSchedule } from './schedule';

// A mirror of `client/src/lib/opdSchedule.ts#scheduleProblem`: the client says
// what is wrong before it sends, the server refuses what the client let through
// (an old tab, another client). The two must agree, word for word — the box a
// doctor reads is the server's answer — so both specs hold ONE table of cases.
// Edit one, edit both.

const sheet: OpdSchedule = { startTime: '18:00', breakStart: '20:00', breakEnd: '21:00', minutesPerPatient: 10 };

const SHARED_CASES: Array<[string, OpdSchedule, string | null]> = [
  ['the physician\'s sheet', sheet, null],
  ['no break', { ...sheet, breakStart: null, breakEnd: null }, null],
  ['a break with no end', { ...sheet, breakEnd: null }, 'A break needs both its start and its end.'],
  ['a break with no start', { ...sheet, breakStart: null }, 'A break needs both its start and its end.'],
  ['a break that ends where it starts', { ...sheet, breakStart: '20:00', breakEnd: '20:00' }, 'The break must end after it starts.'],
  ['a break that ends before it starts', { ...sheet, breakStart: '21:00', breakEnd: '20:00' }, 'The break must end after it starts.'],
  ['a break that is not a time', { ...sheet, breakStart: '8pm' }, 'A break needs both its start and its end.'],
  ['an empty start', { ...sheet, startTime: '' }, 'Enter the start time, for example 18:00.'],
  ['a start that is not a time', { ...sheet, startTime: '25:00' }, 'Enter the start time, for example 18:00.'],
  ['0 minutes', { ...sheet, minutesPerPatient: 0 }, 'Time for each patient must be a whole number of minutes, from 1 to 120.'],
  ['121 minutes', { ...sheet, minutesPerPatient: 121 }, 'Time for each patient must be a whole number of minutes, from 1 to 120.'],
  ['2.5 minutes', { ...sheet, minutesPerPatient: 2.5 }, 'Time for each patient must be a whole number of minutes, from 1 to 120.'],
  ['1 minute', { ...sheet, minutesPerPatient: 1 }, null],
  ['120 minutes', { ...sheet, minutesPerPatient: 120 }, null],
];

describe('scheduleProblem (server copy)', () => {
  it.each(SHARED_CASES)('%s', (_name, schedule, problem) => {
    expect(scheduleProblem(schedule)).toBe(problem);
  });
});
