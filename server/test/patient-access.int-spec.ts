import type { Patient, User } from '@prisma/client';
import { MAX_CODES_PER_PATIENT_PER_HOUR, MAX_WRONG_TRIES } from '../src/patient-access/code';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor, makePatient, makeSupervisor } from './support/fixtures';
import { rxBody } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// ⚕️ Opening ANOTHER practice's patient with the patient's own code (physician's
// sheet, 16/11/2026): the doctor types the patient's mobile, the patient's phone
// receives a code, the doctor enters it — and only then does the patient open for
// that practice, as a supervising doctor's does. Real HTTP, real database, a fake
// gateway that records what would have been texted; every name is made up.
//
//   A  the patient's own doctor        B  the doctor who asks       C  a third doctor

type Browser = ReturnType<TestApp['agent']>;
interface Text { to: string; message: string }

const NUMBER = '01712345678';
const codeIn = (message: string): string => /code (\d{6})/.exec(message)![1];

describe('patient access by the patient\'s own code', () => {
  let t: TestApp;
  let A: User, B: User, C: User;
  let a: Browser, b: Browser, c: Browser;
  const texts: Text[] = [];
  const gateway = {
    configured: true,
    fails: false,
    send: jest.fn(async (to: string, message: string) => {
      if (gateway.fails) return { ok: false, detail: 'Gateway returned HTTP 500', ms: 1 };
      texts.push({ to, message });
      return { ok: true, detail: 'Sent', ms: 1 };
    }),
  };

  beforeAll(async () => {
    t = await createTestApp({ sms: gateway as never });
    await resetDb(t.prisma);
    [A, B, C] = await Promise.all([makeDoctor(t.prisma), makeDoctor(t.prisma), makeDoctor(t.prisma)]);
    [a, b, c] = await Promise.all([loginAs(t, A), loginAs(t, B), loginAs(t, C)]);
  });
  afterAll(async () => { await t.close(); });

  beforeEach(async () => {
    texts.length = 0;
    gateway.configured = true;
    gateway.fails = false;
    gateway.send.mockClear();
    // Every test starts with NO patients: the search and by-mobile answers list
    // everything reachable on NUMBER, so a patient left by an earlier test would
    // be listed in the next (the first run of this spec failed five tests so).
    // Removing a patient takes its supervisors, grants and codes with it.
    await t.prisma.patient.deleteMany({});
    await t.prisma.patientAccessCode.deleteMany({});
    await t.prisma.patientAccessGrant.deleteMany({});
    await t.prisma.user.updateMany({ data: { isolated: false } });
  });

  // A patient of A on NUMBER, named so a leak would be seen.
  const patientOfA = (over: Partial<Patient> = {}) =>
    makePatient(t.prisma, A.id, { name: 'Rahima Begum', mobile: NUMBER, sex: 'Female', age: 34, ageAsOfYear: new Date().getFullYear(), ...over });
  const ask = (who: Browser, id: string, headers: Record<string, string> = {}) => who.post(`/api/patient-access/${id}/code`).set(headers).send({});
  const verify = (who: Browser, id: string, code: string, headers: Record<string, string> = {}) =>
    who.post(`/api/patient-access/${id}/verify`).set(headers).send({ code });
  const search = (who: Browser, mobile: string) => who.get('/api/patient-access/search').query({ mobile });
  const canOpen = async (who: Browser, id: string) => (await who.get(`/api/patients/${id}`)).status === 200;
  // Let the cool-down pass without waiting a minute.
  const backdate = (patientId: string, seconds = 120) =>
    t.prisma.patientAccessCode.updateMany({ where: { patientId }, data: { createdAt: new Date(Date.now() - seconds * 1000) } });
  // A full, honest round: ask, read the text, enter it.
  const openWithCode = async (who: Browser, id: string) => {
    texts.length = 0;
    const r = await ask(who, id);
    expect(r.status).toBe(200);
    return verify(who, id, codeIn(texts[texts.length - 1].message));
  };

  describe('searching a number', () => {
    it('lists the other practice\'s patient with ONLY id, name, sex and age — nothing of the record, nothing of whose patient it is', async () => {
      const p = await patientOfA({ nid: '1234567890', fullAddress: 'Somewhere', drugHistory: ['x'] as never });
      const r = await search(b, NUMBER);
      expect(r.status).toBe(200);
      expect(r.body.isolated).toBe(false);
      expect(r.body.patients).toEqual([{ id: p.id, name: 'Rahima Begum', sex: 'Female', age: 34 }]);
      const raw = JSON.stringify(r.body);
      for (const secret of [A.id, A.name, '1234567890', 'Somewhere', NUMBER]) expect(raw).not.toContain(secret);
    });

    it('finds the patient however the number is typed (+880…, spaces) but never by part of a number', async () => {
      const p = await patientOfA();
      expect((await search(b, '+8801712345678')).body.patients.map((x: { id: string }) => x.id)).toEqual([p.id]);
      expect((await search(b, '8801712345678')).body.patients).toHaveLength(1);
      expect((await search(b, '01712345679')).body.patients).toEqual([]);
    });

    it.each([[''], ['0171'], ['abc'], ['01212345678'], ['017123456789']])('%j is not a mobile number: 400 with the sentence for the doctor', async (m) => {
      const r = await search(b, m);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/11 digits/);
    });

    it('does not list the practice\'s OWN patients, nor ones it supervises, nor ones it has already opened', async () => {
      const own = await makePatient(t.prisma, B.id, { mobile: NUMBER, name: 'Own' });
      const supervised = await makePatient(t.prisma, A.id, { mobile: NUMBER, name: 'Supervised' });
      await makeSupervisor(t.prisma, supervised.id, B.id);
      const opened = await makePatient(t.prisma, A.id, { mobile: NUMBER, name: 'Opened' });
      await t.prisma.patientAccessGrant.create({ data: { patientId: opened.id, doctorId: B.id, verifiedMobile: NUMBER } });
      const fresh = await makePatient(t.prisma, A.id, { mobile: NUMBER, name: 'Fresh' });
      const ids = (await search(b, NUMBER)).body.patients.map((x: { id: string }) => x.id);
      expect(ids).toEqual([fresh.id]);
      expect(ids).not.toContain(own.id);
    });

    it('lists a patient with no owner (their doctor\'s account was deleted): the code is how they are claimed', async () => {
      const p = await patientOfA();
      await t.prisma.patient.update({ where: { id: p.id }, data: { doctorId: null } });
      expect((await search(b, NUMBER)).body.patients.map((x: { id: string }) => x.id)).toEqual([p.id]);
    });

    it('lists several family members on one phone, newest first', async () => {
      const older = await patientOfA({ name: 'Older' });
      await new Promise((r) => setTimeout(r, 15));
      const newer = await patientOfA({ name: 'Newer' });
      expect((await search(b, NUMBER)).body.patients.map((x: { id: string }) => x.id)).toEqual([newer.id, older.id]);
    });

    it('needs a signed-in user', async () => {
      expect((await t.agent().get('/api/patient-access/search').query({ mobile: NUMBER })).status).toBe(401);
    });
  });

  describe('isolation (admin Profile settings)', () => {
    it('⚕️ an isolated owner\'s patients are not listed, and cannot be asked for', async () => {
      const p = await patientOfA();
      await t.prisma.user.update({ where: { id: A.id }, data: { isolated: true } });
      expect((await search(b, NUMBER)).body.patients).toEqual([]);
      const r = await ask(b, p.id);
      expect(r.status).toBe(404);
      expect(gateway.send).not.toHaveBeenCalled();
    });

    it('⚕️ an isolated practice is shown nothing, and cannot ask or enter a code', async () => {
      const p = await patientOfA();
      await t.prisma.user.update({ where: { id: B.id }, data: { isolated: true } });
      expect((await search(b, NUMBER)).body).toEqual({ isolated: true, patients: [] });
      expect((await ask(b, p.id)).status).toBe(403);
      expect((await verify(b, p.id, '123456')).status).toBe(403);
      expect(gateway.send).not.toHaveBeenCalled();
    });

    it('⚕️ access already given closes the moment EITHER side is isolated, and opens again when it is not', async () => {
      const p = await patientOfA();
      expect((await openWithCode(b, p.id)).status).toBe(200);
      expect(await canOpen(b, p.id)).toBe(true);

      await t.prisma.user.update({ where: { id: A.id }, data: { isolated: true } }); // the owner isolates
      expect(await canOpen(b, p.id)).toBe(false);
      expect(await canOpen(a, p.id)).toBe(true); // …and the owner still reads their own
      await t.prisma.user.update({ where: { id: A.id }, data: { isolated: false } });
      expect(await canOpen(b, p.id)).toBe(true);

      await t.prisma.user.update({ where: { id: B.id }, data: { isolated: true } }); // the asker isolates
      expect(await canOpen(b, p.id)).toBe(false);
      await t.prisma.user.update({ where: { id: B.id }, data: { isolated: false } });
      expect(await canOpen(b, p.id)).toBe(true);
    });

    it('isolation never closes the owner\'s own door, nor a supervising doctor\'s', async () => {
      const p = await patientOfA();
      await makeSupervisor(t.prisma, p.id, C.id);
      await t.prisma.user.updateMany({ data: { isolated: true } });
      expect(await canOpen(a, p.id)).toBe(true);
      expect(await canOpen(c, p.id)).toBe(true);
    });
  });

  describe('asking for a code', () => {
    it('texts the PATIENT\'S number (never the doctor\'s) with a six-digit code and the asking doctor\'s name; the code is not in the answer', async () => {
      const p = await patientOfA();
      const r = await ask(b, p.id);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ sentTo: '017*****678', expiresInSeconds: 600, resendAfterSeconds: 60 });
      expect(texts).toHaveLength(1);
      expect(texts[0].to).toBe(NUMBER);
      expect(texts[0].to).not.toBe(B.mobile);
      expect(texts[0].message).toMatch(/code \d{6} /);
      expect(texts[0].message).toContain(B.name);
      expect(JSON.stringify(r.body)).not.toContain(codeIn(texts[0].message));
      // the patient's record is not in the text
      expect(texts[0].message).not.toContain('Rahima');
    });

    it('keeps only a keyed hash of the code, bound to the patient and the practice, for ten minutes', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      const rows = await t.prisma.patientAccessCode.findMany({ where: { patientId: p.id } });
      expect(rows).toHaveLength(1);
      const code = codeIn(texts[0].message);
      expect(rows[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].codeHash).not.toContain(code);
      expect(rows[0].doctorId).toBe(B.id);
      expect(rows[0].attempts).toBe(0);
      const ttl = rows[0].expiresAt.getTime() - rows[0].createdAt.getTime();
      expect(ttl).toBeGreaterThan(9.9 * 60_000);
      expect(ttl).toBeLessThan(10.1 * 60_000);
    });

    it('a second press within the minute is refused with the seconds left — and no second text goes out', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      const r = await ask(b, p.id);
      expect(r.status).toBe(429);
      expect(r.body.code).toBe('CODE_COOLDOWN');
      expect(r.body.retryInSeconds).toBeGreaterThan(0);
      expect(r.body.retryInSeconds).toBeLessThanOrEqual(60);
      expect(texts).toHaveLength(1);
    });

    it('two presses AT ONCE send one text, not two (the cool-down is read under a lock)', async () => {
      const p = await patientOfA();
      const rs = await Promise.all([ask(b, p.id), ask(b, p.id), ask(b, p.id)]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 429, 429]);
      expect(texts).toHaveLength(1);
      expect(await t.prisma.patientAccessCode.count({ where: { patientId: p.id } })).toBe(1);
    });

    it('a patient\'s phone is not filled with texts: after five codes in an hour, from any practices, no more', async () => {
      const p = await patientOfA();
      const others = await Promise.all([1, 2, 3, 4, 5].map(() => makeDoctor(t.prisma)));
      for (const o of others.slice(0, MAX_CODES_PER_PATIENT_PER_HOUR)) {
        await t.prisma.patientAccessCode.create({
          data: { patientId: p.id, doctorId: o.id, codeHash: 'x'.repeat(64), expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(Date.now() - 5 * 60_000) },
        });
      }
      const r = await ask(b, p.id);
      expect(r.status).toBe(429);
      expect(r.body.code).toBe('CODE_LIMIT');
      expect(texts).toHaveLength(0);
    });

    it('a new code replaces this practice\'s earlier one: only the newest works', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      const first = codeIn(texts[0].message);
      await backdate(p.id);
      await ask(b, p.id);
      const second = codeIn(texts[1].message);
      expect(await t.prisma.patientAccessCode.count({ where: { patientId: p.id, doctorId: B.id } })).toBe(1);
      if (first !== second) {
        expect((await verify(b, p.id, first)).status).toBe(400);
        expect(await canOpen(b, p.id)).toBe(false);
      }
      expect((await verify(b, p.id, second)).status).toBe(200);
    });

    it('a failing gateway is told as a failure, and leaves NO code behind', async () => {
      const p = await patientOfA();
      gateway.fails = true;
      const r = await ask(b, p.id);
      expect(r.status).toBe(502);
      expect(r.body.code).toBe('SMS_FAILED');
      expect(r.body.message).toContain('could not be sent');
      expect(await t.prisma.patientAccessCode.count({})).toBe(0);
    });

    it('an unconfigured gateway is refused BEFORE anything is stored or logged (it would log the code and say "sent")', async () => {
      const p = await patientOfA();
      gateway.configured = false;
      const r = await ask(b, p.id);
      expect(r.status).toBe(503);
      expect(r.body.code).toBe('SMS_NOT_CONFIGURED');
      expect(gateway.send).not.toHaveBeenCalled();
      expect(await t.prisma.patientAccessCode.count({})).toBe(0);
    });

    it('a patient whose number cannot receive a text (not a Bangladeshi mobile) is 422, not a guess', async () => {
      const p = await patientOfA({ mobile: '12345' });
      expect((await ask(b, p.id)).status).toBe(422);
      const none = await patientOfA({ mobile: null });
      expect((await ask(b, none.id)).status).toBe(422);
      expect(gateway.send).not.toHaveBeenCalled();
    });

    it('a patient already open to the practice is 409; one that does not exist is 404', async () => {
      const own = await makePatient(t.prisma, B.id, { mobile: NUMBER });
      expect((await ask(b, own.id)).status).toBe(409);
      expect((await ask(b, 'no-such-patient')).status).toBe(404);
      expect(gateway.send).not.toHaveBeenCalled();
    });

    it('needs a signed-in user', async () => {
      const p = await patientOfA();
      expect((await t.agent().post(`/api/patient-access/${p.id}/code`).send({})).status).toBe(401);
    });
  });

  describe('entering the code', () => {
    it('⚕️ before the code, the patient is NOT open to the asking practice; after the right one, it is', async () => {
      const p = await patientOfA();
      expect(await canOpen(b, p.id)).toBe(false);
      await ask(b, p.id);
      expect(await canOpen(b, p.id)).toBe(false); // asking opens nothing
      const r = await verify(b, p.id, codeIn(texts[0].message));
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true, patientId: p.id });
      expect(await canOpen(b, p.id)).toBe(true);
      const grant = await t.prisma.patientAccessGrant.findFirst({ where: { patientId: p.id, doctorId: B.id } });
      expect(grant?.verifiedMobile).toBe(NUMBER);
    });

    it('once open, the patient is found by number among the practice\'s own', async () => {
      const p = await patientOfA();
      await openWithCode(b, p.id);
      const found = await b.get('/api/patients/by-mobile').query({ mobile: NUMBER });
      expect(found.body.map((x: { id: string }) => x.id)).toEqual([p.id]);
      // …and is no longer offered for a code
      expect((await search(b, NUMBER)).body.patients).toEqual([]);
    });

    it('a code with spaces in it ("482 913") is the same code', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      const code = codeIn(texts[0].message);
      expect((await verify(b, p.id, `${code.slice(0, 3)} ${code.slice(3)}`)).status).toBe(200);
    });

    it('a wrong code is 400 with the tries left, and opens nothing', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      const right = codeIn(texts[0].message);
      const wrong = right === '000000' ? '111111' : '000000';
      const r = await verify(b, p.id, wrong);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('WRONG_CODE');
      expect(r.body.triesLeft).toBe(MAX_WRONG_TRIES - 1);
      expect(await canOpen(b, p.id)).toBe(false);
    });

    it('⚕️ five wrong tries finish the code: the sixth — even the RIGHT code — is refused, and the patient stays closed', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      const right = codeIn(texts[0].message);
      const wrong = right === '000000' ? '111111' : '000000';
      for (let i = 0; i < MAX_WRONG_TRIES; i++) expect((await verify(b, p.id, wrong)).status).toBe(400);
      const r = await verify(b, p.id, right);
      expect(r.status).toBe(429);
      expect(r.body.code).toBe('CODE_LOCKED');
      expect(await canOpen(b, p.id)).toBe(false);
      // …a new code (after the minute) is a fresh start
      await backdate(p.id);
      expect((await openWithCode(b, p.id)).status).toBe(200);
    });

    it('⚕️ a burst of guesses all at once is still counted five times, not more (the try is claimed atomically)', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      const right = codeIn(texts[0].message);
      const wrong = right === '000000' ? '111111' : '000000';
      const rs = await Promise.all(Array.from({ length: 12 }, () => verify(b, p.id, wrong)));
      expect(rs.filter((r) => r.status === 400)).toHaveLength(MAX_WRONG_TRIES);
      expect(rs.filter((r) => r.status === 429)).toHaveLength(12 - MAX_WRONG_TRIES);
      const row = await t.prisma.patientAccessCode.findFirst({ where: { patientId: p.id } });
      expect(row?.attempts).toBe(MAX_WRONG_TRIES);
    });

    it.each([[''], ['12345'], ['1234567'], ['12345a'], ['১২৩৪৫৬'], ['code 123456']])(
      '%j is not a code: 400, and it costs no try',
      async (typed) => {
        const p = await patientOfA();
        await ask(b, p.id);
        const r = await verify(b, p.id, typed);
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('WRONG_CODE');
        expect((await t.prisma.patientAccessCode.findFirst({ where: { patientId: p.id } }))?.attempts).toBe(0);
      },
    );

    it('a body with no code, or the wrong type, is refused by validation', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      expect((await b.post(`/api/patient-access/${p.id}/verify`).send({})).status).toBe(400);
      expect((await b.post(`/api/patient-access/${p.id}/verify`).send({ code: 123456 })).status).toBe(400);
      expect((await b.post(`/api/patient-access/${p.id}/verify`).send({ code: 'x'.repeat(500) })).status).toBe(400);
    });

    it('an expired code is "ask for a new one", and a code that was never asked for is the same', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      await t.prisma.patientAccessCode.updateMany({ where: { patientId: p.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const r = await verify(b, p.id, codeIn(texts[0].message));
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('CODE_EXPIRED');
      const q = await patientOfA({ name: 'Never asked' });
      expect((await verify(b, q.id, '123456')).body.code).toBe('CODE_EXPIRED');
      expect(await canOpen(b, p.id)).toBe(false);
    });

    it('⚕️ a code is for ONE practice: what was texted for B opens nothing for C', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      const forB = codeIn(texts[0].message);
      const r = await verify(c, p.id, forB);
      expect(r.status).toBe(400);
      expect(await canOpen(c, p.id)).toBe(false);
    });

    it('⚕️ a code is for ONE patient: B\'s code for one family member does not open another, even with the stored hash copied across', async () => {
      const p1 = await patientOfA({ name: 'Rahima' });
      const p2 = await patientOfA({ name: 'Karima' });
      await ask(b, p1.id);
      const code = codeIn(texts[0].message);
      // no code was asked for p2:
      expect((await verify(b, p2.id, code)).body.code).toBe('CODE_EXPIRED');
      // and a row for p2 carrying p1's hash still does not match (the hash names the patient)
      const row1 = (await t.prisma.patientAccessCode.findFirst({ where: { patientId: p1.id } }))!;
      await t.prisma.patientAccessCode.create({ data: { patientId: p2.id, doctorId: B.id, codeHash: row1.codeHash, expiresAt: new Date(Date.now() + 60_000) } });
      const r = await verify(b, p2.id, code);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('WRONG_CODE');
      expect(await canOpen(b, p2.id)).toBe(false);
    });

    it('a code works once: it is spent, and a second use of it is not accepted after access is taken away', async () => {
      const p = await patientOfA();
      await ask(b, p.id);
      const code = codeIn(texts[0].message);
      expect((await verify(b, p.id, code)).status).toBe(200);
      const row = await t.prisma.patientAccessCode.findFirst({ where: { patientId: p.id } });
      expect(row?.usedAt).not.toBeNull();
      await t.prisma.patientAccessGrant.deleteMany({});
      expect((await verify(b, p.id, code)).body.code).toBe('CODE_EXPIRED');
      expect(await canOpen(b, p.id)).toBe(false);
    });

    it('entering a code for a patient that is already open is not an error (idempotent), and makes no second grant', async () => {
      const p = await patientOfA();
      await openWithCode(b, p.id);
      expect((await verify(b, p.id, '000000')).status).toBe(200);
      expect(await t.prisma.patientAccessGrant.count({ where: { patientId: p.id, doctorId: B.id } })).toBe(1);
    });

    it('the practice that is asking is the WORKSTATION\'s: an assistant at the desk opens it for the doctor', async () => {
      const desk = await makeDoctor(t.prisma);
      await makeAssistantLink(t.prisma, B.id, desk.id, []);
      const d = await loginAs(t, desk);
      const p = await patientOfA();
      const ws = { 'X-Workstation': B.id };
      expect((await ask(d, p.id, ws)).status).toBe(200);
      expect((await verify(d, p.id, codeIn(texts[0].message), ws)).status).toBe(200);
      expect(await t.prisma.patientAccessGrant.count({ where: { patientId: p.id, doctorId: B.id } })).toBe(1);
      expect(await t.prisma.patientAccessGrant.count({ where: { patientId: p.id, doctorId: desk.id } })).toBe(0);
      // a practice the user does not work in is refused by the workstation guard, as everywhere
      expect((await ask(d, p.id, { 'X-Workstation': C.id })).status).toBe(403);
    });
  });

  describe('what the practice can do once the patient is open (as a supervising doctor)', () => {
    it('reads the patient; prescribes under ITS OWN doctorId; never sees the owner\'s prescriptions', async () => {
      const p = await patientOfA();
      const ownerRx = await a.post('/api/prescriptions').send(rxBody(p.id));
      expect(ownerRx.status).toBe(201);
      await openWithCode(b, p.id);
      expect((await b.get(`/api/patients/${p.id}`)).body.name).toBe('Rahima Begum');
      const mine = await b.post('/api/prescriptions').send(rxBody(p.id));
      expect(mine.status).toBe(201);
      expect(mine.body.doctorId).toBe(B.id);
      const list = await b.get('/api/prescriptions').query({ patientId: p.id });
      const ids = (Array.isArray(list.body) ? list.body : list.body.items ?? []).map((x: { id: string }) => x.id);
      expect(ids).not.toContain(ownerRx.body.id);
    });

    it('⚕️ does not prescribe for a patient it has NOT opened', async () => {
      const p = await patientOfA();
      expect((await b.post('/api/prescriptions').send(rxBody(p.id))).status).toBe(404);
      await ask(b, p.id); // asking is not opening
      expect((await b.post('/api/prescriptions').send(rxBody(p.id))).status).toBe(404);
    });

    it('⚕️ cannot change the owner\'s record, and cannot delete the patient', async () => {
      const p = await patientOfA();
      await openWithCode(b, p.id);
      const edit = await b.patch(`/api/patients/${p.id}`).send({ name: 'Changed' });
      expect(edit.status).toBeGreaterThanOrEqual(400);
      const del = await b.delete(`/api/patients/${p.id}`);
      expect(del.status).toBeGreaterThanOrEqual(400);
      const row = await t.prisma.patient.findUnique({ where: { id: p.id } });
      expect(row?.name).toBe('Rahima Begum');
      expect(row?.doctorId).toBe(A.id);
    });

    it('⚕️ is NOT a member of the owner\'s patient chat (that is supervisors only)', async () => {
      const p = await patientOfA();
      await openWithCode(b, p.id);
      const chat = await b.get(`/api/patients/${p.id}/chat`);
      expect(chat.status).toBeGreaterThanOrEqual(400);
      expect(await t.prisma.patientSupervisor.count({ where: { patientId: p.id } })).toBe(0);
    });

    it('does not move the patient: the owner\'s list still holds them and the asker\'s does not', async () => {
      const p = await patientOfA();
      await openWithCode(b, p.id);
      expect((await a.get('/api/patients')).body.map((x: { id: string }) => x.id)).toContain(p.id);
      expect((await b.get('/api/patients')).body.map((x: { id: string }) => x.id)).not.toContain(p.id);
    });

    it('the owner\'s parked visit is not carried to the asker (a foreign practice reads its own, not the owner\'s)', async () => {
      const p = await patientOfA({ incompleteRx: { marker: 'owner-draft' } as never });
      await openWithCode(b, p.id);
      expect((await b.get(`/api/patients/${p.id}`)).body.incompleteRx).toBeNull();
      expect((await a.get(`/api/patients/${p.id}`)).body.incompleteRx).toEqual({ marker: 'owner-draft' });
    });
  });

  describe('the workstation listing carries the practice\'s two settings', () => {
    it('own practice and an assisted one, each its own', async () => {
      await t.prisma.user.update({ where: { id: B.id }, data: { hideMhsLogo: true } });
      const desk = await makeDoctor(t.prisma);
      await makeAssistantLink(t.prisma, A.id, desk.id, []);
      await t.prisma.user.update({ where: { id: A.id }, data: { isolated: true } });
      const own = (await b.get('/api/workstations')).body as Array<{ doctorId: string; hideMhsLogo: boolean; isolated: boolean }>;
      expect(own.find((w) => w.doctorId === B.id)).toMatchObject({ hideMhsLogo: true, isolated: false });
      const d = await loginAs(t, desk);
      const list = (await d.get('/api/workstations')).body as Array<{ doctorId: string; hideMhsLogo: boolean; isolated: boolean }>;
      expect(list.find((w) => w.doctorId === A.id)).toMatchObject({ hideMhsLogo: false, isolated: true });
      await t.prisma.user.update({ where: { id: B.id }, data: { hideMhsLogo: false } });
    });
  });
});
