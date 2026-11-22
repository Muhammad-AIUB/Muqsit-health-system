# Domain concepts — shared vocabulary

Moved verbatim from the root `CLAUDE.md` on 2026-09-24 to keep that file short. **Read this before touching any feature named here** — each entry records a physician decision or a safety rule that the code alone does not explain. Keep it current in the same commit as the change (PRIME DIRECTIVE rule 7).

**This page is the glossary: one line per concept.** The entry itself — what the thing is, the rule, and the physician's decision behind it — is in the file named beside its group, word for word as it stood on this page until 2026-11-15 (the page had grown to 62 KB with no headings). A line here is written to find the entry; the entry is what counts.

- Read the entry before touching a feature it names.
- When a decision changes: correct the entry in `docs/domain/`, and its line here, in the same commit as the code.
- The engineering rules for the same features are in [`docs/rules/`](rules/README.md); what is still open is in [`docs/FUNCTIONAL-AUDIT.md`](FUNCTIONAL-AUDIT.md).

### People and access → [`domain/people-and-patient.md`](domain/people-and-patient.md)

- **Account tiers** — `primary`/`premium` own a practice ("workstation"); `secondary` can only work as someone's assistant. New signups start `secondary`; admin app promotes.
- **Workstation** — The practice a request acts on: client sends `X-Workstation: <doctorId>`; server resolves owner/assistant + permissions.
- **Assistant** — A user another doctor added (`Assistant` table) with granted permission keys; works inside that doctor's workstation.
- **Ward / IPD team** — A Ward is a named group of admitted patients in one practice; its team (`IpdTeamMember`) has per-member `ipd.*` keys, managed owner-only. Not yet built: the team member's own login.
- **Supervised doctor** — Per-PATIENT link (`PatientSupervisor`): supervisor uses their own account, sees patient info but never the owner's prescriptions or draft, prescribes under their own `doctorId`.
- **Opened with the patient's own code** — A doctor types another practice's patient's mobile; the patient's phone gets a 6-digit code; the doctor enters it and the patient opens for that practice for good (`PatientAccessGrant`), as a supervising doctor's does, but never in the owner's chat. Physician's sheet 16/11/2026; the code is how an unowned patient is claimed.
- **Isolated practice** — An admin switch per doctor (Profile settings): that practice neither opens other practices' patients by code nor has its own opened that way; it closes access already given, nothing is deleted.
- **Point system** — The admin's ten scores (1–10) for a doctor; the admin's alone, never shown to the doctor.

### The patient → [`domain/people-and-patient.md`](domain/people-and-patient.md)

- **The patient photo** — The header photo is always the patient on screen: cleared with the editor, never put back by a late fetch, never handed to a NEW patient saved from a cleared screen.
- **Patient ≠ property of a doctor** — Deleting a doctor's account must never delete their patients (`onDelete: SetNull`); their prescriptions cascade. An unowned patient is found by number and opened with the patient's own code (16/11/2026).
- **The patient gate** — Nothing can be written on a prescription until a patient is chosen (mobile lookup or Add New); until then the editor is blurred and takes neither mouse nor keyboard.
- **The patient list on a phone** — The phone bottom bar has Rx, OPD, IPD, Supervised, Research and More; Patients is reached through More. Who may see which patient did not change.

### The visit and the prescription → [`domain/prescribing.md`](domain/prescribing.md)

- **Note and Plan** — "Note / plan" is now two lists, Note and Plan, each printing as its own section; `Prescription.plan` added, old `note` not split; both keep the one key `rx.note`.
- **Visit-date model** — The prescription header Date (`ptDate`) stamps investigation findings, on-examination entries and drug history; Drug history splits Current vs Distant-past by date, automatically.
- **Incomplete prescription** — Content without Save & print carries `incompleteRx` (Incomplete badge); a change after printing makes it incomplete again; the same prescription saved within 30 minutes is never a second row.
- **The printed sheet's header, margins and signature** — Top / Bottom margin are blank paper (`headerHeight` / `footerHeight`); Header Section prints inside the printable area; signature fixed at the page foot; Footer Section prints last.

### Medicines → [`domain/prescribing.md`](domain/prescribing.md)

- **"Your selected medicine names are:"** — The Add Bulk Medicine box names what is ticked — what Add will add, in that order — above the medicines.
- **Add Bulk Medicine** — A + beside ℞ opens the medicines THIS doctor prescribed before, one row per medicine with the instruction given to the most patients; reads only `DoctorRxHabit` rows; stores and teaches nothing.
- **Monthly cost from the medicine chart** — "Total monthly approximate cost" priced from the `medicines` table, form and strength included; only what can be read whole is priced, over a 30-day month. Nothing stored or printed.

### What the app learns from the doctor → [`domain/prescribing.md`](domain/prescribing.md)

- **Prescribing habit ("Your usual")** — A `DoctorRxHabit` row: (doctor, medicine INCLUDING strength, whole instruction block); never originates content, `patientCount` is DISTINCT PATIENTS, only completed prescriptions teach.
- **Learned phrases ("Your usual notes")** — `DoctorPhraseHabit`: ADVICE and ℞ note lines learned per doctor, inheriting the five habit rules; normalisation folds typography only; recents and learned lines are never cut or reset.
- **Special drug advice (℞ pad •••)** — A doctor's OWN standing advice per medicine or per same generic (`DoctorDrugAdvice`); ticked lines mirror into Advice and leave with the medicine; since 15/10/2026 also per Final diagnosis.

### Alerts and safety → [`domain/prescribing.md`](domain/prescribing.md)

- **H/O drug hypersensitivity and High-Alert Medication** — Per-PATIENT lifelong list (`PatientDrugSafety`) after Drug history; always printed, no ⊘ Hide; soft removal with Undo. NOT a prescribing alert: nothing on the ℞ pad reads it.
- **Prescribing alert ("MHS is suggesting")** — Live advisory, drug-condition and drug-drug, messages verbatim from the physician's sheets in `rxAlerts.ts`; derived, never persisted; one blinking red sign on the pad; never printed or saved.

### Drug history → [`domain/drug-history.md`](domain/drug-history.md)

- **Drug history is read by its generic names** — Drug history modal and Records page show the generic where the medicine chart gives exactly one; display only — the record keeps the brand line, Move to Rx puts the brand on the ℞ pad.
- **Current medications = the PREVIOUS visit** — Current tab = every entry of the latest dated visit before today plus today's hand-added Current; today's ℞ is in NEITHER tab; older and `01/01/2000` are Distant past. Derived, never stored.
- **Drug history is OFF the printed sheet by default** — Every new visit starts with ⊘ Hidden on; pressing it prints the section for that visit. Entries untouched.
- **℞ → Drug history mirror** — Each medicine on today's ℞ pad is stamped with `ptDate` and merged into `Patient.drugHistory` live; withdraws only entries it added, completes nothing, stripped out of the printed sheet.
- **Add medicine, Drug history** — "+ Add medicine" writes one new date-stamped line to `Patient.drugHistory`; strictly an ADD; exact duplicate refused; after print appended by the server, refused for a supervising doctor.
- **Drug history table, Edit and Add in Patient's Prescriptions & reports** — Table of courses: End = Start + days of every line, Total = units a day × days; unreadable leaves blank. Edit changes only date and duration, never name, dose or food.

### Investigations and health monitoring → [`domain/investigations-and-monitoring.md`](domain/investigations-and-monitoring.md)

- **Disease / surgical history as dated lists** — In On examination each takes several entries, text then a date (`151026` → `15/10/2026`, only a date that has happened), each its own On-examination line; stored one entry per line.
- **Disease / surgical history moved to the sidebar's History row** — The two lists sit under History in the left column, belong to the PATIENT, written at Add; × is soft with Undo; ⊘ Hide on History keeps the whole section off the print, OFF by default.
- **On examination is the PATIENT'S shared history** — A saved visit's On-examination lines are appended server-side to `Patient.onExaminationSummary` (`POST /patients/:id/on-examination`), stamped `by`; read-only on the records page; ⊘ Hide starts OFF.
- **Duration override (Health trend chart)** — The owner doctor can override a derived bar's start/end (`Patient.hmDrugDates` / `Patient.hmSymptomDates`); display-only, dashed; `drugHistory` and prescriptions never rewritten.
- **Investigation groups** — Each doctor's own named sets of tests (`User.investigationGroups`); per signed-in user, never pre-filled by the system.
- **Choosing a date for findings is a deliberate press** — In the Investigation calendar arrow keys only move; a day is chosen by Enter, Space or a click; a date change files the half-typed result under the old date first.
- **The health-trend chart keeps its size** — Never shrunk to fit; scrolls sideways on phone/tablet; names worked out together so differing parts show; a number in a name is never shown in part; four known cases still collide.
- **A number is shown as it was written** — "Added results" no longer spaces commas inside a number; one-box results, calculator results and free text shown as stored; several-box tests still set apart at commas.
- **A typed comma and the health-trend chart** — A comma with a digit directly on each side cannot be read, so neither side is plotted; a comma then a space is punctuation. Open: a spaced comma's meaning, and grouped numbers not plotted.
- **A result box with two units converts only a plain number** — Only a whole, plain number is converted; anything else is recorded exactly as typed, in the unit of the box it was typed in.

### OPD → [`domain/opd-and-ipd.md`](domain/opd-and-ipd.md)

- **Statistics — Settings → Statistics** — Patient statistics (OPD queue: total serial vs seen, calendar averages; only queued patients count); Disease statistics (Final diagnosis by DIFFERENT patients; `DM` and `Diabetes mellitus` are two).
- **OPD queue by day** — Queue booked per Dhaka calendar day (`OpdVisit.queueDate`); a passed day is locked (server refuses); serial times worked out, never stored; Print Queue; Presence / urgency / status marks (L25).
- **SMS to a day's queue, the SMS wallet, Settings → Payment** — Appointment SMS built on the server; title from RECORDED sex, never a guess; 1 taka per message counted; the wallet is the PRACTICE's, whole taka, never negative, every change a ledger line.
- **Chambers — "My Chamber"** — Chambers added in Settings → Chambers; a never-removable main chamber; each chamber has its own OPD list, tokens (each from `T-01`), day schedule and OPD print settings. IPD untouched.

### IPD → [`domain/opd-and-ipd.md`](domain/opd-and-ipd.md)

- **Analogue order sheet** — The ward's PAPER order sheet photographed into the admission (`IpdClinical.analogueSheets`), written ONLY via `/ipd/:id/analogue`; saved on upload, soft removal, cannot be reordered.
- **IPD admits by mobile number first** — As the OPD queue: a patient saved on the number is chosen or "Add New" creates one; the name is never typed on the admit form, so every admission is tied to a patient record.

### Conventions → [`domain/conventions.md`](domain/conventions.md)

- **Add is a circled plus** — Every "add" in the doctor app is a plus in a ring (`plusCircle`); a `+` meaning zoom, open a group or a clinical grade (Anaemia `++`) stays as it was.
- **Night mode** — A ☀ / ☾ switch turns the doctor app dark grey (not black); per user per device, not mirrored; printouts, patient images and rich text stay on white paper.
- **BAN / EN typing** — Phonetic Bangla typing only in named fields; the keyboard never converts a number; since 2026-10-14 BAN also writes the OPD ℞ pad's dose / food / duration in Bangla, saved and printed so.
- **What a colour means** — Blue (`C.pri`) pressable/selected; Green (`C.ok`) done/normal/saved/stable; Amber attention and ⊘; Red critical/destructive; Light blue (`C.info`) info. Never the brand colour on a status.
- **A unit is shown as it is written** — Labels no longer forced to capitals: `g/dL`, `fL`, `µL` appear as the catalog writes them. Awaiting the physician: if capitals return on names, never on the unit.
- **Asking before something is taken away** — Removals ask first in the app's own box, button is the verb, Cancel selected; a failure or a save that did not happen is said and stays until acknowledged; the answer applies to that patient only.
- **A typed date and a recorded moment are two things** — A typed date is `dd/mm/yyyy`; a system-recorded moment is `9 Oct 2026 · 17:04` (`client/src/lib/stamp.ts`), the same on every machine.
- **A page opened to be read is shown whole** — The image viewer opens a page entirely at fit with no control drawn over it; magnifying is always the doctor's own act.
- **Whatever covers the screen keeps the keyboard** — A popup takes focus, traps Tab, closes on Escape, returns focus to its opener — except the print sheet from "Save & print", which does not return focus to that button.
- **A caption and its box** — Pressing a caption puts the cursor in its box, nothing more; a caption over a shown-only value or locked box does nothing; only what the code marks as a caption behaves this way.
- **What the screen says does not depend on the machine** — A clinical number, a date and a test's name are written by the app, never by browser language or a style rule (`1,500`, `9 Oct 2026 · 17:04`, `eGFR`).

### Communication → [`domain/conventions.md`](domain/conventions.md)

- **Revision Notes** — The SIGNED-IN user's own notebook tab (`DoctorRevisionNote`); nobody else reads it, an assistant included; auto-saves; server refuses save or read for anyone but the signed-in user.
- **My Personal Note for This Patient** — Private formatted note per (user, patient) (`DoctorPatientNote`), never logged, mirrored or printed with the prescription; details frozen at first save; opened FOR a patient, never follows the editor.
