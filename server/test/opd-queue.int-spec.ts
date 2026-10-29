import type { OpdVisit, User } from '@prisma/client';
import { dhakaDayKey } from '../src/opd/dhaka-day';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor, makePatient, makeSupervisor } from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// The OPD queue is booked per DAY (physician's sheet, 28/10/2026): a patient can
// be added and moved for today or a later day, the day's chamber schedule is its
// own, and a day that has passed is locked with what it holds. Real HTTP, real
// database; every name here is made up.

type Agent = Awaited<ReturnType<typeof loginAs>>;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (offsetDays: number) => dhakaDayKey(new Date(Date.now() + offsetDays * DAY_MS));
const TODAY = dayKey(0);
const TOMORROW = dayKey(1);
const LATER = dayKey(3);
const YESTERDAY = dayKey(-1);

describe('OPD queue by day', () => {
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
    const browser = await loginAs(t, doctor);
    return { doctor, browser };
  };
  const add = (browser: Agent, name: string, date?: string, patientId?: string) =>
    browser.post('/api/opd').send({ name, ...(date ? { date } : {}), ...(patientId ? { patientId } : {}) });
  const list = async (browser: Agent, date?: string) => {
    const res = await browser.get('/api/opd').query(date ? { date } : {});
    expect(res.status).toBe(200);
    return res.body as OpdVisit[];
  };
  const names = (rows: OpdVisit[]) => rows.map((r) => r.name);
  // A row as a past day holds it: written straight, since the API refuses to.
  const pastVisit = (doctor: User, name: string, queueDate = YESTERDAY, over: Partial<OpdVisit> = {}) =>
    t.prisma.opdVisit.create({
      data: { doctorId: doctor.id, name, token: 'T-01', queueDate, position: 1, createdAt: new Date(Date.now() - DAY_MS), ...(over as object) },
    });

  describe('the day a visit belongs to', () => {
    it('adds to today by default, and to a later day when one is named', async () => {
      const { browser } = await setup();
      await add(browser, 'Today One');
      await add(browser, 'Later One', LATER);
      await add(browser, 'Tomorrow One', TOMORROW);
      expect(names(await list(browser))).toEqual(['Today One']);
      expect(names(await list(browser, TODAY))).toEqual(['Today One']);
      expect(names(await list(browser, LATER))).toEqual(['Later One']);
      expect(names(await list(browser, TOMORROW))).toEqual(['Tomorrow One']);
    });

    it("each day has its own serial and its own tokens: every day's first patient is T-01, 1", async () => {
      const { browser } = await setup();
      const a = await add(browser, 'A Today');
      const b = await add(browser, 'B Today');
      const c = await add(browser, 'C Later', LATER);
      expect([a.body.token, b.body.token, c.body.token]).toEqual(['T-01', 'T-02', 'T-01']);
      expect([a.body.position, b.body.position, c.body.position]).toEqual([1, 2, 1]);
      expect(a.body.queueDate).toBe(TODAY);
      expect(c.body.queueDate).toBe(LATER);
    });

    it('refuses a day that has passed, and nothing is written', async () => {
      const { doctor, browser } = await setup();
      const res = await add(browser, 'Past Add', YESTERDAY);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/passed/i);
      expect(await t.prisma.opdVisit.count({ where: { doctorId: doctor.id } })).toBe(0);
    });

    it('refuses a date that is not a day, however it is written', async () => {
      const { doctor, browser } = await setup();
      for (const date of ['2026-02-30', '28/10/2026', 'tomorrow']) {
        expect((await add(browser, 'Bad Date', date)).status).toBe(400);
      }
      expect((await browser.get('/api/opd').query({ date: '2026-02-30' })).status).toBe(400);
      expect(await t.prisma.opdVisit.count({ where: { doctorId: doctor.id } })).toBe(0);
    });

    it("a past day is still shown — read only — with what it held", async () => {
      const { doctor, browser } = await setup();
      await pastVisit(doctor, 'Yesterday One');
      expect(names(await list(browser, YESTERDAY))).toEqual(['Yesterday One']);
      expect(await list(browser)).toEqual([]);
    });

    it('a patient waiting on one day can be booked on another; on the same day twice they keep their place', async () => {
      const { doctor, browser } = await setup();
      const patient = await makePatient(t.prisma, doctor.id);
      const today = await add(browser, patient.name, undefined, patient.id);
      const later = await add(browser, patient.name, LATER, patient.id);
      expect(later.body.id).not.toBe(today.body.id);
      const laterAgain = await add(browser, patient.name, LATER, patient.id);
      expect(laterAgain.body.id).toBe(later.body.id);
      expect(await t.prisma.opdVisit.count({ where: { doctorId: doctor.id } })).toBe(2);
    });

    it('two adds arriving together get two places and two tokens', async () => {
      const { browser } = await setup();
      const rows = await Promise.all(['P1', 'P2', 'P3', 'P4'].map((n) => add(browser, n, LATER)));
      expect(rows.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(rows.map((r) => r.body.position).sort()).toEqual([1, 2, 3, 4]);
      expect(new Set(rows.map((r) => r.body.token)).size).toBe(4);
    });
  });

  describe('moving a patient up and down', () => {
    const queueOf = async (browser: Agent, day: string, ...who: string[]) => {
      const rows: OpdVisit[] = [];
      for (const n of who) rows.push((await add(browser, n, day)).body);
      return rows;
    };
    const move = (browser: Agent, id: string, direction: 'up' | 'down') => browser.patch(`/api/opd/${id}/move`).send({ direction });

    it('moves a patient on a later day, and answers the day as it now stands', async () => {
      const { browser } = await setup();
      const [, , c] = await queueOf(browser, LATER, 'A', 'B', 'C');
      const res = await move(browser, c.id, 'up');
      expect(res.status).toBe(200);
      expect(names(res.body)).toEqual(['A', 'C', 'B']);
      expect(names(await list(browser, LATER))).toEqual(['A', 'C', 'B']);
    });

    it("moves today's queue too, and the token stays with the patient", async () => {
      const { browser } = await setup();
      const [a, b] = await queueOf(browser, TODAY, 'A', 'B');
      const res = await move(browser, a.id, 'down');
      expect(names(res.body)).toEqual(['B', 'A']);
      const rows = await list(browser);
      expect(rows.find((r) => r.id === a.id)?.token).toBe(a.token);
      expect(rows.find((r) => r.id === b.id)?.token).toBe(b.token);
    });

    it('the first up and the last down change nothing, and are not an error', async () => {
      const { browser } = await setup();
      const [a, b] = await queueOf(browser, LATER, 'A', 'B');
      expect((await move(browser, a.id, 'up')).status).toBe(200);
      expect((await move(browser, b.id, 'down')).status).toBe(200);
      expect(names(await list(browser, LATER))).toEqual(['A', 'B']);
    });

    it('jumps over a patient already seen, who keeps their place; a seen patient is not moved', async () => {
      const { browser } = await setup();
      const [a, b, c] = await queueOf(browser, TODAY, 'A', 'B', 'C');
      expect((await browser.patch(`/api/opd/${b.id}/status`).send({ status: 'done' })).status).toBe(200);
      expect(names((await move(browser, c.id, 'up')).body)).toEqual(['C', 'B', 'A']);
      const refused = await move(browser, b.id, 'up');
      expect(refused.status).toBe(400);
      expect(refused.body.message).toMatch(/seen/i);
      expect(a.id).toBeTruthy();
    });

    it('refuses a visit of a day that has passed, and changes nothing', async () => {
      const { doctor, browser } = await setup();
      const a = await pastVisit(doctor, 'Old A', YESTERDAY, { position: 1 });
      await pastVisit(doctor, 'Old B', YESTERDAY, { position: 2, token: 'T-02' });
      const res = await move(browser, a.id, 'down');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/passed/i);
      expect(names(await list(browser, YESTERDAY))).toEqual(['Old A', 'Old B']);
    });

    it('rows an older build wrote with no place are numbered in the order shown, then moved', async () => {
      const { doctor, browser } = await setup();
      const base = Date.now() - 60 * 60 * 1000;
      const rows = [];
      for (const [i, n] of ['Old1', 'Old2', 'Old3'].entries()) {
        rows.push(await t.prisma.opdVisit.create({ data: { doctorId: doctor.id, name: n, token: `T-0${i + 1}`, createdAt: new Date(base + i * 1000) } }));
      }
      expect(names(await list(browser))).toEqual(['Old1', 'Old2', 'Old3']); // no day, no place: still today's
      const res = await move(browser, rows[2].id, 'up');
      expect(names(res.body)).toEqual(['Old1', 'Old3', 'Old2']);
      expect(res.body.map((r: OpdVisit) => r.position)).toEqual([1, 2, 3]);
    });

    it('a patient added after such rows comes after them, not before', async () => {
      const { doctor, browser } = await setup();
      const base = Date.now() - 60 * 60 * 1000;
      await t.prisma.opdVisit.create({ data: { doctorId: doctor.id, name: 'Old1', token: 'T-01', createdAt: new Date(base) } });
      await t.prisma.opdVisit.create({ data: { doctorId: doctor.id, name: 'Old2', token: 'T-02', createdAt: new Date(base + 1000) } });
      const fresh = await add(browser, 'Fresh');
      expect(fresh.body.token).toBe('T-03');
      expect(names(await list(browser))).toEqual(['Old1', 'Old2', 'Fresh']);
    });

    it('two moves arriving together never leave two patients in one place', async () => {
      const { browser } = await setup();
      const [a, b, c, d] = await queueOf(browser, LATER, 'A', 'B', 'C', 'D');
      await Promise.all([move(browser, d.id, 'up'), move(browser, c.id, 'up'), move(browser, a.id, 'down'), move(browser, b.id, 'down')]);
      const rows = await list(browser, LATER);
      expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
      expect(rows).toHaveLength(4);
    });
  });

  describe('Done is for today', () => {
    it("is refused for a later day's patient and for a day that has passed", async () => {
      const { doctor, browser } = await setup();
      const later = await add(browser, 'Later', LATER);
      const old = await pastVisit(doctor, 'Old');
      for (const id of [later.body.id, old.id]) {
        const res = await browser.patch(`/api/opd/${id}/status`).send({ status: 'done' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/today/i);
      }
      expect((await t.prisma.opdVisit.findUniqueOrThrow({ where: { id: later.body.id } })).status).toBe('waiting');
    });

    it("works for today's patient, as before", async () => {
      const { browser } = await setup();
      const a = await add(browser, 'Today');
      expect((await browser.patch(`/api/opd/${a.body.id}/status`).send({ status: 'done' })).status).toBe(200);
    });
  });

  describe("Save & print marks TODAY's visit, never a later one", () => {
    it('a patient booked only for a later day gets a visit today; the later booking is left alone', async () => {
      const { doctor, browser } = await setup();
      const patient = await makePatient(t.prisma, doctor.id);
      const later = await add(browser, patient.name, LATER, patient.id);
      const res = await browser.post('/api/opd/rx-status').send({ patientId: patient.id, rxStatus: 'complete' });
      expect(res.status).toBe(201);
      expect(res.body.id).not.toBe(later.body.id);
      expect(res.body.queueDate).toBe(TODAY);
      const stillLater = await t.prisma.opdVisit.findUniqueOrThrow({ where: { id: later.body.id } });
      expect(stillLater.rxStatus).toBeNull();
      expect(stillLater.queueDate).toBe(LATER);
    });

    it("a patient already in today's queue is marked, with no second visit", async () => {
      const { doctor, browser } = await setup();
      const patient = await makePatient(t.prisma, doctor.id);
      const today = await add(browser, patient.name, undefined, patient.id);
      const res = await browser.post('/api/opd/rx-status').send({ patientId: patient.id, rxStatus: 'incomplete' });
      expect(res.body.id).toBe(today.body.id);
      expect(res.body.rxStatus).toBe('incomplete');
    });
  });

  describe("whose queue it is", () => {
    it("another doctor sees none of it, on any day, and cannot move or finish it", async () => {
      const { browser } = await setup();
      const { browser: other } = await setup();
      const later = await add(browser, 'Mine', LATER);
      await add(browser, 'Mine Today');
      expect(await list(other)).toEqual([]);
      expect(await list(other, LATER)).toEqual([]);
      expect((await other.patch(`/api/opd/${later.body.id}/move`).send({ direction: 'up' })).status).toBe(404);
      expect((await other.patch(`/api/opd/${later.body.id}/status`).send({ status: 'done' })).status).toBe(404);
    });

    it("an assistant works the owner's queue through the workstation, and no one else's", async () => {
      const { doctor, browser } = await setup();
      const assistant = await makeDoctor(t.prisma);
      await makeAssistantLink(t.prisma, doctor.id, assistant.id, []);
      const a = await loginAs(t, assistant);
      await add(browser, 'Owner Later', LATER);
      const viaAssistant = await a.get('/api/opd').query({ date: LATER }).set(WS, doctor.id);
      expect(names(viaAssistant.body)).toEqual(['Owner Later']);
      expect(await list(a, LATER)).toEqual([]); // their own queue is their own
      const added = await a.post('/api/opd').set(WS, doctor.id).send({ name: 'By Assistant', date: LATER });
      expect(added.status).toBe(201);
      expect(added.body.doctorId).toBe(doctor.id);
    });

    it('a doctorId in the body is ignored', async () => {
      const { doctor, browser } = await setup();
      const { doctor: other } = await setup();
      const res = await browser.post('/api/opd').send({ name: 'Forged', doctorId: other.id, date: LATER });
      expect(res.body.doctorId).toBe(doctor.id);
    });
  });

  describe("a day's schedule", () => {
    const getSchedule = (browser: Agent, date: string) => browser.get('/api/opd/schedule').query({ date });
    const putSchedule = (browser: Agent, date: string, over: Record<string, unknown> = {}) =>
      browser.put('/api/opd/schedule').send({ date, startTime: '18:00', breakStart: '20:00', breakEnd: '21:00', minutesPerPatient: 10, ...over });

    it('with nothing saved, a day shows the pre-set values and says nothing is saved', async () => {
      const { browser } = await setup();
      const res = await getSchedule(browser, LATER);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ day: LATER, startTime: '18:00', breakStart: null, breakEnd: null, minutesPerPatient: 10, saved: false });
    });

    it('saves for today and later days, and reads back what was saved', async () => {
      const { browser } = await setup();
      for (const day of [TODAY, LATER]) {
        const saved = await putSchedule(browser, day, { startTime: '17:30', minutesPerPatient: 12 });
        expect(saved.status).toBe(200);
        expect(saved.body).toMatchObject({ day, startTime: '17:30', breakStart: '20:00', breakEnd: '21:00', minutesPerPatient: 12, saved: true });
        expect((await getSchedule(browser, day)).body).toMatchObject({ startTime: '17:30', minutesPerPatient: 12, saved: true });
      }
    });

    it("a later save of the same day replaces it, and a break can be taken off", async () => {
      const { browser } = await setup();
      await putSchedule(browser, LATER);
      await putSchedule(browser, LATER, { breakStart: null, breakEnd: null, minutesPerPatient: 15 });
      expect((await getSchedule(browser, LATER)).body).toMatchObject({ breakStart: null, breakEnd: null, minutesPerPatient: 15 });
    });

    it('a new day starts from the latest earlier day, and says it has none of its own', async () => {
      const { browser } = await setup();
      await putSchedule(browser, TOMORROW, { startTime: '16:00', minutesPerPatient: 20 });
      const res = await getSchedule(browser, LATER);
      expect(res.body).toMatchObject({ startTime: '16:00', breakStart: '20:00', breakEnd: '21:00', minutesPerPatient: 20, saved: false });
      // A day BEFORE the saved one is not influenced by it.
      expect((await getSchedule(browser, TODAY)).body).toMatchObject({ startTime: '18:00', saved: false });
    });

    it("⚕️ the first patient added to a day saves the schedule it took, so an earlier day changed later does not move the times already given out", async () => {
      const { browser } = await setup();
      await putSchedule(browser, TODAY, { startTime: '17:00', minutesPerPatient: 10 });
      await add(browser, 'First', LATER);
      expect((await getSchedule(browser, LATER)).body).toMatchObject({ startTime: '17:00', minutesPerPatient: 10, saved: true });
      await putSchedule(browser, TODAY, { startTime: '19:00', minutesPerPatient: 30 });
      expect((await getSchedule(browser, LATER)).body).toMatchObject({ startTime: '17:00', minutesPerPatient: 10 });
      // A day nobody was added to still follows its latest earlier day (here,
      // the one between today and the frozen one) — and a day after the frozen
      // one follows THAT.
      expect((await getSchedule(browser, dayKey(2))).body).toMatchObject({ startTime: '19:00', minutesPerPatient: 30, saved: false });
      expect((await getSchedule(browser, dayKey(5))).body).toMatchObject({ startTime: '17:00', minutesPerPatient: 10, saved: false });
    });

    it('refuses a day that has passed, and keeps what that day had', async () => {
      const { doctor, browser } = await setup();
      await t.prisma.opdDaySetting.create({ data: { doctorId: doctor.id, day: YESTERDAY, startTime: '18:00', minutesPerPatient: 10 } });
      const res = await putSchedule(browser, YESTERDAY, { startTime: '09:00' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/passed/i);
      expect((await getSchedule(browser, YESTERDAY)).body).toMatchObject({ startTime: '18:00', saved: true });
    });

    it('refuses a schedule that is not one, in the doctor\'s words', async () => {
      const { browser } = await setup();
      const noEnd = await putSchedule(browser, LATER, { breakEnd: null });
      expect(noEnd.status).toBe(400);
      expect(noEnd.body.message).toBe('A break needs both its start and its end.');
      const backwards = await putSchedule(browser, LATER, { breakStart: '21:00', breakEnd: '20:00' });
      expect(backwards.body.message).toBe('The break must end after it starts.');
      for (const bad of [{ startTime: '6pm' }, { minutesPerPatient: 0 }, { minutesPerPatient: 500 }, { date: '2026-02-30' }]) {
        expect((await putSchedule(browser, LATER, bad)).status).toBe(400);
      }
      expect((await getSchedule(browser, LATER)).body.saved).toBe(false);
    });

    it("one doctor's schedule is not another's", async () => {
      const { browser } = await setup();
      const { browser: other } = await setup();
      await putSchedule(browser, LATER, { startTime: '15:00' });
      expect((await getSchedule(other, LATER)).body).toMatchObject({ startTime: '18:00', saved: false });
    });
  });

  describe('presence', () => {
    it('ticks Present with the server time, keeps it, and clears it', async () => {
      const { browser } = await setup();
      const v = (await add(browser, 'Present One')).body as OpdVisit;
      const on = await browser.patch(`/api/opd/${v.id}/presence`).send({ present: true });
      expect(on.status).toBe(200);
      expect(on.body.presentAt).toEqual(expect.any(String));
      const again = await browser.patch(`/api/opd/${v.id}/presence`).send({ present: true });
      expect(again.body.presentAt).toBe(on.body.presentAt);
      const off = await browser.patch(`/api/opd/${v.id}/presence`).send({ present: false });
      expect(off.body.presentAt).toBeNull();
    });

    it('the two flags are independent of Present and of each other', async () => {
      const { browser } = await setup();
      const v = (await add(browser, 'Flags')).body as OpdVisit;
      await browser.patch(`/api/opd/${v.id}/presence`).send({ urgent: true });
      const row = (await list(browser))[0] as OpdVisit;
      expect([row.urgent, row.criticallyIll, row.presentAt]).toEqual([true, false, null]);
    });

    it("refuses a later day and a past day, and another doctor's visit", async () => {
      const { doctor, browser } = await setup();
      const later = (await add(browser, 'Later', LATER)).body as OpdVisit;
      const past = await pastVisit(doctor, 'Past');
      expect((await browser.patch(`/api/opd/${later.id}/presence`).send({ present: true })).status).toBe(400);
      expect((await browser.patch(`/api/opd/${past.id}/presence`).send({ present: true })).status).toBe(400);
      const other = await setup();
      const mine = (await add(browser, 'Mine')).body as OpdVisit;
      expect((await other.browser.patch(`/api/opd/${mine.id}/presence`).send({ urgent: true })).status).toBe(404);
    });

    it('a field that is not on the DTO is dropped, and a non-boolean is refused', async () => {
      const { browser } = await setup();
      const v = (await add(browser, 'Dto')).body as OpdVisit;
      const res = await browser.patch(`/api/opd/${v.id}/presence`).send({ status: 'done', urgent: true });
      expect(res.status).toBe(200);
      expect(res.body.urgent).toBe(true);
      expect(res.body.status).toBe('waiting');
      expect((await browser.patch(`/api/opd/${v.id}/presence`).send({ urgent: 'yes' })).status).toBe(400);
    });
  });

  describe('the row carries the picture and how far the parked visit has got', () => {
    it("reads the owner's parked visit, and only today's", async () => {
      const { doctor, browser } = await setup();
      const p = await makePatient(t.prisma, doctor.id, { pictureUrl: 'https://example.test/p.jpg' });
      await add(browser, 'With Draft', undefined, p.id);
      await t.prisma.patient.update({ where: { id: p.id }, data: { incompleteRx: { ptDate: TODAY, chiefComplaints: ['fever'] } } });
      let row = (await list(browser))[0] as OpdVisit & { pictureUrl: string | null; padStage: string | null };
      expect([row.pictureUrl, row.padStage]).toEqual(['https://example.test/p.jpg', 'history']);
      await t.prisma.patient.update({ where: { id: p.id }, data: { incompleteRx: { ptDate: YESTERDAY, chiefComplaints: ['fever'] } } });
      row = (await list(browser))[0] as typeof row;
      expect(row.padStage).toBeNull();
    });

    it("a row booked for another day shows no stage, while the same patient's row for today still does", async () => {
      const { doctor, browser } = await setup();
      const p = await makePatient(t.prisma, doctor.id);
      await add(browser, 'Tomorrow Row', TOMORROW, p.id);
      await add(browser, 'Today Row', undefined, p.id);
      await t.prisma.patient.update({ where: { id: p.id }, data: { incompleteRx: { ptDate: TODAY, chiefComplaints: ['fever'] } } });
      const tomorrow = (await list(browser, TOMORROW))[0] as OpdVisit & { padStage: string | null };
      expect(tomorrow.name).toBe('Tomorrow Row');
      expect(tomorrow.padStage).toBeNull();
      const today = (await list(browser))[0] as typeof tomorrow;
      expect(today.name).toBe('Today Row');
      expect(today.padStage).toBe('history');
    });

    it("never shows the owner's draft to a supervising practice", async () => {
      const owner = await makeDoctor(t.prisma);
      const supervisor = await setup();
      const p = await makePatient(t.prisma, owner.id);
      await t.prisma.patient.update({ where: { id: p.id }, data: { incompleteRx: { ptDate: TODAY, rxItems: [{ drug: 'Napa' }] } } });
      await makeSupervisor(t.prisma, p.id, supervisor.doctor.id);
      await add(supervisor.browser, 'Supervised', undefined, p.id);
      const row = (await list(supervisor.browser))[0] as OpdVisit & { padStage: string | null };
      expect(row.padStage).toBeNull();
      await t.prisma.supervisedDraft.create({ data: { doctorId: supervisor.doctor.id, patientId: p.id, data: { ptDate: TODAY, chiefComplaints: ['cough'] } } });
      expect(((await list(supervisor.browser))[0] as typeof row).padStage).toBe('history');
    });

    it("⚕️ a patient of another practice, queued by id, shows no picture and no stage; a supervised one keeps its picture", async () => {
      const owner = await makeDoctor(t.prisma);
      const { doctor, browser } = await setup();
      const url = 'https://example.test/foreign.jpg';
      const foreign = await makePatient(t.prisma, owner.id, { pictureUrl: url, incompleteRx: { ptDate: TODAY, chiefComplaints: ['x'] } });
      await add(browser, 'Foreign', undefined, foreign.id);
      let row = (await list(browser))[0] as OpdVisit & { pictureUrl: string | null; padStage: string | null };
      expect([row.pictureUrl, row.padStage]).toEqual([null, null]);
      await makeSupervisor(t.prisma, foreign.id, doctor.id);
      row = (await list(browser))[0] as typeof row;
      expect(row.pictureUrl).toBe(url);
    });
  });
});
