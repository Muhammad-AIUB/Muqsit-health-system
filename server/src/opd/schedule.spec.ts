import { scheduleProblem, slotTimes, type OpdSchedule } from './schedule';

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

// The cases of `client/src/lib/opdSchedule.test.ts` (slotTimes), copied: the SMS
// tells a patient the time the Print Queue prints. Edit one, edit both.
describe('slotTimes (server copy)', () => {
  const at = (h: number, m: number) => h * 60 + m;
  it("the physician's example: 6:00 PM, every 10 minutes, the break skipped", () => {
    const t = slotTimes(15, sheet);
    expect(t.slice(0, 3)).toEqual([at(18, 0), at(18, 10), at(18, 20)]);
    expect(t[11]).toBe(at(19, 50));
    expect(t.slice(12)).toEqual([at(21, 0), at(21, 10), at(21, 20)]);
  });
  it('a slot that would begin exactly when the break begins goes to its end', () => {
    const t = slotTimes(20, { ...sheet, minutesPerPatient: 15 });
    expect(t[7]).toBe(at(19, 45));
    expect(t[8]).toBe(at(21, 0));
  });
  it('a slot that begins before the break may run into it; the next waits', () => {
    const t = slotTimes(12, { ...sheet, minutesPerPatient: 13 });
    expect(t[9]).toBe(at(19, 57));
    expect(t[10]).toBe(at(21, 0));
    expect(t[11]).toBe(at(21, 13));
  });
  it('a start inside the break begins at its end', () => {
    expect(slotTimes(2, { startTime: '21:00', breakStart: '20:00', breakEnd: '21:00', minutesPerPatient: 10 })).toEqual([at(21, 0), at(21, 10)]);
    expect(slotTimes(2, { ...sheet, startTime: '20:30' })).toEqual([at(21, 0), at(21, 10)]);
  });
  it('no break, and a short break', () => {
    expect(slotTimes(4, { ...sheet, breakStart: null, breakEnd: null })).toEqual([at(18, 0), at(18, 10), at(18, 20), at(18, 30)]);
    expect(slotTimes(3, { startTime: '19:50', breakStart: '20:00', breakEnd: '20:05', minutesPerPatient: 10 })).toEqual([at(19, 50), at(20, 5), at(20, 15)]);
  });
  it('nobody queued, or a schedule that cannot be read: no times', () => {
    expect(slotTimes(0, sheet)).toEqual([]);
    expect(slotTimes(3, { ...sheet, startTime: '6pm' })).toEqual([]);
  });
});
