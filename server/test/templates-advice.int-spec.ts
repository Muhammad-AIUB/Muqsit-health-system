import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor } from './support/fixtures';
import { resetDb } from './support/test-db';

// Advice and Advised tests saved with a prescription template (24/11/2026).
// The DTO must declare both fields, or ValidationPipe({ whitelist: true })
// would "save" them and silently drop them.

const ITEMS = [{ drug: 'Tablet. Napa 500 mg', dose: '1+1+1', duration: '5 days', instruction: '' }];

describe('prescription templates carry Advice and Advised tests (integration)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('keeps advice and adviceTest on create, list and patch — exactly as typed', async () => {
    const doctor = await makeDoctor(t.prisma);
    const browser = await loginAs(t, doctor);
    const advice = ['Drink plenty of water', 'ঠাণ্ডা লাগাবেন না'];
    const adviceTest = ['CBC', 'S. Creatinine'];

    const created = await browser.post('/api/prescription-templates').send({ category: 'opd', name: 'A', items: ITEMS, advice, adviceTest });
    expect(created.status).toBe(201);
    expect(created.body.advice).toEqual(advice);
    expect(created.body.adviceTest).toEqual(adviceTest);

    const list = await browser.get('/api/prescription-templates').query({ category: 'opd' });
    expect(list.body[0].advice).toEqual(advice);
    expect(list.body[0].adviceTest).toEqual(adviceTest);

    const patched = await browser.patch(`/api/prescription-templates/${created.body.id}`).send({ advice: ['Rest'], adviceTest: [] });
    expect(patched.status).toBe(200);
    expect(patched.body.advice).toEqual(['Rest']);
    expect(patched.body.adviceTest).toEqual([]);
    // A PATCH that names neither leaves them as they were.
    const renamed = await browser.patch(`/api/prescription-templates/${created.body.id}`).send({ name: 'B' });
    expect(renamed.body.advice).toEqual(['Rest']);
  });

  it('a template saved without them (an older client) reads as having none', async () => {
    const doctor = await makeDoctor(t.prisma);
    const browser = await loginAs(t, doctor);
    const created = await browser.post('/api/prescription-templates').send({ category: 'opd', name: 'Old', items: ITEMS });
    expect(created.status).toBe(201);
    expect(created.body.advice).toEqual([]);
    expect(created.body.adviceTest).toEqual([]);
  });

  it('refuses a line that is not text', async () => {
    const doctor = await makeDoctor(t.prisma);
    const browser = await loginAs(t, doctor);
    const r = await browser.post('/api/prescription-templates').send({ category: 'opd', name: 'X', items: ITEMS, advice: [{ a: 1 }] });
    expect(r.status).toBe(400);
  });
});
