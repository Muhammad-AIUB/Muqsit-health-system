# Theme, colour, night mode, icons — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/theme-and-colour.md`](../rules/theme-and-colour.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Assumed: "every plus" means every ADD** — Zoom-in `+`, directory group `+` / `−` and Anaemia / Jaundice grades `+ ++ +++` left as they were; admin console not changed.
- **Assumed: buttons with words keep their words, circled plus in front** — "⊕ Add medicine"; the `+` is no longer part of the words.

**To do — engineering work that is known and not done**

- **Night mode — not looked at** — IPD admission screens and order sheets, Patient Settings, template editor, image viewer with a real photo, alert banner states, signup page: covered by the scan test, not looked at.
- **Night mode — Safari / Firefox not run** — `var()` inside SVG presentation attributes (`fill={C.…}`) confirmed in Chromium only.

**Known limits and defects, recorded on purpose**

- **Move to Rx result line in the brand's blue** — The line that says what Move to Rx did is in the brand's blue and is not a status region; the box's is green and is one.

**Closed — kept as the record of what was done or decided**

- **Night mode shipped** — Whole palette as CSS variables, dark-grey night palette (AA contrast held by a test), switch beside BAN / EN and in the mobile header, set before first paint.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### Drug history — "Move to Rx" (2026-10-14)

- [ ] Small: the line that says what Move to Rx did is in the brand's blue and
  is not a status region; the box's is green and is one.

### Night mode — ☀ / ☾ (2026-10-15)

Shipped: the doctor app's whole palette as CSS variables, a dark-grey night palette (AA contrast held by a test), the switch beside BAN / EN and in the mobile header, set before the first paint. Light mode is unchanged.

Looked at in the browser, in night mode (sandbox, Chromium):
- prescription screen, OPD, IPD, Patients, Supervised, Research, Settings;
- prescription settings with the header editor (paper);
- On examination, Investigation, Preview PDF (paper stays white);
- health-trend chart, records view, personal note;
- sign-in page, mobile layout, reload (no flash; no hydration warning).

- [ ] **Not looked at in night mode:**
  - every IPD admission screen and order sheet;
  - Patient Settings;
  - the template editor;
  - the image viewer with a real photo;
  - every alert banner state;
  - the signup page.

  The colour scan test covers their literals, but nobody has looked at them.
- [ ] **Safari / Firefox not run.** `var()` inside SVG presentation attributes (`fill={C.…}`) was confirmed in Chromium only.

### Patient photo and the circled plus (02/11/2026) - open for the physician

- [ ] **Assumed:** "every plus" means every ADD. The zoom-in `+`, a directory group's open `+` / `−` and the Anaemia / Jaundice grades `+ ++ +++` were left as they were; the admin console was not changed.
- [ ] **Assumed:** buttons with words keep their words, with the circled plus in front ("⊕ Add medicine"); the `+` is no longer part of the words.
