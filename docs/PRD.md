# Muqsit Health System — Product Requirements Document

**Product:** a prescription and practice-management platform for doctors in Bangladesh.
**Status:** live at muqsithealthsystem.com; real physicians prescribe real medication through it daily.
**Owner and domain authority:** the practising physician who owns the product. Every clinical decision in this document is theirs; this document records them, it does not make them.

Related: [README.md](README.md) (map of the documentation) · [ARCHITECTURE.md](ARCHITECTURE.md) · [APP-FLOW.md](APP-FLOW.md) · [UI-SPEC.md](UI-SPEC.md) · [SCHEMA.md](SCHEMA.md) · [ROADMAP.md](ROADMAP.md) · [CODEMAP.md](CODEMAP.md) · [DOMAIN.md](DOMAIN.md) (glossary; the physician's decisions in full are in [`domain/`](domain/)) · [`rules/`](rules/README.md) · [API.md](API.md)

> This PRD is written from the code and the project's own documentation. Checked against the code on 2026-11-15 (`dev` @ 9be6e72). No usage numbers, user counts or revenue figures exist in the repository, so none are stated here. Where a section needs the owner's input, it says so.

---

## 1. Problem

A doctor in a busy Bangladeshi clinic must, in a few minutes per patient:

- find the patient again (people return, and often to a different doctor),
- recall what they were already taking,
- write a prescription in the doctor's own shorthand and often in Bangla,
- avoid a dangerous drug–condition or drug–drug combination,
- hand over a printed sheet that is a legal document,
- and not lose any of it when the connection drops or the page reloads.

Paper pads lose history. Generic EMR software assumes English, a US workflow, and a reliable network, and it invents defaults a physician would not choose. The cost of getting it wrong is clinical, not cosmetic.

## 2. Vision and principles

A calm, fast writing surface that **never invents clinical content, never silently loses what was entered, and never shows a doctor another practice's patients.**

| Principle | What it means in the product |
|---|---|
| Patient safety first | No guessed formulas, ranges, doses or alert text. Anything clinical is verbatim from a source the physician supplied |
| Nothing lost | Auto-saved drafts, parked visits, quiet retry on a flaky network, soft removal with Undo, never-filed-twice saves |
| Scoping is safety | Four distinct relationships can reach a patient, each seeing a deliberately different slice; patient deletion is owner-only, always |
| The printout is the record | The printed sheet shows exactly what was entered — no inferred advice, no truncation |
| Doctor's own words | The system learns a doctor's repeated phrasing and offers it back; it never originates it |
| Calm clinical UX | Fixed palette with one job per hue, clear empty/loading/error states, forgiving input (`030626` is a date) |

## 3. Users and roles

| Role | Who | Can do | Cannot do |
|---|---|---|---|
| **Owner doctor** (`primary` / `premium` tier) | The physician who owns a practice ("workstation") | Everything in their practice: patients, prescriptions, OPD, IPD, settings, assistants, wards, print layout | See another practice's patients except by an explicit supervising link |
| **Assistant** | A registered user the owner adds, with ticked permission keys | Works inside the owner's practice for the sections they are granted (`rx.*`, `pt.*`); can always add patients to the OPD queue | Delete a patient; edit health-trend overrides; manage assistants or wards; anything not ticked |
| **Supervising doctor** | Another doctor linked to **one patient** | Find that patient by mobile, read patient info and records, chat with the team, prescribe under their **own** id, keep their own parked visit | See or edit the owner's prescriptions or draft; append to the owner's drug history; delete |
| **Ward team member** | A doctor or nurse on a ward's team, with per-member `ipd.*` keys | Defined in the data model and the settings screen | *Their own login to reach the ward is not built yet* (see [ROADMAP.md](ROADMAP.md)) |
| **Secondary-tier user** | A new sign-up before promotion | May only work as someone's assistant; sees an upgrade gate otherwise | Own a practice |
| **Administrator** | Back-office staff, `role: admin` | Review registrations (approve, reject, suspend), promote tiers, trash and restore accounts, handle SMS / renewal payment requests — in the separate admin app | Use the doctor app's clinical screens |

`primary` and `premium` owners differ in a few places: Imaging DICOM on the records page is premium-only (checked on the server too), and the records page's Total summary is premium-only (locked, not hidden; a client-side gate). See [`rules/records-page.md`](rules/records-page.md).

The **patient** is a record, not a user. Patients do not log in.

Registration collects profession (`doctor`, `intern_doctor`, `nurse`, `medical_technologist`, `computer_operator`), registration number (not for computer operators), NID, designation, specialty, optional institution code and four uploaded documents. A new account is `pending` until an administrator approves it.

## 4. Goals and non-goals

### Goals
1. Let an owner doctor see a patient, write and print a prescription, and queue the next patient without leaving one screen.
2. Make every previous visit's information (drug history, investigations, examinations, family) available at the moment it is needed.
3. Warn about contraindicated combinations while the doctor writes, using only the physician's own rule sheets.
4. Run an inpatient ward: admissions, beds, wards and their teams, a per-admission sheet, a photographed paper order sheet.
5. Support a team: assistants with granular permissions, supervising doctors, per-patient chat, an activity trail.
6. Work in Bangla and English, on desktop and phone, in light and dark, on hospital networks that may block third-party hosts.
7. Be safe to operate: a failed save is said plainly, a lost answer is never filed twice, nothing is edited into silence.

### Non-goals (today)
- Patient-facing login, booking or portal.
- SMS sent by itself: the only SMS is the appointment message a doctor or assistant sends to a day's queue with a press (see O6).
- Inventing or auto-filling any dose, range, score cut-off or alert.
- Cross-doctor analytics; learned habits, phrases and advice are strictly per doctor (Settings → Statistics counts one practice's own queue and prescriptions).
- Insurance, or a payment gateway. *Not found in the code; the owner should confirm this is intended.* Payment for SMS and the monthly subscription is a request an administrator credits by hand (see 5.8). (The approximate monthly medicine cost on the prescription header is priced from the medicine chart and never stored or printed.)
- A restyle of the printed sheet as part of an app restyle; the document imports no theme on purpose.

## 5. Features

Priority: **P0** = the product does not work without it · **P1** = core to daily use · **P2** = valuable, can be absent without breaking a visit.

### 5.1 Access and accounts
| ID | Requirement | Pri |
|---|---|---|
| A1 | Email + password sign-in (identifier may be email or 11-digit mobile); cookie sessions that renew silently; "remember me" | P0 |
| A2 | Registration with document uploads, email OTP, and admin approval before first use | P0 |
| A3 | Account tiers: `secondary` (assistant-only) and `primary`/`premium` (own a practice); promotion in the admin app | P0 |
| A4 | A switcher for the practices a user can work in (their own and any they assist) | P0 |
| A5 | Admin console: review, approve, reject with reason, suspend, change tier, trash and restore; "SMS payments" lists the doctors' payment requests and credits one | P1 |
| A6 | Profile: picture, chambers (address + map link), extra certificates, signature name. (These profile chambers are not the practice's OPD chambers of A7.) | P1 |
| A7 | **Chambers — "My Chamber"**: a practice adds its chambers in Settings → Chambers (name, address); a main chamber always exists and cannot be removed; each chamber keeps its own OPD list, tokens, day schedule and OPD print settings; "My Chamber" beside the Prescription tab chooses the one the user works in (per user, per practice, per device); a foreign or removed chamber id is refused by the server. See [`rules/opd.md`](rules/opd.md) | P1 |
| A8 | **Settings → Statistics** (read only; assistants may open it): Patient statistics — total serial and patients seen per day or per month, for all chambers or one, and five overall numbers; Disease statistics — each Final diagnosis with the number of different patients. Only queued patients are counted. See [`rules/statistics.md`](rules/statistics.md) | P2 |

### 5.2 Patients
| ID | Requirement | Pri |
|---|---|---|
| P1 | **Mobile-first patient gate.** Nothing can be written on a prescription until a patient is chosen from the mobile lookup or created with Add New; the editor is blurred and inert until then (mouse and keyboard) | P0 |
| P2 | Find by mobile; create with Add New; age from DOB or a typed age that advances each year | P0 |
| P3 | Records: drug history (Current vs Distant past), investigation summary, on-examination history, galleries of prescription and report images, family tree with reciprocal links; Patient's input, Disease and surgical, Chief complaints and Diagnosis history; every section collapsible (starts collapsed). See [`rules/records-page.md`](rules/records-page.md) | P1 |
| P3a | Drug history as a table on the records page (Drug name, Dose, Duration, Start date, End date, Total number; current medication first); **Edit** changes only a start date and durations, saved to the record at once; **Add** a medicine. See [`rules/drug-history.md`](rules/drug-history.md) | P1 |
| P3b | **Total summary** of the patient: every dated record in one list, as stored, with filters and a Download — premium only | P2 |
| P3c | **Permissions** (scanned images) and **Imaging DICOM** (premium only; in-app viewer, the scan is never sent to a third party); add / remove by the owner's practice only, removal soft | P2 |
| P4 | "Keep eye on this patient" flag, tags, patient photo | P2 |
| P5 | Supervising doctors per patient, with a "SUPERVISED" badge in their own list | P1 |
| P6 | Per-patient team chat with attachments | P1 |
| P7 | Delete a patient — owner only, with confirmation, refused while another doctor holds prescriptions for them | P0 |

### 5.3 Prescribing (OPD editor)
| ID | Requirement | Pri |
|---|---|---|
| R1 | Clinical sections: chief and previous complaints, history, investigation, drug history, on examination, note, plan, provisional / associated / final diagnosis, advice, advised tests, follow-up | P0 |
| R2 | The ℞ pad: medicine search over the medicines table, dose / food / duration, `>>>` tapering lines, free-typed note lines, shorthand input | P0 |
| R3 | **Save & print**: creates the prescription, builds the printable sheet and the gallery snapshot, marks the visit complete | P0 |
| R4 | Auto-saved draft per user; survives reload; **Save to complete later** parks a visit deliberately; the OPD queue shows its stage (History taken / Prescription pending, see O3) | P0 |
| R5 | Never filed twice: a save whose answer is lost is re-sent unchanged and the server returns the one on record; the doctor is told plainly if the outcome is unknown | P0 |
| R6 | **Prescribing alerts** ("MHS is suggesting"): drug–condition and drug–drug rules computed live from the editor; one blinking sign on the pad and the advice under its own medicine line; "Ignore Warning" hides the message, not the sign; never saved or printed | P0 |
| R7 | **Your usual**: the dropdown offers the doctor's own most-used instruction block for a medicine (strength-exact, distinct-patient counted, taper lines included); insertion needs a click | P1 |
| R8 | **Add Bulk Medicine**: tick from medicines this doctor has prescribed before, popular or alphabetical, one row per medicine | P1 |
| R9 | Learned phrases for the Advice list and ℞ note lines | P1 |
| R10 | Special drug advice (℞ pad •••): standing advice per medicine, per generic, or per final diagnosis, mirrored into Advice and withdrawn when its trigger goes | P1 |
| R11 | Drug history mirror: every medicine on today's ℞ is recorded live, withdrawn only if the mirror itself added it; hand-typed history is untouchable | P1 |
| R12 | Drug history "+ Add medicine" and "Move to Rx" (the same-medicine comparison is shared with the bulk box) | P1 |
| R13 | Investigation popup: one picker over the test catalogue, per-test unit preference, favourites, doctor-made groups, dates by `ddmmyy` shorthand, clinical calculators (the README says 77; the test catalogue in `data/investigations.ts` holds 75 `calc:` entries) | P1 |
| R14 | Templates (OPD / IPD / custom) | P2 |
| R15 | "Total monthly approximate cost" priced from the medicine chart, shown only for what can be read whole and naming what is not priced | P2 |
| R16 | BAN / EN header switch: phonetic Bangla typing in named fields; the ℞ pad's dose / food / duration are written in Bangla or English as a whole | P1 |
| R17 | Health-trend chart of labs, medications and symptoms across all visits; owner-only duration overrides drawn dashed | P1 |
| R18 | Personal note per patient — private to the signed-in user, with a sensitive-text mark that print can omit | P2 |
| R19 | Revision Notes — a private per-user notebook, printable, searchable | P2 |
| R20 | **H/O drug hypersensitivity and High-Alert Medication**: a per-patient list kept for life, directly after Drug history on the sidebar, read by every practice that reaches the patient; one entry at a time with +, ✎ Edit, soft removal with Undo; **always printed** (no ⊘ Hide), in red; not a prescribing alert — nothing on the ℞ pad reads it. Wording in [`domain/prescribing.md`](domain/prescribing.md) and [`rules/rx-alerts.md`](rules/rx-alerts.md) | P0 |
| R21 | **History row**: the patient's Disease history and Surgical / intervention history (moved out of the On-examination popup) under the sidebar's History, written to the server at Add, seen by every doctor who reaches the patient, removed softly with Undo | P1 |
| R22 | On examination is the patient's shared history: appended by the server on save (a supervising doctor's findings too), each entry stamped with its author by the server; read-only on the records page | P1 |

### 5.4 OPD queue
| ID | Requirement | Pri |
|---|---|---|
| O1 | Queue **booked by day** (a calendar beside the title): patients added and ordered (▲ ▼) for today or a later day; a day that has passed is locked, by the server as well; Prescribe and Done for today only. Rows show a serial (1, 2, 3 …), not the token, which is still stored; a visit type other than New (Follow-up, Urgent) is shown as a pill. Each chamber has its own queue (A7). Four cards: Total Serial, Present, Completed, Waiting. See [`rules/opd.md`](rules/opd.md) | P0 |
| O2 | Add by mobile; a patient still waiting is not given a second token by a repeated press | P0 |
| O3 | **Presence and status**: per row the patient's photo and three boxes — Present (the server's time), Critically ill, Pt needs urgent attention (today only); the row is coloured by the strongest mark; the status is derived, the latest that is true: Completed > Prescription pending > History taken > Waiting | P0 |
| O4 | **Day schedule** per day and chamber (start time, optional break, minutes per patient); each serial's time is worked out from the saved schedule, never stored | P1 |
| O5 | **Print Queue**: the day on show as a sheet — serial, name, gender, age, mobile, appointment time | P1 |
| O6 | **Send SMS to all patients** of the day on show (today or later): Bangla or English, the server builds every message and shows each and its cost before sending; charged from the practice's SMS wallet, only what the gateway took; no answer is never retried. See [`rules/sms-and-payment.md`](rules/sms-and-payment.md) | P2 |

### 5.5 IPD
| ID | Requirement | Pri |
|---|---|---|
| I1 | Admit by mobile (patient chosen first, name never typed); bed, room, ward, floor | P0 |
| I2 | Ward board with status (Stable / Observation / Critical / Discharge) | P0 |
| I3 | Per-admission sheet: Sign, Symptoms, investigation, procedure, follow-up with timestamped vitals, plan, advised tests, Prescription | P0 |
| I4 | Wards (unique name per practice) and per-member `ipd.*` permissions | P1 |
| I5 | Analogue order sheet: photographed paper pages, saved the moment they upload, soft removal with undo, chronological and not reorderable | P1 |
| I6 | Admission event feed attributed to the person who acted | P1 |
| I7 | A ward member's own login | **Not built** — see [ROADMAP.md](ROADMAP.md) |

### 5.6 Output
| ID | Requirement | Pri |
|---|---|---|
| X1 | Print/PDF prescription fits the page, never truncates, shows exactly what was entered | P0 |
| X2 | Page setup per doctor: size, top/bottom blank margins for a pre-printed pad, designed header (one or two sections) and footer, signature fixed at the foot, optional extra privacy page | P0 |
| X3 | Drug history is off the printed sheet by default for each visit (⊘ Hidden), printed only on request; H/O drug hypersensitivity and High-Alert Medication (R20) is always printed, in a red box after Drug history's place, not on the privacy copy | P1 |
| X4 | Gallery snapshot of every printed sheet; images and galleries downloadable as PDF | P1 |

### 5.7 Collaboration and audit
| ID | Requirement | Pri |
|---|---|---|
| C1 | Activity feed ("Notifications, Chats & Reports"): who added what, when, per practice | P1 |
| C2 | Device mirroring: a user's other open sessions follow along | P2 |
| C3 | Research companion: cohort search across the user's own patients. The API route exists; the screen is not rendered and its tab is disabled ("Coming soon") | P2 |
| C4 | Supervised tab (`message`): the patients other doctors assigned the user to supervise, each opening that patient's team chat | P1 |

### 5.8 Payment and SMS wallet
| ID | Requirement | Pri |
|---|---|---|
| B1 | **SMS wallet** per practice: whole taka, never negative, every change a ledger line; 1 taka per message counted; a send reserves its cost and refunds what did not go | P2 |
| B2 | **Settings → Payment** (right after Profile): the balance; **Renew** (the doctor's monthly subscription) and **Buy SMS** are requests to the administrator, who credits the wallet (Buy SMS) or marks the request handled (Renew) in the admin console after the payment has come in — no payment gateway exists and the app sets no prices; the requests and the SMS history. An assistant sees the balance only | P2 |

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| **Safety** | Every rule in the physician's "prime directive" (root `CLAUDE.md`; the rules by topic in [`rules/`](rules/README.md)): no invented clinical content, no silent loss, scoping, print integrity, calm UX, verify before claiming done, keep docs current |
| **Availability of work** | A reload, a patient switch or the next sign-in must not empty a visit. Each kind of visit (owner, supervised, printed) is parked in a place of its practice's own |
| **Network** | Quiet retry on flaky connections; an answer is checked to be what was asked for (a captive-portal page is not "no data"); no third-party host needed to render the UI |
| **Performance** | A read that grows with a real table is measured against a table of production size before it is called finished; screens are timed on a production build |
| **Security** | httpOnly cookies, rotating refresh, rate limits, scoped queries, magic-byte upload checks, no local upload URLs in the shared database. Weighed advisories, not counted ones |
| **Accessibility** | Keyboard route for every control, names for icon buttons, focus management for every popup, app-drawn dialogs instead of browser boxes |
| **Localisation** | Dates `dd/mm/yyyy`; recorded moments `9 Oct 2026 · 17:04`; numbers never formatted by the browser's locale; units shown exactly as written |
| **Responsiveness** | Desktop and phone; six-place mobile bar; the health-trend chart keeps its size and scrolls sideways rather than shrinking |
| **Auditability** | Clinical input is logged to the activity feed; IPD actions file an event |
| **Compatibility** | Features in the page every doctor opens must not break older browsers |

## 7. Success measures

The repository defines no product metrics. These are **proposed for the owner to accept or replace**; none has a baseline.

| Measure | Why it matters |
|---|---|
| Visits left **Incomplete** at end of day | Direct signal of lost or abandoned work |
| Prescriptions filed twice for one visit (same patient, doctor, content within 30 min) | Should be zero by construction; non-zero means the idempotency guard failed |
| Support reports of "saved but nothing persisted" | A field missing from a DTO is the usual cause |
| Time from patient chosen to Save & print | The real workflow cost |
| Cross-practice access incidents | Must be zero; the integration access suite is the gate |

## 8. Dependencies and assumptions

- A physician is available to answer clinical questions; engineering will ask rather than guess.
- One shared PostgreSQL on a VPS, reached through an SSH tunnel in development; the development database is production.
- A medicines table is loaded into the database and maintained outside the app.
- Outgoing email (SMTP) is configured; without it OTPs do not send.
- Images, permission scans and DICOM files are stored on the API server's disk.
- An SMS gateway (24bulksmsbd) is configured for the queue SMS; without it a send is refused before anything is charged.

## 9. Open product decisions (the owner's call)

Drawn from the repository's own "open threads"; none is a bug.

1. **Unowned patients.** After a doctor's account is deleted their patients are kept but cannot be found. What does "mobile number *and security access*" mean — claim by the next doctor, patient consent by OTP, or visible to all? Widening the lookup exposes personal data across practices.
2. **Ward team login.** The people and permissions exist; reaching the ward does not. It needs a narrow IPD-only access path, not an extension of the practice workstation.
3. **Typed commas in results.** What does a comma-and-space inside a number (`1, 200/cmm`) mean? Today it reads as its first part, and numbers with grouping commas are not plotted.
4. **Wide-screen health-trend names** are still cut at 20 characters; two-line names there change a chart the physician knows.
5. **Drug history Current rule** and similar visit-date rules are physician-decided; any change goes through them.
6. **Billing** — SMS purchase and the monthly subscription are now requests an administrator credits by hand (5.8). The fee, whether an unpaid subscription should do anything, and whether a payment gateway or insurance is in scope are the owner's call ([`audit/sms-and-payment.md`](audit/sms-and-payment.md)).
7. **Remaining stubs** (Research Compare/Export, Data security level): build or remove. (The Message tab once listed here is now the Supervised view, C4; [`audit/chat-and-notes.md`](audit/chat-and-notes.md) still lists it as a placeholder.)

## 10. Release criteria

A push to `main` is a production release. Before it: typecheck in all three apps, both server suites, the client suite, the browser journeys exercised at the sandbox ports, the print preview checked if the sheet changed, an independent review of the diff, fixes re-reviewed, `git show --stat` of each new commit read against its message, and a post-deploy check. What was **not** verified is stated in the report. See [ROADMAP.md](ROADMAP.md).
