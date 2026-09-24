import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { execSync } from 'child_process';
import { join } from 'path';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/http/prisma-exception.filter';

// Build identifier sent on every response (X-App-Build) so a tab left open
// across a deploy can notice the API moved on and offer a reload. Git is
// present on the VPS (the deploy is a `git pull`); anywhere else the package
// version is enough.
function buildId(): string {
  if (process.env.APP_BUILD) return process.env.APP_BUILD;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return process.env.npm_package_version ?? 'dev';
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const build = buildId();

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
  // URI versioning with a version-neutral default: every existing route stays
  // at /api/... unchanged, and a future breaking change gets `@Version('2')` on
  // that one handler (→ /api/v2/...) instead of a new URL scheme for the app.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });
  app.use(cookieParser());

  // Same-origin check for state-changing requests, in front of every route.
  // Browsers always send `Origin` on a cross-site POST/PATCH/PUT/DELETE, so a
  // request with an Origin outside CORS_ORIGIN is a cross-site form or script,
  // never this app. SameSite=lax cookies already stop most of it; this closes
  // the gap when COOKIE_SAMESITE=none is needed (API and app on unrelated
  // domains). Requests with no Origin (curl, server-to-server) pass — they
  // carry no ambient cookie unless the caller chose to send one.
  const origins = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Cross-site request refused',
        error: 'Forbidden',
      });
    }
    next();
  });

  // Lightweight security headers (no extra dependency — helmet is not installed
  // and the deploy pipeline may not install new deps). Defense-in-depth against
  // MIME sniffing, clickjacking and referrer leakage; HSTS only in production.
  // No restrictive CSP here so the SPA and /uploads assets keep working.
  const isProd = config.get<string>('NODE_ENV') === 'production';
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (isProd) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=15552000; includeSubDomains',
      );
    }
    // ⚕️ Every API answer is `no-store` unless a route opts in with
    // @CacheControl (only the medicine formulary does). Clinic and ward PCs
    // are shared machines: a patient list must never be served from the disk
    // cache to the next person at the keyboard, or by a proxy to anyone.
    // /uploads is static and keeps its own immutable policy (below).
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-App-Build', build);
    next();
  });

  // Prisma errors become 409 / 404 / 503 with a message a clinician can act
  // on, instead of a bare 500 (see the filter for the exact mapping).
  app.useGlobalFilters(new PrismaExceptionFilter());

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
  // `exposedHeaders` lets the browser app READ these — without it fetch() hides
  // every non-simple response header, so the client could not honour
  // Retry-After on a 429, page with X-Next-Cursor, or notice a new build.
  app.enableCors({
    origin: origins,
    credentials: true,
    exposedHeaders: [
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Next-Cursor',
      'X-App-Build',
      'Idempotency-Replayed',
    ],
  });

  // OpenAPI document at /api/docs, generated from the controllers and DTOs by
  // the @nestjs/swagger CLI plugin (nest-cli.json) — no per-DTO decorators.
  // Off in production unless SWAGGER=true: the schema of a medical API is not
  // something to publish by default. docs/API.md stays the human reference.
  if (!isProd || config.get<string>('SWAGGER') === 'true') {
    const openapi = new DocumentBuilder()
      .setTitle('Muqsit Health System API')
      .setDescription(
        'Doctor-scoped REST API. Every patient-data route is scoped by the X-Workstation header — see docs/API.md §3.',
      )
      .setVersion(build)
      .addCookieAuth('mhs_at')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openapi));
  }

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
