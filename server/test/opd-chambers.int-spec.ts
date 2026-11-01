import { readFileSync } from 'fs';
import { join } from 'path';
import type { OpdVisit, User } from '@prisma/client';
import { dhakaDayKey } from '../src/opd/dhaka-day';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor } from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ Multiple chambers for OPD (physician's sheet 28/10/2026, item 8): Labaid and
// Ibn Sina keep separate lists, tokens and schedules; a chamber id is a claim
// the server checks (another practice's → 404); every row from before chambers
// is the default chamber's; a chamber prints with its own settings, else the
// doctor's. Real HTTP, real database; every name here is made up.

type Agent = Awaited<ReturnType<typeof loginAs>>;
const CH = 'X-Chamber';
const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = dhakaDayKey();
const TOMORROW = dhakaDayKey(new Date(Date.now() + DAY_MS));

// The SQL's statements one at a time (a DO block keeps its own semicolons),
// without the OWNER lines (the test database has no exhort_user).
function sqlStatements(file: string): string[] {
  const text = readFileSync(join(__dirname, '..', 'prisma', file), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const out: string[] = [];
  let cur = '';
  let inBlock = false;
  for (const line of text.split('\n')) {
    cur += line + '\n';
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inBlock = !inBlock;
    if (!inBlock && line.trim().endsWith(';')) { out.push(cur.trim()); cur = ''; }
  }
  return out.filter((s) => s && !/OWNER TO exhort_user/.test(s));
}

describe('OPD chambers', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    // The expression unique indexes are only in the manual SQL (Prisma cannot
    // express them): applied here, twice, so they guard this suite as in
    // production and a second run is shown to change nothing.
    for (let i = 0; i < 2; i++) for (const s of sqlStatements('manual-opd-chambers.sql')) await t.prisma.$executeRawUnsafe(s);
  });
  afterAll(async () => {
    await t.close();
  });

  const setup = async () => {
    const doctor = await makeDoctor(t.prisma);
    const b = await loginAs(t, doctor);
    const list = (await b.get('/api/chambers')).body as Array<{ id: string; name: string; isDefault: boolean; address: string }>;
    const def = list.find((c) => c.isDefault)!;
    const ibn = (await b.post('/api/chambers').send({ name: 'Ibn Sina', address: 'Dhanmondi' })).body as { id: string };
    return { doctor, b, def, ibn };
  };
  const add = (b: Agent, name: string, chamber?: string, date?: string) => {
    const req = b.post('/api/opd');
    return (chamber ? req.set(CH, chamber) : req).send({ name, ...(date ? { date } : {}) });
  };
  const list = async (b: Agent, chamber?: string, date?: string) => {
    const req = b.get('/api/opd').query(date ? { date } : {});
    const res = await (chamber ? req.set(CH, chamber) : req);
    expect(res.status).toBe(200);
    return res.body as OpdVisit[];
  };
  const names = (rows: OpdVisit[]) => rows.map((r) => r.name);

  describe('the chamber list', () => {
    it('makes the default chamber once, from the first profile address, and lists it first', async () => {
      const doctor = await makeDoctor(t.prisma);
      await t.prisma.chamber.create({ data: { userId: doctor.id, address: 'Labaid, Dhanmondi', order: 0 } });
      const b = await loginAs(t, doctor);
      const [first, second] = await Promise.all([b.get('/api/chambers'), b.get('/api/chambers')]);
      expect(first.body).toHaveLength(1);
      expect(second.body).toHaveLength(1);
      expect(first.body[0]).toMatchObject({ name: 'Main chamber', address: 'Labaid, Dhanmondi', isDefault: true });
      expect(await t.prisma.opdChamber.count({ where: { doctorId: doctor.id } })).toBe(1);
      // the profile address is copied once — editing the profile later changes nothing here
      await t.prisma.chamber.updateMany({ where: { userId: doctor.id }, data: { address: 'Elsewhere' } });
      expect((await b.get('/api/chambers')).body[0].address).toBe('Labaid, Dhanmondi');
    });

    it('adds, renames and edits the address; soft-removes one, never the default', async () => {
      const { b, def, ibn } = await setup();
      expect((await b.patch(`/api/chambers/${ibn.id}`).send({ name: 'Ibn Sina Hospital', address: 'Kalyanpur' })).status).toBe(200);
      expect((await b.patch(`/api/chambers/${ibn.id}`).send({ name: '  ' })).status).toBe(400);
      expect((await b.delete(`/api/chambers/${def.id}`)).status).toBe(400);
      expect((await b.delete(`/api/chambers/${ibn.id}`)).status).toBe(200);
      expect((await b.get('/api/chambers')).body.map((c: { id: string }) => c.id)).toEqual([def.id]);
      const row = await t.prisma.opdChamber.findUniqueOrThrow({ where: { id: ibn.id } });
      expect(row.removedAt).not.toBeNull(); // soft
      expect(row.name).toBe('Ibn Sina Hospital');
    });

    it("another practice's chamber is 404 to change, and an assistant may read but not change", async () => {
      const { doctor, ibn } = await setup();
      const other = await loginAs(t, await makeDoctor(t.prisma));
      expect((await other.patch(`/api/chambers/${ibn.id}`).send({ name: 'Mine' })).status).toBe(404);
      expect((await other.delete(`/api/chambers/${ibn.id}`)).status).toBe(404);
      const asst = await makeDoctor(t.prisma);
      await makeAssistantLink(t.prisma, doctor.id, asst.id, ['rx.savePrint']);
      const a = await loginAs(t, asst);
      const seen = await a.get('/api/chambers').set(WS, doctor.id);
      expect(seen.status).toBe(200);
      expect(seen.body.map((c: { name: string }) => c.name)).toEqual(['Main chamber', 'Ibn Sina']);
      expect((await a.post('/api/chambers').set(WS, doctor.id).send({ name: 'X' })).status).toBe(403);
      expect((await a.patch(`/api/chambers/${ibn.id}`).set(WS, doctor.id).send({ name: 'X' })).status).toBe(403);
    });
  });

  describe('the queue is per chamber', () => {
    it('two chambers, one day: separate lists, each starting at T-01 and serial 1', async () => {
      const { b, ibn } = await setup();
      const a1 = await add(b, 'Labaid One');
      const i1 = await add(b, 'Ibn One', ibn.id);
      const a2 = await add(b, 'Labaid Two');
      const i2 = await add(b, 'Ibn Two', ibn.id);
      expect([a1.body.token, a2.body.token, i1.body.token, i2.body.token]).toEqual(['T-01', 'T-02', 'T-01', 'T-02']);
      expect([i1.body.position, i2.body.position]).toEqual([1, 2]);
      expect(names(await list(b))).toEqual(['Labaid One', 'Labaid Two']);
      expect(names(await list(b, ibn.id))).toEqual(['Ibn One', 'Ibn Two']);
    });

    it("the default chamber's id is the same list as no chamber at all, and is stored as NULL", async () => {
      const { b, def } = await setup();
      const v = await add(b, 'By Id', def.id);
      expect(v.body.chamberId).toBeNull();
      expect(names(await list(b))).toEqual(['By Id']);
      expect(names(await list(b, def.id))).toEqual(['By Id']);
    });

    it('rows from before chambers (chamberId NULL) are listed in the default chamber only', async () => {
      const { doctor, b, ibn } = await setup();
      await t.prisma.opdVisit.create({ data: { doctorId: doctor.id, name: 'Old Row', token: 'T-01', queueDate: TODAY, position: 1 } });
      await t.prisma.opdVisit.create({ data: { doctorId: doctor.id, name: 'Older Row', token: 'T-02' } }); // no queueDate: an older build
      expect(names(await list(b))).toEqual(['Old Row', 'Older Row']);
      expect(names(await list(b, ibn.id))).toEqual([]);
      expect((await add(b, 'Next')).body.token).toBe('T-03');
    });

    it("another practice's chamber, a removed one or a made-up id is 404 — and nothing is written", async () => {
      const { doctor, b } = await setup();
      const other = await setup();
      const gone = (await b.post('/api/chambers').send({ name: 'Gone' })).body as { id: string };
      await b.delete(`/api/chambers/${gone.id}`);
      for (const bad of [other.ibn.id, gone.id, 'nope']) {
        expect((await add(b, 'Should Not Exist', bad)).status).toBe(404);
        expect((await b.get('/api/opd').set(CH, bad)).status).toBe(404);
        expect((await b.get('/api/opd/schedule').query({ date: TODAY }).set(CH, bad)).status).toBe(404);
      }
      expect(await t.prisma.opdVisit.count({ where: { doctorId: doctor.id } })).toBe(0);
    });

    it('a move stays inside the visit\'s own chamber', async () => {
      const { b, ibn } = await setup();
      await add(b, 'L1');
      await add(b, 'I1', ibn.id);
      const i2 = (await add(b, 'I2', ibn.id)).body as OpdVisit;
      const res = await b.patch(`/api/opd/${i2.id}/move`).send({ direction: 'up' });
      expect(res.status).toBe(200);
      expect(names(res.body)).toEqual(['I2', 'I1']);
      expect(names(await list(b))).toEqual(['L1']);
    });

    it('Save & print marks the visit in the chamber it is printed from', async () => {
      const { doctor, b, ibn } = await setup();
      const p = await t.prisma.patient.create({ data: { doctorId: doctor.id, name: 'Pt Rx', mobile: '01711111111' } });
      const res = await b.post('/api/opd/rx-status').set(CH, ibn.id).send({ patientId: p.id, rxStatus: 'complete', name: 'Pt Rx' });
      expect(res.status).toBe(201);
      expect(res.body.chamberId).toBe(ibn.id);
      expect(names(await list(b, ibn.id))).toEqual(['Pt Rx']);
      expect(names(await list(b))).toEqual([]);
    });

    it('the database refuses a second T-01 in one chamber on one day, and allows it in another chamber', async () => {
      const { doctor, ibn } = await setup();
      const base = { doctorId: doctor.id, name: 'X', token: 'T-01', queueDate: TOMORROW, position: 1 };
      await t.prisma.opdVisit.create({ data: { ...base } });
      await t.prisma.opdVisit.create({ data: { ...base, chamberId: ibn.id } });
      await expect(t.prisma.opdVisit.create({ data: { ...base } })).rejects.toThrow();
      await expect(t.prisma.opdVisit.create({ data: { ...base, chamberId: ibn.id } })).rejects.toThrow();
    });
  });

  describe('the schedule is per chamber', () => {
    const sched = (b: Agent, chamber: string | undefined, startTime: string, date = TOMORROW) => {
      const req = b.put('/api/opd/schedule');
      return (chamber ? req.set(CH, chamber) : req).send({ date, startTime, minutesPerPatient: 10 });
    };
    const read = async (b: Agent, chamber: string | undefined, date = TOMORROW) => {
      const req = b.get('/api/opd/schedule').query({ date });
      return (await (chamber ? req.set(CH, chamber) : req)).body as { startTime: string; saved: boolean };
    };

    it('each chamber saves and reads its own day; a later day inherits only its own chamber', async () => {
      const { b, ibn } = await setup();
      expect((await sched(b, undefined, '09:00')).status).toBe(200);
      expect((await sched(b, ibn.id, '18:00')).status).toBe(200);
      expect((await sched(b, ibn.id, '18:30')).status).toBe(200); // saved again: one row, updated
      expect(await read(b, undefined)).toMatchObject({ startTime: '09:00', saved: true });
      expect(await read(b, ibn.id)).toMatchObject({ startTime: '18:30', saved: true });
      const later = dhakaDayKey(new Date(Date.now() + 5 * DAY_MS));
      expect(await read(b, undefined, later)).toMatchObject({ startTime: '09:00', saved: false });
      expect(await read(b, ibn.id, later)).toMatchObject({ startTime: '18:30', saved: false });
    });

    it('a chamber with no schedule of its own takes the pre-set values, not another chamber\'s', async () => {
      const { b } = await setup();
      const third = (await b.post('/api/chambers').send({ name: 'Third' })).body as { id: string };
      await sched(b, undefined, '07:00');
      expect(await read(b, third.id)).toMatchObject({ startTime: '18:00', saved: false });
    });

    it('a day that has passed stays locked in every chamber', async () => {
      const { b, ibn } = await setup();
      const yesterday = dhakaDayKey(new Date(Date.now() - DAY_MS));
      expect((await sched(b, ibn.id, '09:00', yesterday)).status).toBe(400);
      expect((await add(b, 'Late', ibn.id, yesterday)).status).toBe(400);
    });
  });

  describe("a chamber's prescription settings", () => {
    it("has none at first (the doctor's own print); the first save starts from the doctor's settings", async () => {
      const { doctor, b, ibn } = await setup();
      await t.prisma.prescriptionLayout.create({ data: { userId: doctor.id, headerHtml: '<b>Dr. Test</b>', rxType: 'opd' } });
      expect((await b.get(`/api/chambers/${ibn.id}/layout`)).body).toEqual({ chamberId: ibn.id, layout: null });
      const saved = await b.put(`/api/chambers/${ibn.id}/layout`).send({ footerHtml: 'Ibn Sina, Kalyanpur' });
      expect(saved.status).toBe(200);
      expect(saved.body.layout).toMatchObject({ headerHtml: '<b>Dr. Test</b>', rxType: 'opd', footerHtml: 'Ibn Sina, Kalyanpur' });
      // the doctor's own settings are untouched
      expect((await b.get('/api/prescription-layout')).body.footerHtml).toBe('');
      expect((await b.delete(`/api/chambers/${ibn.id}/layout`)).body).toEqual({ chamberId: ibn.id, layout: null });
      expect((await b.get(`/api/chambers/${ibn.id}/layout`)).body.layout).toBeNull();
    });

    it("another practice's chamber is 404, an assistant may read and not write", async () => {
      const { doctor, ibn } = await setup();
      const other = await loginAs(t, await makeDoctor(t.prisma));
      expect((await other.get(`/api/chambers/${ibn.id}/layout`)).status).toBe(404);
      expect((await other.put(`/api/chambers/${ibn.id}/layout`).send({ footerHtml: 'x' })).status).toBe(404);
      const asst = await makeDoctor(t.prisma);
      await makeAssistantLink(t.prisma, doctor.id, asst.id, ['rx.savePrint']);
      const a = await loginAs(t, asst);
      expect((await a.get(`/api/chambers/${ibn.id}/layout`).set(WS, doctor.id)).status).toBe(200);
      expect((await a.put(`/api/chambers/${ibn.id}/layout`).set(WS, doctor.id).send({ footerHtml: 'x' })).status).toBe(403);
    });
  });
});
