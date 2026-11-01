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
