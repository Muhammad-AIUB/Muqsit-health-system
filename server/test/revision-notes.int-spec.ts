import type { User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor } from './support/fixtures';
import { resetDb } from './support/test-db';

// GET / PUT /api/revision-notes — "Revision Notes" (physician's sheet,
// 18/10/2026, item 4), through the real HTTP pipeline and the real database.
// What it has to hold: each signed-in user has their OWN notebook — the
// assistant of a doctor never reads the doctor's, even inside the doctor's
// workstation — and a save from a copy that is no longer the stored one is
// refused (409), never written over another device's pages.

type Browser = ReturnType<TestApp['agent']>;

describe('/api/revision-notes', () => {
  let t: TestApp;
  let A: User, asst: User;
  let a: Browser, as: Browser;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    A = await makeDoctor(t.prisma);
    asst = await makeDoctor(t.prisma, { accountTier: 'secondary' });
    await makeAssistantLink(t.prisma, A.id, asst.id, []);
    a = await loginAs(t, A);
    as = await loginAs(t, asst);
  });
  afterAll(async () => {
    await t.close();
  });

  it('is refused without a session', async () => {
    expect((await t.agent().get('/api/revision-notes')).status).toBe(401);
    expect((await t.agent().put('/api/revision-notes').send({ html: 'x', baseUpdatedAt: null })).status).toBe(401);
  });

  it('starts with no notebook', async () => {
    const res = await a.get('/api/revision-notes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ note: null });
  });

  it('saves, reads back, and saves over the copy it was written from', async () => {
    const first = await a.put('/api/revision-notes').send({ html: '<p><b>Hepatitis B</b> — page 1</p>', baseUpdatedAt: null });
    expect(first.status).toBe(200);
    const second = await a.put('/api/revision-notes').send({ html: '<p>page 2</p>', baseUpdatedAt: first.body.updatedAt });
    expect(second.status).toBe(200);
    const read = await a.get('/api/revision-notes');
    expect(read.body.note.html).toBe('<p>page 2</p>');
    expect(read.body.note.updatedAt).toBe(second.body.updatedAt);
  });

  // The real check: a copy that WAS current a moment ago is refused once
  // another save has landed over it — which holds only if every save moves
  // `updatedAt` on (review, 18/10/2026).
  it('refuses a second save from the same copy', async () => {
    const base = (await a.get('/api/revision-notes')).body.note.updatedAt;
    const one = await a.put('/api/revision-notes').send({ html: '<p>screen one</p>', baseUpdatedAt: base });
    expect(one.status).toBe(200);
    expect(one.body.updatedAt).not.toBe(base);
    const two = await a.put('/api/revision-notes').send({ html: '<p>screen two</p>', baseUpdatedAt: base });
    expect(two.status).toBe(409);
    expect((await a.get('/api/revision-notes')).body.note.html).toBe('<p>screen one</p>');
    // Put back what the later cases read.
    await a.put('/api/revision-notes').send({ html: '<p>page 2</p>', baseUpdatedAt: one.body.updatedAt });
  });

  it('refuses a notebook longer than the client sends', async () => {
    const now = (await a.get('/api/revision-notes')).body.note;
    const res = await a.put('/api/revision-notes').send({ html: 'x'.repeat(2_000_001), baseUpdatedAt: now.updatedAt });
    expect(res.status).toBe(400);
  });

  it('refuses a save from an older copy and keeps what is stored', async () => {
    const now = (await a.get('/api/revision-notes')).body.note;
    const stale = await a.put('/api/revision-notes').send({ html: 'from an older screen', baseUpdatedAt: '2020-01-01T00:00:00.000Z' });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toMatch(/another screen/);
    expect((await a.get('/api/revision-notes')).body.note).toEqual(now);
  });

  it("an assistant never reads the doctor's notebook — not even inside the doctor's workstation", async () => {
    const own = await as.get('/api/revision-notes');
    expect(own.body).toEqual({ note: null });
    const inWs = await as.get('/api/revision-notes').set('X-Workstation', A.id);
    expect(inWs.body).toEqual({ note: null });
    // And writing their own does not touch the doctor's.
    await as.put('/api/revision-notes').set('X-Workstation', A.id).send({ html: 'assistant notes', baseUpdatedAt: null });
    expect((await a.get('/api/revision-notes')).body.note.html).toBe('<p>page 2</p>');
  });

  it('drops a field the DTO does not declare', async () => {
    const now = (await a.get('/api/revision-notes')).body.note;
    const res = await a.put('/api/revision-notes').send({ html: 'kept', baseUpdatedAt: now.updatedAt, userId: asst.id });
    expect(res.status).toBe(200);
    expect((await as.get('/api/revision-notes')).body.note.html).toBe('assistant notes');
  });
});
