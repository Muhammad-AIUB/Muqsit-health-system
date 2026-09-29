import { ConflictException, ForbiddenException } from '@nestjs/common';
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
      $transaction: transaction,
    } as unknown as PrismaService,
    del,
    transaction,
  };
};

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
