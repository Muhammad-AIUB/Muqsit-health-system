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
      expect($queryRawUnsafe.mock.calls[0][1]).toEqual(['barcavir']);
    });

    it('does not depend on a broad 2-character prefix reaching the row cap', async () => {
      // "na%" matches thousands of medicines; the one that mattered fell
      // outside the LIMIT. Asking for the brand keeps the result set tiny — and
      // since 2026-10-14 it is asked for as a word, with no cap to fall outside.
      const napa = {
        ...habitRow, drugKey: 'tablet. napa 500mg', drugLabel: 'Tablet. Napa 500 mg',
      };
      const { svc, $queryRawUnsafe } = svcWith(
        [napa],
        [{ brandName: 'Napa', genericName: 'Paracetamol', dosageForm: 'Tablet', strength: '500 mg' }],
      );
      const groups = await svc.list('doc_1', 'na');
      expect($queryRawUnsafe.mock.calls[0][1]).toEqual(['napa']);
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
      expect($queryRawUnsafe.mock.calls[0][1].sort()).toEqual(['baraclude', 'barcavir']);
    });

    it('a % or _ in a brand is text, not a pattern — the brand is compared, not matched', async () => {
      // It used to be a LIKE prefix and had to be escaped. An equality has no
      // metacharacters: the word is bound exactly as it is written.
      const { svc, $queryRawUnsafe } = svcWith(
        [{ ...habitRow, drugKey: 'tablet. 100%pure_x 5mg', drugLabel: 'Tablet. 100%Pure_x 5 mg' }],
        [],
      );
      await svc.list('doc_1', '100%pure');
      expect($queryRawUnsafe.mock.calls[0][1]).toEqual(['100%pure_x']);
      expect(String($queryRawUnsafe.mock.calls[0][0])).not.toMatch(/\bI?LIKE\b/i);
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

  it('⚕️ drops a medicine whose tapering lines cannot be read — whole, never half a taper — and COUNTS it', async () => {
    const { svc } = svcWith([
      row({ id: 'bad', contLines: [{ dose: '1+0+0' }] }),
      row({ id: 'h2', drugKey: 'tablet. ace 500mg', drugLabel: 'Tablet. Ace 500 mg' }),
      row({ id: 'bad2', drugKey: 'tablet. odd 5mg', drugLabel: 'Tablet. Odd 5 mg', contLines: 'not a list' }),
    ]);
    const out = await svc.listAll('doc_1');
    expect(out.medicines.map((m) => m.id)).toEqual(['h2']);
    // The box says "2 medicines could not be read and are not listed": a
    // medicine that silently is not there reads as one never prescribed.
    expect(out.unreadable).toBe(2);
    expect(warn).toHaveBeenCalled();
  });

  it('counts none left out when every row was read', async () => {
    expect((await svcWith([row()]).svc.listAll('doc_1')).unreadable).toBe(0);
  });

  it('says so when the doctor has more medicines than the cap, and returns the cap', async () => {
    const many = Array.from({ length: 2001 }, (_, i) =>
      row({ id: `h${i}`, drugKey: `tablet. med${i} 5mg`, drugLabel: `Tablet. Med${i} 5 mg` }),
    );
    const out = await svcWith(many).svc.listAll('doc_1');
    expect(out.truncated).toBe(true);
    expect(out.medicines).toHaveLength(2000);
  });

  // ── The generic ───────────────────────────────────────────────────────────
  // A catalogue that answers with the rows of the brand words it was asked
  // for — so a test can tell a brand that was asked for from one that was not.
  const brands = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      row({ id: `h${i}`, drugKey: `tablet. brand${i}x 5mg`, drugLabel: `Tablet. Brand${i}x 5 mg` }),
    );
  const catalogueRow = (word: string) => {
    const n = /^brand(\d+)x$/.exec(word)?.[1];
    return { brandName: `Brand${n}x`, genericName: `Generic${n}`, dosageForm: 'Tablet', strength: '5 mg' };
  };
  const answering = ($queryRawUnsafe: jest.Mock, answer: (sql: string, words: string[]) => unknown[] | Error) =>
    $queryRawUnsafe.mockImplementation((sql: string, words: string[]) => {
      const a = answer(sql, words);
      return a instanceof Error ? Promise.reject(a) : Promise.resolve(a);
    });

  it('⚕️ attaches ITS OWN generic to every medicine — and asks the catalogue ONCE, however many there are', async () => {
    const { svc, $queryRawUnsafe } = svcWith(brands(60));
    answering($queryRawUnsafe, (_sql, words) => words.map(catalogueRow));
    const out = await svc.listAll('doc_1');
    expect($queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(($queryRawUnsafe.mock.calls[0][1] as string[]).length).toBe(60);
    // Every one of the sixty — the same generic on every medicine, or only the
    // first few, would not pass.
    expect(out.medicines.map((m) => m.generic)).toEqual(Array.from({ length: 60 }, (_, i) => `Generic${i}`));
  });

  // ⚕️ Measured on 2026-10-14, on a made-up catalogue of 35,000 medicines: one
  // `ILIKE 'brand%'` pattern per medicine cost the database 0.8 s for every 25
  // brands — 5 to 7 s to open the box for a doctor with 200 medicines, over a
  // minute for 2,000. Asked as an EQUALITY on the brand's first word, joined
  // against the list of words, the whole catalogue is one pass: 0.05 s for 200
  // medicines, 0.13 s for 2,000. This holds the shape of the question; that it
  // finds the right rows is held against a real database in
  // server/test/rx-habits-all.int-spec.ts.
  it('⚕️ the question is ONE pass over the catalogue: an equality on the brand word — no pattern per brand, no row cap', async () => {
    const { svc, $queryRawUnsafe } = svcWith(brands(3));
    answering($queryRawUnsafe, (_sql, words) => words.map(catalogueRow));
    await svc.listAll('doc_1');
    const sql = String($queryRawUnsafe.mock.calls[0][0]);
    expect(sql).toMatch(/IN \(SELECT unnest\(\$1::text\[\]\)\)/);
    expect(sql).not.toMatch(/\bI?LIKE\b/i);
    expect(sql).not.toMatch(/\bLIMIT\b/i);
    expect($queryRawUnsafe.mock.calls[0][1]).toEqual(['brand0x', 'brand1x', 'brand2x']);
  });

  it('a medicine the catalogue does not have carries no generic — the state of a hand-typed brand', async () => {
    const { svc, $queryRawUnsafe } = svcWith(brands(3));
    answering($queryRawUnsafe, (_sql, words) => words.filter((w) => w !== 'brand1x').map(catalogueRow));
    expect((await svc.listAll('doc_1')).medicines.map((m) => m.generic)).toEqual(['Generic0', undefined, 'Generic2']);
  });

  it('never lends the generic of another strength or form of the same brand', async () => {
    const { svc, $queryRawUnsafe } = svcWith(brands(1));
    answering($queryRawUnsafe, () => [
      { brandName: 'Brand0x', genericName: 'Wrongstrength', dosageForm: 'Tablet', strength: '50 mg' },
      { brandName: 'Brand0x', genericName: 'Wrongform', dosageForm: 'Syrup', strength: '5 mg' },
      { brandName: 'Brand0x Plus', genericName: 'Wrongbrand', dosageForm: 'Tablet', strength: '5 mg' },
    ]);
    expect((await svc.listAll('doc_1')).medicines[0].generic).toBeUndefined();
  });

  // The brand is asked for by its first word, WHATEVER its length. A first
  // word of one letter used to be dropped (and later asked for with the second
  // word), because a one-letter PREFIX is every brand beginning with it. An
  // equality on the word is only the brands whose first word IS that letter.
  it('⚕️ a brand whose first word is one letter is asked for like any other', async () => {
    const { svc, $queryRawUnsafe } = svcWith([
      row({ id: 'e', drugKey: 'capsule. e cap 400mg', drugLabel: 'Capsule. E Cap 400 mg' }),
      row({ id: 'e1', drugKey: 'capsule. e 400mg', drugLabel: 'Capsule. E 400 mg' }),
      row({ id: 'n', drugKey: 'tablet. napa 500mg', drugLabel: 'Tablet. Napa 500 mg' }),
    ]);
    answering($queryRawUnsafe, () => [
      { brandName: 'E', genericName: 'Vitamin E alone', dosageForm: 'Capsule', strength: '400 mg' },
      { brandName: 'E Cap', genericName: 'Vitamin E', dosageForm: 'Capsule', strength: '400 mg' },
      { brandName: 'Napa', genericName: 'Paracetamol', dosageForm: 'Tablet', strength: '500 mg' },
    ]);
    const out = await svc.listAll('doc_1');
    expect(($queryRawUnsafe.mock.calls[0][1] as string[]).sort()).toEqual(['e', 'napa']);
    expect(out.medicines.map((m) => m.generic)).toEqual(['Vitamin E', 'Vitamin E alone', 'Paracetamol']);
  });

  // The key closes the gap between a number and its unit ("3 G" → "3g"), and
  // the brand word was first taken from the KEY: "3g", which is the first
  // word of no brand. It is taken from the label as written (fresh review).
  it('⚕️ a brand that begins with a number and a unit-like word is asked for by the word as WRITTEN', async () => {
    const { svc, $queryRawUnsafe } = svcWith([
      row({ id: 'c', drugKey: 'tablet. 3g cef 250mg', drugLabel: 'Tablet. 3 G Cef 250 mg' }),
      row({ id: 't', drugKey: 'tablet. napa 500mg', drugLabel: 'Tab   NAPA 500 mg' }),
    ]);
    answering($queryRawUnsafe, () => [
      { brandName: '3 G Cef', genericName: 'Cefixime', dosageForm: 'Tablet', strength: '250 mg' },
      { brandName: 'Napa', genericName: 'Paracetamol', dosageForm: 'Tablet', strength: '500 mg' },
    ]);
    const out = await svc.listAll('doc_1');
    expect(($queryRawUnsafe.mock.calls[0][1] as string[]).sort()).toEqual(['3', 'napa']);
    expect(out.medicines.map((m) => m.generic)).toEqual(['Cefixime', 'Paracetamol']);
  });

  it('a label with no brand word at all is not asked for', async () => {
    const { svc, $queryRawUnsafe } = svcWith([row({ id: 'x', drugKey: 'tablet.', drugLabel: 'Tablet.' })]);
    const out = await svc.listAll('doc_1');
    expect($queryRawUnsafe).not.toHaveBeenCalled();
    expect(out.medicines[0].generic).toBeUndefined();
  });

  // ⚕️ `list()` may lose a generic to a failed lookup: the ℞ pad has a second,
  // partial source for it. The box has none. A medicine offered here without
  // the generic the catalogue holds for it is a contraindication warning that
  // does not fire, on several lines at once, with nothing on screen to say so.
  it('⚕️ THROWS when the catalogue cannot be asked — a medicine is not offered here without the generic its warnings need', async () => {
    await expect(svcWith([row()], new Error('medicines unreachable')).svc.listAll('doc_1')).rejects.toThrow('medicines unreachable');
  });

  it('asks in a stated order, so the same medicine is given the same generic on every request', async () => {
    const { svc, $queryRawUnsafe } = svcWith(brands(1));
    answering($queryRawUnsafe, (_sql, words) => words.map(catalogueRow));
    await svc.listAll('doc_1');
    expect($queryRawUnsafe.mock.calls[0][0]).toMatch(/ORDER BY "brandName", "dosageForm", strength, "genericName"/);
  });

  it('names the medicine and the generics in the log when the catalogue lists one medicine under two — once', async () => {
    const { svc, $queryRawUnsafe } = svcWith(brands(2));
    answering($queryRawUnsafe, () => [
      { brandName: 'Brand0x', genericName: 'Firstgeneric', dosageForm: 'Tablet', strength: '5 mg' },
      { brandName: 'Brand0x', genericName: 'Secondgeneric', dosageForm: 'Tablet', strength: '5 mg' },
      // The same generic twice — another company, another spelling of the case — is not two.
      { brandName: 'Brand1x', genericName: 'Samegeneric', dosageForm: 'Tablet', strength: '5 mg' },
      { brandName: 'Brand1x', genericName: ' samegeneric ', dosageForm: 'Tablet', strength: '5 mg' },
    ]);
    const out = await svc.listAll('doc_1');
    expect(out.medicines.map((m) => m.generic)).toEqual(['Firstgeneric', 'Samegeneric']);
    const said = () => warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('more than one generic'));
    // What the operator needs to settle it, without reading the table: which
    // medicine, and which generics. Catalogue data — no patient, no doctor.
    expect(said()).toHaveLength(1);
    expect(said()[0]).toContain('tablet. brand0x 5mg');
    expect(said()[0]).toContain('Firstgeneric | Secondgeneric');
    expect(said()[0]).not.toContain('brand1x');
    // The box asks on every opening; the same line is not written every time.
    await svc.listAll('doc_1');
    await svc.listAll('doc_1');
    expect(said()).toHaveLength(1);
  });

  it('THROWS when the list itself cannot be read — a box the doctor opened must be able to say so', async () => {
    await expect(svcWith(new Error('connection lost')).svc.listAll('doc_1')).rejects.toThrow('connection lost');
  });
});

// The dropdown shares the catalogue lookup. What changed under it on 2026-10-13
// must not have changed what it does when the lookup FAILS: it stays silent.
describe('RxHabitsService.list — still silent where listAll is loud', () => {
  const habitRow = {
    id: 'h1', drugKey: 'tablet. barcavir 0.5mg', drugLabel: 'Tablet. Barcavir 0.5 mg',
    dose: '1+0+0', food: '', duration: 'Continue', contLines: [],
    patientCount: 1, lastUsedAt: new Date(), pinned: false, hidden: false, hiddenCount: 0,
  };

  it('a failed catalogue lookup still returns the suggestions, without a generic', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const svc = new RxHabitsService({
      $queryRaw: jest.fn().mockResolvedValue([habitRow]),
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('medicines unreachable')),
    } as unknown as PrismaService);
    const groups = await svc.list('doc_1', 'barcavir');
    expect(groups).toHaveLength(1);
    expect(groups[0].generic).toBeUndefined();
    jest.restoreAllMocks();
  });
});
