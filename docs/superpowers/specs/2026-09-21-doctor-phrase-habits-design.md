# Doctor phrase habits — learned Advice and ℞ note lines

Date: 2026-09-21
Status: approved by the product owner (physician) on 2026-09-21

## What the doctor asked for

> I want the Muqsit app to analyze and learn from each doctor's previous
> manually written advice … when that doctor starts typing "Insu…", the app
> should suggest "Insulin as before" based on their previous usage. This should
> be completely doctor-specific.

## Two findings that shaped the design

**Half of it already exists, for one of the two surfaces.** `ExpandableField`
already keeps per-doctor "recently typed" entries on the profile
(`User.fieldRecents`, `hooks/useFieldRecents.ts`), keyed by field label, and
matches them as a substring — so typing `Insu` in **Advice** already surfaces a
previously typed `Insulin as before`. What it does not do is COUNT: it keeps the
last **12** entries per field by recency, so a line the doctor writes every day
falls off the list after twelve different entries. The physician asked for
"frequently used", which recency cannot express.

**The example line is not an Advice item.** On the reported sheet,
`Insulin as before` sits between medicines 5 and 6, italic, with no serial
number — it is a free-typed ℞ **note line** (`PrescriptionItem.isNote`), not an
entry in the ADVICE block. The ℞ pad's own "Your usual" suggestions are for
medicines only, so a note line learns nothing at all today.

Both surfaces are in scope (physician's decision).

## Decisions taken (physician, 2026-09-21)

1. **Both surfaces** — the Advice field and the ℞ note line.
2. **Learn by the medicine rules.** Only **completed** prescriptions teach
   (Save & print); drafts and "Save to complete later" never count. The count is
   **DISTINCT PATIENTS**, not prescriptions. A new table, derived and rebuildable.
3. **Typography-only folding.** Case, collapsed whitespace and one trailing full
   stop fold; nothing else. `Insulin as before` and `Inj. Insulin as before`
   stay two different lines. The text shown is the doctor's most recent spelling.

## The rules this inherits from `DoctorRxHabit`

These are not new inventions; they are the five rules the root CLAUDE.md already
records for the prescribing-habit feature, applied to free text.

- **It never originates clinical content.** Every character offered is echoed
  verbatim from a prescription that doctor already saved and printed. Nothing is
  auto-filled — insertion requires a click — and the feature never writes to
  `Prescription` or `PrescriptionItem`. "Deleting" a suggestion sets `hidden`;
  there is no DELETE route.
- **`patientCount` is DISTINCT PATIENTS.** One patient returning monthly, a
  re-saved visit or a reprint must not make a one-off line look routine. It is
  established by asking the record which patients already contributed that
  phrase, never by a blind `increment: 1`.
- **Only completed prescriptions teach**, for the same reason: a parked draft is
  not a decision the doctor stood behind.
- **Scope is the workstation doctor** (`@WorkstationDoctorId()`). An assistant
  sees the doctor they are assisting, because the prescription they are writing
  will carry that doctor's name. A supervising doctor acts in their own
  workstation and sees their own. No doctor ever sees another's.
- **The table is derived and rebuildable** from the record
  (`scripts/rebuild-doctor-phrases.js`), re-applying `hidden` by CONTENT and
  never by signature — a signature is the output of the normalisation algorithm,
  so a signature join would resurrect every deliberately suppressed line the day
  a rule is edited.

## Data

`DoctorPhraseHabit`, one row per (doctor, source, phrase):

| column | meaning |
|---|---|
| `doctorId` | owner; `onDelete: Cascade` |
| `source` | `"advice"` or `"rxNote"` — one table, two surfaces |
| `signature` | the typography-normalised phrase; the matching key |
| `text` | the phrase as last written; this is what gets inserted |
| `patientCount` | distinct patients, never prescriptions |
| `lastUsedAt` | for tie-breaking and staleness |
| `hidden` | "deleted" by the doctor; never un-set by a later save |

Unique on `(doctorId, source, signature)`; indexed on
`(doctorId, source, patientCount)` for the list query.

Added by an idempotent `server/prisma/manual-doctor-phrase-habit.sql`
(`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … OWNER TO exhort_user`), applied
through the SSH tunnel as the root CLAUDE.md requires. **Applying it locally
also migrates production** — it is additive only.

## Normalisation

`server/src/doctor-phrases/normalise.ts`, pinned in `normalise.spec.ts`:

1. trim, 2. collapse internal whitespace runs to one space, 3. lowercase,
4. drop a single trailing `.`.

Nothing else. In particular it must never drop a parenthesised qualifier, a
unit, a number or a word — those carry meaning in free clinical text, and the
whole point of the medicine feature's equivalent rule is that folding two
different instructions into one is the failure mode to design against.

A phrase is skipped entirely when its normalised form is empty, or shorter than
3 characters (a stray `x` is not an instruction worth suggesting).

## Write path

The existing seam in `PrescriptionsService.create` already runs
`habits.recordFrom(...)` inside a try/catch that can never fail the request. The
phrase learner is called from the same place, with the same guarantee:

- `Prescription.advice` → `source: "advice"`
- `items.filter(i => i.isNote)`, text from `item.drug` → `source: "rxNote"`

`patientCount` increments only when this patient has not contributed that
signature on an EARLIER prescription — one query for the prior signatures, then
a set lookup per phrase, exactly as `RxHabitsService#priorBlockKeys` does.

## Read path

`GET /api/doctor-phrases?source=advice&q=insu` — doctor-scoped, hidden rows
excluded, ordered by `patientCount` desc then `lastUsedAt` desc.
`PATCH /api/doctor-phrases/:id { hidden }`. No DELETE.

## Client

- **Advice** — `ExpandableField` gains an optional `learned` prop. Learned
  phrases rank above `fieldRecents`, which rank above the static
  `adviceSuggestions`. The existing recents stay: they cover what the doctor
  typed today, before it has been printed and therefore before it can be
  learned.
- **℞ note line** — a dropdown on a note row in `MedicinePad`, the same shape as
  the medicine habit dropdown, offering that doctor's learned note lines.

Both show the phrase and its patient count; neither inserts without a click.

## Verification

- `normalise.spec.ts` — the four folds, and everything it must NOT fold.
- `doctor-phrases.service.spec.ts` — distinct-patient counting across two
  prescriptions for one patient, a second patient incrementing, `hidden` never
  un-set by a later save, short/blank phrases skipped, both sources kept apart.
- `prescriptions.service.spec.ts` — the learner is called on create and a
  throw from it never fails the save.
- Client: the ranking (learned above recents above static) and that nothing is
  inserted without a click.
- `npx tsc --noEmit` and both test suites in `client/` and `server/`.
