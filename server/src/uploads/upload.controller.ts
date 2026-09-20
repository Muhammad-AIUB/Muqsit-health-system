import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('uploads')
export class UploadController {
  constructor(private readonly uploads: UploadService) {}

  // Public on purpose: the pre-account registration flow uploads documents
  // (NID / certificate / profile picture) BEFORE any account exists, so a
  // JwtAuthGuard cannot be applied here. Abuse is bounded by the global
  // throttler plus the size limit and magic-byte content validation below.
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      // 8 MB, deliberately NOT lowered. compressImage() on the client falls back
      // to the ORIGINAL file whenever createImageBitmap throws (HEIC on most
      // desktop browsers), for GIFs (explicit pass-through), and whenever the
      // re-encode isn't smaller — and checkMagic below accepts heic/heif/avif on
      // purpose. iPhone report photos are routinely 3-8 MB, so a tighter ceiling
      // rejects real uploads. The hardening that matters is the magic-byte check,
      // not the last 3 MB.
      limits: { fileSize: 8 * 1024 * 1024 },
      // ⚠️ Deliberately NOT a MIME allowlist any more (2026-09-20). It used to
      // refuse anything whose Content-Type did not start with `image/`, which
      // threw away real uploads: a HEIC photo picked on Windows arrives as
      // `application/octet-stream`, and so does a `.tif` scan on a machine with
      // no MIME registration for it. The doctor was told "Only image files are
      // allowed" about their own photograph.
      //
      // Nothing is weakened by dropping it. The multipart Content-Type is
      // caller-supplied and was never evidence of anything — the check that
      // actually decides is `UploadService.sniff`, which reads the file's own
      // signature and is the only gate that can't be lied to. An empty
      // `Content-Type` filter plus a magic-byte check is strictly stronger than
      // a trusted-header filter plus the same check.
      fileFilter: (_req, _file, cb) => cb(null, true),
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = await this.uploads.uploadImage(file);
    return { url };
  }
}
