import type { User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor } from './support/fixtures';
import { resetDb } from './support/test-db';

// GET / PUT /api/revision-notes — "Revision Notes" (physician's sheet,
// 18/10/2026, item 4), through the real HTTP pipeline and the real database.
// What it has to hold: each signed-in user has their OWN notebook — the
// assistant of a doctor never reads the doctor's, even inside the doctor's
// workstation — a save from a copy that is no longer the stored one is
// refused (409), never written over another device's pages, and a save the
// page wrote for one user never lands in another's notebook.

type Browser = ReturnType<TestApp['agent']>;

describe('/api/revision-notes', () => {
  let t: TestApp;
  let A: User, B: User, asst: User;
  let a: Browser, b: Browser, as: Browser;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    A = await makeDoctor(t.prisma);
    B = await makeDoctor(t.prisma);
    asst = await makeDoctor(t.prisma, { accountTier: 'secondary' });
    await makeAssistantLink(t.prisma, A.id, asst.id, []);
    a = await loginAs(t, A);
    b = await loginAs(t, B);
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
    const first = await a.put('/api/revision-notes').send({ html: '<p><b>Hepatitis B</b> — page 1</p>', baseUpdatedAt: null, expectedUserId: A.id });
    expect(first.status).toBe(200);
    const second = await a.put('/api/revision-notes').send({ html: '<p>page 2</p>', baseUpdatedAt: first.body.updatedAt, expectedUserId: A.id });
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
    const one = await a.put('/api/revision-notes').send({ html: '<p>screen one</p>', baseUpdatedAt: base, expectedUserId: A.id });
    expect(one.status).toBe(200);
    expect(one.body.updatedAt).not.toBe(base);
    const two = await a.put('/api/revision-notes').send({ html: '<p>screen two</p>', baseUpdatedAt: base, expectedUserId: A.id });
    expect(two.status).toBe(409);
    expect((await a.get('/api/revision-notes')).body.note.html).toBe('<p>screen one</p>');
    // Put back what the later cases read.
    await a.put('/api/revision-notes').send({ html: '<p>page 2</p>', baseUpdatedAt: one.body.updatedAt, expectedUserId: A.id });
  });

  it('refuses a notebook longer than the client sends', async () => {
    const now = (await a.get('/api/revision-notes')).body.note;
    const res = await a.put('/api/revision-notes').send({ html: 'x'.repeat(2_000_001), baseUpdatedAt: now.updatedAt, expectedUserId: A.id });
    expect(res.status).toBe(400);
  });

  it('refuses a save from an older copy and keeps what is stored', async () => {
    const now = (await a.get('/api/revision-notes')).body.note;
    const stale = await a.put('/api/revision-notes').send({ html: 'from an older screen', baseUpdatedAt: '2020-01-01T00:00:00.000Z', expectedUserId: A.id });
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
    await as.put('/api/revision-notes').set('X-Workstation', A.id).send({ html: 'assistant notes', baseUpdatedAt: null, expectedUserId: asst.id });
    expect((await a.get('/api/revision-notes')).body.note.html).toBe('<p>page 2</p>');
  });

  it('drops a field the DTO does not declare', async () => {
    const now = (await a.get('/api/revision-notes')).body.note;
    const res = await a.put('/api/revision-notes').send({ html: 'kept', baseUpdatedAt: now.updatedAt, expectedUserId: A.id, userId: asst.id });
    expect(res.status).toBe(200);
    expect((await as.get('/api/revision-notes')).body.note.html).toBe('assistant notes');
  });

  // ⚕️ Two tabs share one login cookie. Tab A still shows doctor A; doctor B
  // signs in on tab B, and tab A's autosave (or its flush of held text when
  // the connection comes back) goes out under B's session. B has no notebook
  // yet, so the stale-copy check has nothing to refuse — and A's private text
  // became B's notebook (release review, 18/10/2026).
  it("refuses a save written for another user — nothing lands in the signed-in user's notebook", async () => {
    const res = await b.put('/api/revision-notes').send({ html: "<p>A's private notes</p>", baseUpdatedAt: null, expectedUserId: A.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SIGNED_IN_USER_CHANGED');
    expect(res.body.message).toMatch(/signed in/i);
    expect((await b.get('/api/revision-notes')).body).toEqual({ note: null });
    expect((await a.get('/api/revision-notes')).body.note.html).toBe('kept');
  });

  it("an assistant naming the workstation's doctor is refused too — the key is who is signed in", async () => {
    const own = (await as.get('/api/revision-notes')).body.note;
    const res = await as.put('/api/revision-notes').set('X-Workstation', A.id).send({ html: 'into the doctor?', baseUpdatedAt: own.updatedAt, expectedUserId: A.id });
    expect(res.status).toBe(409);
    expect((await as.get('/api/revision-notes')).body.note).toEqual(own);
    expect((await a.get('/api/revision-notes')).body.note.html).toBe('kept');
  });

  // A tab keeps the build it was loaded with until a full reload. A page from
  // before `expectedUserId` shows a 409's sentence as written and keeps the
  // typing; a 400 it would word itself, and stop saving (release review of
  // a2d7b93). So: 409, no code, and words that say what to do.
  it('refuses a save from a page that names no user — 409 in words for the doctor, nothing written', async () => {
    const res = await b.put('/api/revision-notes').send({ html: 'whose?', baseUpdatedAt: null });
    expect(res.status).toBe(409);
    expect(res.body.code).toBeUndefined();
    expect(res.body.message).toMatch(/before an update/i);
    expect(res.body.message).toMatch(/reload/i);
    expect((await b.get('/api/revision-notes')).body).toEqual({ note: null });
  });

  // ⚕️ Coming back to the tab after that refusal: the page asked for "its"
  // notebook under B's session and was answered with B's, which it then
  // offered in place of A's typing (release review of a2d7b93). A page that
  // names a user is answered for that user only.
  it("refuses a read for a page that names another user — the signed-in user's notebook never reaches it", async () => {
    const own = await b.put('/api/revision-notes').send({ html: "<p>B's private notes</p>", baseUpdatedAt: null, expectedUserId: B.id });
    expect(own.status).toBe(200);
    const res = await b.get('/api/revision-notes').query({ expectedUserId: A.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SIGNED_IN_USER_CHANGED');
    expect(res.body.message).toMatch(/signed in/i);
    expect(JSON.stringify(res.body)).not.toContain("B's private notes");
    expect(res.body.note).toBeUndefined();
  });

  it('reads for a page that names the signed-in user, and as before for one that names nobody', async () => {
    const named = await b.get('/api/revision-notes').query({ expectedUserId: B.id });
    expect(named.status).toBe(200);
    expect(named.body.note.html).toBe("<p>B's private notes</p>");
    expect((await b.get('/api/revision-notes')).body.note.html).toBe("<p>B's private notes</p>");
  });

  it("an assistant's page naming the workstation's doctor is not answered with anyone's notebook", async () => {
    const res = await as.get('/api/revision-notes').set('X-Workstation', A.id).query({ expectedUserId: A.id });
    expect(res.status).toBe(409);
    expect(res.body.note).toBeUndefined();
  });
});
