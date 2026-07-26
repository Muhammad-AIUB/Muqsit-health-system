import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

// Self-hosted file storage: files are written to <project>/uploads on
// this server's disk and served back by main.ts at /uploads/<name>.
// The DB only ever stores the generated URL.
@Injectable()
export class UploadService {
  private readonly dir = join(process.cwd(), 'uploads');

  constructor(private readonly config: ConfigService) {
    mkdirSync(this.dir, { recursive: true });
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    // Trust the actual bytes, not the caller-supplied multipart Content-Type.
    // Reject anything whose signature isn't a real JPEG/PNG/WEBP image.
    if (!this.checkMagic(file.buffer)) {
      throw new BadRequestException('File is not a valid JPEG, PNG or WEBP image');
    }
    const ext = this.safeExt(file);
    const name = `${randomUUID()}${ext}`;
    writeFileSync(join(this.dir, name), file.buffer);

    // On the VPS set PUBLIC_URL to the real domain (e.g. https://api.example.com).
    const base =
      this.config.get<string>('PUBLIC_URL') ??
      `http://localhost:${this.config.get<string>('PORT') ?? 4000}`;
    return `${base.replace(/\/$/, '')}/uploads/${name}`;
  }

  // Validate the real file signature (magic numbers) so a caller can't smuggle
  // arbitrary bytes past the MIME filter by setting Content-Type: image/*.
  // Covers the image formats the rest of the stack accepts (client accept=
  // "image/*", safeExt, compressImage): JPEG, PNG, WEBP, GIF, BMP, and the
  // ISO-BMFF 'ftyp' family (AVIF / HEIC / HEIF — common iPhone photos).
  private checkMagic(buf?: Buffer): boolean {
    if (!buf || buf.length < 12) return false;
    // JPEG (FF D8 FF)
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    // PNG (89 50 4E 47)
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
    // GIF ('GIF8')
    if (buf.toString('ascii', 0, 4) === 'GIF8') return true;
    // BMP ('BM')
    if (buf[0] === 0x42 && buf[1] === 0x4d) return true;
    // RIFF container — WEBP ('RIFF'....'WEBP')
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true;
    // ISO-BMFF ('....ftyp' then a brand): AVIF / HEIC / HEIF / MIF1.
    if (buf.toString('ascii', 4, 8) === 'ftyp') {
      const brand = buf.toString('ascii', 8, 12);
      if (['avif', 'avis', 'heic', 'heix', 'hevc', 'heif', 'mif1', 'msf1'].includes(brand)) return true;
    }
    return false;
  }

  // Derive a safe extension from the original name or mimetype.
  private safeExt(file: Express.Multer.File): string {
    const fromName = extname(file.originalname ?? '').toLowerCase();
    if (/^\.(jpe?g|png|webp|gif|bmp|avif)$/.test(fromName)) return fromName;
    const fromMime = (file.mimetype.split('/')[1] ?? '').toLowerCase();
    return /^[a-z0-9]+$/.test(fromMime) ? `.${fromMime === 'jpeg' ? 'jpg' : fromMime}` : '.jpg';
  }
}
