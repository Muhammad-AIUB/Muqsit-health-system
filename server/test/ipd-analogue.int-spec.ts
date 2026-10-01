import type { User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor } from './support/fixtures';
import { admissionBody, storedSheets, WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ server/CLAUDE.md Rule 2d — the ward's photographed paper order sheets are
// medico-legal documents. Through the real HTTP pipeline and a real Postgres:
// the server owns `id`/`addedAt`, removal is soft, every operation is audited
// under the person who did it, and no overlapping write may lose a page.

type Agent = Awaited<ReturnType<typeof loginAs>>;
type Sheet = Record<string, unknown> & { id: string; url: string };

describe('IPD analogue order sheets (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  const setup = async () => {
    const doctor = await makeDoctor(t.prisma);
    const browser = await loginAs(t, doctor);
    const res = await browser.post('/api/ipd').send(admissionBody());
    expect(res.status).toBe(201);
    return { doctor, browser, admissionId: res.body.id as string };
  };

  const addPage = async (browser: Agent, admissionId: string, sheet: Record<string, unknown>) => {
    const res = await browser.post(`/api/ipd/${admissionId}/analogue`).send({ sheets: [sheet] });
    expect(res.status).toBe(201);
    return res;
  };

  const events = (admissionId: string) =>
    t.prisma.ipdEvent.findMany({ where: { admissionId }, orderBy: { createdAt: 'asc' } });

  describe('POST /ipd/:id/analogue', () => {
    it('assigns id and addedAt on the server and ignores client-sent values', async () => {
      const { doctor, browser, admissionId } = await setup();
      const before = Date.now();

      const res = await browser.post(`/api/ipd/${admissionId}/analogue`).send({
        sheets: [
          {
            url: '/uploads/a.jpg',
            thumbUrl: '/uploads/a-t.jpg',
            label: '  Day 3 night  ',
            // None of these are the client's to set.
            id: 'client-chosen-id',
            addedAt: '2001-01-01T00:00:00.000Z',
            addedBy: 'someone-else',
            removedAt: '2001-01-01T00:00:00.000Z',
            removedBy: 'someone-else',
          },
        ],
      });
      const after = Date.now();
      // forbidNonWhitelisted is not set, so unknown keys are stripped, not refused.
      expect(res.status).toBe(201);

      const { sheets } = await storedSheets(t.prisma, admissionId);
      expect(sheets).toHaveLength(1);
      const s = sheets[0] as Sheet;
      expect(s.id).not.toBe('client-chosen-id');
      expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(s.addedAt).not.toBe('2001-01-01T00:00:00.000Z');
      const at = new Date(s.addedAt as string).getTime();
      expect(at).toBeGreaterThanOrEqual(before - 1000);
      expect(at).toBeLessThanOrEqual(after + 1000);
      expect(s.addedBy).toBe(doctor.id);
      expect('removedAt' in s).toBe(false);
      expect('removedBy' in s).toBe(false);
      // What the client DID own is stored as sent (label trimmed, per the service).
      expect(s.url).toBe('/uploads/a.jpg');
      expect(s.thumbUrl).toBe('/uploads/a-t.jpg');
      expect(s.label).toBe('Day 3 night');
      // The response carries the same stored value.
      expect(res.body.clinical.analogueSheets).toEqual(sheets);
    });

    it('appends in order and gives every page its own id', async () => {
      const { browser, admissionId } = await setup();
      await addPage(browser, admissionId, { url: '/uploads/a.jpg' });
      const res = await browser
        .post(`/api/ipd/${admissionId}/analogue`)
        .send({ sheets: [{ url: '/uploads/c.jpg' }, { url: '/uploads/d.jpg', thumbUrl: '/uploads/d-t.jpg' }] });
      expect(res.status).toBe(201);

      const { sheets } = await storedSheets(t.prisma, admissionId);
      expect(sheets.map((s) => s.url)).toEqual(['/uploads/a.jpg', '/uploads/c.jpg', '/uploads/d.jpg']);
      expect(new Set(sheets.map((s) => s.id)).size).toBe(3);
    });

    it('leaves every other clinical key untouched', async () => {
      const { browser, admissionId } = await setup();
      const patch = await browser
        .patch(`/api/ipd/${admissionId}`)
        .send({ clinical: { diagnosis: ['febrile convulsion'], plan: ['Bed rest'] } });
      expect(patch.status).toBe(200);

      await addPage(browser, admissionId, { url: '/uploads/a.jpg' });

      const { clinical, sheets } = await storedSheets(t.prisma, admissionId);
      expect(clinical.diagnosis).toEqual(['febrile convulsion']);
      expect(clinical.plan).toEqual(['Bed rest']);
      expect(sheets).toHaveLength(1);
    });

    it('refuses an empty batch and more than 20 pages, writing nothing', async () => {
      const { browser, admissionId } = await setup();
      const none = await browser.post(`/api/ipd/${admissionId}/analogue`).send({ sheets: [] });
      expect(none.status).toBe(400);
      const many = await browser
        .post(`/api/ipd/${admissionId}/analogue`)
        .send({ sheets: Array.from({ length: 21 }, (_, i) => ({ url: `/uploads/p${i}.jpg` })) });
      expect(many.status).toBe(400);
      expect((await storedSheets(t.prisma, admissionId)).sheets).toEqual([]);
      expect(await events(admissionId)).toEqual([]);
    });
  });

  describe('soft removal', () => {
    it('DELETE marks the page removed and keeps it in place; restore clears the marks', async () => {
      const { doctor, browser, admissionId } = await setup();
      await browser.post(`/api/ipd/${admissionId}/analogue`).send({
        sheets: [{ url: '/uploads/a.jpg' }, { url: '/uploads/b.jpg', thumbUrl: '/uploads/b-t.jpg' }, { url: '/uploads/c.jpg' }],
      });
      const original = (await storedSheets(t.prisma, admissionId)).sheets as Sheet[];
      const target = original[1];
      const before = Date.now();

      const del = await browser.delete(`/api/ipd/${admissionId}/analogue/${target.id}`);
      expect(del.status).toBe(200);

      const removed = (await storedSheets(t.prisma, admissionId)).sheets as Sheet[];
      // Still three entries, still in the same positions.
      expect(removed.map((s) => s.id)).toEqual(original.map((s) => s.id));
      expect(removed[1].removedBy).toBe(doctor.id);
      expect(new Date(removed[1].removedAt as string).getTime()).toBeGreaterThanOrEqual(before - 1000);
      // Everything else about the removed page is intact.
      expect(removed[1]).toMatchObject(target);
      // Its neighbours are untouched.
      expect(removed[0]).toEqual(original[0]);
      expect(removed[2]).toEqual(original[2]);

      const restore = await browser.post(`/api/ipd/${admissionId}/analogue/${target.id}/restore`);
      expect(restore.status).toBe(201);

      const restored = (await storedSheets(t.prisma, admissionId)).sheets as Sheet[];
      expect(restored).toEqual(original);
      expect('removedAt' in restored[1]).toBe(false);
      expect('removedBy' in restored[1]).toBe(false);
    });

    it('answers 404 for a page that does not exist and writes no audit line', async () => {
      const { browser, admissionId } = await setup();
      await addPage(browser, admissionId, { url: '/uploads/a.jpg' });
      const res = await browser.delete(`/api/ipd/${admissionId}/analogue/no-such-page`);
      expect(res.status).toBe(404);
      const restore = await browser.post(`/api/ipd/${admissionId}/analogue/no-such-page/restore`);
      expect(restore.status).toBe(404);
      expect(await events(admissionId)).toHaveLength(1); // only the add
    });
  });

  describe('audit trail', () => {
    it('writes one IpdEvent per operation, attributed to the signed-in doctor', async () => {
      const { doctor, browser, admissionId } = await setup();
      await addPage(browser, admissionId, { url: '/uploads/a.jpg' });
      const [sheet] = (await storedSheets(t.prisma, admissionId)).sheets as Sheet[];

      await browser.patch(`/api/ipd/${admissionId}/analogue/${sheet.id}`).send({ label: 'Day 3 night' }).expect(200);
      await browser.delete(`/api/ipd/${admissionId}/analogue/${sheet.id}`).expect(200);
      await browser.post(`/api/ipd/${admissionId}/analogue/${sheet.id}/restore`).expect(201);

      const feed = await events(admissionId);
      expect(feed.map((e) => e.note)).toEqual([
        'Added 1 order-sheet page',
        'Labelled an order-sheet page "Day 3 night"',
        'Removed an order-sheet page (Day 3 night)',
        'Restored an order-sheet page (Day 3 night)',
      ]);
      for (const e of feed) {
        expect(e.author).toBe(doctor.name);
        expect(e.role).toBeNull();
      }

      // The same feed is what the route returns.
      const viaApi = await browser.get(`/api/ipd/${admissionId}/events`);
      expect(viaApi.status).toBe(200);
      expect(viaApi.body.map((e: { note: string }) => e.note)).toEqual(feed.map((e) => e.note));
    });

    it('names the ASSISTANT who acted, not the workstation doctor', async () => {
      const { doctor, admissionId } = await setup();
      const assistant: User = await makeDoctor(t.prisma, { accountTier: 'secondary' });
      await makeAssistantLink(t.prisma, doctor.id, assistant.id, []);
      const asst = await loginAs(t, assistant);

      // No `ipd.analogue` key — an assistant passes without one (assertMayEditAnalogue).
      const add = await asst
        .post(`/api/ipd/${admissionId}/analogue`)
        .set(WS, doctor.id)
        .send({ sheets: [{ url: '/uploads/a.jpg' }] });
      expect(add.status).toBe(201);
      const [sheet] = (await storedSheets(t.prisma, admissionId)).sheets as Sheet[];
      expect(sheet.addedBy).toBe(assistant.id);

      await asst.delete(`/api/ipd/${admissionId}/analogue/${sheet.id}`).set(WS, doctor.id).expect(200);
      const [removed] = (await storedSheets(t.prisma, admissionId)).sheets as Sheet[];
      expect(removed.removedBy).toBe(assistant.id);

      const feed = await events(admissionId);
      expect(feed).toHaveLength(2);
      for (const e of feed) {
        expect(e.author).toBe(assistant.name);
        expect(e.author).not.toBe(doctor.name);
        expect(e.role).toBe('Assistant');
      }
    });
  });

  describe('concurrency — the row lock', () => {
    it('keeps all 8 pages when 8 uploads land at once', async () => {
      const { browser, admissionId } = await setup();
      const N = 8;

      const results = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          browser.post(`/api/ipd/${admissionId}/analogue`).send({ sheets: [{ url: `/uploads/p${i}.jpg` }] }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(N).fill(201));

      const { sheets } = await storedSheets(t.prisma, admissionId);
      expect(sheets.map((s) => s.url).sort()).toEqual(
        Array.from({ length: N }, (_, i) => `/uploads/p${i}.jpg`).sort(),
      );
      expect(new Set(sheets.map((s) => s.id)).size).toBe(N);
      // And the feed does not claim more (or fewer) pages than the record holds.
      expect(await events(admissionId)).toHaveLength(N);
    });

    it('keeps every page when uploads race removals of earlier pages', async () => {
      const { browser, admissionId } = await setup();
      await browser
        .post(`/api/ipd/${admissionId}/analogue`)
        .send({ sheets: [{ url: '/uploads/a.jpg' }, { url: '/uploads/b.jpg' }] })
        .expect(201);
      const [a, b] = (await storedSheets(t.prisma, admissionId)).sheets as Sheet[];

      const results = await Promise.all([
        browser.delete(`/api/ipd/${admissionId}/analogue/${a.id}`),
        browser.post(`/api/ipd/${admissionId}/analogue`).send({ sheets: [{ url: '/uploads/c.jpg' }] }),
        browser.delete(`/api/ipd/${admissionId}/analogue/${b.id}`),
        browser.post(`/api/ipd/${admissionId}/analogue`).send({ sheets: [{ url: '/uploads/d.jpg' }] }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 201, 200, 201]);

      const { sheets } = await storedSheets(t.prisma, admissionId);
      expect(sheets).toHaveLength(4);
      expect(sheets.slice(0, 2).map((s) => s.url)).toEqual(['/uploads/a.jpg', '/uploads/b.jpg']);
      expect(sheets.slice(2).map((s) => s.url).sort()).toEqual(['/uploads/c.jpg', '/uploads/d.jpg']);
      expect(sheets[0].removedAt).toBeDefined();
      expect(sheets[1].removedAt).toBeDefined();
      expect(sheets[2].removedAt).toBeUndefined();
      expect(sheets[3].removedAt).toBeUndefined();
    });
  });

  describe('the whole-clinical PATCH', () => {
    it('keeps the pages when the payload omits analogueSheets', async () => {
      const { browser, admissionId } = await setup();
      await browser
        .post(`/api/ipd/${admissionId}/analogue`)
        .send({ sheets: [{ url: '/uploads/a.jpg' }, { url: '/uploads/b.jpg', thumbUrl: '/uploads/b-t.jpg' }] })
        .expect(201);
      const before = (await storedSheets(t.prisma, admissionId)).sheets;

      const res = await browser
        .patch(`/api/ipd/${admissionId}`)
        .send({ clinical: { diagnosis: ['febrile convulsion'], plan: ['Bed rest'] } });
      expect(res.status).toBe(200);

      const { clinical, sheets } = await storedSheets(t.prisma, admissionId);
      expect(sheets).toEqual(before);
      // The rest of the payload still replaces the column.
      expect(clinical.diagnosis).toEqual(['febrile convulsion']);
      expect(clinical.plan).toEqual(['Bed rest']);
    });

    it('keeps the pages across a header-only PATCH', async () => {
      const { browser, admissionId } = await setup();
      await addPage(browser, admissionId, { url: '/uploads/a.jpg' });
      const res = await browser.patch(`/api/ipd/${admissionId}`).send({ diagnosis: 'febrile convulsion' });
      expect(res.status).toBe(200);
      expect((await storedSheets(t.prisma, admissionId)).sheets).toHaveLength(1);
    });
  });

  describe('scoping', () => {
    it("refuses another doctor's PATCH and analogue writes, and changes nothing", async () => {
      const { browser, admissionId } = await setup();
      await addPage(browser, admissionId, { url: '/uploads/a.jpg' });
      const before = await storedSheets(t.prisma, admissionId);
      const [sheet] = before.sheets as Sheet[];

      const other = await loginAs(t, await makeDoctor(t.prisma));

      const patch = await other.patch(`/api/ipd/${admissionId}`).send({ clinical: { diagnosis: ['new'] } });
      expect(patch.status).toBe(404);
      const add = await other.post(`/api/ipd/${admissionId}/analogue`).send({ sheets: [{ url: '/uploads/x.jpg' }] });
      expect(add.status).toBe(404);
      const del = await other.delete(`/api/ipd/${admissionId}/analogue/${sheet.id}`);
      expect(del.status).toBe(404);
      const label = await other.patch(`/api/ipd/${admissionId}/analogue/${sheet.id}`).send({ label: 'x' });
      expect(label.status).toBe(404);
      const feed = await other.get(`/api/ipd/${admissionId}/events`);
      expect(feed.status).toBe(404);
      const list = await other.get('/api/ipd');
      expect(list.body).toEqual([]);

      expect(await storedSheets(t.prisma, admissionId)).toEqual(before);
      expect(await events(admissionId)).toHaveLength(1);
    });

    it("refuses a forged X-Workstation naming a doctor the user does not assist", async () => {
      const { doctor, admissionId } = await setup();
      const other = await loginAs(t, await makeDoctor(t.prisma));
      const res = await other
        .post(`/api/ipd/${admissionId}/analogue`)
        .set(WS, doctor.id)
        .send({ sheets: [{ url: '/uploads/x.jpg' }] });
      expect(res.status).toBe(403);
      expect((await storedSheets(t.prisma, admissionId)).sheets).toEqual([]);
    });

    it("refuses another doctor's wardId on admit, and on a later PATCH", async () => {
      const mine = await makeDoctor(t.prisma);
      const theirs = await makeDoctor(t.prisma);
      const foreignWard = await t.prisma.ward.create({ data: { doctorId: theirs.id, name: 'Ward 3' } });
      const ownWard = await t.prisma.ward.create({ data: { doctorId: mine.id, name: 'ward 3' } });
      const browser = await loginAs(t, mine);

      const body = admissionBody({ wardId: foreignWard.id, wardNo: 'Ward 3' });
      const refused = await browser.post('/api/ipd').send(body);
      expect(refused.status).toBe(404);
      expect(await t.prisma.ipdAdmission.count({ where: { doctorId: mine.id } })).toBe(0);
      expect(await t.prisma.ipdAdmission.count({ where: { wardId: foreignWard.id } })).toBe(0);

      // The doctor's own ward links, and its real name is what is written back.
      const ok = await browser.post('/api/ipd').send(admissionBody({ wardId: ownWard.id, wardNo: 'typed text' }));
      expect(ok.status).toBe(201);
      expect(ok.body.wardId).toBe(ownWard.id);
      expect(ok.body.wardNo).toBe('ward 3');

      const move = await browser.patch(`/api/ipd/${ok.body.id}`).send({ wardId: foreignWard.id });
      expect(move.status).toBe(404);
      const row = await t.prisma.ipdAdmission.findUniqueOrThrow({ where: { id: ok.body.id } });
      expect(row.wardId).toBe(ownWard.id);
    });

    it('answers 401 without a session', async () => {
      const res = await t.agent().post('/api/ipd/anything/analogue').send({ sheets: [{ url: '/uploads/a.jpg' }] });
      expect(res.status).toBe(401);
    });
  });
});
