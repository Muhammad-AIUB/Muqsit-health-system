import { Logger, NotFoundException } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RxHabitsService } from '../rx-habits/rx-habits.service';
import type { DoctorPhrasesService } from '../doctor-phrases/doctor-phrases.service';

// ⚕️ REGRESSION SPEC — the single most important write path in the product.
//
// `create()` is existing, working code that the prescribing-habit feature
// modifies. "Save & print" is how a visit becomes a record, and the client
// opens the printable sheet on the strength of this call returning. If a habit
// write — a CONVENIENCE — can fail the request, a doctor sees a save error for
// a prescription that was in fact committed, or the sheet never opens.
//
// So: the prescription must be returned even when the habit layer throws,
// hangs on a dead table, or is handed something unexpected.

const RX = {
  id: 'rx_1',
  patientId: 'pt_1',
  doctorId: 'doc_1',
  // One ADVICE line and one free-typed ℞ NOTE line, so the phrase learner has
  // both of its sources to pick apart.
  advice: ['Insulin as before'],
  items: [
    { id: 'i1', drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', instruction: '', order: 0, isNote: false },
    { id: 'i2', drug: 'Review sugar chart', dose: '', duration: '', instruction: '', order: 1, isNote: true },
  ],
};

const DTO = {
  patientId: 'pt_1',
  items: [{ drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', instruction: '' }],
} as never;

function makeService(habitImpl: () => Promise<void>) {
  const create = jest.fn().mockResolvedValue(RX);
  const prisma = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pt_1', doctorId: 'doc_1' }) },
    prescription: { create },
  } as unknown as PrismaService;

  const recordFrom = jest.fn(habitImpl);
  const habits = { recordFrom } as unknown as RxHabitsService;
  const recordPhrases = jest.fn(async () => {});
  const phrases = { recordFrom: recordPhrases } as unknown as DoctorPhrasesService;

  return {
    service: new PrescriptionsService(prisma, habits, phrases),
    create, recordFrom, recordPhrases, prisma,
  };
}

describe('PrescriptionsService.create — the habit write must never cost the record', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    // The failure has to be visible to the operator, so assert it is logged —
    // but keep it out of the test output.
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns the prescription when the habit write THROWS', async () => {
    const { service, create } = makeService(() => {
      throw new Error('DoctorRxHabit does not exist');
    });
    await expect(service.create('doc_1', DTO)).resolves.toBe(RX);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns the prescription when the habit write REJECTS', async () => {
    const { service } = makeService(() => Promise.reject(new Error('connection lost')));
    await expect(service.create('doc_1', DTO)).resolves.toBe(RX);
  });

  it('returns the prescription when the habit layer throws a non-Error', async () => {
    const { service } = makeService(() => Promise.reject('just a string'));
    await expect(service.create('doc_1', DTO)).resolves.toBe(RX);
  });

  it('AWAITS the habit write — a detached promise is lost on the next pm2 restart', async () => {
    let settled = false;
    const { service } = makeService(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            settled = true;
            resolve();
          }, 20),
        ),
    );
    await service.create('doc_1', DTO);
    expect(settled).toBe(true);
  });

  it('writes the habit AFTER the prescription is committed, never before', async () => {
    const order: string[] = [];
    const create = jest.fn().mockImplementation(async () => {
      order.push('prescription.create');
      return RX;
    });
    const prisma = {
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pt_1' }) },
      prescription: { create },
    } as unknown as PrismaService;
    const habits = {
      recordFrom: jest.fn(async () => {
        order.push('habits.recordFrom');
      }),
    } as unknown as RxHabitsService;

    const phrases = { recordFrom: jest.fn(async () => {}) } as unknown as DoctorPhrasesService;
    await new PrescriptionsService(prisma, habits, phrases).create('doc_1', DTO);
    expect(order).toEqual(['prescription.create', 'habits.recordFrom']);
  });

  it('passes the committed prescription id so the patient is not double-counted', async () => {
    const { service, recordFrom } = makeService(async () => {});
    await service.create('doc_1', DTO);
    expect(recordFrom).toHaveBeenCalledWith('doc_1', 'pt_1', 'rx_1', RX.items);
  });

  // ⚕️ The free-text sibling learns from the SAME committed prescription, and
  // gets the same guarantee: it can never cost the record.
  it('hands the phrase learner the advice lines and the ℞ note lines', async () => {
    const { service, recordPhrases } = makeService(async () => {});
    await service.create('doc_1', DTO);
    expect(recordPhrases).toHaveBeenCalledWith('doc_1', 'pt_1', 'rx_1', {
      advice: ['Insulin as before'],
      noteTexts: ['Review sugar chart'],   // the medicine line is NOT a phrase
    });
  });

  it('logs a warning when the habit write fails, so the operator can see it', async () => {
    const { service } = makeService(() => Promise.reject(new Error('boom')));
    await service.create('doc_1', DTO);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('rx_1');
  });

  it('still refuses a patient that is neither owned nor supervised', async () => {
    const prisma = {
      patient: { findFirst: jest.fn().mockResolvedValue(null) },
      prescription: { create: jest.fn() },
    } as unknown as PrismaService;
    const habits = { recordFrom: jest.fn() } as unknown as RxHabitsService;
    const phrases = { recordFrom: jest.fn() } as unknown as DoctorPhrasesService;
    const service = new PrescriptionsService(prisma, habits, phrases);

    await expect(service.create('doc_1', DTO)).rejects.toBeInstanceOf(NotFoundException);
    expect(habits.recordFrom).not.toHaveBeenCalled();
  });
});
