# client/CLAUDE.md — Doctor app (Next.js 14)

The doctor-facing SPA. App Router pages are thin shells; almost everything renders through `src/components/Muqsit.tsx` → `TabRouter.tsx` (tab = URL segment) with state in **one large context store**: `src/context/MuqsitContext.tsx` (`MuqsitStore = ReturnType<typeof useMuqsitStore>` — add to the return object and the type follows). Auth lives in `src/context/AuthContext.tsx`; server state in React Query hooks (`src/hooks/`); all HTTP through `src/lib/api.ts` (`apiFetch`: credentials, X-Workstation header, silent 401 refresh).

**Env trap:** `NEXT_PUBLIC_API_URL` must be set in both `.env.local` (dev, gitignored) and **`.env.production` (committed — the deployed build uses it)**. A missing prod value silently points the live site at `localhost:4000`.

## ⚕️ Clinical-accuracy rules specific to the client

- **Calculators (`src/lib/calculators/`, ~77 of them, wired via `calculator-registry.ts`):** each implements a published clinical score/formula. Never alter a formula, cutoff, unit, or interpretation without the published source; keep severity labels (`success/warning/danger`) consistent with the source. New calculators register in the registry and appear in Investigation "Special Scores".
- **Investigation catalog (`src/data/investigations.ts`):** the master test list (`INV_CATS`: `{cat, tests:[{name, fields}]}`, some via the `txt([...])` name-only helper). Test names must stay **unique across categories** (duplicates were purged deliberately); field units are clinical facts — verify before editing.
- **Never round, reformat, or "normalize" an entered clinical value.** Display exactly what the doctor typed.
- **Medicine search hits the server** (`/medicines/search`, raw `medicines` table). `src/data/drugs.ts` is only an 18-item static fallback for the legacy drug picker / monthly-cost demo — do not treat it as the drug database.
- **OCR (`src/lib/ocr.ts`, tesseract.js)** verifies the typed NID number against the uploaded NID photo during signup. It is assistive only — never let OCR overwrite what the user typed.

## Storage string protocols (the data model hiding in strings)

These formats are persisted in drafts, prescriptions and patient JSON columns — **changing them silently orphans existing data**. Extend parsers, don't break them:

- **Investigation finding:** `dd/mm/yyyy:TestName:value` (parse via `lib/investigationSummary.ts`). Report-pool images: `dd/mm/yyyy:Report N:[image attached]`; test-tagged images use key `dd/mm/yyyy:TestName` in `invImages` + a `…:[image attached]` entry. `[image attached]` / `Report N` rows are filtered out of print and summaries.
- **Drug history (per-patient `Patient.drugHistory`):** `dd/mm/yyyy: Drug — dose — food — duration`, notes `dd/mm/yyyy(note): …`, tapering `dd/mm/yyyy(cont): dose — food — duration`. Legacy `Current:`/`Past:` prefixes must keep parsing. Current-vs-Distant-past is **derived from the entry date vs `ptDate`** — never store the bucket.
- **On-examination summary:** `{date, text}` objects (`lib/onExaminationSummary.ts`); investigation summary: `{date, category, test, value}` (`lib/investigationSummary.ts`). Both merge-on-save (deduped), grouped by date newest-first on the records page.

## Editor lifecycle (easy to break — know it)

- `resetEditor()` blanks everything and sets `ptDate` = today. `loadPatient(p)` = reset + header fields + restore `p.incompleteRx` **only when the patient belongs to the effective doctor** (`activeWsRef.current ?? authIdRef.current`). **Supervised patients (other doctor's) always open with a blank editor** — also enforced during draft hydration (the draft's patient is fetched and checked). Do not weaken either check.
- Auto-draft: the editor persists per-doctor via `prescription-draft`; fresh login (sessionStorage `mhs_fresh_login`) starts blank+gated, plain reload restores. "Save & print" completes the visit: merges findings/OE/drug-history into the patient's permanent JSON, clears `incompleteRx`, marks the OPD visit complete, and snapshots the printed sheet to the "All prescriptions(Image)" gallery (html2canvas in an off-screen iframe).
- The 3.docx mobile gate: nothing is writable until a patient is picked via the mobile lookup (`PatientMobileLookup`, exact 11-digit match, family-tree info rows, "SUPERVISED" badge for other-practice matches).

## UI conventions

- **Inline styles only** with the theme palette: `import { C, font } from "@/theme"` (`C.pri/n/danger/warn/info` shades 50–800) and shared `inputSm`/`fieldLabel` from `@/theme/styles`. No Tailwind/CSS modules; occasional scoped `<style>` blocks for hover/animation are OK.
- Healthcare-grade interaction patterns already established — reuse them: Edit-mode-gated deletes with red round ✕ + persistent Undo bar (records page), select-then-remove galleries, scrollable capped-height summaries, sticky group headers, silent background retry instead of error walls (see `useWorkstations`), disabled-with-tooltip instead of hidden.
- Permission gating: `can(key)` / `canEditLabel(label)` from context (assistant permissions); wrap read-only sections in `<Lock>`. Tier gating reads `user.accountTier`.
- Print/PDF: `lib/prescriptionDoc.ts` builds a standalone HTML document (opened via `window.open` + `document.write`). Tables are `table-layout: fixed` with wrapping cells — long values must wrap **inside** the printable area, never overflow. The OPD "privacy copy" masks identity and drops clinical content — keep new sections out of it unless the patient needs them. Drug history prints **names only**, deduped.
- Mirror devices: editor state broadcasts over SSE (`DeviceMirror`); new editor state that should sync must be added to `mirrorSnapshot`/`applyMirrorSnapshot` in MuqsitContext.

## Responsive layout

The app adapts to the real device viewport, not just the manual preview toggle:

- `Muqsit.tsx` derives `effectiveView` from `matchMedia("(max-width: 767px)")` — phones always render `MobileShell`, regardless of the manual Desktop/Mobile toggle (hidden on real phones). It does **not** mutate the shared `view` state, since `view` is part of the mirrored snapshot (`mirrorSnapshot`/`applyMirrorSnapshot` in MuqsitContext) — device mirroring must stay unaffected.
- `MobileShell` takes a `preview` prop: `true` (desktop's manual "Mobile" toggle) renders the classic 375px bezel + fake status-bar mock; `false` (a real phone) fills the viewport (`100dvh`, no bezel). Both render the same children — the mock is presentation-only.
- `DesktopShell` now also serves **tablets** (≥768px, capped at 1440 via `.app-root`), not just desktop — "not mobile" no longer means "plenty of width." Check ~768px as well as ~375px when adding or changing a view.
- Styling is inline-only, so there's no ambient CSS breakpoint. Working patterns for a new row/grid/modal: `flexWrap:"wrap"` on any row that can overflow; `gridTemplateColumns:"repeat(auto-fit,minmax(Npx,1fr))"` instead of a fixed column count; `width:"min(Npx,92vw)"` + overlay `padding` for fixed-width modals. For a genuine breakpoint collapse (e.g. a 2-column layout that must become 1-column below some width — inline `style` can't express a media query), use a scoped `<style>` block with a class name, e.g. `.rxEditorGrid` in `PrescriptionView.tsx` (≤860px), `.invModal` in `InvestigationPopup.tsx` (≤820px), `.msgGrid` in `MessageView.tsx` (≤680px).
- A `mobile` prop being absent on a tab/view doesn't mean it's exempt from this — it usually means nobody's added responsive handling yet. Check how sibling views in the same tab group handle it before assuming a new fixed-width row is fine.

## Verification checklist for client changes

1. `npx tsc --noEmit` clean (Next build also lints — unused vars fail the prod build).
2. Exercise the flow at :3000; for editor changes also check reload-restore and a supervised patient stays blank.
3. Touching print/downloads → open Preview PDF and check fit; touching summaries → check records page grouping + Undo.
4. "Jest worker encountered N child process exceptions" from `next dev` = corrupted cache → stop, `Remove-Item -Recurse -Force client\.next`, restart. Not your change.
