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
