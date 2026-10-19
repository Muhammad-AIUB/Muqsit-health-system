import { ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PatientsService } from './patients.service';
import type { PrismaService } from '../prisma/prisma.service';

// Pins two owner-record boundaries from the 2026-09-29 review:
// - a SUPERVISING doctor can open a patient (accessibleWhere) but must not
//   rewrite the owner's family tree through /patients/link;
// - the owner's DELETE must not cascade away another doctor's prescriptions,
//   which the owner cannot even see.

const OWNER = 'owner-doctor';
const SUPERVISOR = 'supervising-doctor';

const makePrisma = (patient: { id: string; doctorId: string }, foreignRx = 0) => {
  const del = jest.fn().mockResolvedValue({});
  const transaction = jest.fn();
  return {
    prisma: {
      patient: {
        findFirst: jest.fn().mockResolvedValue(patient),
        delete: del,
      },
      prescription: { count: jest.fn().mockResolvedValue(foreignRx) },
      // A supervising practice's own parked visit (none here) — read with the patient.
      supervisedDraft: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: transaction,
    } as unknown as PrismaService,
    del,
    transaction,
  };
};

// ⚕️ Release gate (review, 19/10/2026): a read by a supervising practice asks
// `SupervisedDraft`, a table applied by hand (manual-supervised-draft.sql).
// Missing, it must cost the parked visit — read as none, as before that table —
// and never the patient: every supervised patient answered 500.
describe('PatientsService — a supervising practice read without the SupervisedDraft table', () => {
  it('answers the patient with no parked visit, and says so in the log', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    const missing = new Prisma.PrismaClientKnownRequestError('The table `public.SupervisedDraft` does not exist', { code: 'P2021', clientVersion: 'x' });
    const prisma = {
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', doctorId: OWNER, incompleteRx: { owner: 'visit' } }) },
      supervisedDraft: { findMany: jest.fn().mockRejectedValue(missing) },
    } as unknown as PrismaService;
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const p = await new PatientsService(prisma).get(SUPERVISOR, 'p1');
    expect(p.incompleteRx).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('any other failure is still a failure', async () => {
    const prisma = {
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', doctorId: OWNER, incompleteRx: null }) },
      supervisedDraft: { findMany: jest.fn().mockRejectedValue(new Error('connection lost')) },
    } as unknown as PrismaService;
    await expect(new PatientsService(prisma).get(SUPERVISOR, 'p1')).rejects.toThrow('connection lost');
  });
});

describe('PatientsService — owner-record boundaries', () => {
  it('linkNew refuses a supervising doctor and writes nothing', async () => {
    const { prisma, transaction } = makePrisma({ id: 'p1', doctorId: OWNER });
    await expect(
      new PatientsService(prisma).linkNew(SUPERVISOR, { existingId: 'p1', name: 'X', relation: 'Son' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('remove refuses while another doctor holds prescriptions for the patient', async () => {
    const { prisma, del } = makePrisma({ id: 'p1', doctorId: OWNER }, 2);
    await expect(new PatientsService(prisma).remove(OWNER, 'p1')).rejects.toBeInstanceOf(ConflictException);
    expect(del).not.toHaveBeenCalled();
  });

  it('remove still deletes when every prescription is the owner\'s own', async () => {
    const { prisma, del } = makePrisma({ id: 'p1', doctorId: OWNER }, 0);
    await expect(new PatientsService(prisma).remove(OWNER, 'p1')).resolves.toEqual({ id: 'p1' });
    expect(del).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});

// A supervising doctor may open the patient but never sees the owner's
// in-progress prescription (docs/DOMAIN.md).
describe('forViewer', () => {
  const { forViewer } = jest.requireActual('./patients.service') as typeof import('./patients.service');
  const p = { id: 'p1', doctorId: OWNER, incompleteRx: { rxItems: ['x'] } };

  it('keeps the draft for the owner', () => {
    expect(forViewer(p, OWNER).incompleteRx).toEqual({ rxItems: ['x'] });
  });

  it('blanks the draft for anyone else', () => {
    expect(forViewer(p, SUPERVISOR).incompleteRx).toBeNull();
    expect(p.incompleteRx).toEqual({ rxItems: ['x'] }); // never mutates the row
  });
});
