# Dates

> **Read this before changing the code it covers.** Named in these rules: `client/src/lib/dateInput.ts`, `components/common/DateField.tsx`, `lib/hmDates.ts#cellToDate`, `patients/dto/patient.dto.ts`, `ddmmyyyyMs`, `HealthTrendsChart`, `parseDateInput`, `rxAlerts`, `allowEmpty`, `apiFetch`, `DateField`, `ddmmyyyyMsStrict`, `DrugHistoryField`, `FUTURE_LIMIT_YEARS`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- A stored date is never parsed with `new Date(str)` (JS reads `03/06/2026` as 6 March): use `client/src/lib/dateInput.ts`.
- Never use a bare `new Date(str)` on a stored date: parse `dd/mm/yyyy` explicitly, reject rolled-over dates, never fall back to an instant (`|| 0`) — return `NaN`, drop and count what fails.
- Every caller that orders clinical data by a `dd/mm/yyyy` string shares ONE copy, `ddmmyyyyMs` in `lib/dateInput.ts`; two screens disagreeing on which finding is newer is a real hazard.
- `ddmmyyyyMs` returns milliseconds, not a `yyyymmdd` sort key, because callers do time arithmetic (`rxAlerts` days, "last 6 months" filter); a sort key would silently break them.
- How it works — `ddmmyyyyMs` is lenient: `31/06/2026` rolls to 1 July and a malformed value returns 0, so junk sorts older than every real date (end of a newest-first list).
- `ddmmyyyyMsStrict` returns `NaN` and refuses rolled-over dates, for callers that must DROP a bad date (chart axis, `rxAlerts`); pick by what a bad date must do: sort last → lenient; dropped → strict.
- How it works — Consolidating the hand-written parsers into the two changed no result for any well-formed `dd/mm/yyyy`; malformed inputs still sort oldest or were already rejected.
- Two-digit years are resolved by `resolveTwoDigitYear(yy, futureAllowanceYears, now?)` in `lib/dateInput.ts`, a sliding window — not a hard-coded `2000 + yy` (`030398` became 2098).
- Pick each date field's `YEAR_POLICY`: `past` (0 years; DOB, LMP/ultrasound; a later-than-today date is refused) or `clinical` (5 years); `FUTURE_LIMIT_YEARS` is this constant — don't redeclare it.
- How it works — `parseDateInput` returns `{ok:true,iso}` or `{ok:false,reason:"malformed"|"future"}` so a field can say which rule broke; `parseFlexibleDate` is the old `string | null` wrapper.
- How it works — `parseDateInput` also enforces a sanity range, year 1900 to today + 100, separate from the century policy (`03/03/998` once parsed as year 998 and printed).
- All date entry goes through `components/common/DateField.tsx`; never add a native `<input type="date">`; a bad parse reverts AND says why; Escape flag is a ref set before `blur()` (+1 more)
- Pass `allowEmpty` on every optional date so a wrong date (e.g. date of birth) can be taken out; it stays off for the prescription visit date.
- Dates stored before the century fix keep their wrong century; nothing is rewritten; `isImplausibleDate()` flags them where they render; a bulk repair would be its own reviewed migration.
- Server validates `dob` in `patients/dto/patient.dto.ts` (`@IsISO8601({strict:true})` + `NotFutureDateConstraint`, 24h grace); its messages reach the save banner, so write them for a clinician.

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not parse a stored date with `new Date(str)`. Use `client/src/lib/dateInput.ts` — JS reads `03/06/2026` as 6 March.

## ⚠️ Date parsing: `new Date("25/07/2026")` is Invalid Date

_From `client/CLAUDE.md`._

JavaScript reads a slash date as **month**/day/year, so the app's own `dd/mm/yyyy` blows up for any day past the 12th, and silently swaps day and month for days 1-12 (`03/06/2026` → 6 March). Anything that turns a stored date string into a `Date` must parse `dd/mm/yyyy` explicitly and reject rolled-over calendar dates (`31/02/2026` must not become 3 March) — `lib/hmDates.ts#cellToDate` and `HealthTrendsChart`'s `ddmmyyyyMs` both do, with calendar validation. Never reach for a bare `new Date(str)` on a stored date, and never let a failed parse fall back to an instant: `|| 0` yields 1 Jan 1970 and `yy || 0` yields 1900, and one such point stretches a shared axis across decades. Return `NaN`, drop what cannot be placed, and say how many were dropped.

### Ordering by a stored date: `ddmmyyyyMs` in `lib/dateInput.ts`, and nowhere else

**One copy, shared by every caller that orders clinical data by a `dd/mm/yyyy` string** (consolidated 2026-09-21 from EIGHT hand-written ones, each written slightly differently). Two screens disagreeing about which of two findings is newer is a real hazard here — the Health-trend chart, the investigation summary and download, the on-examination summary, the drug-history ranges, the Drug-history modal and the printed sheet's finding order all hang off this.

- **Milliseconds, not a `yyyymmdd` sort key**, because three callers do real time ARITHMETIC and not just comparison: `rxAlerts` divides a difference by `86_400_000` for days, `DrugHistoryField` compares against `Date.now()`, and `investigationSummary.filterByDate` is handed epoch bounds from a date picker. A sort key would silently break the "last 6 months" filter.
- **Lenient about the calendar**, matching the seven parsers it replaced: `31/06/2026` rolls over to 1 July. A malformed value returns **0**, which sorts older than every real clinical date, so junk lands at the end of a newest-first list rather than the top.
- **There is a second, STRICT contract beside it: `ddmmyyyyMsStrict`, which returns `NaN` and refuses a rolled-over date** (`31/02/2026`). Two callers need it because they must DROP a date they cannot read rather than place it: `HealthTrendsChart` plots on a shared time axis (when its parser returned 0 for junk, ONE malformed record stretched the axis across 126 years and squeezed every real value into a couple of pixels) and `rxAlerts` divides a difference by `86_400_000` to decide whether a drug is one the patient is CURRENTLY on (an epoch-zero stamp computes a ~56-year gap and silences an alert that should fire). **Pick by what a bad date must do: sort last → lenient; be dropped → strict.**
- Proven non-behaviour-changing when it landed: every well-formed `dd/mm/yyyy` gives a byte-identical result under all the old forms and the new ones; the malformed inputs that differ in VALUE all still sort oldest (lenient) or were already rejected (strict), so no screen moved. Nine hand-written copies became these two.

### Two-digit years: one helper, one policy per field

A 2-digit year is ambiguous, and both parsers used to resolve it by hard-coding `2000 + yy` — so `030398` meant 2098 and a birth year was silently a century out. That is now **`resolveTwoDigitYear(yy, futureAllowanceYears, now?)` in `lib/dateInput.ts`**, a sliding window anchored on the current year (so it survives 2099, unlike a baked-in `2000`): the forward reading wins unless it lands beyond the allowance, in which case the previous century does.

The allowance is the whole design — **there is no single correct rule for every field**, and a global "never future" would be the same bug pointing backwards (a 2027 follow-up typed as `030127` would become 1927). Pick from `YEAR_POLICY`:

| Policy | Allowance | Fields |
|---|---|---|
| `YEAR_POLICY.past` | 0 years | Date of birth, calculator dates (LMP, ultrasound). Also turns on a **day-level** check: a date later than today is refused outright, not shifted, because 1926-vs-2026 there is a genuine ambiguity and guessing would be a second silent century move. A real 1926 date is typed in full. |
| `YEAR_POLICY.clinical` | 5 years | Prescription header Date, findings, medicine pad, health-monitoring durations — a follow-up may legitimately be years out. `HealthTrendsChart`'s `FUTURE_LIMIT_YEARS` **is** this constant; don't redeclare it. |

`parseDateInput` returns `{ok:true,iso}` or `{ok:false,reason:"malformed"|"future"}` — the reason exists because the field has to say *which* rule was broken. `parseFlexibleDate` is the old `string | null` wrapper and still works for callers that don't need the reason.

Separate from the policy, `parseDateInput` also enforces a sanity range: **year 1900 to today + 100**. The policy only decides which century an *ambiguous* 2-digit year belongs to; the range catches a year that is not a date at all however it was typed. `03/03/998` used to parse as year 998 — an age of 1028 — and `prescriptionDoc` prints the date string verbatim onto the prescription.

**All date entry goes through `components/common/DateField.tsx`.** Do not add a native `<input type="date">`: it cannot take the DDMMYY shorthand, which is how doctors actually type, and it bypasses the century policy. `DateField` reverts to the last valid value on a bad parse **and** says why underneath — reverting alone swallowed the reason. Enter commits, Escape abandons (the Escape flag is a **ref**, set before `blur()`, because `blur()` runs the commit synchronously — the same trap documented for the chart below).

**Pass `allowEmpty` on every optional date.** The native pickers this replaced all had a clear button; without the prop a doctor can never take a wrong date of birth back out, because `parseDateInput("")` is "malformed" and the box reverts to the value they were trying to drop. It is off by default so the prescription visit date keeps refusing to be emptied, as it always did.

Dates stored **before** this fix keep their wrong century; nothing is rewritten. `isImplausibleDate()` flags them where they render (DOB field, `PatientRecordsView` date headings, the chart's amber note) and the doctor decides. A bulk repair would be its own reviewed migration.

Server side, `dob` is validated in `patients/dto/patient.dto.ts` (`@IsISO8601({strict:true})` + `NotFutureDateConstraint`, 24h grace for UTC+6-vs-UTC clock skew). Its messages are doctor-facing — `apiFetch` joins `body.message` straight into the save banner, so write them for a clinician.
