# OPD queue: Print Queue (part B)

Date: 2026-10-30. Source: the physician's sheet of 28/10/2026 ("Print Queue") and the choices made in chat on 30/10/2026. Part A (presence, urgency, status) is released; part C (SMS with a balance) is a separate spec.

## Goal

Print the serial list of the queue day that is open, so it can be handed to reception or put on a wall: who is coming, in what order, at what time.

## What is printed

- One A4 sheet (more pages if the day is long). Header: the practice doctor's name, the queue day as `dd/mm/yyyy`, and the number of patients.
- A table, rows in the serial order the screen shows: **Serial, Name, Gender, Age, Mobile, Appointment time.**
- Not printed: token, Present / Critically ill / Urgent marks, status, photo. The sheet did not ask for them.
- A missing age, gender or mobile is `—`. Nothing is filled in or guessed. Values are shown as stored (the mobile is not reformatted).
- A long name wraps to the next line; nothing is cut (root CLAUDE.md, prime directive 4).
- Any queue day can be printed, including a day that has passed: printing changes nothing.

## Appointment time

Taken from the same `slotTimes` array the screen shows, which is worked out from the day's **SAVED** schedule and never from boxes still being typed in (root CLAUDE.md: "We do not show a serial's time from a schedule box that is still being typed in"). Where the screen shows no time (a past day with no schedule of its own), the column holds `—`.

## Doctor's name

The sheet names the doctor whose practice the queue belongs to, not the signed-in user: an assistant on a workstation is signed in as themself, and `PrescriptionView`'s `user.displayName` would print the assistant's name. The implementation plan finds where the workstation's doctor is already known to the client; if it is not, that is raised with the physician and the sheet prints no name rather than a wrong one.

## Units

- `client/src/lib/opdQueueDoc.ts` (new): `buildQueueDoc({ doctorName, day, rows, times }) → string`. Pure. Every value HTML-escaped. `@page` A4; the table head repeats on each page; a row never splits across pages. Imports no theme, like `prescriptionDoc.ts`; its colours are plain greys and go on the `rawColours` allowlist with a reason.
- `PrintSheetModal` is reused (preview, Print, Escape, focus, `useDialog`). Its `aria-label="Prescription"` becomes a prop with that as the default, so the prescription's sheet is unchanged.
- `OpdView`: a "Print Queue" button beside the schedule bar, an `Icon` with an `aria-label`, disabled when the day has no patients. It builds the sheet from the rows and `times` already in the component.
- No server change, no new route, no DB change, no `docs/API.md` change.

## Errors

The sheet is built from data already loaded. Nothing is fetched on the press, so there is no loading or failure state. While the day's list is still loading or has failed, the button is disabled.

## Tests

- `opdQueueDoc.test.ts`: order is the serial order; HTML in a name or mobile is escaped; missing values are `—`; 300 rows are all present with no truncation; no time column values when `times` is empty; the count and date in the header; `@page` is A4 and the head repeats.
- `OpdView` test: the button is disabled for an empty day, opens the sheet with the rows for a day with patients, works on a locked past day, and the sheet's times are the saved schedule's, not a half-typed box's.
- The prescription's print sheet keeps its `aria-label` (existing `PrintSheetModal` tests stay green).
- The existing `rawColours` and `itKeepsTheKeyboard()` checks cover the new colours and the popup.
- Browser pass in a copy of the sources on a production build against the test API: print preview of a day with many patients, a long name, a missing age. Chromium only; other browsers are said to be not run.

## Not in this part

SMS to patients (part C). Choosing which patients to print. A PDF download. A sheet for several days.
