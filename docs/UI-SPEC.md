# Muqsit Health System — UI Specification

The visual and interaction rules of the doctor app (`client/`) and the admin console (`admin/`): tokens, layout, components, states and accessibility. Which screen leads where is in [APP-FLOW.md](APP-FLOW.md); the safety rules behind several of these choices are in [CLAUDE.md](../CLAUDE.md) and [docs/rules/](rules/README.md) (one file per topic; colour and icons in [rules/theme-and-colour.md](rules/theme-and-colour.md)).

> Checked against the code on 2026-11-15 (`dev` @ 9be6e72); token values and routes were spot-checked against `client/src/theme/palette.ts`, `client/src/components/layout/tabs.ts` and `app/globals.css`.
> Not re-checked on that date: §1–§4, §6 (beyond the Icon list), §7.1, §7.2 (beyond the History and drug-safety blocks), §7.3, §7.5, §7.7, §7.9, §8 (beyond the drug-safety box), §9, §10 (a drift scan found nothing there; they were not read again line by line against the code). This is a description of what exists, not a redesign brief. The existing app uses inline styles against a fixed palette and has no UI framework.

---

## 1. Principles

1. **Calm clinical.** A writing surface, not a dashboard. Few colours, each with one job.
2. **Nothing hidden by a guess.** A blank safety area means "checked", never "not run". Empty, loading and error are three different drawings.
3. **Forgiving input.** `030626` is a date; `1+0+1` is a dose; a half-typed result is filed under the date it was typed for.
4. **Truth over tidiness.** Units are shown as written (`g/dL`, `µL`); test names keep the catalogue's case; numbers and dates never follow the browser's locale; a cut label is marked, and a number is never shown in part.
5. **The printout is not the screen.** The printed sheet imports no theme and is the same in both colour modes.

## 2. Colour

Every colour in the doctor app is a CSS variable from `C` (`client/src/theme/palette.ts`), written `var(--c-<hue>-<shade>, <lightHex>)`. A literal colour in a component fails `rawColours.test.ts`. Hex values below are the light-mode values.

| Hue | Job — and only this | Example shades |
|---|---|---|
| `pri` (blue, brand) | What can be pressed or is selected | 50 `#E8F0FE` · 100 `#C6DAFC` · 300 `#8AB4F8` · **400 `#1A73E8`** · 500 `#1967D2` · 600 `#185ABC` · 700 `#174EA6` · 800 `#123C80` |
| `ok` (green) | Done · normal · saved · stable | 50 100 400 600 800 |
| `warn` (amber) | Needs attention; also the ⊘ "hidden from print" mark and the Keep-eye toggle | 50 100 400 600 800 |
| `danger` (red) | Critical · contraindicated · destructive | 50 100 400 800 |
| `info` (blue-grey) | Passive information (Discharge, bed numbers, IPD badges) | 50 100 400 800 |
| `n` (cool grey) | Surfaces, borders, text. `n0` is white and `n900` is `#202124` in light mode | 0 · 50 → 900 |

**Never use the brand colour for a status.** A normal result and a Save button were once the same green. `colorOf` maps pri/ok/warn/danger/info to `{ bg: shade 50, fg: shade 600 or 800 }` for chips.

### Night mode
- Switched by `html[data-theme="dark"]`, set before first paint (`lib/themeBoot.ts`), remembered per user and per device, **not mirrored** between devices.
- Dark grey, not black (the physician's choice). The `n` scale reverses: `n0` becomes the card colour `#1F2226`, `n900` becomes the text colour.
- Extra variables: `shadow-card`, `shadow-menu`, `shadow-dialog`, `scrim`, `veil-surface`, `veil-switch`, `on-fill-chip`, `on-fill-muted`, `backdrop-print`.
- `PAPER` (white background, dark text) is the surface that stays white in both modes: rich text (the personal note, the printed header and footer), patient images, and the print sheet.
- The admin console has no night mode.

## 3. Typography

| Item | Spec |
|---|---|
| Family | DM Sans variable (weights 100–1000), **self-hosted** in `client/public/fonts/dm-sans-5.3.0/` (latin, latin-ext woff2). Fallback `'DM Sans', 'Outfit', system-ui, sans-serif`. No third-party font host — a hospital network that blocks Google turned the app to the system font once |
| Page title | 18 / 600 (`pageTitle`) |
| Dialog title | 16 / 600 (`dialogTitle`) |
| Field caption | `fieldLabel`, above its box — never the placeholder alone |
| Units and names | Exactly as the catalogue or calculator writes them; no forced upper case |
| Bangla | Phonetic (Avro-style) typing in named fields via the BAN toggle; the ℞ pad's dose / food / duration are *written* in Bangla or English as a whole |

## 4. Layout and zoom

- **The whole page is drawn at `body { zoom: 1.12 }`.** Consequences:
  - Never size with `vh` / `vw`. Pages use `.screen-fill` and `.mobile-shell-fill` (`calc(100dvh / 1.12)`); a popup takes `maxWidth` / `maxHeight: "100%"` from the padded veil it stands in.
  - A pointer travel or measured rect added to a `position: fixed` coordinate, a `translate()` or a scroll offset goes through `zoomScale()` (`lib/dropdownAnchor.ts`).
- `.app-root`: max width 1440 px, 16 px padding (0 at 767 px and below).
- **Breakpoints**

| Width | Effect |
|---|---|
| ≤ 340 px | Narrowest mobile bar; smaller pills and labels |
| ≤ 680 px | Supervised grid stacks |
| ≤ 720 px | Prescription-settings grid |
| ≤ 767 px | **Mobile shell** always used; `.form-row`, `.queue-row` |
| ≤ 820 px | Investigation popup layout |
| ≤ 860 px | Prescription editor stacks to one column |
| ≤ 1040 px | Tab icons hidden |
| ≤ 1100 px | Revision Notes layout |
| height ≤ 850 px | Investigation popup short-screen mode (`useMediaQuery`) |

- **Prescription editor (desktop):** two columns, `0.6fr` "Clinical assessment" and `1.4fr` "Prescription".
- **Never shrink a drawing that carries numbers.** The health-trend chart keeps its size and scrolls sideways on a narrow screen ("Scroll sideways for earlier dates"), opens on the newest readings, and keeps the names of its tests and medicines in place.
- **A page opened to be read is shown whole** (image viewer): the whole page at fit, no control drawn over it; arrows and the zoom bar have room of their own. Zoom up to 6×; magnifying is always the doctor's own act.

## 5. Shell

### Desktop (`layout/DesktopShell.tsx`)
- **Row 1:** "MHS+" tile and "Muqsit Health System"; then, in order: **Mirror devices** (a `role="switch"`, primary tier only), the **workstation pill** (building icon + practice name, only with 2+ practices; title "Switch workstation"), **Search by mobile / NID…** (up to 8 results), and the **avatar** menu (name, email, **Log out**).
- **Row 2** (`<nav aria-label="Main">`): Prescription (also active for Patient Settings, Health monitoring, Patient's records) · **My Chamber** (`layout/ChamberPicker.tsx`, a plain `<select>`; disabled with "Chambers did not load" when the list did not load) · OPD · **CRITICAL ×N** (blinking red pill, only when an IPD patient is Critical; opens IPD) · IPD · Patients · Supervised · Research companion (disabled, "Coming soon") · Settings · **BAN / EN** · **☀ / ☾** (`role="group"`, label "Colour mode"; "Light mode" / "Night mode") · Revision Notes.
- A strip above the shell on wide screens shows a "Synced" dot (static in the code; no logic drives it) and a "Layout preview" Desktop / Mobile toggle.

### Mobile (`layout/MobileShell.tsx`)
- Header: "MHS+" tile, current screen title (sub-views read "Patient Settings", "Health Monitoring", "Prescriptions & reports"), "Synced", **My Chamber** (compact), workstation pill, ☀ / ☾, avatar. **No** BAN / EN, **Mirror devices** or patient search.
- Bottom bar, six places: **Rx · OPD · IPD · Supervised · Research (disabled) · More**. Patients and Revision Notes are cards at the top of **More**, which stays lit while they are open.

## 6. Component library

All in `client/src/components/common/` unless noted.

| Component | Purpose and rules |
|---|---|
| `Icon` | Stroke SVG chrome icons: user, male, female, userEdit, userCheck, users, lock, eye, eyeOff, alert, mail, camera, search, sliders, activity, folder, sparkles, building, paperclip, fileText, table, download, printer, image, chevronRight, arrowLeft, star, medal, shield, bed, tool, trash, sun, moon, flask, chamber (a doctor at a desk, for "My Chamber"), calendar, plus, plusCircle, barChart. **No emoji as an icon.** Glyphs a doctor reads stay text (✎ ⊘ 💊 ★ ↺ ↳ ℞; see [rules/theme-and-colour.md](rules/theme-and-colour.md)) |
| Buttons (`theme/styles.ts`) | Sizes sm 30 / md 36 / lg 42 px min-height. Variants `btnPrimary`, `btnSecondary`, `btnTonal`, `btnDanger`, `btnDisabled`, `btnClose` |
| Inputs | `inputSm`, `inputMd`, `fieldLabel` |
| Shadows | `shadowCard`, `shadowMenu`, `shadowDialog` |
| `Loading` / `LoadError` | Spinner + label; red alert icon + title + optional detail + **Try again** ("Trying again…" while retrying) |
| `EmptyState` | Icon, title, hint. For a list that is *here and empty*; clinical suggestion lists render nothing when empty |
| `Pill` | Small rounded status chip |
| `DialogHost` | Draws `confirmAction()` and `tell()` (`lib/dialogs.ts`), replacing `window.confirm` / `alert` |
| `Lock` | View-only wrapper: 🔒 and "View only — you don't have access to edit this section"; uses `inert` |
| `HideToggle` | Amber **⊘ Hide**: keeps a field off the printout |
| `DateField` | Typed dates: `DDMMYY` or a full date; stored `dd/mm/yyyy` |
| `ExpandableField` | The chip-list clinical field: type + Enter; round **+** popup ("Add items, then press Done to apply"; Cancel / Done; Suggestions, Previous diagnosis, Select all / Clear); "Remove this line" with Undo; ✎ Edit |
| `RichTextEditor` | Bold, highlight, size, colour; HTML is sanitised wherever shown or printed |
| `ImageGallery` / `ImageLightbox` | Galleries with thumbnails; viewer with zoom, rotate, open, arrows |
| `prescription/SaveNoticeLine` | `role="status"` line under Save buttons: green = saved, amber = empty form. **Only says what was saved** |
| `prescription/MedicinePad` | The notebook-style ℞ pad: name / dose / food / duration cells, `>>>`, drag to reorder, **•••**, idle line "Start typing a medicine or note…", 10 lines before scrolling |
| `prescription/RxAlerts`, `RxPadAlerts` | Banner "MHS is suggesting …" and the per-line blinking sign + **Ignore Warning** |
| `prescription/PatientGate` | Blurs (opacity 0.5) and makes inert the editor until a patient is chosen |
| `prescription/PrintSheetModal` | The print dialog (iframe + top bar with **Print / Save as PDF** and **Close**) |

### Status-line wording rules
- A save that failed, or was refused for anything but an empty form, is a `tell()` box in the doctor's words (`whyNotSaved`), not a coloured line. Typical texts: "Check your internet connection and try again." · "The server could not save it just now. Please try again in a moment." · "Everything you wrote is still here."
- Never the raw `error.message`; never "Is the API running?"; never "not saved" for something that may be on the record.
- A kind of message keeps its colour: green saved, amber needs attention, red failed.

## 7. Screen specifications

### 7.1 Patient header (`PatientHeader.tsx`)
Row of boxes: Photo · Patient name · Age · Sex · Address · Weight · Date · Mobile · "Total monthly approximate cost" · Hospital ID. On mobile, Address moves after Date. Under it: **Patient Settings**, **Integrated health monitoring and overview**, **Patient's Prescriptions and reports**, and a **Keep eye on this patient** switch. Photo is a button to Patient Settings.

States: gate closed → editor blurred and inert, **Save & print** titled "Select a patient (enter a mobile number) first". Loaded → name / address / Hospital ID read-only ("Edit from Patient Settings"), Mobile locked, **New Prescription** shown.

### 7.2 Prescription editor
- Left "Clinical assessment" (11 chip fields, order fixed in `leftFields`) + "My Personal Note for This Patient". Two blocks sit among them (`prescription/LeftColumn.tsx`):
  - **History** (`prescription/PatientHistoryField.tsx`): under this visit's History chips, the patient's Disease history and Surgical / intervention history — a caption per list, its entries as "•" lines with a × each, then a text box, a "DDMMYY" date box and **Add**. "Loading history…"; a failed record is `LoadError` ("Could not load this patient's disease and surgical history."), never an empty list; without the key the lists read "None recorded." when empty. A `HideToggle` (⊘) for the whole History section sits at the row's top right; × asks (red **Remove** / **Keep it**) and leaves an Undo bar.
  - **H/O drug hypersensitivity and High-Alert Medication** (`prescription/DrugSafetyField.tsx`), directly after Drug history: the list's lines; a round **+** (title "Add one entry") opening a form with **Medicine** / **Write a line** segments (a medicine list, "Use … as typed (no generic name)", and the two ticks) and **✎ Edit** showing the ticks, the line box and ✕ ("Remove this entry"). No ⊘ — it cannot be hidden. Without `rx.drugHistory`: the list, no + or ✎, a 🔒 with "View only…". A failed load is `LoadError` ("Could not load this patient's drug hypersensitivity / high-alert list.") and + is off. Wording of the lines: `lib/drugSafety.ts`, rules in [rules/rx-alerts.md](rules/rx-alerts.md).
- Right "Prescription": template chips, **℞** + **Add Bulk Medicine**, ℞ pad, Advice, "Advised tests / investigation" (Directory, Groups), Follow-up.
- Buttons — desktop: **Save to complete later** (tonal), **Save & print prescription** (primary, fills the row), **Preview PDF** (secondary); mobile: first two only. **Save & print** shows "Saving…" while running; disabled without a patient or without `rx.savePrint`.
- Below: "Notifications, Chats & Reports" — alerts banner, activity + chat feed (300 px), patient chat.

### 7.3 Investigation popup
Dialog "Investigation report findings" — subtitle "Enter test results — select a category, fill values, and add". Header: **Hide reports** / **Show reports (N)**, **Add all reports image**, ×. Then: calendar with "Type date — ddmmyy"; search "Search test name across all categories..."; category tabs. Test card: **Normal**, "Add report image", value boxes with units, "Other / free text" ("Type any investigation finding..."). Calculators render inside **Special Scores** cards with unit selectors, unselected radios, a live result and **Add result**. Footer **Done**.

The calendar is one Tab stop; arrow keys move along the days and stop at the month's ends; **Enter / Space / click** chooses. Escape with the month list open closes the list, not the popup.

### 7.4 On examination popup
"On examination — Physical examination with auto-calculations". Anthropometry · Vitals · Clinical findings. **Cancel** / **Save examination**. The dated Disease / Surgical history lists moved to the sidebar's History row (§7.2); a visit parked before the move shows its lines read-only under "History (typed here before it moved)". Auto fields (BMI, ideal body weight, MAP) are shown values, not boxes; their captions do nothing when pressed.

### 7.5 Health-trend chart
SVG chart with a "Time window" select. Columns: "Lab parameters shown", "Medications shown", "Symptoms shown". Medication bars are green (`ok`). A bar the owner has moved is **dashed**, its tooltip showing both ranges. Names: on a wide screen one line cut at 20 characters; on a phone two lines with the dosage form on a small line above; names of one chart are laid out together so two different medicines never read the same; a cut is marked `…`; a strength is cut between its parts and a unit never stands beside a number it does not belong to. Empty texts: "No numeric investigation results recorded yet." · "No drugs in this patient's drug history yet." · "No symptoms recorded for this patient yet." · "No reading in this window".

### 7.6 OPD
"OPD queue management" (`tabs/OpdView.tsx`) · header: **My Chamber**, the date button (`calendar` icon, the date and "Today" / "Upcoming" / "Locked"), **Print Queue** (`printer`), **Send SMS to all patients** (`mail`), **+ Add to queue** / **Close** · the schedule bar · four cards — Total Serial (`n`), Present and Completed (`ok`), Waiting (`warn`) · rows: serial 1, 2, 3 …, photo, name, "phone · age/sex", the serial's time, a visit-type pill only when the type is not New / Rx, three ticks (Present — with its time under it, Critically ill, Pt needs urgent attention), a status word (Completed in `ok`, else Prescription pending / History taken / Waiting), ▲ ▼ for waiting rows on today or a later day, and **Prescribe** + **Done** on today (**✓ done** once done; "Not marked seen" on a past day). No token is shown. A marked row is drawn `C[tone][100]` with a 4px `C[tone][400]` bar on its left, and its grey and green text one step darker so every pair keeps AA ([rules/opd.md](rules/opd.md)); a done row is faded.
- `opd/OpdDayPicker.tsx` — a `useDialog` calendar: arrows move along the days, only Enter, Space or a click chooses; past days are marked locked.
- `opd/OpdScheduleBar.tsx` — Start time, Break from / to, Minutes per patient; disabled on a past day; remounted per day; a problem is said in words before anything is sent.
- `opd/PatientAvatar.tsx` — the stored photo, else the app's existing placeholder (the same as the prescription header's).
- `opd/OpdSmsDialog.tsx` — a `useDialog` popup: first Bangla / English, then per patient the number, time, exact message, SMS count and skip reason, the total, the balance and "Chamber: …"; **Send**, or "Not enough SMS balance." with **Buy SMS**; cannot be closed while sending; results per patient.
- Print Queue — a sheet built by `client/src/lib/opdQueueDoc.ts` (pure HTML, imports no theme, like `prescriptionDoc.ts`) and shown in `PrintSheetModal` labelled "OPD queue".

### 7.7 IPD
- Board: "IPD ward management" · **Nursing Genie** (disabled, "Soon") · **+ Admit patient** · tiles (Occupied, Critical, Discharge) · search · rows with bed tile, status pill (Stable is `ok` green and Discharge is `info`, per the colour rules; the colours of Observation and Critical were not checked for this document) and a status select.
- Detail: header fields; a view switcher (three buttons, none active by default); clinical pane; Prescription pane; **Analogue order sheet** panel; "Events, chat and investigation". The ℞ pad has a 360 px minimum height and the Start From option.

### 7.8 Patients, Supervised, Settings, Revision Notes
Patients: two cards ("Patients on your surveillance" with an "Under monitoring" tag; "Your patients" with **+ New patient**), rows with **Open** / **Edit**. Supervised: patient list left (with "Owner: *name*"), chat right ("Select a patient to open the chat."). Settings home: ten rows (two disabled, "Coming soon"), each an icon, title and one-line description (`tabs/SettingsView.tsx`); on a phone two cards above them lead to Patients and Revision Notes. Prescription settings: chooser then a four-step wizard. Revision Notes: a Word-like page with **Print** and "Search a keyword (Ctrl+F)…" with ▲ ▼; A4 pages are added as the writing runs on.

- **Payment** (`tabs/PaymentSettingsView.tsx`): "SMS balance", "Choose an option" (Renew / Buy SMS, each a request to the administrator), "Your requests", "SMS history". An assistant sees the balance only.
- **Statistics** (`tabs/StatisticsView.tsx`): a `role="tablist"` of Patient statistics / Disease statistics. `statistics/PatientStatistics.tsx` — chamber select ("All chamber total" first), By days / By months, ‹ ›; the chart `statistics/VisitBarChart.tsx` is a hand-drawn SVG (no chart library): by days a light bar (total serial, `ok[100]` with an `ok[400]` outline) and a dark one (seen, `ok[600]`) for every day of the month, by months one dark bar per month with its number above; every day or month has a tooltip. It keeps its size and scrolls sideways on a narrow screen. Under it the period's totals and five overall numbers, each with a line saying what it is over; a missing average is `—`, never 0. `statistics/DiseaseStatistics.tsx` — the final diagnoses with the number of different patients, each shown whole as written. Loading is "Loading numbers…", failure `LoadError` with Try again, chart and overall numbers failing apart ([rules/statistics.md](rules/statistics.md)).
- **Chambers** (`tabs/ChambersSettingsView.tsx`): a line pointing to **My Chamber**, an "Add chamber" card (Chamber name, Address, **+ Add chamber**), then each chamber with its name and address ("No address" when blank), editable boxes and a red **Remove** (none on the main chamber). Read-only for an assistant.

### 7.9 Auth
- **Sign in:** "Welcome back" / "Sign in to continue to your dashboard"; "Email or phone", Password with show / hide eye, "Remember me", **Sign in** ("Please wait…"), "New here? Create an account". Errors: the server's message, or "Something went wrong. Check your internet connection and try again."
- **Create account:** three steps (form → "Verify your email" with a 6-digit code and **Resend code** → "Email verified / awaiting admin approval").
- **Workstation gate:** blurred full-screen card with the secondary-account message and **Log out**.

### 7.10 Admin console (`admin/app/page.tsx`)
A single page: sign-in form, then a sidebar (**Premium accounts**, **Primary accounts**, **Secondary accounts**, **Trash**, **SMS payments**, **Log out**) and a table (Name, Contact, Status, Signed up, Actions; Trash adds Tier). Actions **Approve**, **Suspend**, **Move to Trash**, **Delete permanently**, tier moves — each confirmed in an in-page `Dialog`. `accounts/[id]` is a print-friendly account record.

**SMS payments** (`PaymentsPage` in the same file): title with the number of requests, **Pending** / **All** tabs, and a table (Doctor, Request, Note, Date, Balance, Status, actions). A pending row has **Add SMS** (Buy SMS) or **Mark done** (Renew), and a red **Reject**; each asks first in the same `Dialog`, and a failure is that `Dialog` with OK only ("Not done"). Empty: "No requests.".

### 7.11 Patient's Prescriptions & reports (`prescription/PatientRecordsView.tsx`)
Sections in order, each **collapsed** at first — the arrow (`common/CollapseToggle.tsx`) opens only the body, the section's buttons stay: "All prescriptions(Image)" and "All reports(image)" (`ImageGallery`, Download PDF) · "On examination" (read-only cards per date and author, Download) · "Investigation reports summary" (✎ Edit, **+ Add**, Download) · `prescription/RecordsHistorySections.tsx`: "Drug history", "Patient's input", "Disease and surgical history", "Chief complaints history", "Diagnosis history" · "Permissions" (`prescription/PermissionsSection.tsx`, an `ImageGallery`) · "Imaging DICOM file" (`prescription/DicomSection.tsx`: icon + name + date per scan, an upload box, Edit to remove, the in-app viewer `DicomViewer.tsx`) · "Total summary of this patient" (`prescription/TotalSummary.tsx`: filter chips, Newest / Oldest first, Download).
- **Drug history table** (`prescription/DrugHistoryTable.tsx`): columns Drug name · Dose · Duration · Start date · End date · Total number; tapering lines as "then …" rows; "Current medication" then "Earlier medication"; Sort by Date / Generic. **Edit** gives each editable row a Start date box (`DateField`) and a Duration box per line, a Save enabled only on a change, and End / Total marked "Not saved yet"; a row that cannot be edited says why. **Add** is the ℞-pad row (`AddMedicineRow`) with a Start date above it. Rules: [rules/drug-history.md](rules/drug-history.md).
- **Premium only:** Total summary and Imaging DICOM are drawn blurred with nothing pressable for other accounts — a locked view, not a hidden one ([rules/records-page.md](rules/records-page.md)).

## 8. The printed prescription (`client/src/lib/prescriptionDoc.ts`)

The printed sheet is a legal document. It is built as an HTML string and **must not be restyled with the app**.

- Own `@page`, a fit-to-page script (`--k` scale, binary-searched so content fits the page height), no toolbar. Same in both colour modes. Five accent rules carry the brand blue, written out in the file.
- Order: header band (the designed Header Section; one box or two) → patient strip (Name, Date, Age / Sex, Mobile, Weight kg, Address) → left column sections printed only when non-empty (Chief complaints · Previous complaints · History · Investigation findings · Drug history (names only) · On examination · Note · Plan · Provisional diagnosis · Associated illness · Final diagnosis; "Clinical —" placeholder if all empty) → right column (**℞**; numbered table: medicine with dose beneath, a food column only if any row has one, a duration column; notes take a serial and span the row; "No medicines added." when none; Advice; Advised tests / investigation; "Follow-up: N day/month(s) (mandatory)") → footer (brand bar, doctor's name on a signature line fixed at the foot, Footer Section HTML).
- **Page setup:** Total Height / Width, Left / Right margin, **Top margin**, **Bottom margin** (blank paper for a pre-printed pad), inch or cm. Form defaults 11 × 8.25 in, margins 0.3 / 0.2 / 1.7 / 0.8; the file's fallback with no stored layout is A4, 8.27 × 11.69 in. The Header Section prints *inside* the printable area on every page.
- **H/O drug hypersensitivity and High-Alert Medication** (`drugSafety` input): printed whenever the patient has a line, in a red box in the clinical column right after Drug history's place (whether or not Drug history prints), never on the privacy copy, and it cannot be hidden. Its styles are inline, so a sheet without it is byte-for-byte the sheet as before; its lines wrap, never cut ([rules/rx-alerts.md](rules/rx-alerts.md)).
- **Optional extra page** ("Print an extra page for patient privacy"): a masked copy — name masked (`h*s*n*`), only the last four digits of the mobile, clinical assessment and personal advice omitted.
- **Never printed:** prescribing alerts (no input exists; pinned by tests), the ℞ mirror inside Drug history, fields marked ⊘ Hide. Drug history is off by default for each visit.
- HTML in header / footer is cleaned by `sanitizeHtml` (images only from a web address or an upload).
- After any change: check the print preview, and update the snapshot test in the same commit.

## 9. Interaction rules

| Rule | Detail |
|---|---|
| Pressable | A `div`/`span` that acts uses `pressable()` (`lib/a11y.ts`): `role="button"`, `tabIndex=0`, Enter / Space; disabled → `aria-disabled` and out of the tab order |
| Names | An icon-only button has an `aria-label` |
| Popups | Every popup uses `useDialog()` — takes focus, traps Tab, Escape closes only the top one, focus returns to the opener. **Exception:** the print sheet after **Save & print** does not return focus to the button, because Enter / Space there would file the visit again. A new popup's test runs `itKeepsTheKeyboard()`; a popup that shows an `<iframe>` also listens for keys inside it |
| Inert | Set only through `useInert()` (`lib/inert.ts`) — a hand-set attribute stays on a re-used DOM node |
| Confirm | `confirmAction()` / `tell()`; Cancel is preselected; the question names the thing and the button is the verb ("Delete ward"). Fix what is being removed *before* the await and re-read after it |
| Captions | A `<label data-caption>` puts the cursor in its box; it never ticks, chooses or types. Switches such as "Mirror devices" are real buttons |
| Move vs choose | Arrow keys move; only Enter, Space or a click chooses (calendar, bulk list) |
| Focus ring | Global 2 px `pri[400]` `:focus-visible` ring; `data-focus-ring="off"` opts out |
| Motion | Reduced-motion is honoured in `globals.css` |
| Undo | Removing a line, a suggestion or an analogue page offers an Undo bar |
| Local storage | Only per-viewer conveniences (a remembered tab, a theme, a signup draft); never state that must persist |
| Dialog wording | Written for a clinician; the first sentence says what happened to the *record* |

## 10. Known UI gaps and stubs

| Item | State |
|---|---|
| Research companion | Tab disabled; `ResearchView.tsx` exists but is not rendered (Compare / Export CSV unwired) |
| "Forgot password?" | Drawn, no action |
| "Synced" dot | Static |
| Settings: Badges / Ranking; Supervisors and role models | Disabled ("Coming soon") |
| Patient Settings: "Data security level" | Disabled |
| Prescription settings: "Customize prescription" | Disabled |
| Nursing Genie (IPD) | Disabled ("Soon") |
| Mirror, BAN / EN, patient search on phone | Not offered |
| The popups "Your workstations" drawer and the secondary-account wall | Not yet `useDialog` popups |
| Wide-screen health-trend names | Cut at 20 characters; two-line names there are a pending decision |
| Admin console | No night mode; no component folder |

## 11. Related
[README.md](README.md) · [PRD.md](PRD.md) · [APP-FLOW.md](APP-FLOW.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [SCHEMA.md](SCHEMA.md) · [ROADMAP.md](ROADMAP.md) · [CODEMAP.md](CODEMAP.md) · [FUNCTIONAL-AUDIT.md](FUNCTIONAL-AUDIT.md)
