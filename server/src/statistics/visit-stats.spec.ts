import {
  countDaysInclusive,
  countMonthsInclusive,
  daysOfMonth,
  fillDays,
  fillMonths,
  foldDiagnosis,
  isMonthKey,
  isYearKey,
  monthOf,
  monthsOfYear,
  overallFigures,
  previousMonth,
  rankDiagnoses,
} from './visit-stats';

// The arithmetic behind Settings → Statistics (physician's sheet, 11/11/2026).
// Pure: no database, no clock. Which visit counts as "seen" is decided in the
// query (statistics.service.ts); the figures below only add up what it gives.

describe('month and year keys', () => {
  it('accepts a real month written yyyy-mm, and nothing else', () => {
    for (const ok of ['2026-11', '2026-01', '2026-12', '2000-06']) expect(isMonthKey(ok)).toBe(true);
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-11', '2026/11', '2026-11-01', 'November', '', undefined, null, 202611]) {
      expect(isMonthKey(bad)).toBe(false);
    }
  });

  it('accepts a four-digit year in the range the app dates allow', () => {
    for (const ok of ['2026', '1900', '2200']) expect(isYearKey(ok)).toBe(true);
    for (const bad of ['26', '20261', '1899', '2201', 'abcd', '', undefined, null, 2026]) expect(isYearKey(bad)).toBe(false);
  });
});

describe('days and months of a period', () => {
  it('lists every day of a month, in order, with the leap day', () => {
    const nov = daysOfMonth('2026-11');
    expect(nov).toHaveLength(30);
    expect(nov[0]).toBe('2026-11-01');
    expect(nov[29]).toBe('2026-11-30');
    expect(daysOfMonth('2026-12')).toHaveLength(31);
    expect(daysOfMonth('2026-02')).toHaveLength(28);
    expect(daysOfMonth('2028-02')).toHaveLength(29);
    expect(daysOfMonth('2028-02')[28]).toBe('2028-02-29');
  });

  it('lists the twelve months of a year', () => {
    const months = monthsOfYear('2026');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2026-01');
    expect(months[11]).toBe('2026-12');
  });

  it('names the month of a day and the month before one', () => {
    expect(monthOf('2026-11-15')).toBe('2026-11');
    expect(previousMonth('2026-11')).toBe('2026-10');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('counts calendar days and months from the first one to the last, both included', () => {
    expect(countDaysInclusive('2026-11-15', '2026-11-15')).toBe(1);
    expect(countDaysInclusive('2026-11-01', '2026-11-30')).toBe(30);
    // across a month end and a year end, with a leap day
    expect(countDaysInclusive('2027-12-31', '2028-03-01')).toBe(1 + 31 + 29 + 1);
    expect(countMonthsInclusive('2026-11', '2026-11')).toBe(1);
    expect(countMonthsInclusive('2025-11', '2026-11')).toBe(13);
    expect(countMonthsInclusive('2026-01', '2026-12')).toBe(12);
  });
});

describe('fillDays / fillMonths', () => {
  it('gives every day of the month — a day with no visit is 0 and 0, never left out', () => {
    const days = fillDays('2026-11', [
      { day: '2026-11-03', total: 12, seen: 9 },
      { day: '2026-11-30', total: 4, seen: 4 },
    ]);
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ day: '2026-11-01', total: 0, seen: 0 });
    expect(days[2]).toEqual({ day: '2026-11-03', total: 12, seen: 9 });
    expect(days[29]).toEqual({ day: '2026-11-30', total: 4, seen: 4 });
  });

  it('puts a row nowhere else than on its own day, and drops a row of another month', () => {
    const days = fillDays('2026-11', [{ day: '2026-10-31', total: 5, seen: 5 }]);
    expect(days.reduce((n, d) => n + d.total, 0)).toBe(0);
  });

  it('gives all twelve months, zero-filled', () => {
    const months = fillMonths('2026', [
      { month: '2026-01', total: 3564, seen: 3000 },
      { month: '2026-09', total: 2389, seen: 2300 },
    ]);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: '2026-01', total: 3564, seen: 3000 });
    expect(months[1]).toEqual({ month: '2026-02', total: 0, seen: 0 });
    expect(months[8]).toEqual({ month: '2026-09', total: 2389, seen: 2300 });
  });
});

describe('overallFigures (calendar averages, physician 11/11/2026)', () => {
  // 15/11/2026 is "today". The first seen visit was on 01/11/2026: 15 calendar
  // days, 1 calendar month.
  const today = '2026-11-15';

  it('Total visit, this month and the previous month are the counts given', () => {
    const o = overallFigures({ seenTotal: 300, firstSeenDay: '2026-09-01', thisMonth: 40, previousMonth: 120 }, today);
    expect(o.totalVisits).toBe(300);
    expect(o.thisMonth).toBe(40);
    expect(o.previousMonth).toBe(120);
  });

  it('says which Dhaka day it was counted on, so the screen names "this month" from the server\'s clock', () => {
    expect(overallFigures({ seenTotal: 0, firstSeenDay: null, thisMonth: 0, previousMonth: 0 }, today).today).toBe(today);
  });

  it('average daily = seen ÷ every calendar day from the first seen visit to today, closed days too', () => {
    // 01/09 .. 15/11/2026 = 30 + 31 + 15 = 76 days
    const o = overallFigures({ seenTotal: 760, firstSeenDay: '2026-09-01', thisMonth: 0, previousMonth: 0 }, today);
    expect(o.days).toBe(76);
    expect(o.averageDaily).toBe(10);
  });

  it('average monthly = seen ÷ every calendar month from the first seen visit\'s month to this one, this month included', () => {
    // Sep, Oct, Nov = 3 months
    const o = overallFigures({ seenTotal: 300, firstSeenDay: '2026-09-20', thisMonth: 0, previousMonth: 0 }, today);
    expect(o.months).toBe(3);
    expect(o.averageMonthly).toBe(100);
  });

  it('is rounded to one decimal place, and only the average', () => {
    const o = overallFigures({ seenTotal: 10, firstSeenDay: '2026-11-13', thisMonth: 10, previousMonth: 0 }, today); // 3 days, 1 month
    expect(o.averageDaily).toBe(3.3);
    expect(o.averageMonthly).toBe(10);
    expect(o.totalVisits).toBe(10);
  });

  it('nobody seen yet: the counts are 0 and the averages are null — never 0 and never a division by nothing', () => {
    const o = overallFigures({ seenTotal: 0, firstSeenDay: null, thisMonth: 0, previousMonth: 0 }, today);
    expect(o.totalVisits).toBe(0);
    expect(o.averageDaily).toBeNull();
    expect(o.averageMonthly).toBeNull();
    expect(o.firstSeenDay).toBeNull();
  });

  it('a first seen visit dated after today (a clock or a row out of step) gives no average, not a negative one', () => {
    const o = overallFigures({ seenTotal: 2, firstSeenDay: '2026-11-20', thisMonth: 2, previousMonth: 0 }, today);
    expect(o.averageDaily).toBeNull();
    expect(o.averageMonthly).toBeNull();
  });
});

describe('foldDiagnosis — only capitals and spacing are set aside', () => {
  it('reads DM, dm and  Dm  as one, and a trailing space away', () => {
    expect(foldDiagnosis('DM')).toBe('dm');
    expect(foldDiagnosis('  Dm ')).toBe('dm');
    expect(foldDiagnosis('Chronic   Kidney\tDisease')).toBe('chronic kidney disease');
  });

  it('never reads two names as one: DM is not Diabetes mellitus, T2DM is not DM, a number or a unit stays', () => {
    const keys = ['DM', 'Diabetes mellitus', 'T2DM', 'DM type 2', 'HTN', 'CKD stage 3', 'CKD stage 4', 'CLD', 'CLD (Child B)'].map(foldDiagnosis);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a blank name is nothing', () => {
    expect(foldDiagnosis('')).toBe('');
    expect(foldDiagnosis('   ')).toBe('');
  });
});

describe('rankDiagnoses — one count per patient', () => {
  const row = (patientId: string, name: string, at: string) => ({ patientId, name, createdAt: new Date(at) });

  it('counts a patient once for a diagnosis however many prescriptions carry it', () => {
    const out = rankDiagnoses([
      row('p1', 'DM', '2026-01-01T00:00:00Z'),
      row('p1', 'DM', '2026-02-01T00:00:00Z'),
      row('p1', 'DM', '2026-03-01T00:00:00Z'),
      row('p2', 'DM', '2026-03-01T00:00:00Z'),
    ]);
    expect(out).toEqual([{ name: 'DM', patients: 2 }]);
  });

  it('writing the same name in another case or spacing is the same diagnosis, and a patient with both is one', () => {
    const out = rankDiagnoses([
      row('p1', 'dm', '2026-01-01T00:00:00Z'),
      row('p1', ' DM ', '2026-02-01T00:00:00Z'),
      row('p2', 'Dm', '2026-02-02T00:00:00Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].patients).toBe(2);
  });

  it('shows the wording of the NEWEST prescription that carries it, as written', () => {
    const out = rankDiagnoses([
      row('p1', 'chronic liver disease', '2026-01-01T00:00:00Z'),
      row('p2', 'Chronic Liver Disease', '2026-05-01T00:00:00Z'),
      row('p3', 'chronic liver  disease', '2026-03-01T00:00:00Z'),
    ]);
    expect(out[0].name).toBe('Chronic Liver Disease');
  });

  it('the most patients first, then A to Z, and a diagnosis that merely looks alike stays apart', () => {
    const out = rankDiagnoses([
      row('p1', 'HTN', '2026-01-01T00:00:00Z'),
      row('p2', 'HTN', '2026-01-01T00:00:00Z'),
      row('p3', 'HTN', '2026-01-01T00:00:00Z'),
      row('p1', 'DM', '2026-01-01T00:00:00Z'),
      row('p2', 'Cirrhosis', '2026-01-01T00:00:00Z'),
      row('p4', 'Diabetes mellitus', '2026-01-01T00:00:00Z'),
    ]);
    expect(out.map((d) => [d.name, d.patients])).toEqual([
      ['HTN', 3],
      ['Cirrhosis', 1],
      ['Diabetes mellitus', 1],
      ['DM', 1],
    ]);
  });

  it('a blank line is not a diagnosis', () => {
    expect(rankDiagnoses([row('p1', '   ', '2026-01-01T00:00:00Z'), row('p2', '', '2026-01-01T00:00:00Z')])).toEqual([]);
  });

  it('a diagnosis is shown whole, never cut or reworded', () => {
    const long = 'Decompensated chronic liver disease (Child-Pugh B) with ascites, on diuretics';
    expect(rankDiagnoses([row('p1', long, '2026-01-01T00:00:00Z')])[0].name).toBe(long);
  });
});
