import { Logger } from '@nestjs/common';
import { PatientChatService } from './patient-chat.service';
import type { PrismaService } from '../prisma/prisma.service';

// A thread longer than the page size must still show its NEWEST messages.
// Sorting ascending with `take` returned the oldest 500 and hid every new one.
describe('PatientChatService.listMessages', () => {
  it('fetches the newest page and returns it oldest-first', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'm3', authorId: 'u1', createdAt: new Date('2026-09-29T10:03:00Z') },
      { id: 'm2', authorId: 'u2', createdAt: new Date('2026-09-29T10:02:00Z') },
    ]);
    const prisma = {
      patient: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', doctorId: 'd1' }) },
      patientChatMessage: { findMany },
    } as unknown as PrismaService;

    const rows = await new PatientChatService(prisma).listMessages('p1', 'u1', 'd1');

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    expect(rows.map((r) => r.id)).toEqual(['m2', 'm3']);
    expect(rows.map((r) => r.mine)).toEqual([false, true]);
  });
});

// ⚕️ Third review (19/10/2026): removing a supervising doctor took their parked
// visit in the SAME transaction — so without the SupervisedDraft table (its SQL
// applied by hand) the whole removal failed, and the supervisor kept access.
// The link goes first and always; the parked visit after it, as best it can.
describe('PatientChatService.removeSupervisor', () => {
  const make = (draftDelete: jest.Mock) => {
    const linkDelete = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      patient: { findUnique: jest.fn().mockResolvedValue({ doctorId: 'owner' }) },
      patientSupervisor: { deleteMany: linkDelete },
      supervisedDraft: { deleteMany: draftDelete },
    } as unknown as PrismaService;
    return { service: new PatientChatService(prisma), linkDelete };
  };

  it('takes the link away even when the parked-visit table is missing', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    const missing = new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2021', clientVersion: 'x' });
    const { service, linkDelete } = make(jest.fn().mockRejectedValue(missing));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await expect(service.removeSupervisor('p1', 'owner', 'sup')).resolves.toEqual({ doctorId: 'sup' });
    expect(linkDelete).toHaveBeenCalledWith({ where: { patientId: 'p1', doctorId: 'sup' } });
    warn.mockRestore();
  });

  it("takes that practice's parked visit for this patient, and nobody else's", async () => {
    const draftDelete = jest.fn().mockResolvedValue({ count: 1 });
    const { service } = make(draftDelete);
    await service.removeSupervisor('p1', 'owner', 'sup');
    expect(draftDelete).toHaveBeenCalledWith({ where: { patientId: 'p1', doctorId: 'sup' } });
  });
});

