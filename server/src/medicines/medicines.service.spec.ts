import { MedicinesService } from './medicines.service';
import type { PrismaService } from '../prisma/prisma.service';

// The medicine chart's rows for the brands on a ℞ pad — what the "Total monthly
// approximate cost" box prices from. The match itself is the client's
// (`sameMedicine`, strength and all); this only fetches the candidates, and has
// to fetch them for the brand's FIRST WORD, exactly, as the generic lookup does.

const ROW = { brandName: 'Napa', genericName: 'Paracetamol', dosageForm: 'Tablet', strength: '500 mg', priceRaw: 'Unit Price: ৳ 1.20 (50 x 10: ৳ 60.00)' };

function svcWith(rows: unknown[] = [ROW]) {
  const $queryRawUnsafe = jest.fn().mockResolvedValue(rows);
  return { svc: new MedicinesService({ $queryRawUnsafe } as unknown as PrismaService), $queryRawUnsafe };
}

describe('MedicinesService.byBrand', () => {
  it('asks the chart ONCE, with the words bound as one parameter — lower case, trimmed, each once', async () => {
    const { svc, $queryRawUnsafe } = svcWith();
    await svc.byBrand(['Napa', ' napa ', 'SERGEL']);
    expect($queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect($queryRawUnsafe.mock.calls[0][1]).toEqual(['napa', 'sergel']);
    // The doctor's text is never part of the SQL itself.
    expect($queryRawUnsafe.mock.calls[0][0]).not.toContain('napa');
  });

  it('gives back the rows as the chart holds them: brand, form, strength and the price as written', async () => {
    const { svc } = svcWith();
    expect(await svc.byBrand(['napa'])).toEqual({
      rows: [{ brandName: 'Napa', dosageForm: 'Tablet', strength: '500 mg', priceRaw: 'Unit Price: ৳ 1.20 (50 x 10: ৳ 60.00)' }],
    });
  });

  it('asks nothing for no words, or only blank ones', async () => {
    const { svc, $queryRawUnsafe } = svcWith();
    expect(await svc.byBrand([])).toEqual({ rows: [] });
    expect(await svc.byBrand(['', '   '])).toEqual({ rows: [] });
    expect($queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('a failure of the chart is not an empty chart: it throws', async () => {
    const $queryRawUnsafe = jest.fn().mockRejectedValue(new Error('connection lost'));
    const svc = new MedicinesService({ $queryRawUnsafe } as unknown as PrismaService);
    await expect(svc.byBrand(['napa'])).rejects.toThrow('connection lost');
  });
});
