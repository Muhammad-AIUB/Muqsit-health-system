import type { Patient, User } from '@prisma/client';
import { DoctorPhrasesService } from '../src/doctor-phrases/doctor-phrases.service';
import { RxHabitsService } from '../src/rx-habits/rx-habits.service';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor, makePatient } from './support/fixtures';
import { ADVICE, RX_LINES, rxBody } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ The prescription is the record. These tests go through the real HTTP
// pipeline (ValidationPipe, guards) into a real Postgres, and pin
// server/CLAUDE.md Rule 2c: what was written is what is stored, and the
// derived habit tables can never cost a save.

type Agent = Awaited<ReturnType<typeof loginAs>>;

describe('prescriptions (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });
  afterEach(() => jest.restoreAllMocks());

  const setup = async (patients = 1) => {
    const doctor = await makeDoctor(t.prisma);
    const browser = await loginAs(t, doctor);
    const pts: Patient[] = [];
    for (let i = 0; i < patients; i += 1) pts.push(await makePatient(t.prisma, doctor.id));
    return { doctor, browser, pts };
  };

  const save = async (browser: Agent, patientId: string, over: Record<string, unknown> = {}) => {
    const res = await browser.post('/api/prescriptions').send(rxBody(patientId, over));
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };

  const napaHabit = (doctor: User) =>
    t.prisma.doctorRxHabit.findMany({ where: { doctorId: doctor.id, drugLabel: 'Tablet. Napa 500mg' } });
  const phrase = (doctor: User, source: 'advice' | 'rxNote') =>
    t.prisma.doctorPhraseHabit.findMany({ where: { doctorId: doctor.id, source } });

  describe('the stored record', () => {
    it('reads back every line in the order and wording it was sent', async () => {
      const { browser, pts } = await setup();
      const { id } = await save(browser, pts[0].id);

      const res = await browser.get(`/api/prescriptions/${id}`);
      expect(res.status).toBe(200);
      const items = res.body.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(RX_LINES.length);

      RX_LINES.forEach((sent, i) => {
        const got = items[i];
        // Exact string equality — nothing trimmed, reworded, recased or rounded.
        expect(got.drug).toBe(sent.drug);
        expect(got.dose).toBe(sent.dose);
        expect(got.duration).toBe(sent.duration);
        expect(got.instruction).toBe(sent.instruction);
        expect(got.order).toBe(i);
        expect(got.isNote).toBe(sent.isNote ?? false);
        // `isCont` is nullable on purpose: absent stays null, never coerced to false.
        expect(got.isCont).toBe(sent.isCont ?? null);
        expect(got.sf).toBe(sent.sf ?? null);
      });
      expect(res.body.advice).toEqual(ADVICE);
    });

    it('stores the same rows it returns (read from the table, not the response)', async () => {
      const { browser, pts } = await setup();
      const { id } = await save(browser, pts[0].id);

      const rows = await t.prisma.prescriptionItem.findMany({
        where: { prescriptionId: id },
        orderBy: { order: 'asc' },
      });
      expect(rows.map((r) => [r.drug, r.dose, r.duration, r.instruction, r.isNote, r.isCont])).toEqual(
        RX_LINES.map((l) => [l.drug, l.dose, l.duration, l.instruction, l.isNote ?? false, l.isCont ?? null]),
      );
    });

    it('keeps whitespace and casing of a line exactly as typed', async () => {
      const { browser, pts } = await setup();
      const odd = { drug: '  Tablet.  Napa 500mg ', dose: ' 1+1+1', duration: '7 Days ', instruction: 'Food' };
      const { id } = await save(browser, pts[0].id, { items: [odd] });
      const res = await browser.get(`/api/prescriptions/${id}`);
      expect(res.body.items[0]).toMatchObject(odd);
    });

    it('keeps `note` and `plan` as two separate fields', async () => {
      const { browser, pts } = await setup();
      const { id } = await save(browser, pts[0].id, {
        note: ['Review sugar chart'],
        plan: ['Bed rest'],
      });
      const res = await browser.get(`/api/prescriptions/${id}`);
      expect(res.body.note).toEqual(['Review sugar chart']);
      expect(res.body.plan).toEqual(['Bed rest']);

      const row = await t.prisma.prescription.findUniqueOrThrow({ where: { id } });
      expect(row.note).toEqual(['Review sugar chart']);
      expect(row.plan).toEqual(['Bed rest']);
    });

    it('a save with only `plan` leaves `note` empty, and the reverse', async () => {
      const { browser, pts } = await setup();
      const a = await save(browser, pts[0].id, { plan: ['Bed rest'] });
      const b = await save(browser, pts[0].id, { note: ['Review sugar chart'] });
      const rowA = await t.prisma.prescription.findUniqueOrThrow({ where: { id: a.id } });
      const rowB = await t.prisma.prescription.findUniqueOrThrow({ where: { id: b.id } });
      expect([rowA.note, rowA.plan]).toEqual([[], ['Bed rest']]);
      expect([rowB.note, rowB.plan]).toEqual([['Review sugar chart'], []]);
    });
  });

  describe('DoctorRxHabit — patientCount is distinct patients', () => {
    it('does not rise on a second save for the SAME patient, rises for a DIFFERENT one', async () => {
      const { doctor, browser, pts } = await setup(2);

      await save(browser, pts[0].id);
      let rows = await napaHabit(doctor);
      expect(rows).toHaveLength(1);
      expect(rows[0].patientCount).toBe(1);

      await save(browser, pts[0].id);
      rows = await napaHabit(doctor);
      expect(rows).toHaveLength(1);
      expect(rows[0].patientCount).toBe(1);

      await save(browser, pts[1].id);
      rows = await napaHabit(doctor);
      expect(rows).toHaveLength(1);
      expect(rows[0].patientCount).toBe(2);
    });

    it('learns the tapering pair as ONE block with its continuation line, verbatim', async () => {
      const { doctor, browser, pts } = await setup();
      await save(browser, pts[0].id);

      const rows = await t.prisma.doctorRxHabit.findMany({
        where: { doctorId: doctor.id, drugLabel: 'Capsule. Levat 4 mg' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ dose: '0+0+1', food: '', duration: '7 days', patientCount: 1 });
      expect(rows[0].contLines).toEqual([{ dose: '0+0+2', food: '', duration: 'Continue' }]);
    });

    it('never learns a note line as a medicine', async () => {
      const { doctor, browser, pts } = await setup();
      await save(browser, pts[0].id);
      const all = await t.prisma.doctorRxHabit.findMany({ where: { doctorId: doctor.id } });
      expect(all.map((r) => r.drugLabel).sort()).toEqual(['Capsule. Levat 4 mg', 'Tablet. Napa 500mg']);
    });

    it('a hidden habit stays hidden after another save', async () => {
      const { doctor, browser, pts } = await setup(2);
      await save(browser, pts[0].id);
      const [row] = await napaHabit(doctor);

      const hide = await browser.patch(`/api/rx-habits/${row.id}`).send({ hidden: true });
      expect(hide.status).toBe(200);

      await save(browser, pts[1].id);
      const [after] = await napaHabit(doctor);
      expect(after.hidden).toBe(true);
      // The count still follows the record while it is hidden.
      expect(after.patientCount).toBe(2);
    });

    it('does not leak across doctors — each doctor counts only their own patients', async () => {
      const a = await setup();
      const b = await setup();
      await save(a.browser, a.pts[0].id);
      await save(b.browser, b.pts[0].id);
      expect((await napaHabit(a.doctor))[0].patientCount).toBe(1);
      expect((await napaHabit(b.doctor))[0].patientCount).toBe(1);
    });
  });

  describe('DoctorPhraseHabit — advice and ℞ note lines', () => {
    it('counts distinct patients for an advice line and a note line', async () => {
      const { doctor, browser, pts } = await setup(2);

      await save(browser, pts[0].id);
      await save(browser, pts[0].id);
      let advice = await phrase(doctor, 'advice');
      let notes = await phrase(doctor, 'rxNote');
      expect(advice).toHaveLength(1);
      expect(advice[0]).toMatchObject({ text: 'Insulin as before', patientCount: 1 });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ text: 'Review sugar chart', patientCount: 1 });

      await save(browser, pts[1].id);
      advice = await phrase(doctor, 'advice');
      notes = await phrase(doctor, 'rxNote');
      expect(advice[0].patientCount).toBe(2);
      expect(notes[0].patientCount).toBe(2);
    });

    it('a hidden phrase stays hidden after another save', async () => {
      const { doctor, browser, pts } = await setup(2);
      await save(browser, pts[0].id);
      const [row] = await phrase(doctor, 'advice');

      const hide = await browser.patch(`/api/doctor-phrases/${row.id}`).send({ hidden: true });
      expect(hide.status).toBe(200);

      await save(browser, pts[1].id);
      const [after] = await phrase(doctor, 'advice');
      expect(after.hidden).toBe(true);
      expect(after.patientCount).toBe(2);
    });
  });

  describe('a derived-write failure never fails the save', () => {
    it('saves the prescription when the habit write throws', async () => {
      const { doctor, browser, pts } = await setup();
      const spy = jest
        .spyOn(t.app.get(RxHabitsService), 'recordFrom')
        .mockRejectedValue(new Error('DoctorRxHabit does not exist'));

      const res = await browser.post('/api/prescriptions').send(rxBody(pts[0].id));

      expect(spy).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(201);
      expect(res.body.items).toHaveLength(RX_LINES.length);
      const row = await t.prisma.prescription.findUnique({
        where: { id: res.body.id },
        include: { items: true },
      });
      expect(row).not.toBeNull();
      expect(row!.doctorId).toBe(doctor.id);
      expect(row!.items).toHaveLength(RX_LINES.length);
    });

    it('saves the prescription when the phrase write throws', async () => {
      const { browser, pts } = await setup();
      const spy = jest
        .spyOn(t.app.get(DoctorPhrasesService), 'recordFrom')
        .mockRejectedValue(new Error('connection lost'));

      const res = await browser.post('/api/prescriptions').send(rxBody(pts[0].id));

      expect(spy).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(201);
      expect(await t.prisma.prescription.count({ where: { id: res.body.id } })).toBe(1);
      expect(await t.prisma.prescriptionItem.count({ where: { prescriptionId: res.body.id } })).toBe(
        RX_LINES.length,
      );
    });
  });

  describe('scoping', () => {
    it("GET /prescriptions/:id by another doctor is 404, and their list is empty", async () => {
      const a = await setup();
      const b = await setup();
      const { id } = await save(a.browser, a.pts[0].id);

      const get = await b.browser.get(`/api/prescriptions/${id}`);
      expect(get.status).toBe(404);

      const list = await b.browser.get('/api/prescriptions').query({ patientId: a.pts[0].id });
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);
    });

    it("refuses a prescription on another doctor's patient and writes nothing", async () => {
      const a = await setup();
      const b = await setup();
      const res = await b.browser.post('/api/prescriptions').send(rxBody(a.pts[0].id));
      expect(res.status).toBe(404);
      expect(await t.prisma.prescription.count({ where: { patientId: a.pts[0].id } })).toBe(0);
    });

    it('answers 401 without a session', async () => {
      const res = await t.agent().get('/api/prescriptions/anything');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /medicines/search', () => {
    let browser: Agent;
    beforeAll(async () => {
      browser = await loginAs(t, await makeDoctor(t.prisma));
    });
    const search = (q?: string) =>
      q === undefined ? browser.get('/api/medicines/search') : browser.get('/api/medicines/search').query({ q });
    const brands = (body: Array<{ brandName: string }>) => body.map((m) => m.brandName);

    it('puts a brand-prefix match above a generic-prefix match', async () => {
      // "en": Entaliv starts with it (brand); Barcavir matches only through its
      // generic, Entecavir.
      const res = await search('en');
      expect(res.status).toBe(200);
      expect(brands(res.body)).toEqual(['Entaliv', 'Barcavir']);
    });

    it('puts a brand match above a generic-contains match', async () => {
      // "ar": Barcavir contains it (brand); Napa matches only inside Paracetamol.
      const res = await search('ar');
      expect(brands(res.body)).toEqual(['Barcavir', 'Napa', 'Napa']);
    });

    it('finds a medicine by generic and returns the generic with it', async () => {
      const res = await search('esome');
      expect(brands(res.body)).toEqual(['Maxpro', 'Sergel']);
      expect(res.body.every((m: { genericName: string }) => m.genericName === 'Esomeprazole')).toBe(true);
    });

    it('is case-insensitive and returns the row verbatim', async () => {
      const res = await search('BARCA');
      expect(res.body).toEqual([
        {
          id: 't-barcavir-05',
          brandName: 'Barcavir',
          genericName: 'Entecavir',
          dosageForm: 'Tablet',
          strength: '0.5 mg',
          company: 'Test Pharma',
          priceRaw: null,
        },
      ]);
    });

    it('returns [] under 2 characters, for blanks and with no q at all', async () => {
      for (const q of ['n', '', ' ', ' n ', undefined]) {
        const res = await search(q);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      }
    });

    it("is safe with %, _ and ' in the query", async () => {
      for (const q of ['%%', '__', "na'", "'; DROP TABLE medicines; --", "%' OR '1'='1", 'na\\', '100%']) {
        const res = await search(q);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeLessThanOrEqual(10);
      }
      // A quote is data, not SQL: nothing matches it and the table is intact.
      expect((await search("na'")).body).toEqual([]);
      expect((await search("'; DROP TABLE medicines; --")).body).toEqual([]);
      const [{ n }] = await t.prisma.$queryRawUnsafe<{ n: number }[]>(
        'SELECT COUNT(*)::int AS n FROM medicines',
      );
      expect(n).toBe(6);
    });

    it('requires a session', async () => {
      const res = await t.agent().get('/api/medicines/search').query({ q: 'napa' });
      expect(res.status).toBe(401);
    });
  });
});
