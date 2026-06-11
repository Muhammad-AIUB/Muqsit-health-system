import { Injectable } from '@nestjs/common';
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
    const ext = this.safeExt(file);
    const name = `${randomUUID()}${ext}`;
    writeFileSync(join(this.dir, name), file.buffer);

    // On the VPS set PUBLIC_URL to the real domain (e.g. https://api.example.com).
    const base =
      this.config.get<string>('PUBLIC_URL') ??
      `http://localhost:${this.config.get<string>('PORT') ?? 4000}`;
    return `${base.replace(/\/$/, '')}/uploads/${name}`;
  }

  // Derive a safe extension from the original name or mimetype.
  private safeExt(file: Express.Multer.File): string {
    const fromName = extname(file.originalname ?? '').toLowerCase();
    if (/^\.(jpe?g|png|webp|gif|bmp|avif)$/.test(fromName)) return fromName;
    const fromMime = (file.mimetype.split('/')[1] ?? '').toLowerCase();
    return /^[a-z0-9]+$/.test(fromMime) ? `.${fromMime === 'jpeg' ? 'jpg' : fromMime}` : '.jpg';
  }
}
