# Forms, typing, BAN / EN, number formats

> **Read this before changing the code it covers.** Named in these rules: `client/src/lib/calculators/format.ts`, `client/src/lib/stamp.ts`, `components/layout/BanglaTyping.tsx`, `lib/banglaInput.ts`, `lib/captionFocus.ts`, `lib/rxLanguage.ts`, `globals.css`, `src/vendor/avro-phonetic/`, `fieldLabel`, `grouped()`, `BANGLA_ATTR`, `BANGLA_FIELDS`, `data-caption`, `ExpandableField`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- A form box is never named only by its placeholder: the caption stays above the box (`fieldLabel`).
- The browser is never asked to write a date, time or number without naming the locale: a timestamp goes through `client/src/lib/stamp.ts`, a calculator's number through `grouped()`.
- A listener on the whole document never guesses what an element is for: a caption that puts the cursor in its box is a `<label data-caption>`, and a thing that is pressed is a `<button>`.
- Entered clinical values: never round, reformat or "normalize" one; display exactly what the doctor typed.
- BAN/EN typing uses Avro Phonetic's rule table, vendored unmodified but for one `export` in `src/vendor/avro-phonetic/` (MPL-1.1) — keep the header and licence file; engine `lib/banglaInput.ts`.
- Only physician-named fields convert (`BANGLA_FIELDS`, `data-bangla="on"`; NOT the ℞ pad — it is always English, 2026-11-23); others type English with a notice; medicine NAME box excluded; widening is a product decision.
- ⚕️ The BAN keyboard never converts a number: digits, `+`, `/`, `-` pass through as typed (`0.5` never `০।৫`); `.` becomes `।` only straight after a Bangla letter.
- How it works — In BAN mode the food/duration shorthand becomes Bangla letters (`am` → `আম`, not "After meal") and units convert too; switch to EN for either.
- BAN conversion is ONE document-level capture-phase `keydown` listener writing via the native value setter + an `input` event; no field holds Bangla state of its own.
- How it works — BAN/EN choice is remembered per user on this device (`mhs_kbd_lang:<userId>`), logout returns to EN; not mirrored; not offered in `MobileShell`.
- A form being read is `<fieldset disabled className="read-form">`; locked is shown by grey boxes, never by fading the patient's details; an empty locked box needs its own placeholder rule
- System timestamps go through `lib/stamp.ts`, never `toLocaleString()` / `toLocaleDateString()`; a calculator's NUMBER goes through `grouped()` (it is filed as the finding and prints)
- A form box keeps a caption above it (`fieldLabel`) matching its `aria-label`, never a placeholder as its name; a caption must SAY so (`<label data-caption>`) to focus its box (+3 more)
- The `+` beside each clinical field is `className="hit-area"` (margin exactly its 28px row); never put it on a × at the end of a list line

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not name a form box only by its placeholder. The caption stays above the box (`fieldLabel`); on the admit form Bed, Room no and Cabin / ward no were three numbers in a row with nothing left to say which was which.

- We do not ask the browser to write a date, a time or a number without naming the locale (`toLocaleString()`, `toLocaleDateString()`). It answers in the machine's own language and order: `10/9/2026` for the 9th of October beside this app's `09/10/2026`, three different orders on two ward screens, and an absolute neutrophil count of 1500 written `1.500` in a German browser. A timestamp goes through `client/src/lib/stamp.ts` (`9 Oct 2026 · 17:04`), a calculator's number through `grouped()` (`client/src/lib/calculators/format.ts`); the admin console has `stamp()` / `ddmmyyyy()` of its own.

- We do not let a listener on the whole document guess what an element is for. A caption that puts the cursor in its box is a `<label data-caption>`; the first rule was "any label with no control in it", and "Mirror devices" — a switch drawn as a label — sent the cursor into the patient search on every press. An element opts in by saying what it is, and a thing that is pressed is a `<button>`.

## ⚕️ Clinical-accuracy rules specific to the client

_From `client/CLAUDE.md`._

- **Never round, reformat, or "normalize" an entered clinical value.** Display exactly what the doctor typed.

## BAN / EN — phonetic Bangla typing (2026-09-23)

_From `client/CLAUDE.md`._

A `BAN | EN` switch at the end of the desktop tab row, beside Settings (`components/layout/BanglaTyping.tsx`). In BAN a doctor types the SOUND of a word on an ordinary keyboard — `khabar por` — and it becomes `খাবার পর` as they type, by **Avro Phonetic's own rule table** (vendored unmodified but for one `export` line at `src/vendor/avro-phonetic/`, **MPL-1.1** — keep the header and the licence file beside it). The engine is pure (`lib/banglaInput.ts`) and pinned in `banglaInput.test.ts`; the wiring in `BanglaTyping.test.tsx`.

- **Only the fields the physician named convert:** Chief complaints, Previous complaints (the note box), Note, Plan, Advice (`BANGLA_FIELDS`), and the OPD ℞ pad's dose / food / duration (`MedicinePad`'s `bangla` prop, passed by `RightColumn` only). A field opts in with `data-bangla="on"` (`BANGLA_ATTR`); `ExpandableField`'s `bangla` prop puts it on the popup box, the in-place edit boxes and the per-item note box. **Everything else types English in BAN mode and shows a notice** (once per visit to the field) — a medicine search, a date or a mobile number typed in Bangla would silently find nothing. The medicine NAME box is deliberately excluded: it is a search. Widening the list is a product decision.
- **⚕️ The keyboard never converts a number.** Only letters (plus Avro's `` ` `` and `^`) feed the phonetic buffer; digits, `+`, `/`, `-` pass through as typed. Avro itself turns digits Bangla and `.` into the dari — which would turn a half-tablet `0.5` into `০।৫`. So `1+0+1` and `0.5` are typed exactly as keyed, and the dose shorthand (`101` → `1+0+1`) still works in BAN mode. `.` becomes `।` only straight after a Bangla letter. (The ℞ cells' digits ARE written in Bangla since 2026-10-14 — on commit, by `lib/rxLanguage.ts`, never by the keyboard, and the point stays a point; next bullet.)

- **Food/duration shorthand is English letters**, so in BAN mode `am` becomes `আম`, not "After meal" — the doctor sees it immediately. Units (`ml`) convert too. Switch to EN for either.
- The handler is ONE document-level **capture-phase** `keydown` listener: the conversion must land before a field's own Enter handler reads the value. It writes through the native value setter plus an `input` event, so each field's own `onChange` stays the source of truth — no field holds Bangla state of its own.

- The choice is remembered per signed-in user on this device (`mhs_kbd_lang:<userId>`), like the IPD view; logout returns to EN. Not mirrored across devices, and not offered in `MobileShell` (a phone's own keyboard already types Bangla).

## UI conventions

_From `client/CLAUDE.md`._

_These stood under the bullet "Inline styles only" (now in `docs/rules/theme-and-colour.md`):_

  - **A form that is being read, not edited, is `<fieldset disabled className="read-form">`** (`globals.css`; Patient information is the first). Locked is shown by the boxes — grey, like the locked boxes of the patient header — never by fading the patient's own details, which are read from that screen far more often than they are changed. `-webkit-text-fill-color` is what stops the browser greying a disabled box's text, and an EMPTY locked box needs its own placeholder rule, or `01XXXXXXXXX` would stand in it in the same ink as a recorded mobile number.

  - **A moment the SYSTEM recorded is written by `lib/stamp.ts`** — `dayMonth()` `9 Oct`, `dayMonthYear()` `9 Oct 2026`, `stamp()` `9 Oct 2026 · 17:04` — never by `toLocaleString()` / `toLocaleDateString()`. Four screens asked the browser, in the browser's own language: one machine showed `Oct 9`, `Oct 9, 2026` and `9 Oct 2026 · 17:04` on two ward screens, and the personal note's `Last saved 10/9/2026` is the 10th of September to anyone used to this app's `dd/mm/yyyy`. (A date a doctor TYPES is still `dd/mm/yyyy` through `dateInput.ts`; this is only for timestamps.) **⚕️ A calculator's NUMBER goes through `grouped()` (`lib/calculators/format.ts`), never a bare `toLocaleString()` (2026-10-12).** Five calculators left the locale out, so `ANC 1,500 cells/µL` was `1.500` in a German browser — one and a half, to an English reader — and `১,৫০০` in a Bangla one. `grouped()` names the locale, which keeps the text every result was written and checked with; `number-format.test.ts` runs the five against a browser pretending to be German, French, Bangla, Arabic and Indian-English. This is about the RECORD, not only the screen: "Add result" files the calculator's sentence as the finding, and it prints — so a German or a Bangla browser was writing `1.500` or `১,৫০০` into a patient's findings. One kind of browser did see its text move: Indian English grouped a count of 100,000 or more the lakh way (`1,50,000`) and now writes `150,000`; of the five calculators only a very high ANC reaches that. US, UK and Australian English are unchanged at any size.

  - **A form box keeps a caption above it (`fieldLabel`), with the same words as its `aria-label` — a placeholder is an example, never the name (2026-10-06).** The OPD queue form and the IPD admit form named their boxes only by placeholder: Hospital id, Bed, Room no and Cabin / ward no in one row, and once three held a number nothing said which was which. A captioned row is `className="form-row"` with the submit button in a `form-submit` cell under a blank caption: on a wide screen it stands level with the boxes, and on a phone (`globals.css`) the boxes share out each wrapped line and the button becomes a full-width bar. Mark required boxes (`Patient name *`). Do not wrap `PatientMobileLookup` in a `<label>` — it contains buttons and a modal, and a label forwards every click inside it to its first control; pass its `label` prop. **Pressing a caption puts the cursor in its box (2026-10-12, `lib/captionFocus.ts`, mounted once in `Providers`).** A caption is a `<label data-caption>` carrying the caption style (`fieldLabel`, `oeLbl`, `piLbl`, …) written STRAIGHT before its box, with no control inside it and no `for`; the one listener moves the cursor to that box, or to the first one inside the element after it (a date box and the mobile lookup wrap theirs). It only ever moves the cursor — it never ticks, chooses or types — and it leaves alone a caption over a value that is merely shown (BMI), a box that cannot be typed in (disabled, read-only, in a locked `fieldset`, behind the patient gate) and anything further along the row. **⚕️ The label has to SAY it is a caption (`data-caption`); a new caption written without the mark simply does not get the shortcut.** The first rule was "any label with no control of its own", and one label in the app was not a caption: "Mirror devices" in the header was a switch drawn as a `<label onClick>`, and every press on it also sent the cursor into the patient search beside it, which reopened its list and, on a tablet, raised the keyboard (caught in review, before release). A listener on the whole document must not guess what an element is for. `MirrorToggle` is a `<button role="switch">` now, like Keep-eye — which also gave it the keyboard route a label never had. Not a `for`/`id` pair on each box, because `for` on a tick box toggles it; not a caption that wraps its box, for the trap above. A caption style without a `display` of its own needs `display: "block"` — a `<label>` is inline, and inline it sits beside its box instead of over it. Pinned in `captionFocus.test.ts`.
  - **The `+` beside each clinical field is `className="hit-area"`** (`globals.css`): drawn 20px, pressed over about 34×31px on screen. The margin is exactly the room its own 28px row has — at 7px up and down, measured in the browser, the `+` of Note and the `+` of Plan each took presses meant for the other. **Never put it on a × at the end of a list line:** any margin there reaches the line above or the text beside it, and a press meant for one line must not take off its neighbour.
