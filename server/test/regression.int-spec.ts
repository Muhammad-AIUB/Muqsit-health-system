import { createTestApp, TestApp } from './support/app';
import {
  loginAs,
  makeAssistantLink,
  makeDoctor,
  makePatient,
  makeSupervisor,
  TEST_PASSWORD,
} from './support/fixtures';
import { admissionBody, makeAdmin, rxBody, storedSheets, WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// Regression tests for server-side fixes that had NO unit spec pinning the
// behaviour end to end (or whose unit spec pins a helper but not the call site
// that uses it). Each test is named with the commit it guards and would fail if
// that fix were reverted. Fixes already pinned by a `src/**/*.spec.ts` are
// deliberately not repeated here.

const DRAFT = { rxItems: ['x'] };

describe('regressions (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  // An owner with a patient carrying an in-progress draft, plus a supervising
  // doctor assigned to that patient.
  const supervised = async () => {
    const owner = await makeDoctor(t.prisma);
    const supervisor = await makeDoctor(t.prisma);
    const patient = await makePatient(t.prisma, owner.id, { incompleteRx: DRAFT } as never);
    await makeSupervisor(t.prisma, patient.id, supervisor.id);
    return {
      owner,
      supervisor,
      patient,
      ownerBrowser: await loginAs(t, owner),
      supervisorBrowser: await loginAs(t, supervisor),
    };
  };

  // ── de9fc55 fix(server): review pass 2 ───────────────────────────────────
  describe('de9fc55 — review pass 2', () => {
    it('de9fc55: a long-term patient with more than 200 history entries can still be saved', async () => {
      const doctor = await makeDoctor(t.prisma);
      const patient = await makePatient(t.prisma, doctor.id);
      const browser = await loginAs(t, doctor);
      const n = 201;

      const res = await browser.patch(`/api/patients/${patient.id}`).send({
        drugHistory: Array.from({ length: n }, (_, i) => `entry ${i}`),
        investigationSummary: Array.from({ length: n }, (_, i) => ({ date: '01/01/2026', test: `t${i}` })),
        onExaminationSummary: Array.from({ length: n }, (_, i) => ({ date: '01/01/2026', text: `e${i}` })),
        prescriptionImages: Array.from({ length: n }, (_, i) => `http://localhost:4100/uploads/p${i}.jpg`),
        reportImages: Array.from({ length: n }, (_, i) => `http://localhost:4100/uploads/r${i}.jpg`),
      });
      expect(res.status).toBe(200);

      const row = await t.prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
      expect(row.drugHistory).toHaveLength(n);
      expect(row.investigationSummary as unknown[]).toHaveLength(n);
      expect(row.onExaminationSummary as unknown[]).toHaveLength(n);
      expect(row.prescriptionImages).toHaveLength(n);
      expect(row.reportImages).toHaveLength(n);
      // Nothing dropped or reordered on the way in.
      expect(row.drugHistory[0]).toBe('entry 0');
      expect(row.drugHistory[n - 1]).toBe(`entry ${n - 1}`);
    });

    it("de9fc55: GET /patients/:id hides the owner's draft from a supervising doctor, not from the owner", async () => {
      const { patient, ownerBrowser, supervisorBrowser } = await supervised();

      const asSupervisor = await supervisorBrowser.get(`/api/patients/${patient.id}`);
      expect(asSupervisor.status).toBe(200);
      expect(asSupervisor.body.id).toBe(patient.id);
      expect(asSupervisor.body.incompleteRx).toBeNull();

      const asOwner = await ownerBrowser.get(`/api/patients/${patient.id}`);
      expect(asOwner.body.incompleteRx).toEqual(DRAFT);
      // Reading never altered the stored draft.
      const row = await t.prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
      expect(row.incompleteRx).toEqual(DRAFT);
    });

    it("de9fc55: GET /patients/by-mobile hides the owner's draft from a supervising doctor", async () => {
      const { patient, ownerBrowser, supervisorBrowser } = await supervised();

      const asSupervisor = await supervisorBrowser.get('/api/patients/by-mobile').query({ mobile: patient.mobile });
      expect(asSupervisor.status).toBe(200);
      expect(asSupervisor.body).toHaveLength(1);
      expect(asSupervisor.body[0].id).toBe(patient.id);
      expect(asSupervisor.body[0].incompleteRx).toBeNull();

      const asOwner = await ownerBrowser.get('/api/patients/by-mobile').query({ mobile: patient.mobile });
      expect(asOwner.body[0].incompleteRx).toEqual(DRAFT);
    });

    it("de9fc55: a supervisor's own prescription does not carry the owner's draft on its patient", async () => {
      const { owner, supervisor, patient, ownerBrowser, supervisorBrowser } = await supervised();

      const saved = await supervisorBrowser.post('/api/prescriptions').send(rxBody(patient.id));
      expect(saved.status).toBe(201);
      // Stored under the supervisor's own id (Rule 2).
      expect(saved.body.doctorId).toBe(supervisor.id);

      const res = await supervisorBrowser.get(`/api/prescriptions/${saved.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.patient.id).toBe(patient.id);
      expect(res.body.patient.incompleteRx).toBeNull();

      // The owner's own prescription on the same patient still carries it.
      const ownRx = await ownerBrowser.post('/api/prescriptions').send(rxBody(patient.id));
      const ownRead = await ownerBrowser.get(`/api/prescriptions/${ownRx.body.id}`);
      expect(ownRead.body.doctorId).toBe(owner.id);
      expect(ownRead.body.patient.incompleteRx).toEqual(DRAFT);
    });

    it('de9fc55: a clinical PATCH racing an order-sheet upload never erases the page (row lock)', async () => {
      const doctor = await makeDoctor(t.prisma);
      const browser = await loginAs(t, doctor);
      const admit = await browser.post('/api/ipd').send(admissionBody());
      const id = admit.body.id as string;

      const ROUNDS = 6;
      for (let i = 0; i < ROUNDS; i += 1) {
        const [patch, add] = await Promise.all([
          // An old client: whole-clinical write that does not know the key.
          browser.patch(`/api/ipd/${id}`).send({ clinical: { diagnosis: [`round ${i}`] } }),
          browser.post(`/api/ipd/${id}/analogue`).send({ sheets: [{ url: `/uploads/r${i}.jpg` }] }),
        ]);
        expect(patch.status).toBe(200);
        expect(add.status).toBe(201);
        const { sheets } = await storedSheets(t.prisma, id);
        expect(sheets.map((s) => s.url)).toEqual(Array.from({ length: i + 1 }, (_, k) => `/uploads/r${k}.jpg`));
      }
      // One audit line per page, and one page per audit line.
      expect(await t.prisma.ipdEvent.count({ where: { admissionId: id } })).toBe(ROUNDS);
    });

    it('de9fc55: the role on an IPD event comes from the workstation, never the body', async () => {
      const doctor = await makeDoctor(t.prisma);
      const assistant = await makeDoctor(t.prisma, { accountTier: 'secondary' });
      await makeAssistantLink(t.prisma, doctor.id, assistant.id, []);
      const browser = await loginAs(t, doctor);
      const asst = await loginAs(t, assistant);
      const admit = await browser.post('/api/ipd').send(admissionBody());
      const id = admit.body.id as string;

      const byAssistant = await asst
        .post(`/api/ipd/${id}/events`)
        .set(WS, doctor.id)
        .send({ note: 'Review sugar chart', role: 'Doctor' });
      expect(byAssistant.status).toBe(201);
      expect(byAssistant.body.role).toBe('Assistant');
      expect(byAssistant.body.author).toBe(assistant.name);

      const byOwner = await browser.post(`/api/ipd/${id}/events`).send({ note: 'Bed rest', role: 'Consultant' });
      expect(byOwner.status).toBe(201);
      expect(byOwner.body.role).toBeNull();
      expect(byOwner.body.author).toBe(doctor.name);

      const rows = await t.prisma.ipdEvent.findMany({ where: { admissionId: id }, orderBy: { createdAt: 'asc' } });
      expect(rows.map((r) => r.role)).toEqual(['Assistant', null]);
    });

    it('de9fc55: a template line keeps `generic` and `isCont` (the whitelist used to strip them)', async () => {
      const doctor = await makeDoctor(t.prisma);
      const browser = await loginAs(t, doctor);
      const items = [
        { drug: 'Tablet. Barcavir 0.5 mg', dose: '0+0+1', duration: '7 days', instruction: '', generic: 'Entecavir' },
        { drug: 'Capsule. Levat 4 mg', dose: '0+0+1', duration: '7 days', instruction: '', isCont: false },
        { drug: 'Capsule. Levat 4 mg', dose: '0+0+2', duration: 'Continue', instruction: '', isCont: true },
      ];

      const created = await browser.post('/api/prescription-templates').send({ category: 'opd', name: 'T1', items });
      expect(created.status).toBe(201);
      expect(created.body.items).toEqual(items);

      const list = await browser.get('/api/prescription-templates').query({ category: 'opd' });
      expect(list.body).toHaveLength(1);
      expect(list.body[0].items).toEqual(items);

      // The PATCH route shares the item DTO.
      const patched = await browser
        .patch(`/api/prescription-templates/${created.body.id}`)
        .send({ items: [items[0]] });
      expect(patched.status).toBe(200);
      expect(patched.body.items[0].generic).toBe('Entecavir');
    });

    it('de9fc55: the assistant search does not offer an account that is in Trash', async () => {
      const doctor = await makeDoctor(t.prisma);
      const tag = `trash${Date.now()}`;
      const live = await makeDoctor(t.prisma, { email: `${tag}.live@test.invalid` });
      const trashed = await makeDoctor(t.prisma, {
        email: `${tag}.gone@test.invalid`,
        deletedAt: new Date(),
      });
      const browser = await loginAs(t, doctor);

      const res = await browser.get('/api/assistants/search').query({ q: tag });
      expect(res.status).toBe(200);
      const ids = res.body.map((u: { id: string }) => u.id);
      expect(ids).toContain(live.id);
      expect(ids).not.toContain(trashed.id);
    });

    it("de9fc55: permanent delete is refused while the account wrote in ANOTHER practice's patient chat", async () => {
      const admin = await loginAs(t, await makeAdmin(t.prisma));
      const other = await makeDoctor(t.prisma);
      const leaving = await makeDoctor(t.prisma, { deletedAt: new Date() });
      const othersPatient = await makePatient(t.prisma, other.id);
      const message = await t.prisma.patientChatMessage.create({
        data: { patientId: othersPatient.id, authorId: leaving.id, authorName: leaving.name, body: 'Bed rest' },
      });

      const res = await admin.delete(`/api/admin/registrations/${leaving.id}/permanent`);
      expect(res.status).toBe(409);
      expect(await t.prisma.user.count({ where: { id: leaving.id } })).toBe(1);
      expect(await t.prisma.patientChatMessage.count({ where: { id: message.id } })).toBe(1);
    });

    it('de9fc55: a message in the account’s OWN practice does not block the permanent delete', async () => {
      const admin = await loginAs(t, await makeAdmin(t.prisma));
      const leaving = await makeDoctor(t.prisma, { deletedAt: new Date() });
      const ownPatient = await makePatient(t.prisma, leaving.id);
      await t.prisma.patientChatMessage.create({
        data: { patientId: ownPatient.id, authorId: leaving.id, authorName: leaving.name, body: 'Bed rest' },
      });

      const res = await admin.delete(`/api/admin/registrations/${leaving.id}/permanent`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: true });
      expect(await t.prisma.user.count({ where: { id: leaving.id } })).toBe(0);
    });
  });

  // ── 3637964 fix(server): review pass 1 ───────────────────────────────────
  describe('3637964 — review pass 1', () => {
    it('3637964: sign-in matches the email whatever case it was typed in', async () => {
      const stored = `Dr.Case.${Date.now()}@Test.Invalid`;
      const doctor = await makeDoctor(t.prisma, { email: stored });

      for (const typed of [stored.toLowerCase(), stored.toUpperCase(), stored]) {
        const res = await t.agent().post('/api/auth/login').send({ identifier: typed, password: TEST_PASSWORD });
        expect(res.status).toBe(200);
        expect(res.body.user.id).toBe(doctor.id);
      }
    });

    it('3637964: registration refuses a mobile number a verified account already signs in with', async () => {
      const existing = await makeDoctor(t.prisma);
      const email = `new.${Date.now()}@test.invalid`;

      const res = await t.agent().post('/api/auth/register').send({
        name: 'Test Signup',
        email,
        mobile: existing.mobile,
        profession: 'doctor',
        registrationNo: 'T-1',
        nidNo: '1',
        designation: 'Test',
        specialty: 'Test',
        password: TEST_PASSWORD,
        registrationCertUrl: 'http://localhost:4100/uploads/c.jpg',
        nidFrontUrl: 'http://localhost:4100/uploads/f.jpg',
        nidBackUrl: 'http://localhost:4100/uploads/b.jpg',
        profilePictureUrl: 'http://localhost:4100/uploads/p.jpg',
      });
      expect(res.status).toBe(409);
      expect(String(res.body.message)).toMatch(/mobile/i);
      expect(await t.prisma.user.count({ where: { email } })).toBe(0);
      expect(await t.prisma.user.count({ where: { mobile: existing.mobile } })).toBe(1);
    });
  });

  // ── bdee531 fix(review): patients survive account deletion ───────────────
  describe('bdee531 — patients survive account deletion', () => {
    it('bdee531: permanently deleting a doctor keeps their patients and durable history', async () => {
      const admin = await loginAs(t, await makeAdmin(t.prisma));
      const leaving = await makeDoctor(t.prisma);
      const patient = await makePatient(t.prisma, leaving.id, {
        drugHistory: ['entry 0'],
        investigationSummary: [{ date: '01/01/2026', test: 't0' }],
      } as never);
      const rx = await t.prisma.prescription.create({ data: { patientId: patient.id, doctorId: leaving.id } });
      await t.prisma.user.update({ where: { id: leaving.id }, data: { deletedAt: new Date() } });

      const res = await admin.delete(`/api/admin/registrations/${leaving.id}/permanent`);
      expect(res.status).toBe(200);

      const row = await t.prisma.patient.findUnique({ where: { id: patient.id } });
      expect(row).not.toBeNull();
      expect(row!.doctorId).toBeNull();
      expect(row!.name).toBe(patient.name);
      expect(row!.mobile).toBe(patient.mobile);
      expect(row!.drugHistory).toEqual(['entry 0']);
      expect(row!.investigationSummary).toEqual([{ date: '01/01/2026', test: 't0' }]);
      // Documented: that doctor's own prescriptions go with the account.
      expect(await t.prisma.prescription.count({ where: { id: rx.id } })).toBe(0);
    });

    it('ecc5c12: a live account cannot be permanently deleted — it must be in Trash first', async () => {
      const admin = await loginAs(t, await makeAdmin(t.prisma));
      const doctor = await makeDoctor(t.prisma);
      const res = await admin.delete(`/api/admin/registrations/${doctor.id}/permanent`);
      expect(res.status).toBe(400);
      expect(await t.prisma.user.count({ where: { id: doctor.id } })).toBe(1);
    });
  });

  // ── 226a1c8 fix(dates) — server half: dob validation ─────────────────────
  describe('226a1c8 — date of birth validation', () => {
    it('226a1c8: a future or malformed dob is a 400, never a stored date or a 500', async () => {
      const doctor = await makeDoctor(t.prisma);
      const browser = await loginAs(t, doctor);

      for (const dob of ['2098-03-03', 'garbage', '2026-02-31', '03/03/1998']) {
        const res = await browser.post('/api/patients').send({ name: 'Test Patient dob', dob });
        expect(res.status).toBe(400);
      }
      expect(await t.prisma.patient.count({ where: { doctorId: doctor.id } })).toBe(0);

      const ok = await browser.post('/api/patients').send({ name: 'Test Patient dob', dob: '1998-03-03' });
      expect(ok.status).toBe(201);
      expect(new Date(ok.body.dob).toISOString().slice(0, 10)).toBe('1998-03-03');
    });
  });

  // ── 3b56595 fix(auth): concurrent refresh must not log every device out ──
  describe('3b56595 — refresh rotation grace window', () => {
    it('3b56595: a just-rotated refresh token presented again by the same browser still gets a session', async () => {
      const doctor = await makeDoctor(t.prisma);
      const UA = 'muqsit-int-test/1.0';
      const login = await t
        .agent()
        .post('/api/auth/login')
        .set('User-Agent', UA)
        .send({ identifier: doctor.email, password: TEST_PASSWORD });
      expect(login.status).toBe(200);
      const setCookie = login.headers['set-cookie'] as unknown as string[];
      const rt = setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('mhs_rt='));
      expect(rt).toBeDefined();

      // Two tabs holding the same refresh cookie.
      const first = await t.agent().post('/api/auth/refresh').set('User-Agent', UA).set('Cookie', rt!);
      expect(first.status).toBe(200);
      const second = await t.agent().post('/api/auth/refresh').set('User-Agent', UA).set('Cookie', rt!);
      expect(second.status).toBe(200);
      expect(second.body.user.id).toBe(doctor.id);

      // The family was NOT killed: the first tab's new token is still live.
      const live = await t.prisma.refreshToken.count({ where: { userId: doctor.id, revokedAt: null } });
      expect(live).toBeGreaterThanOrEqual(1);
    });

    it('ecc5c12: the same replay from a DIFFERENT client is theft — refused, and the family is revoked', async () => {
      const doctor = await makeDoctor(t.prisma);
      const login = await t
        .agent()
        .post('/api/auth/login')
        .set('User-Agent', 'muqsit-int-test/1.0')
        .send({ identifier: doctor.email, password: TEST_PASSWORD });
      const setCookie = login.headers['set-cookie'] as unknown as string[];
      const rt = setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('mhs_rt='))!;

      await t.agent().post('/api/auth/refresh').set('User-Agent', 'muqsit-int-test/1.0').set('Cookie', rt).expect(200);
      const replay = await t.agent().post('/api/auth/refresh').set('User-Agent', 'another-client/9').set('Cookie', rt);
      expect(replay.status).toBe(401);
      expect(await t.prisma.refreshToken.count({ where: { userId: doctor.id, revokedAt: null } })).toBe(0);
    });
  });

  // ── ecc5c12 fix(security): full-app correctness & scoping review ─────────
  describe('ecc5c12 — full-app review', () => {
    it('ecc5c12: a bed with a non-discharged patient cannot be given to a second admission', async () => {
      const doctor = await makeDoctor(t.prisma);
      const browser = await loginAs(t, doctor);
      const first = await browser.post('/api/ipd').send({ bed: 'B-1', name: 'Test Inpatient A' });
      expect(first.status).toBe(201);

      const clash = await browser.post('/api/ipd').send({ bed: 'B-1', name: 'Test Inpatient B' });
      expect(clash.status).toBe(409);
      expect(await t.prisma.ipdAdmission.count({ where: { doctorId: doctor.id } })).toBe(1);

      // Moving another admission INTO the occupied bed is refused too.
      const second = await browser.post('/api/ipd').send({ bed: 'B-2', name: 'Test Inpatient B' });
      const move = await browser.patch(`/api/ipd/${second.body.id}`).send({ bed: 'B-1' });
      expect(move.status).toBe(409);

      // Once discharged, the bed is free again — and the discharged patient
      // cannot be re-activated into it while someone else is there.
      await browser.patch(`/api/ipd/${first.body.id}/status`).send({ status: 'Discharge' }).expect(200);
      const reuse = await browser.post('/api/ipd').send({ bed: 'B-1', name: 'Test Inpatient C' });
      expect(reuse.status).toBe(201);
      const readmit = await browser.patch(`/api/ipd/${first.body.id}/status`).send({ status: 'Stable' });
      expect(readmit.status).toBe(409);

      // Another practice's "B-1" is a different bed.
      const other = await loginAs(t, await makeDoctor(t.prisma));
      const theirs = await other.post('/api/ipd').send({ bed: 'B-1', name: 'Test Inpatient D' });
      expect(theirs.status).toBe(201);
    });

    it('ecc5c12: an OPD token is never reused after a mid-day visit is removed', async () => {
      const doctor = await makeDoctor(t.prisma);
      const browser = await loginAs(t, doctor);
      const a = await browser.post('/api/opd').send({ name: 'Test Visit A' });
      const b = await browser.post('/api/opd').send({ name: 'Test Visit B' });
      expect([a.status, b.status]).toEqual([201, 201]);
      expect([a.body.token, b.body.token]).toEqual(['T-01', 'T-02']);

      await t.prisma.opdVisit.delete({ where: { id: a.body.id } });

      const c = await browser.post('/api/opd').send({ name: 'Test Visit C' });
      // A bare count() would hand out T-02 a second time.
      expect(c.body.token).toBe('T-03');
    });

    it('ecc5c12: an account moved to Trash loses its live session on the next request', async () => {
      const doctor = await makeDoctor(t.prisma);
      const browser = await loginAs(t, doctor);
      expect((await browser.get('/api/auth/me')).status).toBe(200);

      await t.prisma.user.update({ where: { id: doctor.id }, data: { deletedAt: new Date() } });
      expect((await browser.get('/api/auth/me')).status).toBe(401);
      expect((await browser.get('/api/patients')).status).toBe(401);

      await t.prisma.user.update({ where: { id: doctor.id }, data: { deletedAt: null, approvalStatus: 'suspended' } });
      expect((await browser.get('/api/auth/me')).status).toBe(401);
    });

    it('ecc5c12: an assistant can never delete a patient, whatever keys they hold', async () => {
      const doctor = await makeDoctor(t.prisma);
      const assistant = await makeDoctor(t.prisma, { accountTier: 'secondary' });
      await makeAssistantLink(t.prisma, doctor.id, assistant.id, ['pt.info', 'pt.family', 'rx.savePrint']);
      const patient = await makePatient(t.prisma, doctor.id);
      const asst = await loginAs(t, assistant);

      const res = await asst.delete(`/api/patients/${patient.id}`).set(WS, doctor.id);
      expect(res.status).toBe(403);
      expect(await t.prisma.patient.count({ where: { id: patient.id } })).toBe(1);
    });

    // The rx.savePrint backstop is older (d1f88f8); it is checked alongside
    // because the pt.info gate was written to mirror it.
    it('ecc5c12: an assistant without pt.info cannot edit demographics (and, d1f88f8, without rx.savePrint cannot save a ℞)', async () => {
      const doctor = await makeDoctor(t.prisma);
      const assistant = await makeDoctor(t.prisma, { accountTier: 'secondary' });
      await makeAssistantLink(t.prisma, doctor.id, assistant.id, []);
      const patient = await makePatient(t.prisma, doctor.id);
      const asst = await loginAs(t, assistant);

      const edit = await asst.patch(`/api/patients/${patient.id}`).set(WS, doctor.id).send({ name: 'Changed' });
      expect(edit.status).toBe(403);
      const rx = await asst.post('/api/prescriptions').set(WS, doctor.id).send(rxBody(patient.id));
      expect(rx.status).toBe(403);

      const row = await t.prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
      expect(row.name).toBe(patient.name);
      expect(await t.prisma.prescription.count({ where: { patientId: patient.id } })).toBe(0);
    });
  });
});
