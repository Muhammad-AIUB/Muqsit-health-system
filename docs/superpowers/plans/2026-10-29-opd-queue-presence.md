# OPD queue: presence, urgency and status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the OPD queue, show each patient's photo, three tick boxes (Present, Critically ill, Urgent) with a colour and a time, a status that follows the visit, and the new summary cards.

**Architecture:** Three nullable columns on `OpdVisit` hold the ticks. The server's `list`/`move` answers add two derived, read-only fields per row: the patient's `pictureUrl` and a `padStage` (`history` / `pending` / `null`) worked out from the parked visit (`incompleteRx`, or the supervising practice's `SupervisedDraft`) — the draft itself never leaves the server. The client works out status, row colour and counts with one pure module and draws them in `OpdView`.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL (jest, `*.spec.ts` / `test/*.int-spec.ts`); Next.js 14 + React Query + vitest (`*.test.ts(x)`).

Spec: `docs/superpowers/specs/2026-10-29-opd-queue-presence-design.md`.

## Global Constraints

- ⚕️ **No clinical content is invented.** The fields that make a visit "History taken" are the physician's "Chief complaints or any data entry": every editor text field except medicines and investigations; those two make it "Prescription pending". They are named in ONE constant (`HISTORY_FIELDS`, `PENDING_FIELDS`) so the physician can read and change the list.
- ⚕️ **Scoping:** every query is by `@WorkstationDoctorId()`; a draft is read for THIS practice only (the owner's `incompleteRx`, or this doctor's own `SupervisedDraft`) — never another practice's.
- ⚕️ **Nothing is stored that can be derived:** status, colour and counts are worked out when shown.
- DB: additive, idempotent `server/prisma/manual-opd-presence.sql`, owner `exhort_user`. **Do not apply it to the shared database** — applying migrates production; the user decides. Tests build a throwaway database (`npm run test:db`).
- Every new request field is declared on the DTO (`ValidationPipe({ whitelist: true })`).
- UI: palette `C` only, no literal colours, no emoji icons (inline SVG), every control has an accessible name, no `vh`/`vw`, no `toLocale…` (use the lib helpers below), no third-party CDN.
- Dates are Dhaka (UTC+6, fixed); a day is a `yyyy-mm-dd` string.
- `docs/API.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, `docs/DOMAIN.md` are updated in the same commit as the change they describe.
- **Work in a copy of the sources**, not the checkout the dev servers watch (root CLAUDE.md: "We do not land one half of a change in the checkout the dev servers are watching"). Make a real copy with its own `node_modules` (see memory `verify-in-a-copy`), do Tasks 1–8 there, and bring the finished change to the checkout in ONE step as a `git apply --check`-ed patch. Commits: conventional, identity `Muhammad-AIUB <mjubayer.aiub@gmail.com>` (check `git config user.email`), ending `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Branch `dev` only.
- Before the server work: kill any `:4000` process before `prisma generate` (Windows locks the DLL).

## File Structure

| File | Responsibility |
|---|---|
| `server/prisma/schema.prisma` (modify) | 3 new `OpdVisit` fields |
| `server/prisma/manual-opd-presence.sql` (create) | additive SQL for them |
| `server/src/opd/pad-stage.ts` (create) | pure: draft snapshot → `history` / `pending` / `null` |
| `server/src/opd/pad-stage.spec.ts` (create) | its tests |
| `server/src/opd/dto/opd.dto.ts` (modify) | `SetOpdPresenceDto` |
| `server/src/opd/opd.service.ts` (modify) | `setPresence`; `list`/`move` add `pictureUrl` + `padStage` |
| `server/src/opd/opd.controller.ts` (modify) | `PATCH /opd/:id/presence` |
| `server/src/opd/opd.service.spec.ts`, `server/test/opd-queue.int-spec.ts` (modify) | refusals; database behaviour |
| `client/src/lib/opdPresence.ts` (create) + test | pure: status, row colour, clock text, counts |
| `client/src/lib/api.ts`, `client/src/hooks/useOpd.ts` (modify) | types, `setPresence`, optimistic hook |
| `client/src/components/opd/PatientAvatar.tsx` (create) + test | photo or silhouette |
| `client/src/components/tabs/OpdView.tsx` (modify) + tests | the row and the cards |
| docs (modify) | API.md, both CLAUDE.md, DOMAIN.md |

---

### Task 1: Columns on `OpdVisit`

**Files:**
- Modify: `server/prisma/schema.prisma` (model `OpdVisit`, after `position`)
- Create: `server/prisma/manual-opd-presence.sql`

**Interfaces:**
- Produces: `OpdVisit.presentAt: Date | null`, `OpdVisit.criticallyIll: boolean`, `OpdVisit.urgent: boolean` (Prisma client types).

- [ ] **Step 1: Edit the schema.** After `position  Int?` in `model OpdVisit` add:

```prisma
  // Reception's marks (physician's sheet, 29/10/2026). `presentAt` is when the
  // patient was marked present (server clock), NULL = not present; the two flags
  // are independent of it. Status, colour and counts are derived, never stored.
  presentAt     DateTime?
  criticallyIll Boolean   @default(false)
  urgent        Boolean   @default(false)
```

- [ ] **Step 2: Write the SQL** `server/prisma/manual-opd-presence.sql`:

```sql
-- OPD queue presence (physician's sheet, 29/10/2026). ADDITIVE AND IDEMPOTENT:
-- nothing is deleted or rewritten. This database is SHARED with production —
-- apply BEFORE the release that reads these columns is deployed:
--   npx prisma db execute --file prisma/manual-opd-presence.sql --schema prisma/schema.prisma
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "presentAt" TIMESTAMP(3);
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "criticallyIll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "urgent" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Regenerate the client.** Stop `:4000` first.
Run: `cd server && npx prisma generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 4: Typecheck.** Run: `cd server && npx tsc --noEmit -p tsconfig.json` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/manual-opd-presence.sql
git commit -m "feat(opd): columns for presence, critically ill and urgent"
```

---

### Task 2: `padStage` — what the parked visit says

**Files:**
- Create: `server/src/opd/pad-stage.ts`, `server/src/opd/pad-stage.spec.ts`

**Interfaces:**
- Produces: `type PadStage = 'history' | 'pending' | null`; `HISTORY_FIELDS`, `PENDING_FIELDS` (readonly string arrays); `padStage(draft: unknown, today: string): PadStage` where `today` is the Dhaka `yyyy-mm-dd`.

The draft's `ptDate` is ISO `yyyy-mm-dd`. A draft whose `ptDate` is not today (a visit parked yesterday, not yet reopened) or is missing is **not** today's visit: `null`, never a wrong "History taken".

- [ ] **Step 1: Write the failing test** `server/src/opd/pad-stage.spec.ts`:

```ts
import { HISTORY_FIELDS, padStage, PENDING_FIELDS } from './pad-stage';

const TODAY = '2026-10-29';
const draft = (over: Record<string, unknown>) => ({ ptDate: TODAY, ...over });

describe('padStage — what the parked visit says', () => {
  it('is null for nothing, an empty draft, or anything that is not a draft', () => {
    for (const d of [null, undefined, 'x', 5, [], {}, draft({}), draft({ chiefComplaints: [], note: '  ' })]) {
      expect(padStage(d, TODAY)).toBeNull();
    }
  });

  it('is "history" when any history field holds text', () => {
    for (const f of HISTORY_FIELDS) {
      expect(padStage(draft({ [f]: ['x'] }), TODAY)).toBe('history');
      expect(padStage(draft({ [f]: 'x' }), TODAY)).toBe('history');
    }
  });

  it('is "pending" when a medicine is written, a pad line is held, or an investigation is entered', () => {
    expect(padStage(draft({ rxItems: [{ drug: 'Tablet. Napa 500 mg' }] }), TODAY)).toBe('pending');
    expect(padStage(draft({ rxPadHeld: [{ drug: '' }] }), TODAY)).toBe('pending');
    for (const f of PENDING_FIELDS) expect(padStage(draft({ [f]: ['29/10/2026:Hb:11'] }), TODAY)).toBe('pending');
  });

  it('pending wins over history', () => {
    expect(padStage(draft({ chiefComplaints: ['fever'], rxItems: [{ drug: 'Napa' }] }), TODAY)).toBe('pending');
  });

  it('a blank medicine line is not a medicine', () => {
    expect(padStage(draft({ rxItems: [{ drug: '  ', dose: '' }] }), TODAY)).toBeNull();
  });

  it("a draft of another day is not today's visit, and nor is one with no date", () => {
    expect(padStage({ ptDate: '2026-10-28', chiefComplaints: ['fever'] }, TODAY)).toBeNull();
    expect(padStage({ chiefComplaints: ['fever'] }, TODAY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail.** Run: `cd server && npx jest src/opd/pad-stage.spec.ts` — Expected: FAIL, "Cannot find module './pad-stage'".

- [ ] **Step 3: Implement** `server/src/opd/pad-stage.ts`:

```ts
// What a patient's parked visit (the editor snapshot, `Patient.incompleteRx` or a
// supervising practice's `SupervisedDraft.data`) says about how far the doctor has
// got — for the OPD queue's Status. Pure and total: the snapshot is a Json column,
// so every read here is of an `unknown`.
//
// ⚕️ Which fields count is the physician's: "Chief complaints or any data entry"
// is History taken; medicines or investigations written, not yet printed, is
// Prescription pending. The names are the editor snapshot's own
// (client MuqsitContext). Change the lists here, nowhere else.

export type PadStage = 'history' | 'pending' | null;

export const HISTORY_FIELDS = [
  'chiefComplaints', 'previousComplaints', 'history', 'onExamination', 'note', 'plan',
  'provisionalDiagnosis', 'associatedIllness', 'finalDiagnosis', 'advice', 'adviceTest',
] as const;
export const PENDING_FIELDS = ['investigation'] as const;

const filled = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.some(filled);
  if (typeof v === 'string') return v.trim() !== '';
  if (v && typeof v === 'object') return Object.keys(v).length > 0;
  return false;
};

const medicineWritten = (d: Record<string, unknown>): boolean => {
  const items = d.rxItems;
  if (Array.isArray(items) && items.some((i) => i && typeof i === 'object' && filled((i as { drug?: unknown }).drug))) {
    return true;
  }
  // A pad line the pad cannot write is held beside the items — still work.
  return Array.isArray(d.rxPadHeld) && d.rxPadHeld.length > 0;
};

// `today` is the Dhaka day, `yyyy-mm-dd`, like the snapshot's `ptDate`. A draft
// of another day is not today's visit (it is parked, not yet reopened), and one
// with no date cannot be told: both say nothing rather than a wrong stage.
export function padStage(draft: unknown, today: string): PadStage {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
  const d = draft as Record<string, unknown>;
  if (d.ptDate !== today) return null;
  if (medicineWritten(d) || PENDING_FIELDS.some((f) => filled(d[f]))) return 'pending';
  if (HISTORY_FIELDS.some((f) => filled(d[f]))) return 'history';
  return null;
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `cd server && npx jest src/opd/pad-stage.spec.ts` — Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/opd/pad-stage.ts server/src/opd/pad-stage.spec.ts
git commit -m "feat(opd): read how far a parked visit has got"
```

---

### Task 3: Server — the presence route and the enriched rows

**Files:**
- Modify: `server/src/opd/dto/opd.dto.ts`, `server/src/opd/opd.service.ts`, `server/src/opd/opd.controller.ts`
- Modify: `server/src/opd/opd.service.spec.ts`, `server/test/opd-queue.int-spec.ts`
- Modify: `docs/API.md` (§5.12)

**Interfaces:**
- Consumes: `padStage(draft, today)` (Task 2); Prisma `OpdVisit.presentAt/criticallyIll/urgent` (Task 1).
- Produces: `PATCH /api/opd/:id/presence` body `{ present?: boolean, criticallyIll?: boolean, urgent?: boolean }` → the updated `OpdVisit`. `OpdService.setPresence(doctorId, id, dto): Promise<OpdVisit>`. `list()` and `move()` rows are `OpdVisit & { pictureUrl: string | null; padStage: PadStage }` (type `OpdVisitRow`).

- [ ] **Step 1: DTO.** Append to `opd.dto.ts` (add `IsBoolean` to the class-validator import):

```ts
// Reception's marks on one visit. Each field is optional and changes only itself;
// `present: true` records the time, `present: false` clears it.
export class SetOpdPresenceDto {
  @IsOptional() @IsBoolean() present?: boolean;
  @IsOptional() @IsBoolean() criticallyIll?: boolean;
  @IsOptional() @IsBoolean() urgent?: boolean;
}
```

- [ ] **Step 2: Failing unit tests.** In `opd.service.spec.ts`, inside the existing `describe` (clock is faked to 28/10/2026 16:00 Dhaka), add:

```ts
  describe('setPresence', () => {
    it('refuses a visit that is not this doctor\'s, before writing', async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue(null);
      await expect(service.setPresence('doc', 'v1', { present: true })).rejects.toThrow(/not found/i);
      expect(prisma.opdVisit.update).not.toHaveBeenCalled();
    });

    it("refuses any day but today's, before writing", async () => {
      for (const queueDate of ['2026-10-27', '2026-10-29']) {
        const { prisma, service } = build();
        prisma.opdVisit.findFirst.mockResolvedValue({ id: 'v1', queueDate, createdAt: new Date(), presentAt: null });
        await expect(service.setPresence('doc', 'v1', { present: true })).rejects.toThrow(/today/i);
        expect(prisma.opdVisit.update).not.toHaveBeenCalled();
      }
    });

    it('records the server time on present and keeps the first time when pressed again', async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue({ id: 'v1', queueDate: '2026-10-28', createdAt: new Date(), presentAt: null });
      prisma.opdVisit.update.mockImplementation(async ({ data }: { data: object }) => data);
      const first = (await service.setPresence('doc', 'v1', { present: true })) as unknown as { presentAt: Date };
      expect(first.presentAt.toISOString()).toBe('2026-10-28T10:00:00.000Z');

      const earlier = new Date('2026-10-28T09:00:00Z');
      prisma.opdVisit.findFirst.mockResolvedValue({ id: 'v1', queueDate: '2026-10-28', createdAt: new Date(), presentAt: earlier });
      prisma.opdVisit.update.mockClear();
      await service.setPresence('doc', 'v1', { present: true });
      expect(prisma.opdVisit.update.mock.calls[0][0].data).not.toHaveProperty('presentAt');
    });

    it('clears the time on present:false and changes only the fields sent', async () => {
      const { prisma, service } = build();
      prisma.opdVisit.findFirst.mockResolvedValue({ id: 'v1', queueDate: '2026-10-28', createdAt: new Date(), presentAt: new Date() });
      prisma.opdVisit.update.mockImplementation(async ({ data }: { data: object }) => data);
      expect(await service.setPresence('doc', 'v1', { present: false })).toEqual({ presentAt: null });
      expect(await service.setPresence('doc', 'v1', { urgent: true })).toEqual({ urgent: true });
    });
  });
```

- [ ] **Step 3: Run to see them fail.** Run: `cd server && npx jest src/opd/opd.service.spec.ts` — Expected: FAIL, `service.setPresence is not a function`.

- [ ] **Step 4: Service.** In `opd.service.ts`:

Add imports: `SetOpdPresenceDto` (from `./dto/opd.dto`), `padStage, PadStage` (from `./pad-stage`).

Add constant and type near the top:

```ts
const PRESENCE_TODAY_ONLY = "Only today's queue can be marked present.";

// A queue row as the doctor's screen reads it: the visit, the patient's picture,
// and how far the parked visit has got (never the draft itself).
export type OpdVisitRow = OpdVisit & { pictureUrl: string | null; padStage: PadStage };
```

Replace `list` with:

```ts
  async list(doctorId: string, day: string = dhakaDayKey()): Promise<OpdVisitRow[]> {
    this.requireDay(day);
    const rows = await this.prisma.opdVisit.findMany({ where: this.dayWhere(doctorId, day), orderBy: DISPLAY_ORDER });
    return this.decorate(this.prisma, doctorId, rows);
  }

  // ⚕️ The patient's picture and how far THIS practice's parked visit has got.
  // The draft read is this practice's own: the owner's `incompleteRx` when the
  // patient is theirs, else this doctor's own `SupervisedDraft` — never another
  // practice's (server/CLAUDE.md, Rule 2). A missing SupervisedDraft table costs
  // only the stage, never the queue.
  private async decorate(
    db: Pick<Prisma.TransactionClient, 'patient' | 'supervisedDraft'>,
    doctorId: string,
    rows: OpdVisit[],
  ): Promise<OpdVisitRow[]> {
    const ids = [...new Set(rows.map((r) => r.patientId).filter((id): id is string => !!id))];
    if (ids.length === 0) return rows.map((r) => ({ ...r, pictureUrl: null, padStage: null }));
    const patients = await db.patient.findMany({
      where: { id: { in: ids } },
      select: { id: true, doctorId: true, pictureUrl: true, incompleteRx: true },
    });
    let supervised: { patientId: string; data: Prisma.JsonValue }[] = [];
    try {
      supervised = await db.supervisedDraft.findMany({
        where: { doctorId, patientId: { in: ids } },
        select: { patientId: true, data: true },
      });
    } catch {
      supervised = [];
    }
    const byId = new Map(patients.map((p) => [p.id, p]));
    const draftOf = new Map(supervised.map((s) => [s.patientId, s.data]));
    const today = dhakaDayKey();
    return rows.map((r) => {
      const p = r.patientId ? byId.get(r.patientId) : undefined;
      const draft = p ? (p.doctorId === doctorId ? p.incompleteRx : draftOf.get(p.id)) : null;
      return { ...r, pictureUrl: p?.pictureUrl ?? null, padStage: padStage(draft, today) };
    });
  }
```

In `move`, change the two `return rows;` / `return this.dayRows(tx, doctorId, day);` so the transaction returns raw rows and the decorated answer is built after it. Replace the transaction block's returns and the method's signature:

```ts
  async move(doctorId: string, id: string, dto: MoveOpdVisitDto): Promise<OpdVisitRow[]> {
    // … unchanged down to `const day = …; if (day < …) throw …;`
    const rows = await this.prisma.$transaction(async (tx) => {
      // … unchanged body …
    }, ROW_LOCK_TX);
    return this.decorate(this.prisma, doctorId, rows);
  }
```

Add the new method after `setStatus`:

```ts
  // ⚕️ Reception's marks. Today's queue only: a later day's patient has not
  // arrived, and a day that has passed keeps what it holds. Each field changes
  // only itself; `present` records the SERVER's time once (pressed again it keeps
  // the first time) and clears it when taken off.
  async setPresence(doctorId: string, id: string, dto: SetOpdPresenceDto): Promise<OpdVisit> {
    const visit = await this.prisma.opdVisit.findFirst({ where: { id, doctorId } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (this.visitDay(visit) !== dhakaDayKey()) throw new BadRequestException(PRESENCE_TODAY_ONLY);
    const data: Prisma.OpdVisitUpdateInput = {};
    if (dto.present === true && !visit.presentAt) data.presentAt = new Date();
    if (dto.present === false) data.presentAt = null;
    if (dto.criticallyIll !== undefined) data.criticallyIll = dto.criticallyIll;
    if (dto.urgent !== undefined) data.urgent = dto.urgent;
    return this.prisma.opdVisit.update({ where: { id }, data });
  }
```

Update the spec's `build()` mock so `list` tests still pass: add `patient: { findMany: jest.fn().mockResolvedValue([]) }, supervisedDraft: { findMany: jest.fn().mockResolvedValue([]) }` to the `prisma` object.

- [ ] **Step 5: Controller.** Add `SetOpdPresenceDto` to the DTO import and, after `setStatus`:

```ts
  // Reception's marks: present (with the time), critically ill, urgent. Today only.
  @Patch(':id/presence')
  setPresence(
    @WorkstationDoctorId() doctorId: string,
    @Param('id') id: string,
    @Body() dto: SetOpdPresenceDto,
  ) {
    return this.opd.setPresence(doctorId, id, dto);
  }
```

- [ ] **Step 6: Unit tests pass.** Run: `cd server && npx jest src/opd` — Expected: all PASS.

- [ ] **Step 7: Integration tests.** Append inside the top-level `describe` of `server/test/opd-queue.int-spec.ts`:

```ts
  describe('presence', () => {
    it('ticks Present with the server time, keeps it, and clears it', async () => {
      const { browser } = await setup();
      const v = (await add(browser, 'Present One')).body as OpdVisit;
      const on = await browser.patch(`/api/opd/${v.id}/presence`).send({ present: true });
      expect(on.status).toBe(200);
      expect(on.body.presentAt).toEqual(expect.any(String));
      const again = await browser.patch(`/api/opd/${v.id}/presence`).send({ present: true });
      expect(again.body.presentAt).toBe(on.body.presentAt);
      const off = await browser.patch(`/api/opd/${v.id}/presence`).send({ present: false });
      expect(off.body.presentAt).toBeNull();
    });

    it('the two flags are independent of Present and of each other', async () => {
      const { browser } = await setup();
      const v = (await add(browser, 'Flags')).body as OpdVisit;
      await browser.patch(`/api/opd/${v.id}/presence`).send({ urgent: true });
      const row = (await list(browser))[0] as OpdVisit;
      expect([row.urgent, row.criticallyIll, row.presentAt]).toEqual([true, false, null]);
    });

    it('refuses a later day and a past day, and another doctor\'s visit', async () => {
      const { doctor, browser } = await setup();
      const later = (await add(browser, 'Later', LATER)).body as OpdVisit;
      const past = await pastVisit(doctor, 'Past');
      expect((await browser.patch(`/api/opd/${later.id}/presence`).send({ present: true })).status).toBe(400);
      expect((await browser.patch(`/api/opd/${past.id}/presence`).send({ present: true })).status).toBe(400);
      const other = await setup();
      const mine = (await add(browser, 'Mine')).body as OpdVisit;
      expect((await other.browser.patch(`/api/opd/${mine.id}/presence`).send({ urgent: true })).status).toBe(404);
    });

    it('a field that is not on the DTO is dropped, and a non-boolean is refused', async () => {
      const { browser } = await setup();
      const v = (await add(browser, 'Dto')).body as OpdVisit;
      expect((await browser.patch(`/api/opd/${v.id}/presence`).send({ urgent: 'yes' })).status).toBe(400);
    });
  });

  describe('the row carries the picture and how far the parked visit has got', () => {
    it("reads the owner's parked visit, and only today's", async () => {
      const { doctor, browser } = await setup();
      const p = await makePatient(t.prisma, doctor, { pictureUrl: 'https://example.test/p.jpg' } as never);
      await add(browser, 'With Draft', undefined, p.id);
      await t.prisma.patient.update({ where: { id: p.id }, data: { incompleteRx: { ptDate: TODAY, chiefComplaints: ['fever'] } } });
      let row = (await list(browser))[0] as OpdVisit & { pictureUrl: string | null; padStage: string | null };
      expect([row.pictureUrl, row.padStage]).toEqual(['https://example.test/p.jpg', 'history']);
      await t.prisma.patient.update({ where: { id: p.id }, data: { incompleteRx: { ptDate: YESTERDAY, chiefComplaints: ['fever'] } } });
      row = (await list(browser))[0] as typeof row;
      expect(row.padStage).toBeNull();
    });

    it("never shows the owner's draft to a supervising practice", async () => {
      const owner = await makeDoctor(t.prisma);
      const supervisor = await setup();
      const p = await makePatient(t.prisma, owner);
      await t.prisma.patient.update({ where: { id: p.id }, data: { incompleteRx: { ptDate: TODAY, rxItems: [{ drug: 'Napa' }] } } });
      await t.prisma.patientSupervisor.create({ data: { patientId: p.id, doctorId: supervisor.doctor.id } as never });
      await add(supervisor.browser, 'Supervised', undefined, p.id);
      const row = (await list(supervisor.browser))[0] as OpdVisit & { padStage: string | null };
      expect(row.padStage).toBeNull();
      await t.prisma.supervisedDraft.create({ data: { doctorId: supervisor.doctor.id, patientId: p.id, data: { ptDate: TODAY, chiefComplaints: ['cough'] } } });
      expect(((await list(supervisor.browser))[0] as typeof row).padStage).toBe('history');
    });
  });
```

NOTE for the implementer: read `server/test/support/fixtures.ts` first — `makePatient`'s real signature, and whether `patientSupervisor` needs more fields — and adjust the two calls above to it (the `as never` casts mark exactly those two places). Do not weaken an assertion to fit.

- [ ] **Step 8: Run the integration suite.**
```bash
docker compose -f docker-compose.test.yml up -d
cd server && npm run test:db && npx jest --config test/jest-int.config.js test/opd-queue.int-spec.ts
```
(Use the exact `test:int` runner from `server/package.json` if the config path differs: `cd server && npm run test:int -- opd-queue`.) Expected: PASS.

- [ ] **Step 9: Check the new tests catch a break** (in the COPY): remove `if (this.visitDay(visit) !== dhakaDayKey()) throw …` from `setPresence`; the "later day / past day" tests must go red. Restore it.

- [ ] **Step 10: `docs/API.md` §5.12.** In the table after the `PATCH /opd/:id/status` row add:

```
| PATCH | `/opd/:id/presence` | `{ present?, criticallyIll?, urgent? }` (booleans, each optional; each changes only itself). `present: true` records the **server's** time in `presentAt` once (pressed again it keeps the first), `present: false` clears it. **Today's** queue only (400, "Only today's queue can be marked present."); another doctor's visit is 404. Answers the visit |
```
and add to the `GET /opd` row: "each row also carries `pictureUrl` (the patient's picture or `null`) and `padStage` (`history` / `pending` / `null` — how far THIS practice's parked visit for that patient has got today; the draft itself is never sent); `PATCH /opd/:id/move` answers the same rows".

- [ ] **Step 11: Commit**

```bash
git add server docs/API.md
git commit -m "feat(opd): presence route; queue rows carry the picture and the parked visit's stage"
```

---

### Task 4: Client pure rules — status, colour, clock, counts

**Files:**
- Create: `client/src/lib/opdPresence.ts`, `client/src/lib/opdPresence.test.ts`

**Interfaces:**
- Produces:
```ts
export type PadStage = "history" | "pending" | null;
export interface PresenceFields {
  status: string; rxStatus: string | null;
  presentAt: string | null; criticallyIll: boolean; urgent: boolean; padStage: PadStage;
}
export type RowTone = "danger" | "warn" | "ok" | null;
export type VisitStatus = "" | "Waiting" | "History taken" | "Prescription pending" | "Completed";
export function rowTone(v: Pick<PresenceFields, "urgent" | "criticallyIll" | "presentAt">): RowTone;
export function isCompleted(v: Pick<PresenceFields, "status" | "rxStatus">): boolean;
export function visitStatus(v: PresenceFields): VisitStatus;
export function presentClock(iso: string | null): string;   // "6.00pm", "" when null
export function queueCounts(rows: PresenceFields[]): { total: number; present: number; completed: number; waiting: number };
```

Rules (spec): colour Urgent > Critically ill > Present. Status: Completed (Done pressed, or the prescription printed) always; else Prescription pending / History taken from `padStage`; else Waiting when present; else empty. **Counts:** Present = present ticked; Completed = `isCompleted` rows; Waiting = present and not completed. (The spec said "Completed unchanged"; it counted only Done, which would disagree with a row that reads "Completed" after Save & print. Completed here counts what the rows say. Confirm with the physician — see handoff.)

- [ ] **Step 1: Failing test** `client/src/lib/opdPresence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isCompleted, presentClock, queueCounts, rowTone, visitStatus, type PresenceFields } from "./opdPresence";

const v = (over: Partial<PresenceFields> = {}): PresenceFields => ({
  status: "waiting", rxStatus: null, presentAt: null, criticallyIll: false, urgent: false, padStage: null, ...over,
});
const AT = "2026-10-29T12:00:00.000Z"; // 18:00 in Dhaka

describe("rowTone — Urgent over Critically ill over Present", () => {
  it("each alone", () => {
    expect(rowTone(v())).toBeNull();
    expect(rowTone(v({ presentAt: AT }))).toBe("ok");
    expect(rowTone(v({ criticallyIll: true }))).toBe("warn");
    expect(rowTone(v({ urgent: true }))).toBe("danger");
  });
  it("the highest wins when several are ticked", () => {
    expect(rowTone(v({ presentAt: AT, criticallyIll: true }))).toBe("warn");
    expect(rowTone(v({ presentAt: AT, criticallyIll: true, urgent: true }))).toBe("danger");
    expect(rowTone(v({ criticallyIll: true, urgent: true }))).toBe("danger");
  });
});

describe("visitStatus — later wins", () => {
  it("is empty before Present", () => expect(visitStatus(v())).toBe(""));
  it("Present → Waiting", () => expect(visitStatus(v({ presentAt: AT }))).toBe("Waiting"));
  it("history, then pending, then completed", () => {
    expect(visitStatus(v({ presentAt: AT, padStage: "history" }))).toBe("History taken");
    expect(visitStatus(v({ presentAt: AT, padStage: "pending" }))).toBe("Prescription pending");
    expect(visitStatus(v({ presentAt: AT, padStage: "pending", rxStatus: "complete" }))).toBe("Completed");
  });
  it("Done and a printed prescription are both Completed", () => {
    expect(visitStatus(v({ status: "done" }))).toBe("Completed");
    expect(visitStatus(v({ rxStatus: "complete" }))).toBe("Completed");
    expect(isCompleted(v({ rxStatus: "incomplete" }))).toBe(false);
  });
  it("a stage shows even before Present is ticked (the doctor opened them)", () => {
    expect(visitStatus(v({ padStage: "history" }))).toBe("History taken");
  });
});

describe("presentClock — Dhaka time, no locale", () => {
  it("writes h.mm and am/pm", () => {
    expect(presentClock(AT)).toBe("6.00pm");
    expect(presentClock("2026-10-29T00:05:00.000Z")).toBe("6.05am");
    expect(presentClock("2026-10-29T18:00:00.000Z")).toBe("12.00am");
    expect(presentClock("2026-10-29T06:30:00.000Z")).toBe("12.30pm");
  });
  it("is empty for no time or a bad one", () => {
    expect(presentClock(null)).toBe("");
    expect(presentClock("not a date")).toBe("");
  });
});

describe("queueCounts", () => {
  it("counts what the rows say", () => {
    const rows = [
      v({ presentAt: AT }), v({ presentAt: AT, padStage: "history" }),
      v({ presentAt: AT, rxStatus: "complete" }), v({ status: "done" }), v(),
    ];
    expect(queueCounts(rows)).toEqual({ total: 5, present: 3, completed: 2, waiting: 2 });
  });
});
```

- [ ] **Step 2: Run to see it fail.** Run: `cd client && npx vitest run src/lib/opdPresence.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `client/src/lib/opdPresence.ts`:

```ts
// Reception's marks on the OPD queue and what they make of a row (physician's
// sheet, 29/10/2026). Everything here is worked out when shown, never stored.

export type PadStage = "history" | "pending" | null;

export interface PresenceFields {
  status: string;
  rxStatus: string | null;
  presentAt: string | null;
  criticallyIll: boolean;
  urgent: boolean;
  padStage: PadStage;
}

export type RowTone = "danger" | "warn" | "ok" | null;
export type VisitStatus = "" | "Waiting" | "History taken" | "Prescription pending" | "Completed";

// Urgent over Critically ill over Present: all three can be ticked, only the
// colour takes the most pressing one.
export function rowTone(v: Pick<PresenceFields, "urgent" | "criticallyIll" | "presentAt">): RowTone {
  if (v.urgent) return "danger";
  if (v.criticallyIll) return "warn";
  return v.presentAt ? "ok" : null;
}

// Seen: Done pressed, or the prescription printed (Save & print marks it complete
// and leaves the visit waiting).
export const isCompleted = (v: Pick<PresenceFields, "status" | "rxStatus">): boolean =>
  v.status === "done" || v.rxStatus === "complete";

// The later stage wins. Empty before the patient is marked present and before
// the doctor has anything on the pad.
export function visitStatus(v: PresenceFields): VisitStatus {
  if (isCompleted(v)) return "Completed";
  if (v.padStage === "pending") return "Prescription pending";
  if (v.padStage === "history") return "History taken";
  return v.presentAt ? "Waiting" : "";
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

// `6.00pm`. Bangladesh is a fixed UTC+6, so the arithmetic is exact and no
// locale is asked (root CLAUDE.md: never toLocale… for a time).
export function presentClock(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const t = new Date(ms + DHAKA_OFFSET_MS);
  const h = t.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}.${String(t.getUTCMinutes()).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

export function queueCounts(rows: PresenceFields[]) {
  let present = 0, completed = 0, waiting = 0;
  for (const r of rows) {
    const done = isCompleted(r);
    if (r.presentAt) present += 1;
    if (done) completed += 1;
    if (r.presentAt && !done) waiting += 1;
  }
  return { total: rows.length, present, completed, waiting };
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `cd client && npx vitest run src/lib/opdPresence.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/opdPresence.ts client/src/lib/opdPresence.test.ts
git commit -m "feat(opd): the rules for a row's colour, status and the cards"
```

---

### Task 5: Client API types and the presence hook

**Files:**
- Modify: `client/src/lib/api.ts` (`OpdVisit`, `opdApi`), `client/src/hooks/useOpd.ts`

**Interfaces:**
- Consumes: `PadStage` (Task 4).
- Produces: `OpdVisit` gains `presentAt: string | null; criticallyIll: boolean; urgent: boolean; pictureUrl?: string | null; padStage?: PadStage`. `opdApi.setPresence(id, input: OpdPresenceInput): Promise<OpdVisit>`. `useSetOpdPresence(day: string)` → mutation `({ id, ...OpdPresenceInput })`, optimistic, rolled back on failure.

- [ ] **Step 1: `api.ts`.** In `OpdVisit` add after `position`:

```ts
  // Reception's marks (29/10/2026): when the patient was marked present (the
  // server's clock; null = not present) and the two flags.
  presentAt: string | null;
  criticallyIll: boolean;
  urgent: boolean;
  // Only on the queue's list: the patient's picture, and how far this practice's
  // parked visit has got today. A row answered by an add or a status change has
  // neither until the list is read again.
  pictureUrl?: string | null;
  padStage?: "history" | "pending" | null;
```
Add `export interface OpdPresenceInput { present?: boolean; criticallyIll?: boolean; urgent?: boolean }` and to `opdApi`:

```ts
  // Reception's marks on one visit (today's queue only).
  setPresence: (id: string, input: OpdPresenceInput) =>
    apiFetch<OpdVisit>(`/opd/${id}/presence`, { method: "PATCH", body: JSON.stringify(input) }),
```

- [ ] **Step 2: `useOpd.ts`** — add `type OpdPresenceInput, type OpdVisit` imports (already has OpdVisit) and:

```ts
// A tick shows at once and is settled by the server's answer. A failed one is
// put back, so a box never stays ticked for something the server did not take.
// The time of a Present tick is the server's: shown from the answer, not guessed.
export function useSetOpdPresence(day: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & OpdPresenceInput) => opdApi.setPresence(id, input),
    onMutate: async ({ id, ...input }) => {
      await qc.cancelQueries({ queryKey: dayKey(day) });
      const before = qc.getQueryData<OpdVisit[]>(dayKey(day));
      qc.setQueryData<OpdVisit[]>(dayKey(day), (rows) =>
        rows?.map((r) => (r.id !== id ? r : {
          ...r,
          ...(input.criticallyIll !== undefined ? { criticallyIll: input.criticallyIll } : {}),
          ...(input.urgent !== undefined ? { urgent: input.urgent } : {}),
          // Present is shown ticked at once; its time arrives with the answer.
          ...(input.present === false ? { presentAt: null } : {}),
          ...(input.present === true && !r.presentAt ? { presentAt: new Date().toISOString() } : {}),
        })));
      return { before };
    },
    onError: (_e, _v, ctx) => { if (ctx?.before) qc.setQueryData(dayKey(day), ctx.before); },
    onSettled: () => qc.invalidateQueries({ queryKey: OPD_KEY }),
  });
}
```
and add `OpdPresenceInput` to the file's final `export type { … }`.

- [ ] **Step 3: Typecheck + contract spec.** Run: `cd client && npx tsc --noEmit` — Expected: errors only in `OpdView.tsx` fixtures/tests if any (fixed in Task 7); none in the files above. Then `cd server && npm run test:int -- contract-dto` — Expected: PASS (it reads `api.ts`).

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/api.ts client/src/hooks/useOpd.ts
git commit -m "feat(opd): client types and an optimistic presence hook"
```

---

### Task 6: `PatientAvatar` — the photo or a silhouette

**Files:**
- Create: `client/src/components/opd/PatientAvatar.tsx`, `client/src/components/opd/PatientAvatar.test.tsx`

**Interfaces:**
- Consumes: `normaliseSex(x): "Male" | "Female" | "Other" | ""` from `@/lib/sex` (it returns `""` for an unknown value — check its exact return values first and match them).
- Produces: `<PatientAvatar url={string | null | undefined} sex={string | null} name={string} size?: number />`. A picture that fails to load falls back to the silhouette.

The physician's two silhouettes (a ring, a grey head-and-shoulders; the woman with a bob) are drawn as inline SVG in `C.n[300]` / `C.n[100]`: no asset file, no network.

- [ ] **Step 1: Failing test** `PatientAvatar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import PatientAvatar from "./PatientAvatar";

afterEach(cleanup);

describe("PatientAvatar", () => {
  it("shows the stored picture when there is one", () => {
    const { container } = render(<PatientAvatar url="https://example.test/a.jpg" sex="Male" name="mr test 5" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.jpg");
  });

  it("without a picture, draws the silhouette for the sex", () => {
    for (const [sex, kind] of [["Male", "male"], ["Female", "female"], ["", "neutral"], [null, "neutral"], ["Other", "neutral"]] as const) {
      const { container, unmount } = render(<PatientAvatar url={null} sex={sex} name="x" />);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("svg")?.getAttribute("data-silhouette")).toBe(kind);
      unmount();
    }
  });

  it("a picture that cannot be loaded falls back to the silhouette", () => {
    const { container } = render(<PatientAvatar url="https://example.test/gone.jpg" sex="Female" name="x" />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("data-silhouette")).toBe("female");
  });

  it("is named for a screen reader by the patient", () => {
    const { getByRole } = render(<PatientAvatar url={null} sex="Male" name="mr test 5" />);
    expect(getByRole("img", { name: "Photo of mr test 5" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to see it fail.** Run: `cd client && npx vitest run src/components/opd/PatientAvatar.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `PatientAvatar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { C } from "@/theme";
import { normaliseSex } from "@/lib/sex";

// The patient's picture, or the silhouette for their sex (physician's sheet,
// 29/10/2026): a ring with a head and shoulders — the woman with a bob — in a
// quiet grey. Drawn here, so no file or network is needed; a picture that does
// not load falls back to it rather than a broken-image box.
type Kind = "male" | "female" | "neutral";

const kindOf = (sex: string | null | undefined): Kind => {
  const s = normaliseSex(sex ?? "");
  return s === "Male" ? "male" : s === "Female" ? "female" : "neutral";
};

function Silhouette({ kind, size }: { kind: Kind; size: number }) {
  const body = C.n[300];
  return (
    <svg data-silhouette={kind} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs><clipPath id={`av-${kind}`}><circle cx="32" cy="32" r="29" /></clipPath></defs>
      <circle cx="32" cy="32" r="29.5" fill={C.n[0]} stroke={body} strokeWidth="2" />
      <g clipPath={`url(#av-${kind})`} fill={body}>
        <path d="M6 64c1-12 9-17 18-19l8 3 8-3c9 2 17 7 18 19z" />
        {kind === "female"
          ? <path d="M21 26c0-8 4-13 11-13s11 5 11 13l3 13-7-3-3-6h-8l-3 6-7 3z" />
          : <ellipse cx="32" cy="27" rx="9" ry="11" />}
        {kind === "neutral" && <rect x="28" y="36" width="8" height="10" rx="3" />}
      </g>
    </svg>
  );
}

export default function PatientAvatar({ url, sex, name, size = 34 }: {
  url?: string | null; sex?: string | null; name: string; size?: number;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const showPicture = !!url && broken !== url;
  return (
    <span role="img" aria-label={`Photo of ${name}`}
      style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", display: "inline-flex", flexShrink: 0 }}>
      {showPicture
        ? <img src={url as string} alt="" width={size} height={size} onError={() => setBroken(url as string)}
            style={{ width: size, height: size, objectFit: "cover", display: "block" }} />
        : <Silhouette kind={kindOf(sex)} size={size} />}
    </span>
  );
}
```

(`clipPath` ids repeat per row; identical definitions, so harmless.)

- [ ] **Step 4: Run to verify it passes.** Run: `cd client && npx vitest run src/components/opd/PatientAvatar.test.tsx` — Expected: PASS (4 tests). If `normaliseSex` returns other strings than `"Male"`/`"Female"`, adjust `kindOf` to them (read `client/src/lib/sex.ts`).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/opd/PatientAvatar.tsx client/src/components/opd/PatientAvatar.test.tsx
git commit -m "feat(opd): a patient's photo, or a silhouette for their sex"
```

---

### Task 7: `OpdView` — the row and the cards

**Files:**
- Modify: `client/src/components/tabs/OpdView.tsx`
- Create: `client/src/components/tabs/OpdView.presence.test.tsx`
- Modify: `client/src/components/tabs/OpdView.serial.test.tsx` (token no longer shown), and the mocks of `@/hooks/useOpd` in `OpdView.day.test.tsx`, `OpdView.addByNumber.test.tsx` (add `useSetOpdPresence: () => ({ mutate: vi.fn() })`)

**Interfaces:**
- Consumes: `rowTone, visitStatus, presentClock, queueCounts, isCompleted` (Task 4); `useSetOpdPresence(day)` (Task 5); `PatientAvatar` (Task 6).

- [ ] **Step 1: Failing test** `OpdView.presence.test.tsx` (same mock shape as `OpdView.serial.test.tsx`; the `useOpd` mock exposes `presence = vi.fn()` so the test can read the call):

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], presence: vi.fn(), day: "" }));
vi.mock("@/lib/api", () => ({ patientsApi: { byMobile: vi.fn(), relativesByMobile: vi.fn(), create: vi.fn(), link: vi.fn(), get: vi.fn() } }));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(), setActiveTab: vi.fn(),
    setRxItems: vi.fn(), setCurrentPatientId: vi.fn(), setPtInfo: vi.fn(), resetEditor: vi.fn(), flushEditorDraft: vi.fn(), loadPatientById: vi.fn(),
    activeWorkstationId: null,
  }),
}));
vi.mock("@/hooks/useOpd", () => ({
  useOpdQueue: (day?: string) => { h.day = day ?? ""; return { data: h.rows, isLoading: false, error: null }; },
  useAddOpdVisit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetOpdStatus: () => ({ mutate: vi.fn() }),
  useSetOpdPresence: () => ({ mutate: h.presence }),
  useOpdSchedule: () => ({ data: undefined, isLoading: false, error: null }),
  useMoveOpdVisit: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOpdSchedule: () => ({ mutateAsync: vi.fn() }),
}));

import OpdView from "./OpdView";

afterEach(() => { cleanup(); h.rows = []; h.presence.mockClear(); });

const AT = "2026-10-29T12:00:00.000Z"; // 6.00pm in Dhaka
const row = (over: Record<string, unknown> = {}) => ({
  id: "a", name: "mr test 5", token: "T-01", status: "waiting", type: "New", phone: "01780000000", age: 65, gender: "Male",
  patientId: "p1", rxStatus: null, presentAt: null, criticallyIll: false, urgent: false, padStage: null, pictureUrl: null, ...over,
});
const rowEl = (c: HTMLElement) => c.querySelector(".queue-row") as HTMLElement;

describe("OPD queue — the row", () => {
  it("shows no token and no Incomplete chip", () => {
    h.rows = [row({ rxStatus: "incomplete" })];
    const { container } = render(<OpdView />);
    expect(rowEl(container).textContent).not.toContain("T-01");
    expect(rowEl(container).textContent).not.toContain("Incomplete");
  });

  it("has the three boxes, each named for the patient, and ticking one sends only it", () => {
    h.rows = [row()];
    render(<OpdView />);
    fireEvent.click(screen.getByLabelText("Present: mr test 5"));
    expect(h.presence).toHaveBeenLastCalledWith({ id: "a", present: true });
    fireEvent.click(screen.getByLabelText("Critically ill: mr test 5"));
    expect(h.presence).toHaveBeenLastCalledWith({ id: "a", criticallyIll: true });
    fireEvent.click(screen.getByLabelText("Pt needs urgent attention: mr test 5"));
    expect(h.presence).toHaveBeenLastCalledWith({ id: "a", urgent: true });
  });

  it("a ticked box is shown ticked and unticking sends false", () => {
    h.rows = [row({ presentAt: AT })];
    render(<OpdView />);
    const box = screen.getByLabelText("Present: mr test 5") as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(h.presence).toHaveBeenLastCalledWith({ id: "a", present: false });
  });

  it("writes the time Present was marked, under the box", () => {
    h.rows = [row({ presentAt: AT })];
    const { container } = render(<OpdView />);
    expect(within(rowEl(container)).getByText("6.00pm")).toBeTruthy();
  });

  it("colours the row by priority: urgent, then critically ill, then present", () => {
    h.rows = [row({ id: "1", presentAt: AT }), row({ id: "2", presentAt: AT, criticallyIll: true }), row({ id: "3", presentAt: AT, criticallyIll: true, urgent: true }), row({ id: "4" })];
    const { container } = render(<OpdView />);
    const tones = Array.from(container.querySelectorAll<HTMLElement>(".queue-row")).map((r) => r.getAttribute("data-tone"));
    expect(tones).toEqual(["ok", "warn", "danger", null]);
  });

  it("shows the status the visit has reached", () => {
    h.rows = [row({ id: "1" }), row({ id: "2", presentAt: AT }), row({ id: "3", presentAt: AT, padStage: "history" }),
      row({ id: "4", presentAt: AT, padStage: "pending" }), row({ id: "5", presentAt: AT, rxStatus: "complete" })];
    const { container } = render(<OpdView />);
    const st = Array.from(container.querySelectorAll(".queue-row")).map((r) => r.querySelector("[data-status]")?.textContent ?? "");
    expect(st).toEqual(["", "Waiting", "History taken", "Prescription pending", "Completed"]);
  });

  it("shows the patient's picture when there is one", () => {
    h.rows = [row({ pictureUrl: "https://example.test/a.jpg" })];
    const { container } = render(<OpdView />);
    expect(container.querySelector(".queue-row img")?.getAttribute("src")).toBe("https://example.test/a.jpg");
  });
});

describe("OPD queue — the cards", () => {
  it("are Total Serial, Present, Completed, Waiting, counted from the rows", () => {
    h.rows = [row({ id: "1", presentAt: AT }), row({ id: "2", presentAt: AT, rxStatus: "complete" }), row({ id: "3" })];
    render(<OpdView />);
    const value = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect([value("Total Serial"), value("Present"), value("Completed"), value("Waiting")]).toEqual(["3", "2", "1", "1"]);
  });
});
```

- [ ] **Step 2: Run to see it fail.** Run: `cd client && npx vitest run src/components/tabs/OpdView.presence.test.tsx` — Expected: FAIL (no checkboxes, no cards).

- [ ] **Step 3: Edit `OpdView.tsx`.**

(a) Imports — add to the `@/hooks/useOpd` import `useSetOpdPresence`; add:
```ts
import { isCompleted, presentClock, queueCounts, rowTone, visitStatus } from "@/lib/opdPresence";
import PatientAvatar from "@/components/opd/PatientAvatar";
```
Delete the now-unused `initials` helper and `Pill` import only if nothing else uses them (the type pill and "✓ done" still use `Pill`; `initials` goes).

(b) After `const move = useMoveOpdVisit(day);` add `const setPresence = useSetOpdPresence(day);`.

(c) Replace
```ts
  const waiting = queue.filter((v) => v.status === "waiting").length;
  const done = queue.filter((v) => v.status === "done").length;
```
with
```ts
  const counts = queueCounts(queue.map((v) => ({ ...v, padStage: v.padStage ?? null })));
```

(d) Replace the three summary cards (`gridTemplateColumns` block) with four:

```tsx
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.n[100], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.n[600] }}>Total Serial</div><div style={{ fontSize: 24, fontWeight: 600 }}>{counts.total}</div></div>
        <div style={{ background: C.ok[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.ok[600] }}>Present</div><div style={{ fontSize: 24, fontWeight: 600, color: C.ok[600] }}>{counts.present}</div></div>
        <div style={{ background: C.ok[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.ok[600] }}>Completed</div><div style={{ fontSize: 24, fontWeight: 600, color: C.ok[600] }}>{counts.completed}</div></div>
        <div style={{ background: C.warn[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 500, color: C.warn[800] }}>Waiting</div><div style={{ fontSize: 24, fontWeight: 600, color: C.warn[800] }}>{counts.waiting}</div></div>
      </div>
```
(The label `<div>` must be directly followed by its value `<div>` — the test reads `nextElementSibling`.)

(e) In the row (`queue.map`): replace `const color = typeColor(p.type);` with
```ts
          const color = typeColor(p.type);
          const tone = rowTone(p);
          const status = visitStatus({ ...p, padStage: p.padStage ?? null });
          const toneBg = tone ? C[tone][50] : undefined;
          // Marks can be changed on today's queue only; the server refuses any other day.
          const canMark = rel === "today";
```
On the row `<div key={p.id} className="queue-row" …>` add `data-tone={tone ?? undefined}` and `background: toneBg`, `borderRadius: toneBg ? 8 : 0`, `paddingLeft: toneBg ? 8 : 0`, `paddingRight: toneBg ? 8 : 0` into its style object.

Replace the initials circle `<div style={{ width: 34 … }}>{initials(p.name)}</div>` with
```tsx
              <PatientAvatar url={p.pictureUrl} sex={p.gender} name={p.name} />
```
Replace the `{p.rxStatus === "incomplete" ? … : null}` block AND `<Pill bg={C.n[100]} fg={C.n[800]}>{p.token}</Pill>` with the type pill only, then the marks and the status:

```tsx
              {p.type && p.type !== "New" && p.type !== "Rx" && (
                <Pill className="row-after" bg={colorOf(color).bg} fg={colorOf(color).fg}>{p.type}</Pill>
              )}
              {/* Reception's marks. Present records the time and shows it under the box. */}
              <span className="row-after" style={{ display: "inline-flex", gap: 12, alignItems: "flex-start" }}>
                {([
                  ["Present", "Present", !!p.presentAt, (on: boolean) => ({ present: on })],
                  ["Critically ill", "Critically ill", p.criticallyIll, (on: boolean) => ({ criticallyIll: on })],
                  ["Pt needs urgent attention", "Urgent attention", p.urgent, (on: boolean) => ({ urgent: on })],
                ] as const).map(([aria, text, checked, patch]) => (
                  <label key={aria} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2, fontSize: 11, color: C.n[700], cursor: canMark ? "pointer" : "default" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <input type="checkbox" aria-label={`${aria}: ${p.name}`} checked={checked} disabled={!canMark}
                        onChange={(e) => setPresence.mutate({ id: p.id, ...patch(e.target.checked) })} />
                      {text}
                    </span>
                    {aria === "Present" && p.presentAt && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.ok[600], fontVariantNumeric: "tabular-nums" }}>{presentClock(p.presentAt)}</span>
                    )}
                  </label>
                ))}
              </span>
              {status && (
                <span data-status className="row-after" style={{ fontSize: 12, fontWeight: 600, color: status === "Completed" ? C.ok[600] : C.n[800], whiteSpace: "nowrap" }}>{status}</span>
              )}
```
The row's `opacity: p.status === "done" ? 0.55 : 1` stays. The existing `p.status === "waiting" ? … : <Pill>✓ done</Pill>` tail stays. `isCompleted` import is unused in the view: leave it out of the import.

- [ ] **Step 4: Fix the existing tests.** In `OpdView.serial.test.tsx` replace the test "keeps each patient's own token beside the serial" with:

```tsx
  it("does not show the token any more", () => {
    queue.rows = [row("a", "mr. samir", "T-07")];
    const { container } = render(<OpdView />);
    expect(container.querySelector(".queue-row")?.textContent).not.toContain("T-07");
  });
```
and add the same `useSetOpdPresence: () => ({ mutate: vi.fn() })` line to that file's `@/hooks/useOpd` mock and to those in `OpdView.day.test.tsx` and `OpdView.addByNumber.test.tsx`; give their row fixtures `presentAt: null, criticallyIll: false, urgent: false`.

- [ ] **Step 5: Run the client suite for OPD.**
Run: `cd client && npx vitest run src/components/tabs/OpdView src/components/opd src/lib/opdPresence src/lib/opdSchedule src/lib/opdDay` — Expected: PASS.

- [ ] **Step 6: Typecheck.** Run: `cd client && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 7: Check the test catches a break** (in the COPY): swap `urgent` and `criticallyIll` in `rowTone`; the colour tests must go red. Restore.

- [ ] **Step 8: Commit**

```bash
git add client/src
git commit -m "feat(opd): photo, three marks, colour, time and status on the queue row; new cards"
```

---

### Task 8: Docs, whole verification, and a real-browser pass

**Files:**
- Modify: `server/CLAUDE.md` (the `opd` section: add the presence rules, replace "Not built (same sheet)" wording so it still names SMS and Print Queue as not built), `client/CLAUDE.md` (the OPD paragraph), `docs/DOMAIN.md` (OPD: presence, the three marks, status, the two lists of fields), `FUNCTIONAL-AUDIT.md` (open threads: the `HISTORY_FIELDS` list awaiting the physician's reading; Completed now counts printed visits)

- [ ] **Step 1: Write the docs.** In each, say (and keep in the project's rule + reason style):
  - server: `presentAt` is the SERVER's clock; today only; `padStage` reads this practice's own draft only (owner `incompleteRx` / own `SupervisedDraft`, a missing table costs only the stage), a draft of another day says nothing, the draft never leaves the server; `manual-opd-presence.sql` is NOT applied to the shared database and must be before release.
  - client: status/colour/counts are derived in `lib/opdPresence.ts`; ticks are optimistic and rolled back; the silhouette is drawn, not a file; "Completed" counts rows Completed by Done OR a printed prescription.
  - DOMAIN: the physician's decisions of 29/10/2026 (three marks, colours, the status table, "Chief complaints or any data entry").
  - `FUNCTIONAL-AUDIT.md` open threads: (1) which fields make "History taken" is every text field of the editor except medicines and investigations — physician to confirm, one constant; (2) the Completed card changed from "Done only" to "Done or printed".

- [ ] **Step 2: Whole verification in the copy.**
```bash
cd server && npx tsc --noEmit -p tsconfig.json && npm test
cd ../client && npx tsc --noEmit && npm test
cd ../admin && npx tsc --noEmit
cd ../server && docker compose -f ../docker-compose.test.yml up -d && npm run test:db && npm run test:int
cd .. && node scripts/test-repeat.mjs client 3 && node scripts/test-repeat.mjs server 3
cd server && rm -rf dist && npm run build && ls dist/main.js
```
Expected: everything green; `dist/main.js` exists. A red test is read, not re-run.

- [ ] **Step 3: Real-browser pass** (the copy's servers pointed at the TEST database — never the tunnel — per `e2e/README.md` and the "browser-testing-localhost" memory: the :3100 sandbox, not :3000). With a seeded doctor: add 2 patients (one with a picture, one without; a male and a female); tick each mark; confirm colours, the `6.00pm`-style time, status moving Waiting → History taken (type a chief complaint, wait for the auto-save) → Prescription pending (add a medicine) → Completed (Save & print); open a second tab and see the tick there; check night mode and 375px width; a later day and a past day have disabled boxes. Take screenshots. Say what was not verified (Safari, a supervised patient in a browser).

- [ ] **Step 4: Print preview not needed** (`prescriptionDoc.ts` untouched) — state that in the report.

- [ ] **Step 5: Bring the change to the checkout in one step.** `git format-patch`/`git diff` the copy against `dev`, `git apply --check` it in the checkout (with `GIT_CEILING_DIRECTORIES` set if applied from the scratchpad), then apply it. `git show --stat` each new commit against its message. **Do not push**: a push of `dev`+`main` is a production release; ask the user, and remind them `manual-opd-presence.sql` must be applied first.

- [ ] **Step 6: Commit docs**

```bash
git add server/CLAUDE.md client/CLAUDE.md docs/DOMAIN.md FUNCTIONAL-AUDIT.md
git commit -m "docs(opd): presence, urgency and status"
```

---

## Self-review

**Spec coverage:** row layout (Task 7), photo/silhouette (6), three checkboxes + colours + time (3, 4, 7), status table incl. later-wins and the "ptDate" guard (2, 4), cards (4, 7), columns + SQL (1), route + DTO + today-only + docs/API.md (3), tests listed in the spec (2, 3, 4, 6, 7, 8), CLAUDE.md/DOMAIN updates (8). Unchanged items (Prescribe/Done, calendar, schedule, add-by-number) are not touched.

**Gaps/deviations flagged:** (1) the spec's "Completed = unchanged" would disagree with a row reading "Completed" after Save & print; Task 4 counts Completed by what rows say — to confirm with the physician. (2) The spec's open question (which fields) is resolved as "all text fields except medicines/investigations" per the physician's "any data entry", in one named constant. (3) A draft not dated today shows no stage (not in the spec; chosen so a visit parked yesterday never reads "History taken").

**Type consistency:** `PadStage`, `PresenceFields`, `rowTone`, `visitStatus`, `presentClock`, `queueCounts` (Task 4) are the names used in Tasks 5 and 7; `OpdPresenceInput`/`setPresence`/`useSetOpdPresence` (Task 5) match Task 7's mock and calls; server `setPresence`/`SetOpdPresenceDto`/`OpdVisitRow`/`padStage` (Tasks 2–3) match the API fields the client reads (`presentAt`, `criticallyIll`, `urgent`, `pictureUrl`, `padStage`).
