import type { Patient, User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor, makePatient, makeSupervisor } from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ A supervising doctor's unprinted prescription is kept like the owner's
// (19/10/2026). The owner's practice parks its visit in the patient's own
// `incompleteRx`; a supervising practice may never write that (it is the
// owner's), so its visit was kept nowhere — a reload or another patient opened
// lost it. It is kept now in a place of the supervising practice's own, and a
// read of the patient gives each practice its OWN parked visit as
// `incompleteRx`. Real HTTP, real database; every name here is made up.

type Agent = Awaited<ReturnType<typeof loginAs>>;

describe("a supervising practice's parked visit", () => {
  let t: TestApp;
  let owner: User, supervisor: User, other: User, assistantRx: User, assistantNone: User;
  let o: Agent, s: Agent, x: Agent, aRx: Agent, aNone: Agent;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    owner = await makeDoctor(t.prisma);
    supervisor = await makeDoctor(t.prisma);
    other = await makeDoctor(t.prisma);
    assistantRx = await makeDoctor(t.prisma);
    assistantNone = await makeDoctor(t.prisma);
    await makeAssistantLink(t.prisma, supervisor.id, assistantRx.id, ['rx.medicines']);
    await makeAssistantLink(t.prisma, supervisor.id, assistantNone.id, []);
    [o, s, x, aRx, aNone] = await Promise.all([owner, supervisor, other, assistantRx, assistantNone].map((u) => loginAs(t, u)));
  });
  afterAll(async () => {
    await t.close();
  });

  const supervised = async (): Promise<Patient> => {
    const p = await makePatient(t.prisma, owner.id, { incompleteRx: { owner: 'visit' } } as Partial<Patient>);
    await makeSupervisor(t.prisma, p.id, supervisor.id);
    return p;
  };
  const park = (agent: Agent, p: Patient, data: unknown, ws?: string) => {
    const req = agent.put(`/api/patients/${p.id}/supervised-draft`);
    return (ws ? req.set(WS, ws) : req).send({ data });
  };

  it("each practice reads ITS OWN parked visit as incompleteRx — never the other's", async () => {
    const p = await supervised();
    expect((await park(s, p, { supervisor: 'visit' })).status).toBe(200);

    expect((await s.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ supervisor: 'visit' });
    expect((await o.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ owner: 'visit' });

    const bySup = await s.get(`/api/patients/by-mobile?mobile=${p.mobile}`);
    expect(bySup.body.find((r: Patient) => r.id === p.id).incompleteRx).toEqual({ supervisor: 'visit' });
    const byOwner = await o.get(`/api/patients/by-mobile?mobile=${p.mobile}`);
    expect(byOwner.body.find((r: Patient) => r.id === p.id).incompleteRx).toEqual({ owner: 'visit' });
  });

  it("a supervisor with nothing parked reads null — never the owner's visit", async () => {
    const p = await supervised();
    expect((await s.get(`/api/patients/${p.id}`)).body.incompleteRx).toBeNull();
  });

  it('a later park replaces the earlier one, and null takes it away', async () => {
    const p = await supervised();
    await park(s, p, { v: 1 });
    await park(s, p, { v: 2 });
    expect((await s.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ v: 2 });
    expect((await park(s, p, null)).status).toBe(200);
    expect((await s.get(`/api/patients/${p.id}`)).body.incompleteRx).toBeNull();
    expect(await t.prisma.supervisedDraft.count({ where: { patientId: p.id } })).toBe(0);
  });

  it("the owner's practice parks in the patient's own incompleteRx — this route refuses it", async () => {
    const p = await supervised();
    const res = await park(o, p, { owner: 'other' });
    expect(res.status).toBe(400);
    expect((await o.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ owner: 'visit' });
  });

  it('a doctor who cannot reach the patient is 404, and nothing is stored', async () => {
    const p = await supervised();
    expect((await park(x, p, { stranger: true })).status).toBe(404);
    expect(await t.prisma.supervisedDraft.count({ where: { patientId: p.id } })).toBe(0);
  });

  it("the supervising practice's assistant shares it with a prescription key, and is refused without one", async () => {
    const p = await supervised();
    expect((await park(aRx, p, { by: 'assistant' }, supervisor.id)).status).toBe(200);
    expect((await s.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ by: 'assistant' });
    expect((await park(aNone, p, { by: 'nobody' }, supervisor.id)).status).toBe(403);
    expect((await s.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ by: 'assistant' });
  });

  it("a supervisor still cannot write the owner's incompleteRx through the patient record", async () => {
    const p = await supervised();
    expect((await s.patch(`/api/patients/${p.id}`).send({ incompleteRx: { overwrite: true } })).status).toBe(403);
    expect((await o.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ owner: 'visit' });
  });

  // Review, 19/10/2026: taking `doctorId` out of the read left every test green.
  it('two supervising practices on one patient: each reads and writes only its own', async () => {
    const p = await supervised();
    const second = await makeDoctor(t.prisma);
    await makeSupervisor(t.prisma, p.id, second.id);
    const s2 = await loginAs(t, second);
    await park(s, p, { practice: 'first' });
    await park(s2, p, { practice: 'second' });
    expect((await s.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ practice: 'first' });
    expect((await s2.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ practice: 'second' });
    const bySecond = await s2.get(`/api/patients/by-mobile?mobile=${p.mobile}`);
    expect(bySecond.body.find((r: Patient) => r.id === p.id).incompleteRx).toEqual({ practice: 'second' });
    await park(s2, p, null);
    expect((await s.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ practice: 'first' });
  });

  it("removing a supervising doctor takes their parked visit with the link — a later re-assignment opens none", async () => {
    const p = await supervised();
    await park(s, p, { stale: true });
    const removed = await o.delete(`/api/patients/${p.id}/supervisors/${supervisor.id}`);
    expect(removed.status).toBe(200);
    expect(await t.prisma.supervisedDraft.count({ where: { patientId: p.id, doctorId: supervisor.id } })).toBe(0);
    await makeSupervisor(t.prisma, p.id, supervisor.id);
    expect((await s.get(`/api/patients/${p.id}`)).body.incompleteRx).toBeNull();
  });

  it('a body that is not an object (or null) is refused', async () => {
    const p = await supervised();
    expect((await park(s, p, 'text')).status).toBe(400);
    expect((await s.put(`/api/patients/${p.id}/supervised-draft`).send({})).status).toBe(400);
  });
});
