import type { User } from '@prisma/client';
import { dhakaDayKey } from '../src/opd/dhaka-day';
import { countDaysInclusive, previousMonth } from '../src/statistics/visit-stats';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor, makePatient } from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// Settings → Statistics (physician's sheet, 11/11/2026): how many patients were
// booked and seen per day and per month, the overall figures, and the final
// diagnoses. Real HTTP, real database; every name here is made up. The queries
// are the point: "seen" is Done OR printed, a day is `queueDate` (else the Dhaka
// day a row was created), a chamber is a claim the server checks, and every
// number is the workstation doctor's own practice.

type Agent = Awaited<ReturnType<typeof loginAs>>;

const TODAY = dhakaDayKey();
const THIS_MONTH = TODAY.slice(0, 7);
const PREV_MONTH = previousMonth(THIS_MONTH);

describe('Statistics', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  const setup = async () => {
    const doctor = await makeDoctor(t.prisma);
    const b = await loginAs(t, doctor);
    const list = (await b.get('/api/chambers')).body as Array<{ id: string; isDefault: boolean }>;
    const def = list.find((c) => c.isDefault)!;
    const ibn = (await b.post('/api/chambers').send({ name: 'Ibn Sina', address: 'Dhanmondi' })).body as { id: string };
    return { doctor, b, def, ibn };
  };

  // A queue row written straight: `seen` is how a visit ends up counted as seen —
  // Done pressed, or the prescription printed — and `waiting` is neither.
  type Kind = 'done' | 'printed' | 'waiting' | 'printed-not-done';
  const visit = (
    doctor: User,
    day: string | null,
    kind: Kind = 'waiting',
    over: { chamberId?: string | null; createdAt?: Date } = {},
  ) =>
    t.prisma.opdVisit.create({
      data: {
        doctorId: doctor.id,
        name: 'Test Patient',
        token: `T-${Math.random().toString(36).slice(2, 8)}`,
        queueDate: day,
        status: kind === 'done' ? 'done' : 'waiting',
        rxStatus: kind === 'printed' || kind === 'printed-not-done' ? 'complete' : null,
        chamberId: over.chamberId ?? null,
        ...(over.createdAt ? { createdAt: over.createdAt } : {}),
      },
    });
  const many = async (n: number, make: () => Promise<unknown>) => {
    for (let i = 0; i < n; i++) await make();
  };

  const get = (b: Agent, path: string, query: Record<string, string> = {}) => b.get(`/api/statistics/${path}`).query(query);

  describe('visits by day', () => {
    it('gives total serial and seen for EVERY day of the month, 0 and 0 where nobody was booked', async () => {
      const { doctor, b } = await setup();
      await many(3, () => visit(doctor, '2026-11-03', 'done'));
      await visit(doctor, '2026-11-03', 'waiting');
      await visit(doctor, '2026-11-20', 'printed');
      const res = await get(b, 'visits/days', { month: '2026-11' });
      expect(res.status).toBe(200);
      expect(res.body.month).toBe('2026-11');
      expect(res.body.days).toHaveLength(30);
      expect(res.body.days[2]).toEqual({ day: '2026-11-03', total: 4, seen: 3 });
      expect(res.body.days[19]).toEqual({ day: '2026-11-20', total: 1, seen: 1 });
      expect(res.body.days[0]).toEqual({ day: '2026-11-01', total: 0, seen: 0 });
    });

    it('⚕️ seen is what the queue calls Completed: Done pressed, OR the prescription printed (Done not pressed), never a patient still waiting', async () => {
      const { doctor, b } = await setup();
      await visit(doctor, '2026-11-04', 'done');
      await visit(doctor, '2026-11-04', 'printed-not-done');
      await visit(doctor, '2026-11-04', 'waiting');
      await t.prisma.opdVisit.create({
        data: { doctorId: doctor.id, name: 'Incomplete Rx', token: 'T-x1', queueDate: '2026-11-04', status: 'waiting', rxStatus: 'incomplete' },
      });
      const day = (await get(b, 'visits/days', { month: '2026-11' })).body.days[3];
      expect(day).toEqual({ day: '2026-11-04', total: 4, seen: 2 });
    });

    it('a visit belongs to its queue day, not the day it was written: booked on the 2nd for the 9th it is the 9th', async () => {
      const { doctor, b } = await setup();
      await visit(doctor, '2026-11-09', 'waiting', { createdAt: new Date('2026-11-02T08:00:00Z') });
      const days = (await get(b, 'visits/days', { month: '2026-11' })).body.days;
      expect(days[8].total).toBe(1);
      expect(days[1].total).toBe(0);
    });

    it('a row from before queue days (no queueDate) is the Dhaka day it was created — 01:00 on the 6th in Dhaka is still the 5th in UTC', async () => {
      const { doctor, b } = await setup();
      await visit(doctor, null, 'done', { createdAt: new Date('2026-11-05T19:00:00Z') }); // 06/11 01:00 Dhaka
      await visit(doctor, null, 'done', { createdAt: new Date('2026-11-05T17:59:00Z') }); // 05/11 23:59 Dhaka
      const days = (await get(b, 'visits/days', { month: '2026-11' })).body.days;
      expect(days[4]).toEqual({ day: '2026-11-05', total: 1, seen: 1 });
      expect(days[5]).toEqual({ day: '2026-11-06', total: 1, seen: 1 });
    });

    it('another month is not counted in, and the first and last days of the month are', async () => {
      const { doctor, b } = await setup();
      await visit(doctor, '2026-10-31', 'done');
      await visit(doctor, '2026-11-01', 'done');
      await visit(doctor, '2026-11-30', 'done');
      await visit(doctor, '2026-12-01', 'done');
      const days = (await get(b, 'visits/days', { month: '2026-11' })).body.days;
      expect(days.reduce((n: number, d: { total: number }) => n + d.total, 0)).toBe(2);
      expect(days[0].total).toBe(1);
      expect(days[29].total).toBe(1);
    });

    it('no month named is the current Dhaka month', async () => {
      const { b } = await setup();
      const res = await get(b, 'visits/days');
      expect(res.status).toBe(200);
      expect(res.body.month).toBe(THIS_MONTH);
    });

    it('refuses a month that is not one — 400, in words', async () => {
      const { b } = await setup();
      for (const month of ['2026-13', '2026-11-05', 'november', '2026-1']) {
        const res = await get(b, 'visits/days', { month });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/2026-11/);
      }
    });
  });

  describe('visits by month', () => {
    it('gives the twelve months of the year with total and seen', async () => {
      const { doctor, b } = await setup();
      await many(5, () => visit(doctor, '2026-01-10', 'done'));
      await many(2, () => visit(doctor, '2026-01-11', 'waiting'));
      await many(4, () => visit(doctor, '2026-09-02', 'printed'));
      await visit(doctor, '2025-12-31', 'done');
      await visit(doctor, '2027-01-01', 'done');
      const res = await get(b, 'visits/months', { year: '2026' });
      expect(res.status).toBe(200);
      expect(res.body.months).toHaveLength(12);
      expect(res.body.months[0]).toEqual({ month: '2026-01', total: 7, seen: 5 });
      expect(res.body.months[8]).toEqual({ month: '2026-09', total: 4, seen: 4 });
      expect(res.body.months[1]).toEqual({ month: '2026-02', total: 0, seen: 0 });
    });

    it('refuses a year that is not one', async () => {
      const { b } = await setup();
      expect((await get(b, 'visits/months', { year: '26' })).status).toBe(400);
      expect((await get(b, 'visits/months', { year: 'abcd' })).status).toBe(400);
    });
  });

  describe('overall', () => {
    it('Total visit, this month (up to today), the previous month, and the calendar averages', async () => {
      const { doctor, b } = await setup();
      await many(3, () => visit(doctor, `${PREV_MONTH}-10`, 'done'));
      await many(2, () => visit(doctor, TODAY, 'printed'));
      await visit(doctor, TODAY, 'waiting'); // booked, not seen: counts nowhere here
      await visit(doctor, '2025-03-04', 'done');
      const res = await get(b, 'visits/overall');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalVisits: 6, thisMonth: 2, previousMonth: 3, firstSeenDay: '2025-03-04' });
      const days = countDaysInclusive('2025-03-04', TODAY);
      const months = (Number(THIS_MONTH.slice(0, 4)) - 2025) * 12 + (Number(THIS_MONTH.slice(5)) - 3) + 1;
      expect(res.body.days).toBe(days);
      expect(res.body.months).toBe(months);
      expect(res.body.averageDaily).toBe(Math.round((6 / days) * 10) / 10);
      expect(res.body.averageMonthly).toBe(Math.round((6 / months) * 10) / 10);
    });

    it('nobody seen yet: 0, and no average', async () => {
      const { doctor, b } = await setup();
      await visit(doctor, TODAY, 'waiting');
      const res = await get(b, 'visits/overall');
      expect(res.body).toMatchObject({ totalVisits: 0, thisMonth: 0, previousMonth: 0, averageDaily: null, averageMonthly: null, firstSeenDay: null });
    });
  });

  describe('⚕️ the chamber is a claim', () => {
    it('all chambers is the total; the default chamber and another each count only their own', async () => {
      const { doctor, b, def, ibn } = await setup();
      await many(3, () => visit(doctor, '2026-11-12', 'done', { chamberId: null }));
      await many(2, () => visit(doctor, '2026-11-12', 'done', { chamberId: ibn.id }));
      await visit(doctor, '2026-11-12', 'waiting', { chamberId: ibn.id });
      const at = async (chamber?: string) =>
        (await get(b, 'visits/days', { month: '2026-11', ...(chamber ? { chamber } : {}) })).body.days[11];
      expect(await at()).toEqual({ day: '2026-11-12', total: 6, seen: 5 });
      expect(await at('all')).toEqual({ day: '2026-11-12', total: 6, seen: 5 });
      // the default chamber's id means "no chamber" — its rows carry none
      expect(await at(def.id)).toEqual({ day: '2026-11-12', total: 3, seen: 3 });
      expect(await at(ibn.id)).toEqual({ day: '2026-11-12', total: 3, seen: 2 });
    });

    it('the overall numbers follow the same chamber', async () => {
      const { doctor, b, ibn } = await setup();
      await many(4, () => visit(doctor, TODAY, 'done', { chamberId: null }));
      await many(1, () => visit(doctor, TODAY, 'done', { chamberId: ibn.id }));
      expect((await get(b, 'visits/overall')).body.totalVisits).toBe(5);
      expect((await get(b, 'visits/overall', { chamber: ibn.id })).body.totalVisits).toBe(1);
    });

    it('another practice\'s chamber is a 404 and shows nothing of it — not the total in its place', async () => {
      const mine = await setup();
      const other = await setup();
      await visit(other.doctor, '2026-11-12', 'done', { chamberId: other.ibn.id });
      for (const path of ['visits/days', 'visits/months', 'visits/overall']) {
        const res = await get(mine.b, path, { chamber: other.ibn.id });
        expect(res.status).toBe(404);
      }
    });

    it('a removed chamber is a 404 too; a made-up id as well', async () => {
      const { b, ibn } = await setup();
      await b.delete(`/api/chambers/${ibn.id}`);
      expect((await get(b, 'visits/overall', { chamber: ibn.id })).status).toBe(404);
      expect((await get(b, 'visits/overall', { chamber: 'nope' })).status).toBe(404);
    });
  });

  describe('⚕️ one practice, and who may ask', () => {
    it('another doctor\'s visits are never counted', async () => {
      const mine = await setup();
      const other = await setup();
      await many(2, () => visit(mine.doctor, '2026-11-12', 'done'));
      await many(7, () => visit(other.doctor, '2026-11-12', 'done'));
      expect((await get(mine.b, 'visits/days', { month: '2026-11' })).body.days[11]).toEqual({ day: '2026-11-12', total: 2, seen: 2 });
      await many(1, () => visit(other.doctor, TODAY, 'done'));
      expect((await get(mine.b, 'visits/overall')).body.totalVisits).toBe(2);
    });

    it('an assistant of the practice reads the practice\'s numbers (physician, 11/11/2026), as the practice and nothing else', async () => {
      const { doctor } = await setup();
      const assistant = await makeDoctor(t.prisma, { accountTier: 'secondary', name: 'Test Assistant' });
      await makeAssistantLink(t.prisma, doctor.id, assistant.id, []);
      await many(3, () => visit(doctor, '2026-11-12', 'done'));
      const a = await loginAs(t, assistant);
      const res = await a.get('/api/statistics/visits/days').query({ month: '2026-11' }).set(WS, doctor.id);
      expect(res.status).toBe(200);
      expect(res.body.days[11]).toEqual({ day: '2026-11-12', total: 3, seen: 3 });
      // with no header they act as themselves — and have a practice of their own, with no visits
      const own = await a.get('/api/statistics/visits/days').query({ month: '2026-11' });
      expect(own.body.days[11]).toEqual({ day: '2026-11-12', total: 0, seen: 0 });
    });

    it('someone with no link to a practice cannot read it by naming it — 403', async () => {
      const { doctor } = await setup();
      const stranger = await makeDoctor(t.prisma);
      const s = await loginAs(t, stranger);
      for (const path of ['visits/days', 'visits/months', 'visits/overall', 'diseases']) {
        expect((await s.get(`/api/statistics/${path}`).set(WS, doctor.id)).status).toBe(403);
      }
    });

    it('needs a session — 401 for every route', async () => {
      for (const path of ['visits/days', 'visits/months', 'visits/overall', 'diseases']) {
        expect((await t.agent().get(`/api/statistics/${path}`)).status).toBe(401);
      }
    });
  });

  describe('diseases', () => {
    const rx = (doctor: User, patientId: string, finalDiagnosis: string[], createdAt?: Date) =>
      t.prisma.prescription.create({ data: { doctorId: doctor.id, patientId, finalDiagnosis, ...(createdAt ? { createdAt } : {}) } });

    it('counts different patients per final diagnosis, most first — a patient seen five times with DM is one', async () => {
      const { doctor, b } = await setup();
      const [p1, p2, p3] = await Promise.all([makePatient(t.prisma, doctor.id), makePatient(t.prisma, doctor.id), makePatient(t.prisma, doctor.id)]);
      for (let i = 0; i < 5; i++) await rx(doctor, p1.id, ['DM', 'HTN']);
      await rx(doctor, p2.id, ['DM']);
      await rx(doctor, p3.id, ['Cirrhosis']);
      const res = await get(b, 'diseases');
      expect(res.status).toBe(200);
      expect(res.body.diagnoses).toEqual([
        { name: 'DM', patients: 2 },
        { name: 'Cirrhosis', patients: 1 },
        { name: 'HTN', patients: 1 },
      ]);
    });

    it('capitals and spacing are set aside and nothing else: dm, DM and " Dm " are one; DM and Diabetes mellitus are two', async () => {
      const { doctor, b } = await setup();
      const [p1, p2, p3] = await Promise.all([makePatient(t.prisma, doctor.id), makePatient(t.prisma, doctor.id), makePatient(t.prisma, doctor.id)]);
      await rx(doctor, p1.id, ['dm'], new Date('2026-01-01T00:00:00Z'));
      await rx(doctor, p1.id, ['DM'], new Date('2026-02-01T00:00:00Z'));
      await rx(doctor, p2.id, [' Dm '], new Date('2026-03-01T00:00:00Z'));
      await rx(doctor, p3.id, ['Diabetes mellitus']);
      const res = await get(b, 'diseases');
      expect(res.body.diagnoses).toEqual([
        { name: 'Dm', patients: 2 }, // the newest wording, trimmed
        { name: 'Diabetes mellitus', patients: 1 },
      ]);
    });

    it('⚕️ only this practice\'s prescriptions: a supervising doctor\'s prescription of the same patient is theirs, not the owner\'s', async () => {
      const owner = await setup();
      const supervisor = await setup();
      const p = await makePatient(t.prisma, owner.doctor.id);
      await rx(owner.doctor, p.id, ['HTN']);
      await rx(supervisor.doctor, p.id, ['DM']);
      expect((await get(owner.b, 'diseases')).body.diagnoses).toEqual([{ name: 'HTN', patients: 1 }]);
      expect((await get(supervisor.b, 'diseases')).body.diagnoses).toEqual([{ name: 'DM', patients: 1 }]);
    });

    it('a prescription with no final diagnosis, or a blank one, is no disease; nobody has any → an empty list', async () => {
      const { doctor, b } = await setup();
      const p = await makePatient(t.prisma, doctor.id);
      await rx(doctor, p.id, []);
      await rx(doctor, p.id, ['   ']);
      expect((await get(b, 'diseases')).body).toEqual({ diagnoses: [] });
    });
  });
});
