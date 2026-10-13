# Add Bulk Medicine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **+** beside the ℞ mark of the OPD pad opens a box listing the medicines this doctor has prescribed before, one row per medicine with its usual instruction; ticked medicines are appended to the pad with dose, when to take, duration and taper filled in.

**Architecture:** One new read-only route on the existing `rx-habits` module (`GET /api/rx-habits/all`) returns the lead non-hidden habit of every medicine of the workstation doctor, with its generic. The client reads that response defensively in a pure module, shows it in a modal that owns only its ticks, order and search, and appends plain `RxItem`s to `rxItems` exactly as a template does. No schema change, no migration, nothing written to `DoctorRxHabit`.

**Tech Stack:** NestJS 10 + Prisma 5 (`$queryRaw`), jest; Next.js 14 + React 18 + React Query, vitest + Testing Library (jsdom by docblock); Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-bulk-medicine-add-design.md`

> **As executed (2026-10-13).** The six tasks were done in order, test first.
> Where the code differs from what is written below, the code and the spec's
> "as built" notes are right and this plan is the record of the intention:
>
> - **Task 3:** the pad lines carry no `fromHabit` — that flag writes
>   `N of M ℞ lines inserted from "Your usual"` to the activity feed on save.
> - **Task 4:** `useBulkMedicines(workstationId)` takes no `enabled`; the box
>   with its list is `BulkMedicineBox`, mounted only while open, and it shows
>   "Loading" for as long as the list is being asked for (`isFetching`), so a
>   list never re-sorts under a tick. A 5xx is not shown in the server's words.
>   Escape in a non-empty search clears the search.
> - **Task 5:** the +, the result line and the one-patient rule live in their
>   own component, `BulkMedicineButton.tsx` (with `BulkMedicineButton.test.tsx`),
>   which resets while rendering rather than in an effect; `RightColumn` only
>   places it. The documents of Task 6 went into the same commit, as the root
>   `CLAUDE.md` asks.
> - Every test written after its code (the integration spec, the alert bridge)
>   was checked by breaking the code: 10 changes on the server, 77 on the client.

## Global Constraints

- Scope is `@WorkstationDoctorId()` — never `req.user.id`, never a body field. No doctor ever sees another doctor's medicines.
- Nothing is invented: a cell the doctor left blank is added blank. No default dose, food or duration.
- A taper is one block: a medicine is added with its `>>>` lines or not at all; an unreadable `contLines` drops the medicine whole.
- "Popular" counts DISTINCT PATIENTS (`patientCount`). The word on screen is `patients`, never `×`.
- The generic travels on the same response as the medicine (it is what makes a prescribing alert fire on a brand line).
- OPD pad only (`RightColumn.tsx`). Not `IpdDetailView`, not the Drug-history pad, not the template editor.
- Client styling is inline with `C` / `font` from `@/theme` and the shared styles in `@/theme/styles`; no `vh` / `vw`; no text under 10.5px; no emoji as an icon; `↳` stays the text glyph.
- A popup uses `useDialog()` and its test runs `itKeepsTheKeyboard()`.
- Never call `window.confirm` / `window.alert`.
- Tests never touch `DATABASE_URL` from `.env` (production). DB-backed tests use the container on `127.0.0.1:5544`.
- Browser checks happen on the sandbox (`:3110` / `:4210`) with made-up patients. Never open or screenshot `localhost:3000`.
- Commits: conventional, as `Muhammad-AIUB <mjubayer.aiub@gmail.com>`, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `dev` only — create no other branch.
- Code and comments in English.

## File map

| File | Change | Responsibility |
|---|---|---|
| `server/src/rx-habits/rx-habits.service.ts` | modify | `listAll(doctorId)`; `attachGenerics` works in chunks |
| `server/src/rx-habits/rx-habits.controller.ts` | modify | `GET /rx-habits/all` |
| `server/src/rx-habits/rx-habits.service.spec.ts` | modify | unit tests for `listAll` |
| `server/test/rx-habits-all.int-spec.ts` | create | scoping and lead-row rules against the real database |
| `docs/API.md`, `server/CLAUDE.md` | modify | the route and why it throws |
| `client/src/lib/drugHistorySelect.ts` | modify | `appendBlocks` takes anything with `items` |
| `client/src/lib/bulkMedicines.ts` (+ `.test.ts`) | create | read, sort, search, build pad lines |
| `client/src/lib/rxHabitAlerts.test.ts` | modify | the alert bridge holds for a bulk add |
| `client/src/lib/api.ts` | modify | `rxHabitsApi.all()` |
| `client/src/hooks/useBulkMedicines.ts` | create | the query |
| `client/src/components/prescription/BulkMedicineModal.tsx` (+ `.test.tsx`) | create | the box |
| `client/src/components/prescription/RightColumn.tsx` | modify | the + button, the result line, the append |
| `server/test/seed-e2e.ts`, `e2e/tests/helpers.ts`, `e2e/tests/bulk-medicine.spec.ts` | modify / create | the journey in a real browser |
| `client/CLAUDE.md`, `docs/DOMAIN.md` | modify | the rules, where the next reader looks |

---

### Task 1: Server — the list and its route

**Files:**
- Modify: `server/src/rx-habits/rx-habits.service.ts`
- Modify: `server/src/rx-habits/rx-habits.controller.ts`
- Test: `server/src/rx-habits/rx-habits.service.spec.ts`
- Modify: `docs/API.md`, `server/CLAUDE.md`

**Interfaces:**
- Produces: `RxHabitsService.listAll(doctorId: string): Promise<HabitMedicineList>` where
  `HabitMedicineList = { medicines: HabitMedicine[]; truncated: boolean }` and
  `HabitMedicine = { id, drugKey, drugLabel, generic?, dose, food, duration, contLines: HabitLine[], patientCount: number, lastUsedAt: Date }`.
  HTTP: `GET /api/rx-habits/all` → that object as JSON (`lastUsedAt` an ISO string).

- [ ] **Step 1: Write the failing tests**

Append to `server/src/rx-habits/rx-habits.service.spec.ts`:

```ts
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

  it('⚕️ asks for ONE doctor: the id it is given is bound into the query, and nothing is asked for without it', async () => {
    const { svc, $queryRaw } = svcWith([row()]);
    await svc.listAll('doc_1');
    const { text, values } = sqlOf($queryRaw);
    expect(values).toContain('doc_1');
    expect(text).toMatch(/"doctorId" = \?/);
  });

  it('leaves hidden rows out BEFORE choosing a medicine\'s row, so a hidden dose never hides the next one', async () => {
    const { svc, $queryRaw } = svcWith([row()]);
    await svc.listAll('doc_1');
    const { text } = sqlOf($queryRaw);
    const hidden = text.indexOf('"hidden" = false');
    expect(hidden).toBeGreaterThan(-1);
    expect(hidden).toBeLessThan(text.indexOf('rn = 1'));
  });

  it('chooses a medicine\'s row as the typing dropdown does: pinned, then most patients, then most recent', async () => {
    const { svc, $queryRaw } = svcWith([row()]);
    await svc.listAll('doc_1');
    expect(sqlOf($queryRaw).text).toMatch(
      /PARTITION BY h\."drugKey"\s+ORDER BY h\."pinned" DESC, h\."patientCount" DESC, h\."lastUsedAt" DESC, h\."id" ASC/,
    );
  });

  it('returns one medicine per row with its instruction, in the order the database gave', async () => {
    const { svc } = svcWith([
      row(),
      row({ id: 'h2', drugKey: 'tablet. deltasone 5mg', drugLabel: 'Tablet. Deltasone 5 mg', dose: '2+0+0', duration: '5 days', patientCount: 6, contLines: [{ dose: '1+0+0', food: 'After meal', duration: '5 days' }] }),
    ]);
    const out = await svc.listAll('doc_1');
    expect(out.truncated).toBe(false);
    expect(out.medicines.map((m) => m.drugLabel)).toEqual(['Tablet. Napa 500 mg', 'Tablet. Deltasone 5 mg']);
    expect(out.medicines[0]).toMatchObject({ id: 'h1', dose: '1+1+1', food: 'After meal', duration: '5 days', contLines: [], patientCount: 30 });
    expect(out.medicines[1].contLines).toEqual([{ dose: '1+0+0', food: 'After meal', duration: '5 days' }]);
  });

  it('⚕️ drops a medicine whose tapering lines cannot be read — whole, never half a taper', async () => {
    const { svc } = svcWith([row({ id: 'bad', contLines: [{ dose: '1+0+0' }] }), row({ id: 'h2', drugKey: 'tablet. ace 500mg', drugLabel: 'Tablet. Ace 500 mg' })]);
    const out = await svc.listAll('doc_1');
    expect(out.medicines.map((m) => m.id)).toEqual(['h2']);
    expect(warn).toHaveBeenCalled();
  });

  it('says so when the doctor has more medicines than the cap, and returns the cap', async () => {
    const many = Array.from({ length: 2001 }, (_, i) => row({ id: `h${i}`, drugKey: `tablet. med${i} 5mg`, drugLabel: `Tablet. Med${i} 5 mg` }));
    const out = await svcWith(many).svc.listAll('doc_1');
    expect(out.truncated).toBe(true);
    expect(out.medicines).toHaveLength(2000);
  });

  it('⚕️ attaches the generic to every medicine, asking the catalogue in chunks', async () => {
    const habits = Array.from({ length: 60 }, (_, i) => row({ id: `h${i}`, drugKey: `tablet. brand${i} 5mg`, drugLabel: `Tablet. Brand${i} 5 mg` }));
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd server && npx jest src/rx-habits/rx-habits.service.spec.ts -t "listAll"`
Expected: FAIL — `svc.listAll is not a function`.

- [ ] **Step 3: Implement `listAll` and chunk `attachGenerics`**

In `server/src/rx-habits/rx-habits.service.ts`, after the `HabitGroup` interface add:

```ts
/**
 * One medicine of the "Add Bulk Medicine" list: the instruction this doctor
 * most often writes for it — the first suggestion the typing dropdown would
 * offer for the same medicine, so the two can never disagree.
 */
export interface HabitMedicine {
  id: string;
  drugKey: string;
  drugLabel: string;
  /** ⚕️ Safety field — see `HabitGroup.generic`. */
  generic?: string;
  dose: string;
  food: string;
  duration: string;
  contLines: HabitLine[];
  patientCount: number;
  lastUsedAt: Date;
}

export interface HabitMedicineList {
  medicines: HabitMedicine[];
  /** The doctor has more medicines than the cap; the most used are returned. */
  truncated: boolean;
}
```

After `const MIN_QUERY = 2;` add:

```ts
const MAX_ALL_MEDICINES = 2000; // the bulk list; `truncated` says when it bit
const GENERIC_CHUNK = 25; // brand prefixes per catalogue query
const GENERIC_CHUNK_ROWS = 5000; // rows per catalogue query; logged if reached
```

After the `LookupRow` interface add:

```ts
/** Raw row shape returned by the whole-list query. */
interface AllRow {
  id: string;
  drugKey: string;
  drugLabel: string;
  dose: string;
  food: string;
  duration: string;
  contLines: unknown;
  patientCount: number;
  lastUsedAt: Date;
}
```

Inside the class, after `list()` and before `attachGenerics`, add:

```ts
  /**
   * Every medicine this doctor has a visible habit for, one row each: the
   * "Add Bulk Medicine" box (P1 — scoped to ONE doctor).
   *
   * The row chosen for a medicine is the typing dropdown's first suggestion
   * for it: pinned, then most DISTINCT PATIENTS, then most recent. Hidden rows
   * are left out BEFORE that choice, so a dose the doctor hid never hides the
   * next one — and a medicine whose doses are all hidden is not listed.
   *
   * ⚠️ UNLIKE `list()`, THIS THROWS. The dropdown is silent on failure by
   * design: it sits under a working medicine search. This is a box the doctor
   * opened on purpose, and "your medicines could not be loaded" must not look
   * like "you have prescribed nothing".
   */
  async listAll(doctorId: string): Promise<HabitMedicineList> {
    const rows = await this.prisma.$queryRaw<AllRow[]>`
      WITH ranked AS (
        SELECT h.*, ROW_NUMBER() OVER (
          PARTITION BY h."drugKey"
          ORDER BY h."pinned" DESC, h."patientCount" DESC, h."lastUsedAt" DESC, h."id" ASC
        ) AS rn
        FROM "DoctorRxHabit" h
        WHERE h."doctorId" = ${doctorId} AND h."hidden" = false
      )
      SELECT "id", "drugKey", "drugLabel", "dose", "food", "duration", "contLines",
             "patientCount", "lastUsedAt"
      FROM ranked
      WHERE rn = 1
      ORDER BY "patientCount" DESC, "lastUsedAt" DESC, "drugKey" ASC
      LIMIT ${MAX_ALL_MEDICINES + 1}
    `;

    const medicines: HabitMedicine[] = [];
    for (const r of rows.slice(0, MAX_ALL_MEDICINES)) {
      // Dropped WHOLE, as in the dropdown: half a taper is worse than none.
      const contLines = sanitiseContLines(r.contLines);
      if (contLines === null) {
        this.log.warn(`habit ${r.id} has unreadable contLines — left out of the bulk list`);
        continue;
      }
      medicines.push({
        id: r.id,
        drugKey: r.drugKey,
        drugLabel: r.drugLabel,
        dose: r.dose,
        food: r.food,
        duration: r.duration,
        contLines,
        patientCount: Number(r.patientCount),
        lastUsedAt: r.lastUsedAt,
      });
    }
    await this.attachGenerics(medicines);
    return { medicines, truncated: rows.length > MAX_ALL_MEDICINES };
  }
```

Replace the whole of `private async attachGenerics(groups: HabitGroup[]): Promise<void> { … }` (keep the doc comment above it; add the paragraph shown) with:

```ts
  /* (existing doc comment stays; append this paragraph to it)
   *
   * Asked in CHUNKS of brand prefixes: the dropdown has at most four medicines,
   * the bulk list has hundreds, and one query with one row cap would let the
   * first brands crowd the last ones out of it — silently, at the cost of a
   * warning. What was found before a failure is still attached.
   */
  private async attachGenerics(
    targets: { drugKey: string; drugLabel: string; generic?: string }[],
  ): Promise<void> {
    if (targets.length === 0) return;
    // The brand is the leading token of the search key ("barcavir 0.5mg" →
    // "barcavir"). Multi-word brands still match: this is only the prefix used
    // to fetch candidates, and the real test is the normalised key below.
    const prefixes = [
      ...new Set(
        targets
          .map((g) => searchKeyOf(g.drugLabel).split(' ')[0])
          .filter((t) => t.length >= 2)
          .map((t) => likePrefix(t)),
      ),
    ];
    if (prefixes.length === 0) return;
    const byKey = new Map<string, string>();
    try {
      for (let i = 0; i < prefixes.length; i += GENERIC_CHUNK) {
        const chunk = prefixes.slice(i, i + GENERIC_CHUNK);
        // `medicines` is a raw table, not a Prisma model (see server/CLAUDE.md).
        // Bound parameter, so the doctor's own text can never reach the SQL.
        const rows = await this.prisma.$queryRawUnsafe<
          { brandName: string; genericName: string | null; dosageForm: string | null; strength: string | null }[]
        >(
          `SELECT "brandName", "genericName", "dosageForm", strength
           FROM medicines
           WHERE "brandName" ILIKE ANY($1::text[])
           LIMIT ${GENERIC_CHUNK_ROWS}`,
          chunk,
        );
        if (rows.length >= GENERIC_CHUNK_ROWS) {
          this.log.warn(`generic lookup reached its row cap for ${chunk.length} brands — some may carry no generic`);
        }
        for (const m of rows) {
          if (!m.genericName) continue;
          const k = normaliseDrugKey(fmtMedicine(m));
          if (k && !byKey.has(k)) byKey.set(k, m.genericName);
        }
      }
    } catch (e) {
      this.log.warn(`generic lookup failed for ${prefixes.length} brands: ${String(e)}`);
    }
    for (const g of targets) {
      const generic = byKey.get(g.drugKey);
      if (generic) g.generic = generic;
    }
  }
```

In `server/src/rx-habits/rx-habits.controller.ts`, add above the `@Patch(':id')` handler:

```ts
  // GET /api/rx-habits/all — the "Add Bulk Medicine" box: every medicine this
  // doctor has prescribed, with its usual instruction. Declared before any
  // `:id` route so the two can never collide.
  @Get('all')
  listAll(@WorkstationDoctorId() doctorId: string) {
    return this.habits.listAll(doctorId);
  }
```

- [ ] **Step 4: Run the whole spec file**

Run: `cd server && npx jest src/rx-habits/rx-habits.service.spec.ts`
Expected: PASS, including every earlier `list` test (the one-chunk case sends the same single call).

- [ ] **Step 5: Document the route**

In `docs/API.md`, in the `### 5.14 Prescribing habits` table, add under the `GET /rx-habits?q=` row:

```md
| GET | `/rx-habits/all` | The "Add Bulk Medicine" list: one row per medicine — its first non-hidden habit by pinned, then most patients, then most recent — with `generic`. `{ medicines: [...], truncated }`, at most 2,000. Unlike `?q=`, a failure is a 500, not an empty list |
```

In `server/CLAUDE.md`, in "Rule 2c", add this bullet after the bullet that begins "**`list()` attaches each medicine's `generic`**":

```md
- **There is a second read path, `listAll()` (`GET /rx-habits/all`, 2026-10-13), and it THROWS.** It feeds the "Add Bulk Medicine" box: one row per medicine, the row the typing dropdown would offer first (pinned, then most patients, then most recent), hidden rows left out BEFORE that choice. `list()` is silent on failure because it sits under a working medicine search; this is a list the doctor opened on purpose, and "could not be loaded" must not look like "you have prescribed nothing". The generic is attached the same way but in CHUNKS of 25 brand prefixes — one query with one row cap would let the first brands crowd the last ones out, silently, at the cost of a contraindication warning on a line added in bulk.
```

- [ ] **Step 6: Typecheck and commit**

Run: `cd server && npx tsc --noEmit -p tsconfig.json`
Expected: no output.

```bash
git add server/src/rx-habits docs/API.md server/CLAUDE.md
git commit -m "feat(rx-habits): the list of a doctor's own medicines, one row each

GET /rx-habits/all, for the \"Add Bulk Medicine\" box. Scoped by
@WorkstationDoctorId(); the row of each medicine is the one the typing
dropdown offers first; hidden rows are left out before that choice; the
generic travels with each medicine, asked of the catalogue in chunks.
Unlike the dropdown lookup it throws on failure.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server — the scoping, against the real database

**Files:**
- Create: `server/test/rx-habits-all.int-spec.ts`

**Interfaces:**
- Consumes: `GET /api/rx-habits/all` (Task 1); `createTestApp`, `loginAs`, `makeDoctor`, `makeAssistantLink`, `resetDb` from `server/test/support`.

- [ ] **Step 1: Start the throwaway database**

Run (repo root): `docker compose -f docker-compose.test.yml up -d` then `cd server && npm run test:db`
Expected: `✓ muqsit_int_test ready` (and the other test databases).

- [ ] **Step 2: Write the test**

Create `server/test/rx-habits-all.int-spec.ts`:

```ts
import type { User } from '@prisma/client';
import { createTestApp, TestApp } from './support/app';
import { loginAs, makeAssistantLink, makeDoctor } from './support/fixtures';
import { resetDb } from './support/test-db';
import { normaliseDrugKey, searchKeyOf, signatureOf } from '../src/rx-habits/normalise';

// GET /api/rx-habits/all — the "Add Bulk Medicine" list, through the real HTTP
// pipeline and the real database. Every medicine and number here is made up.
//
//   A     a doctor with habits of every kind the rule has to choose between
//   B     another doctor, whose medicines A must never be shown
//   asst  an assistant of A
type Browser = ReturnType<TestApp['agent']>;
interface Listed { drugLabel: string; dose: string; food: string; duration: string; patientCount: number; generic?: string }

describe('GET /api/rx-habits/all', () => {
  let t: TestApp;
  let A: User, B: User, asst: User;
  let a: Browser, b: Browser, as: Browser;

  const habit = (
    doctorId: string,
    drugLabel: string,
    line: { dose: string; food: string; duration: string },
    over: { patientCount?: number; hidden?: boolean; pinned?: boolean } = {},
  ) =>
    t.prisma.doctorRxHabit.create({
      data: {
        doctorId,
        drugKey: normaliseDrugKey(drugLabel),
        searchKey: searchKeyOf(drugLabel),
        drugLabel,
        signature: signatureOf(line, []),
        dose: line.dose,
        food: line.food,
        duration: line.duration,
        contLines: [],
        patientCount: over.patientCount ?? 1,
        lastUsedAt: new Date('2026-10-01T00:00:00Z'),
        hidden: over.hidden ?? false,
        pinned: over.pinned ?? false,
      },
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    [A, B] = await Promise.all([makeDoctor(t.prisma), makeDoctor(t.prisma)]);
    asst = await makeDoctor(t.prisma, { accountTier: 'secondary' });
    await makeAssistantLink(t.prisma, A.id, asst.id, []);

    // Two instructions: the one given to more patients is the medicine's row.
    await habit(A.id, 'Tablet. Napa 500 mg', { dose: '1+1+1', food: 'After meal', duration: '5 days' }, { patientCount: 30 });
    await habit(A.id, 'Tablet. Napa 500 mg', { dose: '1+0+1', food: 'After meal', duration: '3 days' }, { patientCount: 4 });
    await habit(A.id, 'Tablet. Barcavir 0.5 mg', { dose: '1+0+0', food: '', duration: 'Continue' }, { patientCount: 9 });
    // The most-used instruction is hidden: the next one is the row.
    await habit(A.id, 'Capsule. Sergel 20 mg', { dose: '1+0+1', food: 'Before meal', duration: '14 days' }, { patientCount: 22, hidden: true });
    await habit(A.id, 'Capsule. Sergel 20 mg', { dose: '0+0+1', food: 'Before meal', duration: '7 days' }, { patientCount: 2 });
    // Every instruction hidden: not listed at all.
    await habit(A.id, 'Tablet. Onlyhidden 5 mg', { dose: '1+0+0', food: '', duration: '' }, { patientCount: 50, hidden: true });
    // A pinned instruction is the row, whatever the counts say.
    await habit(A.id, 'Tablet. Deltasone 5 mg', { dose: '2+0+0', food: 'After meal', duration: '5 days' }, { patientCount: 1, pinned: true });
    await habit(A.id, 'Tablet. Deltasone 5 mg', { dose: '1+0+0', food: 'After meal', duration: '5 days' }, { patientCount: 10 });
    // Another doctor's.
    await habit(B.id, 'Tablet. Bsecret 10 mg', { dose: '1+0+0', food: '', duration: '7 days' }, { patientCount: 99 });

    a = await loginAs(t, A);
    b = await loginAs(t, B);
    as = await loginAs(t, asst);
  });
  afterAll(async () => {
    await t.close();
  });

  const listed = (body: unknown) => (body as { medicines: Listed[] }).medicines;

  it('is refused without a session', async () => {
    const res = await t.agent().get('/api/rx-habits/all');
    expect(res.status).toBe(401);
  });

  it("⚕️ lists the doctor's OWN medicines, one row each, most patients first — and nobody else's", async () => {
    const res = await a.get('/api/rx-habits/all');
    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(false);
    const rows = listed(res.body);
    expect(rows.map((m) => [m.drugLabel, m.dose, m.patientCount])).toEqual([
      ['Tablet. Napa 500 mg', '1+1+1', 30],
      ['Tablet. Barcavir 0.5 mg', '1+0+0', 9],
      ['Capsule. Sergel 20 mg', '0+0+1', 2],
      ['Tablet. Deltasone 5 mg', '2+0+0', 1],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Bsecret');
    expect(JSON.stringify(res.body)).not.toContain('Onlyhidden');
  });

  it('⚕️ carries each generic from the catalogue, on the same response', async () => {
    const rows = listed((await a.get('/api/rx-habits/all')).body);
    expect(rows.find((m) => m.drugLabel === 'Tablet. Napa 500 mg')?.generic).toBe('Paracetamol');
    expect(rows.find((m) => m.drugLabel === 'Tablet. Barcavir 0.5 mg')?.generic).toBe('Entecavir');
    expect(rows.find((m) => m.drugLabel === 'Tablet. Deltasone 5 mg')?.generic).toBeUndefined(); // not in the test catalogue
  });

  it("the other doctor gets their own list, and a forged workstation header is refused", async () => {
    expect(listed((await b.get('/api/rx-habits/all')).body).map((m) => m.drugLabel)).toEqual(['Tablet. Bsecret 10 mg']);
    const forged = await b.get('/api/rx-habits/all').set({ 'X-Workstation': A.id });
    expect(forged.status).toBe(403);
    expect(JSON.stringify(forged.body)).not.toContain('Napa');
  });

  it("an assistant in A's workstation gets A's list; in no workstation, their own (empty)", async () => {
    const inA = await as.get('/api/rx-habits/all').set({ 'X-Workstation': A.id });
    expect(inA.status).toBe(200);
    expect(listed(inA.body)).toHaveLength(4);
    const own = await as.get('/api/rx-habits/all');
    expect(own.status).toBe(200);
    expect(listed(own.body)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it**

Run: `cd server && npx jest --config test/jest-int.json test/rx-habits-all.int-spec.ts`
Expected: PASS (5 tests). If the route-contract test is run too (`npm run test:int`), it passes because `docs/API.md` lists the route (Task 1, Step 5).

- [ ] **Step 4: Check the build output did not move, and commit**

A `.ts` outside `server/src` can move the build's output (see `server/CLAUDE.md`); `test/` is excluded, and this proves it without touching the running `dist/`:

Run: `cd server && npx tsc -p tsconfig.build.json --outDir "$TEMP/mhs-build-check" && ls "$TEMP/mhs-build-check/main.js" && rm -rf "$TEMP/mhs-build-check"`
Expected: the path of `main.js` is printed.

```bash
git add server/test/rx-habits-all.int-spec.ts
git commit -m "test(rx-habits): the bulk list is one doctor's, through the real database

Own medicines only; the row of a medicine is the dropdown's first
suggestion; a hidden dose does not hide the next and an all-hidden
medicine is not listed; a pinned row leads; the generic comes from the
catalogue; a forged workstation header is refused; an assistant sees the
practice's list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client — reading the list and building pad lines

**Files:**
- Modify: `client/src/lib/drugHistorySelect.ts` (the `appendBlocks` signature)
- Create: `client/src/lib/bulkMedicines.ts`
- Test: `client/src/lib/bulkMedicines.test.ts`
- Modify: `client/src/lib/rxHabitAlerts.test.ts`

**Interfaces:**
- Consumes: `appendBlocks`, `moveSummary` (`drugHistorySelect.ts`); `splitDrugLabel` (`rxShorthand.ts`); `RxItem` (`@/types`).
- Produces (all from `@/lib/bulkMedicines`):
  - `interface BulkMedicine { id: string; drugLabel: string; generic?: string; dose: string; food: string; duration: string; contLines: { dose: string; food: string; duration: string }[]; patientCount: number }`
  - `interface BulkList { medicines: BulkMedicine[]; truncated: boolean; unreadable: number }`
  - `type BulkOrder = "popular" | "alphabetical"`
  - `readBulkList(value: unknown): BulkList`
  - `sortBulk(list: BulkMedicine[], order: BulkOrder): BulkMedicine[]`
  - `searchBulk(list: BulkMedicine[], q: string): BulkMedicine[]`
  - `instructionOf(line: { dose: string; food: string; duration: string }): string`
  - `patientsLabel(n: number): string`
  - `bulkToRxItems(picked: BulkMedicine[], existing: RxItem[]): { items: RxItem[]; added: number; skipped: number }`

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/bulkMedicines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bulkToRxItems, instructionOf, patientsLabel, readBulkList, searchBulk, sortBulk, type BulkMedicine,
} from "./bulkMedicines";
import { moveSummary } from "./drugHistorySelect";
import type { RxItem } from "@/types";

// The "Add Bulk Medicine" box: what the server sends, read and turned into
// lines of the ℞ pad. ⚕️ Nothing here may invent a dose, part a taper from its
// medicine, lose a generic, or throw — it runs inside the prescription editor.
// Every medicine and number is made up.

const med = (over: Partial<BulkMedicine> = {}): BulkMedicine => ({
  id: "h1", drugLabel: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days",
  contLines: [], patientCount: 30, ...over,
});
const NAPA = med();
const SERGEL = med({ id: "h2", drugLabel: "Capsule. Sergel 20 mg", generic: "Esomeprazole", dose: "1+0+1", food: "Before meal", duration: "14 days", patientCount: 22 });
const DELTA = med({ id: "h3", drugLabel: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", patientCount: 6, contLines: [{ dose: "1+0+0", food: "After meal", duration: "5 days" }] });
const ACE = med({ id: "h4", drugLabel: "Tablet. Ace 500 mg", dose: "", food: "", duration: "", patientCount: 6 });

describe("readBulkList — what the server sent, read without trusting it", () => {
  it("reads a well-formed response", () => {
    const out = readBulkList({ medicines: [{ ...NAPA, drugKey: "tablet. napa 500mg", lastUsedAt: "2026-10-01T00:00:00.000Z" }, SERGEL], truncated: false });
    expect(out).toEqual({ medicines: [NAPA, SERGEL], truncated: false, unreadable: 0 });
  });

  it.each([null, undefined, 7, "x", [], {}, { medicines: "no" }, { medicines: null }])("gives an empty list for %j — never a throw", (value) => {
    expect(readBulkList(value)).toEqual({ medicines: [], truncated: false, unreadable: 0 });
  });

  it("⚕️ leaves out — and counts — a medicine it cannot read whole", () => {
    const out = readBulkList({
      medicines: [
        NAPA,
        null,
        "Tablet. Text 5 mg",
        { ...SERGEL, id: "" },                                  // no id to tick it by
        { ...SERGEL, id: "x1", drugLabel: "   " },              // no name
        { ...SERGEL, id: "x2", contLines: "1+0+0" },            // a taper that is not a list
        { ...SERGEL, id: "x3", contLines: [{ dose: "1+0+0" }] }, // half a taper line
        { ...NAPA },                                            // the same id twice
      ],
      truncated: true,
    });
    expect(out.medicines).toEqual([NAPA]);
    expect(out.unreadable).toBe(7);
    expect(out.truncated).toBe(true);
  });

  it("⚕️ invents nothing: a missing dose, food or duration is blank, a missing count is 0, a missing generic is absent", () => {
    const out = readBulkList({ medicines: [{ id: "h9", drugLabel: "Tablet. Bare 5 mg" }] });
    expect(out.medicines).toEqual([{ id: "h9", drugLabel: "Tablet. Bare 5 mg", dose: "", food: "", duration: "", contLines: [], patientCount: 0 }]);
    expect("generic" in out.medicines[0]).toBe(false);
  });
});

describe("sortBulk", () => {
  const list = [SERGEL, ACE, NAPA, DELTA];

  it("Popular: most patients first; the same count in A-to-Z order of the brand", () => {
    expect(sortBulk(list, "popular").map((m) => m.drugLabel)).toEqual([
      "Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Ace 500 mg", "Tablet. Deltasone 5 mg",
    ]);
  });

  it("Alphabetical: by the BRAND, not by the dosage form the label starts with", () => {
    expect(sortBulk(list, "alphabetical").map((m) => m.drugLabel)).toEqual([
      "Tablet. Ace 500 mg", "Tablet. Deltasone 5 mg", "Tablet. Napa 500 mg", "Capsule. Sergel 20 mg",
    ]);
  });

  it("is the same whatever order the list came in, and leaves the list it was given alone", () => {
    const given = [...list];
    expect(sortBulk([...list].reverse(), "popular")).toEqual(sortBulk(list, "popular"));
    expect(sortBulk([...list].reverse(), "alphabetical")).toEqual(sortBulk(list, "alphabetical"));
    expect(list).toEqual(given);
  });

  it("two strengths of one brand stay in a fixed order", () => {
    const two = [med({ id: "b", drugLabel: "Tablet. Napa 665 mg", patientCount: 1 }), med({ id: "a", drugLabel: "Tablet. Napa 500 mg", patientCount: 1 })];
    expect(sortBulk(two, "alphabetical").map((m) => m.drugLabel)).toEqual(["Tablet. Napa 500 mg", "Tablet. Napa 665 mg"]);
  });
});

describe("searchBulk", () => {
  const list = [NAPA, SERGEL, DELTA, ACE];

  it("nothing typed is the whole list", () => {
    expect(searchBulk(list, "")).toEqual(list);
    expect(searchBulk(list, "   ")).toEqual(list);
  });

  it("finds a medicine by any part of its name, in any case", () => {
    expect(searchBulk(list, "napa").map((m) => m.id)).toEqual(["h1"]);
    expect(searchBulk(list, "500").map((m) => m.id)).toEqual(["h1", "h4"]);
    expect(searchBulk(list, "TABLET ace").map((m) => m.id)).toEqual(["h4"]);
  });

  it("finds a medicine by its generic", () => {
    expect(searchBulk(list, "esomep").map((m) => m.id)).toEqual(["h2"]);
  });

  it("gives nothing when nothing matches", () => {
    expect(searchBulk(list, "zzz")).toEqual([]);
  });
});

describe("what a row says", () => {
  it("the instruction is the cells that were written, in the pad's order", () => {
    expect(instructionOf(NAPA)).toBe("1+1+1 · After meal · 5 days");
    expect(instructionOf({ dose: "1+0+0", food: "", duration: "Continue" })).toBe("1+0+0 · Continue");
    expect(instructionOf(ACE)).toBe("");
  });

  it("the count is of PATIENTS", () => {
    expect(patientsLabel(30)).toBe("30 patients");
    expect(patientsLabel(1)).toBe("1 patient");
    expect(patientsLabel(0)).toBe("0 patients");
  });
});

describe("bulkToRxItems — the ticked medicines as lines of the pad", () => {
  it("⚕️ a medicine becomes one line with exactly what was written — and a blank stays blank", () => {
    expect(bulkToRxItems([NAPA, ACE], []).items).toEqual([
      { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal", isCont: false, fromHabit: true },
      { drug: "Tablet. Ace 500 mg", dose: "", duration: "", instruction: "", isCont: false, fromHabit: true },
    ]);
  });

  it("⚕️ the generic goes with its medicine — it is what makes a prescribing alert fire", () => {
    expect(bulkToRxItems([SERGEL], []).items[0].generic).toBe("Esomeprazole");
    expect("generic" in bulkToRxItems([NAPA], []).items[0]).toBe(false);
  });

  it("⚕️ a taper goes under its own medicine, as continuation lines with no drug name", () => {
    expect(bulkToRxItems([NAPA, DELTA, SERGEL], []).items.map((it) => [it.drug, it.dose, it.isCont])).toEqual([
      ["Tablet. Napa 500 mg", "1+1+1", false],
      ["Tablet. Deltasone 5 mg", "2+0+0", false],
      ["", "1+0+0", true],
      ["Capsule. Sergel 20 mg", "1+0+1", false],
    ]);
  });

  it("keeps the order it was given, and counts medicines, not lines", () => {
    const out = bulkToRxItems([DELTA, NAPA], []);
    expect(out.added).toBe(2);
    expect(out.skipped).toBe(0);
    expect(out.items).toHaveLength(3);
  });

  it("a line already on the pad — the same drug, dose, instruction and duration — is skipped, taper and all", () => {
    const pad: RxItem[] = [
      { drug: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", instruction: "After meal" },
      { drug: "Tablet. Napa 500 mg", dose: "1+0+1", duration: "5 days", instruction: "After meal" }, // another dose: not the same line
    ];
    const out = bulkToRxItems([DELTA, NAPA], pad);
    expect(out.added).toBe(1);
    expect(out.skipped).toBe(1);
    expect(out.items.map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg"]);
    expect(moveSummary(out.added, out.skipped)).toBe("1 added · 1 already on ℞");
  });

  it("nothing ticked is nothing added", () => {
    expect(bulkToRxItems([], [])).toEqual({ items: [], added: 0, skipped: 0 });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd client && npx vitest run src/lib/bulkMedicines.test.ts`
Expected: FAIL — cannot resolve `./bulkMedicines`.

- [ ] **Step 3: Let `appendBlocks` take anything that has `items`**

In `client/src/lib/drugHistorySelect.ts` change the signature of `appendBlocks` (the body is unchanged):

```ts
export function appendBlocks(
  blocks: ReadonlyArray<Pick<HistoryBlock, "items">>,
  existing: RxItem[],
): { items: RxItem[]; added: number; skipped: number } {
```

- [ ] **Step 4: Write the module**

Create `client/src/lib/bulkMedicines.ts`:

```ts
import type { RxItem } from "@/types";
import { appendBlocks } from "@/lib/drugHistorySelect";
import { splitDrugLabel } from "@/lib/rxShorthand";

// The "Add Bulk Medicine" box (physician's request, 2026-10-13): the medicines
// this doctor has prescribed before, each with the instruction they most often
// write for it, ticked and added to the ℞ pad in one press.
//
// ⚕️ Everything here is ECHOED from prescriptions this doctor already saved.
// Nothing is completed, defaulted or reworded: a cell left blank is added
// blank, a taper goes with its medicine or not at all, and the generic — which
// is what makes a prescribing alert fire on a brand line — travels with the
// medicine it came with. The response reaches the prescription editor, where
// an uncaught error unmounts the whole screen, so it is read as UNKNOWN.

/** One `>>>` line of a tapering block. */
export interface BulkLine { dose: string; food: string; duration: string }

export interface BulkMedicine extends BulkLine {
  /** The habit row it stands for; what a tick is kept by. */
  id: string;
  /** As last written: the text added to the pad. */
  drugLabel: string;
  generic?: string;
  contLines: BulkLine[];
  /** DISTINCT PATIENTS given this instruction — never a prescription count. */
  patientCount: number;
}

export interface BulkList {
  medicines: BulkMedicine[];
  /** The doctor has more medicines than the server's cap. */
  truncated: boolean;
  /** Rows left out because they could not be read whole. */
  unreadable: number;
}

export type BulkOrder = "popular" | "alphabetical";

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// Null when it cannot be read: the caller leaves the medicine out WHOLE. Half
// a tapering schedule offered as the whole instruction is worse than none.
function linesOf(value: unknown): BulkLine[] | null {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: BulkLine[] = [];
  for (const entry of value) {
    const e = record(entry);
    if (!e || typeof e.dose !== "string" || typeof e.food !== "string" || typeof e.duration !== "string") return null;
    out.push({ dose: e.dose, food: e.food, duration: e.duration });
  }
  return out;
}

/** The server's response, read without trusting it. Total: never throws. */
export function readBulkList(value: unknown): BulkList {
  const root = record(value);
  const rows = root && Array.isArray(root.medicines) ? root.medicines : [];
  const medicines: BulkMedicine[] = [];
  const seen = new Set<string>();
  let unreadable = 0;
  for (const raw of rows) {
    const r = record(raw);
    const id = r ? text(r.id) : "";
    const drugLabel = r ? text(r.drugLabel).trim() : "";
    const contLines = r ? linesOf(r.contLines) : null;
    if (!r || !id || !drugLabel || contLines === null || seen.has(id)) { unreadable++; continue; }
    seen.add(id);
    const generic = text(r.generic).trim();
    const count = typeof r.patientCount === "number" && Number.isFinite(r.patientCount) && r.patientCount > 0 ? Math.floor(r.patientCount) : 0;
    medicines.push({
      id,
      drugLabel,
      ...(generic ? { generic } : {}),
      dose: text(r.dose),
      food: text(r.food),
      duration: text(r.duration),
      contLines,
      patientCount: count,
    });
  }
  return { medicines, truncated: root?.truncated === true, unreadable };
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
// What a medicine is filed under from A to Z: its brand. A label STARTS with
// its dosage form, and sorted by that the list is every capsule, then every
// tablet — not an order anyone looks a medicine up in.
const brandOf = (label: string): string => (splitDrugLabel(label).name || label).toLowerCase();
const aToZ = (a: BulkMedicine, b: BulkMedicine): number =>
  byText(brandOf(a.drugLabel), brandOf(b.drugLabel)) || byText(a.drugLabel.toLowerCase(), b.drugLabel.toLowerCase()) || byText(a.id, b.id);

/** A new list in the order asked for. The order is total: equal rows never swap. */
export function sortBulk(list: BulkMedicine[], order: BulkOrder): BulkMedicine[] {
  return [...list].sort(order === "alphabetical" ? aToZ : (a, b) => b.patientCount - a.patientCount || aToZ(a, b));
}

/** The medicines whose name or generic holds every word typed. */
export function searchBulk(list: BulkMedicine[], q: string): BulkMedicine[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return list;
  return list.filter((m) => {
    const hay = `${m.drugLabel} ${m.generic ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** A line's instruction as the row shows it: only the cells that were written. */
export const instructionOf = (line: BulkLine): string =>
  [line.dose, line.food, line.duration].map((s) => s.trim()).filter(Boolean).join(" · ");

export const patientsLabel = (n: number): string => (n === 1 ? "1 patient" : `${n} patients`);

/**
 * The lines the ticked medicines add to a pad that already holds `existing`,
 * in the order given. A medicine whose head line is already on the pad is
 * skipped, taper and all (`appendBlocks`); `added` and `skipped` count
 * medicines, not lines.
 */
export function bulkToRxItems(
  picked: BulkMedicine[],
  existing: RxItem[],
): { items: RxItem[]; added: number; skipped: number } {
  const blocks = picked.map((m) => {
    const head: RxItem = {
      drug: m.drugLabel,
      dose: m.dose,
      duration: m.duration,
      instruction: m.food,
      isCont: false,
      // Measurement only, as for "Your usual": stripped by the server.
      fromHabit: true,
      ...(m.generic ? { generic: m.generic } : {}),
    };
    const taper: RxItem[] = m.contLines.map((c) => ({
      drug: "", dose: c.dose, duration: c.duration, instruction: c.food, isCont: true, fromHabit: true,
    }));
    return { items: [head, ...taper] };
  });
  return appendBlocks(blocks, existing);
}
```

- [ ] **Step 5: Run the tests**

Run: `cd client && npx vitest run src/lib/bulkMedicines.test.ts src/lib/drugHistorySelect.test.ts`
Expected: PASS (both files).

- [ ] **Step 6: Hold the alert bridge for a bulk add**

In `client/src/lib/rxHabitAlerts.test.ts`, add the import `import { bulkToRxItems } from "./bulkMedicines";` and, inside the file's outermost `describe`, this test (it reuses the file's own `PREGNANT_SIDEBAR` and `CONTRAINDICATION`):

```ts
  // The same bridge, on the other fast path: a medicine added from the "Add
  // Bulk Medicine" box carries the generic the server sent with it.
  it("⚕️ a medicine added in bulk raises the same contraindication as the same medicine typed", () => {
    const { items } = bulkToRxItems(
      [{ id: "h_barcavir", drugLabel: "Tablet. Barcavir 0.5 mg", generic: "Entecavir", dose: "1+0+0", food: "", duration: "Continue", contLines: [], patientCount: 1 }],
      [],
    );
    const check = checkRxAlerts({ rxDrugs: items.map((i) => ({ text: i.drug, generic: i.generic })), sidebar: PREGNANT_SIDEBAR });
    expect(check.alerts.map((a) => a.message)).toContain(CONTRAINDICATION);
  });

  it("…and without its generic it would not — which is why the server sends it on the same response", () => {
    const { items } = bulkToRxItems(
      [{ id: "h_barcavir", drugLabel: "Tablet. Barcavir 0.5 mg", dose: "1+0+0", food: "", duration: "Continue", contLines: [], patientCount: 1 }],
      [],
    );
    const check = checkRxAlerts({ rxDrugs: items.map((i) => ({ text: i.drug, generic: i.generic })), sidebar: PREGNANT_SIDEBAR });
    expect(check.alerts.map((a) => a.message)).not.toContain(CONTRAINDICATION);
  });
```

The argument shape is the one `alertsAfterClickingSuggestion` in the same file uses.

Run: `cd client && npx vitest run src/lib/rxHabitAlerts.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

Run: `cd client && npx tsc --noEmit`
Expected: no output.

```bash
git add client/src/lib/bulkMedicines.ts client/src/lib/bulkMedicines.test.ts client/src/lib/drugHistorySelect.ts client/src/lib/rxHabitAlerts.test.ts
git commit -m "feat(rx): read a doctor's medicine list and turn ticks into pad lines

The pure half of \"Add Bulk Medicine\": the response is read as unknown
(a medicine that cannot be read whole is left out and counted), sorted by
patients or by brand, searched by name or generic, and turned into the
lines a template would add — blanks kept blank, a taper under its own
medicine, the generic with it, a line already on the pad skipped.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client — the query and the box

**Files:**
- Modify: `client/src/lib/api.ts`
- Create: `client/src/hooks/useBulkMedicines.ts`
- Create: `client/src/components/prescription/BulkMedicineModal.tsx`
- Test: `client/src/components/prescription/BulkMedicineModal.test.tsx`

**Interfaces:**
- Consumes: everything Task 3 produces; `useDialog(open, onClose)`; `Loading`, `LoadError` (`@/components/common/ListState`); `EmptyState` (default export of `@/components/common/EmptyState`); `ApiError` (`@/lib/api`); `itKeepsTheKeyboard` (`@/test/dialogKeyboard`).
- Produces:
  - `rxHabitsApi.all(): Promise<unknown>`
  - `useBulkMedicines(enabled: boolean, workstationId: string | null)` → the React Query result of `BulkList`
  - `interface BulkListState { data?: BulkList; isLoading: boolean; isError: boolean; error?: unknown; isFetching?: boolean; refetch: () => unknown }`
  - `default function BulkMedicineModal(props: { open: boolean; onClose: () => void; existing: RxItem[]; list: BulkListState; onAdd: (items: RxItem[], summary: string) => void })`

- [ ] **Step 1: Write the failing component tests**

Create `client/src/components/prescription/BulkMedicineModal.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// The "Add Bulk Medicine" box. ⚕️ What it must hold: only what is ticked is
// added, in the order on screen, with nothing filled in for the doctor; a tick
// survives a search that hides its row; and a failed list says so — it is
// never shown as "you have no medicines". Every medicine here is made up.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import BulkMedicineModal, { type BulkListState } from "./BulkMedicineModal";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";
import type { BulkList, BulkMedicine } from "@/lib/bulkMedicines";
import type { RxItem } from "@/types";

afterEach(cleanup);

const med = (over: Partial<BulkMedicine>): BulkMedicine => ({
  id: "h1", drugLabel: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days", contLines: [], patientCount: 30, ...over,
});
const NAPA = med({});
const SERGEL = med({ id: "h2", drugLabel: "Capsule. Sergel 20 mg", generic: "Esomeprazole", dose: "1+0+1", food: "Before meal", duration: "14 days", patientCount: 22 });
const DELTA = med({ id: "h3", drugLabel: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", patientCount: 6, contLines: [{ dose: "1+0+0", food: "After meal", duration: "5 days" }] });
const ACE = med({ id: "h4", drugLabel: "Tablet. Ace 500 mg", dose: "", food: "", duration: "", patientCount: 1 });

const loaded = (medicines: BulkMedicine[], over: Partial<BulkList> = {}): BulkListState => ({
  data: { medicines, truncated: false, unreadable: 0, ...over }, isLoading: false, isError: false, refetch: vi.fn(),
});

const open = (list: BulkListState, existing: RxItem[] = []) => {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(<BulkMedicineModal open onClose={onClose} existing={existing} list={list} onAdd={onAdd} />);
  return { onAdd, onClose, box: screen.getByRole("dialog", { name: "Add Bulk Medicine" }) };
};
const rowNames = (box: HTMLElement) => within(box).getAllByRole("checkbox").map((c) => c.closest("label")?.querySelector("[data-name]")?.textContent);
const tick = (box: HTMLElement, name: string) => fireEvent.click(within(box).getByRole("checkbox", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
const addButton = (box: HTMLElement) => within(box).getByRole("button", { name: /^Add/ });

describe("BulkMedicineModal", () => {
  itKeepsTheKeyboard({
    label: "Add Bulk Medicine",
    render: (onClose) => <BulkMedicineModal open onClose={onClose} existing={[]} list={loaded([NAPA, SERGEL])} onAdd={() => undefined} />,
  });

  it("draws nothing while it is closed", () => {
    render(<BulkMedicineModal open={false} onClose={() => undefined} existing={[]} list={loaded([NAPA])} onAdd={() => undefined} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists each medicine with its instruction, its taper and how many patients", () => {
    const { box } = open(loaded([NAPA, DELTA, ACE]));
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg", "Tablet. Deltasone 5 mg", "Tablet. Ace 500 mg"]);
    expect(box.textContent).toContain("1+1+1 · After meal · 5 days");
    expect(box.textContent).toContain("30 patients");
    expect(box.textContent).toContain("↳ 1+0+0 · After meal · 5 days");
    expect(box.textContent).toContain("1 patient");
    expect(box.textContent).toContain("No dose recorded"); // the medicine saved with nothing beside it
  });

  it("opens most-patients-first, and Alphabetical files by brand", () => {
    const { box } = open(loaded([ACE, SERGEL, NAPA]));
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Ace 500 mg"]);
    expect(within(box).getByRole("button", { name: "Popular" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(box).getByRole("button", { name: "Alphabetical" }));
    expect(rowNames(box)).toEqual(["Tablet. Ace 500 mg", "Tablet. Napa 500 mg", "Capsule. Sergel 20 mg"]);
    expect(within(box).getByRole("button", { name: "Alphabetical" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Add cannot be pressed with nothing ticked, and says how many are", () => {
    const { box, onAdd } = open(loaded([NAPA, SERGEL]));
    expect((addButton(box) as HTMLButtonElement).disabled).toBe(true);
    tick(box, "Tablet. Napa 500 mg");
    expect(addButton(box).textContent).toBe("Add (1)");
    expect(box.textContent).toContain("1 selected");
    tick(box, "Tablet. Napa 500 mg");
    expect((addButton(box) as HTMLButtonElement).disabled).toBe(true);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("⚕️ adds exactly the ticked medicines, in the order on screen, with what was written and nothing more", () => {
    const { box, onAdd, onClose } = open(loaded([NAPA, SERGEL, DELTA, ACE]));
    tick(box, "Tablet. Deltasone 5 mg");
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(addButton(box));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [items, summary] = onAdd.mock.calls[0] as [RxItem[], string];
    expect(items.map((it) => [it.drug, it.dose, it.instruction, it.duration, it.isCont])).toEqual([
      ["Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days", false],
      ["Tablet. Deltasone 5 mg", "2+0+0", "After meal", "5 days", false],
      ["", "1+0+0", "After meal", "5 days", true],
    ]);
    expect(summary).toBe("2 added");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("⚕️ a tick is kept while a search hides its row, and is still added", () => {
    const { box, onAdd } = open(loaded([NAPA, SERGEL]));
    tick(box, "Capsule. Sergel 20 mg");
    fireEvent.change(within(box).getByRole("textbox", { name: "Search medicines" }), { target: { value: "napa" } });
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg"]);
    expect(addButton(box).textContent).toBe("Add (1)");
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(addButton(box));
    expect((onAdd.mock.calls[0][0] as RxItem[]).map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg", "Capsule. Sergel 20 mg"]);
  });

  it("a search that matches nothing says so, and finds a medicine by its generic", () => {
    const { box } = open(loaded([NAPA, SERGEL]));
    const search = within(box).getByRole("textbox", { name: "Search medicines" });
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(within(box).queryAllByRole("checkbox")).toHaveLength(0);
    expect(box.textContent).toContain("No medicine matches “zzz”.");
    fireEvent.change(search, { target: { value: "esomep" } });
    expect(rowNames(box)).toEqual(["Capsule. Sergel 20 mg"]);
  });

  it("a medicine already on the pad with the same instruction is skipped, and the summary says so", () => {
    const pad: RxItem[] = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal" }];
    const { box, onAdd } = open(loaded([NAPA, SERGEL]), pad);
    tick(box, "Tablet. Napa 500 mg");
    tick(box, "Capsule. Sergel 20 mg");
    fireEvent.click(addButton(box));
    const [items, summary] = onAdd.mock.calls[0] as [RxItem[], string];
    expect(items.map((it) => it.drug)).toEqual(["Capsule. Sergel 20 mg"]);
    expect(summary).toBe("1 added · 1 already on ℞");
  });

  it("when everything ticked is already on the pad nothing is added, the box stays open and says why", () => {
    const pad: RxItem[] = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal" }];
    const { box, onAdd, onClose } = open(loaded([NAPA]), pad);
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(addButton(box));
    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(box.textContent).toContain("already on ℞");
  });

  it("says it is loading", () => {
    const { box } = open({ isLoading: true, isError: false, refetch: vi.fn() });
    expect(within(box).getByRole("status").textContent).toContain("Loading your medicines");
  });

  it("⚕️ a list that did not load says so and offers Try again — never 'no medicines yet'", () => {
    const refetch = vi.fn();
    const { box } = open({ isLoading: false, isError: true, error: new Error("Failed to fetch"), refetch });
    expect(within(box).getByRole("alert").textContent).toContain("Your medicines could not be loaded.");
    expect(box.textContent).not.toContain("Failed to fetch");
    expect(box.textContent).not.toContain("No medicines yet");
    fireEvent.click(within(box).getByRole("button", { name: /Try again/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a doctor with no history is told how the list fills", () => {
    const { box } = open(loaded([]));
    expect(box.textContent).toContain("No medicines yet");
    expect(box.textContent).toContain("They appear here after you save prescriptions.");
  });

  it("says when rows were left out, and when the list was cut at its cap", () => {
    const { box } = open(loaded([NAPA], { unreadable: 2, truncated: true }));
    expect(box.textContent).toContain("2 medicines could not be read and are not listed.");
    expect(box.textContent).toContain("Showing your 2,000 most used medicines.");
  });

  it("Cancel closes it and adds nothing", () => {
    const { box, onAdd, onClose } = open(loaded([NAPA]));
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(within(box).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("opened again, it starts with nothing ticked", () => {
    const list = loaded([NAPA]);
    const { rerender } = render(<BulkMedicineModal open onClose={() => undefined} existing={[]} list={list} onAdd={() => undefined} />);
    tick(screen.getByRole("dialog"), "Tablet. Napa 500 mg");
    rerender(<BulkMedicineModal open={false} onClose={() => undefined} existing={[]} list={list} onAdd={() => undefined} />);
    rerender(<BulkMedicineModal open onClose={() => undefined} existing={[]} list={list} onAdd={() => undefined} />);
    expect((within(screen.getByRole("dialog")).getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd client && npx vitest run src/components/prescription/BulkMedicineModal.test.tsx`
Expected: FAIL — cannot resolve `./BulkMedicineModal`.

- [ ] **Step 3: Add the API call and the query**

In `client/src/lib/api.ts`, inside `rxHabitsApi`, after `list`:

```ts
  // The "Add Bulk Medicine" list: every medicine this doctor has prescribed,
  // each with its usual instruction. Typed `unknown` on purpose — it reaches
  // the ℞ pad, so `readBulkList` (lib/bulkMedicines.ts) reads it defensively.
  all: () => apiFetch<unknown>(`/rx-habits/all`),
```

Create `client/src/hooks/useBulkMedicines.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { rxHabitsApi } from "@/lib/api";
import { readBulkList } from "@/lib/bulkMedicines";

/**
 * The doctor's own medicines for the "Add Bulk Medicine" box.
 *
 * Fetched when the box opens, and again each time it opens (`staleTime: 0`):
 * a prescription saved since the last opening has taught the list something.
 * Keyed by the workstation, so one practice's list is never shown — not even
 * for the moment a refetch takes — while working in another.
 *
 * ⚕️ Unlike `useRxHabits`, a failure is NOT swallowed: this is a list the
 * doctor asked for, and the box says "could not be loaded" with Try again.
 */
export function useBulkMedicines(enabled: boolean, workstationId: string | null) {
  return useQuery({
    queryKey: ["rx-habits", "all", workstationId ?? "own"],
    queryFn: async () => readBulkList(await rxHabitsApi.all()),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 4: Write the box**

Create `client/src/components/prescription/BulkMedicineModal.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { C, font } from "@/theme";
import { btnClose, btnDisabled, btnPrimary, btnSecondary, dialogTitle, inputSm, scrim, shadowDialog } from "@/theme/styles";
import { useDialog } from "@/lib/useDialog";
import { ApiError } from "@/lib/api";
import { Loading, LoadError } from "@/components/common/ListState";
import EmptyState from "@/components/common/EmptyState";
import { moveSummary } from "@/lib/drugHistorySelect";
import { splitDrugLabel } from "@/lib/rxShorthand";
import {
  bulkToRxItems, instructionOf, patientsLabel, searchBulk, sortBulk,
  type BulkList, type BulkMedicine, type BulkOrder,
} from "@/lib/bulkMedicines";
import type { RxItem } from "@/types";

// "Add Bulk Medicine" (physician's request, 2026-10-13): the doctor's own
// medicines, each with the instruction they most often write for it, ticked
// and added to the ℞ pad in one press.
//
// ⚕️ The box only ever ADDS, and only what is ticked. It fills in nothing — a
// cell the doctor left blank when prescribing is added blank — and it edits
// nothing: another dose is changed on the pad. What it shows comes from
// `lib/bulkMedicines.ts`, which has already read the server's response as
// unknown; this component holds only the ticks, the order and the search.

/** The part of a React Query result the box reads. */
export interface BulkListState {
  data?: BulkList;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  isFetching?: boolean;
  refetch: () => unknown;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** What the ℞ pad holds when Add is pressed: a line already there is skipped. */
  existing: RxItem[];
  list: BulkListState;
  /** The lines to append to the pad, and the sentence that says what happened. */
  onAdd: (items: RxItem[], summary: string) => void;
}

const NONE: BulkMedicine[] = [];
const ORDERS: { key: BulkOrder; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "alphabetical", label: "Alphabetical" },
];

export default function BulkMedicineModal({ open, onClose, existing, list, onAdd }: Props) {
  const [order, setOrder] = useState<BulkOrder>("popular");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState("");
  const dialog = useDialog(open, onClose);

  // Every opening starts clean: a tick left from the last one is not a choice
  // made for this prescription.
  useEffect(() => {
    if (!open) return;
    setOrder("popular");
    setSearch("");
    setPicked(new Set());
    setNote("");
  }, [open]);

  const all = list.data?.medicines ?? NONE;
  const sorted = useMemo(() => sortBulk(all, order), [all, order]);
  const shown = useMemo(() => searchBulk(sorted, search), [sorted, search]);

  if (!open) return null;

  // Counted over the whole list, not what a search leaves on screen: a tick on
  // a row that is filtered out is still a tick.
  const chosen = sorted.filter((m) => picked.has(m.id));
  const count = chosen.length;

  const toggle = (id: string) => {
    setNote("");
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const add = () => {
    if (count === 0) return;
    const { items, added, skipped } = bulkToRxItems(chosen, existing);
    if (added === 0) {
      setNote(count === 1 ? "That medicine is already on ℞ with the same instruction — nothing was added." : "Those medicines are already on ℞ with the same instructions — nothing was added.");
      return;
    }
    onAdd(items, moveSummary(added, skipped));
    onClose();
  };

  const row = (m: BulkMedicine) => {
    const on = picked.has(m.id);
    const { before, name, after } = splitDrugLabel(m.drugLabel);
    const line = instructionOf(m);
    return (
      <label key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 20px", cursor: "pointer", borderBottom: `0.5px solid ${C.n[200]}`, background: on ? C.pri[50] : "transparent" }}>
        <input type="checkbox" checked={on} onChange={() => toggle(m.id)} style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          {/* Only the brand in bold, as on the pad and the printed sheet. */}
          <span data-name style={{ display: "block", fontSize: 13, color: C.n[900], overflowWrap: "anywhere" }}>
            {name ? <>{before}<b>{name}</b>{after}</> : <b>{m.drugLabel}</b>}
          </span>
          <span style={{ display: "block", fontSize: 12, color: line ? C.n[700] : C.n[500], marginTop: 2, overflowWrap: "anywhere" }}>
            {line || "No dose recorded"}
          </span>
          {m.contLines.map((c, i) => (
            <span key={i} style={{ display: "block", fontSize: 12, color: C.n[700], marginTop: 1, overflowWrap: "anywhere" }}>↳ {instructionOf(c)}</span>
          ))}
        </span>
        <span style={{ flexShrink: 0, fontSize: 11, color: C.n[500], whiteSpace: "nowrap", marginTop: 2 }}>{patientsLabel(m.patientCount)}</span>
      </label>
    );
  };

  const notes: string[] = [];
  if (list.data?.truncated) notes.push("Showing your 2,000 most used medicines.");
  const unreadable = list.data?.unreadable ?? 0;
  if (unreadable > 0) notes.push(`${unreadable} ${unreadable === 1 ? "medicine" : "medicines"} could not be read and ${unreadable === 1 ? "is" : "are"} not listed.`);

  return (
    // The veil's padding is the box's margin: no `vh` / `vw` under the page zoom.
    <div style={{ position: "fixed", inset: 0, padding: 16, background: scrim, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add Bulk Medicine" {...dialog} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 100%)", maxWidth: "100%", maxHeight: "100%", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: shadowDialog, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: font }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 20px 12px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...dialogTitle }}>Add Bulk Medicine</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Medicines you have prescribed before, each with the instruction you most often write. Tick, then Add.</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={btnClose}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "0 20px 12px", borderBottom: `0.5px solid ${C.n[200]}` }}>
          <div role="group" aria-label="Order" style={{ display: "inline-flex", border: `1px solid ${C.n[200]}`, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
            {ORDERS.map((o) => (
              <button key={o.key} type="button" aria-pressed={order === o.key} onClick={() => setOrder(o.key)}
                style={{ padding: "6px 14px", border: "none", background: order === o.key ? C.pri[50] : C.n[0], color: order === o.key ? C.pri[600] : C.n[600], fontSize: 12, fontWeight: order === o.key ? 600 : 400, cursor: "pointer", fontFamily: font }}>
                {o.label}
              </button>
            ))}
          </div>
          <input aria-label="Search medicines" placeholder="Search medicines…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputSm, flex: "1 1 160px", minWidth: 0 }} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {notes.map((n) => (
            <div key={n} style={{ padding: "8px 20px", fontSize: 11.5, color: C.n[700], background: C.n[50], borderBottom: `0.5px solid ${C.n[200]}` }}>{n}</div>
          ))}
          {list.isLoading ? (
            <Loading label="Loading your medicines…" />
          ) : list.isError ? (
            <LoadError title="Your medicines could not be loaded." detail={list.error instanceof ApiError ? list.error.message : undefined} onRetry={() => list.refetch()} retrying={list.isFetching} />
          ) : all.length === 0 ? (
            <EmptyState icon="fileText" title="No medicines yet" hint="They appear here after you save prescriptions." />
          ) : shown.length === 0 ? (
            <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12.5, color: C.n[600] }}>No medicine matches “{search.trim()}”.</div>
          ) : (
            shown.map(row)
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50], flexWrap: "wrap" }}>
          <span aria-live="polite" style={{ fontSize: 11.5, color: note ? C.n[900] : C.n[600], fontWeight: note ? 500 : 400, flex: "1 1 160px", minWidth: 0 }}>
            {note || (count ? `${count} selected` : "Tick the medicines to add.")}
          </span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button type="button" onClick={onClose} style={btnSecondary("md")}>Cancel</button>
            <button type="button" onClick={add} disabled={count === 0} title={count === 0 ? "Tick a medicine first" : "Add the ticked medicines to this prescription"}
              style={{ ...btnPrimary("md"), fontWeight: 600, ...(count ? null : { ...btnDisabled, cursor: "default" }) }}>
              Add{count ? ` (${count})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `cd client && npx vitest run src/components/prescription/BulkMedicineModal.test.tsx`
Expected: PASS. Two things to check if a test fails rather than changing the assertion: the loading test reads `role="status"` (it must be `Loading`'s, so the footer line is `aria-live`, not `role="status"`); and the checkbox's accessible name is its row's text, which is why `tick()` matches on the medicine's name.

- [ ] **Step 6: Typecheck and commit**

Run: `cd client && npx tsc --noEmit`
Expected: no output.

```bash
git add client/src/lib/api.ts client/src/hooks/useBulkMedicines.ts client/src/components/prescription/BulkMedicineModal.tsx client/src/components/prescription/BulkMedicineModal.test.tsx
git commit -m "feat(rx): the Add Bulk Medicine box

The doctor's own medicines, one row each with the usual instruction, its
taper and how many patients; Popular or Alphabetical; a search by name or
generic; ticks that survive the search; Add hands over exactly what is
ticked, in the order on screen. Loading, a failed list with Try again, a
doctor with no history and rows that could not be read are each said. It
keeps the keyboard (useDialog).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — the + button on the OPD pad, and the journey in a browser

**Files:**
- Modify: `client/src/components/prescription/RightColumn.tsx`
- Modify: `server/test/seed-e2e.ts`, `e2e/tests/helpers.ts`
- Create: `e2e/tests/bulk-medicine.spec.ts`

**Interfaces:**
- Consumes: `BulkMedicineModal` and `useBulkMedicines` (Task 4); from `useMuqsit()`: `rxItems`, `setRxItems`, `can`, `activeWorkstationId`, `currentPatientId`.

- [ ] **Step 1: Write the failing journey**

In `server/test/seed-e2e.ts` add `'bulkMed'` to the end of the `ROLES` list (after `'loginWait'`); in `e2e/tests/helpers.ts` add `| 'bulkMed'` to the `Role` union (after `'loginWait'`).

Create `e2e/tests/bulk-medicine.spec.ts`:

```ts
import {
  DIAGNOSIS, NAPA, addFieldLine, addMedicine, createPatient, expect, login, newRxButton,
  padRow, printDialog, saveAndOpenSheet, settle, test, uniqueMobile,
} from './helpers';

// "Add Bulk Medicine": a medicine this doctor prescribed on one visit is
// offered on the next, with the dose and duration they wrote, and one tick
// puts it on the pad. Runs against the throwaway database; the patients are
// made up.
test('a medicine prescribed before is added to the next prescription from the + box, with its dose', async ({ page }) => {
  await login(page, 'bulkMed');

  // The box is for the doctor's own history: before any prescription, it is empty.
  await createPatient(page, uniqueMobile(), 'Bulk First Patient');
  const plus = page.getByRole('button', { name: 'Add Bulk Medicine' });
  await expect(plus).toHaveAttribute('title', 'Add Bulk Medicine');
  await plus.click();
  const box = page.getByRole('dialog', { name: 'Add Bulk Medicine' });
  await expect(box.getByText('No medicines yet')).toBeVisible();
  await box.getByRole('button', { name: 'Cancel' }).click();
  await expect(box).toBeHidden();

  // Visit 1: prescribe it by hand and save.
  await addMedicine(page, 0, NAPA);
  await addFieldLine(page, 'Final diagnosis', DIAGNOSIS);
  await saveAndOpenSheet(page);
  await printDialog(page).getByRole('button', { name: 'Close' }).click();

  // Visit 2, another patient: the medicine is in the box with what was written.
  await newRxButton(page).click();
  await createPatient(page, uniqueMobile(), 'Bulk Second Patient');
  await plus.click();
  const row = box.getByRole('checkbox', { name: new RegExp(NAPA.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await expect(row).toBeVisible();
  await expect(box).toContainText(`${NAPA.dose} · ${NAPA.duration}`);
  await expect(box).toContainText('1 patient');

  await row.check();
  await box.getByRole('button', { name: 'Add (1)' }).click();
  await expect(box).toBeHidden();
  await settle(page);

  // On the pad: the name, the dose and the duration — typed by nobody.
  const line = padRow(page, 0);
  await expect(line.locator('input').first()).toHaveValue(NAPA.label);
  await expect(line.getByPlaceholder('dose')).toHaveValue(NAPA.dose);
  await expect(line.getByPlaceholder('duration')).toHaveValue(NAPA.duration);
  await expect(page.getByText('1 added', { exact: true })).toBeVisible();

  // Pressed again with the same medicine: nothing is added twice.
  await plus.click();
  await row.check();
  await box.getByRole('button', { name: 'Add (1)' }).click();
  await expect(box).toContainText('already on ℞');
  await box.getByRole('button', { name: 'Cancel' }).click();
  await expect(padRow(page, 1).locator('input').first()).toHaveValue('');
});
```

- [ ] **Step 2: Run and watch it fail**

Run (repo root, test database up): `cd e2e && E2E_WEB_PORT=3110 E2E_API_PORT=4210 npx playwright test tests/bulk-medicine.spec.ts --reporter=list`
Expected: FAIL — no button named "Add Bulk Medicine".

- [ ] **Step 3: Wire the button and the box into the OPD pad**

In `client/src/components/prescription/RightColumn.tsx`:

Add the imports:

```ts
import BulkMedicineModal from "@/components/prescription/BulkMedicineModal";
import { useBulkMedicines } from "@/hooks/useBulkMedicines";
```

Add `activeWorkstationId, currentPatientId,` to the names taken from `useMuqsit()`.

After the `addTemplate` function add:

```ts
  // "Add Bulk Medicine" (physician's request, 2026-10-13): the + beside the ℞
  // mark opens the doctor's own medicines; the ticked ones are appended as a
  // template's are. OPD pad only — the IPD sheet, the Drug-history pad and the
  // template editor do not render this column.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const bulk = useBulkMedicines(bulkOpen, activeWorkstationId);
  const mayPrescribe = can("rx.medicines");

  // ⚕️ The box is opened over ONE patient's pad. Another device moving the
  // editor on (device mirroring), or a patient still loading, changes the pad
  // under it — and Add would then put the ticked medicines on the next
  // patient's prescription. When the patient changes, the box closes.
  useEffect(() => {
    setBulkOpen(false);
    setBulkMsg("");
  }, [currentPatientId]);
```

Replace the line `<div style={{ fontSize: 22, fontWeight: 500, color: C.pri[400], fontStyle: "italic" }}>℞</div>` with:

```tsx
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 500, color: C.pri[400], fontStyle: "italic" }}>℞</div>
        <button
          type="button"
          className="hit-area"
          aria-label="Add Bulk Medicine"
          title={mayPrescribe ? "Add Bulk Medicine" : "View only — you don't have access to edit medicines"}
          disabled={!mayPrescribe}
          onClick={() => { setBulkMsg(""); setBulkOpen(true); }}
          style={{ width: 20, height: 20, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: mayPrescribe ? C.pri[400] : C.n[400], fontSize: 14, cursor: mayPrescribe ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: font }}
        >+</button>
        {bulkMsg && <span role="status" style={{ fontSize: 11, color: C.pri[600] }}>{bulkMsg}</span>}
      </div>
```

After the line `{adviceBox && <DrugAdviceBox … />}` add:

```tsx
      <BulkMedicineModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        existing={rxItems}
        list={bulk}
        onAdd={(items, summary) => {
          setRxItems((prev) => [...prev, ...items]);
          setBulkMsg(summary);
        }}
      />
```

- [ ] **Step 4: Typecheck, run the client suite, run the journey**

Run: `cd client && npx tsc --noEmit && npx vitest run`
Expected: no type errors; every test file passes.

Run: `cd e2e && E2E_WEB_PORT=3110 E2E_API_PORT=4210 npx playwright test tests/bulk-medicine.spec.ts --reporter=list`
Expected: PASS. Then restore what the dev server rewrote: `git checkout -- client/tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/prescription/RightColumn.tsx server/test/seed-e2e.ts e2e/tests/helpers.ts e2e/tests/bulk-medicine.spec.ts
git commit -m "feat(rx): a + beside the ℞ mark adds medicines in bulk

The OPD pad's ℞ mark gets a + (\"Add Bulk Medicine\") that opens the
doctor's own medicines; the ticked ones are appended after the last line
of the pad with their dose, when to take, duration and taper, and a line
beside the + says what was added and what was already there. An
assistant needs rx.medicines. The box closes when the patient changes
under it, so ticks made for one patient never land on the next one's
prescription.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Documents, and the whole thing verified

**Files:**
- Modify: `client/CLAUDE.md`, `docs/DOMAIN.md`, `docs/superpowers/specs/2026-10-13-bulk-medicine-add-design.md`

- [ ] **Step 1: `client/CLAUDE.md`**

Add this bullet in "## UI conventions", directly after the bullet that begins "**⚕️ ••• Special advice per medicine**":

```md
- **⚕️ "Add Bulk Medicine" — the + beside the ℞ mark (physician's request, 2026-10-13), OPD pad only.** `RightColumn` draws the +, `components/prescription/BulkMedicineModal.tsx` is the box, `hooks/useBulkMedicines.ts` fetches `GET /rx-habits/all`, and `lib/bulkMedicines.ts` is every rule: the doctor's OWN medicines, **one row per medicine** with the instruction "Your usual" would offer first, Popular (most DISTINCT patients) or Alphabetical (by BRAND — a label starts with its dosage form), a search by name or generic. Ticked medicines are appended after the pad's last line, in the order on screen. Rules that are safety, each pinned in `bulkMedicines.test.ts` / `BulkMedicineModal.test.tsx`:
  - **It invents nothing.** A cell left blank when prescribing is added blank; nothing is defaulted.
  - **A taper goes with its medicine**, and a medicine whose taper cannot be read is left out WHOLE and counted ("2 medicines could not be read and are not listed") — the response is read as `unknown`, because it reaches the editor.
  - **The generic travels with the medicine**, from the server, on the same response: it is what makes a prescribing alert fire on a brand line (`rxHabitAlerts.test.ts` holds it for this path too).
  - **A line already on the pad is skipped** (`appendBlocks`, the rule of Drug history's "Move to Rx"): `1 added · 1 already on ℞`.
  - **A failed list SAYS so** (`LoadError`, Try again). Unlike "Your usual", which is silent under a working medicine search, this is a list the doctor opened on purpose — "could not be loaded" must never look like "No medicines yet".
  - **The box is one patient's.** It closes when `currentPatientId` changes under it (device mirroring, a patient still loading), so ticks made for one patient never land on the next one's prescription.
  - **A tick survives a search** that hides its row, and the footer counts every tick; every opening starts with nothing ticked.
  - It does not teach `DoctorRxHabit` anything and logs nothing: only a saved prescription does. The IPD sheet, the Drug-history pad and the template editor do not get it (ward doses are not outpatient habits).
```

- [ ] **Step 2: `docs/DOMAIN.md`**

Add this bullet directly after the bullet that begins "**Prescribing habit ("Your usual", 2026-08-17):**" (and its sub-bullets):

```md
- **Add Bulk Medicine (2026-10-13):** a + beside the ℞ mark of the OPD pad opens the medicines THIS doctor has prescribed before — never a combined list — one row per medicine, with the instruction given to the most patients (the first one "Your usual" would offer). The physician's decisions: one row per medicine, not one per dose; two orders, *Popular* (most distinct patients first) and *Alphabetical*; ticked medicines are added to the pad with dose, when to take, duration and taper already filled in. What it inherits: a dose the doctor hid is not offered; nothing is filled in that was not written; a line already on the pad is not added twice; the prescribing alerts fire as if the medicines had been typed. It is a faster way to what the doctor already writes — it adds no medicine they have not prescribed and stores nothing.
```

- [ ] **Step 3: Bring the spec in line with what was built**

In `docs/superpowers/specs/2026-10-13-bulk-medicine-add-design.md`: change "Status: approved, not built." to "Status: built 2026-10-13."; change the search sentence to "**Search** narrows the list as typed (case-insensitive; every word typed must be in the name or the generic)."; change the Client paragraph's last bullet to "The list is fetched each time the box opens, so a prescription saved since the last opening is in it."; and add to the first bullet list under "## The box": "- **The box is one patient's:** it closes if the patient changes under it."

- [ ] **Step 4: Verify everything**

Run each and expect the result stated:

```bash
cd server && npx tsc --noEmit -p tsconfig.json          # no output
cd server && npm test                                   # all suites pass
cd server && npm run test:int                           # all suites pass (database up; the route contract reads docs/API.md)
cd client && npx tsc --noEmit                           # no output
cd client && npm test                                   # all files pass
cd client && NEXT_DIST_DIR=.next-verify npm run build   # "Compiled successfully"
```

Then `rm -rf client/.next-verify && git checkout -- client/tsconfig.json client/src/lib/__snapshots__/prescriptionDoc.snap.test.ts.snap`, and the full browser suite: `cd e2e && E2E_WEB_PORT=3110 E2E_API_PORT=4210 npx playwright test --reporter=list` — every test passes (one opt-in probe is skipped).

- [ ] **Step 5: Look at it in a real browser, on the sandbox**

With the e2e servers (or `api-e2e` / `web-e2e` from `.claude/launch.json`) on the throwaway database, as a made-up doctor with a few saved prescriptions: open the box at desktop width and at 375px. Check: the + sits beside ℞ and shows its tooltip; the box fits the screen with only the list scrolling; a long medicine name wraps and does not push the count off; the order switch and search work; Tab stays inside and Escape closes; the added lines show the brand in bold on the pad. Never on `localhost:3000`.

- [ ] **Step 6: Commit**

```bash
git add client/CLAUDE.md docs/DOMAIN.md docs/superpowers/specs/2026-10-13-bulk-medicine-add-design.md
git commit -m "docs: Add Bulk Medicine — the rules, where the next reader looks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
