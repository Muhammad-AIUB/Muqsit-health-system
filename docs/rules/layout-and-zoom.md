# Layout, page zoom, responsive

> **Read this before changing the code it covers.** Named in these rules: `client/src/lib/dropdownAnchor.ts`, `app/globals.css`, `lib/useMediaQuery.ts`, `InvestigationPopup.tsx`, `MessageView.tsx`, `Muqsit.tsx`, `PrescriptionView.tsx`, `MobileShell`, `applyMirrorSnapshot`, `DesktopShell`, `effectiveView`, `LIGHTBOX_CSS`, `mirrorSnapshot`, `SettingsView`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- Nothing is sized with `vh` / `vw` in the doctor app (the page is drawn at `zoom: 1.12`): a page uses `.screen-fill` / `.mobile-shell-fill`; a popup takes `maxWidth` / `maxHeight: "100%"` from its padded veil.
- A pointer's travel or a measured rect is never added to a `position: fixed` coordinate, a `translate()` or a scroll offset without `zoomScale()` (`client/src/lib/dropdownAnchor.ts`).
- No control is drawn over a page that is open to be read: in the image viewer, at fit the whole page is on the screen with room kept for the controls (`LIGHTBOX_CSS`).
- Page zoom 1.12: no `vh`/`vw` sizing (use `.screen-fill` / `.mobile-shell-fill`; popups take limits from the veil); convert screen px with `zoomScale` / `toLayoutPx`; change the three 1.12s together
- Phone layout (`MobileShell`): More opens with a Patients card; bottom-bar places are `flex: 1 1 auto`; IPD name block 220px basis; OPD token stays at the end of the first line (+1 more)
- A short screen is its own case: at `max-height: 850px` (`useMediaQuery`, reads the window) the Investigation popup's days fold behind Days ▾; the popup takes `100%` of its veil, not `85vh`.
- `Muqsit.tsx` derives `effectiveView` from `matchMedia("(max-width: 767px)")` (phones always `MobileShell`) and must NOT mutate the mirrored `view` state.
- How it works — `MobileShell`'s `preview` prop: `true` draws the 375px bezel mock, `false` fills a real phone's viewport (`100dvh`); both render the same children.
- `DesktopShell` also serves tablets (≥768px, capped at 1440); check ~768px as well as ~375px when adding or changing a view.
- Inline styles only: `flexWrap`, `auto-fit` grids, popups `min(Npx, 100%)` with `maxWidth`/`maxHeight: "100%"`, never `vw`/`vh`; a real breakpoint uses a scoped `<style>` class.
- An absent `mobile` prop does not mean a view is exempt from responsive handling; check sibling views before assuming a new fixed-width row is fine.

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not size anything against the screen with `vh` / `vw` in the doctor app. The whole page is drawn at `zoom: 1.12`, and a viewport unit inside it is scaled too: `100vh` is 112% of the screen. The sign-in page always scrolled, and the image viewer opened a portrait order sheet with its top and bottom edges off the screen and its last line under the zoom bar. A page uses `.screen-fill` / `.mobile-shell-fill`; a popup takes `maxWidth` / `maxHeight: "100%"` from the padded veil it stands in (`client/CLAUDE.md`, the page-zoom rule; 2026-10-09).
- We do not add a pointer's travel or a measured rect to a `position: fixed` coordinate, a `translate()` or a scroll offset without `zoomScale()` (`client/src/lib/dropdownAnchor.ts`). The first two are in screen px, the others in the page's own: the medicine list hung 12% off the line being written — 54px low for a line 433px down the screen, which put it under the NEXT medicine — and a dragged sheet ran ahead of the finger holding it.

- We do not draw a control over a page that is open to be read. In the image viewer the arrows sat on a phone-wide order sheet and the zoom bar on its last line; at fit the whole page is on the screen with room kept for the controls (`LIGHTBOX_CSS`).

## UI conventions

_From `client/CLAUDE.md`._

_These stood under the bullet "Inline styles only" (now in `docs/rules/theme-and-colour.md`):_

  - **⚕️ The page is drawn at `zoom: 1.12` (`body` in `app/globals.css`), and three kinds of number do not survive it unconverted (2026-10-09).**
    - **A viewport unit is scaled with everything else.** Inside the zoomed body `100vh` is 112% of the screen, `90vh` is 100.8% and `92vw` is 103%. The sign-in page was `min-height: 100vh`: at 768px tall its document was 860px, so the first page a doctor sees always had a scrollbar and its card sat 43px below the middle. A page that is the screen takes `.screen-fill` (at least the screen) or `.mobile-shell-fill` (exactly the screen) from `globals.css`, which divide by the zoom. **A popup takes its limits from the veil it stands in, never from `vh`/`vw`:** the veil is `position: fixed; inset: 0; display: flex` with its own `padding` (that padding is the popup's margin), and the panel is `width: "min(Npx, 100%)", maxWidth: "100%", maxHeight: "100%"`. Drug history had no padding and a `95vw` limit, and ran edge to edge on a phone with its rounded corners against the glass. Viewport units that are still in the code (`80vh`…`88vh` on a few popups, the ℞ pad's `min()` caps) all come out under 100% of the screen and were left as they are.
    - **A measured box and a pointer are in SCREEN px; `position: fixed` coordinates, `translate()`, `scrollTop` / `scrollLeft` and `offsetWidth` are in the page's own.** Adding one straight to the other is 12% out. Convert with `zoomScale(el)` / `toLayoutPx()` from `lib/dropdownAnchor.ts` — read off an element that is not itself transformed; it is 1 in jsdom, so nothing changes in a unit test unless the test gives the boxes by hand (`ImageLightbox.test.tsx` does). Found unconverted and fixed: the medicine list hung 12% off its row (54px low and 51px to the right for a line 433px down the screen — under the NEXT medicine), a searched test in the Investigation popup jumped past the middle, and a dragged page ran 12% ahead of the hand in both the image viewer and the Investigation popup's report pane.
    - The divisor `1.12` is written beside `zoom` three times in `globals.css` (`body`, `.mobile-shell-fill`, `.screen-fill`) — change them together.

  - **On a phone (`MobileShell`), decided 2026-10-09:** the bottom bar has six places and Patients is not one of them, so the page that **More** opens starts with a Patients card (`SettingsView`'s `mobile` prop, passed down by `TabRouter`) and More stays lit while the patient list is open. The bar's places are `flex: 1 1 auto`, not equal: six equal places are 52px on a 360px phone and "Supervised" is 56, so it ran into "Research". A list row wraps there: the IPD row's name block has a 220px basis so the name keeps the first line (with a bare `flex: 1` it was left 50px and broke into a word a line), and the OPD row sends its visit pill and its actions to the second line (`.queue-row > .row-after`) so the token is always at the end of the first. The patient header's three view buttons are full-width rows, Address moves under Date, and the Keep-eye switch is a row with its tick at the right.

## Responsive layout

_From `client/CLAUDE.md`._

**A short screen is its own case, not only a narrow one (2026-10-15).** On a 1366×768 laptop (about 650px of window) the Investigation popup's month of days took so much height that the tests below were one row of boxes tall (physician's report). On a window `max-height: 850px` (`useMediaQuery`, `lib/useMediaQuery.ts`, which reads the window, unaffected by the page zoom), the days fold away behind a **Days ▾** button. The typed-date box, the chosen date and the ±M / ±Y / Today jumps stay in view. A tall screen is unchanged. The popup also took `maxHeight: 85vh` (95% of the screen under the zoom) and now takes `100%` of its veil, per the page-zoom rule below. Pinned in `InvestigationPopup.shortScreen.test.tsx`.

The app adapts to the real device viewport, not just the manual preview toggle:

- `Muqsit.tsx` derives `effectiveView` from `matchMedia("(max-width: 767px)")` — phones always render `MobileShell`, regardless of the manual Desktop/Mobile toggle (hidden on real phones). It does **not** mutate the shared `view` state, since `view` is part of the mirrored snapshot (`mirrorSnapshot`/`applyMirrorSnapshot` in MuqsitContext) — device mirroring must stay unaffected.
- `MobileShell` takes a `preview` prop: `true` (desktop's manual "Mobile" toggle) renders the classic 375px bezel + fake status-bar mock; `false` (a real phone) fills the viewport (`100dvh`, no bezel). Both render the same children — the mock is presentation-only.
- `DesktopShell` now also serves **tablets** (≥768px, capped at 1440 via `.app-root`), not just desktop — "not mobile" no longer means "plenty of width." Check ~768px as well as ~375px when adding or changing a view.
- Styling is inline-only, so there's no ambient CSS breakpoint. Working patterns for a new row/grid/modal: `flexWrap:"wrap"` on any row that can overflow; `gridTemplateColumns:"repeat(auto-fit,minmax(Npx,1fr))"` instead of a fixed column count; `width:"min(Npx, 100%)"` with `maxWidth` / `maxHeight: "100%"` inside a padded veil for a popup — never `vw` / `vh`, which the page zoom scales past the screen (the page-zoom rule under UI conventions). For a genuine breakpoint collapse (e.g. a 2-column layout that must become 1-column below some width — inline `style` can't express a media query), use a scoped `<style>` block with a class name, e.g. `.rxEditorGrid` in `PrescriptionView.tsx` (≤860px), `.invModal` in `InvestigationPopup.tsx` (≤820px), `.msgGrid` in `MessageView.tsx` (≤680px).
- A `mobile` prop being absent on a tab/view doesn't mean it's exempt from this — it usually means nobody's added responsive handling yet. Check how sibling views in the same tab group handle it before assuming a new fixed-width row is fine.
