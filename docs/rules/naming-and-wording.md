# Naming and wording

> **Read this before changing the code it covers.** Named in these rules: `ipd.medicines`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- How it works — The IPD ℞ panel was once headed "Order sheet"; the product owner reversed that and it now reads "Prescription".
- Nav label, IPD ℞ heading and the `ipd.medicines` permission label read "Prescription"; the permission KEY `ipd.medicines` is unchanged (renaming revokes it); mobile tab `Rx`, ids and route unchanged.
- How it works — "Order sheet" now means the ward's own PAPER sheet, photographed into the admission.

---

# The rules, in full

## Naming: "Prescription" wherever the ℞ pad appears — "order sheet" now means the PAPER one

_From `client/CLAUDE.md`._

**Reversed on 2026-08-26 by the product owner.** Until then the IPD ℞ panel was
deliberately headed "Order sheet" (chosen 2026-07-30, extended 2026-08-15) on the
argument that an order sheet directs nurses on the ward while a prescription goes
home with the patient — and this file carried a warning not to "finish" the rename
as a tidy-up. That warning did its job; the physician has now made the opposite
call, in the same document that introduced the analogue order sheet.

Today: the desktop nav label, the IPD ℞ panel heading, and the `ipd.medicines`
permission label all read **Prescription**. The permission KEY string is unchanged
(`ipd.medicines`) — renaming a key revokes it from everyone holding it. The mobile
tab stays `Rx` (a 5-tab bar at 375px has no room for more, and ℞ is universal), and
the PDF `<title>`, the tab `id`, the `/prescription` route and every code identifier
are unchanged.

**"Order sheet" is not retired — it moved.** On the ward it now means the ward's
own PAPER sheet, photographed into the admission (below). Two different things
called "order sheet" on one screen was the real confusion.
