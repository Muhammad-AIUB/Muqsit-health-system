import type { User } from '@prisma/client';
import { dhakaDayKey } from '../src/opd/dhaka-day';
import { POINT_CRITERIA } from '../src/admin/point-system';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor, makePatient } from './support/fixtures';
import { makeAdmin } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// The admin's page for ONE doctor (physician's sheet, 16/11/2026): the doctor's
// patient numbers as the doctor sees them, the two Profile settings, and the
// Point system. Real HTTP, real database; every name is made up.

type Browser = ReturnType<TestApp['agent']>;
const KEYS = POINT_CRITERIA.map((c) => c.key);
const allScores = (v: number | null) => Object.fromEntries(KEYS.map((k) => [k, v]));

describe('admin → one doctor\'s account', () => {
  let t: TestApp;
  let admin: User, doctor: User, other: User;
  let adm: Browser, doc: Browser;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    admin = await makeAdmin(t.prisma);
    doctor = await makeDoctor(t.prisma);
    other = await makeDoctor(t.prisma);
    adm = await loginAs(t, admin);
    doc = await loginAs(t, doctor);
  });
  afterAll(async () => { await t.close(); });

  beforeEach(async () => {
    await t.prisma.user.updateMany({ data: { isolated: false, hideMhsLogo: false } });
    await t.prisma.doctorPointScore.deleteMany({});
    // The statistics tests count visits, chambers and patients: each starts from
    // none, or a number would be the sum of the tests before it. (Visits go before
    // chambers, which they point at; a patient takes its prescriptions with it.)
    await t.prisma.opdVisit.deleteMany({});
    await t.prisma.opdChamber.deleteMany({});
    await t.prisma.patient.deleteMany({});
  });

  const settings = (id = doctor.id) => adm.get(`/api/admin/users/${id}/settings`);
  const patch = (body: unknown, id = doctor.id) => adm.patch(`/api/admin/users/${id}/settings`).send(body as object);
  const scores = (id = doctor.id) => adm.get(`/api/admin/users/${id}/point-scores`);
  const save = (body: unknown, id = doctor.id) => adm.put(`/api/admin/users/${id}/point-scores`).send(body as object);

  describe('who may', () => {
    const routes: [string, string][] = [
      ['get', 'settings'], ['patch', 'settings'], ['get', 'point-scores'], ['put', 'point-scores'],
      ['get', 'statistics/chambers'], ['get', 'statistics/visits/days'], ['get', 'statistics/visits/months'],
      ['get', 'statistics/visits/overall'], ['get', 'statistics/diseases'],
    ];
    it.each(routes)('⚕️ %s %s: a doctor is refused (403) and nobody signed in is 401', async (method, path) => {
      const url = `/api/admin/users/${doctor.id}/${path}`;
      const call = (b: Browser) => (b as unknown as Record<string, (u: string) => { send: (x: object) => Promise<{ status: number }> }>)[method](url).send({});
      expect((await call(doc)).status).toBe(403);
      expect((await call(t.agent())).status).toBe(401);
    });

    it('an unknown account, and another ADMIN, are 404 — an admin cannot configure an admin through this page', async () => {
      expect((await settings('no-such-user')).status).toBe(404);
      expect((await settings(admin.id)).status).toBe(404);
      expect((await patch({ isolated: true }, admin.id)).status).toBe(404);
      expect((await save({ scores: {} }, admin.id)).status).toBe(404);
      expect((await adm.get(`/api/admin/users/${admin.id}/statistics/diseases`)).status).toBe(404);
      expect((await t.prisma.user.findUnique({ where: { id: admin.id } }))?.isolated).toBe(false);
    });
  });

  describe('Profile settings — the two switches', () => {
    it('both are off for an account that was never touched', async () => {
      expect((await settings()).body).toEqual({ isolated: false, hideMhsLogo: false });
    });

    it('each is set on its own, and the other is left as it was', async () => {
      expect((await patch({ isolated: true })).body).toEqual({ isolated: true, hideMhsLogo: false });
      expect((await patch({ hideMhsLogo: true })).body).toEqual({ isolated: true, hideMhsLogo: true });
      expect((await patch({ isolated: false })).body).toEqual({ isolated: false, hideMhsLogo: true });
      const row = await t.prisma.user.findUnique({ where: { id: doctor.id } });
      expect([row?.isolated, row?.hideMhsLogo]).toEqual([false, true]);
    });

    it('both at once', async () => {
      expect((await patch({ isolated: true, hideMhsLogo: true })).body).toEqual({ isolated: true, hideMhsLogo: true });
    });

    it('says the same thing twice without harm (setting what is already set)', async () => {
      await patch({ isolated: true });
      expect((await patch({ isolated: true })).body.isolated).toBe(true);
    });

    it.each([[{}], [{ isolated: 'yes' }], [{ isolated: 1 }], [{ hideMhsLogo: null }], [{ isolated: [] }]])(
      '%j is refused, and nothing is changed',
      async (body) => {
        const r = await patch(body);
        expect(r.status).toBe(400);
        expect((await settings()).body).toEqual({ isolated: false, hideMhsLogo: false });
      },
    );

    it('⚕️ nothing else can be set through it: role, tier, approval and the like are dropped, not applied', async () => {
      const r = await patch({ isolated: true, role: 'admin', accountTier: 'secondary', approvalStatus: 'rejected', email: 'x@x.invalid' });
      expect(r.status).toBe(200);
      const row = await t.prisma.user.findUnique({ where: { id: doctor.id } });
      expect(row).toMatchObject({ role: 'professional', accountTier: 'primary', approvalStatus: 'approved' });
      expect(row?.email).not.toBe('x@x.invalid');
    });

    it('the registration the account page loads carries both switches', async () => {
      await patch({ hideMhsLogo: true });
      const one = (await adm.get(`/api/admin/registrations/${doctor.id}`)).body;
      expect(one).toMatchObject({ isolated: false, hideMhsLogo: true });
      const list = (await adm.get('/api/admin/registrations')).body as Array<{ id: string; hideMhsLogo: boolean }>;
      expect(list.find((x) => x.id === doctor.id)?.hideMhsLogo).toBe(true);
    });

    it('the doctor\'s own screens see it, through the workstation listing', async () => {
      await patch({ hideMhsLogo: true, isolated: true });
      const own = (await doc.get('/api/workstations')).body as Array<{ doctorId: string; hideMhsLogo: boolean; isolated: boolean }>;
      expect(own.find((w) => w.doctorId === doctor.id)).toMatchObject({ hideMhsLogo: true, isolated: true });
    });
  });

  describe('Point system', () => {
    it('lists the ten criteria in the sheet\'s order, with nothing scored', async () => {
      const r = await scores();
      expect(r.status).toBe(200);
      expect(r.body.criteria.map((c: { label: string }) => c.label)).toEqual([
        'Integrity and honesty', 'Academic knowledge', 'Clinical competence', 'Communication', 'Professionalism',
        'Empathy and behaviour', 'Clinical maturity', 'Teamwork and leadership', 'Accountability', 'Financial ethics',
      ]);
      expect(r.body.scores).toEqual({});
      expect(r.body.updatedAt).toBeNull();
    });

    it('keeps what was typed, exactly, and says when', async () => {
      const body = { integrity: 8, academic: 10, clinical: 1, communication: 7, professionalism: 5, empathy: 9, maturity: 6, teamwork: 4, accountability: 3, financial: 2 };
      const r = await save({ scores: body });
      expect(r.status).toBe(200);
      expect(r.body.scores).toEqual(body);
      expect(r.body.updatedAt).not.toBeNull();
      expect((await scores()).body.scores).toEqual(body);
      expect((await t.prisma.doctorPointScore.findUnique({ where: { userId: doctor.id } }))?.scores).toEqual(body);
    });

    it('the save is the WHOLE set: a criterion sent as null, or left out, is cleared — never 0', async () => {
      await save({ scores: allScores(7) });
      const r = await save({ scores: { ...allScores(null), integrity: 9 } });
      expect(r.body.scores).toEqual({ integrity: 9 });
      await save({ scores: allScores(7) });
      expect((await save({ scores: { academic: 4 } })).body.scores).toEqual({ academic: 4 });
      expect((await save({ scores: {} })).body.scores).toEqual({});
    });

    it('can be saved again and again; the last save wins', async () => {
      await save({ scores: { integrity: 3 } });
      await save({ scores: { integrity: 8 } });
      expect((await scores()).body.scores).toEqual({ integrity: 8 });
      expect(await t.prisma.doctorPointScore.count({ where: { userId: doctor.id } })).toBe(1);
    });

    it.each([
      [{ integrity: 0 }], [{ integrity: 11 }], [{ integrity: 7.5 }], [{ integrity: '7' }], [{ integrity: -1 }],
      [{ integrity: true }], [{ integrity: [] }], [{ integrity: {} }], [{ honesty: 5 }], [{ constructor: 5 }],
    ])('⚕️ %j is refused with a 400 and the sentence, and what was saved before is kept', async (bad) => {
      await save({ scores: { integrity: 6, academic: 7 } });
      const r = await save({ scores: bad });
      expect(r.status).toBe(400);
      expect(typeof r.body.message).toBe('string');
      expect((await scores()).body.scores).toEqual({ integrity: 6, academic: 7 });
    });

    it.each([[{}], [{ scores: null }], [{ scores: [] }], [{ scores: 'x' }], [{ scores: 7 }]])(
      'a body of %j is refused',
      async (body) => {
        expect((await save(body)).status).toBe(400);
      },
    );

    it('one bad value among good ones refuses the lot — nothing half saved', async () => {
      await save({ scores: { integrity: 6 } });
      expect((await save({ scores: { integrity: 9, academic: 99 } })).status).toBe(400);
      expect((await scores()).body.scores).toEqual({ integrity: 6 });
    });

    it('a doctor\'s stored scores that are not valid (edited by hand) are shown without them, not as a 500', async () => {
      await t.prisma.doctorPointScore.create({ data: { userId: doctor.id, scores: { integrity: 8, academic: 0, honesty: 3, clinical: 'x' } } });
      const r = await scores();
      expect(r.status).toBe(200);
      expect(r.body.scores).toEqual({ integrity: 8 });
    });

    it('⚕️ the doctor never meets their scores: not in sign-in, workstations, the account list the doctor can reach, nor any of their own routes', async () => {
      await save({ scores: allScores(9) });
      const seen = [
        JSON.stringify((await doc.get('/api/auth/me')).body),
        JSON.stringify((await doc.get('/api/workstations')).body),
        JSON.stringify((await doc.get('/api/assistants')).body),
      ].join('|');
      expect(seen).not.toMatch(/point|scores|integrity/i);
      // and the doctor has no route to them
      expect((await doc.get(`/api/admin/users/${doctor.id}/point-scores`)).status).toBe(403);
    });

    it('the scores go with the account when it is deleted (no orphan rows)', async () => {
      const gone = await makeDoctor(t.prisma);
      await save({ scores: { integrity: 5 } }, gone.id);
      await t.prisma.user.delete({ where: { id: gone.id } });
      expect(await t.prisma.doctorPointScore.count({ where: { userId: gone.id } })).toBe(0);
    });
  });

  describe('Dr\'s patient data — the doctor\'s Statistics, read only', () => {
    const TODAY = dhakaDayKey();
    const day = (u: User, queueDate: string, kind: 'done' | 'waiting', chamberId: string | null = null) =>
      t.prisma.opdVisit.create({
        data: { doctorId: u.id, name: 'Test Patient', token: `T-${Math.random().toString(36).slice(2, 8)}`, queueDate, status: kind, chamberId },
      });

    it('⚕️ shows the SAME numbers the doctor sees on their own page', async () => {
      await day(doctor, TODAY, 'done');
      await day(doctor, TODAY, 'done');
      await day(doctor, TODAY, 'waiting');
      const theirs = (await doc.get('/api/statistics/visits/overall')).body;
      const asAdmin = (await adm.get(`/api/admin/users/${doctor.id}/statistics/visits/overall`)).body;
      expect(asAdmin).toEqual(theirs);
      expect(asAdmin.totalVisits).toBe(2);
      const month = TODAY.slice(0, 7);
      expect((await adm.get(`/api/admin/users/${doctor.id}/statistics/visits/days`).query({ month })).body)
        .toEqual((await doc.get('/api/statistics/visits/days').query({ month })).body);
      expect((await adm.get(`/api/admin/users/${doctor.id}/statistics/visits/months`).query({ year: TODAY.slice(0, 4) })).body)
        .toEqual((await doc.get('/api/statistics/visits/months').query({ year: TODAY.slice(0, 4) })).body);
    });

    it('is THIS doctor\'s: another doctor\'s visits never leak into it', async () => {
      await day(other, TODAY, 'done');
      await day(other, TODAY, 'done');
      const r = (await adm.get(`/api/admin/users/${doctor.id}/statistics/visits/overall`)).body;
      expect(r.totalVisits).toBe(0);
      // …and the visits are really there, under the other doctor: the 0 above is
      // not an empty table, and the id in the URL is what picks the practice.
      expect((await adm.get(`/api/admin/users/${other.id}/statistics/visits/overall`)).body.totalVisits).toBe(2);
    });

    it('the disease numbers are the doctor\'s own, patients not visits', async () => {
      const p = await makePatient(t.prisma, doctor.id);
      for (let i = 0; i < 2; i++) {
        await t.prisma.prescription.create({ data: { doctorId: doctor.id, patientId: p.id, finalDiagnosis: ['Test diagnosis'] } });
      }
      const r = (await adm.get(`/api/admin/users/${doctor.id}/statistics/diseases`)).body;
      expect(r).toEqual((await doc.get('/api/statistics/diseases')).body);
      expect(r.diagnoses).toEqual([{ name: 'Test diagnosis', patients: 1 }]);
    });

    it('⚕️ reading it writes nothing into the doctor\'s practice (no default chamber is made by looking)', async () => {
      const fresh = await makeDoctor(t.prisma);
      expect((await adm.get(`/api/admin/users/${fresh.id}/statistics/chambers`)).body).toEqual([]);
      await adm.get(`/api/admin/users/${fresh.id}/statistics/visits/overall`);
      await adm.get(`/api/admin/users/${fresh.id}/statistics/visits/days`);
      expect(await t.prisma.opdChamber.count({ where: { doctorId: fresh.id } })).toBe(0);
    });

    it('lists the doctor\'s live chambers, default first, and none that are removed or another\'s', async () => {
      const mk = (doctorId: string, name: string, extra: object = {}) => t.prisma.opdChamber.create({ data: { doctorId, name, address: '', ...extra } });
      const main = await mk(doctor.id, 'Main chamber', { isDefault: true });
      const ibn = await mk(doctor.id, 'Ibn Sina');
      await mk(doctor.id, 'Gone', { removedAt: new Date() });
      await mk(other.id, 'Not theirs');
      const r = (await adm.get(`/api/admin/users/${doctor.id}/statistics/chambers`)).body as Array<{ id: string; name: string; isDefault: boolean }>;
      expect(r.map((c) => c.id)).toEqual([main.id, ibn.id]);
      expect(r[0].isDefault).toBe(true);
      expect(Object.keys(r[0]).sort()).toEqual(['id', 'isDefault', 'name']);
    });

    it('⚕️ a chamber is a claim: this doctor\'s chamber narrows it; another doctor\'s, a made-up one — 404, never the total in its place', async () => {
      const mine = await t.prisma.opdChamber.create({ data: { doctorId: doctor.id, name: 'Ibn Sina', address: '' } });
      const theirs = await t.prisma.opdChamber.create({ data: { doctorId: other.id, name: 'Other', address: '' } });
      await day(doctor, TODAY, 'done', mine.id);
      await day(doctor, TODAY, 'done', null);
      const url = `/api/admin/users/${doctor.id}/statistics/visits/overall`;
      expect((await adm.get(url).query({ chamber: mine.id })).body.totalVisits).toBe(1);
      expect((await adm.get(url).query({ chamber: 'all' })).body.totalVisits).toBe(2);
      expect((await adm.get(url)).body.totalVisits).toBe(2);
      expect((await adm.get(url).query({ chamber: theirs.id })).status).toBe(404);
      expect((await adm.get(url).query({ chamber: 'made-up' })).status).toBe(404);
      expect((await adm.get(url).query({ chamber: ['a', 'b'] })).status).toBe(400);
    });

    it('a month or a year that is not one is a 400 in words, as on the doctor\'s own page', async () => {
      const base = `/api/admin/users/${doctor.id}/statistics/visits`;
      expect((await adm.get(`${base}/days`).query({ month: '2026-13' })).status).toBe(400);
      expect((await adm.get(`${base}/days`).query({ month: 'November' })).body.message).toMatch(/written like 2026-11/);
      expect((await adm.get(`${base}/months`).query({ year: '26' })).status).toBe(400);
    });
  });
});
