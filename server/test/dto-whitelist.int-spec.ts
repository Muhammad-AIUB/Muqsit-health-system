import type { User } from '@prisma/client';
import { getMetadataStorage } from 'class-validator';
import { CreatePatientDto, UpdatePatientDto } from '../src/patients/dto/patient.dto';
import { CreatePrescriptionDto, RxItemDto } from '../src/prescriptions/dto/prescription.dto';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor, makePatient } from './support/fixtures';
import { resetDb } from './support/test-db';

// The "saved but silently dropped" trap (server/CLAUDE.md Rule 3).
// ValidationPipe({ whitelist: true }) removes any field a DTO does not declare,
// and a declared field can still be lost between the DTO and the Prisma write.
// So: every declared field is sent, then read back through the API.
type Browser = ReturnType<TestApp['agent']>;

// The property names class-validator knows for a DTO class — i.e. exactly the
// set the whitelist lets through. Used to prove the payloads below cover the
// whole DTO, so a field added to a DTO later fails here until it is exercised.
function declaredFields(dto: new () => object): string[] {
  const metas = getMetadataStorage().getTargetValidationMetadatas(dto, '', false, false);
  return [...new Set(metas.map((m) => m.propertyName))].sort();
}

// ── PATCH /patients/:id — one valid value per UpdatePatientDto field ─────────
const PATIENT_PATCH = {
  name: 'Test Patient Renamed',
  hospitalId: 'TEST-HID-1',
  bloodGroup: 'Test group',
  dob: '1980-05-17',
  age: 46,
  ageAsOfYear: 2026,
  sex: 'Male',
  ethnicity: 'Test ethnicity',
  religion: 'Test religion',
  mobile: '01900009999',
  nid: 'TEST-NID-9',
  spouseMobile: '01900009998',
  relativeMobile: '01900009997',
  relativeRelation: 'Brother',
  district: 'Test district',
  fullAddress: 'Test address line',
  monthlyIncome: 'Test income',
  pictureUrl: 'http://localhost:4100/uploads/test-picture.png',
  tags: ['test-tag-1', 'test-tag-2'],
  watched: true,
  prescriptionImages: ['http://localhost:4100/uploads/test-rx-1.png'],
  reportImages: ['http://localhost:4100/uploads/test-report-1.png'],
  lastRxImageKey: 'a'.repeat(64),
  imageThumbs: {
    'http://localhost:4100/uploads/test-rx-1.png': 'http://localhost:4100/uploads/test-rx-1-thumb.jpg',
  },
  hmDrugDates: { 'Tablet. Napa 500mg': { sf: '01/01/2026', upto: '08/01/2026' } },
  hmSymptomDates: { 'Test complaint': { sf: '01/01/2026', upto: '08/01/2026' } },
  hmSelectedDrugs: ['Tablet. Napa 500mg'],
  familyMembers: [
    { name: 'Test Relative', mobile: '01900009996', nid: 'TEST-NID-8', sex: 'Male', relation: 'Brother' },
  ],
  investigationSummary: [
    { date: '01/01/2026', category: 'Test category', test: 'Test name', value: 'Test value' },
  ],
  onExaminationSummary: [{ date: '01/01/2026', text: 'Test examination line' }],
  drugHistory: ['01/01/2026: Tablet. Napa 500mg'],
  incompleteRx: { marker: 'test-draft', chiefComplaints: ['Test complaint'] },
};

// What the API returns for each field. Only `dob` changes representation.
const PATIENT_EXPECTED: Record<string, unknown> = {
  ...PATIENT_PATCH,
  dob: '1980-05-17T00:00:00.000Z',
};

// ── POST /prescriptions — one valid value per declared field ─────────────────
const RX_ITEMS = [
  {
    drug: 'Tablet. Napa 500mg',
    dose: '1+1+1',
    duration: '7 days',
    instruction: 'after meal',
    order: 3,
    isNote: false,
    sf: '17 June 2026',
    isCont: false,
  },
  {
    drug: 'Tablet. Napa 500mg',
    dose: '0+0+1',
    duration: 'continue',
    instruction: 'after meal',
    order: 5,
    isNote: false,
    sf: '24 June 2026',
    isCont: true,
  },
  {
    drug: 'Take plenty of water',
    dose: '',
    duration: '',
    instruction: '',
    order: 8,
    isNote: true,
    sf: '',
    isCont: false,
  },
];

const RX_FIELDS = {
  chiefComplaints: ['Test complaint 1', 'Test complaint 2'],
  previousComplaints: ['Test previous complaint'],
  history: ['Test history line'],
  investigation: ['Test investigation line'],
  drugHistory: ['01/01/2026: Tablet. Napa 500mg'],
  onExamination: ['Test examination line'],
  note: ['Test note line'],
  plan: ['Test plan line'],
  provisionalDiagnosis: ['Test provisional diagnosis'],
  associatedIllness: ['Test associated illness'],
  finalDiagnosis: ['Test final diagnosis'],
  advice: ['Test advice line'],
  adviceTest: ['Test advised investigation'],
  followUpNum: '7',
  followUpUnit: 'days',
  followUpMandatory: true,
};

describe('DTO whitelist — declared fields persist, undeclared fields do not', () => {
  let t: TestApp;
  let doctor: User;
  let other: User;
  let browser: Browser;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    doctor = await makeDoctor(t.prisma);
    other = await makeDoctor(t.prisma);
    browser = await loginAs(t, doctor);
  });
  afterAll(async () => {
    await t.close();
  });

  describe('PATCH /patients/:id (UpdatePatientDto)', () => {
    it('the payload below covers every field the DTO declares', () => {
      expect(Object.keys(PATIENT_PATCH).sort()).toEqual(declaredFields(UpdatePatientDto));
      // UpdatePatientDto is CreatePatientDto (all optional) plus the record fields.
      for (const f of declaredFields(CreatePatientDto)) {
        expect(declaredFields(UpdatePatientDto)).toContain(f);
      }
    });

    it('persists every declared field sent in ONE request, read back through the API', async () => {
      const p = await makePatient(t.prisma, doctor.id);

      const res = await browser.patch(`/api/patients/${p.id}`).send(PATIENT_PATCH);
      expect(res.status).toBe(200);

      const read = await browser.get(`/api/patients/${p.id}`);
      expect(read.status).toBe(200);
      for (const [field, expected] of Object.entries(PATIENT_EXPECTED)) {
        expect({ field, value: read.body[field] }).toEqual({ field, value: expected });
      }
      expect(read.body.doctorId).toBe(doctor.id);
    });

    it.each(Object.keys(PATIENT_PATCH))('persists %s sent on its own, and changes nothing else', async (field) => {
      const p = await makePatient(t.prisma, doctor.id);
      const before = (await browser.get(`/api/patients/${p.id}`)).body;

      const res = await browser
        .patch(`/api/patients/${p.id}`)
        .send({ [field]: (PATIENT_PATCH as Record<string, unknown>)[field] });
      expect(res.status).toBe(200);

      const after = (await browser.get(`/api/patients/${p.id}`)).body;
      expect(after[field]).toEqual(PATIENT_EXPECTED[field]);
      // A single-field PATCH is not allowed to blank or rewrite a neighbour.
      for (const key of Object.keys(before)) {
        if (key === field || key === 'updatedAt') continue;
        expect({ key, value: after[key] }).toEqual({ key, value: before[key] });
      }
    });

    it('incompleteRx: null clears a stored draft', async () => {
      const p = await makePatient(t.prisma, doctor.id, { incompleteRx: { marker: 'draft' } } as never);
      const res = await browser.patch(`/api/patients/${p.id}`).send({ incompleteRx: null });
      expect(res.status).toBe(200);
      expect((await browser.get(`/api/patients/${p.id}`)).body.incompleteRx).toBeNull();
    });

    it('drops undeclared fields — unknown keys and real columns the DTO does not expose — and still succeeds', async () => {
      const p = await makePatient(t.prisma, doctor.id);
      const forgedDate = '2001-01-01T00:00:00.000Z';

      const res = await browser.patch(`/api/patients/${p.id}`).send({
        district: 'Test district',
        // Not a column at all.
        notADeclaredField: 'should vanish',
        nested: { anything: true },
        // Real Patient columns that are NOT on the DTO.
        id: 'forged-patient-id',
        doctorId: other.id,
        createdAt: forgedDate,
        updatedAt: forgedDate,
      });
      expect(res.status).toBe(200);
      expect(res.body.district).toBe('Test district');

      const read = await browser.get(`/api/patients/${p.id}`);
      expect(read.status).toBe(200);
      expect(read.body.district).toBe('Test district');
      expect(read.body.id).toBe(p.id);
      expect(read.body.doctorId).toBe(doctor.id);
      expect(read.body.createdAt).toBe(p.createdAt.toISOString());
      expect(read.body.updatedAt).not.toBe(forgedDate);
      expect(read.body).not.toHaveProperty('notADeclaredField');
      expect(read.body).not.toHaveProperty('nested');
      expect(JSON.stringify(read.body)).not.toContain('should vanish');
      expect(await t.prisma.patient.findUnique({ where: { id: 'forged-patient-id' } })).toBeNull();
    });

    it.each([
      ['a future date', '2999-01-01'],
      ['a future ISO datetime', '2999-01-01T00:00:00.000Z'],
      ['dd/mm/yyyy', '17/05/1980'],
      ['free text', 'not-a-date'],
      ['an impossible calendar date', '1980-02-31'],
      ['a number', 19800517],
    ])('rejects an invalid dob (%s) with 400 and writes nothing', async (_label, dob) => {
      const p = await makePatient(t.prisma, doctor.id, { dob: new Date('1970-01-01T00:00:00.000Z') });

      const res = await browser.patch(`/api/patients/${p.id}`).send({ dob, district: 'Must not be saved' });
      expect(res.status).toBe(400);

      const after = await t.prisma.patient.findUniqueOrThrow({ where: { id: p.id } });
      expect(after.dob!.toISOString()).toBe('1970-01-01T00:00:00.000Z');
      expect(after.district).toBeNull();
    });

    it('accepts a valid past dob and an ISO datetime', async () => {
      const p = await makePatient(t.prisma, doctor.id);
      expect((await browser.patch(`/api/patients/${p.id}`).send({ dob: '1980-05-17' })).status).toBe(200);
      expect((await browser.get(`/api/patients/${p.id}`)).body.dob).toBe('1980-05-17T00:00:00.000Z');
      expect(
        (await browser.patch(`/api/patients/${p.id}`).send({ dob: '1975-03-02T00:00:00.000Z' })).status,
      ).toBe(200);
      expect((await browser.get(`/api/patients/${p.id}`)).body.dob).toBe('1975-03-02T00:00:00.000Z');
    });

    it('POST /patients rejects the same invalid dob values with 400 and creates no row', async () => {
      for (const dob of ['2999-01-01', 'not-a-date', '17/05/1980']) {
        const name = `Test Invalid Dob ${dob}`;
        const res = await browser.post('/api/patients').send({ name, dob });
        expect(res.status).toBe(400);
        expect(await t.prisma.patient.count({ where: { name } })).toBe(0);
      }
    });

    it('POST /patients strips the record fields that only UpdatePatientDto declares', async () => {
      const res = await browser.post('/api/patients').send({
        name: 'Test One Door',
        hmDrugDates: PATIENT_PATCH.hmDrugDates,
        hmSymptomDates: PATIENT_PATCH.hmSymptomDates,
        incompleteRx: PATIENT_PATCH.incompleteRx,
        drugHistory: PATIENT_PATCH.drugHistory,
      });
      expect(res.status).toBe(201);
      const read = (await browser.get(`/api/patients/${res.body.id}`)).body;
      expect(read.hmDrugDates).toBeNull();
      expect(read.hmSymptomDates).toBeNull();
      expect(read.incompleteRx).toBeNull();
      expect(read.drugHistory).toEqual([]);
    });
  });

  describe('POST /prescriptions (CreatePrescriptionDto)', () => {
    it('the payload below covers every field the DTOs declare', () => {
      expect(['patientId', 'items', ...Object.keys(RX_FIELDS)].sort()).toEqual(
        declaredFields(CreatePrescriptionDto),
      );
      expect(Object.keys(RX_ITEMS[0]).sort()).toEqual(declaredFields(RxItemDto));
    });

    it('persists every declared field, read back through the API', async () => {
      const p = await makePatient(t.prisma, doctor.id);

      const res = await browser
        .post('/api/prescriptions')
        .send({ patientId: p.id, ...RX_FIELDS, items: RX_ITEMS });
      expect(res.status).toBe(201);

      const read = await browser.get(`/api/prescriptions/${res.body.id}`);
      expect(read.status).toBe(200);
      expect(read.body.patientId).toBe(p.id);
      expect(read.body.doctorId).toBe(doctor.id);
      for (const [field, expected] of Object.entries(RX_FIELDS)) {
        expect({ field, value: read.body[field] }).toEqual({ field, value: expected });
      }

      // Items come back in `order`, each with every declared field intact.
      expect(read.body.items).toHaveLength(RX_ITEMS.length);
      read.body.items.forEach((item: Record<string, unknown>, i: number) => {
        for (const [field, expected] of Object.entries(RX_ITEMS[i])) {
          expect({ i, field, value: item[field] }).toEqual({ i, field, value: expected });
        }
        expect(item.prescriptionId).toBe(res.body.id);
      });

      // The list route returns the same record.
      const list = await browser.get('/api/prescriptions').query({ patientId: p.id });
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].id).toBe(res.body.id);
      expect(list.body[0].items.map((x: { drug: string }) => x.drug)).toEqual(RX_ITEMS.map((x) => x.drug));
      expect(list.body[0].advice).toEqual(RX_FIELDS.advice);
    });

    it('optional fields left out take the stored defaults; item order defaults to position', async () => {
      const p = await makePatient(t.prisma, doctor.id);
      const res = await browser.post('/api/prescriptions').send({
        patientId: p.id,
        items: [
          { drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', instruction: '' },
          { drug: 'Take plenty of water', dose: '', duration: '', instruction: '', isNote: true },
        ],
      });
      expect(res.status).toBe(201);

      const read = (await browser.get(`/api/prescriptions/${res.body.id}`)).body;
      expect(read.chiefComplaints).toEqual([]);
      expect(read.advice).toEqual([]);
      expect(read.followUpNum).toBeNull();
      expect(read.followUpUnit).toBeNull();
      expect(read.followUpMandatory).toBe(false);
      expect(read.items.map((x: { order: number }) => x.order)).toEqual([0, 1]);
      expect(read.items.map((x: { isNote: boolean }) => x.isNote)).toEqual([false, true]);
      // An omitted isCont stays NULL ("written before the column existed"),
      // never coerced to false.
      expect(read.items.map((x: { isCont: boolean | null }) => x.isCont)).toEqual([null, null]);
      expect(read.items.map((x: { sf: string | null }) => x.sf)).toEqual([null, null]);
    });

    it('drops undeclared fields at the top level and inside items, and still succeeds', async () => {
      const p = await makePatient(t.prisma, doctor.id);
      const foreign = await makePatient(t.prisma, other.id);
      const forgedDate = '2001-01-01T00:00:00.000Z';

      const res = await browser.post('/api/prescriptions').send({
        patientId: p.id,
        advice: ['Test advice line'],
        // Not a column at all.
        notADeclaredField: 'should vanish',
        // Real Prescription columns that are NOT on the DTO.
        id: 'forged-prescription-id',
        doctorId: other.id,
        createdAt: forgedDate,
        items: [
          {
            drug: 'Tablet. Napa 500mg',
            dose: '1+1+1',
            duration: '7 days',
            instruction: '',
            // Undeclared on RxItemDto.
            id: 'forged-item-id',
            prescriptionId: 'forged-prescription-id',
            notADeclaredField: 'should vanish',
          },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.id).not.toBe('forged-prescription-id');

      const read = await browser.get(`/api/prescriptions/${res.body.id}`);
      expect(read.status).toBe(200);
      expect(read.body.doctorId).toBe(doctor.id);
      expect(read.body.patientId).toBe(p.id);
      expect(read.body.advice).toEqual(['Test advice line']);
      expect(read.body.createdAt).not.toBe(forgedDate);
      expect(read.body).not.toHaveProperty('notADeclaredField');
      expect(read.body.items).toHaveLength(1);
      expect(read.body.items[0].id).not.toBe('forged-item-id');
      expect(read.body.items[0].prescriptionId).toBe(res.body.id);
      expect(read.body.items[0]).not.toHaveProperty('notADeclaredField');
      expect(JSON.stringify(read.body)).not.toContain('should vanish');

      expect(await t.prisma.prescription.findUnique({ where: { id: 'forged-prescription-id' } })).toBeNull();
      expect(await t.prisma.prescriptionItem.findUnique({ where: { id: 'forged-item-id' } })).toBeNull();
      expect(await t.prisma.prescription.count({ where: { doctorId: other.id } })).toBe(0);
      expect(await t.prisma.prescription.count({ where: { patientId: foreign.id } })).toBe(0);
    });

    it.each([
      ['no items', (patientId: string) => ({ patientId })],
      ['no patientId', () => ({ items: [] })],
      ['an item missing a required string', (patientId: string) => ({ patientId, items: [{ drug: 'Tablet. Napa 500mg' }] })],
      ['a non-array list field', (patientId: string) => ({ patientId, items: [], advice: 'Test advice line' })],
      ['a non-boolean followUpMandatory', (patientId: string) => ({ patientId, items: [], followUpMandatory: 'yes' })],
    ])('rejects %s with 400 and stores nothing', async (_label, build) => {
      const p = await makePatient(t.prisma, doctor.id);
      const res = await browser.post('/api/prescriptions').send(build(p.id));
      expect(res.status).toBe(400);
      expect(await t.prisma.prescription.count({ where: { patientId: p.id } })).toBe(0);
    });
  });
});
