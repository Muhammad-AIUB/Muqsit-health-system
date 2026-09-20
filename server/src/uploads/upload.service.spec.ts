import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadService } from './upload.service';

// ⚕️ REGRESSION SPEC — 2026-09-20.
//
// `uploadImage` stamps an ABSOLUTE URL into the patient's record, and the
// database is shared between local development and production. For months every
// image uploaded from a developer's laptop was written into doctors' real
// records as `http://localhost:4000/uploads/…` — unopenable from anywhere else,
// so the live site showed "Did not load" and the console read
// ERR_CONNECTION_REFUSED. 274 files had to be recovered by hand.
//
// These tests pin the guard that makes that impossible to repeat. If one goes
// red, the live site is one deploy away from silently collecting broken images
// again.

// A 1x1 JPEG header is enough for checkMagic; the bytes past it are irrelevant.
const jpeg = (): Express.Multer.File =>
  ({
    buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]),
    originalname: 'report.jpg',
    mimetype: 'image/jpeg',
  }) as unknown as Express.Multer.File;

const config = (env: Record<string, string | undefined>): ConfigService =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

describe('UploadService — public URL guard', () => {
  let cwd: string;
  let dir: string;

  beforeEach(() => {
    // The service writes to `<cwd>/uploads`, so run it somewhere disposable.
    dir = mkdtempSync(join(tmpdir(), 'mhs-upload-'));
    cwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  const uploadsDir = () => join(dir, 'uploads');

  it('mints a URL on the configured public origin', async () => {
    const svc = new UploadService(config({ PUBLIC_URL: 'https://api.example.com' }));
    const url = await svc.uploadImage(jpeg());
    expect(url).toMatch(/^https:\/\/api\.example\.com\/uploads\/[0-9a-f-]+\.jpg$/);
  });

  it('drops a trailing slash on PUBLIC_URL rather than doubling it', async () => {
    const svc = new UploadService(config({ PUBLIC_URL: 'https://api.example.com/' }));
    const url = await svc.uploadImage(jpeg());
    expect(url).not.toContain('//uploads/');
    expect(url).toContain('https://api.example.com/uploads/');
  });

  it.each([
    ['unset PUBLIC_URL', {}],
    ['localhost', { PUBLIC_URL: 'http://localhost:4000' }],
    ['127.0.0.1', { PUBLIC_URL: 'http://127.0.0.1:4000' }],
    ['another 127.x loopback', { PUBLIC_URL: 'http://127.1.2.3:4000' }],
    ['0.0.0.0', { PUBLIC_URL: 'http://0.0.0.0:4000' }],
    ['IPv6 loopback', { PUBLIC_URL: 'http://[::1]:4000' }],
    ['a bare localhost with no port', { PUBLIC_URL: 'http://localhost' }],
    ['https on localhost', { PUBLIC_URL: 'https://localhost:4000' }],
    ['LOCALHOST in capitals', { PUBLIC_URL: 'http://LOCALHOST:4000' }],
  ])('refuses the upload when the public origin is %s', async (_label, env) => {
    const svc = new UploadService(config(env));
    await expect(svc.uploadImage(jpeg())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  // A PUBLIC_URL that is merely WRONG is stored just as permanently as one that
  // is localhost, so the guard fails closed on anything it cannot positively
  // read as a reachable absolute origin.
  it.each([
    ['empty', { PUBLIC_URL: '' }],
    ['whitespace', { PUBLIC_URL: '   ' }],
    ['no scheme', { PUBLIC_URL: 'api.muqsithealthsystem.com' }],
    ['a bare path', { PUBLIC_URL: '/uploads' }],
    ['a non-http scheme', { PUBLIC_URL: 'ftp://api.example.com' }],
    ['nonsense', { PUBLIC_URL: 'not a url at all' }],
  ])('refuses the upload when PUBLIC_URL is %s', async (_label, env) => {
    const svc = new UploadService(config(env));
    await expect(svc.uploadImage(jpeg())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  // The specific trap: `??` only falls back on null/undefined, so a blank
  // PUBLIC_URL used to mint the RELATIVE url `/uploads/<name>` — which resolves
  // against whatever origin happens to read it later. Broken more quietly than
  // localhost, and it would have slipped straight past a localhost-only check.
  it('never mints a relative URL', async () => {
    for (const v of ['', '   ']) {
      const svc = new UploadService(config({ PUBLIC_URL: v }));
      await expect(svc.uploadImage(jpeg())).rejects.toThrow();
    }
    expect(existsSync(uploadsDir()) ? readdirSync(uploadsDir()) : []).toHaveLength(0);
  });

  it('accepts a real domain on either scheme, and a port', async () => {
    for (const base of [
      'https://api.muqsithealthsystem.com',
      'http://api.muqsithealthsystem.com',
      'https://api.muqsithealthsystem.com:8443',
      'https://192.168.1.50:4000', // a LAN address is reachable by other devices
    ]) {
      const svc = new UploadService(config({ PUBLIC_URL: base }));
      await expect(svc.uploadImage(jpeg())).resolves.toContain(`${base}/uploads/`);
    }
  });

  it('writes NOTHING to disk when it refuses', async () => {
    const svc = new UploadService(config({ PUBLIC_URL: 'http://localhost:4000' }));
    await expect(svc.uploadImage(jpeg())).rejects.toThrow();
    // A refused upload that still left the file behind would grow an orphan on
    // every attempt, with nothing in the record pointing at it.
    expect(existsSync(uploadsDir()) ? readdirSync(uploadsDir()) : []).toHaveLength(0);
  });

  it('allows localhost only when explicitly opted in', async () => {
    const svc = new UploadService(
      config({ PUBLIC_URL: 'http://localhost:4000', ALLOW_LOCALHOST_UPLOAD_URLS: 'true' }),
    );
    const url = await svc.uploadImage(jpeg());
    expect(url).toContain('http://localhost:4000/uploads/');
  });

  it('treats any value other than the exact string "true" as NOT opted in', async () => {
    // A half-set flag ("1", "yes", "TRUE") must fail closed — the cost of a
    // false negative here is a broken image in a patient's permanent record.
    for (const v of ['1', 'yes', 'TRUE', 'on', '']) {
      const svc = new UploadService(
        config({ PUBLIC_URL: 'http://localhost:4000', ALLOW_LOCALHOST_UPLOAD_URLS: v }),
      );
      await expect(svc.uploadImage(jpeg())).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });

  it('still rejects a non-image before it looks at the origin at all', async () => {
    const svc = new UploadService(config({ PUBLIC_URL: 'https://api.example.com' }));
    const notAnImage = {
      buffer: Buffer.from('<?php echo 1; ?>                '),
      originalname: 'x.jpg',
      mimetype: 'image/jpeg',
    } as unknown as Express.Multer.File;
    await expect(svc.uploadImage(notAnImage)).rejects.toThrow(/not an image this system can store/);
  });
});

// ⚕️ THE FORMAT TABLE — the server half.
//
// These literals mirror `client/src/lib/imageFormats.test.ts`. The two sides are
// deliberate copies of one table (the client converts before upload, the server
// is the final word on what may be stored), and a format accepted on one side
// and refused on the other is how a doctor's report gets rejected on one screen
// and filed on another. Edit one, edit both.
describe('UploadService — which image formats may be stored', () => {
  let cwd: string;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mhs-fmt-'));
    cwd = process.cwd();
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  const svc = () => new UploadService(config({ PUBLIC_URL: 'https://api.example.com' }));
  const buf = (b: number[], len = 32) => Buffer.concat([Buffer.from(b), Buffer.alloc(Math.max(0, len - b.length))]);
  const str = (s: string, len = 32) => Buffer.concat([Buffer.from(s, 'ascii'), Buffer.alloc(Math.max(0, len - s.length))]);
  const ftyp = (brand: string) =>
    Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand), Buffer.alloc(20)]);
  const file = (buffer: Buffer, originalname: string, mimetype = '') =>
    ({ buffer, originalname, mimetype }) as unknown as Express.Multer.File;

  const RIFF_WEBP = (() => {
    const o = Buffer.alloc(32);
    o.write('RIFF', 0, 'ascii');
    o.write('WEBP', 8, 'ascii');
    return o;
  })();

  // [label, bytes, uploaded filename, declared mimetype, expected stored extension]
  const ACCEPTED: Array<[string, Buffer, string, string, string]> = [
    ['JPEG', buf([0xff, 0xd8, 0xff, 0xe0]), 'photo.jpg', 'image/jpeg', '.jpg'],
    ['JPEG keeping a .jpeg name', buf([0xff, 0xd8, 0xff, 0xe0]), 'photo.jpeg', 'image/jpeg', '.jpeg'],
    ['PNG', buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'x.png', 'image/png', '.png'],
    ['GIF87a', str('GIF87a'), 'x.gif', 'image/gif', '.gif'],
    ['GIF89a', str('GIF89a'), 'x.gif', 'image/gif', '.gif'],
    ['BMP', buf([0x42, 0x4d]), 'x.bmp', 'image/bmp', '.bmp'],
    ['WEBP', RIFF_WEBP, 'x.webp', 'image/webp', '.webp'],
    ['AVIF', ftyp('avif'), 'x.avif', 'image/avif', '.avif'],
    ['TIFF little-endian', buf([0x49, 0x49, 0x2a, 0x00]), 'scan.tiff', 'image/tiff', '.tiff'],
    ['TIFF keeping a .tif name', buf([0x49, 0x49, 0x2a, 0x00]), 'scan.tif', 'image/tiff', '.tif'],
    ['TIFF big-endian', buf([0x4d, 0x4d, 0x00, 0x2a]), 'scan.tiff', 'image/tiff', '.tiff'],
    ['HEIC', ftyp('heic'), 'IMG_1.HEIC', 'image/heic', '.heic'],
  ];

  it.each(ACCEPTED)('stores %s as %s', async (_label, bytes, name, mime, ext) => {
    const url = await svc().uploadImage(file(bytes, name, mime));
    expect(url.endsWith(ext)).toBe(true);
  });

  // TIFF was REJECTED until 2026-09-20 — most document scanners produce it, and
  // a doctor picking their own scan was told it was not a valid image.
  it('accepts a TIFF scan, which it used to refuse outright', async () => {
    await expect(svc().uploadImage(file(buf([0x49, 0x49, 0x2a, 0x00]), 'report.tif', 'image/tiff')))
      .resolves.toContain('/uploads/');
  });

  it.each(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'heif', 'mif1', 'msf1'])(
    'accepts the HEIF brand %s that a real iPhone emits',
    async (brand) => {
      // hevx/heim/heis/hevm/hevs were missing; a photo in one read as corrupt.
      await expect(svc().uploadImage(file(ftyp(brand), 'IMG.HEIC', 'image/heic'))).resolves.toContain('.heic');
    },
  );

  // ⚕️ The extension decides the Content-Type express.static serves the file
  // with. Deriving it from the caller's filename put HEIC bytes on disk as .jpg
  // whenever the browser sent application/octet-stream — served as image/jpeg,
  // and undrawable by anything.
  it('names the file after its CONTENT, never the uploaded filename', async () => {
    const url = await svc().uploadImage(file(ftyp('heic'), 'photo.jpg', 'image/jpeg'));
    expect(url.endsWith('.heic')).toBe(true);
    expect(url.endsWith('.jpg')).toBe(false);
  });

  it('names a PNG .png even when the browser sent octet-stream and a junk name', async () => {
    const png = buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const url = await svc().uploadImage(file(png, 'blob', 'application/octet-stream'));
    expect(url.endsWith('.png')).toBe(true);
  });

  // The multer MIME filter used to refuse these outright. A HEIC picked on
  // Windows really does arrive as application/octet-stream.
  it('accepts a real image whose declared mimetype is octet-stream or empty', async () => {
    for (const mime of ['application/octet-stream', '']) {
      await expect(svc().uploadImage(file(ftyp('heic'), 'IMG_1.HEIC', mime))).resolves.toContain('.heic');
    }
  });

  // ⚕️ SVG is a script-bearing document and this app renders stored images
  // inline. Refusing it is a security boundary, not a format gap.
  it('refuses SVG however it is labelled', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    for (const [name, mime] of [['x.svg', 'image/svg+xml'], ['x.png', 'image/png'], ['x.jpg', 'image/jpeg']]) {
      await expect(svc().uploadImage(file(svg, name, mime))).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it.each([
    ['PDF', buf([0x25, 0x50, 0x44, 0x46, 0x2d])],
    ['ZIP / docx', buf([0x50, 0x4b, 0x03, 0x04])],
    ['Windows executable', buf([0x4d, 0x5a, 0x90, 0x00])],
    ['a shell script', str('#!/bin/sh\nrm -rf /')],
    ['an MP4 video', ftyp('mp42')],
  ])('refuses %s even when it claims to be image/jpeg', async (_label, bytes) => {
    await expect(svc().uploadImage(file(bytes, 'x.jpg', 'image/jpeg'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('names every accepted format in its rejection message', async () => {
    // A doctor told "convert it to JPEG, PNG or WEBP" about a GIF the system
    // would have taken is being sent to do work for nothing.
    await expect(svc().uploadImage(file(buf([0x25, 0x50, 0x44, 0x46]), 'x.pdf', 'application/pdf')))
      .rejects.toThrow(/JPEG.*PNG.*GIF.*BMP.*WEBP.*AVIF.*HEIC.*TIFF/s);
  });

  it('writes nothing to disk for a refused format', async () => {
    await expect(svc().uploadImage(file(buf([0x25, 0x50, 0x44, 0x46]), 'x.pdf', 'application/pdf'))).rejects.toThrow();
    const up = join(dir, 'uploads');
    expect(existsSync(up) ? readdirSync(up) : []).toHaveLength(0);
  });
});
