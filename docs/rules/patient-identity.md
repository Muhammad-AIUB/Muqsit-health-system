# Patient identity: sex, age, NID, family tree, photo

> **Read this before changing the code it covers.** Named in these rules: `lib/age.ts#ageFromDob`, `lib/sex.ts`, `src/lib/ocr.ts`, `patientForm.ts`, `PatientMobileLookup.tsx`, `normaliseSex`, `displayAge`, `gender`, `IdentityFields`, `loadPatient`, `onGender`, `Patient.sex`, `PatientHeader`, `setPtGender`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- OCR (`src/lib/ocr.ts`) verifying the typed NID number at signup is assistive only; never let OCR overwrite what the user typed.
- The field is "Sex" on every screen (not "Gender"), stored in `Patient.sex`; every `<select>` offers the same four: `—` / Male / Female / Other.
- The OPD queue's `gender` column holds two spellings; always read it through `normaliseSex()` in `lib/sex.ts`, never `=== "F"` (a woman stored as "Female" showed as Male).
- Never default a missing sex (it selects reference ranges and dosing): `normaliseSex()` returns `""` for anything unrecognised and `sexLabel()` renders `—`.
- Patient creation asks Sex and DOB/age (optional, never guessed); DOB wins and the manual age is dropped; `PatientHeader` may only fill a BLANK Age/Sex (`fillable` captured on load) (+3 more)
- How it works — Header and Patient Settings mirror sex live (`onGender` → `setPtInfo.sex`, select → `setPtGender`, `loadPatient` sets both); if they disagree, suspect a fabricated default, not the sync.
- Age comes from `lib/age.ts#ageFromDob` everywhere; never recompute it as `elapsedMs / (365.25 * day)` — age drives dosing.

---

# The rules, in full

## ⚕️ Clinical-accuracy rules specific to the client

_From `client/CLAUDE.md`._

- **OCR (`src/lib/ocr.ts`, tesseract.js)** verifies the typed NID number against the uploaded NID photo during signup. It is assistive only — never let OCR overwrite what the user typed.

## ⚠️ Patient sex: one word, one vocabulary, never a guess

_From `client/CLAUDE.md`._

The field is **"Sex"** on every screen (the header said "Gender" until 2026-07-27 — a different concept, and the second name is how the two screens drifted). It is `Patient.sex`, and every `<select>` offers the same four: `—` / Male / Female / Other.

**The OPD queue's `gender` column holds two spellings and always will:** `MuqsitContext` writes the full word from the editor (`gender: ptGender`), `PatientsView` used to write `"M"`/`"F"`. Read it through **`normaliseSex()` in `lib/sex.ts`**, never `=== "F"` — that test showed a woman stored as `"Female"` as **Male**, and opening her OPD row loaded that into the prescription editor.

**Never default a missing sex.** Five places used to: `patientForm.ts` pre-filled the form with `"Male"`, `PatientsView` listed and stored `M`, `OpdView` seeded the queue with `M` and pushed `"Male"` into the editor. Sex selects reference ranges (Hb, creatinine, eGFR) and sex-dependent dosing, so an unrecorded sex must stay unrecorded — `normaliseSex()` returns `""` for anything it does not recognise, and `sexLabel()` renders `—`.

**Sex and age are asked for where a patient is CREATED, and fillable where they are missing.** Both modals in `PatientMobileLookup.tsx` (new patient, and person-related-to) take them in the product owner's order — name, **Sex**, then **date of birth or age** (`IdentityFields`, 2026-08-15) — so a record no longer starts blank on the fields that decide dosing and reference ranges. All three stay **optional** there, because a guessed sex is worse than a missing one and an unknown age must not block opening the prescription. **Date of birth wins and the manual age is dropped from the payload:** `displayAge` prefers the DOB, so an age stored beside one is written and then never shown again — the box goes read-only and displays what the DOB computes to instead. The DOB box is a `DateField` on `YEAR_POLICY.past`, so `030398` is 1998, not 2098. In `PatientHeader`, Age and Sex are the one exception to the identity lock, and only to **fill a blank**: `fillable` is captured when the patient loads (not derived per render, or the box would re-lock mid-typing and a typo could never be corrected), and changing an already-recorded value still goes through Patient Settings — the same patient is seen by several practices. Age stays locked when a **DOB exists even if the box renders blank** (an unparseable or future DOB): `displayAge` prefers the DOB, so a manual age typed there would save and never appear. The header **persists these itself** (`useUpdatePatient`, 600 ms debounce) — nothing else writes them back, since `savePrescription` sends age/sex only when it is *creating* the patient — and a failed write is shown in red under the header rather than dropped.

Header and Patient Settings mirror each other live (`onGender` → `setPtInfo.sex`; the form's select → `setPtGender`; `loadPatient` sets both). If they ever disagree again, suspect a fabricated default, not the sync.

## ⚠️ Date parsing: `new Date("25/07/2026")` is Invalid Date

_From `client/CLAUDE.md`._

### Two-digit years: one helper, one policy per field

**Age comes from `lib/age.ts#ageFromDob`, everywhere.** Do not recompute it as `elapsedMs / (365.25 * day)`: leap days accumulate, so that form read 29 for someone born 27 Jul 1996 on their 30th birthday while the header said 30. Age drives dosing — one function.
