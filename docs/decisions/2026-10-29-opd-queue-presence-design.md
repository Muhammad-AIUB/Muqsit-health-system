# OPD queue: presence, urgency and status (part A)

Date: 2026-10-29. Source: the physician's annotated screenshots and notes. Parts B (Print Queue) and C (SMS with a balance) are separate specs, built after this one.

## Goal

At reception, an assistant marks who has arrived and who needs attention; the doctor sees the same on their screen, with a status that follows the visit.

## Row layout (left to right)

Serial number, photo, name, mobile and age/sex, appointment time, three checkboxes, status, Prescribe and Done buttons. The token chip and the "Incomplete" chip are removed.

## Photo

The patient's stored picture (`pictureUrl`) when there is one. Otherwise the app's existing placeholder (`photoPlaceholder` + `Icon`, as in the prescription header), by the visit's gender; the plain person when the gender is unknown.

## Checkboxes

Three, independent: **Present**, **Critically ill**, **Pt needs urgent attention**.

- Row colour by priority: Urgent (red) over Critically ill (yellow) over Present (green). All three stay ticked; only the colour takes the highest.
- Ticking Present records the time and shows it under the checkbox (`6.00pm`). Unticking clears it. The time is the server's, in Dhaka time, never the browser's clock.
- The state is on the server, so an assistant's tick shows on the doctor's screen. Only today's queue can be changed; a past day is read-only (the service refuses, as for add/move).

## Status

Computed from the visit when shown, never stored.

| State of the visit | Status |
|---|---|
| Present not ticked | (empty) |
| Present ticked | Waiting |
| Chief complaint or other data entered on the ℞ pad | History taken |
| Medicine or investigation written, not printed | Prescription pending |
| Save & print done | Completed |

The later row wins. The pad's content is read from the patient's parked visit (`incompleteRx`), or the supervising practice's own parked visit (`SupervisedDraft`) where the visit is a supervised one; never the other practice's.

Open question for the implementation plan: which pad fields count as "data entered" for History taken. The physician said "chief complaints or any data entry"; the plan must read the editor's fields and list exactly which ones, and the physician confirms the list.

## Summary cards

Total Serial, Present, Completed, Waiting. Present = visits with Present ticked. Waiting = Present ticked and not Completed. Completed = visits marked Done or whose prescription was printed (a change from 'Done only', flagged for the physician in FUNCTIONAL-AUDIT.md).

## Data

`OpdVisit` gets nullable columns `presentAt` (timestamp), `criticallyIll` (boolean, default false), `urgent` (boolean, default false) through an idempotent, additive `manual-opd-presence.sql` (owner `exhort_user`), and a matching `schema.prisma` edit. Nothing is migrated or dropped. The SQL is applied before the release that reads it, as with `manual-opd-queue-date.sql`.

## API

One route to set the three flags on a visit, scoped by `@WorkstationDoctorId()` like the rest of `opd`, written under the doctor's advisory lock. A DTO declares every field. `docs/API.md` is updated in the same commit. The visit list returns the new fields.

## Unchanged

Prescribe and Done buttons, the day calendar, the schedule and serial times, the add-by-number flow.

## Tests

- Unit: status from the visit's state (each row of the table, and the later-wins order), colour priority.
- Integration: presence set and cleared, time taken from the server, past day refused, another doctor's visit refused.
- Browser at `:3000`: tick each box, see colour and time, status moves through the sequence, a second device sees it. Night mode and the phone width checked.
- CLAUDE.md files and `docs/DOMAIN.md` updated in the same commit.

## Not in this spec

Print Queue (B). SMS, its balance and buying SMS (C). SMS wording, consent and the per-message charge are the physician's to confirm there.
