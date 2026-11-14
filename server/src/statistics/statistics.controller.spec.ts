import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StatisticsController } from './statistics.controller';

// ⚕️ The chamber in the query is a claim. It is decided by `ChambersService.resolve`
// (another practice's chamber is a 404), never taken as sent — and never quietly
// widened to the total when it cannot be resolved.

function build() {
  const stats = {
    visitsByDay: jest.fn().mockResolvedValue({ month: '2026-11', days: [] }),
    visitsByMonth: jest.fn().mockResolvedValue({ year: '2026', months: [] }),
    overall: jest.fn().mockResolvedValue({}),
    diseases: jest.fn().mockResolvedValue({ diagnoses: [] }),
  };
  const chambers = { resolve: jest.fn() };
  return { stats, chambers, controller: new StatisticsController(stats as never, chambers as never) };
}

describe('StatisticsController — which chamber a question is about', () => {
  it.each([[undefined], [''], ['all']])('%p is every chamber of the practice, and no chamber is looked up', async (raw) => {
    const { stats, chambers, controller } = build();
    await controller.days('doc-1', '2026-11', raw);
    expect(chambers.resolve).not.toHaveBeenCalled();
    expect(stats.visitsByDay).toHaveBeenCalledWith('doc-1', { kind: 'all' }, '2026-11');
  });

  it('a chamber id is resolved for THIS practice, and what it resolves to is used', async () => {
    const { stats, chambers, controller } = build();
    chambers.resolve.mockResolvedValueOnce('ch-2');
    await controller.months('doc-1', '2026', 'ch-2');
    expect(chambers.resolve).toHaveBeenCalledWith('doc-1', 'ch-2');
    expect(stats.visitsByMonth).toHaveBeenCalledWith('doc-1', { kind: 'one', chamberId: 'ch-2' }, '2026');
  });

  it('the default chamber (resolved to null) is the default chamber — not the total', async () => {
    const { stats, chambers, controller } = build();
    chambers.resolve.mockResolvedValueOnce(null);
    await controller.overall('doc-1', 'ch-main');
    expect(stats.overall).toHaveBeenCalledWith('doc-1', { kind: 'one', chamberId: null });
  });

  it('another practice\'s or a removed chamber is a 404 and nothing is counted — not the total instead', async () => {
    const { stats, chambers, controller } = build();
    chambers.resolve.mockRejectedValueOnce(new NotFoundException('Chamber not found'));
    await expect(controller.days('doc-1', '2026-11', 'someone-elses')).rejects.toThrow(NotFoundException);
    expect(stats.visitsByDay).not.toHaveBeenCalled();
  });

  it('a chamber sent twice (?chamber=a&chamber=b) is refused, not guessed at', async () => {
    const { stats, chambers, controller } = build();
    await expect(controller.overall('doc-1', ['a', 'b'])).rejects.toThrow(BadRequestException);
    expect(chambers.resolve).not.toHaveBeenCalled();
    expect(stats.overall).not.toHaveBeenCalled();
  });

  it('the disease numbers take no chamber: a prescription holds none, and the practice is the workstation\'s', async () => {
    const { stats, controller } = build();
    await controller.diseases('doc-1');
    expect(stats.diseases).toHaveBeenCalledWith('doc-1');
  });
});
