import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StatisticsService } from './statistics.service';

// What each Statistics question asks the database, and what it does with the
// answer. The rows themselves are the database's (the SQL is run for real in
// `test/statistics.int-spec.ts`); here the mock is asked WHICH question was put —
// whose practice, which chamber, which rule for "seen" — and the answer is
// checked to be laid out as the chart needs it.

type Sql = Prisma.Sql;

function build(answers: unknown[] = []) {
  const queryRaw = jest.fn();
  for (const a of answers) queryRaw.mockResolvedValueOnce(a);
  queryRaw.mockResolvedValue([]);
  return { queryRaw, service: new StatisticsService({ $queryRaw: queryRaw } as never) };
}

// The Sql object the service handed to `$queryRaw`.
const asked = (queryRaw: jest.Mock, call = 0): Sql => queryRaw.mock.calls[call][0] as Sql;
// `.text` is the Postgres form the driver receives ($1, $2 …); `.sql` is the MySQL one.
const flat = (s: Sql) => s.text.replace(/\s+/g, ' ');

// 15/11/2026, midday in Dhaka.
const NOW = new Date('2026-11-15T06:00:00Z');

describe('StatisticsService.visitsByDay', () => {
  it('asks for THIS practice only, and for all chambers when none is named', async () => {
    const { queryRaw, service } = build([[]]);
    await service.visitsByDay('doc-1', { kind: 'all' }, '2026-11', NOW);
    const q = asked(queryRaw);
    expect(q.values).toContain('doc-1');
    expect(flat(q)).toContain('"doctorId" = $');
    expect(flat(q)).not.toContain('"chamberId"');
  });

  it('asks for one chamber by its id', async () => {
    const { queryRaw, service } = build([[]]);
    await service.visitsByDay('doc-1', { kind: 'one', chamberId: 'ch-9' }, '2026-11', NOW);
    const q = asked(queryRaw);
    expect(q.values).toContain('ch-9');
    expect(flat(q)).toContain('"chamberId" = $');
  });

  it('asks for the default chamber as "no chamber" — that is how its visits are stored', async () => {
    const { queryRaw, service } = build([[]]);
    await service.visitsByDay('doc-1', { kind: 'one', chamberId: null }, '2026-11', NOW);
    expect(flat(asked(queryRaw))).toContain('"chamberId" IS NULL');
  });

  it('⚕️ counts a visit as seen when Done was pressed OR the prescription was printed — the Completed card\'s rule', async () => {
    const { queryRaw, service } = build([[]]);
    await service.visitsByDay('doc-1', { kind: 'all' }, '2026-11', NOW);
    const q = flat(asked(queryRaw));
    expect(q).toContain(`"status" = 'done'`);
    expect(q).toContain(`COALESCE("rxStatus", '') = 'complete'`);
  });

  it('files a visit under its queue day, and a row from before queue days under the Dhaka day it was created', async () => {
    const { queryRaw, service } = build([[]]);
    await service.visitsByDay('doc-1', { kind: 'all' }, '2026-11', NOW);
    const q = flat(asked(queryRaw));
    expect(q).toContain(`COALESCE("queueDate", to_char("createdAt" + interval '6 hours', 'YYYY-MM-DD'))`);
  });

  it('bounds the month by text — the first and the last day it can hold', async () => {
    const { queryRaw, service } = build([[]]);
    await service.visitsByDay('doc-1', { kind: 'all' }, '2026-11', NOW);
    expect(asked(queryRaw).values).toEqual(expect.arrayContaining(['2026-11-01', '2026-11-31']));
  });

  it('lays out every day of the month, with 0 and 0 for a day nobody was booked', async () => {
    const { service } = build([[{ day: '2026-11-03', total: 12, seen: 9 }]]);
    const out = await service.visitsByDay('doc-1', { kind: 'all' }, '2026-11', NOW);
    expect(out.month).toBe('2026-11');
    expect(out.days).toHaveLength(30);
    expect(out.days[2]).toEqual({ day: '2026-11-03', total: 12, seen: 9 });
    expect(out.days[3]).toEqual({ day: '2026-11-04', total: 0, seen: 0 });
  });

  it('no month named is the current Dhaka month — also in the first hours of the 1st, when the server\'s own clock is still in the old month', async () => {
    const { service } = build([[]]);
    expect((await service.visitsByDay('doc-1', { kind: 'all' }, undefined, new Date('2026-10-31T20:00:00Z'))).month).toBe('2026-11');
    expect((await service.visitsByDay('doc-1', { kind: 'all' }, undefined, new Date('2026-11-30T17:59:00Z'))).month).toBe('2026-11');
    expect((await service.visitsByDay('doc-1', { kind: 'all' }, undefined, new Date('2026-11-30T18:00:00Z'))).month).toBe('2026-12');
  });

  it('refuses a month that is not one, before asking the database anything', async () => {
    const { queryRaw, service } = build();
    for (const bad of ['2026-13', '2026-11-05', 'nov', '', '2026-1']) {
      await expect(service.visitsByDay('doc-1', { kind: 'all' }, bad, NOW)).rejects.toThrow(BadRequestException);
    }
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('StatisticsService.visitsByMonth', () => {
  it('lays out the twelve months of the year, and asks for that year only', async () => {
    const { queryRaw, service } = build([[{ month: '2026-09', total: 2389, seen: 2300 }]]);
    const out = await service.visitsByMonth('doc-1', { kind: 'all' }, '2026', NOW);
    expect(out.year).toBe('2026');
    expect(out.months).toHaveLength(12);
    expect(out.months[8]).toEqual({ month: '2026-09', total: 2389, seen: 2300 });
    expect(out.months[0]).toEqual({ month: '2026-01', total: 0, seen: 0 });
    expect(asked(queryRaw).values).toEqual(expect.arrayContaining(['doc-1', '2026-01-01', '2026-12-31']));
  });

  it('no year named is the current Dhaka year', async () => {
    const { service } = build([[]]);
    expect((await service.visitsByMonth('doc-1', { kind: 'all' }, undefined, new Date('2026-12-31T20:00:00Z'))).year).toBe('2027');
  });

  it('refuses a year that is not one', async () => {
    const { queryRaw, service } = build();
    for (const bad of ['26', '20261', 'abcd', '1800']) {
      await expect(service.visitsByMonth('doc-1', { kind: 'all' }, bad, NOW)).rejects.toThrow(BadRequestException);
    }
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('StatisticsService.overall', () => {
  it('asks for this month up to today, and for the month before it', async () => {
    const { queryRaw, service } = build([[{ seenTotal: 0, firstSeenDay: null, thisMonth: 0, previousMonth: 0 }]]);
    await service.overall('doc-1', { kind: 'all' }, NOW);
    expect(asked(queryRaw).values).toEqual(expect.arrayContaining(['doc-1', '2026-11-01', '2026-11-15', '2026-10-01']));
  });

  it('turns the answer into the figures, with the calendar averages', async () => {
    const { service } = build([[{ seenTotal: 760, firstSeenDay: '2026-09-01', thisMonth: 40, previousMonth: 120 }]]);
    const o = await service.overall('doc-1', { kind: 'all' }, NOW);
    expect(o).toMatchObject({ totalVisits: 760, thisMonth: 40, previousMonth: 120, averageDaily: 10, firstSeenDay: '2026-09-01' });
    expect(o.averageMonthly).toBe(253.3); // 760 over September, October, November
  });

  it('nobody seen yet is 0 and no average', async () => {
    const { service } = build([[{ seenTotal: 0, firstSeenDay: null, thisMonth: 0, previousMonth: 0 }]]);
    expect(await service.overall('doc-1', { kind: 'all' }, NOW)).toMatchObject({ totalVisits: 0, averageDaily: null, averageMonthly: null });
  });

  it('an empty answer from the database is read as nobody seen', async () => {
    const { service } = build([[]]);
    expect(await service.overall('doc-1', { kind: 'all' }, NOW)).toMatchObject({ totalVisits: 0, averageDaily: null });
  });
});

describe('StatisticsService.diseases', () => {
  it('reads THIS practice\'s prescriptions only', async () => {
    const { queryRaw, service } = build([[]]);
    await service.diseases('doc-1');
    const q = asked(queryRaw);
    expect(q.values).toEqual(['doc-1']);
    expect(flat(q)).toContain('p."doctorId" = $1');
  });

  it('counts different patients, in the order the physician reads them: most first', async () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const { service } = build([
      [
        { patientId: 'p1', name: 'DM', createdAt: at },
        { patientId: 'p2', name: 'dm', createdAt: at },
        { patientId: 'p1', name: 'HTN', createdAt: at },
        { patientId: 'p2', name: 'HTN', createdAt: at },
        { patientId: 'p3', name: 'HTN', createdAt: at },
        { patientId: 'p3', name: 'Cirrhosis', createdAt: at },
      ],
    ]);
    expect(await service.diseases('doc-1')).toEqual({
      diagnoses: [
        { name: 'HTN', patients: 3 },
        { name: 'DM', patients: 2 },
        { name: 'Cirrhosis', patients: 1 },
      ],
    });
  });
});
