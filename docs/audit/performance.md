# Performance — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**To do — engineering work that is known and not done**

- **Statistics not timed on a real-sized practice** — Run only against the test database with a few rows; tens of thousands of visits and prescriptions not measured.

**Closed — kept as the record of what was done or decided**

- **Opening the box took seconds to a minute on a catalogue of real size** — Lookup made one pass (0.08 s / 0.32 s service call); production catalogue not measured; if slow, check `GET /rx-habits/all` timing; an expression index was not written.
- **A long list was slow to draw and to re-order** — 2,000 medicines: 1.9 s → 1.2 s to open, re-order 0.2–0.3 s; off-screen rows not laid out until scrolled to; list not windowed.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### Add Bulk Medicine (2026-10-13) — what it does not do, for the physician

Found on 2026-10-14 by MEASURING, after three reviews and a green suite:

- [x] **Opening the box took seconds to a minute on a catalogue of real size.**
  Every test of the generic lookup ran against the six medicines of the test
  catalogue. Against a made-up one of 35,000, a doctor with 200 medicines
  waited 5 to 7 s for the box and one with 2,000 over a minute (one `ILIKE`
  pattern per brand, each tried against every row). The lookup is one pass
  now — the service call alone takes 0.08 s and 0.32 s on the same data — and
  it is the same lookup "Your
  usual" uses, which got cheaper with it. **Not measured: the production
  catalogue itself**, which was not read. If the box is slow there, the first
  thing to look at is the API log's timing for `GET /rx-habits/all`; an index
  on the expression the lookup compares would make it instant, and is a
  manual, additive migration that was not written for this.

Timed in a browser on 2026-10-14 — Chromium, a PRODUCTION build of the client,
the test API, made-up lists against a made-up catalogue of 35,000. Every figure
is the middle one of several readings:

- [x] **A long list was slow to draw and to re-order.** With 2,000 medicines
  — the most the server sends — the box took 1.9 s from the press on + to its
  rows, 1.3 s of that drawing them, and Popular / Alphabetical about a second.
  A row out of sight is no longer laid out or painted until it is scrolled to,
  and the On ℞ marks are worked out when the list or the pad changes instead
  of at every tick: 1.2 s to open, of which the page waits 0.55–0.6 s for the
  request, and 0.2–0.3 s to re-order. With 300 medicines: 0.33 s to open
  (0.19 s of it the request) and 0.1 s to re-order. A tick is 0.02–0.06 s at
  either size. The list is not windowed: every row is in the page, and a
  journey holds that the keyboard reaches a row that was never drawn.
- [ ] **The request by itself** — asked for directly, not through the page —
  takes 0.5 s for 2,000 medicines and 0.17 s for 300, in the browser suite's
  database, with tapering lines on one medicine in nine. (The 0.08 s and
  0.32 s further up are the service call alone, without HTTP, for 200 and
  2,000 medicines with no tapering lines, in the load-test database: another
  list, and less of the work.) Where in the request the time goes was not
  taken apart; the box reads "Loading the medicine list…" meanwhile.

### Settings → Statistics (11/11/2026) - open for the physician

- [ ] **Not timed on a real-sized practice.** Written and run against the test database with a few rows; a doctor with tens of thousands of visits and prescriptions has not been measured (`server/CLAUDE.md`, `statistics`).
