# Theme, colour, night mode, icons, fonts

> **Read this before changing the code it covers.** Named in these rules: `client/app/layout.tsx`, `client/src/components/common/Icon.tsx`, `client/src/theme/palette.ts`, `app/globals.css`, `components/common/AddCircleButton.tsx`, `components/layout/TabIcon.tsx`, `lib/theme.ts`, `lib/themeBoot.ts`, `theme/index.ts`, `prescriptionDoc.ts`, `InvestigationDownload.tsx`, `next.config.mjs`, `PatientHeader.tsx`, `tabs.ts`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- A status is never coloured with the brand colour: `C.pri` (blue) is for what can be pressed or is selected; "done / normal / saved / stable" is `C.ok` (green).
- No font, script or stylesheet the UI needs is loaded from a third-party CDN: DM Sans is in `public/fonts` of both apps, and the E2E request guard allows no outside origin.
- No emoji as an icon, and a text glyph a doctor reads (✎ ⊘ 💊 ★ ↺ ↳ ℞) is never turned into one: chrome icons are `client/src/components/common/Icon.tsx`.
- No colour is written as a literal in the doctor app (every colour is a CSS variable from `C`; `rawColours.test.ts`), and what is printed is never darkened (printouts, patient images, rich text: PAPER).
- Nothing with React in it is imported into `client/app/layout.tsx` (a server component): it fails the production build only — verify a layout change with `NEXT_DIST_DIR=.next-verify npm run build`.
- How it works — Every colour is a CSS variable from `src/theme/palette.ts` (`LIGHT`, `DARK`); `paletteCss()` goes in `<head>`; the mode is ONE attribute, `html[data-theme="dark"]`; `globals.css` keeps no copy.
- Never write a colour as a literal in a component; `rawColours.test.ts` fails on `#hex`, `rgba(` or `"white"` not on its reasoned allowlist; text on a filled colour is `C.n[0]`.
- Contrast decides night values: `contrast.test.ts` holds every drawn pair to WCAG AA in both modes; `palette.test.ts` pins LIGHT to the old hex.
- Night mode never darkens printouts (`prescriptionDoc.ts` imports no theme), patient images (never filtered or inverted) or rich text (`PAPER`).
- `app/layout.tsx` is a server component — whatever it imports must hold no React; verify a layout change with a production build; theme store `lib/theme.ts`, not mirrored (+1 more)
- Styling: inline styles only, with `C` / `font` from `@/theme` and shared styles from `@/theme/styles`; no Tailwind or CSS modules; occasional scoped `<style>` for hover/animation is OK
- Palette: `C.pri` (blue) is brand and pressable/selected, `C.ok` (green) is done/normal/saved; never `C.pri` on a status, never `C.ok` on a button; print blue is hard-coded (+1 more)
- Tabs: a chosen tab is FILLED (`tabOn`: `pri[100]` fill, `n[900]` words) and every tab is written black (`tabInk`); a tab that cannot be pressed stays `n[400]`
- Buttons and fields come from `@/theme/styles`; a button that cannot be pressed is `btnDisabled` spread last, never a lowered `opacity`; popup corner × is `btnClose` (+2 more)
- A whole card that opens something uses `className="card-press"`; a switched-off card (`aria-disabled`) does neither effect; scoped to `(hover: hover)`
- Type size: no text below 10.5px (captions, helper lines, pills 11px), except the listed sizes tied to a box, glyph or miniature; `HealthTrendsChart` writes sizes in the drawing's own units
- Icons are `components/common/Icon.tsx`; never an emoji as an icon; ✎ ⊘ 💊 ★ ↳ ▲ ▼ ✓ × ℞ ⤓ ⚠ stay TEXT — do not "tidy" them into icons
- Font is served by the app (`public/fonts/dm-sans-5.3.0/`), nothing fetched from Google; a new font file needs a new folder because `/fonts` is cached for a year
- Every "add" plus is the circled `plusCircle` (`AddCircleButton` beside fields, `PlusLabel` with words); a `+` that is not "add" (zoom-in, directory open, Anaemia/Jaundice grades) is not changed
- Navigation icons are `components/layout/TabIcon.tsx`, not the glyphs in `tabs.ts` (text fallback); below 1040px the tab icons are hidden (`.nav-ico`)
- Patient header's three view buttons share one brand-blue "selected" look (`subNav`); amber means "needs attention" and stays on the Keep-eye toggle only

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not colour a status with the brand colour. `C.pri` (blue) is for what can be pressed or is selected; "done / normal / saved / stable" is `C.ok` (green). The brand was green until 2026-10-05 and doubled as "fine" — a normal BMI and a Save button were the same colour.
- We do not load a font, a script or a stylesheet the UI needs from a third-party CDN. A hospital network that blocks Google turned the whole app to the system font; DM Sans is in `public/fonts` of both apps, and the E2E request guard allows no outside origin.
- We do not use an emoji as an icon, and we do not turn a text glyph a doctor reads (✎ ⊘ 💊 ★ ↺ ↳ ℞) into one. Chrome icons are `client/src/components/common/Icon.tsx`; the list of glyphs that stay text is in `client/CLAUDE.md`.

- We do not write a colour as a literal in the doctor app, and we do not darken what is printed. Since night mode (2026-10-15) every colour is a CSS variable from `C` (`client/src/theme/palette.ts`); a literal `#fff` stays white on a night button. `rawColours.test.ts` fails on one that is not on its allowlist with a reason. Printouts, patient images and rich text (PAPER) are the same in both modes (`client/CLAUDE.md`, Night mode).
- We do not import anything with React in it into `client/app/layout.tsx`. It is a server component, and a hook reached from it fails the production build, while typecheck and the unit suite stay green. Night mode's first cut did exactly that, and the browser pass caught it before release. A change to the layout is verified with a production build (`NEXT_DIST_DIR=.next-verify npm run build`), and `theme.test.ts` reads the layout's imports.

## Night mode — ☀ / ☾ (physician's request, 2026-10-15)

_From `client/CLAUDE.md`._

- **Every colour is a CSS variable.** `C.n[900]` is `var(--c-n-900, #202124)`. The hex lives once, in `src/theme/palette.ts`: `LIGHT` (the app as it always was) and `DARK`, the dark-grey night palette (page `#16181B`, card `#1F2226`, text `#E3E6EA`; not black, by the physician's choice). `paletteCss()` defines both, and `app/layout.tsx` puts it in `<head>`. The mode is ONE attribute: `html[data-theme="dark"]`, with no attribute meaning light. A switch re-renders nothing. Shadows and the veil are variables too (`effectVar`), deeper at night. `globals.css` uses the same `--c-*` names; it keeps no copy of the colours.
- **Never write a colour as a literal in a component.** It will not switch: white text stays white on a night button, and a white panel glares in a dark room. `src/theme/rawColours.test.ts` fails on any `#hex`, `rgba(` or `"white"` in `components/` or `lib/` that is not on its allowlist. Each allowed entry has a reason, because it must be the same in both modes:
  - the image viewer's black backdrop;
  - the rich-text colour swatches;
  - print HTML;
  - the siren glow;
  - small black shadows.
  Text on a filled colour is `C.n[0]`. At night that is dark text on a light tint, as Android draws it.
- **Contrast decides the night values, not taste.** `src/theme/contrast.test.ts` holds every pair the app draws to WCAG AA in both modes: body text, labels, chips, links, filled buttons, status text. `palette.test.ts` pins LIGHT to the old hex, colour for colour. Light mode did not move.
- **Never darkened:**
  - **Every printout.** `prescriptionDoc.ts` imports no theme; the note and investigation print HTML is its own. Pinned in `printStaysWhite.test.ts` with night mode on.
  - **Patient images**, which are never filtered or inverted.
  - **Rich text, which is PAPER.** `PAPER` in `theme/index.ts` covers the editor's surface and the personal note's saved view: a doctor's text colours are chosen for white paper and print on it.
- **The switch** is `ThemeToggle` beside BAN / EN (desktop) and in the mobile header; the store is `lib/theme.ts`, shaped like `lib/kbdLang.ts`.
  - Remembered per user per device (`mhs_theme:<userId>`), plus the device's last choice (`mhs_theme`). Not mirrored.
  - `THEME_BOOT_SCRIPT` (`lib/themeBoot.ts`) is inline in `<head>` and sets the attribute before the first paint, so night never flashes white on reload.
  - **`app/layout.tsx` is a server component: whatever it imports must hold no React.** `lib/theme.ts` imported there failed the BUILD ("needs useSyncExternalStore … only works in a Client Component"). Typecheck and the unit suite were green; the browser pass caught it. `theme.test.ts` now reads the layout's imports, and a production build (`NEXT_DIST_DIR=.next-verify npm run build`) is part of verifying a change to the layout.

## UI conventions

_From `client/CLAUDE.md`._

- **Inline styles only** with the theme palette: `import { C, font } from "@/theme"` (`C.pri/ok/warn/danger/info/n`) and the shared styles in `@/theme/styles`. No Tailwind/CSS modules; occasional scoped `<style>` blocks for hover/animation are OK.
  - **⚕️ Each hue has one job (rebrand 2026-10-05, product owner chose blue).** `C.pri` is the BRAND and anything pressable or selected — blue. `C.ok` is "done / normal / saved / stable" — green, and it holds the exact greens the app used as its brand before that date, so every chip that *meant* fine kept its colour: normal BMI in `OePopup`, OPD `Complete`/`Completed`/`✓ done`, IPD `Stable`, `Saved` messages, an `active` assistant, the ••• dots when saved advice applies, the medication bars and two lab series in `HealthTrendsChart`. **Never put `C.pri` on a status, and never put `C.ok` on a button.** When adding a three-way ternary beside `C.warn`/`C.danger`, the third branch is `C.ok`. `warn`, `danger` and `info` were not touched. **The printed prescription carries the same blue, but hard-coded:** `prescriptionDoc.ts` imports no theme on purpose (the sheet must not move when the palette is edited), so its five accent rules — `.head`, `.rx-symbol`, `.block-title`, `.followup b`, `.bb-mhs` — write `#1a73e8` / `#185abc` out (physician's decision, 2026-10-05; green before). The Investigation-summary export in `InvestigationDownload.tsx` does the same. A change to either is a change to a document handed to a patient: the snapshot in `prescriptionDoc.snap.test.ts` will go red, and print preview has to be looked at.
  - **A chosen tab is FILLED and every tab is written black (physician's sheet, 15/10/2026, item 3)** — `tabOn` (`pri[100]` fill, `n[900]` words) and `tabInk` (`n[900]`) in `@/theme/styles`, on the BAN / EN, ☀ / ☾ and Inch / cm switches, the main tabs (`DesktopShell`, and the pill of `MobileShell`'s bottom bar), Drug history's two tabs, the patient sub-tabs (`subNav`) and the Advised-tests tabs. The chosen tab was `pri[50]` with blue words beside grey ones, and the side that was on could not be told at a glance. A tab that cannot be pressed stays `n[400]`. The other segmented controls (Favourite settings' units, the IPD view switch, Investigation download, the bulk box's Popular / Alphabetical) were not on the sheet and are unchanged. Pinned in `components/layout/tabColours.test.tsx`; `n[900]` on `pri[100]` is a pair in `contrast.test.ts`.
  - **Buttons and fields come from `@/theme/styles`:** `btnPrimary(size)` (the one main action), `btnSecondary(size)`, `btnTonal(size)`, `btnDisabled` (spread last), sizes `"sm"` (inside a list row or a panel's toolbar), `"md"` (a screen's or dialog's main action) and `"lg"` (the one action a page exists for — Save & print, Create account); `inputSm` and `inputMd` (same height as an `md` button). Use them for new buttons instead of writing padding by hand — the primary button had 16 hand-written sizes and `btnBack` existed as five identical copies. Every action button is on them since 2026-10-05. **Not** on them, on purpose: chips and toggles that are not actions (the Drug-history badge, ✎ Edit beside a field, template chips, the IPD view switch) and the sign-in button. **A button that cannot be pressed is `btnDisabled`, spread last — never a lowered `opacity`** (2026-10-09): twenty buttons across fifteen files faded to 50-70% of their own colour instead (four different amounts) and three showed nothing at all — a washed-out blue Save beside a grey one on the same screen, and a faded primary button is still blue enough to be pressed twice. **The × in a popup's corner is `btnClose`** (30px, boxed, `flexShrink: 0`), with 12px kept between it and the header's text: there were two looks — a boxed × in seven popups and a bare 18px glyph in four — and the boxed one was squeezed to a 12px sliver beside a long subtitle on a phone. One filled button to a footer: in Drug history, Close is an outline while Move to Rx can be pressed. **Shadows are `shadowCard` / `shadowMenu` / `shadowDialog`** — a surface resting on the page, a list hung from a field, a popup over the veil; 27 places had written 21 different ones. Left hand-written on purpose: the image viewer's picture, the sign-in logo's glow, a dragged ℞ line's lift.

  - **A whole card that opens something is `className="card-press"`** (Settings, the prescription types, the template folders): the border takes the brand's light blue and the card lifts a little under the pointer. A card that is switched off (`aria-disabled`) does neither. Scoped to `(hover: hover)`, like the button rule.

  - **No text below 10.5px** (11.8px on screen after the zoom); captions, helper lines and pills are 11px. The exceptions are sizes tied to a box, a glyph or a miniature, where a larger number would break the box rather than help the reader: the "!" in the 15px alert disc, ticks inside checkboxes, the "MHS+" logo, the six phone tab labels, the Investigation calendar, the paper miniature and its rulers in Prescription settings, and `RichTextEditor`'s size picker. (`HealthTrendsChart` writes its sizes in the drawing's own units — 9 for a value, 10 for a name — and what that is on screen depends on how wide it is drawn; see "Health monitoring tab" for why it is no longer shrunk on a narrow screen.)
  - **Icons are `components/common/Icon.tsx`** — stroked, 24px grid, `currentColor`. Never use an emoji as an icon: the OS draws it, so it differs between Windows, Android and macOS, cannot take the disabled or active colour, and sits off the baseline. **These stay as TEXT** because a doctor reads them as part of a label and tests pin several: ✎ Edit, ⊘ Hide, 💊 on the drug-history badge, ★ on a learned phrase (a RECENT phrase is marked with a plus icon since the physician's sheet of 31/10/2026, which asked for a plus sign in place of ↺ — the circled `plusCircle` since 02/11/2026), ↳, ▲ ▼, ✓, ×, ℞, ⤓ Download PDF, ⚠ on prescribing alerts. Do not "tidy" those into icons.

  - **The font is served by the app** — `public/fonts/dm-sans-5.3.0/` + `@font-face` in `app/globals.css`; nothing is fetched from Google (the E2E request guard fails the suite if that comes back). The family is still named `"DM Sans"`. The folder name carries the version because `/fonts` is cached for a year (`next.config.mjs`): a new file needs a new folder.

  - **Every plus is the circled plus, `plusCircle` (physician, 02/11/2026: "joto jaygay plus icon ase eta hobe pluser upore round er moto").** A ring with a heavier plus in it (`Icon` takes a `[path, strokeWidth]` entry for that). The round add beside a field's label (Chief complaints and every `ExpandableField`, Investigation, H/O drug hypersensitivity, Add Bulk Medicine) is `components/common/AddCircleButton.tsx` — 20px, `hit-area`, named by its `aria-label`, no border of its own (the icon's ring is the circle); an "add" button with words is `PlusLabel` (the icon, then the words — its name is the words, `Add medicine`, no longer `+ Add medicine`); the recent-phrase marker and the Blank template card draw the icon. **Not changed, on purpose:** a `+` that is not "add" — the zoom-in beside zoom-out (`ImageLightbox`, `InvestigationPopup`), the open/close `+` / `−` of a directory group (`InvestigationDirectory`), and the Anaemia / Jaundice grades `+` `++` `+++` in On examination (clinical values); the admin console. No new colour: it takes `C.pri[400]` (`C.n[400]` when off), so night mode follows the tokens.
  - **Navigation icons are `components/layout/TabIcon.tsx`** (stroked SVG, `currentColor`), not the glyphs in `tabs.ts`, which remain as the text fallback. Below 1040px the tab icons are hidden (`.nav-ico` in `globals.css`) so seven labels and the BAN/EN switch stay on one row.
  - **The patient header's three view buttons share one "selected" look** (`subNav` in `PatientHeader.tsx`, brand blue). It was amber on Health monitoring and blue on the other two; amber means "needs attention" and stays on the Keep-eye toggle only.
