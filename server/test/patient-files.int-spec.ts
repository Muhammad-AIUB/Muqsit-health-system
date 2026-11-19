import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import type { Patient, User } from '@prisma/client';
import { dhakaDayKey } from '../src/opd/dhaka-day';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor, makePatient, makeSupervisor } from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ Permissions (scanned images) and Imaging DICOM files of a patient —
// `/api/patients/:id/files` (physician's sheet 07/11/2026). Real HTTP, real
// multipart, real database, real disk; every name here is made up.
//
// The rules under test are the ones written in docs/rules/records-page.md
// ("patient-files") and docs/API.md, and nothing else:
//  • READ: anyone who reaches the patient;
//  • ADD / REMOVE: the patient's OWNER practice only (a supervising doctor gets
//    403); an assistant needs `pt.info`;
//  • Imaging DICOM is PREMIUM-only on the server — the signed-in user's tier —
//    for the list, the upload and the removal; Permissions are not gated;
//  • removal is SOFT: the row and the bytes stay, with who removed it and when;
//  • a file's kind is decided by its BYTES (an image; `DICM` at byte 128), not
//    by its name or type; a request refused by the premium, owner, key, DICOM-name
//    or format checks leaves nothing on disk — the DICOM temp file sits where
//    /uploads is served;
//  • each add and each removal writes one activity line.
// `patient-files.service.spec.ts` pins the service with a faked database; this
// spec is what the guards, the parser, the disk and the tables do together.
//
// NOT covered here: the 300 MB DICOM limit (`DICOM_MAX_BYTES`; a real upload of
// that size is not worth a test run), the refusal of a local PUBLIC_URL
// (`upload.service.spec.ts`; the test API runs with ALLOW_LOCALHOST_UPLOAD_URLS),
// and whose account tier the premium gate reads for an assistant (audit question).
// A request refused AFTER its file was kept (an unreal date such as 31/02/2026, a
// permission with no usable name) leaves that file on disk; that is recorded in
// docs/audit/records-page.md and deliberately not pinned. A DICOM request the DTO
// refuses leaves no temp file either (a defect until 2026-11-19, fixed in the controller).
// The multipart bodies are opaque to the contract test (`KNOWN_OPAQUE_PAYLOADS`).
//
// Files the API writes land in server/uploads/; the ones written here are removed
// (only names of the shapes this spec can make, and only those new since it began).

type Agent = Awaited<ReturnType<typeof loginAs>>;

const uploads = join(process.cwd(), 'uploads');
const listing = (): string[] => (existsSync(uploads) ? readdirSync(uploads) : []);
// What this spec can write: <uuid>.png, <uuid>.dcm, tmp-<uuid>. Cleanup touches only
// those shapes, only files that were not there before, and only ones written during
// this run — never anything else in a folder the dev API also uses.
const OURS = /^(tmp-)?[0-9a-f-]{36}(\.(png|dcm))?$/;
const startedAt = Date.now();
const removeNewFiles = (was: Set<string>): void => {
  for (const name of listing()) {
    if (was.has(name) || !OURS.test(name)) continue;
    if (statSync(join(uploads, name)).mtimeMs < startedAt - 2000) continue;
    rmSync(join(uploads, name), { force: true });
  }
};

// The PNG signature is what the service's own format check reads (upload.service.ts#sniff).
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
// A DICOM file: a 128-byte preamble, `DICM`, then whatever the study holds.
const dicom = (extra = 64): Buffer => Buffer.concat([Buffer.alloc(128), Buffer.from('DICM', 'ascii'), Buffer.alloc(extra, 7)]);

const ddmmyyyy = (d: Date): string => {
  const [y, m, day] = dhakaDayKey(d).split('-');
  return `${day}/${m}/${y}`;
};

describe('Patient files — Permissions and Imaging DICOM', () => {
  let t: TestApp;
  let owner: User, ownerBasic: User, stranger: User, supervisor: User, aKey: User, aNone: User;
  let o: Agent, ob: Agent, x: Agent, s: Agent, ak: Agent, an: Agent;
  let before: Set<string>;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    const premium = { accountTier: 'premium' } as const;
    owner = await makeDoctor(t.prisma, premium);
    ownerBasic = await makeDoctor(t.prisma); // 'primary' tier: not premium
    stranger = await makeDoctor(t.prisma, premium);
    supervisor = await makeDoctor(t.prisma, premium);
    aKey = await makeDoctor(t.prisma, premium);
    aNone = await makeDoctor(t.prisma, premium);
    await makeAssistantLink(t.prisma, owner.id, aKey.id, ['pt.info']);
    await makeAssistantLink(t.prisma, owner.id, aNone.id, []);
    [o, ob, x, s, ak, an] = await Promise.all([owner, ownerBasic, stranger, supervisor, aKey, aNone].map((u) => loginAs(t, u)));
    before = new Set(listing());
  });

  afterAll(async () => {
    removeNewFiles(before);
    await t.close();
  });

  // ---- patients ----------------------------------------------------------
  const patientOf = (doc: User): Promise<Patient> => makePatient(t.prisma, doc.id);
  // The owner's patient, which `supervisor` also reaches (as a supervising doctor).
  const supervised = async (): Promise<Patient> => {
    const p = await patientOf(owner);
    await makeSupervisor(t.prisma, p.id, supervisor.id);
    return p;
  };

  // ---- requests ----------------------------------------------------------
  const base = (p: Patient) => `/api/patients/${p.id}/files`;
  const list = (agent: Agent, p: Patient, kind: string, ws?: string) => {
    const req = agent.get(`${base(p)}/${kind}`);
    return ws ? req.set(WS, ws) : req;
  };
  // `fieldsAfterFile`: text fields sent AFTER the file part, so the parser has already
  // started keeping the file when it meets them (a field before the file is refused
  // before any file is written, which would prove nothing about cleanup).
  type AddOpts = { ws?: string; fields?: Record<string, string>; fieldsAfterFile?: Record<string, string>; bytes?: Buffer; filename?: string };
  const addPermission = (agent: Agent, p: Patient, o2: AddOpts = {}) => {
    let req = agent.post(`${base(p)}/permission`);
    if (o2.ws) req = req.set(WS, o2.ws);
    for (const [k, v] of Object.entries(o2.fields ?? {})) req = req.field(k, v);
    req = req.attach('file', o2.bytes ?? png, o2.filename ?? 'consent form.png');
    for (const [k, v] of Object.entries(o2.fieldsAfterFile ?? {})) req = req.field(k, v);
    return req;
  };
  const addDicom = (agent: Agent, p: Patient, o2: AddOpts = {}) => {
    let req = agent.post(`${base(p)}/dicom`);
    if (o2.ws) req = req.set(WS, o2.ws);
    for (const [k, v] of Object.entries(o2.fields ?? { name: 'MRI whole abdomen' })) req = req.field(k, v);
    req = req.attach('file', o2.bytes ?? dicom(), o2.filename ?? 'IM0001.dcm');
    for (const [k, v] of Object.entries(o2.fieldsAfterFile ?? {})) req = req.field(k, v);
    return req;
  };
  const remove = (agent: Agent, p: Patient, fileId: string, ws?: string) => {
    const req = agent.delete(`${base(p)}/${fileId}`);
    return ws ? req.set(WS, ws) : req;
  };

  // ---- the tables and the disk --------------------------------------------
  const rows = (p: Patient) => t.prisma.patientFile.findMany({ where: { patientId: p.id }, orderBy: { createdAt: 'asc' } });
  const lines = (p: Patient) => t.prisma.activityLog.findMany({ where: { patientId: p.id }, orderBy: { createdAt: 'asc' } });
  // A row written straight, as an earlier request would have left it.
  const seed = (p: Patient, kind: 'permission' | 'dicom', over: Record<string, unknown> = {}) =>
    t.prisma.patientFile.create({
      data: {
        patientId: p.id,
        kind,
        name: `Seeded ${kind}`,
        fileDate: '01/11/2026',
        url: `http://localhost:4100/uploads/seeded.${kind === 'dicom' ? 'dcm' : 'png'}`,
        size: 10,
        originalName: 'seeded',
        practiceDoctorId: p.doctorId,
        addedById: p.doctorId,
        addedByName: 'Seeded',
        ...(over as object),
      },
    });
  const files = () => new Set(listing());
  const noNewFiles = (was: Set<string>) => expect([...files()].filter((f) => !was.has(f))).toEqual([]);
  const fileOf = (url: string) => join(uploads, String(url).split('/').pop() as string);

  // ======================================================================
  describe('reading', () => {
    it('a kind other than permission or dicom is 400', async () => {
      const p = await patientOf(owner);
      expect((await list(o, p, 'photo')).status).toBe(400);
    });

    it('the list holds only the asked kind, newest first, and nothing that was removed', async () => {
      const p = await patientOf(owner);
      await seed(p, 'permission', { name: 'older', createdAt: new Date('2026-11-01T10:00:00Z') });
      await seed(p, 'permission', { name: 'newer', createdAt: new Date('2026-11-02T10:00:00Z') });
      await seed(p, 'permission', { name: 'removed one', removedAt: new Date(), removedById: owner.id });
      await seed(p, 'dicom', { name: 'the scan' });
      const perms = await list(o, p, 'permission');
      expect(perms.status).toBe(200);
      expect(perms.body.map((r: { name: string }) => r.name)).toEqual(['newer', 'older']);
      expect(Object.keys(perms.body[0]).sort()).toEqual(['addedByName', 'createdAt', 'fileDate', 'id', 'kind', 'name', 'size', 'url']);
      const dcm = await list(o, p, 'dicom');
      expect(dcm.status).toBe(200);
      expect(dcm.body.map((r: { name: string }) => r.name)).toEqual(['the scan']);
    });

    it("anyone who reaches the patient reads: a supervising doctor, and an assistant with no key", async () => {
      const p = await supervised();
      await seed(p, 'permission', { name: 'consent' });
      await seed(p, 'dicom', { name: 'MRI' });
      const bySup = await list(s, p, 'permission');
      expect(bySup.status).toBe(200);
      expect(bySup.body.map((r: { name: string }) => r.name)).toEqual(['consent']);
      expect((await list(s, p, 'dicom')).body.map((r: { name: string }) => r.name)).toEqual(['MRI']);
      const byAssistant = await list(an, p, 'permission', owner.id);
      expect(byAssistant.status).toBe(200);
      expect(byAssistant.body).toHaveLength(1);
    });

    it('a doctor who cannot reach the patient gets 404 for both kinds, and sees nothing', async () => {
      const p = await patientOf(owner);
      await seed(p, 'permission');
      await seed(p, 'dicom');
      expect((await list(x, p, 'permission')).status).toBe(404);
      expect((await list(x, p, 'dicom')).status).toBe(404);
    });
  });

  // ======================================================================
  describe('a permission (a scanned image)', () => {
    it('the owner adds one: the row, the image on disk, who added it, one activity line', async () => {
      const p = await patientOf(owner);
      const t0 = ddmmyyyy(new Date());
      const res = await addPermission(o, p);
      const t1 = ddmmyyyy(new Date());
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ kind: 'permission', name: 'consent form', size: png.length, addedByName: owner.name });
      expect([t0, t1]).toContain(res.body.fileDate); // no date sent: today, in Dhaka
      expect(res.body.url).toMatch(/^http:\/\/localhost:4100\/uploads\/[0-9a-f-]{36}\.png$/);
      expect(readFileSync(fileOf(res.body.url)).equals(png)).toBe(true);

      const stored = await rows(p);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ id: res.body.id, kind: 'permission', practiceDoctorId: owner.id, addedById: owner.id, removedAt: null, removedById: null });
      const log = await lines(p);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ doctorId: owner.id, section: 'Permissions', patientId: p.id, actorName: owner.name });
      expect(log[0].detail).toContain('consent form');

      expect((await list(o, p, 'permission')).body.map((r: { id: string }) => r.id)).toEqual([res.body.id]);
    });

    it('a name and a date that are sent win over the file name and today', async () => {
      const p = await patientOf(owner);
      const res = await addPermission(o, p, { fields: { name: '  Anaesthesia consent  ', fileDate: '29/02/2024' } });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Anaesthesia consent', fileDate: '29/02/2024' });
    });

    it('a name over 120 characters, or a date that is not dd/mm/yyyy or not a real date, is 400 and nothing is filed', async () => {
      const p = await patientOf(owner);
      expect((await addPermission(o, p, { fields: { name: 'n'.repeat(121) } })).status).toBe(400);
      expect((await addPermission(o, p, { fields: { fileDate: '2026-11-07' } })).status).toBe(400);
      expect((await addPermission(o, p, { fields: { fileDate: '31/02/2026' } })).status).toBe(400);
      expect(await rows(p)).toEqual([]);
      expect(await lines(p)).toEqual([]);
    });

    it('a file that is not an image is 400, one over 8 MB is 413, no file is 400 — nothing is filed', async () => {
      const p = await patientOf(owner);
      const was = files();
      const notImage = await addPermission(o, p, { bytes: Buffer.from('not an image'), filename: 'note.txt' });
      expect(notImage.status).toBe(400);
      const big = await addPermission(o, p, { bytes: Buffer.concat([png, Buffer.alloc(8 * 1024 * 1024)]), filename: 'scan.png' });
      expect(big.status).toBe(413);
      const none = await o.post(`${base(p)}/permission`);
      expect(none.status).toBe(400);
      noNewFiles(was);
      expect(await rows(p)).toEqual([]);
    });

    // The parser takes the two text fields the DTO declares (name, fileDate): `limits.fields: 2`
    // in the controller. Add a field to the DTO and the limit and this test change together.
    it('a text field beyond those two is refused, and nothing is left', async () => {
      const p = await patientOf(owner);
      const was = files();
      const res = await addPermission(o, p, { fields: { name: 'x', fileDate: '01/11/2026' }, fieldsAfterFile: { note: 'hello' } });
      expect(res.status).toBe(400);
      noNewFiles(was);
      expect(await rows(p)).toEqual([]);
    });
  });

  // ======================================================================
  describe('Imaging DICOM', () => {
    it('the owner adds one: kept as <uuid>.dcm with the very bytes sent, named, one activity line, no temp file', async () => {
      const p = await patientOf(owner);
      const was = files();
      const bytes = dicom(500);
      const res = await addDicom(o, p, { bytes, fields: { name: '  MRI whole abdomen ', fileDate: '02/11/2026' } });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ kind: 'dicom', name: 'MRI whole abdomen', fileDate: '02/11/2026', size: bytes.length, addedByName: owner.name });
      expect(res.body.url).toMatch(/^http:\/\/localhost:4100\/uploads\/[0-9a-f-]{36}\.dcm$/);
      expect(readFileSync(fileOf(res.body.url)).equals(bytes)).toBe(true);
      // exactly one new file: the stored one — the temp file the parser wrote is gone
      expect([...files()].filter((f) => !was.has(f))).toEqual([String(res.body.url).split('/').pop()]);

      expect(await rows(p)).toHaveLength(1);
      const log = await lines(p);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ doctorId: owner.id, section: 'Imaging DICOM', patientId: p.id });
      expect((await list(o, p, 'dicom')).body).toHaveLength(1);
      expect((await list(o, p, 'permission')).body).toEqual([]);
    });

    it('a DICOM file must be named: none, or a blank one, is 400 and nothing is left on disk', async () => {
      const p = await patientOf(owner);
      const was = files();
      for (const fields of [{}, { name: '   ' }, { fileDate: '02/11/2026' }]) {
        const res = await addDicom(o, p, { fields });
        expect(res.status).toBe(400);
      }
      noNewFiles(was);
      expect(await rows(p)).toEqual([]);
      expect(await lines(p)).toEqual([]);
    });

    it('a DICOM file is known by its bytes — `DICM` at byte 128 — not by its name or its type', async () => {
      const p = await patientOf(owner);
      const was = files();
      // named .dcm, no marker
      const named = await addDicom(o, p, { bytes: Buffer.concat([Buffer.alloc(128), Buffer.from('NOPE'), Buffer.alloc(64)]), filename: 'scan.dcm' });
      expect(named.status).toBe(400);
      // the marker at the start, where an old file without a preamble would have it
      const early = await addDicom(o, p, { bytes: Buffer.concat([Buffer.from('DICM'), Buffer.alloc(200)]), filename: 'old.dcm' });
      expect(early.status).toBe(400);
      // shorter than the preamble and the marker
      const short = await addDicom(o, p, { bytes: Buffer.alloc(100), filename: 'short.dcm' });
      expect(short.status).toBe(400);
      noNewFiles(was); // no temp file, no stored file
      expect(await rows(p)).toEqual([]);

      // the other way round: not named .dcm, but the bytes are right
      const odd = await addDicom(o, p, { filename: 'export.txt' });
      expect(odd.status).toBe(201);
      expect(odd.body.url).toMatch(/\.dcm$/);
      expect(await rows(p)).toHaveLength(1);
    });

    // Sent after the file part, so the parser is already keeping the file when it refuses.
    it('a text field beyond the two the DTO declares is refused, and no temp file is left', async () => {
      const p = await patientOf(owner);
      const was = files();
      const res = await addDicom(o, p, { fields: { name: 'MRI', fileDate: '02/11/2026' }, fieldsAfterFile: { note: 'hello' } });
      expect(res.status).toBe(400);
      noNewFiles(was);
      expect(await rows(p)).toEqual([]);
    });

    // multer streams the file to `uploads/tmp-<uuid>` BEFORE the ValidationPipe checks the DTO,
    // and the handler's `finally` never runs when the pipe refuses the request. Until 2026-11-19
    // that left the temp file (up to 300 MB, where /uploads is served) for ANY signed-in user:
    // this was the DEFECT `it.failing` test. `RemoveTempFileOnError` in the controller now
    // removes it. Both triggers — a date that is not dd/mm/yyyy, a name over 120 characters —
    // are refused (400), nothing is filed, and no file is left; the second is sent by an
    // account that is not even premium and for a patient that does not exist.
    it('a DICOM upload the DTO refuses is 400, files nothing and leaves no temp file', async () => {
      const p = await patientOf(owner);
      const was = files();
      // The message proves it is the DTO (the ValidationPipe) that refused each one: a refusal
      // from the handler would clean up by itself and prove nothing about the interceptor.
      const badDate = await addDicom(o, p, { fields: { name: 'MRI', fileDate: '2026-11-07' } });
      expect(badDate.status).toBe(400);
      expect(JSON.stringify(badDate.body)).toContain('fileDate must be dd/mm/yyyy');
      const longName = await addDicom(ob, p, { fields: { name: 'n'.repeat(121) } });
      expect(longName.status).toBe(400);
      expect(JSON.stringify(longName.body)).toContain('name must be shorter than or equal to 120');
      noNewFiles(was);
      expect(await rows(p)).toEqual([]);
      expect(await lines(p)).toEqual([]);
    });
  });

  // ======================================================================
  describe('Imaging DICOM is premium — on the server, for the list, the upload and the removal', () => {
    it("a basic account is refused (403) for each, and the upload leaves nothing on disk", async () => {
      const p = await patientOf(ownerBasic);
      const mine = await seed(p, 'dicom', { name: 'a scan' });
      const was = files();

      const listed = await list(ob, p, 'dicom');
      expect(listed.status).toBe(403);
      const added = await addDicom(ob, p);
      expect(added.status).toBe(403);
      noNewFiles(was);
      const removed = await remove(ob, p, mine.id);
      expect(removed.status).toBe(403);

      const stored = await rows(p);
      expect(stored).toHaveLength(1); // the seeded row only
      expect(stored[0].removedAt).toBeNull();
      expect(await lines(p)).toEqual([]);
    });

    it('Permissions are not gated: a basic account lists, adds and removes them', async () => {
      const p = await patientOf(ownerBasic);
      const added = await addPermission(ob, p);
      expect(added.status).toBe(201);
      expect((await list(ob, p, 'permission')).body).toHaveLength(1);
      expect((await remove(ob, p, added.body.id)).status).toBe(200);
      expect((await list(ob, p, 'permission')).body).toEqual([]);
    });
  });

  // ======================================================================
  describe('who may add and remove — the patient\'s own practice only', () => {
    const principals = () =>
      ({
        'a doctor who cannot reach the patient': { agent: x, ws: undefined as string | undefined, status: 404 },
        'a supervising doctor': { agent: s, ws: undefined as string | undefined, status: 403 },
        'an assistant without pt.info': { agent: an, ws: owner.id as string | undefined, status: 403 },
      }) as const;
    const names = ['a doctor who cannot reach the patient', 'a supervising doctor', 'an assistant without pt.info'] as const;

    it.each(names)('%s cannot add a permission or a DICOM file — nothing is filed, written or logged', async (who) => {
      const { agent, ws, status } = principals()[who];
      const p = await supervised();
      const was = files();

      const perm = await addPermission(agent, p, { ws });
      const dcm = await addDicom(agent, p, { ws });
      expect([perm.status, dcm.status]).toEqual([status, status]);

      noNewFiles(was); // no image, no .dcm, no temp file
      expect(await rows(p)).toEqual([]);
      expect(await lines(p)).toEqual([]);
      // the same requests from the owner go through: they were refused for who sent them
      expect((await addPermission(o, p)).status).toBe(201);
      expect((await addDicom(o, p)).status).toBe(201);
    });

    it.each(names)('%s cannot remove a file — the row stays, nothing is logged', async (who) => {
      const { agent, ws, status } = principals()[who];
      const p = await supervised();
      const perm = await seed(p, 'permission');
      const dcm = await seed(p, 'dicom');

      expect((await remove(agent, p, perm.id, ws)).status).toBe(status);
      expect((await remove(agent, p, dcm.id, ws)).status).toBe(status);

      expect((await rows(p)).map((r) => r.removedAt)).toEqual([null, null]);
      expect(await lines(p)).toEqual([]);
      expect((await remove(o, p, perm.id)).status).toBe(200);
    });

    it('an assistant WITH pt.info adds and removes — filed under the owner, attributed to the assistant', async () => {
      const p = await patientOf(owner);
      const perm = await addPermission(ak, p, { ws: owner.id });
      const dcm = await addDicom(ak, p, { ws: owner.id });
      expect([perm.status, dcm.status]).toEqual([201, 201]);
      expect(perm.body.addedByName).toBe(aKey.name);
      for (const r of await rows(p)) {
        expect(r).toMatchObject({ practiceDoctorId: owner.id, addedById: aKey.id, addedByName: aKey.name });
      }
      expect((await remove(ak, p, perm.body.id, owner.id)).status).toBe(200);
      expect((await remove(ak, p, dcm.body.id, owner.id)).status).toBe(200);
      const log = await lines(p);
      expect(log).toHaveLength(4);
      expect(log.every((l) => l.doctorId === owner.id && l.actorName === aKey.name)).toBe(true);
    });
  });

  // ======================================================================
  describe('removal is soft', () => {
    it('the row and the bytes stay with who and when; the list drops it; one line is written; a second removal is 404', async () => {
      const p = await patientOf(owner);
      const added = await addPermission(o, p);
      const bytesAt = fileOf(added.body.url);
      expect(existsSync(bytesAt)).toBe(true);

      const res = await remove(o, p, added.body.id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const [row] = await rows(p);
      expect(row.id).toBe(added.body.id); // not deleted
      expect(row.removedAt).toBeInstanceOf(Date);
      expect(row.removedById).toBe(owner.id);
      expect(existsSync(bytesAt)).toBe(true); // the bytes stay
      expect((await list(o, p, 'permission')).body).toEqual([]);

      const log = await lines(p);
      expect(log).toHaveLength(2); // one for the add, one for the removal
      expect(log.filter((l) => l.detail.startsWith('Added'))).toHaveLength(1);
      const removal = log.filter((l) => l.detail.startsWith('Removed'));
      expect(removal).toHaveLength(1);
      expect(removal[0]).toMatchObject({ section: 'Permissions', doctorId: owner.id });

      expect((await remove(o, p, added.body.id)).status).toBe(404);
      expect(await lines(p)).toHaveLength(2);
    });

    it('a DICOM file is removed softly too, and its bytes stay', async () => {
      const p = await patientOf(owner);
      const added = await addDicom(o, p);
      expect((await remove(o, p, added.body.id)).status).toBe(200);
      const [row] = await rows(p);
      expect(row.removedAt).toBeInstanceOf(Date);
      expect(existsSync(fileOf(added.body.url))).toBe(true);
      expect((await list(o, p, 'dicom')).body).toEqual([]);
      const log = await lines(p);
      expect(log).toHaveLength(2); // the add and the removal
      expect(log.filter((l) => l.detail.startsWith('Removed'))).toHaveLength(1);
      expect(log.every((l) => l.section === 'Imaging DICOM')).toBe(true);
    });

    it("a file id of ANOTHER patient is 404 on this patient's route, and that file stays", async () => {
      const a = await patientOf(owner);
      const b = await patientOf(owner);
      const theirs = await seed(b, 'permission', { name: "b's consent" });
      expect((await remove(o, a, theirs.id)).status).toBe(404);
      expect((await remove(o, a, 'no-such-id')).status).toBe(404);
      const [row] = await rows(b);
      expect(row.removedAt).toBeNull();
      expect((await list(o, b, 'permission')).body).toHaveLength(1);
    });
  });
});
