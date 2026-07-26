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
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB — reject oversize with a clean 400
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
