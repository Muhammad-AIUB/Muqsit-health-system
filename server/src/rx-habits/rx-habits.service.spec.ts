import { Logger, NotFoundException } from '@nestjs/common';
import { RxHabitsService } from './rx-habits.service';
import type { PrismaService } from '../prisma/prisma.service';

// ⚕️ "Silence toward the doctor, noise toward the operator" (design §8 rule 8).
//
// An empty result, a failed query and a MISSING TABLE all look identical on the
// prescribing screen — correct for the doctor, and a trap for everyone else.
// This repo has already shipped two committed-but-unapplied manual migrations,
// and the deploy workflow does not run them, so a dead feature that says
// nothing is a realistic outcome. These tests pin both halves: the doctor sees
// nothing, the operator sees a log line, and the API never goes down for it.

const brokenPrisma = (err: Error): PrismaService =>
  ({
    $queryRaw: jest.fn().mockRejectedValue(err),
    $queryRawUnsafe: jest.fn().mockRejectedValue(err),
  }) as unknown as PrismaService;

describe('RxHabitsService.onModuleInit — the boot check', () => {
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('NEVER throws when the table is missing — a convenience must not take the API down', async () => {
    const svc = new RxHabitsService(brokenPrisma(new Error('relation "DoctorRxHabit" does not exist')));
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('logs exactly one ERROR naming the migration to apply', async () => {
    const svc = new RxHabitsService(brokenPrisma(new Error('relation "DoctorRxHabit" does not exist')));
    await svc.onModuleInit();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('manual-rx-habits.sql');
  });

  it('says nothing at all when the table is readable', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as unknown as PrismaService;
    await new RxHabitsService(prisma).onModuleInit();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('RxHabitsService.list — a failed lookup is silence, never an error', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns [] instead of throwing when the query fails', async () => {
    const svc = new RxHabitsService(brokenPrisma(new Error('connection lost')));
    await expect(svc.list('doc_1', 'napa')).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled(); // the operator hears about it
  });

  it('never queries at all for a query under 2 characters', async () => {
    const $queryRaw = jest.fn();
    const svc = new RxHabitsService({ $queryRaw } as unknown as PrismaService);
    expect(await svc.list('doc_1', 'n')).toEqual([]);
    expect(await svc.list('doc_1', '')).toEqual([]);
    expect(await svc.list('doc_1', '  ')).toEqual([]);
    // "tab" alone normalises to an empty search key — a dosage form is not a
    // medicine name, and it must not return every tablet the doctor prescribes.
    expect(await svc.list('doc_1', 'tab.')).toEqual([]);
    expect($queryRaw).not.toHaveBeenCalled();
  });
});

describe('RxHabitsService.list — the generic travels WITH the suggestion', () => {
  // ⚕️ Prescribing-alert rules are written against generics; a ℞ line carries
  // the brand. Resolving the generic on the client, from a separate medicines
  // request, makes a SAFETY field depend on a race — on a flaky connection the
  // suggestion can be clickable before (or without) the medicines response, and
  // the entecavir contraindication behind "Barcavir" then silently does not
  // fire. So it is resolved here, on the same response.
  const habitRow = {
    id: 'h1', drugKey: 'tablet. barcavir 0.5mg', drugLabel: 'Tablet. Barcavir 0.5 mg',
    dose: '1+0+0', food: '', duration: 'Continue', contLines: [],
    patientCount: 1, lastUsedAt: new Date(), pinned: false, hidden: false, hiddenCount: 0,
  };
  const CATALOGUE = [
    { brandName: 'Barcavir', genericName: 'Entecavir', dosageForm: 'Tablet', strength: '0.5 mg' },
    { brandName: 'Barcavir', genericName: 'Entecavir', dosageForm: 'Tablet', strength: '1 mg' },
  ];

  // The habit lookup is a tagged $queryRaw; the catalogue lookup is a
  // parameterised $queryRawUnsafe, so the brand prefixes can be bound as an
  // array. Mocking them separately also lets a test assert WHICH prefixes were
  // asked for — which is the whole of the bug found on 2026-08-17.
  const svcWith = (habits: unknown[], medicines: unknown[] | Error) => {
    const $queryRaw = jest.fn().mockResolvedValue(habits);
    const $queryRawUnsafe = jest
      .fn()
      .mockImplementation(() =>
        medicines instanceof Error ? Promise.reject(medicines) : Promise.resolve(medicines),
      );
    return {
      svc: new RxHabitsService({ $queryRaw, $queryRawUnsafe } as unknown as PrismaService),
      $queryRawUnsafe,
    };
  };
  const listWith = (habits: unknown[], medicines: unknown[] | Error, q = 'barcavir') =>
    svcWith(habits, medicines).svc.list('doc_1', q);

  it('attaches the generic matched on the normalised key', async () => {
    const groups = await listWith([habitRow], CATALOGUE);
    expect(groups).toHaveLength(1);
    expect(groups[0].generic).toBe('Entecavir');
    expect(groups[0].items).toHaveLength(1);
  });

  it('matches across a spacing difference — "0.5 mg" in both, "0.5mg" in the key', async () => {
    const groups = await listWith([{ ...habitRow, drugLabel: 'Tablet. Barcavir 0.5mg' }], CATALOGUE);
    expect(groups[0].generic).toBe('Entecavir');
  });

  it('never lends another strength’s generic', async () => {
    const groups = await listWith([{ ...habitRow, drugKey: 'tablet. barcavir 2mg', drugLabel: 'Tablet. Barcavir 2 mg' }], CATALOGUE);
    expect(groups[0].generic).toBeUndefined();
  });

  it('leaves the generic absent when the catalogue has no match', async () => {
    const groups = await listWith([habitRow], []);
    expect(groups[0].generic).toBeUndefined();
    expect(groups[0].items).toHaveLength(1); // the suggestion is still offered
  });

  it('still returns the suggestions when the generic lookup FAILS', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const groups = await listWith([habitRow], new Error('medicines unavailable'));
    expect(groups).toHaveLength(1);
    expect(groups[0].generic).toBeUndefined();
    expect(groups[0].items).toHaveLength(1);
    jest.restoreAllMocks();
  });

  it('ignores a catalogue row with no generic recorded', async () => {
    const groups = await listWith([habitRow], [{ brandName: 'Barcavir', genericName: null, dosageForm: 'Tablet', strength: '0.5 mg' }]);
    expect(groups[0].generic).toBeUndefined();
  });

  // ⚕️ REGRESSION, found by review on 2026-08-17 and reproduced against
  // production. The catalogue was searched with the prefix the DOCTOR typed,
  // which lost the generic — and with it the contraindication warning — in two
  // completely ordinary cases. Both were silent.
  describe('the catalogue is searched by BRAND, not by what was typed', () => {
    it('still finds the generic when the field holds the FULL label', async () => {
      // The drug box holds "Tablet. Barcavir 0.5 mg" the moment a medicine has
      // been picked. That normalises to the search key "barcavir 0.5mg", and a
      // prefix search for "barcavir 0.5mg%" matches no brand at all.
      const groups = await listWith([habitRow], CATALOGUE, 'Tablet. Barcavir 0.5 mg');
      expect(groups[0].generic).toBe('Entecavir');
    });

    it('asks for the brand token, not the typed text', async () => {
      const { svc, $queryRawUnsafe } = svcWith([habitRow], CATALOGUE);
      await svc.list('doc_1', 'Tablet. Barcavir 0.5 mg');
      expect($queryRawUnsafe).toHaveBeenCalledTimes(1);
      expect($queryRawUnsafe.mock.calls[0][1]).toEqual(['barcavir%']);
    });

    it('does not depend on a broad 2-character prefix reaching the row cap', async () => {
      // "na%" matches thousands of medicines; the one that mattered fell
      // outside the LIMIT. Asking for the brand keeps the result set tiny.
      const napa = {
        ...habitRow, drugKey: 'tablet. napa 500mg', drugLabel: 'Tablet. Napa 500 mg',
      };
      const { svc, $queryRawUnsafe } = svcWith(
        [napa],
        [{ brandName: 'Napa', genericName: 'Paracetamol', dosageForm: 'Tablet', strength: '500 mg' }],
      );
      const groups = await svc.list('doc_1', 'na');
      expect($queryRawUnsafe.mock.calls[0][1]).toEqual(['napa%']);
      expect(groups[0].generic).toBe('Paracetamol');
    });

    it('asks once for all medicines in the response, de-duplicated', async () => {
      const { svc, $queryRawUnsafe } = svcWith(
        [
          habitRow,
          { ...habitRow, id: 'h2', drugKey: 'tablet. barcavir 1mg', drugLabel: 'Tablet. Barcavir 1 mg' },
          { ...habitRow, id: 'h3', drugKey: 'tablet. baraclude 0.5mg', drugLabel: 'Tablet. Baraclude 0.5 mg' },
        ],
        CATALOGUE,
      );
      await svc.list('doc_1', 'bar');
      expect($queryRawUnsafe).toHaveBeenCalledTimes(1);
      expect($queryRawUnsafe.mock.calls[0][1].sort()).toEqual(['baraclude%', 'barcavir%']);
    });

    it('escapes LIKE metacharacters in a brand', async () => {
      const { svc, $queryRawUnsafe } = svcWith(
        [{ ...habitRow, drugKey: 'tablet. 100%pure 5mg', drugLabel: 'Tablet. 100%Pure 5 mg' }],
        [],
      );
      await svc.list('doc_1', '100%pure');
      expect($queryRawUnsafe.mock.calls[0][1][0]).toContain('\\%');
    });
  });
});

describe('RxHabitsService.setFlags — ownership and the audit line', () => {
  afterEach(() => jest.restoreAllMocks());

  const row = {
    id: 'h1', doctorId: 'doc_1', drugLabel: 'Tablet. Napa 500mg',
    dose: '1+1+1', food: 'after meal', duration: '7 days', contLines: [],
    patientCount: 2, lastUsedAt: new Date(), pinned: false, hidden: false,
  };

  function svcWith(found: unknown) {
    const findFirst = jest.fn().mockResolvedValue(found);
    const update = jest.fn().mockImplementation(({ data }) => ({ ...row, ...data }));
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      doctorRxHabit: { findFirst, update },
      activityLog: { create },
    } as unknown as PrismaService;
    return { svc: new RxHabitsService(prisma), findFirst, update, create };
  }

  it("404s on another doctor's habit id, and changes nothing", async () => {
    const { svc, update } = svcWith(null);
    await expect(svc.setFlags('doc_2', 'Dr B', 'h1', { hidden: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('scopes the ownership lookup by doctorId, not by id alone', async () => {
    const { svc, findFirst } = svcWith(row);
    await svc.setFlags('doc_1', 'Dr A', 'h1', { hidden: true });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'h1', doctorId: 'doc_1' } });
  });

  it('writes an audit line naming who hid what', async () => {
    const { svc, create } = svcWith(row);
    await svc.setFlags('doc_1', 'Dr A', 'h1', { hidden: true });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({ doctorId: 'doc_1', actorName: 'Dr A', section: 'Prescribing habits' });
    expect(data.patientId).toBeUndefined(); // not about one patient
    expect(data.detail).toContain('Tablet. Napa 500mg');
    expect(data.detail).toContain('1+1+1 · after meal · 7 days');
    expect(data.detail.length).toBeLessThanOrEqual(400); // ActivityLog.detail cap
  });

  it('writes an audit line on RESTORE too', async () => {
    const { svc, create } = svcWith({ ...row, hidden: true });
    await svc.setFlags('doc_1', 'Dr A', 'h1', { hidden: false });
    expect(String(create.mock.calls[0][0].data.detail)).toContain('Restored');
  });

  it('does NOT log when the flag did not actually change', async () => {
    const { svc, create } = svcWith(row); // already hidden: false
    await svc.setFlags('doc_1', 'Dr A', 'h1', { hidden: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('still reports success when the audit write fails — the click did work', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const findFirst = jest.fn().mockResolvedValue(row);
    const update = jest.fn().mockResolvedValue({ ...row, hidden: true });
    const prisma = {
      doctorRxHabit: { findFirst, update },
      activityLog: { create: jest.fn().mockRejectedValue(new Error('nope')) },
    } as unknown as PrismaService;
    await expect(
      new RxHabitsService(prisma).setFlags('doc_1', 'Dr A', 'h1', { hidden: true }),
    ).resolves.toMatchObject({ id: 'h1' });
  });
});

// ⚕️ The "Add Bulk Medicine" box: every medicine ONE doctor has a visible habit
// for, one row each. Two things set it apart from `list()` above: it is not a
// search, and it THROWS — a list the doctor opened on purpose must be able to
// say "could not be loaded" instead of looking like an empty history.
describe('RxHabitsService.listAll — the "Add Bulk Medicine" list', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const row = (over: Record<string, unknown> = {}) => ({
    id: 'h1', drugKey: 'tablet. napa 500mg', drugLabel: 'Tablet. Napa 500 mg',
    dose: '1+1+1', food: 'After meal', duration: '5 days', contLines: [],
    patientCount: 30, lastUsedAt: new Date('2026-10-01T00:00:00Z'), ...over,
  });
  const svcWith = (habits: unknown[] | Error, medicines: unknown[] | Error = []) => {
    const $queryRaw = jest.fn().mockImplementation(() =>
      habits instanceof Error ? Promise.reject(habits) : Promise.resolve(habits),
    );
    const $queryRawUnsafe = jest.fn().mockImplementation(() =>
      medicines instanceof Error ? Promise.reject(medicines) : Promise.resolve(medicines),
    );
    return {
      svc: new RxHabitsService({ $queryRaw, $queryRawUnsafe } as unknown as PrismaService),
      $queryRaw,
      $queryRawUnsafe,
    };
  };
  /** The SQL text and the bound values of the one tagged-template call. */
  const sqlOf = ($queryRaw: jest.Mock) => {
    const [strings, ...values] = $queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    return { text: strings.join('?'), values };
  };

  it('⚕️ asks for ONE doctor: the id it is given is bound into the query', async () => {
    const { svc, $queryRaw } = svcWith([row()]);
    await svc.listAll('doc_1');
    const { text, values } = sqlOf($queryRaw);
    expect(values).toContain('doc_1');
    expect(text).toMatch(/"doctorId" = \?/);
  });

  it("leaves hidden rows out BEFORE choosing a medicine's row, so a hidden dose never hides the next one", async () => {
    const { svc, $queryRaw } = svcWith([row()]);
    await svc.listAll('doc_1');
    const { text } = sqlOf($queryRaw);
    const hidden = text.indexOf('"hidden" = false');
    expect(hidden).toBeGreaterThan(-1);
    expect(hidden).toBeLessThan(text.indexOf('rn = 1'));
  });

  it("chooses a medicine's row as the typing dropdown does: pinned, then most patients, then most recent", async () => {
    const { svc, $queryRaw } = svcWith([row()]);
    await svc.listAll('doc_1');
    expect(sqlOf($queryRaw).text).toMatch(
      /PARTITION BY h\."drugKey"\s+ORDER BY h\."pinned" DESC, h\."patientCount" DESC, h\."lastUsedAt" DESC, h\."id" ASC/,
    );
  });

  it('returns one medicine per row with its instruction, in the order the database gave', async () => {
    const { svc } = svcWith([
      row(),
      row({
        id: 'h2', drugKey: 'tablet. deltasone 5mg', drugLabel: 'Tablet. Deltasone 5 mg',
        dose: '2+0+0', duration: '5 days', patientCount: 6,
        contLines: [{ dose: '1+0+0', food: 'After meal', duration: '5 days' }],
      }),
    ]);
    const out = await svc.listAll('doc_1');
    expect(out.truncated).toBe(false);
    expect(out.medicines.map((m) => m.drugLabel)).toEqual(['Tablet. Napa 500 mg', 'Tablet. Deltasone 5 mg']);
    expect(out.medicines[0]).toMatchObject({
      id: 'h1', dose: '1+1+1', food: 'After meal', duration: '5 days', contLines: [], patientCount: 30,
    });
    expect(out.medicines[1].contLines).toEqual([{ dose: '1+0+0', food: 'After meal', duration: '5 days' }]);
  });

  it('⚕️ drops a medicine whose tapering lines cannot be read — whole, never half a taper', async () => {
    const { svc } = svcWith([
      row({ id: 'bad', contLines: [{ dose: '1+0+0' }] }),
      row({ id: 'h2', drugKey: 'tablet. ace 500mg', drugLabel: 'Tablet. Ace 500 mg' }),
    ]);
    const out = await svc.listAll('doc_1');
    expect(out.medicines.map((m) => m.id)).toEqual(['h2']);
    expect(warn).toHaveBeenCalled();
  });

  it('says so when the doctor has more medicines than the cap, and returns the cap', async () => {
    const many = Array.from({ length: 2001 }, (_, i) =>
      row({ id: `h${i}`, drugKey: `tablet. med${i} 5mg`, drugLabel: `Tablet. Med${i} 5 mg` }),
    );
    const out = await svcWith(many).svc.listAll('doc_1');
    expect(out.truncated).toBe(true);
    expect(out.medicines).toHaveLength(2000);
  });

  it('⚕️ attaches the generic to every medicine, asking the catalogue in chunks', async () => {
    const habits = Array.from({ length: 60 }, (_, i) =>
      row({ id: `h${i}`, drugKey: `tablet. brand${i} 5mg`, drugLabel: `Tablet. Brand${i} 5 mg` }),
    );
    const { svc, $queryRawUnsafe } = svcWith(habits, [
      { brandName: 'Brand59', genericName: 'Lastgeneric', dosageForm: 'Tablet', strength: '5 mg' },
      { brandName: 'Brand0', genericName: 'Firstgeneric', dosageForm: 'Tablet', strength: '5 mg' },
    ]);
    const out = await svc.listAll('doc_1');
    expect($queryRawUnsafe).toHaveBeenCalledTimes(3); // 25 + 25 + 10 brands
    const asked = $queryRawUnsafe.mock.calls.flatMap((c) => c[1] as string[]);
    expect(new Set(asked).size).toBe(60);
    expect(out.medicines[0].generic).toBe('Firstgeneric');
    expect(out.medicines[59].generic).toBe('Lastgeneric');
    expect(out.medicines[1].generic).toBeUndefined();
  });

  it('keeps the generics already found when a LATER chunk of the catalogue fails', async () => {
    const habits = Array.from({ length: 30 }, (_, i) =>
      row({ id: `h${i}`, drugKey: `tablet. brand${i} 5mg`, drugLabel: `Tablet. Brand${i} 5 mg` }),
    );
    const { svc, $queryRawUnsafe } = svcWith(habits, []);
    $queryRawUnsafe
      .mockResolvedValueOnce([{ brandName: 'Brand0', genericName: 'Firstgeneric', dosageForm: 'Tablet', strength: '5 mg' }])
      .mockRejectedValueOnce(new Error('connection lost'));
    const out = await svc.listAll('doc_1');
    expect(out.medicines).toHaveLength(30);
    expect(out.medicines[0].generic).toBe('Firstgeneric');
    expect(warn).toHaveBeenCalled();
  });

  it('still returns the list when the generic lookup FAILS — the medicine then behaves like a hand-typed brand', async () => {
    const out = await svcWith([row()], new Error('medicines unreachable')).svc.listAll('doc_1');
    expect(out.medicines).toHaveLength(1);
    expect(out.medicines[0].generic).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('THROWS when the list itself cannot be read — a box the doctor opened must be able to say so', async () => {
    await expect(svcWith(new Error('connection lost')).svc.listAll('doc_1')).rejects.toThrow('connection lost');
  });
});
