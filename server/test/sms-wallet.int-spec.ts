import type { User } from '@prisma/client';
import { dhakaDayKey } from '../src/opd/dhaka-day';
import type { SmsResult } from '../src/sms/sms.service';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor } from './support/fixtures';
import { WS } from './support/fixtures-clinical';
import { resetDb } from './support/test-db';

// The appointment SMS to a day's queue and the practice's SMS wallet, through
// real HTTP and the real database. The gateway is a fake: no SMS leaves the
// process. Every name and number here is made up.

type Agent = Awaited<ReturnType<typeof loginAs>>;
const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (offset: number) =>
  dhakaDayKey(new Date(Date.now() + offset * DAY_MS));
const TODAY = dayKey(0);
const TOMORROW = dayKey(1);
const YESTERDAY = dayKey(-1);

// A gateway that takes a moment (so two sends overlap) and can be told to fail.
const sent: { to: string; message: string }[] = [];
const failing = new Set<string>();
const fakeSms = {
  configured: true,
  async send(to: string, message: string): Promise<SmsResult> {
    await new Promise((r) => setTimeout(r, 150));
    if (failing.has(to))
      return {
        ok: false,
        detail: 'Gateway rejected the message: insufficient',
        ms: 150,
      };
    sent.push({ to, message });
    return { ok: true, detail: 'Sent', ms: 150 };
  },
};

describe("SMS to a day's queue, and the SMS wallet", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ sms: fakeSms as never });
    await resetDb(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => {
    sent.length = 0;
    failing.clear();
  });

  const setup = async (balance = 0) => {
    const doctor = await makeDoctor(t.prisma, {
      name: 'Test Doctor Sms',
      displayName: 'Dr. Test Sms',
    });
    await t.prisma.chamber.create({
      data: { userId: doctor.id, address: 'Test Clinic\nRoad 1' },
    });
    if (balance)
      await t.prisma.smsWallet.create({
        data: { doctorId: doctor.id, balance },
      });
    const browser = await loginAs(t, doctor);
    return { doctor, browser };
  };
  const queue = async (
    browser: Agent,
    name: string,
    phone: string | null,
    date = TODAY,
  ) => {
    const res = await browser
      .post('/api/opd')
      .send({ name, date, ...(phone ? { phone } : {}) });
    expect(res.status).toBe(201);
  };
  const preview = (
    b: Agent,
    date = TODAY,
    language = 'en',
    headers: Record<string, string> = {},
  ) => b.post('/api/opd/sms/preview').set(headers).send({ date, language });
  const send = async (
    b: Agent,
    date = TODAY,
    language = 'en',
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) => {
    const p = await preview(b, date, language, headers);
    expect(p.status).toBe(201);
    return b
      .post('/api/opd/sms/send')
      .set(headers)
      .send({ date, language, previewSignature: p.body.signature, ...extra });
  };
  const ledgerSum = async (doctor: User) =>
    (
      await t.prisma.smsLedger.aggregate({
        where: { doctorId: doctor.id },
        _sum: { delta: true },
      })
    )._sum.delta ?? 0;
  const balanceOf = async (doctor: User) =>
    (await t.prisma.smsWallet.findUnique({ where: { doctorId: doctor.id } }))
      ?.balance ?? 0;

  it("previews every patient at the Print Queue's time, sends nothing and charges nothing", async () => {
    const { doctor, browser } = await setup(10);
    await queue(browser, 'Alpha Test', '01711000001');
    await queue(browser, 'Beta Test', null);
    await queue(browser, 'Gamma Test', '01711000003');
    const res = await preview(browser);
    expect(res.status).toBe(201);
    expect(
      res.body.rows.map(
        (r: {
          name: string;
          mobile: string | null;
          minutes: number;
          skip: string | null;
        }) => [r.name, r.mobile, r.minutes, r.skip],
      ),
    ).toEqual([
      ['Alpha Test', '01711000001', 18 * 60, null],
      ['Beta Test', null, 18 * 60 + 10, 'No mobile number.'],
      ['Gamma Test', '01711000003', 18 * 60 + 20, null],
    ]);
    expect(res.body.rows[2].message).toBe(
      'Gamma Test, your appointment time to dr. Test Sms at Test Clinic Road 1 at 6.20PM. Be present 30min prior to your appointment time.',
    );
    expect([
      res.body.recipients,
      res.body.cost,
      res.body.balance,
      res.body.canSend,
    ]).toEqual([2, 2, 10, true]);
    expect(sent).toEqual([]);
    expect(
      await t.prisma.smsLedger.count({ where: { doctorId: doctor.id } }),
    ).toBe(0);
  });

  it('refuses a day that has passed and a day with nobody in it', async () => {
    const { browser } = await setup(10);
    const past = await preview(browser, YESTERDAY);
    expect(past.status).toBe(400);
    expect(past.body.message).toMatch(/passed/);
    const pastSend = await browser
      .post('/api/opd/sms/send')
      .send({ date: YESTERDAY, language: 'en', previewSignature: 'x' });
    expect(pastSend.status).toBe(400);
    const empty = await preview(browser, TOMORROW);
    expect(empty.status).toBe(400);
    expect(empty.body.message).toMatch(/No one/);
    expect(sent).toEqual([]);
  });

  it('charges only what went: a failed message is refunded, and the ledger adds up to the balance', async () => {
    const { doctor, browser } = await setup(10);
    await queue(browser, 'Alpha Test', '01711000011');
    await queue(browser, 'Beta Test', '01711000012');
    failing.add('01711000012');
    const res = await send(browser);
    expect(res.status).toBe(201);
    expect(
      res.body.results.map((r: { name: string; status: string }) => [
        r.name,
        r.status,
      ]),
    ).toEqual([
      ['Alpha Test', 'sent'],
      ['Beta Test', 'failed'],
    ]);
    expect(res.body.results[1].detail).toMatch(/rejected/);
    expect([res.body.charged, res.body.balance]).toEqual([1, 9]);
    expect(await balanceOf(doctor)).toBe(9);
    expect(10 + (await ledgerSum(doctor))).toBe(9);
    const reasons = await t.prisma.smsLedger.findMany({
      where: { doctorId: doctor.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(reasons.map((l) => [l.reason, l.delta])).toEqual([
      ['send', -2],
      ['refund', 1],
    ]);
  });

  it('not enough balance: refused, nothing sent, nothing charged', async () => {
    const { doctor, browser } = await setup(1);
    await queue(browser, 'Alpha Test', '01711000021');
    await queue(browser, 'Beta Test', '01711000022');
    const p = await preview(browser);
    expect(p.body.canSend).toBe(false);
    const res = await browser.post('/api/opd/sms/send').send({
      date: TODAY,
      language: 'en',
      previewSignature: p.body.signature,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      message: 'Not enough SMS balance.',
      code: 'SMS_BALANCE',
    });
    expect(sent).toEqual([]);
    expect(await balanceOf(doctor)).toBe(1);
    expect(
      await t.prisma.smsLedger.count({ where: { doctorId: doctor.id } }),
    ).toBe(0);
  });

  it('two sends at once never spend more than the balance holds', async () => {
    const { doctor, browser } = await setup(3);
    await queue(browser, 'Alpha Test', '01711000031');
    await queue(browser, 'Beta Test', '01711000032');
    await queue(browser, 'Gamma Test', '01711000033', TOMORROW);
    await queue(browser, 'Delta Test', '01711000034', TOMORROW);
    const [a, b] = await Promise.all([
      send(browser, TODAY),
      send(browser, TOMORROW),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);
    expect(sent).toHaveLength(2);
    expect(await balanceOf(doctor)).toBe(1);
    expect(3 + (await ledgerSum(doctor))).toBe(1);
  });

  it('the same send pressed twice at once goes once; again within 30 minutes needs "Send again"', async () => {
    const { browser } = await setup(20);
    await queue(browser, 'Alpha Test', '01711000041');
    await queue(browser, 'Beta Test', '01711000042');
    const p = await preview(browser);
    const body = {
      date: TODAY,
      language: 'en',
      previewSignature: p.body.signature,
    };
    const [a, b] = await Promise.all([
      browser.post('/api/opd/sms/send').send(body),
      browser.post('/api/opd/sms/send').send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(['SMS_SENDING', 'SMS_REPEAT']).toContain(
      (a.status === 409 ? a : b).body.code,
    );
    expect(sent).toHaveLength(2);
    const again = await browser.post('/api/opd/sms/send').send(body);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SMS_REPEAT');
    const confirmed = await browser
      .post('/api/opd/sms/send')
      .send({ ...body, confirmRepeat: true });
    expect(confirmed.status).toBe(201);
    expect(sent).toHaveLength(4);
  });

  it("is the practice's: an assistant sends on the doctor's wallet, sees no ledger, and a stranger is refused", async () => {
    const { doctor, browser } = await setup(5);
    await queue(browser, 'Alpha Test', '01711000051');
    const assistant = await makeDoctor(t.prisma);
    await makeAssistantLink(t.prisma, doctor.id, assistant.id);
    const asst = await loginAs(t, assistant);
    const ws = { [WS]: doctor.id };
    const res = await send(asst, TODAY, 'en', {}, ws);
    expect(res.status).toBe(201);
    expect(res.body.sent).toBe(1);
    expect(await balanceOf(doctor)).toBe(4);
    expect(await balanceOf(assistant)).toBe(0);
    expect((await asst.get('/api/sms/wallet').set(ws)).body).toEqual({
      balance: 4,
    });
    expect((await asst.get('/api/sms/ledger').set(ws)).status).toBe(403);
    expect(
      (
        await asst
          .post('/api/sms/payment-requests')
          .set(ws)
          .send({ kind: 'sms', quantity: 10 })
      ).status,
    ).toBe(403);
    // In their own workstation, the assistant sees their own (empty) queue.
    expect((await preview(asst)).status).toBe(400);

    const stranger = await loginAs(t, await makeDoctor(t.prisma));
    expect((await preview(stranger, TODAY, 'en', ws)).status).toBe(403);
    expect((await stranger.get('/api/sms/wallet').set(ws)).status).toBe(403);
  });

  it('Bangla is counted as more messages', async () => {
    const { browser } = await setup(10);
    await queue(browser, 'Alpha Test', '01711000061');
    const res = await preview(browser, TODAY, 'bn');
    expect(res.body.rows[0].encoding).toBe('UCS-2');
    expect(res.body.rows[0].message).toContain('সন্ধ্যা ৬:০০');
    expect(res.body.cost).toBe(res.body.rows[0].segments);
    expect(res.body.cost).toBeGreaterThanOrEqual(2);
  });

  describe('payment requests', () => {
    it('a doctor asks, the admin credits once — the wallet, the ledger and the request together', async () => {
      const { doctor, browser } = await setup();
      const made = await browser.post('/api/sms/payment-requests').send({
        kind: 'sms',
        quantity: 500,
        amount: 500,
        note: 'Paid by test',
      });
      expect(made.status).toBe(201);
      expect(made.body.status).toBe('pending');
      expect(
        (await browser.post('/api/sms/payment-requests').send({ kind: 'sms' }))
          .status,
      ).toBe(400);
      expect(
        (
          await browser
            .post('/api/sms/payment-requests')
            .send({ kind: 'renew', note: 'one year' })
        ).status,
      ).toBe(201);
      expect(
        (await browser.get('/api/sms/payment-requests')).body,
      ).toHaveLength(2);

      // The doctor cannot credit themself.
      expect(
        (
          await browser
            .patch(`/api/admin/payment-requests/${made.body.id}/credit`)
            .send({})
        ).status,
      ).toBe(403);

      const admin = await loginAs(
        t,
        await makeDoctor(t.prisma, { role: 'admin' }),
      );
      const pending = await admin
        .get('/api/admin/payment-requests')
        .query({ status: 'pending' });
      expect(pending.body.map((r: { id: string }) => r.id)).toContain(
        made.body.id,
      );

      const [x, y] = await Promise.all([
        admin
          .patch(`/api/admin/payment-requests/${made.body.id}/credit`)
          .send({}),
        admin
          .patch(`/api/admin/payment-requests/${made.body.id}/credit`)
          .send({}),
      ]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      expect(await balanceOf(doctor)).toBe(500);
      const ledger = await browser.get('/api/sms/ledger');
      expect(
        ledger.body.map((l: { reason: string; delta: number }) => [
          l.reason,
          l.delta,
        ]),
      ).toEqual([['topup', 500]]);
      const after = await t.prisma.paymentRequest.findUniqueOrThrow({
        where: { id: made.body.id },
      });
      expect([after.status, after.credited]).toEqual(['credited', 500]);
      expect(
        (
          await admin
            .patch(`/api/admin/payment-requests/${made.body.id}/reject`)
            .send({})
        ).status,
      ).toBe(409);
    });
  });
});
