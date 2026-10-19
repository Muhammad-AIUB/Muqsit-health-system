import type { Patient, User } from '@prisma/client';
import { RxHabitsService } from '../src/rx-habits/rx-habits.service';
import { DoctorPhrasesService } from '../src/doctor-phrases/doctor-phrases.service';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor, makePatient, makeSupervisor } from './support/fixtures';
import { RX_LINES, rxBody } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ A save whose answer was lost on the way back (a connection that dropped
// after the server wrote it) reads to the doctor as "not saved", and they press
// again. The server is the only one that can tell: the same prescription sent
// again is the one on record, never a second row. The same for adding a
// patient to the OPD queue: a patient still waiting there keeps their token.
// Real HTTP, real database. Every name and dose here is made up.

type Agent = Awaited<ReturnType<typeof loginAs>>;

describe('a save sent again is not filed twice', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });
  afterEach(() => jest.restoreAllMocks());

  const setup = async () => {
    const doctor = await makeDoctor(t.prisma);
    const browser = await loginAs(t, doctor);
    const patient = await makePatient(t.prisma, doctor.id);
    return { doctor, browser, patient };
  };
  const post = (browser: Agent, patientId: string, over: Record<string, unknown> = {}) =>
    browser.post('/api/prescriptions').send(rxBody(patientId, over));
  const rows = (doctor: User, patient: Patient) =>
    t.prisma.prescription.findMany({ where: { doctorId: doctor.id, patientId: patient.id } });

  describe('POST /prescriptions', () => {
    it('the same prescription sent twice is ONE prescription, answered with the one on record', async () => {
      const { doctor, browser, patient } = await setup();
      const first = await post(browser, patient.id, { finalDiagnosis: ['Test diagnosis'] });
      const again = await post(browser, patient.id, { finalDiagnosis: ['Test diagnosis'] });
      expect(first.status).toBe(201);
      expect(again.status).toBe(201);
      expect(again.body.id).toBe(first.body.id);
      expect(again.body.items).toHaveLength(RX_LINES.length);
      expect(await rows(doctor, patient)).toHaveLength(1);
    });

    it('the repeat teaches "Your usual" and the learned phrases nothing', async () => {
      const { browser, patient } = await setup();
      const habit = jest.spyOn(t.app.get(RxHabitsService), 'recordFrom');
      const phrase = jest.spyOn(t.app.get(DoctorPhrasesService), 'recordFrom');
      await post(browser, patient.id);
      await post(browser, patient.id);
      expect(habit).toHaveBeenCalledTimes(1);
      expect(phrase).toHaveBeenCalledTimes(1);
    });

    it('two copies arriving together are still one', async () => {
      const { doctor, browser, patient } = await setup();
      const [a, b] = await Promise.all([post(browser, patient.id), post(browser, patient.id)]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.id).toBe(b.body.id);
      expect(await rows(doctor, patient)).toHaveLength(1);
    });

    it('anything different is a new prescription: a dose, a line, a diagnosis, the follow-up', async () => {
      const { doctor, browser, patient } = await setup();
      await post(browser, patient.id);
      const dose = RX_LINES.map((l, i) => (i === 0 ? { ...l, dose: '1+0+1' } : l));
      await post(browser, patient.id, { items: dose });
      await post(browser, patient.id, { items: dose.slice(0, 3) });
      await post(browser, patient.id, { items: dose.slice(0, 3), finalDiagnosis: ['Test diagnosis'] });
      await post(browser, patient.id, { items: dose.slice(0, 3), finalDiagnosis: ['Test diagnosis'], followUpNum: '7', followUpUnit: 'day' });
      expect(await rows(doctor, patient)).toHaveLength(5);
    });

    it('a >>> line is not the same line as a medicine written again (isCont), nor a note as a medicine', async () => {
      const { doctor, browser, patient } = await setup();
      const items = [
        { drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', instruction: '' },
        { drug: 'Tablet. Napa 500mg', dose: '0+0+1', duration: '7 days', instruction: '', isCont: true },
      ];
      await post(browser, patient.id, { items });
      await post(browser, patient.id, { items: [items[0], { ...items[1], isCont: false }] });
      await post(browser, patient.id, { items: [items[0], { ...items[1], isCont: false, isNote: true }] });
      expect(await rows(doctor, patient)).toHaveLength(3);
    });

    it('the same prescription for ANOTHER patient is its own', async () => {
      const { doctor, browser, patient } = await setup();
      const other = await makePatient(t.prisma, doctor.id);
      const a = await post(browser, patient.id);
      const b = await post(browser, other.id);
      expect(a.body.id).not.toBe(b.body.id);
    });

    it("the same prescription written by the patient's supervising doctor is the supervisor's own", async () => {
      const { doctor, browser, patient } = await setup();
      const supervisor = await makeDoctor(t.prisma);
      await makeSupervisor(t.prisma, patient.id, supervisor.id);
      const s = await loginAs(t, supervisor);
      const a = await post(browser, patient.id);
      const b = await post(s, patient.id);
      expect(b.status).toBe(201);
      expect(b.body.id).not.toBe(a.body.id);
      expect(await rows(doctor, patient)).toHaveLength(1);
    });

    it('only the LATEST prescription is compared: a third save like the first after another is new', async () => {
      const { doctor, browser, patient } = await setup();
      await post(browser, patient.id);
      await post(browser, patient.id, { finalDiagnosis: ['Test diagnosis'] });
      await post(browser, patient.id);
      expect(await rows(doctor, patient)).toHaveLength(3);
    });

    it('the same prescription half an hour later is another visit', async () => {
      const { doctor, browser, patient } = await setup();
      const first = await post(browser, patient.id);
      await t.prisma.prescription.update({
        where: { id: first.body.id },
        data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
      });
      const again = await post(browser, patient.id);
      expect(again.body.id).not.toBe(first.body.id);
      expect(await rows(doctor, patient)).toHaveLength(2);
    });
  });

  describe('POST /opd', () => {
    const add = (browser: Agent, patient: Patient | null, name = 'Queue Patient') =>
      browser.post('/api/opd').send({ name, ...(patient ? { patientId: patient.id } : {}) });
    const today = (doctor: User) => t.prisma.opdVisit.findMany({ where: { doctorId: doctor.id }, orderBy: { createdAt: 'asc' } });

    it('a patient already waiting in today\'s queue keeps their token — no second row', async () => {
      const { doctor, browser, patient } = await setup();
      const a = await add(browser, patient);
      const b = await add(browser, patient);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.body.id).toBe(a.body.id);
      expect(b.body.token).toBe(a.body.token);
      expect(await today(doctor)).toHaveLength(1);
    });

    it('two adds of one patient arriving together are still one', async () => {
      const { doctor, browser, patient } = await setup();
      const [a, b] = await Promise.all([add(browser, patient), add(browser, patient)]);
      expect(a.body.id).toBe(b.body.id);
      expect(await today(doctor)).toHaveLength(1);
    });

    it('a patient seen already today (done) is queued again with a new token', async () => {
      const { doctor, browser, patient } = await setup();
      const a = await add(browser, patient);
      const done = await browser.patch(`/api/opd/${a.body.id}/status`).send({ status: 'done' });
      expect(done.status).toBe(200);
      const b = await add(browser, patient);
      expect(b.body.id).not.toBe(a.body.id);
      expect(b.body.token).not.toBe(a.body.token);
      expect(await today(doctor)).toHaveLength(2);
    });

    it('a patient left waiting YESTERDAY is queued today with a new token', async () => {
      const { doctor, browser, patient } = await setup();
      const a = await add(browser, patient);
      await t.prisma.opdVisit.update({ where: { id: a.body.id }, data: { createdAt: new Date(Date.now() - 36 * 3600 * 1000) } });
      const b = await add(browser, patient);
      expect(b.body.id).not.toBe(a.body.id);
    });

    it('two different patients, and a name with no patient record, each get a row', async () => {
      const { doctor, browser, patient } = await setup();
      const other = await makePatient(t.prisma, doctor.id);
      await add(browser, patient);
      await add(browser, other);
      await add(browser, null, 'Walk-in');
      await add(browser, null, 'Walk-in');
      const all = await today(doctor);
      expect(all).toHaveLength(4);
      expect(new Set(all.map((v) => v.token)).size).toBe(4);
    });
  });
});
