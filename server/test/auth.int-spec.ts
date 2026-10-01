import { createHash } from 'crypto';
import type { Response } from 'supertest';
import { createTestApp, TestApp } from './support/app';
import { makeDoctor, TEST_PASSWORD } from './support/fixtures';
import { resetDb } from './support/test-db';

// The browser the refresh token is minted for. The rotation grace window is
// bound to it (auth.service.ts#refresh, `sameClient`), and supertest sends no
// User-Agent of its own, so every request here names one explicitly.
const UA = 'muqsit-int-test-browser/1.0';
const OTHER_UA = 'muqsit-int-test-other-browser/1.0';

interface ParsedCookie {
  name: string;
  value: string;
  attrs: Record<string, string | true>;
}

function cookiesOf(res: Response): ParsedCookie[] {
  const raw = (res.headers['set-cookie'] ?? []) as unknown as string[];
  return raw.map((line) => {
    const [pair, ...rest] = line.split(';').map((s) => s.trim());
    const eq = pair.indexOf('=');
    const attrs: Record<string, string | true> = {};
    for (const a of rest) {
      const i = a.indexOf('=');
      if (i === -1) attrs[a.toLowerCase()] = true;
      else attrs[a.slice(0, i).toLowerCase()] = a.slice(i + 1);
    }
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attrs };
  });
}

const cookie = (res: Response, name: string) => cookiesOf(res).find((c) => c.name === name);

// Same derivation as auth.service.ts#hashToken — how a raw cookie value is
// matched to its RefreshToken row.
const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

let phoneSeq = 0;
function registerBody(email: string) {
  phoneSeq += 1;
  return {
    name: 'Test Registrant',
    email,
    mobile: `018${String(10000000 + phoneSeq).slice(-8)}`,
    profession: 'doctor',
    registrationNo: 'TEST-REG-1',
    nidNo: 'TEST-NID-1',
    designation: 'Test designation',
    specialty: 'Test specialty',
    password: TEST_PASSWORD,
    registrationCertUrl: 'http://localhost:4100/uploads/test-cert.png',
    nidFrontUrl: 'http://localhost:4100/uploads/test-nid-front.png',
    nidBackUrl: 'http://localhost:4100/uploads/test-nid-back.png',
    profilePictureUrl: 'http://localhost:4100/uploads/test-picture.png',
  };
}

let emailSeq = 0;
const freshEmail = (tag: string) => {
  emailSeq += 1;
  return `${tag}${emailSeq}.${Date.now()}@test.invalid`;
};

describe('auth', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  const login = (identifier: string, password = TEST_PASSWORD, ua: string | null = UA) => {
    const req = t.agent().post('/api/auth/login');
    if (ua) req.set('User-Agent', ua);
    return req.send({ identifier, password });
  };

  const refreshWith = (rawRefresh: string, ua: string | null = UA) => {
    const req = t.agent().post('/api/auth/refresh').set('Cookie', `mhs_rt=${rawRefresh}`);
    if (ua) req.set('User-Agent', ua);
    return req.send();
  };

  const tokenRow = (raw: string) =>
    t.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });

  // Signs an approved doctor in and returns the raw refresh/access values.
  async function session() {
    const doctor = await makeDoctor(t.prisma);
    const res = await login(doctor.email);
    expect(res.status).toBe(200);
    return {
      doctor,
      refresh: cookie(res, 'mhs_rt')!.value,
      access: cookie(res, 'mhs_at')!.value,
    };
  }

  describe('registration → verification → approval → session', () => {
    it('walks a new account from sign-up to a working session', async () => {
      const email = freshEmail('register');

      const reg = await t.agent().post('/api/auth/register').send(registerBody(email));
      expect(reg.status).toBe(201);
      expect(reg.body.email).toBe(email);

      const created = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(created.emailVerified).toBe(false);
      expect(created.approvalStatus).toBe('pending');
      expect(created.accountTier).toBe('secondary');
      // The password is never stored as typed.
      expect(created.passwordHash).not.toContain(TEST_PASSWORD);

      // Not verified yet → no session.
      const early = await login(email);
      expect(early.status).toBe(403);
      expect(cookiesOf(early)).toHaveLength(0);

      const otp = await t.mail.waitForOtp(email);
      expect(otp).toMatch(/^\d{6}$/);
      const verify = await t.agent().post('/api/auth/verify-email').send({ email, otp });
      expect(verify.status).toBe(201);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true);

      // Verified but still awaiting admin approval → refused, no cookies.
      const pending = await login(email);
      expect(pending.status).toBe(403);
      expect(pending.body.message).toMatch(/awaiting admin approval/i);
      expect(cookiesOf(pending)).toHaveLength(0);
      expect(await t.prisma.refreshToken.count({ where: { userId: created.id } })).toBe(0);

      await t.prisma.user.update({ where: { id: created.id }, data: { approvalStatus: 'approved' } });

      const ok = await login(email);
      expect(ok.status).toBe(200);
      expect(ok.body.user).toMatchObject({ id: created.id, email, accountTier: 'secondary' });
      expect(ok.body.user.passwordHash).toBeUndefined();

      const at = cookie(ok, 'mhs_at');
      const rt = cookie(ok, 'mhs_rt');
      expect(at).toBeDefined();
      expect(rt).toBeDefined();
      expect(at!.attrs.httponly).toBe(true);
      expect(rt!.attrs.httponly).toBe(true);
      expect(at!.attrs.path).toBe('/');
      expect(rt!.attrs.path).toBe('/api/auth');
      // The raw refresh value is never what is stored.
      const row = await tokenRow(rt!.value);
      expect(row).toMatchObject({ userId: created.id, revokedAt: null });
      expect(await t.prisma.refreshToken.count({ where: { tokenHash: rt!.value } })).toBe(0);

      const me = await t.agent().get('/api/auth/me').set('Cookie', `mhs_at=${at!.value}`);
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ id: created.id, email });
    });

    it('scopes the refresh cookie so a browser sends it only to /api/auth', async () => {
      const doctor = await makeDoctor(t.prisma);
      const browser = t.agent();
      const res = await browser
        .post('/api/auth/login')
        .set('User-Agent', UA)
        .send({ identifier: doctor.email, password: TEST_PASSWORD });
      expect(res.status).toBe(200);

      // The cookie jar holds both; /auth/me works off the access cookie and
      // /auth/refresh off the refresh cookie the jar attaches by path.
      expect((await browser.get('/api/auth/me')).status).toBe(200);
      const refreshed = await browser.post('/api/auth/refresh').set('User-Agent', UA).send();
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.user.id).toBe(doctor.id);
    });

    it('rejects a wrong code with 400 and leaves the account unverified', async () => {
      const email = freshEmail('wrongotp');
      await t.agent().post('/api/auth/register').send(registerBody(email)).expect(201);
      const otp = await t.mail.waitForOtp(email);
      const wrong = otp === '111111' ? '222222' : '111111';

      const res = await t.agent().post('/api/auth/verify-email').send({ email, otp: wrong });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Incorrect code.');
      expect((await t.prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(false);

      // A malformed code never reaches the comparison (and costs no attempt).
      const malformed = await t.agent().post('/api/auth/verify-email').send({ email, otp: '12ab' });
      expect(malformed.status).toBe(400);
      const record = await t.prisma.emailOtp.findFirstOrThrow({ where: { email, consumed: false } });
      expect(record.attempts).toBe(1);

      // The real code still works after one miss.
      const ok = await t.agent().post('/api/auth/verify-email').send({ email, otp });
      expect(ok.status).toBe(201);
    });

    it('locks the code after 5 wrong attempts — even the right code is then refused', async () => {
      const email = freshEmail('lockotp');
      await t.agent().post('/api/auth/register').send(registerBody(email)).expect(201);
      const otp = await t.mail.waitForOtp(email);
      const wrong = otp === '111111' ? '222222' : '111111';

      for (let i = 0; i < 5; i += 1) {
        const res = await t.agent().post('/api/auth/verify-email').send({ email, otp: wrong });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Incorrect code.');
      }

      const locked = await t.agent().post('/api/auth/verify-email').send({ email, otp });
      expect(locked.status).toBe(400);
      expect(locked.body.message).toMatch(/too many attempts/i);

      const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerified).toBe(false);
      const record = await t.prisma.emailOtp.findFirstOrThrow({ where: { email, consumed: false } });
      expect(record.attempts).toBe(5);
    });
  });

  describe('login refusals', () => {
    it('answers a wrong password and an unknown identifier identically (401)', async () => {
      const doctor = await makeDoctor(t.prisma);

      const wrongPassword = await login(doctor.email, 'Wrong-Passw0rd!');
      const unknown = await login(freshEmail('nobody'), TEST_PASSWORD);

      expect(wrongPassword.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(unknown.body).toEqual(wrongPassword.body);
      expect(wrongPassword.body.message).toBe(unknown.body.message);
      expect(cookiesOf(wrongPassword)).toHaveLength(0);
      expect(cookiesOf(unknown)).toHaveLength(0);
      expect(await t.prisma.refreshToken.count({ where: { userId: doctor.id } })).toBe(0);
    });

    it.each([
      ['soft-deleted', { deletedAt: new Date('2026-01-01T00:00:00.000Z') }],
      ['suspended', { approvalStatus: 'suspended' }],
      ['rejected', { approvalStatus: 'rejected' }],
      ['pending', { approvalStatus: 'pending' }],
      ['unverified', { emailVerified: false }],
    ])('a %s account cannot log in, by email or by mobile', async (_label, state) => {
      const doctor = await makeDoctor(t.prisma, state as never);

      for (const identifier of [doctor.email, doctor.mobile as string]) {
        const res = await login(identifier);
        expect(res.status).toBe(403);
        expect(cookiesOf(res)).toHaveLength(0);
      }
      expect(await t.prisma.refreshToken.count({ where: { userId: doctor.id } })).toBe(0);
    });

    it.each([
      ['soft-deleted', { deletedAt: new Date('2026-01-01T00:00:00.000Z') }],
      ['suspended', { approvalStatus: 'suspended' }],
      ['rejected', { approvalStatus: 'rejected' }],
    ])('an already-issued access token stops working once the account is %s', async (_label, state) => {
      const { doctor, access } = await session();
      const before = await t.agent().get('/api/auth/me').set('Cookie', `mhs_at=${access}`);
      expect(before.status).toBe(200);

      await t.prisma.user.update({ where: { id: doctor.id }, data: state as never });

      const after = await t.agent().get('/api/auth/me').set('Cookie', `mhs_at=${access}`);
      expect(after.status).toBe(401);
    });

    it('answers 401 with no cookie, a garbage cookie, and a refresh with no token', async () => {
      expect((await t.agent().get('/api/auth/me')).status).toBe(401);
      expect((await t.agent().get('/api/auth/me').set('Cookie', 'mhs_at=not-a-jwt')).status).toBe(401);
      expect((await t.agent().post('/api/auth/refresh').send()).status).toBe(401);
      expect((await refreshWith('never-issued-token')).status).toBe(401);
    });
  });

  describe('refresh rotation', () => {
    it('rotates: a new refresh cookie, the old row revoked, the successor live in the same family', async () => {
      const { doctor, refresh: rt1 } = await session();

      const res = await refreshWith(rt1);
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(doctor.id);
      expect(res.body.user.accountTier).toBe('primary');

      const rt2 = cookie(res, 'mhs_rt');
      expect(rt2).toBeDefined();
      expect(rt2!.value).not.toBe(rt1);
      expect(rt2!.attrs.httponly).toBe(true);
      expect(rt2!.attrs.path).toBe('/api/auth');
      expect(cookie(res, 'mhs_at')!.attrs.httponly).toBe(true);

      const oldRow = await tokenRow(rt1);
      const newRow = await tokenRow(rt2!.value);
      expect(oldRow!.revokedAt).not.toBeNull();
      expect(newRow!.revokedAt).toBeNull();
      expect(newRow!.family).toBe(oldRow!.family);
      expect(newRow!.userId).toBe(doctor.id);

      // The new access cookie is a working session.
      const me = await t
        .agent()
        .get('/api/auth/me')
        .set('Cookie', `mhs_at=${cookie(res, 'mhs_at')!.value}`);
      expect(me.status).toBe(200);
    });

    it('replay of the old token AFTER the grace window revokes the whole family (401)', async () => {
      const { refresh: rt1 } = await session();
      const rotated = await refreshWith(rt1);
      expect(rotated.status).toBe(200);
      const rt2 = cookie(rotated, 'mhs_rt')!.value;

      // Age the revocation instead of sleeping through the window.
      await t.prisma.refreshToken.update({
        where: { tokenHash: hashToken(rt1) },
        data: { revokedAt: new Date(Date.now() - 10 * 60 * 1000) },
      });

      const replay = await refreshWith(rt1);
      expect(replay.status).toBe(401);
      expect(cookie(replay, 'mhs_rt')).toBeUndefined();
      expect(cookie(replay, 'mhs_at')).toBeUndefined();

      const family = (await tokenRow(rt1))!.family;
      const live = await t.prisma.refreshToken.count({ where: { family, revokedAt: null } });
      expect(live).toBe(0);

      // The legitimate holder of the successor is logged out too.
      const successor = await refreshWith(rt2);
      expect(successor.status).toBe(401);
    });

    it('replay INSIDE the grace window from the same User-Agent is a benign race and succeeds', async () => {
      const { doctor, refresh: rt1 } = await session();
      const rotated = await refreshWith(rt1);
      expect(rotated.status).toBe(200);
      const rt2 = cookie(rotated, 'mhs_rt')!.value;

      // Pin the revocation to "just now" so the assertion does not depend on
      // how long the previous request took on a slow machine.
      await t.prisma.refreshToken.update({
        where: { tokenHash: hashToken(rt1) },
        data: { revokedAt: new Date() },
      });

      const race = await refreshWith(rt1);
      expect(race.status).toBe(200);
      expect(race.body.user.id).toBe(doctor.id);
      const rt3 = cookie(race, 'mhs_rt')!.value;
      expect(rt3).not.toBe(rt1);
      expect(rt3).not.toBe(rt2);

      // Nobody was logged out: the first successor and the race's token are
      // both live, in the same family.
      const [row2, row3] = await Promise.all([tokenRow(rt2), tokenRow(rt3)]);
      expect(row2!.revokedAt).toBeNull();
      expect(row3!.revokedAt).toBeNull();
      expect(row3!.family).toBe(row2!.family);
    });

    it.each([
      ['a different User-Agent', OTHER_UA],
      ['no User-Agent', null],
    ])('replay inside the window with %s is treated as theft (401, family revoked)', async (_label, ua) => {
      const { refresh: rt1 } = await session();
      const rotated = await refreshWith(rt1);
      expect(rotated.status).toBe(200);
      const rt2 = cookie(rotated, 'mhs_rt')!.value;
      await t.prisma.refreshToken.update({
        where: { tokenHash: hashToken(rt1) },
        data: { revokedAt: new Date() },
      });

      const replay = await refreshWith(rt1, ua);
      expect(replay.status).toBe(401);
      expect((await tokenRow(rt2))!.revokedAt).not.toBeNull();
    });

    it('an expired refresh token is refused and mints nothing', async () => {
      const { doctor, refresh } = await session();
      await t.prisma.refreshToken.update({
        where: { tokenHash: hashToken(refresh) },
        data: { expiresAt: new Date(Date.now() - 60 * 1000) },
      });
      const before = await t.prisma.refreshToken.count({ where: { userId: doctor.id } });

      const res = await refreshWith(refresh);
      expect(res.status).toBe(401);
      expect(await t.prisma.refreshToken.count({ where: { userId: doctor.id } })).toBe(before);
    });

    it('logout revokes the token, clears both cookies, and the token cannot refresh again', async () => {
      const { refresh } = await session();

      const out = await t
        .agent()
        .post('/api/auth/logout')
        .set('User-Agent', UA)
        .set('Cookie', `mhs_rt=${refresh}`)
        .send();
      expect(out.status).toBe(204);
      // Cleared = re-set empty with an expiry in the past.
      for (const name of ['mhs_at', 'mhs_rt']) {
        const c = cookie(out, name);
        expect(c).toBeDefined();
        expect(c!.value).toBe('');
        expect(new Date(String(c!.attrs.expires)).getTime()).toBeLessThan(Date.now());
      }
      expect(cookie(out, 'mhs_rt')!.attrs.path).toBe('/api/auth');

      const row = await tokenRow(refresh);
      expect(row!.revokedAt).not.toBeNull();

      // Inside the grace window and from the same browser — but the family has
      // no live successor, so a logged-out token is never revived.
      const again = await refreshWith(refresh);
      expect(again.status).toBe(401);
      const live = await t.prisma.refreshToken.count({
        where: { family: row!.family, revokedAt: null },
      });
      expect(live).toBe(0);
    });

    it('logout without a cookie is a harmless 204', async () => {
      const res = await t.agent().post('/api/auth/logout').send();
      expect(res.status).toBe(204);
    });
  });
});

// The real rate-limit store. Everything above runs with a store that never
// counts; this proves the limit is actually wired to the login route.
describe('auth rate limit (real throttler store)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ throttle: true });
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('answers the 6th login inside a minute with 429', async () => {
    const attempt = () =>
      t
        .agent()
        .post('/api/auth/login')
        .set('User-Agent', UA)
        .send({ identifier: 'nobody.ratelimit@test.invalid', password: TEST_PASSWORD });

    for (let i = 0; i < 5; i += 1) {
      const res = await attempt();
      expect(res.status).toBe(401);
    }
    const sixth = await attempt();
    expect(sixth.status).toBe(429);

    // The limit is per route: another endpoint from the same address still answers.
    const me = await t.agent().get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('a throttled login is refused even with correct credentials', async () => {
    // Same address, same minute as the test above when run in order; on its own
    // it spends the allowance first. Either way the request after the 5th is 429.
    const doctor = await makeDoctor(t.prisma);
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await t
        .agent()
        .post('/api/auth/login')
        .set('User-Agent', UA)
        .send({ identifier: doctor.email, password: TEST_PASSWORD });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
