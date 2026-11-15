# Layout, page zoom, responsive — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/layout-and-zoom.md`](../rules/layout-and-zoom.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Left open by the 2026-10-09 and 2026-10-12 design passes** — Product call: whether the phone patient list deserves the bottom-bar place "Research" holds (+ engineering: `80vh`-`88vh` popups, touch chart date, ~24 hand-styled controls).

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

- [ ] **Left open by the 2026-10-09 and 2026-10-12 design passes** (the first is
  product, the rest engineering): on a phone the patient list is reached
  through More, not from a place of its own on the bottom bar — whether it
  deserves the place "Research" holds while that is switched off is a product
  call; a few popups still carry `80vh`-`88vh` limits, which the page zoom
  brings to 90-99% of the screen — inside it, so they were left; on a touch
  screen a point on the health-trend chart cannot show its exact date (it is a
  hover tooltip, and the line under the chart still says "hover"); about 24
  one-off controls keep hand-written styles (round × and ! buttons, the
  calendar's steppers, the print sheet's two buttons, the sign-in button) —
  none is an action button, and each is listed in FINDING-048's commit. The
  320px item is closed (FINDING-046).
