import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Patient, User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeDoctor, makePatient } from './support/fixtures';
import { resetDb } from './support/test-db';
import { normaliseDrugKey, searchKeyOf, signatureOf } from '../src/rx-habits/normalise';

// ⚕️ "Your usual" must not learn the same instruction twice because it was
// written in BAN once and in EN once (physician's decision, 2026-10-14: BAN
// writes the ℞ dose / food / duration in Bangla). Real HTTP, real database,
// and the repair script run for real against the throwaway test database.
// Every name, dose and count here is made up.
type Browser = ReturnType<TestApp['agent']>;

const NAPA = 'Tablet. Napa 500 mg';
const EN_BEFORE = { dose: '1+0+1', food: 'Before meal', duration: '7 days' };
const BN_BEFORE = { dose: '১+০+১', food: 'খাবারের আগে', duration: '৭ দিন' };
const BN_AFTER = { dose: '১+০+১', food: 'খাবারের পরে', duration: '৭ দিন' };

const line = (l: { dose: string; food: string; duration: string }) => ({
  drug: NAPA,
  dose: l.dose,
  instruction: l.food,
  duration: l.duration,
});

describe('rx-habits — Bangla and English are one habit', () => {
  let t: TestApp;
  let D: User;
  let P1: Patient, P2: Patient, P3: Patient;
  let d: Browser;

  const save = async (patient: Patient, l: { dose: string; food: string; duration: string }) => {
    const res = await d.post('/api/prescriptions').send({ patientId: patient.id, items: [line(l)] });
    if (res.status >= 300) throw new Error(`save failed: ${res.status} ${JSON.stringify(res.body)}`);
  };
  const habits = () =>
    t.prisma.doctorRxHabit.findMany({
      where: { doctorId: D.id, drugKey: normaliseDrugKey(NAPA) },
      orderBy: { signature: 'asc' },
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    D = await makeDoctor(t.prisma);
    [P1, P2, P3] = await Promise.all([
      makePatient(t.prisma, D.id),
      makePatient(t.prisma, D.id),
      makePatient(t.prisma, D.id),
    ]);
    d = await loginAs(t, D);
  });
  afterAll(async () => {
    await t.close();
  });

  it('the same instruction saved in EN and in BAN is ONE habit, counted by patients', async () => {
    await save(P1, EN_BEFORE);
    await save(P2, BN_BEFORE);
    const rows = await habits();
    expect(rows).toHaveLength(1);
    expect(rows[0].patientCount).toBe(2);
    expect(rows[0].algoVersion).toBeGreaterThanOrEqual(2);
  });

  it('a patient saving it again in the other language is not a new patient', async () => {
    await save(P2, EN_BEFORE);
    await save(P1, BN_BEFORE);
    const rows = await habits();
    expect(rows).toHaveLength(1);
    expect(rows[0].patientCount).toBe(2);
  });

  it('⚕️ a different instruction is its own habit, in either language', async () => {
    await save(P3, BN_AFTER);
    const rows = await habits();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.patientCount).sort()).toEqual([1, 2]);
  });

  describe('node scripts/rebuild-rx-habits.js on rows learned before the change', () => {
    const server = join(__dirname, '..');
    let dir: string;
    let preload: string;

    // The script prefers a built `dist/`, which may be an older algorithm; the
    // preload hides it so the script compiles the CURRENT source with ts-node,
    // as it does on a machine with no build.
    const run = (args: string[] = []) =>
      execFileSync(
        process.execPath,
        ['-r', preload, join(server, 'scripts', 'rebuild-rx-habits.js'), ...args],
        { cwd: server, env: process.env, encoding: 'utf8' },
      );

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'rx-habits-rebuild-'));
      preload = join(dir, 'hide-dist.js');
      writeFileSync(
        preload,
        [
          "const Module = require('module');",
          'const orig = Module._resolveFilename;',
          'Module._resolveFilename = function (request, ...rest) {',
          "  if (/^\\.\\.\\/dist\\/(src\\/)?rx-habits\\//.test(request)) { const e = new Error('hidden'); e.code = 'MODULE_NOT_FOUND'; throw e; }",
          '  return orig.call(this, request, ...rest);',
          '};',
        ].join('\n'),
      );

      // The table as it stood before: one row per language, built by version 1.
      // The English one carries the doctor's decision to hide it; the Bangla one
      // is pinned — and the Bangla wording is the NEWEST prescription's, the one
      // a rebuild would otherwise take its flags from. The signatures are the
      // OLD ones — Bangla kept as typed.
      await t.prisma.doctorRxHabit.deleteMany({ where: { doctorId: D.id } });
      const US = '\u001F';
      const old = (l: { dose: string; food: string; duration: string }, flags: { hidden?: boolean; pinned?: boolean }) =>
        t.prisma.doctorRxHabit.create({
          data: {
            doctorId: D.id,
            drugKey: normaliseDrugKey(NAPA),
            searchKey: searchKeyOf(NAPA),
            drugLabel: NAPA,
            signature: [l.dose, l.food, l.duration].map((v) => v.toLowerCase()).join(US),
            algoVersion: 1,
            ...l,
            contLines: [],
            patientCount: 1,
            lastUsedAt: new Date('2026-10-01T00:00:00Z'),
            hidden: flags.hidden ?? false,
            pinned: flags.pinned ?? false,
          },
        });
      await old(EN_BEFORE, { hidden: true });
      await old(BN_BEFORE, { pinned: true });
      // Sanity: they really are two rows under the old algorithm.
      expect(signatureOf(EN_BEFORE)).toBe(signatureOf(BN_BEFORE));
      expect(await habits()).toHaveLength(2);
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('--dry-run reports and writes nothing', async () => {
      const out = run(['--dry-run']);
      expect(out).toContain('DRY RUN');
      expect(out).toContain('Flags re-applied:      2 of 2');
      expect(await habits()).toHaveLength(2);
    });

    it('⚕️ folds the two into one, with both patients, and keeps what the doctor hid and pinned', async () => {
      run();
      const rows = await habits();
      expect(rows).toHaveLength(2); // "before meal" (folded) and "after meal" (P3)
      const before = rows.find((r) => r.food.toLowerCase().includes('before') || r.food.includes('আগে'))!;
      expect(before.patientCount).toBe(2);
      expect(before.hidden).toBe(true); // a dose the doctor hid does not come back
      expect(before.pinned).toBe(true);
      expect(before.algoVersion).toBeGreaterThanOrEqual(2);
      const after = rows.find((r) => r !== before)!;
      expect(after.patientCount).toBe(1);
      expect(after.hidden).toBe(false);
      expect(after.pinned).toBe(false);
    });

    it('is idempotent: a second run leaves the same rows', async () => {
      const first = (await habits()).map((r) => [r.signature, r.patientCount, r.hidden, r.pinned]);
      run();
      const second = (await habits()).map((r) => [r.signature, r.patientCount, r.hidden, r.pinned]);
      expect(second).toEqual(first);
    });
  });
});
