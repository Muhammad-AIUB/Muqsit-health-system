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
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = await this.uploads.uploadImage(file);
    return { url };
  }
}
