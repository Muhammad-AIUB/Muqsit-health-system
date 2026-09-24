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

  // Lightweight security headers (no extra dependency — helmet is not installed
  // and the deploy pipeline may not install new deps). Defense-in-depth against
  // MIME sniffing, clickjacking and referrer leakage; HSTS only in production.
  // No restrictive CSP here so the SPA and /uploads assets keep working.
  const isProd = config.get<string>('NODE_ENV') === 'production';
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (isProd) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=15552000; includeSubDomains',
      );
    }
    next();
  });

  // Prescription drafts and rich-text layouts can carry sizeable JSON, so lift
  // the body limit well above the ~100 kB express default.
  app.useBodyParser('json', { limit: '8mb' });
  app.useBodyParser('urlencoded', { limit: '8mb', extended: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // CORS is registered BEFORE the static /uploads handler, deliberately.
  // express.static answers a file itself and never calls next(), so with CORS
  // registered after it every real image went out with no
  // Access-Control-Allow-Origin — only 404s got one. The galleries' "Download
  // PDF" (client lib/galleryPdf.ts) has to READ the image bytes, which the
  // browser refuses cross-origin without the header. Only the app's own
  // origins are allowed, exactly as for the API; <img> tags are unaffected.
  const origins = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  // Serve uploaded files (NID images, certificates, profile pictures)
  // straight from disk at /uploads/<filename>.
  //
  // ⚕️ Cached for a year, immutably, and that is a correctness fix rather than
  // a speed tweak. express.static's default is `Cache-Control: public,
  // max-age=0`, which caches the bytes but makes the browser REVALIDATE every
  // one of them on every use. A patient records page carries dozens of images
  // (48 on a real record), the API origin is HTTP/1.1, so those revalidations
  // queue six at a time behind the app's own API calls and the SSE mirror
  // stream — every tile sits blank until its round trip returns, and one
  // request dropped on a clinic connection leaves that tile blank until the
  // whole page is reloaded.
  //
  // `immutable` is true of these files, not a hopeful assertion: every upload
  // is written under a fresh `randomUUID()` name (upload.service.ts) and no
  // path in the app ever rewrites one. A changed image is a new URL, so a
  // stale cache entry cannot show a doctor the wrong page.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    maxAge: '365d',
    immutable: true,
  });

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
}
bootstrap();
