import { BadRequestException, Logger } from '@nestjs/common';
import { DrugAdviceService } from './drug-advice.service';
import { adviceKey, cleanLines, genericKey } from './keys';
import type { PrismaService } from '../prisma/prisma.service';

// ⚕️ The key decides which medicines a doctor's advice is offered on. Folding
// typography is the whole job; folding a strength or a form qualifier would
// put one medicine's advice on another.
describe('drug advice keys', () => {
  it('folds typography of a medicine line, keeping the strength', () => {
    expect(adviceKey('medicine', 'Tablet. Napa 500 mg')).toBe(adviceKey('medicine', 'tab napa 500mg'));
    expect(adviceKey('medicine', 'Tablet. Napa 500 mg')).not.toBe(adviceKey('medicine', 'Tablet. Napa 665 mg'));
  });

  it('never folds a form qualifier', () => {
    expect(adviceKey('medicine', 'SC Injection. Actrapid 100 IU/ml')).not.toBe(adviceKey('medicine', 'Injection. Actrapid 100 IU/ml'));
  });

  it('folds a generic for case and spacing only', () => {
    expect(genericKey('  Paracetamol ')).toBe('paracetamol');
    expect(genericKey('Empagliflozin +  Linagliptin')).toBe('empagliflozin + linagliptin');
    expect(adviceKey('generic', 'Paracetamol')).toBe(genericKey('paracetamol'));
  });

  it('cleans lines without changing a word: trims, drops blanks and exact repeats', () => {
    expect(cleanLines([' Take after meal ', '', 'Take after meal', 'Avoid alcohol', 7 as unknown])).toEqual([
      'Take after meal',
      'Avoid alcohol',
    ]);
  });
});

describe('DrugAdviceService.save', () => {
  const upsert = jest.fn(async (args: { create: Record<string, unknown> }) => ({ id: 'a1', updatedAt: new Date(), ...args.create }));
  const prisma = { doctorDrugAdvice: { upsert } } as unknown as PrismaService;
  const svc = new DrugAdviceService(prisma);
  beforeEach(() => upsert.mockClear());

  it("writes under the workstation doctor passed in, keyed by the normalised label", async () => {
    await svc.save('doc-1', { scope: 'medicine', label: 'Tablet.  Napa 500 mg', lines: ['Take after meal', ' '] });
    const arg = upsert.mock.calls[0][0] as unknown as {
      where: { doctorId_scope_key: { doctorId: string; scope: string; key: string } };
      create: { lines: string[]; label: string };
    };
    expect(arg.where.doctorId_scope_key).toEqual({ doctorId: 'doc-1', scope: 'medicine', key: adviceKey('medicine', 'Tablet. Napa 500 mg') });
    expect(arg.create.label).toBe('Tablet. Napa 500 mg');
    expect(arg.create.lines).toEqual(['Take after meal']);
  });

  it('refuses a label with nothing to key on', async () => {
    await expect(svc.save('doc-1', { scope: 'generic', label: '   ', lines: ['x'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('DrugAdviceService.onModuleInit', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs, and never throws, when the table is missing', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('relation does not exist')) } as unknown as PrismaService;
    await expect(new DrugAdviceService(prisma).onModuleInit()).resolves.toBeUndefined();
    expect(String(error.mock.calls[0][0])).toContain('manual-drug-advice.sql');
  });
});
