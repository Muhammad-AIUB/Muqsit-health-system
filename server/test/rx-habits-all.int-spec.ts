import type { User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor } from './support/fixtures';
import { resetDb } from './support/test-db';
import { normaliseDrugKey, searchKeyOf, signatureOf } from '../src/rx-habits/normalise';

// GET /api/rx-habits/all — the "Add Bulk Medicine" list, through the real HTTP
// pipeline and the real database. ⚕️ What it has to hold: a doctor is shown
// their OWN medicines and nobody else's, and the row of each medicine is the
// one the typing dropdown would offer first. Every medicine, dose and count
// here is made up.
//
//   A     a doctor with habits of every kind the rule has to choose between
//   B     another doctor, whose medicines A must never be shown
//   asst  an assistant of A
type Browser = ReturnType<TestApp['agent']>;
interface Listed {
  drugLabel: string;
  dose: string;
  food: string;
  duration: string;
  contLines: { dose: string; food: string; duration: string }[];
  patientCount: number;
  generic?: string;
}

const NAPA = 'Tablet. Napa 500 mg';
const BARCAVIR = 'Tablet. Barcavir 0.5 mg';
const SERGEL = 'Capsule (Enteric Coated). Sergel 40 mg';
const DELTASONE = 'Tablet. Deltasone 5 mg'; // not in the test catalogue

describe('GET /api/rx-habits/all', () => {
  let t: TestApp;
  let A: User, B: User, asst: User;
  let a: Browser, b: Browser, as: Browser;

  const habit = (
    doctorId: string,
    drugLabel: string,
    line: { dose: string; food: string; duration: string },
    over: {
      patientCount?: number;
      hidden?: boolean;
      pinned?: boolean;
      contLines?: { dose: string; food: string; duration: string }[];
      lastUsedAt?: string;
    } = {},
  ) =>
    t.prisma.doctorRxHabit.create({
      data: {
        doctorId,
        drugKey: normaliseDrugKey(drugLabel),
        searchKey: searchKeyOf(drugLabel),
        drugLabel,
        signature: signatureOf(line, over.contLines ?? []),
        dose: line.dose,
        food: line.food,
        duration: line.duration,
        contLines: over.contLines ?? [],
        patientCount: over.patientCount ?? 1,
        lastUsedAt: new Date(over.lastUsedAt ?? '2026-10-01T00:00:00Z'),
        hidden: over.hidden ?? false,
        pinned: over.pinned ?? false,
      },
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    [A, B] = await Promise.all([makeDoctor(t.prisma), makeDoctor(t.prisma)]);
    asst = await makeDoctor(t.prisma, { accountTier: 'secondary' });
    await makeAssistantLink(t.prisma, A.id, asst.id, []);

    // Two instructions: the one given to more patients is the medicine's row.
    await habit(A.id, NAPA, { dose: '1+1+1', food: 'After meal', duration: '5 days' }, { patientCount: 30 });
    await habit(A.id, NAPA, { dose: '1+0+1', food: 'After meal', duration: '3 days' }, { patientCount: 4 });
    // One instruction, with a blank cell — it is returned blank.
    await habit(A.id, BARCAVIR, { dose: '1+0+0', food: '', duration: 'Continue' }, { patientCount: 9 });
    // The most-used instruction is hidden: the next one is the row.
    await habit(A.id, SERGEL, { dose: '1+0+1', food: 'Before meal', duration: '14 days' }, { patientCount: 22, hidden: true });
    await habit(A.id, SERGEL, { dose: '0+0+1', food: 'Before meal', duration: '7 days' }, { patientCount: 2 });
    // Every instruction hidden: not listed at all.
    await habit(A.id, 'Tablet. Onlyhidden 5 mg', { dose: '1+0+0', food: '', duration: '' }, { patientCount: 50, hidden: true });
    // A pinned instruction is the row, whatever the counts say — and it tapers.
    await habit(
      A.id,
      DELTASONE,
      { dose: '2+0+0', food: 'After meal', duration: '5 days' },
      { patientCount: 1, pinned: true, contLines: [{ dose: '1+0+0', food: 'After meal', duration: '5 days' }] },
    );
    await habit(A.id, DELTASONE, { dose: '1+0+0', food: 'After meal', duration: '5 days' }, { patientCount: 10 });
    // Another doctor's: a medicine A does not have, and one A DOES have — at
    // another dose, pinned and given to far more patients. If the rows of the
    // two doctors were ranked together and filtered afterwards, B's Napa would
    // be "the" Napa row and A's list would lose its own.
    await habit(B.id, 'Tablet. Bsecret 10 mg', { dose: '1+0+0', food: '', duration: '7 days' }, { patientCount: 99 });
    await habit(B.id, NAPA, { dose: '2+2+2', food: 'Before meal', duration: '30 days' }, { patientCount: 999, pinned: true });

    a = await loginAs(t, A);
    b = await loginAs(t, B);
    as = await loginAs(t, asst);
  });
  afterAll(async () => {
    await t.close();
  });

  const listed = (body: unknown) => (body as { medicines: Listed[] }).medicines;
  const named = (rows: Listed[], drugLabel: string) => rows.find((m) => m.drugLabel === drugLabel);

  it('is refused without a session', async () => {
    const res = await t.agent().get('/api/rx-habits/all');
    expect(res.status).toBe(401);
  });

  it("⚕️ lists the doctor's OWN medicines, one row each, most patients first — and nobody else's", async () => {
    const res = await a.get('/api/rx-habits/all');
    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(false);
    expect(res.body.unreadable).toBe(0);
    expect(listed(res.body).map((m) => [m.drugLabel, m.dose, m.patientCount])).toEqual([
      [NAPA, '1+1+1', 30],
      [BARCAVIR, '1+0+0', 9],
      [SERGEL, '0+0+1', 2],
      [DELTASONE, '2+0+0', 1],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Bsecret');
    expect(JSON.stringify(res.body)).not.toContain('2+2+2'); // B's dose of a medicine both prescribe
  });

  it('a dose the doctor hid is not offered, and a medicine with every dose hidden is not listed', async () => {
    const body = JSON.stringify((await a.get('/api/rx-habits/all')).body);
    expect(body).not.toContain('14 days'); // Sergel's hidden instruction
    expect(body).not.toContain('Onlyhidden');
  });

  it('returns exactly what was written: a blank cell stays blank, a taper comes with its medicine', async () => {
    const rows = listed((await a.get('/api/rx-habits/all')).body);
    expect(named(rows, BARCAVIR)).toMatchObject({ dose: '1+0+0', food: '', duration: 'Continue', contLines: [] });
    expect(named(rows, DELTASONE)?.contLines).toEqual([{ dose: '1+0+0', food: 'After meal', duration: '5 days' }]);
  });

  it('⚕️ carries each generic from the catalogue, on the same response', async () => {
    const rows = listed((await a.get('/api/rx-habits/all')).body);
    expect(named(rows, NAPA)?.generic).toBe('Paracetamol');
    expect(named(rows, BARCAVIR)?.generic).toBe('Entecavir');
    expect(named(rows, SERGEL)?.generic).toBe('Esomeprazole');
    expect(named(rows, DELTASONE)?.generic).toBeUndefined();
  });

  it('the other doctor gets their own list, and a forged workstation header is refused', async () => {
    expect(listed((await b.get('/api/rx-habits/all')).body).map((m) => [m.drugLabel, m.dose, m.patientCount])).toEqual([
      [NAPA, '2+2+2', 999],
      ['Tablet. Bsecret 10 mg', '1+0+0', 99],
    ]);
    const forged = await b.get('/api/rx-habits/all').set({ 'X-Workstation': A.id });
    expect(forged.status).toBe(403);
    expect(JSON.stringify(forged.body)).not.toContain('Napa');
  });

  it("an assistant working in A's workstation gets A's list", async () => {
    const inA = await as.get('/api/rx-habits/all').set({ 'X-Workstation': A.id });
    expect(inA.status).toBe(200);
    expect(listed(inA.body).map((m) => m.drugLabel)).toEqual([NAPA, BARCAVIR, SERGEL, DELTASONE]);
  });

  it('writes nothing: the habits are the same rows after the list was read', async () => {
    const before = await t.prisma.doctorRxHabit.findMany({ orderBy: { id: 'asc' } });
    await a.get('/api/rx-habits/all');
    await as.get('/api/rx-habits/all').set({ 'X-Workstation': A.id });
    expect(await t.prisma.doctorRxHabit.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });
});

// ⚕️ The catalogue is asked in SQL for the brands whose FIRST WORD is one of the
// doctor's brand words (rx-habits.service.ts#catalogueRows). A unit test can
// only read that SQL; whether it finds the right rows is a question for a real
// Postgres. Each row below is a way a brand is really written in a catalogue
// that was typed and pasted by hand — and each one a medicine that goes onto
// the pad without its contraindication warning if the question misses it.
// Every brand and generic here is made up.
describe('GET /api/rx-habits/all — the catalogue as it is really written', () => {
  let t: TestApp;
  let C: User;
  let c: Browser;

  const NBSP = String.fromCharCode(160);
  // [brand as the catalogue has it, generic, form, strength, the label the doctor's habit carries]
  const CASES: [string, string, string, string, string][] = [
    [' Spacey', 'Gen leading space', 'Tablet', '5 mg', 'Tablet. Spacey 5 mg'],
    ['Tabby\tOne', 'Gen tab', 'Tablet', '5 mg', 'Tablet. Tabby One 5 mg'],
    [`Nobreak${NBSP}Two`, 'Gen no-break space', 'Tablet', '5 mg', 'Tablet. Nobreak Two 5 mg'],
    ['UPPERCASE Brand', 'Gen capitals', 'Tablet', '5 mg', 'Tablet. Uppercase Brand 5 mg'],
    ['E Cap', 'Gen one-letter first word', 'Capsule', '400 mg', 'Capsule. E Cap 400 mg'],
    ['E', 'Gen one-letter brand', 'Capsule', '400 mg', 'Capsule. E 400 mg'],
    ['Percent%Sign', 'Gen percent', 'Tablet', '5 mg', 'Tablet. Percent%Sign 5 mg'],
    ['Under_score', 'Gen underscore', 'Tablet', '5 mg', 'Tablet. Under_score 5 mg'],
    ['Multi Word Brand Name', 'Gen several words', 'Syrup', '120 mg/5 ml', 'Syrup. Multi Word Brand Name 120 mg/5 ml'],
    ['3 G Cef', 'Gen number then unit', 'Tablet', '250 mg', 'Tablet. 3 G Cef 250 mg'],
  ];
  // Rows that must NOT lend their generic: each is what a looser question finds.
  const DECOYS: [string, string, string, string][] = [
    ['Percentile', 'WRONG percent as a pattern', 'Tablet', '5 mg'],
    ['UnderXscore', 'WRONG underscore as a pattern', 'Tablet', '5 mg'],
    ['Spaceyplus', 'WRONG longer first word', 'Tablet', '5 mg'],
    ['Spacey', 'WRONG other strength', 'Tablet', '50 mg'],
    ['Echo', 'WRONG begins with the letter', 'Capsule', '400 mg'],
  ];
  const rows = [...CASES.map(([b, g, f, s]) => [b, g, f, s]), ...DECOYS];

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    await t.prisma.$executeRawUnsafe(`DELETE FROM medicines WHERE id LIKE 'bulk-int-%'`);
    await t.prisma.$executeRawUnsafe(
      `INSERT INTO medicines (id, "brandName", "genericName", "dosageForm", strength, company, "priceRaw")
       SELECT 'bulk-int-' || n, b, g, f, s, 'Test Pharma', NULL
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) WITH ORDINALITY AS x(b, g, f, s, n)`,
      rows.map((r) => r[0]), rows.map((r) => r[1]), rows.map((r) => r[2]), rows.map((r) => r[3]),
    );
    C = await makeDoctor(t.prisma);
    const line = { dose: '1+0+0', food: '', duration: '7 days' };
    for (const [, , , , drugLabel] of CASES) {
      await t.prisma.doctorRxHabit.create({
        data: {
          doctorId: C.id, drugKey: normaliseDrugKey(drugLabel), searchKey: searchKeyOf(drugLabel), drugLabel,
          signature: signatureOf(line, []), ...line, contLines: [], patientCount: 1, lastUsedAt: new Date('2026-10-01T00:00:00Z'),
        },
      });
    }
    c = await loginAs(t, C);
  });
  afterAll(async () => {
    // `medicines` is reference data that resetDb keeps: take our rows back out.
    await t.prisma.$executeRawUnsafe(`DELETE FROM medicines WHERE id LIKE 'bulk-int-%'`);
    await t.close();
  });

  it('⚕️ finds the generic of every one of them — and of no other row', async () => {
    const res = await c.get('/api/rx-habits/all');
    expect(res.status).toBe(200);
    const got = Object.fromEntries(
      (res.body.medicines as { drugLabel: string; generic?: string }[]).map((m) => [m.drugLabel, m.generic]),
    );
    expect(got).toEqual(Object.fromEntries(CASES.map(([, generic, , , drugLabel]) => [drugLabel, generic])));
  });

  it('⚕️ "Your usual" asks the same question: the typing dropdown finds them too', async () => {
    for (const [, generic, , , drugLabel] of CASES) {
      const res = await c.get('/api/rx-habits').query({ q: drugLabel });
      expect(res.status).toBe(200);
      const groups = res.body as { drugLabel: string; generic?: string }[];
      expect([drugLabel, groups.find((g) => g.drugLabel === drugLabel)?.generic]).toEqual([drugLabel, generic]);
    }
  });
});
