import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor } from './support/fixtures';
import { admissionBody } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';
import { normaliseDrugKey, searchKeyOf, signatureOf } from '../src/rx-habits/normalise';

// GET /api/rx-habits/all?for=ipd — the IPD sheet's "Add Bulk Medicine" list
// (physician, 24/11/2026): what the doctor ordered on the WARD comes first, the
// rest of the OPD list follows, and nobody else's admissions are ever read.
// Every medicine and dose is made up.

const NAPA = 'Tablet. Napa 500 mg';
const BARCAVIR = 'Tablet. Barcavir 0.5 mg';
const CEF = 'Injection. Ceftriaxone 1 gm';

describe('GET /api/rx-habits/all?for=ipd', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  const opdHabit = (doctorId: string, drugLabel: string, patientCount: number) =>
    t.prisma.doctorRxHabit.create({
      data: {
        doctorId, drugKey: normaliseDrugKey(drugLabel), searchKey: searchKeyOf(drugLabel), drugLabel,
        signature: signatureOf({ dose: '1+0+1', food: '', duration: '5 days' }, []),
        dose: '1+0+1', food: '', duration: '5 days', contLines: [], patientCount, lastUsedAt: new Date(),
      },
    });

  it('lists the ward medicines first, then the OPD ones not already there; the OPD box is unchanged', async () => {
    const doc = await makeDoctor(t.prisma);
    const browser = await loginAs(t, doc);
    await opdHabit(doc.id, NAPA, 50); // heavily used in OPD …
    await opdHabit(doc.id, BARCAVIR, 5);
    // `clinical` is accepted on update only: admit, then write the ward's orders.
    const sheet = async (items: unknown[]) => {
      const adm = await browser.post('/api/ipd').send(admissionBody());
      expect(adm.status).toBe(201);
      return browser.patch(`/api/ipd/${adm.body.id}`).send({ clinical: { rxItems: items } });
    };
    const cef = { drug: CEF, dose: '1+0+1', duration: '5 days', instruction: 'IV' };
    expect((await sheet([cef])).status).toBe(200);
    expect((await sheet([cef, { drug: BARCAVIR, dose: '0+0+1', duration: '7 days', instruction: '' }])).status).toBe(200);

    const ward = await browser.get('/api/rx-habits/all').query({ for: 'ipd' });
    expect(ward.status).toBe(200);
    const labels = ward.body.medicines.map((m: { drugLabel: string }) => m.drugLabel);
    // … but the ward's own come first: Ceftriaxone (2 admissions), Barcavir (1), then Napa.
    expect(labels).toEqual([CEF, BARCAVIR, NAPA]);
    const bar = ward.body.medicines[1];
    expect([bar.dose, bar.duration]).toEqual(['0+0+1', '7 days']); // the ward's instruction, not the OPD one
    expect(bar.generic).toBe('Entecavir'); // the generic still travels with it

    const opd = await browser.get('/api/rx-habits/all');
    expect(opd.body.medicines.map((m: { drugLabel: string }) => m.drugLabel)).toEqual([NAPA, BARCAVIR]);
  });

  it("⚕️ never reads another doctor's admissions", async () => {
    const a = await makeDoctor(t.prisma);
    const b = await makeDoctor(t.prisma);
    const bb = await loginAs(t, b);
    const adm = await bb.post('/api/ipd').send(admissionBody());
    await bb.patch(`/api/ipd/${adm.body.id}`).send({ clinical: { rxItems: [{ drug: CEF, dose: '1+0+1', duration: '5 days', instruction: '' }] } });
    const aa = await loginAs(t, a);
    const res = await aa.get('/api/rx-habits/all').query({ for: 'ipd' });
    expect(res.body.medicines).toEqual([]);
  });
});
