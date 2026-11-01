import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { OpdSmsService, SMS_NOT_CONFIGURED } from './opd-sms.service';
import { SmsWalletService } from './sms-wallet.service';

// The appointment SMS to a day's queue, with the database and the gateway
// mocked: no message leaves the process. What the real database does under
// two sends at once is in `test/sms-wallet.int-spec.ts`.

const TODAY = '2026-10-28'; // 16:00 in Dhaka, below
const visit = (over: Record<string, unknown>) => ({
  id: `v-${String(over.name)}`,
  name: 'Test Patient',
  phone: '01711000000',
  status: 'waiting',
  rxStatus: null,
  ...over,
});

function build(
  opts: {
    visits?: unknown[];
    balance?: number;
    configured?: boolean;
    sendOk?: (to: string) => boolean;
    chambers?: unknown[];
  } = {},
) {
  let balance = opts.balance ?? 100;
  const ledger: { delta: number; reason: string }[] = [];
  const jobs: {
    id: string;
    status: string;
    results?: unknown;
    createdAt: Date;
    doctorId: string;
    day: string;
    language: string;
  }[] = [];
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn(async () => [{ balance }]),
    smsWallet: {
      update: jest.fn(async ({ data }: { data: { balance: number } }) => {
        balance = data.balance;
      }),
    },
    smsLedger: {
      create: jest.fn(
        async ({ data }: { data: { delta: number; reason: string } }) => {
          ledger.push(data);
        },
      ),
    },
    smsSendJob: {
      findMany: jest.fn(async () => jobs.filter((j) => j.status !== 'x')),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const j = {
          id: `job-${jobs.length + 1}`,
          status: 'sending',
          createdAt: new Date(),
          ...data,
        } as (typeof jobs)[number];
        jobs.push(j);
        return j;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          Object.assign(jobs.find((j) => j.id === where.id) as object, data);
        },
      ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    user: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'Shahariar',
        displayName: null,
      }),
    },
    smsWallet: {
      ...tx.smsWallet,
      findUnique: jest.fn(async () => ({ balance })),
    },
  };
  const opd = {
    list: jest
      .fn()
      .mockResolvedValue(
        opts.visits ?? [
          visit({ name: 'A' }),
          visit({ name: 'B', phone: '01811000000' }),
        ],
      ),
    getSchedule: jest.fn().mockResolvedValue({
      day: TODAY,
      startTime: '18:00',
      breakStart: null,
      breakEnd: null,
      minutesPerPatient: 10,
      saved: true,
    }),
  };
  const sms = {
    configured: opts.configured ?? true,
    send: jest.fn(async (to: string) =>
      (opts.sendOk?.(to) ?? true)
        ? { ok: true, detail: 'Sent', ms: 1 }
        : { ok: false, detail: 'Gateway rejected the message: error', ms: 1 },
    ),
  };
  // The practice's OpdChambers (ChambersService.list): the default one, whose
  // app-given name is not said, and whatever the test adds.
  const chambersList = opts.chambers ?? [
    { id: 'def', name: 'Main chamber', address: 'labaid', isDefault: true },
  ];
  const chambers = { list: jest.fn().mockResolvedValue(chambersList) };
  const wallet = new SmsWalletService(prisma as never);
  const service = new OpdSmsService(
    prisma as never,
    opd as never,
    sms as never,
    wallet,
    chambers as never,
  );
  return { service, prisma, opd, sms, ledger, jobs, balance: () => balance };
}

describe('OpdSmsService', () => {
  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-10-28T10:00:00Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'queueMicrotask',
        'performance',
        'hrtime',
      ],
    });
  });
  afterAll(() => jest.useRealTimers());

  describe('preview', () => {
    it("one message per patient, at the Print Queue's time, with its count and cost; nothing sent or charged", async () => {
      const { service, sms, ledger } = build();
      const p = await service.preview('doc', null, {
        date: TODAY,
        language: 'en',
      });
      expect(p.rows.map((r) => [r.serial, r.mobile, r.minutes])).toEqual([
        [1, '01711000000', 18 * 60],
        [2, '01811000000', 18 * 60 + 10],
      ]);
      expect(p.rows[1].message).toBe(
        'B, your appointment time to dr. Shahariar at labaid at 6.10PM. Be present 30min prior to your appointment time.',
      );
      expect(p.rows[0].segments).toBe(1);
      expect([p.recipients, p.segments, p.cost, p.balance, p.canSend]).toEqual([
        2,
        2,
        2,
        100,
        true,
      ]);
      expect(sms.send).not.toHaveBeenCalled();
      expect(ledger).toEqual([]);
    });

    it('Bangla counts as more messages', async () => {
      const { service } = build();
      const p = await service.preview('doc', null, {
        date: TODAY,
        language: 'bn',
      });
      expect(p.rows[0].encoding).toBe('UCS-2');
      expect(p.rows[0].segments).toBe(2);
      expect(p.cost).toBe(4);
    });

    it('refuses a day that has passed, and a day with nobody in it', async () => {
      const { service, opd } = build();
      await expect(
        service.preview('doc', null, { date: '2026-10-27', language: 'en' }),
      ).rejects.toThrow(/passed/);
      expect(opd.list).not.toHaveBeenCalled();
      const empty = build({ visits: [] });
      await expect(
        empty.service.preview('doc', null, { date: TODAY, language: 'en' }),
      ).rejects.toThrow(/No one/);
      await expect(
        empty.service.preview('doc', null, {
          date: '2026-02-30',
          language: 'en',
        }),
      ).rejects.toThrow(/not a day/);
    });

    it('a missing or invalid number is skipped and said, never guessed', async () => {
      const { service } = build({
        visits: [
          visit({ name: 'A', phone: null }),
          visit({ name: 'B', phone: '0171100000' }),
          visit({ name: 'C', phone: '+8801911000000' }),
        ],
      });
      const p = await service.preview('doc', null, {
        date: TODAY,
        language: 'en',
      });
      expect(p.rows.map((r) => [r.name, r.mobile, r.skip])).toEqual([
        ['A', null, 'No mobile number.'],
        ['B', null, 'Not a valid Bangladeshi mobile number: 0171100000'],
        ['C', '01911000000', null],
      ]);
      expect(p.recipients).toBe(1);
      // The skipped patients keep their place, and so their time.
      expect(p.rows[2].minutes).toBe(18 * 60 + 20);
    });

    it('a patient already seen is not sent one', async () => {
      const { service } = build({
        visits: [
          visit({ name: 'A', status: 'done' }),
          visit({ name: 'B', rxStatus: 'complete' }),
          visit({ name: 'C' }),
        ],
      });
      const p = await service.preview('doc', null, {
        date: TODAY,
        language: 'en',
      });
      expect(p.rows.map((r) => r.skip)).toEqual([
        'Already seen.',
        'Already seen.',
        null,
      ]);
    });

    it('⚕️ reads the queue and schedule of the chamber on screen, and names THAT chamber', async () => {
      const b = build({
        chambers: [
          {
            id: 'def',
            name: 'Main chamber',
            address: 'labaid',
            isDefault: true,
          },
          {
            id: 'c2',
            name: 'Popular',
            address: 'Dhanmondi 2',
            isDefault: false,
          },
        ],
      });
      const p = await b.service.preview('doc', 'c2', {
        date: TODAY,
        language: 'en',
      });
      expect(b.opd.list).toHaveBeenCalledWith('doc', TODAY, 'c2');
      expect(b.opd.getSchedule).toHaveBeenCalledWith('doc', TODAY, 'c2');
      expect(p.chamber).toEqual({
        id: 'c2',
        name: 'Popular',
        address: 'Dhanmondi 2',
        text: 'Popular, Dhanmondi 2',
      });
      expect(p.rows[0].message).toContain('at Popular, Dhanmondi 2 at 6.00PM');
      // The default chamber: its app-given name "Main chamber" is not said.
      const d = await b.service.preview('doc', null, {
        date: TODAY,
        language: 'en',
      });
      expect(b.opd.list).toHaveBeenLastCalledWith('doc', TODAY, null);
      expect(d.chamber.text).toBe('labaid');
    });

    it('says what is missing, and builds nothing', async () => {
      const none = await build({
        chambers: [
          { id: 'def', name: 'Main chamber', address: '', isDefault: true },
        ],
      }).service.preview('doc', null, { date: TODAY, language: 'en' });
      expect(none.problems).toEqual([
        "Add this chamber's name or address in Settings → Chambers before sending SMS.",
      ]);
      expect(none.recipients).toBe(0);
      expect(none.canSend).toBe(false);
    });

    it('the title follows the recorded sex: জনাব / জনাবা, Mr. / Ms., none when not recorded', async () => {
      const b = build({
        visits: [
          visit({ name: 'A', gender: 'Male' }),
          visit({ name: 'B', gender: 'F', phone: '01811000000' }),
          visit({ name: 'C', gender: null, phone: '01911000000' }),
        ],
      });
      const bn = await b.service.preview('doc', null, {
        date: TODAY,
        language: 'bn',
      });
      expect(bn.rows.map((r) => (r.message as string).split(',')[0])).toEqual([
        'জনাব A',
        'জনাবা B',
        'C',
      ]);
      const en = await b.service.preview('doc', null, {
        date: TODAY,
        language: 'en',
      });
      expect(en.rows.map((r) => (r.message as string).split(',')[0])).toEqual([
        'Mr. A',
        'Ms. B',
        'C',
      ]);
    });

    it('balance short: cannot send', async () => {
      const p = await build({ balance: 1 }).service.preview('doc', null, {
        date: TODAY,
        language: 'en',
      });
      expect(p.cost).toBe(2);
      expect(p.canSend).toBe(false);
    });
  });

  describe('send', () => {
    const sendWith = async (
      b: ReturnType<typeof build>,
      language: 'en' | 'bn' = 'en',
      extra = {},
    ) => {
      const p = await b.service.preview('doc', null, { date: TODAY, language });
      return b.service.send('doc', 'user', null, {
        date: TODAY,
        language,
        previewSignature: p.signature,
        ...extra,
      });
    };

    it('sends each, charges what went', async () => {
      const b = build();
      const r = await sendWith(b);
      expect(b.sms.send).toHaveBeenCalledTimes(2);
      expect([r.sent, r.failed, r.skipped, r.charged, r.balance]).toEqual([
        2, 0, 0, 2, 98,
      ]);
      expect(b.ledger).toEqual([
        expect.objectContaining({ delta: -2, reason: 'send' }),
      ]);
      expect(b.jobs[0].status).toBe('done');
    });

    it('a failed message is said, and not charged', async () => {
      const b = build({ sendOk: (to) => to !== '01811000000' });
      const r = await sendWith(b);
      expect(r.results.map((x) => [x.name, x.status, x.detail])).toEqual([
        ['A', 'sent', 'Sent'],
        ['B', 'failed', 'Gateway rejected the message: error'],
      ]);
      expect([r.charged, r.balance]).toEqual([1, 99]);
      expect(b.ledger.map((l) => [l.delta, l.reason])).toEqual([
        [-2, 'send'],
        [1, 'refund'],
      ]);
    });

    it('not enough balance: nothing sent, nothing charged', async () => {
      const b = build({ balance: 1 });
      await expect(sendWith(b)).rejects.toThrow('Not enough SMS balance.');
      expect(b.sms.send).not.toHaveBeenCalled();
      expect(b.ledger).toEqual([]);
      expect(b.balance()).toBe(1);
    });

    it('an unconfigured gateway is refused before anything is reserved — never "sent"', async () => {
      const b = build({ configured: false });
      const err = await sendWith(b).catch((e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.message).toBe(SMS_NOT_CONFIGURED);
      expect(b.sms.send).not.toHaveBeenCalled();
      expect(b.ledger).toEqual([]);
    });

    it('a past day is refused', async () => {
      const b = build();
      await expect(
        b.service.send('doc', 'user', null, {
          date: '2026-10-27',
          language: 'en',
          previewSignature: 'x',
        }),
      ).rejects.toThrow(/passed/);
      expect(b.sms.send).not.toHaveBeenCalled();
    });

    it('what changed since the preview is not sent', async () => {
      const b = build();
      await expect(
        b.service.send('doc', 'user', null, {
          date: TODAY,
          language: 'en',
          previewSignature: 'stale',
        }),
      ).rejects.toThrow(ConflictException);
      expect(b.sms.send).not.toHaveBeenCalled();
    });

    it('the same SMS again within 30 minutes needs "Send again"', async () => {
      const b = build();
      await sendWith(b);
      const again = await sendWith(b).catch((e) => e);
      expect(again).toBeInstanceOf(ConflictException);
      expect(again.getResponse().code).toBe('SMS_REPEAT');
      expect(again.message).toMatch(
        /2 of these patients were sent this same SMS/,
      );
      expect(b.sms.send).toHaveBeenCalledTimes(2);
      const r = await sendWith(b, 'en', { confirmRepeat: true });
      expect(r.sent).toBe(2);
      expect(b.sms.send).toHaveBeenCalledTimes(4);
    });

    it('a send still running is not started twice', async () => {
      const b = build();
      b.jobs.push({
        id: 'j0',
        status: 'sending',
        createdAt: new Date(),
        doctorId: 'doc',
        day: TODAY,
        language: 'en',
      });
      const err = await sendWith(b).catch((e) => e);
      expect(err.getResponse().code).toBe('SMS_SENDING');
      expect(b.sms.send).not.toHaveBeenCalled();
    });
  });
});
