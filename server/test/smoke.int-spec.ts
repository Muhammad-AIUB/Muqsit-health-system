import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor } from './support/fixtures';
import { assertTestDbUrl, resetDb } from './support/test-db';

describe('test harness', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('refuses any database that is not the throwaway one', () => {
    // What the dev .env looks like: production behind the SSH tunnel.
    expect(() => assertTestDbUrl('postgresql://u:p@localhost:5432/exhort')).toThrow(/REFUSING/);
    // Right port, wrong name.
    expect(() => assertTestDbUrl('postgresql://u:p@127.0.0.1:5544/exhort')).toThrow(/REFUSING/);
    // Right name, wrong port.
    expect(() => assertTestDbUrl('postgresql://u:p@127.0.0.1:5432/muqsit_int_test')).toThrow(/REFUSING/);
    expect(() => assertTestDbUrl(undefined)).toThrow(/REFUSING/);
    expect(() => assertTestDbUrl('postgresql://test:test@127.0.0.1:5544/muqsit_int_test')).not.toThrow();
  });

  it('signs a doctor in through the real pipeline and reads /auth/me', async () => {
    const doctor = await makeDoctor(t.prisma);
    const browser = await loginAs(t, doctor);
    const me = await browser.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(doctor.id);
  });

  it('answers 401 without a session', async () => {
    const res = await t.agent().get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
