# IPD: ward sheet, order sheets, wards and their teams

> **Read this before changing the code it covers.** Named in these rules: `lib/ipdClinical.ts#mergeIpdClinical`, `components/ipd/AnalogueSheetPanel.tsx`, `hooks/useWards.ts`, `lib/ipdAnalogue.ts`, `lib/rxAlerts.ts`, `ipd.service.ts#preserveAnalogueSheets`, `wards.controller.ts`, `POST /ipd/:id/analogue`, `server/CLAUDE.md`, `PATCH|DELETE /ipd/:id/analogue/:sheetId`, `POST /ipd`, `IpdDetailView`, `wardId`, `addedAt`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `client/CLAUDE.md` and `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- New per-admission data is never sent through the IPD `clinical` PATCH (it replaces the whole column): give it its own route (see `/ipd/:id/analogue`).
- What was typed is never shown as recorded before the server has it (`IpdDetailView`): it stays in its boxes until the server answers, a save clears only what it SENT, saves go one at a time.
- IPD clinical sheet is written WHOLESALE: build the payload with `mergeIpdClinical` (stored `clinical` + known fields) or an unlisted key is deleted; server also preserves `analogueSheets`.
- IPD detail offers three views with the physician's own labels (`F/U & Digital Order`, `Analogue & Digital Order`, `F/U & Analogue order`) — do not shorten them.
- IPD view: no default view; the choice lives in `localStorage` keyed by signed-in user id; an unreadable value resolves to "nothing chosen" rather than throwing.
- Hiding an IPD pane is conditional JSX, never an unmount; the clinical column's state stays in `IpdDetailView`, or a view switch silently wipes what was typed.
- Every analogue page change is written the moment it happens via the per-page `/ipd/:id/analogue` routes — never the admission's Save button.
- Analogue panel reordering is OFF (`reorderable={false}`): list order is the ward-round chronology on a medico-legal document; `addedAt` is the SERVER's.
- Analogue page removal is soft (`removedAt`/`removedBy`); Undo is a write — its bar clears only when the server confirms the restore; on failure the page returns and the bar says why.
- Clicking an analogue page opens THAT page; the panel scrolls to the newest page when it appears but never second-guesses the click.
- Analogue tiles show the WHOLE page (`size="lg"`, `fit="contain"`, 270×370 from the 400px `thumbUrl`), never cropped — a crop can hide the dose line; click opens `ImageLightbox`.
- Analogue pages upload at 2400px / q0.9 with a best-effort 400px `thumbUrl`; batch validation refuses non-images, files over 8 MB and more than 20 at once, by name, letting the rest through.
- IPD "Chief Complaints" is now labelled "Sign" (+ "Symptoms"); stored keys unchanged; a label change must also update `CONDITION_FIELDS` in `lib/rxAlerts.ts` (or alerts stop) and `allFields`.
- How it works — Wards and teams are managed in Settings → "Manage your assistants and IPD team" (`IpdTeamSection`, `hooks/useWards.ts`); a ward holds admitted patients, its team works it.
- Admit form Ward is a dropdown of the doctor's wards with "Other (type it)…", free text when none — never block admitting; only a chosen ward sends `wardId`.
- `IpdDetailView`'s header ward select sends `wardId` only when it changed, so an untouched admission's free-typed ward text is never rewritten.
- ⚕️ `IpdDetailView` borrows the editor's investigation (`beginInvBorrow`/`endInvBorrow`), pausing editor auto-save; `buildClinical` never sends `analogueSheets`.
- Known limit — Adding someone to a ward does not yet let them in (team login not built); per "Rule 2b" in `server/CLAUDE.md` it must not go through the workstation switcher.
- IPD sheet Saves: a save that did not happen is a `tell()` box; a follow-up joins the log only once the server has it; a save clears only what it SENT; one at a time (+2 more)
- How it works — `wards` models a ward (one per practice, unique name), its team `IpdTeamMember` (ward + user + `ipd.*` keys) and `IpdAdmission.wardId`.
- Every `wards.controller.ts` handler passes the signed-in user's OWN id, never `@WorkstationDoctorId()`, so an assistant cannot put anyone on a ward team.
- `POST /ipd`: `patientId` must be a patient this practice can reach (`PatientsService.get` reach), else 404 and nobody is admitted.
- `wardId` in an admission body is validated against the doctor's own wards (`resolveWard`), the real name written to `wardNo`; an unknown ward is refused, never silently dropped.
- Ward-team login is not built and must not be done by extending `WorkstationsService.resolve`; build a narrow IPD-only door in `ipd.service` returning only that ward's admissions.
- `ipd.service.ts#update` writes `clinical` verbatim, so an omitted key is DELETED: the client merges via `mergeIpdClinical`, the server keeps `preserveAnalogueSheets`.
- Known limit — IPD `clinical` has no version check: two writers silently clobber each other; still open, needs a 409 flow that does not cost the doctor their typing.
- New per-admission data does not ride the IPD `clinical` PATCH; give it its own routes that re-read in a transaction and touch exactly one entry (analogue sheets are the example).
- Analogue sheets: the server assigns `id` and `addedAt`; a clinical timestamp is never taken from a browser.
- Analogue sheet removal is SOFT (`removedAt` / `removedBy`): medico-legal documents keep their place and file.
- Every analogue operation writes an `IpdEvent` in the same transaction, attributed to the signed-in user, not the workstation's doctor.
- `assertMayEditAnalogue` deliberately does NOT require `ipd.analogue` of an assistant; any OTHER actor (future ward-team login) needs the key.

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not send new per-admission data through the IPD `clinical` PATCH. It replaces the whole column; give it its own route (see `/ipd/:id/analogue`).

- We do not show what was typed as recorded before the server has it. The IPD sheet's "Save follow up", and its top Save, moved the typed vitals into the follow-up log and emptied the boxes at the press; a save that failed — said as "Save failed", with no reason, for 2.5 s, in a colour picked by comparing the text with "Saved!" — left them in the log looking recorded, and gone with the sheet when it was closed (20/10/2026). They stay in their boxes until the server answers, the save clears only what it SENT, saves go one at a time, and a save that did not happen is a `tell()` box in the doctor's words (`IpdDetailView`, `client/CLAUDE.md`).

## Editor lifecycle (easy to break — know it)

_From `client/CLAUDE.md`._

- **The IPD clinical sheet is written WHOLESALE — build the payload with `mergeIpdClinical`.** `IpdDetailView` sends the entire `clinical` object and the server writes it verbatim, so a key this build does not list is not "left alone", it is DELETED from the patient's record with no error and nothing in the feed to notice. `lib/ipdClinical.ts` starts the payload from the admission's stored `clinical` and lays the known fields on top, which makes an unknown key mean "leave it alone". The server carries `analogueSheets` across the same seam (`ipd.service.ts#preserveAnalogueSheets`) because the client guard only protects clients that have it — an old tab still open on a ward PC, or a rollback of the build that introduced the key, would otherwise erase every photographed page on the next Save. Both halves are pinned (`ipdClinical.test.ts`, `ipd.service.spec.ts`).

## Analogue order sheet — the ward's paper sheet, photographed (2026-08-26)

_From `client/CLAUDE.md`._

`components/ipd/AnalogueSheetPanel.tsx`, stored as `IpdClinical.analogueSheets`
(`IpdAnalogueSheet[]`). The IPD detail now offers **three views** the doctor
switches between, with the physician's own labels — do not shorten them:

| Button | Left pane | Right pane |
|---|---|---|
| `F/U & Digital Order` | clinical column | Prescription (℞ pad) |
| `Analogue & Digital Order` | analogue pages | Prescription (℞ pad) |
| `F/U & Analogue order` | clinical column | analogue pages |

- **No view is the default.** With nothing chosen the page opens exactly as it
  always has and no button reads as active; the first click starts remembering.
  The choice lives in `localStorage` keyed by the **signed-in user id**, so a
  shared ward PC never hands the next doctor the previous one's layout, and any
  unreadable value resolves to "nothing chosen" rather than throwing.
- **Hiding a pane is conditional JSX, never an unmount.** The clinical column's
  state stays owned by `IpdDetailView` — move those `useState` calls into an
  extracted child and a view switch silently wipes whatever the doctor typed.
- **Every change is written the moment it happens**, through the per-page
  `/ipd/:id/analogue` routes — never the admission's Save button. A doctor who
  photographs six pages and is called away mid-round must not lose them. See
  `server/CLAUDE.md` for why those routes append rather than replace.
- **Reordering is OFF for this panel** (`reorderable={false}`). Here the list
  order IS the chronology of the ward round, and a draggable chronology on a
  medico-legal document is a way to falsify it. `addedAt` is the SERVER's for
  the same reason — ward PCs have wrong clocks.
- **Removal is soft, and Undo is a WRITE.** The entry keeps its place and gains
  `removedAt`/`removedBy`; nothing leaves disk. The Undo bar clears only when the
  server confirms the restore — on failure the page goes back into the list and
  the bar says why, the same rule the habit-suggestion `✕` follows.
- **Clicking a page opens THAT page.** The panel scrolls to the newest page when
  it appears (on a round the current order is what is wanted), but the viewer
  never second-guesses the click.
- **The page tiles are big and show the WHOLE page** (`size="lg"`, `fit="contain"`, physician's decision 2026-08-30): 270×370 instead of 96×132, and letterboxed rather than cropped. This is a handwritten document a doctor has to make out from the grid, and a cropped thumbnail can hide the very line that carries the dose. 370px tall is the most that still fits inside the 400px `thumbUrl`, so the tile is drawn from real pixels — any taller and it would upscale the thumbnail, which is a blurrier page rather than a bigger one. Clicking one opens the full-resolution page in `ImageLightbox`, which zooms to 6× and pans.
- **Pages upload at 2400px / q0.9, with a 400px `thumbUrl` beside them.** An A4
  page at the 1600px default is ~135 dpi, and `compressImage`'s own comment says
  that default was picked for printed report text, not the handwriting a
  dispenser reads. The thumbnail is best-effort: if it fails the page is still
  created and the grid falls back to `url`; if the FULL image fails there is no
  page at all. Batch validation (`lib/ipdAnalogue.ts`) refuses non-images, files
  over the server's own 8 MB limit and more than 20 at once — by name, letting
  the rest through.

**The IPD clinical sheet's own vocabulary moved with it (2026-08-15):** the list
that read "Chief Complaints" is now **"Sign"**, and a new **"Symptoms"** list sits
under it. Only the labels changed — the stored keys are still
`clinical.chiefComplaints` / `chiefComplaintsNotes` (renaming them would orphan the
signs on every open admission), with `clinical.symptoms` / `symptomsNotes` added
alongside. Two things move together with a label on this screen and are easy to
miss: `CONDITION_FIELDS` in `lib/rxAlerts.ts` (an unlisted label silently stops
firing contraindication alerts — the reason "Chief Complaints" stays in the list) and
the `allFields` map that backs `@field` cross-references in `ExpandableField`.
OPD still says "Chief complaints"; the two screens are not required to match.

## IPD wards and their teams

_From `client/CLAUDE.md`._

Managed at Settings → "Manage your assistants and IPD team", below the assistant
list (`ManageAssistantsView` → `IpdTeamSection`, data via `hooks/useWards.ts`).
A ward holds admitted patients; its team is who works it. Notes that matter:

- The admit form's Ward field is a **dropdown of the doctor's wards** once any
  exist, with an "Other (type it)…" escape and plain free text when there are
  none — a doctor who has not set wards up must never be blocked from admitting.
  Only a chosen ward sends `wardId`; the server refuses one that isn't theirs.
- `IpdDetailView`'s header ward select is how an admission recorded **before**
  the ward list existed joins a team. It sends `wardId` only when it changed, so
  an untouched admission never has its free-typed ward text rewritten.
- **⚕️ `IpdDetailView` BORROWS the editor's `investigation`/`invImages` (2026-09-29).**
  It reuses the OPD Investigation popup, so while it is mounted it holds
  `beginInvBorrow`/`endInvBorrow` from `MuqsitContext`: the OPD patient's values
  are set aside, and the editor auto-save (draft, `incompleteRx`, OPD rx-status)
  is paused. Without this the admission's findings were auto-saved into
  whichever OPD patient happened to be loaded. `buildClinical` also never sends
  `analogueSheets` — absent means "keep what is stored" on the server, while a
  stale copy would erase pages photographed since the last fetch.

**Adding someone to a ward does not yet let them in** — the team member's own
login is not built. See "Rule 2b" in `server/CLAUDE.md` for why that must not go
through the workstation switcher.

## UI conventions

_From `client/CLAUDE.md`._

_These stood under the bullet "Inline styles only" (now in `docs/rules/theme-and-colour.md`):_

  - **⚕️ The IPD sheet's two Saves say it the same way (20/10/2026).** `IpdDetailView`'s line beside Save picked its colour by comparing its text with "Saved!", said a failed save as "Save failed", with no reason, for 2.5 s, and said a refusal (a ℞ line with no medicine name) as a red line for 8 s beside Save and again beside "Save follow up". Now the line is a `SaveNoticeLine` holding its kind — `ok`, "Saved!", in green; on the page from the start, empty, inside the toolbar's spacer so it moves nothing — and every save that did not happen is a `tell()` box titled "The changes to this admission were not saved.": the refusal keeps its words (`UNWRITABLE`: "…marked in red there… Nothing typed here is lost."), a failure says `notSavedBody` — the reason in the doctor's words and "Everything you wrote is still here." "Not saved" is true of a failure: `PATCH /ipd/:id` writes the header fields and the whole `clinical` in ONE transaction (`ipd.service.ts#update`), so a save that failed wrote nothing of it. **⚕️ A follow-up joins the log only once the server has it.** Both Saves moved the typed vitals into the log and emptied the boxes at the press, so a save that failed left them in the log looking recorded — and gone with the sheet when it was closed. They stay in their boxes until the answer; then the entry is logged, with the time of the press, and the save clears only what it SENT (a box typed in while the request was on its way keeps what it holds). Saves go one at a time (`savingRef`: `isPending` is a render late, and with the vitals still in their boxes a second press would log them twice). Both refuse a ℞ line the pad cannot write BEFORE anything is sent or a box touched, as before. A sheet closed while its save was on its way (Back to ward, another tab) is not told "still here": the box says the changes are no longer on the screen and to enter them again. Pinned in `IpdDetailView.regression.test.tsx` ("what the IPD Save says"; the refusals with the real box) and `e2e/tests/ipd-save.spec.ts` (a dropped request and a 500 in a real browser, the record read through the API). **Not covered:** a save the server stored whose answer was lost is said "not saved" — pressing Save again writes the same sheet once (the whole `clinical` is replaced and the log is this screen's list), the follow-up then carrying the time of the second press. A 404 (the admission, or the ward chosen for it, no longer reachable from this practice) gets "try again in a moment", which will not help. The ward note beside Send still says "Not sent: " with the server's own words, and the admit form shows the server's message as it came.

## ⚠️ Rule 2b — an IPD team is NOT a workstation

_From `server/CLAUDE.md`._

`wards` (2026-08-15) models a ward and the team that works it: `Ward` (one per
practice, unique name), `IpdTeamMember` (ward + user + `ipd.*` permission keys),
and `IpdAdmission.wardId`.

Two things about it are load-bearing:

- **Every handler in `wards.controller.ts` passes the signed-in user's OWN id**,
  never `@WorkstationDoctorId()`. Deciding who may reach admitted patients is the
  owner's call; an assistant inside the practice must not be able to put anyone
  (least of all themselves) on a ward team. Same posture as `AssistantsController`.
- **`patientId` in an admission body must be a patient this practice can reach** (owner or supervising doctor — the reach of `PatientsService.get`), or `POST /ipd` answers 404 and admits nobody (`ipd.service.ts#create`, review 18/10/2026). It was written as sent; since that date the doctor app admits only from a patient chosen by mobile number, so every admission carries one.
- **`wardId` in an admission body is validated against the doctor's own wards**
  (`ipd.service.ts#resolveWard`) and the ward's real name is written back into
  `wardNo`. A foreign id in a request body widens access exactly like a forged
  header would; an unknown ward is refused rather than silently dropped, so the
  doctor is never left believing a ward team can see a patient it cannot.

**The remaining half — letting a team member log in and reach the ward — is NOT
built, and must not be done by extending `WorkstationsService.resolve`.** Every
patient-data controller reads `workstationDoctorId`, so the moment a ward
membership resolves to a workstation, that member has the practice's patients,
prescriptions and OPD queue too — a ward nurse would silently gain the OPD
record of someone who was never on their ward. Build a narrow IPD-only door
instead: `ipd.service` resolves ward membership itself and returns only that
ward's admissions, and nothing else in the app changes shape.

## ⚠️ Rule 2d — the IPD `clinical` column is REPLACED, so new per-admission data gets its own route

_From `server/CLAUDE.md`._

`ipd.service.ts#update` writes `dto.clinical` verbatim (`data = { ...dto }`). Two
consequences, both of which have to be designed around rather than lived with:

- **A key the client omits is DELETED**, not left alone. No error, nothing in the
  admission feed. The client builds the payload with `lib/ipdClinical.ts#mergeIpdClinical`
  (start from the stored object, lay the known fields on top), and this side keeps
  `preserveAnalogueSheets` for the case the client guard cannot cover: an old tab
  still open on a ward PC after a deploy, or a rollback of the build that introduced
  the key. Both halves are pinned in `ipd.service.spec.ts` / `ipdClinical.test.ts`.
- **Two writers silently clobber each other.** There is no version check, and the
  ward-team design means more than one person on one admission is the normal case,
  not the rare one. Still open for the clinical fields — its own issue, and it needs
  a 409 flow that does not cost the doctor their typing.

So **new per-admission data does not ride this PATCH.** The analogue (paper)
order-sheet pages are the worked example: `POST /ipd/:id/analogue`,
`PATCH|DELETE /ipd/:id/analogue/:sheetId`, `POST .../restore`. Each one re-reads the
admission inside a transaction, touches exactly one entry (or appends), and writes
`clinical` back with every other key passed through. A whole-array write would have
just relocated the clobber — two devices photographing the same sheet would
overwrite each other's pages.

Four more rules there are safety, not style:

- **The server assigns `id` and `addedAt`.** The id is the handle every per-page
  route addresses, and ward PCs have wrong clocks — a clinical timestamp is not
  something to take from a browser.
- **Removal is SOFT** (`removedAt` / `removedBy`). These are medico-legal documents:
  the entry keeps its place, the file stays on disk, and a page removed by mistake is
  recoverable long after the client's Undo bar is gone.
- **Every operation writes an `IpdEvent` in the same transaction**, attributed to the
  signed-in user (not the workstation's doctor), so the admission's own feed says who
  added or removed a page.
- **`assertMayEditAnalogue` deliberately does NOT require `ipd.analogue` of an
  assistant.** The `ipd.*` keys are ticked per `IpdTeamMember` and are kept out of the
  assistant editor on purpose (`client/CLAUDE.md`) — an assistant reaches IPD with no
  key at all. Requiring one here would revoke something they can already do on every
  other field of the same screen. The doctor and their assistants pass; any OTHER
  actor (the ward-team login, when it is built) needs the key. Real the day that door
  opens, denies nobody today.
