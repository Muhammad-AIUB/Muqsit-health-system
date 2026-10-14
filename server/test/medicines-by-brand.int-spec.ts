import type { User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor } from './support/fixtures';
import { resetDb } from './support/test-db';

// POST /api/medicines/by-brand — the medicine chart's rows for the brands on a
// ℞ pad, through the real HTTP pipeline and a real Postgres. It is what the
// "Total monthly approximate cost" box prices from. ⚕️ What it has to hold: the
// rows of the brands asked for and of no other (a brand that only BEGINS with
// the word is another brand), the price exactly as the chart writes it, and no
// way in without a session. The brands are made up; the prices are written in
// the shapes the chart's source workbooks use.

type Browser = ReturnType<TestApp['agent']>;
interface Row { brandName: string; dosageForm: string | null; strength: string | null; priceRaw: string | null }

const ROWS: [string, string | null, string | null, string | null][] = [
  ['Zzprice', 'Tablet', '20 mg', 'Unit Price: ৳ 7.00 (3 x 10: ৳ 210.00)'],
  ['Zzprice', 'Tablet', '40 mg', 'Unit Price: ৳ 11.00 (2 x 10: ৳ 220.00)'],
  ['Zzprice', 'Syrup', '10 mg/5 ml', '100 ml bottle: ৳ 85.00'],
  ['Zzprice', null, null, null],
  ['zzprice Extra', 'Capsule (Enteric Coated)', '40 mg', "Unit Price: ৳ 12.50 (100's pack: ৳ 1,250.00)"],
  ['Zzpriceplus', 'Tablet', '20 mg', 'Unit Price: ৳ 99.00'], // a longer first word: another brand
  ['Ozzprice', 'Tablet', '20 mg', 'Unit Price: ৳ 98.00'], // the word inside another: another brand
];

describe('POST /api/medicines/by-brand', () => {
  let t: TestApp;
  let A: User, asst: User;
  let a: Browser, as: Browser;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    await t.prisma.$executeRawUnsafe(`DELETE FROM medicines WHERE id LIKE 'price-int-%'`);
    await t.prisma.$executeRawUnsafe(
      `INSERT INTO medicines (id, "brandName", "genericName", "dosageForm", strength, company, "priceRaw")
       SELECT 'price-int-' || n, b, 'Made-up generic', f, s, 'Test Pharma', p
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) WITH ORDINALITY AS x(b, f, s, p, n)`,
      ROWS.map((r) => r[0]), ROWS.map((r) => r[1]), ROWS.map((r) => r[2]), ROWS.map((r) => r[3]),
    );
    A = await makeDoctor(t.prisma);
    asst = await makeDoctor(t.prisma, { accountTier: 'secondary' });
    [a, as] = await Promise.all([loginAs(t, A), loginAs(t, asst)]);
  });
  afterAll(async () => {
    // `medicines` is reference data that resetDb keeps: take our rows back out.
    await t.prisma.$executeRawUnsafe(`DELETE FROM medicines WHERE id LIKE 'price-int-%'`);
    await t.close();
  });

  const ask = (who: Browser, words: unknown) => who.post('/api/medicines/by-brand').send({ words });

  it('⚕️ gives the rows of the brands whose first word is asked — and of no other — with the price as the chart writes it', async () => {
    const res = await ask(a, ['zzprice']);
    expect(res.status).toBe(200);
    const rows = (res.body.rows as Row[]).filter((r) => r.brandName.toLowerCase().includes('zzprice'));
    // In the stated order: brand, form, strength.
    expect(rows.map((r) => [r.brandName, r.dosageForm, r.strength, r.priceRaw])).toEqual([
      ['Zzprice', 'Syrup', '10 mg/5 ml', '100 ml bottle: ৳ 85.00'],
      ['Zzprice', 'Tablet', '20 mg', 'Unit Price: ৳ 7.00 (3 x 10: ৳ 210.00)'],
      ['Zzprice', 'Tablet', '40 mg', 'Unit Price: ৳ 11.00 (2 x 10: ৳ 220.00)'],
      ['Zzprice', null, null, null],
      ['zzprice Extra', 'Capsule (Enteric Coated)', '40 mg', "Unit Price: ৳ 12.50 (100's pack: ৳ 1,250.00)"],
    ]);
  });

  it('a word is asked in any case, and each once', async () => {
    const res = await ask(a, ['ZZPRICE', ' zzprice ', 'zzprice']);
    expect(res.status).toBe(200);
    expect((res.body.rows as Row[]).filter((r) => r.brandName === 'Zzprice')).toHaveLength(4);
  });

  it('a word the chart does not hold, or none at all, gives no rows', async () => {
    expect((await ask(a, ['zznosuchbrand'])).body).toEqual({ rows: [] });
    expect((await ask(a, [])).body).toEqual({ rows: [] });
  });

  // The chart is the same for everyone: no practice data, so no workstation.
  it("an assistant's own session may ask it too", async () => {
    const res = await ask(as, ['zzprice']);
    expect(res.status).toBe(200);
    expect((res.body.rows as Row[]).length).toBeGreaterThan(0);
  });

  it('⚕️ no session, no answer', async () => {
    expect((await ask(t.agent(), ['zzprice'])).status).toBe(401);
  });

  it('refuses what is not a list of short words', async () => {
    expect((await ask(a, 'zzprice')).status).toBe(400);
    expect((await ask(a, [7])).status).toBe(400);
    expect((await ask(a, ['x'.repeat(101)])).status).toBe(400);
    expect((await ask(a, Array.from({ length: 101 }, (_, i) => `w${i}`))).status).toBe(400);
  });
});
