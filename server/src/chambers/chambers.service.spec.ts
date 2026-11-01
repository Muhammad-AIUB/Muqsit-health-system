import { NotFoundException } from '@nestjs/common';
import { ChambersService } from './chambers.service';

// ⚕️ `resolve` is the one place that decides which chamber a request acts on.
describe('ChambersService.resolve', () => {
  const rows = [
    { id: 'def', doctorId: 'd1', isDefault: true, removedAt: null },
    { id: 'ibn', doctorId: 'd1', isDefault: false, removedAt: null },
    { id: 'gone', doctorId: 'd1', isDefault: false, removedAt: new Date() },
    { id: 'theirs', doctorId: 'd2', isDefault: false, removedAt: null },
  ];
  const prisma = {
    opdChamber: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; doctorId: string; removedAt: null } }) =>
        rows.find((r) => r.id === where.id && r.doctorId === where.doctorId && r.removedAt === null) ?? null),
    },
  };
  const svc = new ChambersService(prisma as never);

  it('no header is the default chamber (NULL), without a lookup', async () => {
    prisma.opdChamber.findFirst.mockClear();
    await expect(svc.resolve('d1', undefined)).resolves.toBeNull();
    expect(prisma.opdChamber.findFirst).not.toHaveBeenCalled();
  });
  it("the default chamber's own id is NULL too — its rows are stored as NULL", async () => {
    await expect(svc.resolve('d1', 'def')).resolves.toBeNull();
  });
  it('another live chamber of the practice is its id', async () => {
    await expect(svc.resolve('d1', 'ibn')).resolves.toBe('ibn');
  });
  it.each([['a removed chamber', 'gone'], ["another practice's chamber", 'theirs'], ['a made-up id', 'nope']])(
    '%s is 404, never the default', async (_w, id) => {
      await expect(svc.resolve('d1', id)).rejects.toBeInstanceOf(NotFoundException);
    },
  );
});
