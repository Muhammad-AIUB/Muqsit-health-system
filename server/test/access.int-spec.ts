import type { Patient, User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import {
  loginAs,
  makeAssistantLink,
  makeDoctor,
  makePatient,
  makeSupervisor,
} from './support/fixtures';
import { resetDb } from './support/test-db';

// The access matrix from server/CLAUDE.md "Rule 2", driven through the real
// HTTP pipeline. Actors:
//
//   A         owner doctor — the practice every patient below belongs to
//   asstFull  assistant of A holding pt.info + pt.family + rx.savePrint
//   asstRx    assistant of A holding rx.savePrint only
//   asstNone  assistant of A holding no key at all
//   asstSusp  assistant of A whose link is suspended
//   S         supervising doctor (PatientSupervisor on specific patients of A)
//   X         unrelated doctor
//   dual      a doctor with their own practice who ALSO assists A
type Browser = ReturnType<TestApp['agent']>;

const OWNER_DRAFT = { marker: 'owner-draft', chiefComplaints: ['Test complaint'] };
const RX_ITEM = { drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', instruction: '' };

describe('patient access matrix (server/CLAUDE.md Rule 2)', () => {
  let t: TestApp;
  let A: User, S: User, X: User, dual: User;
  let asstFull: User, asstRx: User, asstNone: User, asstSusp: User;
  let a: Browser, s: Browser, x: Browser, d: Browser;
  let full: Browser, rxOnly: Browser, none: Browser, susp: Browser;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);

    [A, S, X, dual] = await Promise.all([
      makeDoctor(t.prisma),
      makeDoctor(t.prisma),
      makeDoctor(t.prisma),
      makeDoctor(t.prisma),
    ]);
    [asstFull, asstRx, asstNone, asstSusp] = await Promise.all([
      makeDoctor(t.prisma, { accountTier: 'secondary' }),
      makeDoctor(t.prisma, { accountTier: 'secondary' }),
      makeDoctor(t.prisma, { accountTier: 'secondary' }),
      makeDoctor(t.prisma, { accountTier: 'secondary' }),
    ]);
    await makeAssistantLink(t.prisma, A.id, asstFull.id, ['pt.info', 'pt.family', 'rx.savePrint']);
    await makeAssistantLink(t.prisma, A.id, asstRx.id, ['rx.savePrint']);
    await makeAssistantLink(t.prisma, A.id, asstNone.id, []);
    await makeAssistantLink(t.prisma, A.id, asstSusp.id, ['pt.info', 'pt.family', 'rx.savePrint'], 'suspended');
    await makeAssistantLink(t.prisma, A.id, dual.id, []);

    a = await loginAs(t, A);
    s = await loginAs(t, S);
    x = await loginAs(t, X);
    d = await loginAs(t, dual);
    full = await loginAs(t, asstFull);
    rxOnly = await loginAs(t, asstRx);
    none = await loginAs(t, asstNone);
    susp = await loginAs(t, asstSusp);
  });
  afterAll(async () => {
    await t.close();
  });

  // ── helpers ───────────────────────────────────────────────────────────────
  const inA = () => ({ 'X-Workstation': A.id });

  // A patient of A carrying the owner's in-progress draft, supervised by S.
  async function supervisedPatient(): Promise<Patient> {
    const p = await makePatient(t.prisma, A.id, { incompleteRx: OWNER_DRAFT } as never);
    await makeSupervisor(t.prisma, p.id, S.id);
    return p;
  }
  const row = (id: string) => t.prisma.patient.findUnique({ where: { id } });
  const rxBody = (patientId: string, extra: Record<string, unknown> = {}) => ({
    patientId,
    items: [RX_ITEM],
    ...extra,
  });
  const ids = (body: unknown) => (body as { id: string }[]).map((r) => r.id);

  // ── the workstation header ────────────────────────────────────────────────
  describe('X-Workstation', () => {
    const routes: [string, (b: Browser, p: Patient) => ReturnType<Browser['get']>][] = [
      ['GET /patients', (b) => b.get('/api/patients')],
      ['GET /patients/by-mobile', (b, p) => b.get('/api/patients/by-mobile').query({ mobile: p.mobile })],
      ['GET /patients/:id', (b, p) => b.get(`/api/patients/${p.id}`)],
      ['PATCH /patients/:id', (b, p) => b.patch(`/api/patients/${p.id}`).send({ district: 'Forged' })],
      ['DELETE /patients/:id', (b, p) => b.delete(`/api/patients/${p.id}`)],
      ['GET /prescriptions', (b, p) => b.get('/api/prescriptions').query({ patientId: p.id })],
      ['POST /prescriptions', (b, p) => b.post('/api/prescriptions').send({ patientId: p.id, items: [RX_ITEM] })],
      ['GET /opd', (b) => b.get('/api/opd')],
      ['GET /ipd', (b) => b.get('/api/ipd')],
      ['GET /activity', (b) => b.get('/api/activity')],
    ];

    it.each(routes)('%s — a forged header (a doctor the user does not assist) is 403', async (_n, call) => {
      const p = await supervisedPatient();
      // X is nobody to A; S supervises this very patient — supervision is not a workstation.
      for (const browser of [x, s]) {
        const res = await call(browser, p).set(inA());
        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).not.toContain(p.name);
      }
      const after = await row(p.id);
      expect(after).not.toBeNull();
      expect(after!.district).toBeNull();
      expect(await t.prisma.prescription.count({ where: { patientId: p.id } })).toBe(0);
    });

    it.each(routes)('%s — a suspended assistant link is 403', async (_n, call) => {
      const p = await supervisedPatient();
      const res = await call(susp, p).set(inA());
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain(p.name);
      const after = await row(p.id);
      expect(after).not.toBeNull();
      expect(after!.district).toBeNull();
      expect(await t.prisma.prescription.count({ where: { patientId: p.id } })).toBe(0);
    });

    it('a header naming no user at all is 403', async () => {
      const res = await a.get('/api/patients').set('X-Workstation', 'no-such-doctor-id');
      expect(res.status).toBe(403);
    });

    it("the user's own id in the header is their own practice", async () => {
      const p = await makePatient(t.prisma, A.id);
      const res = await a.get(`/api/patients/${p.id}`).set('X-Workstation', A.id);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(p.id);
    });

    it('an assistant WITHOUT the header acts as themselves and reaches nothing of the practice', async () => {
      const p = await supervisedPatient();
      await t.prisma.prescription.create({ data: { patientId: p.id, doctorId: A.id } });

      expect((await full.get(`/api/patients/${p.id}`)).status).toBe(404);
      const byMobile = await full.get('/api/patients/by-mobile').query({ mobile: p.mobile });
      expect(byMobile.status).toBe(200);
      expect(byMobile.body).toEqual([]);
      const list = await full.get('/api/prescriptions').query({ patientId: p.id });
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);
      expect((await full.patch(`/api/patients/${p.id}`).send({ district: 'Nope' })).status).toBe(404);
      expect((await full.post('/api/prescriptions').send(rxBody(p.id))).status).toBe(404);
      expect((await full.delete(`/api/patients/${p.id}`)).status).toBe(404);
      expect((await row(p.id))!.district).toBeNull();
    });
  });

  // ── find by mobile ────────────────────────────────────────────────────────
  describe('GET /patients/by-mobile', () => {
    it('owner and assistants find the patient with the draft; the supervisor finds it WITHOUT the draft', async () => {
      const p = await supervisedPatient();
      const find = (b: Browser) => b.get('/api/patients/by-mobile').query({ mobile: p.mobile });

      const owner = await find(a);
      expect(owner.status).toBe(200);
      expect(ids(owner.body)).toEqual([p.id]);
      expect(owner.body[0].incompleteRx).toEqual(OWNER_DRAFT);

      // An assistant needs no key to look a patient up, and reads as the owner.
      for (const assistant of [full, rxOnly, none, d]) {
        const res = await find(assistant).set(inA());
        expect(res.status).toBe(200);
        expect(ids(res.body)).toEqual([p.id]);
        expect(res.body[0].incompleteRx).toEqual(OWNER_DRAFT);
      }

      const sup = await find(s);
      expect(sup.status).toBe(200);
      expect(ids(sup.body)).toEqual([p.id]);
      expect(sup.body[0].name).toBe(p.name);
      expect(sup.body[0].incompleteRx).toBeNull();
    });

    it('an unrelated doctor gets an empty list — never the row', async () => {
      const p = await supervisedPatient();
      const res = await x.get('/api/patients/by-mobile').query({ mobile: p.mobile });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('a shared number returns only the rows each doctor may reach', async () => {
      const p = await supervisedPatient();
      const unsupervised = await makePatient(t.prisma, A.id, { mobile: p.mobile });
      const ofX = await makePatient(t.prisma, X.id, { mobile: p.mobile });
      const find = (b: Browser) => b.get('/api/patients/by-mobile').query({ mobile: p.mobile });

      expect(ids((await find(a)).body).sort()).toEqual([p.id, unsupervised.id].sort());
      expect(ids((await find(s)).body)).toEqual([p.id]);
      expect(ids((await find(x)).body)).toEqual([ofX.id]);
    });

    it("GET /patients (the practice list) never includes another practice's or a supervised patient", async () => {
      const p = await supervisedPatient();
      const mine = await a.get('/api/patients').query({ search: p.name });
      expect(ids(mine.body)).toEqual([p.id]);
      for (const other of [s, x]) {
        const res = await other.get('/api/patients').query({ search: p.name });
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      }
    });
  });

  // ── open ──────────────────────────────────────────────────────────────────
  describe('GET /patients/:id', () => {
    it('owner and assistants read the row including the owner draft', async () => {
      const p = await supervisedPatient();
      const owner = await a.get(`/api/patients/${p.id}`);
      expect(owner.status).toBe(200);
      expect(owner.body.incompleteRx).toEqual(OWNER_DRAFT);

      for (const assistant of [full, rxOnly, none]) {
        const res = await assistant.get(`/api/patients/${p.id}`).set(inA());
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(p.id);
        expect(res.body.incompleteRx).toEqual(OWNER_DRAFT);
      }
    });

    it('the supervisor reads the row with incompleteRx: null even though the owner has a draft', async () => {
      const p = await supervisedPatient();
      const res = await s.get(`/api/patients/${p.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(p.id);
      expect(res.body.name).toBe(p.name);
      expect(res.body).toHaveProperty('incompleteRx', null);
      expect(JSON.stringify(res.body)).not.toContain(OWNER_DRAFT.marker);
      // Reading must not have erased the owner's stored draft.
      expect((await row(p.id))!.incompleteRx).toEqual(OWNER_DRAFT);
    });

    it('supervision is per patient: another patient of the same owner is 404 for the supervisor', async () => {
      const other = await makePatient(t.prisma, A.id);
      expect((await s.get(`/api/patients/${other.id}`)).status).toBe(404);
    });

    it('an unrelated doctor gets 404 and no patient data', async () => {
      const p = await supervisedPatient();
      const res = await x.get(`/api/patients/${p.id}`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(p.name);
      // Indistinguishable from an id that does not exist.
      const missing = await x.get('/api/patients/no-such-patient-id');
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual(res.body);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────
  describe('PATCH /patients/:id', () => {
    it('owner updates', async () => {
      const p = await supervisedPatient();
      const res = await a.patch(`/api/patients/${p.id}`).send({ district: 'Owner district' });
      expect(res.status).toBe(200);
      expect((await row(p.id))!.district).toBe('Owner district');
    });

    it('assistant with pt.info edits demographics; with pt.family the family tree', async () => {
      const p = await supervisedPatient();
      const info = await full.patch(`/api/patients/${p.id}`).set(inA()).send({ district: 'Assistant district' });
      expect(info.status).toBe(200);
      const family = [{ name: 'Test Relative', mobile: '', nid: '', sex: '', relation: 'Brother' }];
      const fam = await full.patch(`/api/patients/${p.id}`).set(inA()).send({ familyMembers: family });
      expect(fam.status).toBe(200);

      const after = await row(p.id);
      expect(after!.district).toBe('Assistant district');
      expect(after!.familyMembers).toEqual(family);
      expect(after!.doctorId).toBe(A.id);
    });

    it('assistant without pt.info / pt.family is 403 and nothing is written', async () => {
      const p = await supervisedPatient();
      const family = [{ name: 'Test Relative', mobile: '', nid: '', sex: '', relation: 'Brother' }];
      for (const assistant of [none, rxOnly]) {
        expect(
          (await assistant.patch(`/api/patients/${p.id}`).set(inA()).send({ district: 'Denied' })).status,
        ).toBe(403);
        expect(
          (await assistant.patch(`/api/patients/${p.id}`).set(inA()).send({ familyMembers: family })).status,
        ).toBe(403);
        // A permitted field does not carry a forbidden one through with it.
        expect(
          (
            await assistant
              .patch(`/api/patients/${p.id}`)
              .set(inA())
              .send({ incompleteRx: { marker: 'x' }, district: 'Denied' })
          ).status,
        ).toBe(403);
      }
      const after = await row(p.id);
      expect(after!.district).toBeNull();
      expect(after!.familyMembers).toEqual([]);
      expect(after!.incompleteRx).toEqual(OWNER_DRAFT);
    });

    it('prescription-lifecycle fields need some rx.* grant: allowed with one, 403 with none', async () => {
      const p = await supervisedPatient();
      const draft = { marker: 'assistant-draft' };

      const denied = await none.patch(`/api/patients/${p.id}`).set(inA()).send({ incompleteRx: draft });
      expect(denied.status).toBe(403);
      expect((await row(p.id))!.incompleteRx).toEqual(OWNER_DRAFT);

      const ok = await rxOnly.patch(`/api/patients/${p.id}`).set(inA()).send({ incompleteRx: draft });
      expect(ok.status).toBe(200);
      expect((await row(p.id))!.incompleteRx).toEqual(draft);
    });

    // server/CLAUDE.md's Rule 2 table lists "update patient" as allowed for a
    // supervisor, but patients.service.ts#update refuses it on purpose
    // ("must never mutate the OWNER's canonical patient record"), and the
    // hmDrugDates section of the same document relies on that very check.
    // This pins the code's (stricter) behaviour; the table cell is reported as
    // a documentation contradiction, not weakened here.
    it('the supervisor cannot modify the owner record (403), whatever the field', async () => {
      const p = await supervisedPatient();
      const bodies: Record<string, unknown>[] = [
        { district: 'Supervisor district' },
        { name: 'Renamed By Supervisor' },
        { familyMembers: [{ name: 'Test Relative', mobile: '', nid: '', sex: '', relation: 'Brother' }] },
        { incompleteRx: { marker: 'supervisor-draft' } },
        { incompleteRx: null },
        { drugHistory: ['01/01/2026: Tablet. Napa 500mg'] },
      ];
      for (const body of bodies) {
        const res = await s.patch(`/api/patients/${p.id}`).send(body);
        expect(res.status).toBe(403);
      }
      const after = await row(p.id);
      expect(after!.name).toBe(p.name);
      expect(after!.district).toBeNull();
      expect(after!.familyMembers).toEqual([]);
      expect(after!.drugHistory).toEqual([]);
      expect(after!.incompleteRx).toEqual(OWNER_DRAFT);
    });

    it('an unrelated doctor gets 404 and the row is untouched', async () => {
      const p = await supervisedPatient();
      const res = await x.patch(`/api/patients/${p.id}`).send({ district: 'X district', name: 'Renamed' });
      expect(res.status).toBe(404);
      const after = await row(p.id);
      expect(after!.district).toBeNull();
      expect(after!.name).toBe(p.name);
    });
  });

  // ── hmDrugDates / hmSymptomDates: owner only ──────────────────────────────
  describe('health-monitoring duration overrides (owner only)', () => {
    const DRUG_DATES = { 'Tablet. Napa 500mg': { sf: '01/01/2026', upto: '08/01/2026' } };
    const SYMPTOM_DATES = { 'Test complaint': { sf: '01/01/2026', upto: '08/01/2026' } };

    it('the owner writes both', async () => {
      const p = await supervisedPatient();
      const res = await a
        .patch(`/api/patients/${p.id}`)
        .send({ hmDrugDates: DRUG_DATES, hmSymptomDates: SYMPTOM_DATES });
      expect(res.status).toBe(200);
      const after = await row(p.id);
      expect(after!.hmDrugDates).toEqual(DRUG_DATES);
      expect(after!.hmSymptomDates).toEqual(SYMPTOM_DATES);
    });

    it.each([
      ['hmDrugDates', { hmDrugDates: DRUG_DATES }],
      ['hmSymptomDates', { hmSymptomDates: SYMPTOM_DATES }],
      ['hmDrugDates beside a field the assistant MAY write', { hmDrugDates: DRUG_DATES, district: 'Smuggled' }],
      ['hmSymptomDates beside incompleteRx', { hmSymptomDates: SYMPTOM_DATES, incompleteRx: { marker: 'x' } }],
    ])('an assistant is 403 on %s — even holding every key', async (_label, body) => {
      const p = await supervisedPatient();
      for (const assistant of [full, rxOnly, none]) {
        const res = await assistant.patch(`/api/patients/${p.id}`).set(inA()).send(body);
        expect(res.status).toBe(403);
      }
      const after = await row(p.id);
      expect(after!.hmDrugDates).toBeNull();
      expect(after!.hmSymptomDates).toBeNull();
      expect(after!.district).toBeNull();
      expect(after!.incompleteRx).toEqual(OWNER_DRAFT);
    });

    it.each([
      ['hmDrugDates', { hmDrugDates: DRUG_DATES }],
      ['hmSymptomDates', { hmSymptomDates: SYMPTOM_DATES }],
    ])('the supervising doctor is 403 on %s (stopped in the service, not the controller)', async (_label, body) => {
      const p = await supervisedPatient();
      const res = await s.patch(`/api/patients/${p.id}`).send(body);
      expect(res.status).toBe(403);
      const after = await row(p.id);
      expect(after!.hmDrugDates).toBeNull();
      expect(after!.hmSymptomDates).toBeNull();
    });

    it('an unrelated doctor is 404', async () => {
      const p = await supervisedPatient();
      const res = await x.patch(`/api/patients/${p.id}`).send({ hmDrugDates: DRUG_DATES });
      expect(res.status).toBe(404);
      expect((await row(p.id))!.hmDrugDates).toBeNull();
    });
  });

  // ── prescriptions ─────────────────────────────────────────────────────────
  describe('prescriptions', () => {
    it("create: owner and a granted assistant write under the OWNER's doctorId", async () => {
      const p = await supervisedPatient();

      const byOwner = await a.post('/api/prescriptions').send(rxBody(p.id));
      expect(byOwner.status).toBe(201);
      expect(byOwner.body.doctorId).toBe(A.id);

      for (const assistant of [full, rxOnly]) {
        const res = await assistant.post('/api/prescriptions').set(inA()).send(rxBody(p.id));
        expect(res.status).toBe(201);
        expect(res.body.doctorId).toBe(A.id);
        expect(res.body.patientId).toBe(p.id);
      }
      const rows = await t.prisma.prescription.findMany({ where: { patientId: p.id } });
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.doctorId === A.id)).toBe(true);
    });

    it('create: an assistant without rx.savePrint is 403 and nothing is stored', async () => {
      const p = await supervisedPatient();
      for (const assistant of [none, d]) {
        const res = await assistant.post('/api/prescriptions').set(inA()).send(rxBody(p.id));
        expect(res.status).toBe(403);
      }
      expect(await t.prisma.prescription.count({ where: { patientId: p.id } })).toBe(0);
    });

    it("create: the supervisor's prescription is stored under the SUPERVISOR's own doctorId", async () => {
      const p = await supervisedPatient();
      const res = await s.post('/api/prescriptions').send(rxBody(p.id));
      expect(res.status).toBe(201);
      expect(res.body.doctorId).toBe(S.id);
      expect(res.body.patientId).toBe(p.id);
      const stored = await t.prisma.prescription.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.doctorId).toBe(S.id);
      // Prescribing leaves the owner's record — and draft — alone.
      const after = await row(p.id);
      expect(after!.doctorId).toBe(A.id);
      expect(after!.incompleteRx).toEqual(OWNER_DRAFT);
    });

    it('create: the supervisor cannot prescribe on a patient they do not supervise (404)', async () => {
      const other = await makePatient(t.prisma, A.id);
      const res = await s.post('/api/prescriptions').send(rxBody(other.id));
      expect(res.status).toBe(404);
      expect(await t.prisma.prescription.count({ where: { patientId: other.id } })).toBe(0);
    });

    it('create: an unrelated doctor is 404 and nothing is stored', async () => {
      const p = await supervisedPatient();
      const res = await x.post('/api/prescriptions').send(rxBody(p.id));
      expect(res.status).toBe(404);
      expect(await t.prisma.prescription.count({ where: { patientId: p.id } })).toBe(0);
    });

    it("list: each doctor sees only their own — the supervisor's is not in the owner's list and vice versa", async () => {
      const p = await supervisedPatient();
      const ownerRx = (await a.post('/api/prescriptions').send(rxBody(p.id))).body;
      const supRx = (await s.post('/api/prescriptions').send(rxBody(p.id))).body;
      const list = (b: Browser) => b.get('/api/prescriptions').query({ patientId: p.id });

      const ownerList = await list(a);
      expect(ownerList.status).toBe(200);
      expect(ids(ownerList.body)).toEqual([ownerRx.id]);
      expect(ownerList.body[0].items).toHaveLength(1);

      const supList = await list(s);
      expect(supList.status).toBe(200);
      expect(ids(supList.body)).toEqual([supRx.id]);

      // Assistants (no key needed to read) see the owner's list, never the supervisor's.
      for (const assistant of [full, rxOnly, none]) {
        const res = await list(assistant).set(inA());
        expect(res.status).toBe(200);
        expect(ids(res.body)).toEqual([ownerRx.id]);
      }

      const stranger = await list(x);
      expect(stranger.status).toBe(200);
      expect(stranger.body).toEqual([]);
    });

    it('GET /prescriptions/:id follows the same boundary, and never carries the owner draft to a supervisor', async () => {
      const p = await supervisedPatient();
      const ownerRx = (await a.post('/api/prescriptions').send(rxBody(p.id))).body;
      const supRx = (await s.post('/api/prescriptions').send(rxBody(p.id))).body;

      const own = await a.get(`/api/prescriptions/${ownerRx.id}`);
      expect(own.status).toBe(200);
      expect(own.body.patient.incompleteRx).toEqual(OWNER_DRAFT);

      const sup = await s.get(`/api/prescriptions/${supRx.id}`);
      expect(sup.status).toBe(200);
      expect(sup.body.patient.id).toBe(p.id);
      expect(sup.body.patient).toHaveProperty('incompleteRx', null);
      expect(JSON.stringify(sup.body)).not.toContain(OWNER_DRAFT.marker);

      expect((await s.get(`/api/prescriptions/${ownerRx.id}`)).status).toBe(404);
      expect((await a.get(`/api/prescriptions/${supRx.id}`)).status).toBe(404);
      expect((await x.get(`/api/prescriptions/${ownerRx.id}`)).status).toBe(404);
      expect((await x.get(`/api/prescriptions/${supRx.id}`)).status).toBe(404);
      expect((await full.get(`/api/prescriptions/${supRx.id}`).set(inA())).status).toBe(404);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────
  describe('DELETE /patients/:id (owner only, always)', () => {
    it('assistants are 403 — even holding every key — and the patient still exists', async () => {
      const p = await supervisedPatient();
      for (const assistant of [full, rxOnly, none]) {
        const res = await assistant.delete(`/api/patients/${p.id}`).set(inA());
        expect(res.status).toBe(403);
      }
      expect(await row(p.id)).not.toBeNull();
    });

    it('the supervising doctor is refused and the patient still exists', async () => {
      const p = await supervisedPatient();
      const res = await s.delete(`/api/patients/${p.id}`);
      // They act under their own workstation (role 'owner'), so it is the
      // service's `{ id, doctorId }` lookup that refuses them: 404, not 403.
      expect(res.status).toBe(404);
      expect(await row(p.id)).not.toBeNull();
      expect(await t.prisma.patientSupervisor.count({ where: { patientId: p.id } })).toBe(1);
    });

    it('an unrelated doctor is 404 and the patient still exists', async () => {
      const p = await supervisedPatient();
      const res = await x.delete(`/api/patients/${p.id}`);
      expect(res.status).toBe(404);
      expect(await row(p.id)).not.toBeNull();
    });

    it('the owner deletes', async () => {
      const p = await supervisedPatient();
      const res = await a.delete(`/api/patients/${p.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: p.id });
      expect(await row(p.id)).toBeNull();
    });

    it("the owner cannot delete away a supervising doctor's prescriptions (409, nothing lost)", async () => {
      const p = await supervisedPatient();
      const supRx = (await s.post('/api/prescriptions').send(rxBody(p.id))).body;

      const res = await a.delete(`/api/patients/${p.id}`);
      expect(res.status).toBe(409);
      expect(await row(p.id)).not.toBeNull();
      expect(await t.prisma.prescription.findUnique({ where: { id: supRx.id } })).not.toBeNull();
    });
  });

  // ── a doctorId in a request body is never trusted ─────────────────────────
  describe('client-sent doctorId', () => {
    it('is ignored on patient create and update', async () => {
      const created = await a.post('/api/patients').send({ name: 'Test Forged Owner', doctorId: X.id });
      expect(created.status).toBe(201);
      expect(created.body.doctorId).toBe(A.id);
      expect((await row(created.body.id))!.doctorId).toBe(A.id);

      const patched = await a
        .patch(`/api/patients/${created.body.id}`)
        .send({ district: 'Test district', doctorId: X.id });
      expect(patched.status).toBe(200);
      const after = await row(created.body.id);
      expect(after!.doctorId).toBe(A.id);
      expect(after!.district).toBe('Test district');
      expect((await x.get(`/api/patients/${created.body.id}`)).status).toBe(404);
    });

    it('is ignored on prescription create — owner, assistant and supervisor alike', async () => {
      const p = await supervisedPatient();

      const owner = await a.post('/api/prescriptions').send(rxBody(p.id, { doctorId: X.id }));
      expect(owner.status).toBe(201);
      expect(owner.body.doctorId).toBe(A.id);

      // An assistant cannot file a prescription under their own id either.
      const asst = await full
        .post('/api/prescriptions')
        .set(inA())
        .send(rxBody(p.id, { doctorId: asstFull.id }));
      expect(asst.status).toBe(201);
      expect(asst.body.doctorId).toBe(A.id);

      // A supervisor cannot plant a prescription in the owner's list.
      const sup = await s.post('/api/prescriptions').send(rxBody(p.id, { doctorId: A.id }));
      expect(sup.status).toBe(201);
      expect(sup.body.doctorId).toBe(S.id);

      expect(await t.prisma.prescription.count({ where: { patientId: p.id, doctorId: X.id } })).toBe(0);
      expect(await t.prisma.prescription.count({ where: { patientId: p.id, doctorId: A.id } })).toBe(2);
      expect(await t.prisma.prescription.count({ where: { patientId: p.id, doctorId: S.id } })).toBe(1);
    });

    it('is ignored on OPD, IPD and activity writes', async () => {
      const visit = await x.post('/api/opd').send({ name: 'Test Forged Visit', doctorId: A.id });
      expect(visit.status).toBe(201);
      expect(visit.body.doctorId).toBe(X.id);

      const adm = await x.post('/api/ipd').send({ bed: 'FORGED-1', name: 'Test Forged Admission', doctorId: A.id });
      expect(adm.status).toBe(201);
      expect(adm.body.doctorId).toBe(X.id);

      const act = await x
        .post('/api/activity')
        .send({ section: 'Test section', detail: 'forged doctor entry', doctorId: A.id });
      expect(act.status).toBe(201);
      expect(act.body.doctorId).toBe(X.id);

      expect(ids((await a.get('/api/opd')).body)).not.toContain(visit.body.id);
      expect(ids((await a.get('/api/ipd')).body)).not.toContain(adm.body.id);
      expect(ids((await a.get('/api/activity?limit=200')).body)).not.toContain(act.body.id);
    });
  });

  // ── OPD queue and IPD admissions ──────────────────────────────────────────
  describe('OPD queue and IPD admissions', () => {
    it("OPD: an unrelated doctor and a supervisor see none of A's queue; A and A's assistant do", async () => {
      const p = await supervisedPatient();
      const visit = await a.post('/api/opd').send({ name: p.name, patientId: p.id, phone: p.mobile });
      expect(visit.status).toBe(201);
      expect(visit.body.doctorId).toBe(A.id);

      expect(ids((await a.get('/api/opd')).body)).toContain(visit.body.id);
      const viaAssistant = await none.get('/api/opd').set(inA());
      expect(viaAssistant.status).toBe(200);
      expect(ids(viaAssistant.body)).toContain(visit.body.id);

      for (const other of [x, s, none]) {
        const res = await other.get('/api/opd');
        expect(res.status).toBe(200);
        expect(ids(res.body)).not.toContain(visit.body.id);
        expect(res.body.every((v: { doctorId: string }) => v.doctorId !== A.id)).toBe(true);
        expect(JSON.stringify(res.body)).not.toContain(p.name);
      }

      // Nor can they act on the row by id.
      const patch = await x.patch(`/api/opd/${visit.body.id}/status`).send({ status: 'done' });
      expect(patch.status).toBe(404);
      expect((await t.prisma.opdVisit.findUniqueOrThrow({ where: { id: visit.body.id } })).status).not.toBe('done');
    });

    it("IPD: an unrelated doctor and a supervisor see none of A's admissions; A and A's assistant do", async () => {
      const p = await supervisedPatient();
      const adm = await a.post('/api/ipd').send({ bed: `BED-${p.id.slice(-6)}`, name: p.name, patientId: p.id });
      expect(adm.status).toBe(201);
      expect(adm.body.doctorId).toBe(A.id);

      expect(ids((await a.get('/api/ipd')).body)).toContain(adm.body.id);
      const viaAssistant = await none.get('/api/ipd').set(inA());
      expect(viaAssistant.status).toBe(200);
      expect(ids(viaAssistant.body)).toContain(adm.body.id);

      for (const other of [x, s, none]) {
        const res = await other.get('/api/ipd');
        expect(res.status).toBe(200);
        expect(ids(res.body)).not.toContain(adm.body.id);
        expect(res.body.every((v: { doctorId: string }) => v.doctorId !== A.id)).toBe(true);
        expect(JSON.stringify(res.body)).not.toContain(p.name);
      }

      for (const other of [x, s]) {
        expect((await other.get(`/api/ipd/${adm.body.id}/events`)).status).toBe(404);
        expect((await other.patch(`/api/ipd/${adm.body.id}`).send({ diagnosis: 'Forged' })).status).toBe(404);
        expect((await other.patch(`/api/ipd/${adm.body.id}/status`).send({ status: 'Discharge' })).status).toBe(404);
        expect((await other.post(`/api/ipd/${adm.body.id}/events`).send({ note: 'Forged note' })).status).toBe(404);
      }
      const after = await t.prisma.ipdAdmission.findUniqueOrThrow({ where: { id: adm.body.id } });
      expect(after.diagnosis).toBeNull();
      expect(after.status).toBe('Stable');
      expect(await t.prisma.ipdEvent.count({ where: { admissionId: adm.body.id } })).toBe(0);
    });
  });

  // ── activity feed ─────────────────────────────────────────────────────────
  describe('activity feed', () => {
    it("a doctor who is also someone's assistant reads ONLY their own practice's feed without the header", async () => {
      const ownerEntry = await a
        .post('/api/activity')
        .send({ section: 'Test section', detail: 'entry in practice A', patientName: 'Test Patient Of A' });
      expect(ownerEntry.status).toBe(201);
      const dualEntry = await d
        .post('/api/activity')
        .send({ section: 'Test section', detail: 'entry in the dual doctor own practice' });
      expect(dualEntry.status).toBe(201);
      // Filed under the dual doctor's OWN practice, not the one they assist.
      expect(dualEntry.body.doctorId).toBe(dual.id);

      const own = await d.get('/api/activity?limit=200');
      expect(own.status).toBe(200);
      expect(ids(own.body)).toContain(dualEntry.body.id);
      expect(ids(own.body)).not.toContain(ownerEntry.body.id);
      expect(own.body.every((e: { doctorId: string }) => e.doctorId === dual.id)).toBe(true);
      expect(JSON.stringify(own.body)).not.toContain('Test Patient Of A');

      // The owner does not see the dual doctor's private-practice entry either.
      const ownerFeed = await a.get('/api/activity?limit=200');
      expect(ids(ownerFeed.body)).toContain(ownerEntry.body.id);
      expect(ids(ownerFeed.body)).not.toContain(dualEntry.body.id);
      expect(ownerFeed.body.every((e: { doctorId: string }) => e.doctorId === A.id)).toBe(true);
    });

    it("WITH the header the same user reads and writes practice A's feed, attributed to themselves", async () => {
      const ownerEntry = await a.post('/api/activity').send({ section: 'Test section', detail: 'second entry in A' });
      const asEntry = await d
        .post('/api/activity')
        .set(inA())
        .send({ section: 'Test section', detail: 'written by the assistant in A' });
      expect(asEntry.status).toBe(201);
      expect(asEntry.body.doctorId).toBe(A.id);
      expect(asEntry.body.actorName).toBe(dual.name);

      const feed = await d.get('/api/activity?limit=200').set(inA());
      expect(feed.status).toBe(200);
      expect(ids(feed.body)).toEqual(expect.arrayContaining([ownerEntry.body.id, asEntry.body.id]));
      expect(feed.body.every((e: { doctorId: string }) => e.doctorId === A.id)).toBe(true);

      // …and that entry did not leak into their own practice's feed.
      expect(ids((await d.get('/api/activity?limit=200')).body)).not.toContain(asEntry.body.id);
    });

    it('an unrelated doctor and a supervisor read none of it', async () => {
      const p = await supervisedPatient();
      const entry = await a
        .post('/api/activity')
        .send({ section: 'Test section', detail: 'entry about a supervised patient', patientId: p.id, patientName: p.name });
      expect(entry.status).toBe(201);

      for (const other of [x, s]) {
        const all = await other.get('/api/activity?limit=200');
        expect(all.status).toBe(200);
        expect(ids(all.body)).not.toContain(entry.body.id);
        // Filtering by the patient's id does not open the owner's feed.
        const byPatient = await other.get('/api/activity').query({ patientId: p.id });
        expect(byPatient.status).toBe(200);
        expect(byPatient.body).toEqual([]);
      }
    });
  });
});
