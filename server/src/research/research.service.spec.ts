import { ResearchService } from './research.service';
import type { PrismaService } from '../prisma/prisma.service';

// The owner and a supervising doctor never see each other's prescriptions
// (server/CLAUDE.md, Rule 2) — research diagnoses must come from own Rx only.
describe('ResearchService.search', () => {
  it('reads diagnoses only from the searching doctor\'s own prescriptions', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { patient: { findMany } } as unknown as PrismaService;

    await new ResearchService(prisma).search('d1', 'hiv');

    const args = findMany.mock.calls[0][0];
    expect(args.where.doctorId).toBe('d1');
    expect(args.select.prescriptions.where).toEqual({ doctorId: 'd1' });
  });
});
