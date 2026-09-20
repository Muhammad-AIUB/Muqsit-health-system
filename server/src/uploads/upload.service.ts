import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

// A host only this machine can reach. The URL minted here is stored in the
// patient's record verbatim and opened by every other device that later reads
// it, so a local host is never a usable answer for anyone else.
const LOCAL_HOST = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0)$/i;

// ISO-BMFF brands meaning "a still image in a HEIF container". Kept in step
// with `client/src/lib/imageFormats.ts#HEIF_BRANDS`.
const HEIF_BRANDS = [
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'heif', 'mif1', 'msf1',
];

// Self-hosted file storage: files are written to <project>/uploads on
// this server's disk and served back by main.ts at /uploads/<name>.
// The DB only ever stores the generated URL.
@Injectable()
export class UploadService {
  private readonly dir = join(process.cwd(), 'uploads');
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly config: ConfigService) {
    mkdirSync(this.dir, { recursive: true });
    const why = this.unusableBase();
    if (why) {
      this.logger.error(
        `PUBLIC_URL is ${why} — image uploads are REFUSED. Every URL minted here ` +
          `is written into the shared production database, so an address no other ` +
          `device can open is a permanently broken image in a patient's record. ` +
          `Set PUBLIC_URL to the API's real https:// domain, or ` +
          `ALLOW_LOCALHOST_UPLOAD_URLS=true for a database that is genuinely local-only.`,
      );
    }
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    // Trust the actual bytes, not the caller-supplied multipart Content-Type.
    // The message names every format actually accepted: it used to say
    // "JPEG, PNG or WEBP" while the code also took GIF, BMP, AVIF and HEIC, so
    // a doctor whose upload failed was told to convert to something it would
    // have accepted anyway.
    const kind = this.sniff(file.buffer);
    if (!kind) {
      throw new BadRequestException(
        'That file is not an image this system can store. Accepted: JPEG, PNG, GIF, ' +
          'BMP, WEBP, AVIF, HEIC/HEIF and TIFF. (PDF and SVG are not images — a PDF ' +
          'report has to be saved or photographed as a picture first.)',
      );
    }

    // ⚕️ Refuse BEFORE the file is written, so a refused upload leaves nothing
    // on disk. The database is shared between local development and production
    // (dev reaches the live Postgres through an SSH tunnel — root CLAUDE.md), so
    // an image uploaded from a laptop lands in a doctor's real record carrying a
    // URL no other machine can open: the live site shows "Did not load" and the
    // console reads ERR_CONNECTION_REFUSED. It stayed invisible for months
    // because it looks perfect on the machine that created it. 274 images were
    // repaired this way on 2026-09-20 (scripts/repair-localhost-image-urls.js).
    // Failing loud here costs a developer one env line; failing silently costs a
    // doctor a patient's report.
    const why = this.unusableBase();
    if (why) {
      throw new ServiceUnavailableException(
        `Uploads are disabled: this server's public URL is ${why}, so the image ` +
          'would be saved with an address no other device can open. ' +
          'Set PUBLIC_URL (or ALLOW_LOCALHOST_UPLOAD_URLS=true for a local-only database).',
      );
    }

    const ext = this.safeExt(kind, file);
    const name = `${randomUUID()}${ext}`;
    writeFileSync(join(this.dir, name), file.buffer);

    return `${this.publicBase()}/uploads/${name}`;
  }

  // On the VPS set PUBLIC_URL to the real domain (e.g. https://api.example.com).
  // A blank value is treated as UNSET, not as an empty prefix: `??` only falls
  // back on null/undefined, so `PUBLIC_URL=""` used to mint the relative URL
  // `/uploads/<name>` — which resolves against whatever origin happens to read
  // it later, and is broken in a second, quieter way than localhost.
  private publicBase(): string {
    const raw = (this.config.get<string>('PUBLIC_URL') ?? '').trim();
    const base = raw || `http://localhost:${this.config.get<string>('PORT') ?? 4000}`;
    return base.replace(/\/+$/, '');
  }

  // Why this server must not mint a URL, or null when it may. Fails CLOSED on
  // anything it cannot positively read as a reachable absolute origin — a
  // typo'd PUBLIC_URL is stored just as permanently as a correct one.
  private unusableBase(): string | null {
    if (this.allowLocalBase()) return null;
    const base = this.publicBase();
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      return `not a valid URL (${base || 'empty'})`;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return `not an http(s) address (${base})`;
    }
    if (LOCAL_HOST.test(url.hostname)) return `a local address (${base})`;
    return null;
  }

  // The deliberate escape hatch, for a developer pointed at a database that is
  // genuinely their own. It is opt-in and never inferred: the tunnel makes the
  // production database look like `localhost:5432`, so the DATABASE_URL host
  // cannot tell a local database from the live one.
  private allowLocalBase(): boolean {
    return this.config.get<string>('ALLOW_LOCALHOST_UPLOAD_URLS') === 'true';
  }

  // The format of these bytes, read from the signature alone, or null.
  //
  // This is the ONE place the server decides what an upload is. It does not
  // trust the multipart Content-Type (a caller sets that freely) and it does not
  // trust the filename — iPhone photos routinely arrive as
  // `application/octet-stream`, and HEIC bytes under a `.jpg` name are ordinary.
  //
  // Mirrors `client/src/lib/imageFormats.ts#sniffImageKind`. The two are
  // deliberate copies — they fail at different moments, for different reasons —
  // and both are pinned by tests that share the same table of signatures.
  private sniff(buf?: Buffer): string | null {
    if (!buf || buf.length < 12) return null;
    // JPEG (FF D8 FF)
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
    // PNG (89 50 4E 47)
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    // GIF ('GIF8')
    if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
    // BMP ('BM')
    if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
    // RIFF container — WEBP ('RIFF'....'WEBP')
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      return 'webp';
    }
    // TIFF — 'II*\0' little-endian, 'MM\0*' big-endian. Most document scanners
    // produce it, and it was REJECTED here until 2026-09-20: a doctor picking
    // their own scan got "File is not a valid JPEG, PNG or WEBP image". The
    // client converts it to JPEG before upload, so one arriving here is a
    // browser that could not — accept it rather than lose the report.
    if (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) return 'tiff';
    if (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a) return 'tiff';
    // ISO-BMFF ('....ftyp' then a brand): AVIF, and the HEIF still-image family.
    if (buf.toString('ascii', 4, 8) === 'ftyp') {
      const brand = buf.toString('ascii', 8, 12);
      if (brand === 'avif' || brand === 'avis') return 'avif';
      // `hevx`/`heim`/`heis`/`hevm`/`hevs` were missing and are emitted by real
      // iPhones; a missing brand reads to the doctor as a corrupt photo.
      if (HEIF_BRANDS.includes(brand)) return 'heic';
    }
    return null;
  }

  // The extension the file is STORED under — and therefore the Content-Type
  // express.static will serve it with. Derived from the bytes, never from the
  // caller's filename or MIME.
  //
  // It used to prefer the filename and fall back to the MIME subtype, which put
  // HEIC bytes on disk as `.jpg` whenever the browser sent
  // `application/octet-stream` (common on Windows): served as `image/jpeg`, and
  // undrawable. A file's extension has to describe its CONTENT or the static
  // server lies about it.
  private safeExt(kind: string, file: Express.Multer.File): string {
    if (kind === 'jpeg') {
      // Keep the doctor's own spelling when it is already a JPEG extension —
      // 588 of the images on file are `.jpeg` and 240 are `.jpg`.
      const fromName = extname(file.originalname ?? '').toLowerCase();
      return fromName === '.jpeg' ? '.jpeg' : '.jpg';
    }
    if (kind === 'tiff') {
      const fromName = extname(file.originalname ?? '').toLowerCase();
      return fromName === '.tif' ? '.tif' : '.tiff';
    }
    return `.${kind}`;
  }
}
