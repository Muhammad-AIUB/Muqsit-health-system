import { existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createTestApp, TestApp } from './support/app';

// POST /api/uploads/image through the real HTTP pipeline (2026-10-16).
//
// Every clinical image reaches the record through this route — report photos,
// the ward's paper order sheets, the picture of each printed prescription —
// and it is PUBLIC (the registration flow uploads before an account exists).
// Until this spec nothing ran a real multipart request through it: the unit
// spec calls the service with a ready-made file. It holds the parser in front
// of it — multer, lifted to 2.4 under Nest 10 by package.json's `overrides`
// for its denial-of-service fixes — to three things: a real upload still
// works; a malformed request is refused as the CALLER's mistake (4xx, never
// 500) and writes nothing; and a text field, however its name is built, is
// refused before it is parsed (`limits.fields: 0`, upload.controller.ts).
//
// Files the API writes land in server/uploads/ (the test API may mint
// localhost URLs, test/support/env.ts); each one written here is removed.

const uploads = join(process.cwd(), 'uploads');
const listing = (): string[] =>
  existsSync(uploads) ? readdirSync(uploads) : [];

// The PNG signature is what the service's own format check reads
// (upload.service.ts#sniff); the bytes after it do not matter to it.
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

describe('POST /api/uploads/image', () => {
  let t: TestApp;
  let before: Set<string>;
  const written: string[] = [];
  const nothingWritten = () =>
    expect(
      listing().filter((f) => !before.has(f) && !written.includes(f)),
    ).toEqual([]);

  beforeAll(async () => {
    t = await createTestApp();
    before = new Set(listing());
  });

  afterAll(async () => {
    for (const name of written) rmSync(join(uploads, name), { force: true });
    await t.close();
  });

  const post = () => t.agent().post('/api/uploads/image');

  it('stores an image sent as `file` and answers its URL', async () => {
    const res = await post().attach('file', png, 'report.png');
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(
      /^http:\/\/localhost:4100\/uploads\/[0-9a-f-]{36}\.png$/,
    );
    const name = String(res.body.url).split('/').pop() as string;
    written.push(name);
    expect(existsSync(join(uploads, name))).toBe(true);
  });

  it('a file over 8 MB is 413 and nothing is written', async () => {
    const big = Buffer.concat([png, Buffer.alloc(8 * 1024 * 1024)]);
    const res = await post().attach('file', big, 'scan.png');
    expect(res.status).toBe(413);
    nothingWritten();
  });

  it('no file at all is 400', async () => {
    const res = await post();
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No file uploaded');
  });

  it('a file that is not an image is 400 and nothing is written', async () => {
    const res = await post().attach(
      'file',
      Buffer.from('not an image'),
      'note.txt',
    );
    expect(res.status).toBe(400);
    nothingWritten();
  });

  it('a file under another field name is 400, not 500, and nothing is written', async () => {
    const res = await post().attach('photo', png, 'report.png');
    expect(res.status).toBe(400);
    nothingWritten();
  });

  it('a text field is 400 and nothing is written — the route takes the file and nothing else', async () => {
    const res = await post()
      .field('note', 'hello')
      .attach('file', png, 'report.png');
    expect(res.status).toBe(400);
    nothingWritten();
  });

  it('a text field named to exhaust the parser is refused before it is parsed', async () => {
    const res = await post()
      .field('a' + '[x]'.repeat(5000) + '[999999999]', '1')
      .attach('file', png, 'report.png');
    expect(res.status).toBe(400);
    nothingWritten();
  });
});
