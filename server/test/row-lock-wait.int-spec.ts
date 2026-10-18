import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor, makePatient } from './support/fixtures';
import { resetDb } from './support/test-db';

// ⚕️ A write that takes a ROW LOCK waits its turn behind the others — that is
// the whole point of the lock (no appended family member, no photographed page
// is ever lost to an overlapping write). Prisma's interactive transaction ends
// at 5 s by default and counts that WAIT: on a busy server the writes at the
// back of a queue answered 500 ("Transaction already closed") and did nothing
// (found from a test that failed now and then under load, 18/10/2026). The lock
// is held here on purpose for longer than 5 s. The IPD routes have the same
// case in ipd-analogue.int-spec.ts.

describe('a write waiting behind a row lock', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('linking a family member that waits more than 5 s for the lock still lands', async () => {
    const doctor = await makeDoctor(t.prisma);
    const browser = await loginAs(t, doctor);
    const existing = await makePatient(t.prisma, doctor.id, { sex: 'Male' });

    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const holder = t.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Patient" WHERE "id" = ${existing.id} FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 30_000 },
    );
    await isLocked;
    // `.then` sends the request now; it queues behind the held lock.
    const link = browser
      .post('/api/patients/link')
      .send({ existingId: existing.id, name: 'Made-up Son', relation: 'Son' })
      .then((r) => r);
    await new Promise((r) => setTimeout(r, 6_000));
    release();
    await holder;

    const res = await link;
    expect(res.status).toBe(201);
    const after = await t.prisma.patient.findUniqueOrThrow({ where: { id: existing.id } });
    const tree = (after.familyMembers ?? []) as Array<{ name: string }>;
    expect(tree.map((m) => m.name)).toContain('Made-up Son');
  });
});
