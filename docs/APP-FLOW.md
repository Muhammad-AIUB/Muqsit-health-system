# Muqsit Health System — App Flow

How a person moves through the product: the screens, the order they are reached in, and what happens at each step, including the failure paths. Screen detail is in [UI-SPEC.md](UI-SPEC.md); the words are in [DOMAIN.md](DOMAIN.md) (a glossary; the entries are in [domain/](domain/)) and the rules behind each step in [rules/](rules/README.md); the requests are in [API.md](API.md).

> Checked against the code on 2026-11-15 (`dev` @ 9be6e72). Flows with no browser test are marked **(code only)**. Names in quotes are the on-screen text.
> Not re-checked on that date: §2.1–2.4, §3.1, §3.3, §3.5–3.8 (beyond the OPD row wording), §4, §5, §7, §12 (a drift scan found nothing there; they were not read again line by line against the code).

---

## 1. Map of the app

```
                         ┌──────────────┐
                         │   /login     │◄──── logout / session lost
                         └──────┬───────┘
          new user              │ success
   ┌──────────────┐             ▼
   │   /signup    │      ┌──────────────┐
   │ form → OTP → │      │ Workstation  │  secondary account with no practice:
   │ "awaiting    │      │ gate         │  blurred card + "Log out" only
   │  approval"   │      └──────┬───────┘
   └──────────────┘             │ own practice, or an assisted one, is chosen
          │ admin approves      ▼
          └──────────►  ┌─────────────────────────────────────────────┐
                        │ Prescription · OPD · IPD · Patients ·        │
                        │ Supervised · Settings · Revision Notes       │
                        └─────────────────────────────────────────────┘
        Prescription also leads to: Patient Settings · Health monitoring ·
        Patient's prescriptions and reports · Investigation popup · On examination popup
```

| Tab | Path | Reached from |
|---|---|---|
| Prescription | `/prescription` (home; `/` redirects here) | header tab; picking any patient |
| OPD | `/opd` | header tab |
| IPD | `/ipd` | header tab; the red **CRITICAL ×N** pill |
| Patients | `/patients` | header tab (desktop); **More** card (phone) |
| Supervised | `/message` | header tab |
| Settings | `/settings`, `/settings/{assistants, profile, payment, statistics, chambers, prescription-settings, prescription-templates, favourite-settings}` | header tab; **More** (phone) |
| Revision Notes | `/revision-notes` | last header tab (desktop); **More** card (phone) |
| Patient Settings | `/patient-settings` | button under the patient header |
| Health monitoring | `/health-monitoring` | button under the patient header |
| Patient's prescriptions and reports | `/patient-records` | button under the patient header |
| Research companion | `/research` | disabled ("Coming soon"); a deep link shows "This feature isn't available on your account yet" |

Tab switches use the browser history; Back and Forward work. An unknown address shows "This page does not exist" with a "Go to Prescription" button. A screen that throws shows "This screen stopped working" with **Try again** and **Reload the page**, and says an auto-saved draft is restored on reload.

## 2. Getting in

### 2.1 Register (new user)
1. `/signup` step 1, "Create your account": photo, name, email, mobile (11 digits), profession, registration number (label follows the profession), registration certificate, NID number and both NID sides, designation, specialty, password (8+ characters with upper, lower, digit and symbol), retype. Typed fields are kept locally so a reload does not lose them.
2. **Create account** → the server makes the account `pending`, tier `secondary`, and emails a 6-digit code.
3. Step 2, "Verify your email": enter the code (5 attempts per code; **Resend code** if it expired) → **Verify email**.
4. Step 3, "Email verified": "Your account is awaiting admin approval…".
5. An administrator approves in the admin console. Until a `primary`/`premium` promotion, the user can only work as someone's assistant.

If email is not configured on the server, the code is never sent. That is configuration, not a bug.

### 2.2 Sign in
1. `/login`, "Welcome back": email or 11-digit phone, password, "Remember me" (default on; it remembers only the identifier).
2. **Sign in** → `/prescription`, or the address the user was trying to reach (kept as `mhs_post_login`).
3. Wrong credentials: "Invalid email/phone or password"; the user stays on `/login`.
4. A reload keeps the session (httpOnly cookie, `/auth/me`). The access cookie lasts 15 minutes and is renewed silently; only a definitive refusal ends the session.
5. "Forgot password?" is drawn but has no action in the code.

### 2.3 Choose a practice (workstation)
1. After sign-in the app picks the user's own practice, or the first practice they assist.
2. With two or more practices, a pill in the header opens "Your workstations". Cards read "Your workspace" or "Assistant".
3. Switching a practice: the current draft is saved, the editor and patient are cleared, the `X-Workstation` header changes, and all cached data is dropped.
4. A secondary account with no practice sees the gate: *"You are currently in secondary account holder. You can only use it as assistant…"* and **Log out**.
5. In an assistant's practice, sections they lack are drawn view-only with a 🔒 and the title "View only — you don't have access to edit this section". **Save & print** needs `rx.savePrint`.

### 2.4 Sign out
Avatar → **Log out** → `/login`. A protected address then redirects to `/login`.

### 2.5 Choose a chamber ("My Chamber")
1. A practice can have several chambers (Settings → Chambers, §9); each keeps its own OPD list, tokens, day schedule and OPD print settings. The main chamber always exists.
2. **My Chamber** (a plain select) stands right after the Prescription tab on the desktop, in the phone header (compact) and in the OPD header. Choosing one switches the OPD list to that chamber's; the list of the chamber left is never shown under the new one's name.
3. The choice is remembered per user, per practice, on this device (not mirrored). Switching practice picks that practice's own chamber in the same step.
4. A chosen chamber that was removed elsewhere goes back to the main chamber, and a box says so. If the chambers did not load, the select is disabled with "Chambers did not load".
5. Save & print uses the chamber's own print settings where it has them, else the doctor's (OPD editor only). Rules: [rules/opd.md](rules/opd.md), [rules/settings.md](rules/settings.md). Browser test: `e2e/tests/chambers.spec.ts` (two chambers, two lists, the choice kept across a reload).

## 3. The prescription visit (the core flow)

```
 mobile number ─► patient chosen / Add New ─► editor opens
        │                                          │
        │                       write: complaints… ℞ pad… advice… follow-up
        │                                          │ auto-saved every 1.2 s
        │                      ┌───────────────────┼────────────────────┐
        │                      ▼                   ▼                    ▼
        │            Save & print          Save to complete later   Preview PDF
        │                      │                   │              (desktop only)
        │      sheet + gallery PNG + complete   parked, "Incomplete"
        └──────────────────────┴───────────────────┴──► New Prescription / next patient
```

### 3.1 Choose the patient (the gate)
1. The editor is shown blurred and inert. Neither mouse nor keyboard reaches it, and **Save & print** and **Save to complete later** are disabled.
2. Type the 11-digit **Mobile** number. A dropdown shows:
   - "Searching…"
   - matching patients (name, "mobile · age · sex"), with a **Supervised** badge on a patient of another practice
   - family-tree relatives (information only), and "＋ Add person related to *name*"
   - "No patient on this number — **Add New**"
3. Pick a patient → they load. The Mobile box locks, **New Prescription** appears beside it, the editor opens, and the patient's parked visit (if any) is restored.
4. **Add New** → modal "Add new patient": mobile, name (required — "Enter the patient's name."), sex, date of birth or age (Age shows "Auto from DOB"), and an optional "Whom this number belongs to" for a number that belongs to a relative → **Save**.
5. Once loaded, name, address and Hospital ID are read-only here ("Edit from Patient Settings"). Age and Sex can be filled only when blank and are saved after 0.6 s ("Age/Sex not saved: …" on failure). Weight and Date stay editable.
6. The photo opens Patient Settings. **Keep eye on this patient** is a switch.

A patient of another practice is findable only through a supervising link. See §8.

### 3.2 Write
Left column, "Clinical assessment": Chief complaints · Previous complaints · History (with the patient's Disease and Surgical history under it) · Investigation report findings (popup) · Drug history (popup) · H/O drug hypersensitivity and High-Alert Medication · On examination (popup) · Note · Plan · Provisional diagnosis · Associated illness (BA, COPD, Hypothyroidism, CKD, CLD) · Final diagnosis (with **P.D** previous list and **•••** special advice). At the foot: "My Personal Note for This Patient".

Right column, "Prescription": template chips and "Search templates…", the **℞** heading with **Add Bulk Medicine** (+), the ℞ pad, Advice, "Advised tests / investigation" (Directory and Groups), Follow-up (number, Day/Month, **Mandatory**; with Mandatory and a number, an amber note reads "Reminder will be sent 2 days before follow-up date").

Each list field is chips: type and press Enter, or the round **+** popup ("Add items, then press Done to apply"; Cancel / Done; Suggestions, Previous diagnosis, Select all / Clear). A line can be removed ("Remove this line" with an Undo bar) or edited in place (✎ Edit).

**History — the patient's Disease and Surgical history** (under this visit's History lines; moved here from the On-examination popup). Each list has a text box, a DDMMYY date box (optional) and **Add**; an entry is written to the patient's shared history at Add, not at Save & print, and every doctor who can reach the patient sees it. × asks "Remove … from this patient's …?" (**Remove** / **Keep it**), takes it off softly, and offers Undo. A duplicate: "This is in the list already."; a failure: a box ("The history was not added." …). ⊘ Hide keeps the whole History section off this visit's printout (off by default). Needs `rx.history` to change (`PatientHistoryField.tsx`; rules: [rules/visit-sheet.md](rules/visit-sheet.md)). **(code only)**

**H/O drug hypersensitivity and High-Alert Medication** (directly after Drug history; `DrugSafetyField.tsx`). **+** adds one entry: **Medicine** (picked from the medicine list, or "Use … as typed" with no generic) with its two ticks, at least one ticked — or **Write a line**. Cancel with something typed asks "Discard what was typed?". **✎ Edit** shows the ticks, the line's box and ✕; ✕ removes softly with Undo. The list cannot be hidden and is printed in a red box; it is not a prescribing alert. If it did not load, a Try again is shown and + is off; Save & print and Preview PDF ask for it again first and, with no copy at all, ask "Print without it" / "Go back". Without `rx.drugHistory` it is shown with no + or ✎ Edit. Rules and wording: [rules/rx-alerts.md](rules/rx-alerts.md); not verified in a browser.

**The ℞ pad**
1. Type a medicine name. A dropdown searches the medicines table; for the OPD pad it can add a **Your usual** group (this doctor's own past instructions) and, on note rows, **Your usual notes**.
2. Click a suggestion → dose, food and duration fill. ✕ hides a suggestion (with Undo; "N hidden — show").
3. Dose, food and duration cells are typed (`1+0+1`, `0.5`). `>>>` adds a tapering line under a medicine. Rows can be dragged to reorder.
4. **•••** on a line opens that medicine's special advice. Ticked lines join the prescription's Advice and leave when the medicine or the tick does.
5. A medicine that meets a condition in the chart, or another current drug, lights **one blinking red sign** on the pad and shows its warning directly under its line. **Ignore Warning** hides the message only; the sign stays until the medicine is removed. Nothing here is saved or printed.
6. A dose with no medicine name above it, or a medicine with `>>>` lines and no name, is drawn red and **refused** at Save & print, Preview PDF and Save to complete later, and is held with the visit until put right.

**BAN / EN** (desktop header): phonetic Bangla typing in the named fields; the pad's dose / food / duration are written in Bangla or English as a whole. Numbers are never converted by the keyboard.

### 3.3 Investigation report findings
1. Open the field → dialog "Investigation report findings".
2. Choose a date (type `ddmmyy`, or the calendar: arrow keys move, **Enter / Space / click** chooses) — everything typed below is stamped with it, and changing it first files whatever is half typed under the old date.
3. Search a test across all categories, or pick a category tab (Favourite, Hematology, LFT / Liver, RFT / Renal, Cardiology, … Special Scores, … ECG / Drug).
4. Fill a test's boxes (two-unit boxes convert only a whole plain number), **Normal**, or "Other / free text". **Add report image** attaches a picture; **Add all reports image** uploads to a viewer on the left (zoom, rotate, open).
5. **Calculators** sit under "Special Scores" (Child-Pugh, MELD / MELD-Na, eGFR, SOFA, NEWS, GCS, NIHSS, CHA2DS2-VASc, BMI & BSA, EDD & Gestational Age and others). Radios and selects start **unselected** so nothing is answered silently. The result updates live; **Add result** writes its sentence into the findings.
6. An added result can be edited (Save / Cancel) or deleted. **Done** closes the popup.

### 3.4 On examination
Dialog "On examination": Anthropometry (height cm/ft/in, weight lb/kg, BMI auto, ideal body weight auto), Vitals (systolic / diastolic — typing `/` in systolic moves to diastolic, MAP auto, pulse, pulse note, respiratory rate, SpO2, anaemia, jaundice), Clinical findings (ascites, heart and lung auscultation, special note). **Save examination** / **Cancel**. Disease and Surgical history are no longer written here (they moved to the History row, §3.2); a visit parked before the move shows its lines read-only under "History (typed here before it moved)".

### 3.5 Save & print
1. Press **Save & print prescription**. Only one run at a time; a double press files one row.
2. The print sheet dialog opens at once with "Saving the prescription…".
3. The app builds one request and sends `POST /prescriptions`. If the patient was not created yet, it is created first.
4. **If the answer is lost** (no reply, a non-JSON success, or 502/503/504) the same request is sent again after 1, 2 and 4 seconds — four tries in all, about seven seconds. The server answers the same prescription from the last 30 minutes with the one on record, so a re-send never files a second.
5. **Success:** the sheet fills in, "Prescription saved!" shows, today's OPD row counts as **Completed**, the parked visit is cleared, and in the background a PNG of the sheet is filed into the patient's "All prescriptions" gallery (best effort; an unchanged re-save does not file it again).
6. In the dialog: **Print / Save as PDF** (also Ctrl/Cmd+P) and **Close**. The patient stays loaded.
7. **Failures, in the doctor's words:**
   - empty form → amber line "Add a medicine or some clinical detail before saving."
   - no answer through all four tries → box "The prescription may not have been saved." — pressing Save & print again, unchanged, within half an hour will not file it twice; "Everything you wrote is still here."; no sheet opens
   - a definite refusal → box "The prescription was not saved." with a reason (e.g. "Check your internet connection and try again.")
   - a prescription created but a later step failing is never called "not saved", and does not stop the visit being marked complete
8. The sheet closes with the focus on the page, not on the Save button, so a stray Enter or Space cannot file the visit twice.

### 3.6 Save to complete later; Incomplete; resume
1. **Save to complete later** (needs a patient and content; no permission needed) saves the draft, parks the visit on the patient (`incompleteRx`), and flags today's OPD row **Incomplete**. The editor clears; "Draft saved — you can complete it later."
2. The same parking happens automatically 1.2 s after typing stops and when switching patient.
3. In OPD, the row's status reads **History taken** or **Prescription pending** (derived from the parked visit; there is no longer an Incomplete pill). **Prescribe** (or **Open** in Patients) loads the patient and restores the parked visit.
4. A printed visit stays **Complete** through a reload. A change made *after* printing makes it unprinted work again (parked, **Incomplete**) until printed again or put back as printed.
5. A supervising doctor's visit is parked in their own practice's place and never touches the owner's.
6. If parking fails: box "The visit was not saved for later." and nothing is cleared.

### 3.7 Reload or crash mid-visit
On reload the app asks for the user's draft and restores the patient, pad and fields. The draft belongs to the practice it was written in and waits for that practice to be chosen. A draft is not a prescription; nothing is filed until Save & print.

### 3.8 Next patient
**New Prescription** flushes the draft, resets the editor and clears the patient (the gate closes). Choosing another patient from the header search (**Search by mobile / NID…**, up to 8 results) loads them and opens the Prescription tab.

## 4. Prescribing helpers

| Flow | Steps |
|---|---|
| **Your usual** (OPD pad only) | Type a medicine → "Your usual" group → click an instruction → dose / food / duration fill. Insertion always needs a click. Learned from completed prescriptions only; strength-exact |
| **Add Bulk Medicine** | **+** beside ℞ (greyed without `rx.medicines`) → dialog lists the doctor's own past medicines, **Popular** or **Alphabetical**, search "Search by name or generic…", ▼ for the last instructions → tick chips (arrow keys move, Space ticks) → **Add (N)**. "N added"; a line already on the pad is reported "already on ℞"; a taper goes with its medicine. Empty: "No medicines yet"; failure: "The medicine list could not be loaded." |
| **Drug history** | Open the Drug history field → tabs "Current medications (N)" (the previous visit's medicines plus today's additions) and "Distant past medication (N)" → **+ Add medicine** appends one new date-stamped line → tick rows (or Select all) → **Move to Rx (N)**. A line already on the pad is skipped: "1 added · 1 already on ℞". Esc closes |
| **℞ → Drug history mirror** | Every medicine on today's pad is recorded live in Drug history; the mirror withdraws only what it added itself, and it is stripped from the printed sheet |
| **Special advice** | **•••** on a medicine or a final diagnosis → write standing advice for "Only this medicine", or "All drugs of this group" (same generic) → it joins Advice while the trigger is present |
| **Templates** | Click a template chip → its medicines are appended |
| **Personal note** | "My Personal Note for This Patient" → Edit / Save / Print; a 🔒 sensitive toggle marks text that Print can omit. Opened *for* one patient and stays theirs until closed |
| **Total monthly approximate cost** | Header box, priced from the medicine chart for lines that can be read whole; the rest are named with a reason |

## 5. Notifications, chats and reports
Below the Save buttons, once a patient is loaded:
- **MHS is suggesting …** — live prescribing alerts (warn-coloured cards). "Prescribing check was incomplete." if some value could not be read; "Prescribing alerts are unavailable." if the check itself failed. A blank banner means *checked*, not *failed*.
- A merged feed of activity and chat (scrolls at 300 px): "Nothing yet — adds, saves & chat messages will show here with name, date & time."
- The patient chat: "Write a message… (Enter to send, Shift+Enter for newline)", attach button; "No messages yet — start the discussion below."

## 6. OPD flow
1. **OPD** tab → "OPD queue management". The header holds **My Chamber** (the list is the chosen chamber's, §2.5), the **date button** (opens the day picker), **Print Queue**, **Send SMS to all patients** and **+ Add to queue**. Cards: Total Serial, Present, Completed, Waiting ("Completed" = Done or printed; "Waiting" = present and not completed).
2. **Choose a day:** the date button opens a calendar — arrow keys move, only Enter, Space or a click chooses. **Today** is worked as below. **A later day:** patients can be added and put in order with ▲ ▼ (past the next patient still waiting); no Prescribe or Done. **A day that has passed** is shown as it was, locked: no add, no arrows, no actions, no marks (a waiting row there reads "Not marked seen").
3. **Schedule bar** (per day): Start time, Break from / to, Minutes per patient. Each row's time is worked out from the **saved** schedule, never from what is being typed; a wrong schedule is said in words before anything is sent.
4. **+ Add to queue** (button then reads **Close**) → type the 11-digit mobile → choose the patient (or **Add New**) → the patient is added at once to the day on show. Failure: "Could not add *name* to the queue. Choose them again to retry."
5. The server still gives a token (`T-01`, `T-02`…) per chamber and booked day, but the app does not show it. A patient still waiting with the prescription not yet printed keeps their visit if added again. Seen and Done, or printed, they are queued again.
6. Each row: serial (1, 2, 3 … in the order shown), photo, name, "phone · age/sex", the serial's time, the visit type when it is not New / Rx, three ticks — **Present** (with the time it was ticked), **Critically ill**, **Pt needs urgent attention** — then a status (Completed, Prescription pending, History taken or Waiting) and, for waiting rows today, **Prescribe** + **Done** (**✓ done** once done). The ticks work on today only. A marked row is coloured by its strongest mark (urgent, then critically ill, then present). Today's list is read again about every 10 s, so reception's marks on another device appear.
7. **Prescribe** loads the patient and opens the editor. Save & print counts the visit as completed; **Done** sets it done.
8. Saving a draft or printing for a patient not in the queue creates a row of type "Rx".
9. **Print Queue** opens the day's list as a printable sheet (with the saved times); it waits until the queue and the schedule have loaded.
10. **Send SMS to all patients** (off for a past day, an empty queue, or a list that is loading or failed) → choose **Bangla or English** → the server builds every message and the box shows, per patient, the number, time, exact message and SMS count, the total, the balance and the chamber ("Chamber: …") → **Send**. With too little balance: "Not enough SMS balance." and **Buy SMS** (Settings → Payment). A repeat send asks "Send again" first. If no answer comes, the box says the SMS **may** have been sent and is not sent again by itself. Results are given per patient (Sent / Failed / Not sent and why).
11. States: "Loading queue…"; "Could not load the OPD queue." with **Try again**; "No one is in the queue". Rules: [rules/opd.md](rules/opd.md), [rules/sms-and-payment.md](rules/sms-and-payment.md).

## 7. IPD flow
1. **IPD** tab → "IPD ward management". Tiles: Occupied, Critical, Discharge. **Nursing Genie** is disabled ("Soon"). A blinking **CRITICAL ×N** pill appears in the header whenever an admitted patient is Critical.
2. **+ Admit patient** → **Mobile** first → choose the patient (or **Add New**); the name is never typed. Then Bed (required), Room no, Ward (None / the doctor's wards / "Other (type it)…") or "Cabin / ward no", Floor or building, Diagnosis → **Admit**. Admit stays disabled until a patient is chosen and a bed filled, and its title says what is missing. A bed already taken: "Bed … is already occupied", values kept.
3. The board lists admissions with bed tile, name, diagnosis, ID / room / ward / floor / mobile, "Admitted *d Mon*", a status pill and select (Stable, Observation, Critical, Discharge) and **Open**. Search: "Search admitted patients by mobile number…".
4. **Open** → detail. Toolbar: **Back to ward**, the save notice, **Save**. Header: name, age, sex, admission date, mobile, Hospital ID, Ward/Cabin, Bed, Floor, "Length of stay: Day N".
5. Choose a view — **F/U & Digital Order**, **Analogue & Digital Order**, or **F/U & Analogue order**. None is chosen by default; the choice is remembered per user.
6. Clinical pane: Diagnosis, Sign, Symptoms, Investigation report findings, Procedure, **Follow Up** (BP, heart rate, temperature, oxygen saturation, urine output, fluids, blood sugar, specific note → **Save follow up**), the F/U log, Plan, Advice tests. Prescription pane: ℞ pad (with Start From).
7. **Save follow up:** the vitals join the log only once the server has them, then the boxes empty. **Save** saves everything; a success shows "Saved!" in green.
8. **A failed save:** box "The changes to this admission were not saved." with the reason and "Everything you wrote is still here."; the vitals stay in their boxes. An IPD sheet with a held `>>>` line refuses Save follow up until the Prescription line is put right.
9. **Analogue order sheet:** **Add page** (photograph the paper sheet) → each page is saved the moment it uploads → optional label ("Day 3 night…") → removal asks "Remove … from the order sheet?" and offers Undo; pages are soft-removed and cannot be reordered.
10. **Events, chat and investigation:** a timeline and "Add an event / note… (Enter to send, Shift+Enter for new line)". "No events recorded yet"; send failure "Not sent: …".
11. Wards and their teams are made in **Settings → Manage your assistants and IPD team**, with per-member `ipd.*` keys. A ward member's own login to reach the ward is **not built**.

## 8. Patients, supervision and the patient record
- **Patients** tab, "Patient Records": "Patients on your surveillance" (the watched list; "No patient is being watched") and "Your patients" with **+ New patient**. Each row has **Open** (loads the patient into the editor) and **Edit** (Patient Settings). There is deliberately no delete here.
- **Patient Settings** tabs: Patient information (a badge shows "Editing existing" or "New patient"; the form is read-only until **Edit**), "Data security level" (disabled), "Supervising doctor list", "Family tree".
- **Supervising doctor:** the owner opens Patient Settings → Supervising doctor list → "Doctor's email or mobile" (the doctor must already be registered; the owner shows as "Primary"; assistants can view, not manage). The supervisor then sees the patient in **Supervised** ("Owner: *name*"), can open the team chat, and — looking the patient up by mobile — sees a **Supervised** badge, gets a fresh prescription (never the owner's), and prescribes under their own id. Their unprinted visit is parked in their own practice's place. **(code only)**
- **Health monitoring** (`/health-monitoring`): "Integrated health monitoring and overview" — the **Health trend chart** with a time window (Last 3 months / 6 months / 1 year / All available data), columns "Lab parameters shown", "Medications shown", "Symptoms shown"; the owner can set a From/To override on a bar (drawn dashed, never rewriting the record); then "Symptoms · all visits" and "Lab tests · all visits". On a narrow screen the chart scrolls sideways.
- **Patient's prescriptions and reports** (`/patient-records`), sections in order, each **collapsed** until its arrow is pressed (the section's buttons stay): "All prescriptions(Image)", "All reports(image)", "On examination" (read-only, one card per date and author, Download), "Investigation reports summary" (**+ Add**, ✎ Edit, Download), "Drug history", "Patient's input", "Disease and surgical history", "Chief complaints history", "Diagnosis history", "Permissions", "Imaging DICOM file", and "Total summary of this patient". Rules: [rules/records-page.md](rules/records-page.md).
  - **Drug history** is a table (Drug name · Dose · Duration · Start date · End date · Total number), current medication first, sorted by date or generic. **Edit** (owner's practice, `rx.drugHistory`) puts right only a row's start date and durations: End / Total preview as "Not saved yet", **Save** writes the record at once, and a change made on another device first is refused, not overwritten; Done with unsaved changes asks. A line on today's ℞, a note or an older line is not editable, and the row says why. **Add** (needs `rx.medicines`) types like the ℞ pad with a Start date above it and writes straight to the record. How End and Total are counted is the physician's and is in [rules/drug-history.md](rules/drug-history.md).
  - **Permissions** is an image gallery of signed permissions ("Add new permissions", Download PDF). **Imaging DICOM file** lists scans (icon, name, date) with an upload box (file, name, date), Edit to remove (asks first; soft), and a press opens the in-app viewer. Adding or removing either is for the owner's practice only (an assistant needs `pt.info`); DICOM is for premium accounts only — other accounts see it blurred. **(code only)**
  - **Total summary of this patient** lists every dated record in one list, with filter chips and Newest / Oldest first, and a Download. Premium accounts only; others see it blurred with every button off.
- A patient is deleted only by the owner, with a confirmation; there is currently no screen for it.

## 9. Settings
- The Settings home lists, in order: Profile · Payment · Statistics · Your Badges… (disabled) · Add Supervisors… (disabled) · Manage your assistants and IPD team · Chambers · Prescription settings · Prescription templates · Favourite & unit settings.
- **Profile**, **Favourite & unit settings**, **Prescription templates**.
- **Payment** (`/settings/payment`): the SMS balance, then "Choose an option" — **Renew** (the doctor's monthly subscription, optional number of months) or **Buy SMS** (number of SMS, a whole number; optional amount and note). Either is a request to the administrator, who credits it in the admin console once paid; the app takes no payment and has no price list. Below: "Your requests" with their status and "SMS history". An assistant sees the balance only. Rules: [rules/sms-and-payment.md](rules/sms-and-payment.md).
- **Statistics** (`/settings/statistics`, read only; assistants may open it): two tabs. **Patient statistics** — a chamber ("All chamber total" or one chamber) and By days / By months with ‹ › to move; a bar chart (total serial and seen per day, or seen per month) that scrolls sideways on a narrow screen, the period's totals, and five overall numbers (Total visit, Average monthly visits, Average daily visits, This month's visit, Previous month visit). **Disease statistics** — the practice's final diagnoses with the number of different patients. While a period loads it says "Loading numbers…"; a failure is "Could not load the … numbers." with Try again. Rules: [rules/statistics.md](rules/statistics.md).
- **Chambers** (`/settings/chambers`): **Add chamber** (Chamber name, Address), rename and edit the address of each, **Remove** (asks first; the main chamber has none). An assistant sees it read-only. In **Prescription settings**, when the practice has more than its main chamber, the owner chooses "Settings for" General or one chamber; a chamber with none of its own starts from General, and "Use General settings" removes its own after asking. Rules: [rules/settings.md](rules/settings.md).
- **Manage your assistants and IPD team:** "Your assistants" (search by email or phone), a per-assistant permission grid (Prescription page: 14 keys; Patient settings: 4 keys), "Default access" with Reset to default / Select all / Clear; wards and ward members with `ipd.*` keys.
- **Prescription settings:** choose OPD prescription or IPD prescription ("Customize prescription" is disabled), then a four-step wizard — Page Setup (total height and width, left and right margin, **Top margin**, **Bottom margin**, inch / cm), Header Section (alignment, split into two sections), Footer Section, Body Section (separator position, per-side top margins, separator line). OPD adds a choice: "Full prescription in a single page" or "Print an extra page for patient privacy".
- Disabled ("Coming soon"): "Your Badges, Ranking, social contributions etc." and "Add Supervisors and Role models".
- **Revision Notes:** a private notebook, auto-saved 2 s after typing stops (status: Saving… / Unsaved changes / Saved · *time* / Nothing written yet), **Print**, and a search "Search a keyword (Ctrl+F)…" with ▲ ▼. If another screen saved first, **Show that version** appears and the typing stays.

## 10. Admin console (`admin/`, port 3001)
1. Admin signs in on the single page.
2. Sidebar: **Premium accounts**, **Primary accounts**, **Secondary accounts**, **Trash**, **SMS payments**, and **Log out**. Columns: Name, Contact, Status, Signed up, Actions (Trash adds Tier).
3. Actions: **Approve**, **Suspend**, **Move to Trash**, **Delete permanently**, and moving an account between tiers. Each asks first in an in-page dialog.
4. **View details** opens the account's own page in the same tab (16/11/2026): Back, then **Profile** (a print-friendly account record, saved as PDF through the browser), **Dr's patient data** (the doctor's Statistics, read only) and **Profile settings** (isolate the doctor's system, remove the MHS logo, the Point system).
5. **SMS payments:** the doctors' requests from Settings → Payment, **Pending** or **All** (Doctor, Request, Note, Date, Balance, Status). Once the payment has come in, **Add SMS** credits a Buy SMS request to the doctor's balance (1 SMS = 1 taka; a request pressed twice is credited once), **Mark done** records that a Renew was handled, **Reject** refuses. Each asks first in the page's own dialog. **(code only)**

## 11. Phone differences
- Below 768 px the phone layout is always used. Bottom bar: **Rx · OPD · IPD · Supervised · Research (disabled) · More**.
- **More** is the Settings tab; at its top, two cards lead to **Patients** and **Revision Notes**, and **More** stays lit while those are open.
- The phone header has no BAN / EN switch, no **Mirror devices** and no patient search; it does carry a compact **My Chamber**. Preview PDF is not offered.
- Wider screens show a "Layout preview" Desktop / Mobile toggle above the app; "Mobile" draws a 375 px phone mock.

## 12. States every list follows
| State | What the doctor sees |
|---|---|
| Loading | A spinner with a label ("Loading queue…", "Loading ward…") |
| Empty | An icon, a title and a hint ("No one is in the queue" · "Add the first patient of the day…") — drawn only for a list that is *here and empty* |
| Failed | A red alert with what did not load and **Try again** ("Trying again…" while retrying) — never raw server text, never "Is the API running?" |
| Offline / wrong answer | The request is still made and fails where it can be said; an answer that is not the list (empty body, a Wi-Fi sign-in page) is not read as "no data" |
| Save refused or failed | A box in the doctor's words; the line under the buttons says only what *was* saved |
| Removing something | The app's own question names the thing, the button is the verb, **Cancel** is preselected; Undo where built |

## 13. Related
[README.md](README.md) · [PRD.md](PRD.md) · [UI-SPEC.md](UI-SPEC.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [SCHEMA.md](SCHEMA.md) · [ROADMAP.md](ROADMAP.md) · [CODEMAP.md](CODEMAP.md) · [FUNCTIONAL-AUDIT.md](FUNCTIONAL-AUDIT.md)
