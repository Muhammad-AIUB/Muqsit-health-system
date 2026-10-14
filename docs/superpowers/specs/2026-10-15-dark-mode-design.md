# Night mode for the doctor app — design

Date: 2026-10-15. Asked by the product owner (a physician): a colour option for the
whole app, switched by a toggle, dark enough to work at night and easy on the eyes.

## Decisions taken with the physician

- **Dark grey, not black.** Page `#16181B`, cards `#1F2226`, text a soft white
  `#E3E6EA`. Pure black with white text glares at night and makes text look like it
  is shimmering.
- **The doctor app only** (`client/`, :3000). The admin console (`admin/`, :3001) is a
  separate app with its own colours and is left for later.
- **A ☀ / ☾ toggle in the header, beside BAN / EN. It starts in light mode.** It is
  remembered per user per device, like BAN / EN, and it is not mirrored to other
  devices.

## Approach: the palette becomes CSS variables

Every colour in the app comes from `C` (`client/src/theme/index.ts`): 1,117 uses in
69 files, all of them inline styles. Each `C` entry becomes a CSS variable carrying
today's value as its fallback:

```ts
n: { 900: "var(--c-n-900, #202124)", … }
```

`app/globals.css` defines the variables twice:

- under `:root` with today's values, so light mode is **unchanged, pixel for pixel**;
- under `html[data-theme="dark"]` with the night palette.

Switching a mode sets one attribute on `<html>`. React does not re-render anything,
and every inline style switches at once. `color-scheme: dark` is set in dark mode, so
the browser's own controls (scrollbars, date pickers, checkboxes) are drawn dark too.

Rejected:

- **Two palettes swapped through React.** All 69 importers would have to read `C`
  through a hook, and the switch would re-render the whole app and flash.
- **`filter: invert()` on the page.** It also inverts patient photos, scans and
  reports, and turns the red of a danger alert cyan. That is unsafe for a clinical
  record.

## The night palette

Each hue keeps its one job (the rule at the top of `theme/index.ts`): blue is
pressable or selected, green is fine or done, amber needs attention, red is danger.
Only the shade changes, to a softer one for a dark background.

| token | light (today) | night |
|---|---|---|
| n 0 (surfaces, cards) | #FFF | #1F2226 |
| n 50 | #F8F9FA | #1B1D21 |
| n 100 (page) | #F1F3F4 | #16181B |
| n 200 (rules, borders) | #E3E6EA | #33373C |
| n 300 | #CDD1D6 | #464B51 |
| n 400 | #8E949A | #80868C |
| n 500 | #6B7075 | #9AA0A6 |
| n 600 | #565A5F | #AEB4BA |
| n 700 | #44474A | #C4C9CE |
| n 800 | #303438 | #D6DADE |
| n 900 (body text) | #202124 | #E3E6EA |
| pri 50 / 100 / 300 | #E8F0FE / #C6DAFC / #8AB4F8 | #1B2A44 / #24395C / #4F7BC4 |
| pri 400 / 500 / 600 / 700 / 800 | #1A73E8 … #123C80 | #8AB4F8 / #9EC1FA / #A8C7FA / #C2D7FB / #D3E3FD |
| ok 50 / 100 / 400 / 600 / 800 | #E1F5EE … #085041 | #12322A / #1E5A48 / #5DCAA5 / #7FD9B9 / #A7E8D0 |
| warn 50 / 100 / 400 / 600 / 800 | #FAEEDA … #854F0B | #3A2C12 / #6B4E1C / #F2B65A / #F5C47A / #F8D49C |
| danger 50 / 100 / 400 / 800 | #FCEBEB … #A32D2D | #3D1C1C / #6E2E2E / #F28B82 / #F6AEA9 |
| info 50 / 100 / 400 / 800 | #E6F1FB … #185FA5 | #172C40 / #234A6B / #7AB4EE / #A9CDF4 |

These are the starting values. **What decides them is a contrast test:** every pair
the app actually draws must reach WCAG AA 4.5:1 in both modes, and the test fails
otherwise. The pairs include body text on the page and on a card, secondary text
(`n 500` / `n 600`) on a card, each chip's `fg` on its `bg` (`colorOf`), and button
text on each filled button. A value is changed until its pairs pass, and only then.

Filled buttons follow from this. `btnPrimary` draws `C.n[0]` text on `C.pri[400]`, so
at night it is dark text on a light blue (`#1F2226` on `#8AB4F8`). That is the same
convention Android's dark theme uses, and it reads better than white on a dark blue.

Shadows barely show on a dark page. `shadowCard`, `shadowMenu` and `shadowDialog`
(`theme/styles.ts`) become variables too, darker at night, and a dialog keeps a 1px
`n 200` edge so it stays distinct from the veil. `scrim` stays a dark veil in both modes.

## What is never darkened

- **The printed prescription and Preview PDF** (`lib/prescriptionDoc.ts`). It is a
  legal document on white paper, and it imports no theme on purpose. The same holds
  for every other printout: the personal note, the investigation download and the
  gallery PDF. A test renders each one with night mode on and checks that its HTML
  holds no `var(--c-` and no night colour.
- **Patient photos, report scans and uploaded images.** No filter, no tint, no
  inversion. They are shown exactly as they were taken.
- **The image viewer's black backdrop** keeps its white controls in both modes.

## The colours that do not come from `C`

63 hex literals and 31 `rgba()` in components, plus about 108 `#fff` / `white`, would
not switch. Each one is moved to a token: `#fff` used as a surface or as text on a
filled colour becomes `C.n[0]`, and a grey becomes its `n` shade. One that must stay
fixed in both modes, such as the image viewer's white-on-black, stays a literal and is
named in an allowed list. A test reads `src/components` and fails on any hex or `white`
that is not in that list: a raw colour in a component is a colour that does not switch.

`app/globals.css` already uses `--pri-*` and `--n-*` variables for focus rings,
scrollbars and autofill. Those are folded into the same `--c-*` names, so there is
one set of variables.

## The toggle and the first paint

- `lib/theme.ts`, built like `lib/kbdLang.ts`: `useTheme()`, `setTheme(mode, userId?)`,
  stored per user as `mhs_theme:<userId>`. It also stores the device's last choice
  under `mhs_theme`, for the sign-in page and for the first paint.
- A short inline script in `app/layout.tsx` `<head>` reads `mhs_theme` and sets
  `data-theme` **before the first paint**, so a doctor working at night does not get a
  white flash on every load. It is inline, nothing is fetched, and an unreadable value
  means light. This is not a third-party script, so the rule against outside scripts
  is kept.
- `ThemeToggle` in `DesktopShell.tsx` beside `LanguageToggle`: two buttons,
  `aria-pressed`, `aria-label` "Light mode" / "Night mode", drawn the same way as
  BAN / EN. The mobile shell gets the same control in its header or account menu.
  Icons come from `components/common/Icon.tsx`, never an emoji (house rule).
- On sign-in, that user's saved mode is applied. A user with none keeps whatever the
  device shows.

## Verification

- **Unit tests:**
  - every light value equals today's hex, which pins "light mode unchanged";
  - the contrast pairs pass in both modes;
  - the no-raw-colour scan of `src/components`;
  - the printouts carry no theme in night mode;
  - the toggle sets the attribute and remembers the choice per user.
- **The full client suite, typecheck, and the Playwright journeys.**
- **A browser pass on the sandbox (:3100), in night mode, screen by screen:**
  - prescription (pad, BAN columns, alerts, Drug history, On examination,
    Investigation, Add Bulk Medicine, the personal note, the print sheet);
  - OPD, IPD and an admission; patients; supervised; settings;
  - the health-trend chart, its numbers readable;
  - sign-in;
  - the mobile layout;
  - a printout, to see that it is still white.
- What was not looked at is said.

## Out of scope

- The admin console.
- A "follow the device setting" mode.
- Any change to the printed sheet.
