import { WardsService } from './wards.service';
import type { PrismaService } from '../prisma/prisma.service';

// Renaming "ward 3" to "Ward 3" changes only capitalisation; the
// case-insensitive clash check must not find the ward itself.
describe('WardsService.rename', () => {
  it('excludes the ward being renamed from the name-clash check', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce({ id: 'w1', doctorId: 'd1', name: 'ward 3' }) // ensureOwned
      .mockResolvedValueOnce(null); // ensureNameFree
    const prisma = {
      ward: { findFirst, update: jest.fn() },
      ipdAdmission: { updateMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const service = new WardsService(prisma);
    // `get` is private; stub it so the test stays on the clash check.
    (service as unknown as { get: () => Promise<unknown> }).get = jest.fn().mockResolvedValue({});

    await service.rename('d1', 'w1', { name: 'Ward 3' });

    const clashWhere = findFirst.mock.calls[1][0].where;
    expect(clashWhere.id).toEqual({ not: 'w1' });
    expect(clashWhere.name).toEqual({ equals: 'Ward 3', mode: 'insensitive' });
  });
});
