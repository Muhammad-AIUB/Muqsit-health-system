import type { Patient, User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor, makePatient, makeSupervisor } from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ "+ Add medicine" after Save & print (19/10/2026). The lines are APPENDED
// by the server to whatever the record holds — the first version sent the
// editor's whole list, and one device's copy, behind the record, erased the
// medicines another device had just printed (independent review, before
// release). Real HTTP, real database; every name here is made up.

type Agent = Awaited<ReturnType<typeof loginAs>>;

describe('POST /patients/:id/drug-history', () => {
  let t: TestApp;
  let owner: User, supervisor: User, other: User, assistantRx: User, assistantNone: User;
  let o: Agent, s: Agent, x: Agent, aRx: Agent, aNone: Agent;
  const PRINTED = '19/10/2026: Tablet. Bexa 1 mg — 1+0+0 —  — 7 days';
  const SECLO = '01/01/2000: Tablet. Secla 20 mg —  —  — ';

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
  const append = (agent: Agent, p: Patient, entries: unknown, ws?: string) => {
    const req = agent.post(`/api/patients/${p.id}/drug-history`);
    return (ws ? req.set(WS, ws) : req).send({ entries });
  };
  const stored = async (p: Patient) =>
    (await t.prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).drugHistory;

  it('appends the lines to what the record holds, and answers with the list as stored', async () => {
    const p = await withHistory([PRINTED]);
    const res = await append(o, p, [SECLO, '01/01/2000(cont): 0+0+1 —  — ']);
    expect(res.status).toBe(201);
    expect(res.body.drugHistory).toEqual([PRINTED, SECLO, '01/01/2000(cont): 0+0+1 —  — ']);
    expect(await stored(p)).toEqual(res.body.drugHistory);
  });

  it('keeps a line written to the record after the client last read it — the case a whole list erased', async () => {
    const p = await withHistory([]);
    // Another device prints: its write lands first.
    expect((await o.patch(`/api/patients/${p.id}`).send({ drugHistory: [PRINTED] })).status).toBe(200);
    expect((await append(o, p, [SECLO])).status).toBe(201);
    expect(await stored(p)).toEqual([PRINTED, SECLO]);
  });

  it('appends sent together are all kept, each whole', async () => {
    const p = await withHistory([PRINTED]);
    const lines = ['A', 'B', 'C', 'D', 'E'].map((n) => `01/01/2000: Tablet. ${n} 1 mg —  —  — `);
    const results = await Promise.all(lines.map((l) => append(o, p, [l, `${l}(cont)`])));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const list = (await stored(p)) as string[];
    expect(list).toHaveLength(11);
    for (const l of lines) expect(list[list.indexOf(l) + 1]).toBe(`${l}(cont)`); // never split apart
  });

  it("a supervising doctor is refused — the owner's record is the owner's", async () => {
    const p = await withHistory([PRINTED]);
    await makeSupervisor(t.prisma, p.id, supervisor.id);
    expect((await append(s, p, [SECLO])).status).toBe(403);
    expect(await stored(p)).toEqual([PRINTED]);
  });

  it('a doctor who cannot reach the patient is 404, and nothing is written', async () => {
    const p = await withHistory([PRINTED]);
    expect((await append(x, p, [SECLO])).status).toBe(404);
    expect(await stored(p)).toEqual([PRINTED]);
  });

  it("the owner's assistant appends with a prescription key, and is refused without one", async () => {
    const p = await withHistory([PRINTED]);
    expect((await append(aRx, p, [SECLO], owner.id)).status).toBe(201);
    expect((await append(aNone, p, ['01/01/2000: Tablet. Nobody 1 mg —  —  — '], owner.id)).status).toBe(403);
    expect(await stored(p)).toEqual([PRINTED, SECLO]);
  });

  it('a stored value that is not a list is refused, never replaced', async () => {
    const p = await withHistory({ odd: true });
    expect((await append(o, p, [SECLO])).status).toBe(409);
    expect(await stored(p)).toEqual({ odd: true });
  });

  it.each([
    ['no lines', []],
    ['not a list', 'one line'],
    ['a line that is not text', [42]],
    ['a line over 2000 characters', ['x'.repeat(2001)]],
  ])('a body with %s is refused, and nothing is written', async (_why, entries) => {
    const p = await withHistory([PRINTED]);
    expect((await append(o, p, entries)).status).toBe(400);
    expect(await stored(p)).toEqual([PRINTED]);
  });
});
