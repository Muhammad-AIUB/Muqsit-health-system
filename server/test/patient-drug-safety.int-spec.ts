import type { Patient, User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import {
  loginAs,
  makeAssistantLink,
  makeDoctor,
  makePatient,
  makeSupervisor,
} from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ "H/O drug hypersensitivity and High-Alert Medication" (physician's sheet,
// 31/10/2026): a per-patient list kept for life. Real HTTP, real database;
// every name here is made up. Needs the table from schema.prisma
// (`npm run test:db` again after pulling this).

type Agent = Awaited<ReturnType<typeof loginAs>>;

describe('/patients/:id/drug-safety', () => {
  let t: TestApp;
  let owner: User,
    supervisor: User,
    other: User,
    assistantDh: User,
    assistantNone: User;
  let o: Agent, s: Agent, x: Agent, aDh: Agent, aNone: Agent;
  const NAPA = {
    kind: 'drug',
    brand: 'Napa',
    generic: 'Paracetamol',
    hypersensitive: true,
    highAlert: false,
  };
  const SULPHA = {
    kind: 'text',
    text: 'Patient is hypersensitive to sulphar containing drug',
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    owner = await makeDoctor(t.prisma);
    supervisor = await makeDoctor(t.prisma);
    other = await makeDoctor(t.prisma);
    assistantDh = await makeDoctor(t.prisma);
    assistantNone = await makeDoctor(t.prisma);
    await makeAssistantLink(t.prisma, owner.id, assistantDh.id, [
      'rx.drugHistory',
    ]);
    await makeAssistantLink(t.prisma, owner.id, assistantNone.id, [
      'rx.medicines',
    ]);
    [o, s, x, aDh, aNone] = await Promise.all(
      [owner, supervisor, other, assistantDh, assistantNone].map((u) =>
        loginAs(t, u),
      ),
    );
  });
  afterAll(async () => {
    await t.close();
  });

  const url = (p: Patient, rest = '') =>
    `/api/patients/${p.id}/drug-safety${rest}`;
  const withWs = <R extends { set(k: string, v: string): R }>(
    req: R,
    ws?: string,
  ) => (ws ? req.set(WS, ws) : req);
  const rows = (p: Patient) =>
    t.prisma.patientDrugSafety.findMany({
      where: { patientId: p.id },
      orderBy: { createdAt: 'asc' },
    });

  it('adds a medicine and a written line, and lists them in order', async () => {
    const p = await makePatient(t.prisma, owner.id);
    expect((await o.post(url(p)).send(NAPA)).status).toBe(201);
    expect((await o.post(url(p)).send(SULPHA)).status).toBe(201);
    const res = await o.get(url(p));
    expect(res.status).toBe(200);
    expect(
      res.body.map((e: { brand: string; text: string }) => e.brand || e.text),
    ).toEqual(['Napa', SULPHA.text]);
    expect(res.body[0]).toMatchObject({
      generic: 'Paracetamol',
      hypersensitive: true,
      highAlert: false,
      editable: true,
    });
  });

  it('a doctor who cannot reach the patient is 404 — read and write — and nothing is written', async () => {
    const p = await makePatient(t.prisma, owner.id);
    expect((await x.get(url(p))).status).toBe(404);
    expect((await x.post(url(p)).send(NAPA)).status).toBe(404);
    expect(await rows(p)).toHaveLength(0);
  });

  it("the owner's assistant writes with rx.drugHistory, is refused (403) without it, and reads either way", async () => {
    const p = await makePatient(t.prisma, owner.id);
    expect((await withWs(aDh.post(url(p)), owner.id).send(NAPA)).status).toBe(
      201,
    );
    expect(
      (await withWs(aNone.post(url(p)), owner.id).send(SULPHA)).status,
    ).toBe(403);
    expect((await withWs(aNone.get(url(p)), owner.id)).status).toBe(200);
    const [only] = await rows(p);
    expect(
      (await withWs(aNone.delete(url(p, `/${only.id}`)), owner.id)).status,
    ).toBe(403);
    expect(await rows(p)).toHaveLength(1);
  });

  it("a supervising doctor reads and adds, and cannot change the owner's entry", async () => {
    const p = await makePatient(t.prisma, owner.id);
    await makeSupervisor(t.prisma, p.id, supervisor.id);
    const mine = (await o.post(url(p)).send(NAPA)).body;
    expect((await s.post(url(p)).send(SULPHA)).status).toBe(201);
    const seen = (await s.get(url(p))).body as {
      id: string;
      editable: boolean;
    }[];
    expect(seen.find((e) => e.id === mine.id)?.editable).toBe(false);
    expect((await s.delete(url(p, `/${mine.id}`))).status).toBe(403);
    expect(
      (await s.patch(url(p, `/${mine.id}`)).send({ highAlert: true })).status,
    ).toBe(403);
    expect((await rows(p)).find((r) => r.id === mine.id)?.removedAt).toBeNull();
  });

  it('removal is soft: the row is kept, with who and when, and restore puts it back', async () => {
    const p = await makePatient(t.prisma, owner.id);
    const e = (await o.post(url(p)).send(NAPA)).body;
    expect((await o.delete(url(p, `/${e.id}`))).status).toBe(200);
    expect((await o.get(url(p))).body).toHaveLength(0);
    const [kept] = await rows(p);
    expect(kept.removedAt).not.toBeNull();
    expect(kept.removedById).toBe(owner.id);
    expect((await o.post(url(p, `/${e.id}/restore`))).status).toBe(201);
    expect((await o.get(url(p))).body).toHaveLength(1);
  });

  it('edits the ticks of a medicine and the words of a line; refuses none ticked and blank', async () => {
    const p = await makePatient(t.prisma, owner.id);
    const d = (await o.post(url(p)).send(NAPA)).body;
    const tl = (await o.post(url(p)).send(SULPHA)).body;
    expect(
      (await o.patch(url(p, `/${d.id}`)).send({ highAlert: true })).body,
    ).toMatchObject({ hypersensitive: true, highAlert: true });
    expect(
      (
        await o
          .patch(url(p, `/${d.id}`))
          .send({ hypersensitive: false, highAlert: false })
      ).status,
    ).toBe(400);
    expect(
      (
        await o
          .patch(url(p, `/${tl.id}`))
          .send({ text: 'Sulphonamide allergy' })
      ).body.text,
    ).toBe('Sulphonamide allergy');
    expect(
      (await o.patch(url(p, `/${tl.id}`)).send({ text: '   ' })).status,
    ).toBe(400);
  });

  it('refuses the same medicine twice (409) and a body with nothing ticked (400)', async () => {
    const p = await makePatient(t.prisma, owner.id);
    expect((await o.post(url(p)).send(NAPA)).status).toBe(201);
    expect((await o.post(url(p)).send({ ...NAPA, brand: 'napa' })).status).toBe(
      409,
    );
    expect(
      (
        await o
          .post(url(p))
          .send({ ...NAPA, brand: 'Ace', hypersensitive: false })
      ).status,
    ).toBe(400);
    expect((await o.post(url(p)).send({ kind: 'nope' })).status).toBe(400);
    expect(await rows(p)).toHaveLength(1);
  });

  it('two adds of the same medicine sent together file one', async () => {
    const p = await makePatient(t.prisma, owner.id);
    const res = await Promise.all([
      o.post(url(p)).send(NAPA),
      o.post(url(p)).send(NAPA),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await rows(p)).toHaveLength(1);
  });

  it('logs to the acting practice’s activity feed', async () => {
    const p = await makePatient(t.prisma, owner.id);
    await o.post(url(p)).send(NAPA);
    const log = await t.prisma.activityLog.findFirst({
      where: { doctorId: owner.id, patientId: p.id },
    });
    expect(log?.detail).toBe('Hypersensitive to NAPA(Paracetamol)');
  });
});
