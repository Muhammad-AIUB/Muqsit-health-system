import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Fail fast if a real secret isn't configured in production. A leaked or
  // guessable JWT_SECRET lets anyone forge tokens for any user.
  const jwtSecret = config.get<string>('JWT_SECRET');
  if (
    config.get<string>('NODE_ENV') === 'production' &&
    (!jwtSecret || jwtSecret === 'dev-secret' || jwtSecret.length < 32)
  ) {
    throw new Error(
      'JWT_SECRET must be set to a random string of at least 32 characters in production',
    );
  }

  // Trust the first proxy hop so req.ip reflects the real client address
  // (matters for rate limiting and audit logging behind a reverse proxy).
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Prescription drafts and rich-text layouts can carry sizeable JSON, so lift
  // the body limit well above the ~100 kB express default.
  app.useBodyParser('json', { limit: '8mb' });
  app.useBodyParser('urlencoded', { limit: '8mb', extended: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // Serve uploaded files (NID images, certificates, profile pictures)
  // straight from disk at /uploads/<filename>.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  const origins = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
}
bootstrap();
