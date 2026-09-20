import { Logger, NotFoundException } from '@nestjs/common';
import { DoctorPhrasesService } from './doctor-phrases.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * ⚕️ The two rules this file exists to hold down, both inherited from the
 * prescribing-habit feature:
 *
 *  • `patientCount` counts DISTINCT PATIENTS. If it ever counted prescriptions,
 *    one long-term patient returning monthly would make a line written for them
 *    alone look like this doctor's routine practice — and the count is the only
 *    thing separating those two.
 *  • A suggestion the doctor HID stays hidden, even when they write the same
 *    line again by hand.
 */

/** Captures what the service would have written, without a database. */
function makePrisma(prior: Array<{ advice?: string[]; items?: Array<{ drug: string }> }> = []) {
  const upsert = jest.fn().mockImplementation((args: unknown) => args);
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    prescription: { findMany: jest.fn().mockResolvedValue(prior) },
    doctorPhraseHabit: { upsert, findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    activityLog: { create: jest.fn().mockResolvedValue({}) },
    // The service passes an array of upsert promises; the mock just resolves it.
    $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => ops),
  } as unknown as PrismaService;
  return { prisma, upsert };
}

const write = (upsert: jest.Mock, signature: string) =>
  upsert.mock.calls.map((c) => c[0]).find((a) => a.where.doctorId_source_signature.signature === signature);

describe('recordFrom — what gets learned', () => {
  it('learns an advice line and a ℞ note line, kept apart by source', async () => {
    const { prisma, upsert } = makePrisma();
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_1', {
      advice: ['Insulin as before'],
      noteTexts: ['Review sugar chart'],
    });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(write(upsert, 'insulin as before').where.doctorId_source_signature.source).toBe('advice');
    expect(write(upsert, 'review sugar chart').where.doctorId_source_signature.source).toBe('rxNote');
  });

  // Verbatim, always: the signature folds typography, the stored text does not.
  it('stores the doctor’s own spelling, not the normalised key', async () => {
    const { prisma, upsert } = makePrisma();
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_1', {
      advice: ['  Insulin as before.  '],
    });
    const w = write(upsert, 'insulin as before');
    expect(w.create.text).toBe('Insulin as before.');
    expect(w.update.text).toBe('Insulin as before.');
  });

  it('writes one row when the same line appears twice on one sheet', async () => {
    const { prisma, upsert } = makePrisma();
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_1', {
      advice: ['Insulin as before', 'insulin as before.'],
    });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('skips a stray keystroke and a blank line', async () => {
    const { prisma, upsert } = makePrisma();
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_1', {
      advice: ['x', '', '   ', 'Insulin as before'],
    });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when there is nothing to learn', async () => {
    const { prisma, upsert } = makePrisma();
    const svc = new DoctorPhrasesService(prisma);
    await svc.recordFrom('doc_1', 'pt_1', 'rx_1', { advice: [], noteTexts: [] });
    await svc.recordFrom('doc_1', 'pt_1', 'rx_1', {});
    expect(upsert).not.toHaveBeenCalled();
    expect(prisma.prescription.findMany).not.toHaveBeenCalled(); // not even the lookup
  });

  it('never touches `hidden`, so a suppressed line stays suppressed', async () => {
    const { prisma, upsert } = makePrisma();
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_1', {
      advice: ['Insulin as before'],
    });
    expect(write(upsert, 'insulin as before').update).not.toHaveProperty('hidden');
  });
});

describe('recordFrom — patientCount counts DISTINCT PATIENTS', () => {
  it('counts a first-time phrase as one patient', async () => {
    const { prisma, upsert } = makePrisma([]);
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_2', {
      advice: ['Insulin as before'],
    });
    const w = write(upsert, 'insulin as before');
    expect(w.create.patientCount).toBe(1);
    expect(w.update).toHaveProperty('patientCount', { increment: 1 });
  });

  // ⚕️ The rule. The same patient writing the same line on a second visit — or
  // a re-saved visit, or a reprint — must NOT move the count.
  it('does not increment for a patient who already wrote that line', async () => {
    const { prisma, upsert } = makePrisma([{ advice: ['insulin as before.'] }]);
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_2', {
      advice: ['Insulin as before'],
    });
    expect(write(upsert, 'insulin as before').update).not.toHaveProperty('patientCount');
  });

  it('recognises the earlier contribution through a ℞ note too', async () => {
    const { prisma, upsert } = makePrisma([{ items: [{ drug: 'Review sugar chart' }] }]);
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_2', {
      noteTexts: ['Review sugar chart'],
    });
    expect(write(upsert, 'review sugar chart').update).not.toHaveProperty('patientCount');
  });

  // Same words, other surface: an advice line and a note line are separate rows
  // and separate counts.
  it('still increments when the earlier use was on the OTHER surface', async () => {
    const { prisma, upsert } = makePrisma([{ advice: ['Insulin as before'] }]);
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_2', {
      noteTexts: ['Insulin as before'],
    });
    expect(write(upsert, 'insulin as before').update).toHaveProperty('patientCount', { increment: 1 });
  });

  it('excludes the prescription being learned from, so it cannot see itself', async () => {
    const { prisma } = makePrisma();
    await new DoctorPhrasesService(prisma).recordFrom('doc_1', 'pt_1', 'rx_9', {
      advice: ['Insulin as before'],
    });
    const where = (prisma.prescription.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toMatchObject({ doctorId: 'doc_1', patientId: 'pt_1', id: { not: 'rx_9' } });
  });
});

describe('list — scoped, ordered, and silent on failure', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('asks only for this doctor, this surface, and nothing hidden', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { doctorPhraseHabit: { findMany } } as unknown as PrismaService;
    await new DoctorPhrasesService(prisma).list('doc_1', 'advice', 'Insu');
    expect(findMany.mock.calls[0][0].where).toEqual({
      doctorId: 'doc_1',
      source: 'advice',
      hidden: false,
      signature: { contains: 'insu' },   // the query is normalised like the key
    });
  });

  it('offers the most-used lines when the box is still empty', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { doctorPhraseHabit: { findMany } } as unknown as PrismaService;
    await new DoctorPhrasesService(prisma).list('doc_1', 'advice', '');
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('signature');
    expect(findMany.mock.calls[0][0].orderBy[0]).toEqual({ patientCount: 'desc' });
  });

  // On a clinical screen "no suggestions" and "the lookup failed" must not look
  // alike, and the safe rendering of both is silence plus a working field.
  it('returns nothing and logs when the query fails', async () => {
    const prisma = {
      doctorPhraseHabit: { findMany: jest.fn().mockRejectedValue(new Error('boom')) },
    } as unknown as PrismaService;
    await expect(new DoctorPhrasesService(prisma).list('doc_1', 'advice', 'x')).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

describe('setHidden', () => {
  const row = { id: 'p1', text: 'Insulin as before', hidden: false, patientCount: 3 };
  const makeUpdater = () => {
    const update = jest.fn().mockResolvedValue({ id: 'p1', text: row.text, patientCount: 3 });
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      doctorPhraseHabit: { findFirst: jest.fn().mockResolvedValue(row), update },
      activityLog: { create },
    } as unknown as PrismaService;
    return { prisma, update, create };
  };

  it('hides a suggestion and files an audit line', async () => {
    const { prisma, update, create } = makeUpdater();
    await new DoctorPhrasesService(prisma).setHidden('doc_1', 'Dr X', 'p1', true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { hidden: true } }));
    expect(String(create.mock.calls[0][0].data.detail)).toContain('Insulin as before');
  });

  // Another doctor's id is a 404, not someone else's row.
  it('refuses an id that is not this doctor’s', async () => {
    const prisma = {
      doctorPhraseHabit: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(new DoctorPhrasesService(prisma).setHidden('doc_1', 'Dr X', 'p1', true))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('onModuleInit — the boot check', () => {
  let error: jest.SpyInstance;
  beforeEach(() => {
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('NEVER throws when the table is missing — a convenience must not take the API down', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('relation "DoctorPhraseHabit" does not exist')),
    } as unknown as PrismaService;
    const svc = new DoctorPhrasesService(prisma);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
    expect(String(error.mock.calls[0][0])).toContain('manual-doctor-phrase-habit.sql');
  });

  it('says nothing when the table is readable', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as unknown as PrismaService;
    await new DoctorPhrasesService(prisma).onModuleInit();
    expect(error).not.toHaveBeenCalled();
  });
});
