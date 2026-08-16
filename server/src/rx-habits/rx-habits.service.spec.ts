import { Logger, NotFoundException } from '@nestjs/common';
import { RxHabitsService } from './rx-habits.service';
import type { PrismaService } from '../prisma/prisma.service';

// ⚕️ "Silence toward the doctor, noise toward the operator" (design §8 rule 8).
//
// An empty result, a failed query and a MISSING TABLE all look identical on the
// prescribing screen — correct for the doctor, and a trap for everyone else.
// This repo has already shipped two committed-but-unapplied manual migrations,
// and the deploy workflow does not run them, so a dead feature that says
// nothing is a realistic outcome. These tests pin both halves: the doctor sees
// nothing, the operator sees a log line, and the API never goes down for it.

const brokenPrisma = (err: Error): PrismaService =>
  ({
    $queryRaw: jest.fn().mockRejectedValue(err),
    $queryRawUnsafe: jest.fn().mockRejectedValue(err),
  }) as unknown as PrismaService;

describe('RxHabitsService.onModuleInit — the boot check', () => {
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('NEVER throws when the table is missing — a convenience must not take the API down', async () => {
    const svc = new RxHabitsService(brokenPrisma(new Error('relation "DoctorRxHabit" does not exist')));
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('logs exactly one ERROR naming the migration to apply', async () => {
    const svc = new RxHabitsService(brokenPrisma(new Error('relation "DoctorRxHabit" does not exist')));
    await svc.onModuleInit();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('manual-rx-habits.sql');
  });

  it('says nothing at all when the table is readable', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as unknown as PrismaService;
    await new RxHabitsService(prisma).onModuleInit();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('RxHabitsService.list — a failed lookup is silence, never an error', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns [] instead of throwing when the query fails', async () => {
    const svc = new RxHabitsService(brokenPrisma(new Error('connection lost')));
    await expect(svc.list('doc_1', 'napa')).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled(); // the operator hears about it
  });

  it('never queries at all for a query under 2 characters', async () => {
    const $queryRaw = jest.fn();
    const svc = new RxHabitsService({ $queryRaw } as unknown as PrismaService);
    expect(await svc.list('doc_1', 'n')).toEqual([]);
    expect(await svc.list('doc_1', '')).toEqual([]);
    expect(await svc.list('doc_1', '  ')).toEqual([]);
    // "tab" alone normalises to an empty search key — a dosage form is not a
    // medicine name, and it must not return every tablet the doctor prescribes.
    expect(await svc.list('doc_1', 'tab.')).toEqual([]);
    expect($queryRaw).not.toHaveBeenCalled();
  });
});

describe('RxHabitsService.setFlags — ownership and the audit line', () => {
  afterEach(() => jest.restoreAllMocks());

  const row = {
    id: 'h1', doctorId: 'doc_1', drugLabel: 'Tablet. Napa 500mg',
    dose: '1+1+1', food: 'after meal', duration: '7 days', contLines: [],
    patientCount: 2, lastUsedAt: new Date(), pinned: false, hidden: false,
  };

  function svcWith(found: unknown) {
    const findFirst = jest.fn().mockResolvedValue(found);
    const update = jest.fn().mockImplementation(({ data }) => ({ ...row, ...data }));
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      doctorRxHabit: { findFirst, update },
      activityLog: { create },
    } as unknown as PrismaService;
    return { svc: new RxHabitsService(prisma), findFirst, update, create };
  }

  it("404s on another doctor's habit id, and changes nothing", async () => {
    const { svc, update } = svcWith(null);
    await expect(svc.setFlags('doc_2', 'Dr B', 'h1', { hidden: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('scopes the ownership lookup by doctorId, not by id alone', async () => {
    const { svc, findFirst } = svcWith(row);
    await svc.setFlags('doc_1', 'Dr A', 'h1', { hidden: true });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'h1', doctorId: 'doc_1' } });
  });

  it('writes an audit line naming who hid what', async () => {
    const { svc, create } = svcWith(row);
    await svc.setFlags('doc_1', 'Dr A', 'h1', { hidden: true });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({ doctorId: 'doc_1', actorName: 'Dr A', section: 'Prescribing habits' });
    expect(data.patientId).toBeUndefined(); // not about one patient
    expect(data.detail).toContain('Tablet. Napa 500mg');
    expect(data.detail).toContain('1+1+1 · after meal · 7 days');
    expect(data.detail.length).toBeLessThanOrEqual(400); // ActivityLog.detail cap
  });

  it('writes an audit line on RESTORE too', async () => {
    const { svc, create } = svcWith({ ...row, hidden: true });
    await svc.setFlags('doc_1', 'Dr A', 'h1', { hidden: false });
    expect(String(create.mock.calls[0][0].data.detail)).toContain('Restored');
  });

  it('does NOT log when the flag did not actually change', async () => {
    const { svc, create } = svcWith(row); // already hidden: false
    await svc.setFlags('doc_1', 'Dr A', 'h1', { hidden: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('still reports success when the audit write fails — the click did work', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const findFirst = jest.fn().mockResolvedValue(row);
    const update = jest.fn().mockResolvedValue({ ...row, hidden: true });
    const prisma = {
      doctorRxHabit: { findFirst, update },
      activityLog: { create: jest.fn().mockRejectedValue(new Error('nope')) },
    } as unknown as PrismaService;
    await expect(
      new RxHabitsService(prisma).setFlags('doc_1', 'Dr A', 'h1', { hidden: true }),
    ).resolves.toMatchObject({ id: 'h1' });
  });
});
