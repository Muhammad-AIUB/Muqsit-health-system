import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const cloud = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const key = this.config.get<string>('CLOUDINARY_API_KEY');
    const secret = this.config.get<string>('CLOUDINARY_API_SECRET');

    this.enabled = Boolean(cloud && key && secret);
    if (this.enabled) {
      cloudinary.config({
        cloud_name: cloud,
        api_key: key,
        api_secret: secret,
      });
    } else {
      this.logger.warn(
        'Cloudinary not configured — uploads will be returned as inline data URLs (dev fallback).',
      );
    }
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    if (!this.enabled) {
      // Dev fallback: return a data URL so the flow works without credentials.
      const base64 = file.buffer.toString('base64');
      return `data:${file.mimetype};base64,${base64}`;
    }

    return new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'medcare/registrations', resource_type: 'image' },
        (error, result) => {
          if (error || !result) {
            return reject(error ?? new Error('Upload failed'));
          }
          resolve(result.secure_url);
        },
      );
      stream.end(file.buffer);
    });
  }
}
