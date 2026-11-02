import type { Patient, User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor, makePatient, makeSupervisor } from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ The shared On-examination history (physician's sheets 28/10 item 7 and
// 31/10 item 3): findings of a saved visit are APPENDED by the server, with the
// author stamped from the practice the request acts for, and every doctor of
// the patient — the owner's practice and a supervising one — sees and adds to
// the same list. Real HTTP, real database; every name here is made up.

type Agent = Awaited<ReturnType<typeof loginAs>>;

describe('POST /patients/:id/on-examination', () => {
  let t: TestApp;
  let owner: User, supervisor: User, other: User, assistantRx: User, assistantNone: User;
  let o: Agent, s: Agent, x: Agent, aRx: Agent, aNone: Agent;
  const OLD = { date: '20/10/2026', text: 'BP: 120/80 mmHg' }; // from before `by` existed

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    owner = await makeDoctor(t.prisma, { name: 'Owner Name', displayName: 'Dr. Owner' });
    supervisor = await makeDoctor(t.prisma, { name: 'Super Visor' });
    other = await makeDoctor(t.prisma);
    assistantRx = await makeDoctor(t.prisma, { name: 'Assistant With Key' });
    assistantNone = await makeDoctor(t.prisma);
    await makeAssistantLink(t.prisma, owner.id, assistantRx.id, ['rx.onExamination']);
    await makeAssistantLink(t.prisma, owner.id, assistantNone.id, []);
    [o, s, x, aRx, aNone] = await Promise.all([owner, supervisor, other, assistantRx, assistantNone].map((u) => loginAs(t, u)));
  });
  afterAll(async () => {
    await t.close();
  });

  const withOe = (onExaminationSummary: unknown) =>
    makePatient(t.prisma, owner.id, { onExaminationSummary } as unknown as Partial<Patient>);
  const append = (agent: Agent, p: Patient, entries: unknown, ws?: string) => {
    const req = agent.post(`/api/patients/${p.id}/on-examination`);
    return (ws ? req.set(WS, ws) : req).send({ entries });
  };
  const stored = async (p: Patient) =>
    (await t.prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).onExaminationSummary;

  it('appends with the practice doctor as author; an old entry keeps no author', async () => {
    const p = await withOe([OLD]);
    const res = await append(o, p, [{ date: '28/10/2026', text: 'Pulse: 78 b/min' }]);
    expect(res.status).toBe(201);
    expect(res.body.onExaminationSummary).toEqual([OLD, { date: '28/10/2026', text: 'Pulse: 78 b/min', by: 'Dr. Owner' }]);
    expect(await stored(p)).toEqual(res.body.onExaminationSummary);
  });

  it('an author a client sends is not taken', async () => {
    const p = await withOe([]);
    const res = await append(o, p, [{ date: '28/10/2026', text: 'x', by: 'Dr. Forged' }]);
    // whitelist drops the field; the server's own name is written
    expect(res.status).toBe(201);
    expect(await stored(p)).toEqual([{ date: '28/10/2026', text: 'x', by: 'Dr. Owner' }]);
  });

  it('a supervising doctor appends under their own name — the history is the patient\'s', async () => {
    const p = await withOe([OLD]);
    await makeSupervisor(t.prisma, p.id, supervisor.id);
    const res = await append(s, p, [{ date: '29/10/2026', text: 'Pallor: present' }]);
    expect(res.status).toBe(201);
    expect(await stored(p)).toEqual([OLD, { date: '29/10/2026', text: 'Pallor: present', by: 'Super Visor' }]);
    // and the owner reads it on the patient row
    const read = await o.get(`/api/patients/${p.id}`);
    expect(read.body.onExaminationSummary).toEqual(await stored(p));
  });

  it('the same finding on the same date is not written twice', async () => {
    const p = await withOe([OLD]);
    expect((await append(o, p, [{ date: OLD.date, text: ' bp: 120/80 MMHG' }])).status).toBe(201);
    expect(await stored(p)).toEqual([OLD]);
  });

  it('appends sent together are all kept', async () => {
    const p = await withOe([]);
    const texts = ['A', 'B', 'C', 'D', 'E'];
    const res = await Promise.all(texts.map((tx) => append(o, p, [{ date: '28/10/2026', text: tx }])));
    expect(res.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(((await stored(p)) as Array<{ text: string }>).map((e) => e.text).sort()).toEqual(texts);
  });

  it("an assistant writes as the practice's doctor with a prescription key, and is refused without one", async () => {
    const p = await withOe([]);
    expect((await append(aRx, p, [{ date: '28/10/2026', text: 'x' }], owner.id)).status).toBe(201);
    expect((await append(aNone, p, [{ date: '28/10/2026', text: 'y' }], owner.id)).status).toBe(403);
    expect(await stored(p)).toEqual([{ date: '28/10/2026', text: 'x', by: 'Dr. Owner' }]);
  });

  it('a doctor who cannot reach the patient is 404, and nothing is written', async () => {
    const p = await withOe([OLD]);
    expect((await append(x, p, [{ date: '28/10/2026', text: 'x' }])).status).toBe(404);
    expect(await stored(p)).toEqual([OLD]);
  });

  it('a stored value that is not a list is refused, never replaced', async () => {
    const p = await withOe({ odd: true });
    expect((await append(o, p, [{ date: '28/10/2026', text: 'x' }])).status).toBe(409);
    expect(await stored(p)).toEqual({ odd: true });
  });

  it.each([
    ['no entries', []],
    ['not a list', 'BP'],
    ['a date not dd/mm/yyyy', [{ date: '2026-10-28', text: 'x' }]],
    ['no text', [{ date: '28/10/2026', text: '' }]],
    ['text over 2000 characters', [{ date: '28/10/2026', text: 'x'.repeat(2001) }]],
  ])('a body with %s is refused, and nothing is written', async (_why, entries) => {
    const p = await withOe([OLD]);
    expect((await append(o, p, entries)).status).toBe(400);
    expect(await stored(p)).toEqual([OLD]);
  });
});

// ⚕️ The sidebar's Disease / Surgical history (sheet 28/10/2026, item 7):
// entries of the same shared list, taken off SOFTLY and put back by Undo.
describe('POST /patients/:id/on-examination/remove and /restore', () => {
  let t: TestApp;
  let owner: User, supervisor: User, other: User, assistantRx: User, assistantNone: User;
  let o: Agent, s: Agent, x: Agent, aRx: Agent, aNone: Agent;
  const DM = { date: '20/10/2026', text: 'Disease Hx: DM 01/01/2010' }; // from the old popup, no author
  const BP = { date: '20/10/2026', text: 'BP: 120/80 mmHg' };
  const CHOLE = { date: '28/10/2026', text: 'Surgical Hx: H/O cholecystectomy 15/10/2026', by: 'Dr. Owner' };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    owner = await makeDoctor(t.prisma, { name: 'Owner Name', displayName: 'Dr. Owner' });
    supervisor = await makeDoctor(t.prisma, { name: 'Super Visor' });
    other = await makeDoctor(t.prisma);
    assistantRx = await makeDoctor(t.prisma);
    assistantNone = await makeDoctor(t.prisma);
    await makeAssistantLink(t.prisma, owner.id, assistantRx.id, ['rx.history']);
    await makeAssistantLink(t.prisma, owner.id, assistantNone.id, []);
    [o, s, x, aRx, aNone] = await Promise.all([owner, supervisor, other, assistantRx, assistantNone].map((u) => loginAs(t, u)));
  });
  afterAll(async () => {
    await t.close();
  });

  const withOe = (onExaminationSummary: unknown) =>
    makePatient(t.prisma, owner.id, { onExaminationSummary } as unknown as Partial<Patient>);
  const call = (agent: Agent, p: Patient, what: 'remove' | 'restore', body: unknown, ws?: string) => {
    const req = agent.post(`/api/patients/${p.id}/on-examination/${what}`);
    return (ws ? req.set(WS, ws) : req).send(body as object);
  };
  const stored = async (p: Patient) =>
    (await t.prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).onExaminationSummary as Array<Record<string, unknown>>;

  it('removes softly — the entry stays, stamped with the remover — and restore puts it back exactly', async () => {
    const p = await withOe([DM, BP, CHOLE]);
    const res = await call(o, p, 'remove', { kind: 'disease', text: ' dm 01/01/2010' });
    expect(res.status).toBe(200);
    const after = await stored(p);
    expect(after).toHaveLength(3);
    expect(after[0]).toEqual({ ...DM, removedAt: expect.any(String), removedBy: 'Dr. Owner' });
    expect(after.slice(1)).toEqual([BP, CHOLE]);
    expect(res.body.onExaminationSummary).toEqual(after);
    const back = await call(o, p, 'restore', { kind: 'disease', text: 'DM 01/01/2010' });
    expect(back.status).toBe(200);
    expect(await stored(p)).toEqual([DM, BP, CHOLE]);
  });

  it('a supervising doctor reads the owner\'s entries, and may take one off and put it back', async () => {
    const p = await withOe([DM, CHOLE]);
    await makeSupervisor(t.prisma, p.id, supervisor.id);
    const read = await s.get(`/api/patients/${p.id}`);
    expect(read.status).toBe(200);
    expect(read.body.onExaminationSummary).toEqual([DM, CHOLE]);
    expect((await call(s, p, 'remove', { kind: 'surgical', text: 'H/O cholecystectomy 15/10/2026' })).status).toBe(200);
    expect((await stored(p))[1]).toMatchObject({ removedBy: 'Super Visor' });
    expect((await call(s, p, 'restore', { kind: 'surgical', text: 'H/O cholecystectomy 15/10/2026' })).status).toBe(200);
    expect(await stored(p)).toEqual([DM, CHOLE]);
  });

  it('nothing to remove (or to restore) is a 409, and nothing is written', async () => {
    const p = await withOe([DM, BP]);
    expect((await call(o, p, 'remove', { kind: 'surgical', text: 'DM 01/01/2010' })).status).toBe(409);
    expect((await call(o, p, 'remove', { kind: 'disease', text: '120/80 mmHg' })).status).toBe(409);
    expect((await call(o, p, 'restore', { kind: 'disease', text: 'DM 01/01/2010' })).status).toBe(409);
    expect(await stored(p)).toEqual([DM, BP]);
  });

  it('after a removal the same words can be added again — a new entry, not skipped', async () => {
    const p = await withOe([DM]);
    await call(o, p, 'remove', { kind: 'disease', text: 'DM 01/01/2010' });
    const res = await o.post(`/api/patients/${p.id}/on-examination`).send({ entries: [{ date: DM.date, text: DM.text }] });
    expect(res.status).toBe(201);
    const after = await stored(p);
    expect(after).toHaveLength(2);
    expect(after[1]).toEqual({ ...DM, by: 'Dr. Owner' });
  });

  it("an assistant needs a prescription key; a doctor who cannot reach the patient is 404", async () => {
    const p = await withOe([DM]);
    expect((await call(aNone, p, 'remove', { kind: 'disease', text: 'DM 01/01/2010' }, owner.id)).status).toBe(403);
    expect((await call(x, p, 'remove', { kind: 'disease', text: 'DM 01/01/2010' })).status).toBe(404);
    expect(await stored(p)).toEqual([DM]);
    expect((await call(aRx, p, 'remove', { kind: 'disease', text: 'DM 01/01/2010' }, owner.id)).status).toBe(200);
  });

  it.each([
    ['an unknown kind', { kind: 'family', text: 'x' }],
    ['no text', { kind: 'disease', text: '' }],
    ['no kind', { text: 'DM 01/01/2010' }],
  ])('a body with %s is refused, and nothing is written', async (_why, body) => {
    const p = await withOe([DM]);
    expect((await call(o, p, 'remove', body)).status).toBe(400);
    expect(await stored(p)).toEqual([DM]);
  });
});
