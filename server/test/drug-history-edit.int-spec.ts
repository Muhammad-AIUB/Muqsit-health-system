import type { Patient, User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor, makePatient, makeSupervisor } from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ A stored medicine's start date and duration put right (physician's sheet,
// 07/11/2026). The one place a stored drug-history line is rewritten, so every
// case here is a way it could go wrong: the block is found by its TEXT under the
// row's lock (not at a position a client read), only the date and the durations
// change, a line another device changed is never overwritten, and who may write
// is the owner's practice alone, as for the append. Real HTTP, real database;
// every name here is made up.

type Agent = Awaited<ReturnType<typeof loginAs>>;

describe('PATCH /patients/:id/drug-history', () => {
  let t: TestApp;
  let owner: User, supervisor: User, other: User, assistantRx: User, assistantNone: User;
  let o: Agent, s: Agent, x: Agent, aRx: Agent, aNone: Agent;
  const BEXA = '06/11/2026: Tablet. Bexa 1 mg — 1+0+1 —  — 7 days';
  const PRED = '06/11/2026: Tablet. Prednex 10 mg — 2+2+0 — After meal — 5 days';
  const PRED_C1 = '06/11/2026(cont): 2+1+0 — After meal — 5 days';
  const PRED_C2 = '06/11/2026(cont): 1+1+0 — After meal — 5';
  const NOTE = '05/11/2026(note): Insulin as before';
  const SECLO = '01/01/2000: Tablet. Secla 20 mg —  —  — ';
  const BEXA_LATER = '08/11/2026: Tablet. Bexa 1 mg — 1+0+1 —  — 5 days';

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    owner = await makeDoctor(t.prisma);
    supervisor = await makeDoctor(t.prisma);
    other = await makeDoctor(t.prisma);
    assistantRx = await makeDoctor(t.prisma);
    assistantNone = await makeDoctor(t.prisma);
    await makeAssistantLink(t.prisma, owner.id, assistantRx.id, ['rx.drugHistory']);
    await makeAssistantLink(t.prisma, owner.id, assistantNone.id, []);
    [o, s, x, aRx, aNone] = await Promise.all([owner, supervisor, other, assistantRx, assistantNone].map((u) => loginAs(t, u)));
  });
  afterAll(async () => {
    await t.close();
  });

  const withHistory = (drugHistory: unknown) =>
    makePatient(t.prisma, owner.id, { drugHistory } as unknown as Partial<Patient>);
  const edit = (agent: Agent, p: Patient, replace: unknown, replacement: unknown, ws?: string) => {
    const req = agent.patch(`/api/patients/${p.id}/drug-history`);
    return (ws ? req.set(WS, ws) : req).send({ replace, replacement });
  };
  const append = (agent: Agent, p: Patient, entries: string[]) =>
    agent.post(`/api/patients/${p.id}/drug-history`).send({ entries });
  const stored = async (p: Patient) =>
    (await t.prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).drugHistory;

  it('replaces the block in place, leaves every other line where it was, and answers with the list as stored', async () => {
    const p = await withHistory([NOTE, BEXA, SECLO]);
    const res = await edit(o, p, [BEXA], [BEXA_LATER]);
    expect(res.status).toBe(200);
    expect(res.body.drugHistory).toEqual([NOTE, BEXA_LATER, SECLO]);
    expect(await stored(p)).toEqual(res.body.drugHistory);
  });

  it('replaces a medicine with its tapering lines as one block, the taper dates moving with it', async () => {
    const p = await withHistory([BEXA, PRED, PRED_C1, PRED_C2, SECLO]);
    const res = await edit(o, p, [PRED, PRED_C1, PRED_C2], [
      '09/11/2026: Tablet. Prednex 10 mg — 2+2+0 — After meal — 5 days',
      '09/11/2026(cont): 2+1+0 — After meal — 5 days',
      '09/11/2026(cont): 1+1+0 — After meal — 5 days',
    ]);
    expect(res.status).toBe(200);
    expect(await stored(p)).toEqual([
      BEXA,
      '09/11/2026: Tablet. Prednex 10 mg — 2+2+0 — After meal — 5 days',
      '09/11/2026(cont): 2+1+0 — After meal — 5 days',
      '09/11/2026(cont): 1+1+0 — After meal — 5 days',
      SECLO,
    ]);
  });

  it('finds the block by its text even after another device appended: the position a client read is not used', async () => {
    const p = await withHistory([SECLO, BEXA]);
    expect((await append(o, p, ['07/11/2026: Tablet. Newer 5 mg — 1+0+0 —  — 3 days'])).status).toBe(201);
    expect((await edit(o, p, [BEXA], [BEXA_LATER])).status).toBe(200);
    expect(await stored(p)).toEqual([SECLO, BEXA_LATER, '07/11/2026: Tablet. Newer 5 mg — 1+0+0 —  — 3 days']);
  });

  it('409 and nothing written when the block is no longer there — another device changed it first', async () => {
    const p = await withHistory([BEXA]);
    expect((await edit(o, p, [BEXA], [BEXA_LATER])).status).toBe(200);
    const stale = await edit(o, p, [BEXA], ['09/11/2026: Tablet. Bexa 1 mg — 1+0+1 —  — 3 days']);
    expect(stale.status).toBe(409);
    expect(await stored(p)).toEqual([BEXA_LATER]);
  });

  it('409 when only part of the block stands there (the taper was taken off elsewhere)', async () => {
    const p = await withHistory([PRED]);
    const res = await edit(o, p, [PRED, PRED_C1], [
      '09/11/2026: Tablet. Prednex 10 mg — 2+2+0 — After meal — 5 days',
      '09/11/2026(cont): 2+1+0 — After meal — 5 days',
    ]);
    expect(res.status).toBe(409);
    expect(await stored(p)).toEqual([PRED]);
  });

  it('of two identical blocks it changes the first, and the other is untouched', async () => {
    const p = await withHistory([BEXA, SECLO, BEXA]);
    expect((await edit(o, p, [BEXA], [BEXA_LATER])).status).toBe(200);
    expect(await stored(p)).toEqual([BEXA_LATER, SECLO, BEXA]);
  });

  it.each([
    ['a changed dose', '06/11/2026: Tablet. Bexa 1 mg — 2+0+1 —  — 7 days'],
    ['a changed name', '06/11/2026: Tablet. Bexa 2 mg — 1+0+1 —  — 7 days'],
    ['a date not on the calendar', '31/02/2026: Tablet. Bexa 1 mg — 1+0+1 —  — 7 days'],
    ['a medicine turned into a note', '06/11/2026(note): Tablet. Bexa 1 mg — 1+0+1 —  — 7 days'],
  ])('400 and nothing written for %s', async (_why, replacement) => {
    const p = await withHistory([BEXA]);
    expect((await edit(o, p, [BEXA], [replacement])).status).toBe(400);
    expect(await stored(p)).toEqual([BEXA]);
  });

  it('400 for a block that gains or loses a line, and for a note', async () => {
    const p = await withHistory([BEXA, NOTE]);
    expect((await edit(o, p, [BEXA], [BEXA, SECLO])).status).toBe(400);
    expect((await edit(o, p, [NOTE], [NOTE.replace('05/11', '06/11')])).status).toBe(400);
    expect(await stored(p)).toEqual([BEXA, NOTE]);
  });

  it('400 for a body that is not two lists of text', async () => {
    const p = await withHistory([BEXA]);
    expect((await edit(o, p, 'x', 'y')).status).toBe(400);
    expect((await edit(o, p, [], [])).status).toBe(400);
    expect((await edit(o, p, [1], [2])).status).toBe(400);
    expect(await stored(p)).toEqual([BEXA]);
  });

  it('an edit and an append sent together are both kept', async () => {
    const p = await withHistory([BEXA]);
    const lines = ['A', 'B', 'C'].map((n) => `07/11/2026: Tablet. ${n} 1 mg —  —  — `);
    const results = await Promise.all([
      edit(o, p, [BEXA], [BEXA_LATER]),
      ...lines.map((l) => append(o, p, [l])),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 201, 201, 201]);
    const list = (await stored(p)) as string[];
    expect(list).toHaveLength(4);
    expect(list).toContain(BEXA_LATER);
    expect(list).not.toContain(BEXA);
    for (const l of lines) expect(list).toContain(l);
  });

  it('409 when the stored drug history is not a list, and it is not replaced', async () => {
    const p = await withHistory({ not: 'a list' });
    expect((await edit(o, p, [BEXA], [BEXA_LATER])).status).toBe(409);
    expect(await stored(p)).toEqual({ not: 'a list' });
  });

  it("a supervising doctor is refused — the owner's record is the owner's", async () => {
    const p = await withHistory([BEXA]);
    await makeSupervisor(t.prisma, p.id, supervisor.id);
    expect((await edit(s, p, [BEXA], [BEXA_LATER])).status).toBe(403);
    expect(await stored(p)).toEqual([BEXA]);
  });

  it('a doctor who cannot reach the patient is 404, and nothing is written', async () => {
    const p = await withHistory([BEXA]);
    expect((await edit(x, p, [BEXA], [BEXA_LATER])).status).toBe(404);
    expect(await stored(p)).toEqual([BEXA]);
  });

  it("the owner's assistant edits with a prescription key, and is refused without one", async () => {
    const p = await withHistory([BEXA]);
    expect((await edit(aNone, p, [BEXA], [BEXA_LATER], owner.id)).status).toBe(403);
    expect(await stored(p)).toEqual([BEXA]);
    expect((await edit(aRx, p, [BEXA], [BEXA_LATER], owner.id)).status).toBe(200);
    expect(await stored(p)).toEqual([BEXA_LATER]);
  });
});
