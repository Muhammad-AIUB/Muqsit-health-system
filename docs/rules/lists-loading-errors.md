# Lists: loading, empty and error states

> **Read this before changing the code it covers.** Named in these rules: `components/common/ListState.tsx`, `LoadError`, `apiFetch`, `BulkMedicineModal`, `EmptyState`, `Loading`, `useBulkMedicines`, `useWorkstations`, `WorkstationGuard`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- A failed list is never shown as a line of red text: `LoadError` says what did not load and offers Try again — never the raw `error.message`, never "Is the API running?".
- "Nothing here yet" is drawn only for a list that is HERE and EMPTY: the fetch asks whatever the browser says (`networkMode: "always"`), the answer is checked to BE the list, an error is drawn before any data.
- Not every answer below 500 is the server's last word, nor its text a sentence for a doctor: a 401 is worth the quiet retry; only the 403 of `WorkstationGuard` is shown as written and not asked for again.
- Lists use `EmptyState` / `Loading` / `LoadError` (Try again); never a raw `error.message` or "Is the API running?"; clinical suggestion lists render nothing when empty or failed (+1 more)
- Reuse established patterns: Edit-mode-gated deletes with red ✕ + persistent Undo, select-then-remove galleries, silent background retry instead of error walls, disabled-with-tooltip not hidden

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not show a failed list as a line of red text. `LoadError` says what did not load and offers Try again; without it the only retry is reloading the app with a prescription half written. Never the raw `error.message`, never "Is the API running?".

- We do not draw "nothing here yet" for anything but a list that is HERE and EMPTY. "Not loading and not failed" is not "loaded": React Query does not ask at all while the browser says it is offline — nothing is fetching, nothing has failed, nothing is there — and "Add Bulk Medicine" told a doctor with years of prescriptions "No medicines yet. They appear here after you save prescriptions." So did an answer that was not the list (an empty body, a hospital Wi-Fi's sign-in page in its place), which a reader that never throws had turned into an empty list, and a failed refresh with an older list still held. The fetch asks whatever the browser says (`networkMode: "always"`) and so fails where it can be said; an answer is checked to BE the list before it is read as one; and an error is drawn before any data (`useBulkMedicines`, `BulkMedicineModal`; first review, before release). A reader that never throws needs a caller that asks what it was given.

- We do not take every answer below 500 for the server's last word, or its text for a sentence written for a doctor. For one round the box's quiet retry skipped all of them and showed their message. A 401 is what `apiFetch` gives when the session could not be renewed just then — on a bad connection the retry is what gets the list — and "Unauthorized", "Cannot GET /api/…" and "ThrottlerException: Too Many Requests" are the framework's words. One refusal is worded for a person, the 403 of `WorkstationGuard`: it alone is shown as written and not asked for again (second pass of the independent review, before release).

## UI conventions

_From `client/CLAUDE.md`._

_These stood under the bullet "Inline styles only" (now in `docs/rules/theme-and-colour.md`):_

  - **A list has four states and a component for three of them:** `EmptyState` (what is missing and how to add it), and `Loading` / `LoadError` from `components/common/ListState.tsx` (2026-10-06). `Loading` is the `.spinner` beside the words, `role="status"`. `LoadError` says WHAT did not load in the doctor's words, then the one thing they can check — "Check your internet connection and try again.", or the reason the server gave (an `ApiError` message is written for a clinician; a raw `error.message` like "Failed to fetch" is not, and is never shown) — and offers **Try again**, which refetches that list in place: before it, the only way to try again was to reload the app with a prescription half written. When a refresh fails with rows already on screen, the rows stay and the notice goes `compact` above them. Never write "Is the API running?" — a doctor does not know what the API is and cannot start it. **Not for a clinical suggestion list** ("Your usual", learned phrases): those render nothing when empty or failed, on purpose. `ImageGallery` draws its own empty box in the same style (a picture mark over the caller's `emptyText`, blue while files are held over it), because the box is also the drop target.

- Healthcare-grade interaction patterns already established — reuse them: Edit-mode-gated deletes with red round ✕ + persistent Undo bar (records page), select-then-remove galleries, scrollable capped-height summaries, sticky group headers, silent background retry instead of error walls (see `useWorkstations`), disabled-with-tooltip instead of hidden.
