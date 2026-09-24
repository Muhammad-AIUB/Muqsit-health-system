import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

// Dependency-injection boot check. `npx tsc --noEmit` is green for a guard or
// interceptor whose provider is missing from its module — Nest only finds out
// at start-up, and in production that is a pm2 crash-loop (server/CLAUDE.md,
// "Typecheck is not enough for a new guarded module"). Compiling the whole
// module graph here resolves every provider without opening a DB connection
// (`compile()` does not run onModuleInit).
describe('AppModule', () => {
  it('resolves every provider (guards, interceptors, filters) without starting the app', async () => {
    process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-for-the-check';
    process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/z';
    process.env.DIRECT_URL ??= process.env.DATABASE_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 30_000);
});
