import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { MailService } from '../../src/mail/mail.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FakeMailService, noThrottleStorage } from './doubles';
import { assertTestDatabase, assertTestDbUrl } from './test-db';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  mail: FakeMailService;
  // A fresh cookie jar per call — one per simulated browser.
  agent(): ReturnType<typeof request.agent>;
  close(): Promise<void>;
}

// The real AppModule behind the real HTTP pipeline (configureApp), with two
// substitutions: mail is captured, and — unless `throttle: true` — the rate
// limiter does not count.
export async function createTestApp(
  opts: { throttle?: boolean } = {},
): Promise<TestApp> {
  assertTestDbUrl(process.env.DATABASE_URL);

  const mail = new FakeMailService();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail);
  if (!opts.throttle) {
    builder = builder.overrideProvider(ThrottlerStorage).useValue(noThrottleStorage);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: ['error'],
  });
  configureApp(app, app.get(ConfigService));
  await app.init();

  const prisma = app.get(PrismaService);
  await assertTestDatabase(prisma);

  return {
    app,
    prisma,
    mail,
    agent: () => request.agent(app.getHttpServer()),
    close: () => app.close(),
  };
}
