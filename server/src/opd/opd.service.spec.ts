import { BadRequestException } from '@nestjs/common';
import { OpdService } from './opd.service';

// The OPD queue is booked per day (physician's sheet, 28/10/2026): a visit can
// be added or moved for TODAY or a LATER day, and a day that has passed is
// locked with what it holds. The rule is the server's — a client that forgets it
// (an old tab, another app) must still be refused — so each refusal below is
// checked to happen BEFORE anything is read for writing or written. What the
// database does with the rows that are allowed is in `test/opd-queue.int-spec.ts`.

function build() {
  const prisma = {
    $transaction: jest.fn(),
    opdVisit: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    opdDaySetting: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    patient: { findMany: jest.fn().mockResolvedValue([]) },
    supervisedDraft: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new OpdService(prisma as never) };
}

const nothingWritten = (prisma: ReturnType<typeof build>['prisma']) => {
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.opdVisit.update).not.toHaveBeenCalled();
  expect(prisma.opdDaySetting.upsert).not.toHaveBeenCalled();
};

describe('OpdService — what a day may be asked to do', () => {
  beforeAll(() => {
    // 28/10/2026, 16:00 in Dhaka. Only the clock is faked: promises and timers run.
    jest.useFakeTimers({
      now: new Date('2026-10-28T10:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'performance', 'hrtime'],
    });
  });
  afterAll(() => jest.useRealTimers());

  describe('create', () => {
    it('refuses a day that has passed', async () => {
      const { prisma, service } = build();
      await expect(service.create('doc', { name: 'Test Patient', date: '2026-10-27' })).rejects.toThrow(BadRequestException);
      await expect(service.create('doc', { name: 'Test Patient', date: '2026-10-27' })).rejects.toThrow(/passed/i);
      nothingWritten(prisma);
    });

    it('refuses a date that is not a day on the calendar', async () => {
      const { prisma, service } = build();
      for (const date of ['2026-02-30', '28/10/2026', 'tomorrow', '2026-13-01']) {
        await expect(service.create('doc', { name: 'Test Patient', date })).rejects.toThrow(/not a day/i);
      }
      nothingWritten(prisma);
    });
  });

  describe('list', () => {
    it('refuses a date that is not a day on the calendar', async () => {
      const { service } = build();
      await expect(service.list('doc', '2026-02-30')).rejects.toThrow(/not a day/i);
    });
  });

  describe('setStatus (Done)', () => {
    const visit = (queueDate: string | null, createdAt = new Date('2026-10-28T09:00:00Z')) => ({ id: 'v1', doctorId: 'doc', queueDate, createdAt, status: 'waiting' });

    it("is for today's queue only — a later day's patient is not seen yet", async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue(visit('2026-10-29'));
      await expect(service.setStatus('doc', 'v1', { status: 'done' })).rejects.toThrow(/today/i);
      expect(prisma.opdVisit.update).not.toHaveBeenCalled();
    });

    it("and a day that has passed keeps what it holds", async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue(visit('2026-10-27'));
      await expect(service.setStatus('doc', 'v1', { status: 'done' })).rejects.toThrow(/today/i);
      expect(prisma.opdVisit.update).not.toHaveBeenCalled();
    });

    it("a row an older build wrote with no day is read as the day it was created", async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue(visit(null, new Date('2026-10-28T03:00:00Z')));
      prisma.opdVisit.update.mockResolvedValue({ id: 'v1' });
      await service.setStatus('doc', 'v1', { status: 'done' });
      expect(prisma.opdVisit.update).toHaveBeenCalledTimes(1);
    });

    it('an older row of an earlier day with no day is locked too', async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue(visit(null, new Date('2026-10-27T10:00:00Z')));
      await expect(service.setStatus('doc', 'v1', { status: 'done' })).rejects.toThrow(/today/i);
      expect(prisma.opdVisit.update).not.toHaveBeenCalled();
    });
  });

  describe('move', () => {
    it('refuses a visit of a day that has passed', async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue({ id: 'v1', doctorId: 'doc', queueDate: '2026-10-27', createdAt: new Date('2026-10-27T09:00:00Z') });
      await expect(service.move('doc', 'v1', { direction: 'up' })).rejects.toThrow(/passed/i);
      nothingWritten(prisma);
    });

    it('is not found for a visit of another doctor', async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue(null);
      await expect(service.move('doc', 'v1', { direction: 'up' })).rejects.toThrow(/not found/i);
      nothingWritten(prisma);
    });
  });

  describe('saveSchedule', () => {
    const good = { date: '2026-10-29', startTime: '18:00', breakStart: '20:00', breakEnd: '21:00', minutesPerPatient: 10 };

    it('refuses a day that has passed', async () => {
      const { prisma, service } = build();
      await expect(service.saveSchedule('doc', { ...good, date: '2026-10-27' })).rejects.toThrow(/passed/i);
      nothingWritten(prisma);
    });

    it('refuses what the schedule rules refuse, in their words', async () => {
      const { prisma, service } = build();
      await expect(service.saveSchedule('doc', { ...good, breakEnd: null })).rejects.toThrow('A break needs both its start and its end.');
      await expect(service.saveSchedule('doc', { ...good, breakStart: '21:00', breakEnd: '20:00' })).rejects.toThrow('The break must end after it starts.');
      nothingWritten(prisma);
    });

    it('refuses a date that is not a day on the calendar', async () => {
      const { prisma, service } = build();
      await expect(service.saveSchedule('doc', { ...good, date: '2026-02-30' })).rejects.toThrow(/not a day/i);
      nothingWritten(prisma);
    });
  });

  describe('setPresence', () => {
    it("refuses a visit that is not this doctor's, before writing", async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue(null);
      await expect(service.setPresence('doc', 'v1', { present: true })).rejects.toThrow(/not found/i);
      expect(prisma.opdVisit.update).not.toHaveBeenCalled();
    });

    it("refuses any day but today's, before writing", async () => {
      for (const queueDate of ['2026-10-27', '2026-10-29']) {
        const { prisma, service } = build();
        prisma.opdVisit.findFirst.mockResolvedValue({ id: 'v1', queueDate, createdAt: new Date(), presentAt: null });
        await expect(service.setPresence('doc', 'v1', { present: true })).rejects.toThrow(/today/i);
        expect(prisma.opdVisit.update).not.toHaveBeenCalled();
      }
    });

    it('records the server time on present and keeps the first time when pressed again', async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue({ id: 'v1', queueDate: '2026-10-28', createdAt: new Date(), presentAt: null });
      prisma.opdVisit.update.mockImplementation(async ({ data }: { data: object }) => data);
      const first = (await service.setPresence('doc', 'v1', { present: true })) as unknown as { presentAt: Date };
      expect(first.presentAt.toISOString()).toBe('2026-10-28T10:00:00.000Z');

      const earlier = new Date('2026-10-28T09:00:00Z');
      prisma.opdVisit.findFirst.mockResolvedValue({ id: 'v1', queueDate: '2026-10-28', createdAt: new Date(), presentAt: earlier });
      prisma.opdVisit.update.mockClear();
      await service.setPresence('doc', 'v1', { present: true });
      expect(prisma.opdVisit.update.mock.calls[0][0].data).not.toHaveProperty('presentAt');
    });

    it('clears the time on present:false and changes only the fields sent', async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue({ id: 'v1', queueDate: '2026-10-28', createdAt: new Date(), presentAt: new Date() });
      prisma.opdVisit.update.mockImplementation(async ({ data }: { data: object }) => data);
      expect(await service.setPresence('doc', 'v1', { present: false })).toEqual({ presentAt: null });
      expect(await service.setPresence('doc', 'v1', { urgent: true })).toEqual({ urgent: true });
    });
  });
});
