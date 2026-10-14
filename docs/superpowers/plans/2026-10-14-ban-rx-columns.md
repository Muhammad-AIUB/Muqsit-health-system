# BAN ℞ columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With BAN selected, the OPD ℞ pad's dose / food / duration cells are written (saved, printed) in Bangla using the physician's approved wording and Bangla digits; EN writes them back in English.

**Architecture:** One pure lib (`lib/rxLanguage.ts`) reads a cell into a language-free form and writes it in either language; unknown text is returned untouched. The BAN/EN store moves to `lib/kbdLang.ts` so the pad can read it. Conversion happens only on explicit local acts — the switch, a cell commit in BAN, a line inserted from habits/bulk/template/Move to Rx — never passively on every `rxItems` change, so two mirrored devices in different modes cannot flip lines back and forth.

**Tech Stack:** React + TypeScript (Next.js client), Vitest + Testing Library (jsdom).

## Global Constraints

- Wording is the physician's approved table, verbatim (spec `2026-10-14-ban-rx-columns-design.md`).
- A decimal point stays `.` — never `।`.
- Text not in the table is returned exactly as written.
- An English cell is never rewritten by an EN conversion; a fully Bangla cell is never rewritten by a BN conversion.
- OPD pad only (`bangla` prop on `MedicinePad`, `RightColumn`, `DrugHistoryField`).
- No `jest-dom` — assert on plain DOM properties.

---

### Task 1: `lib/rxLanguage.ts` — the conversion

**Files:** Create `client/src/lib/rxLanguage.ts`, `client/src/lib/rxLanguage.test.ts`

**Produces:** `type RxLang = "en" | "bn"`, `rxCellIn(text, lang): string`, `rxItemsIn(items: RxItem[], lang): RxItem[]` (returns the same array when nothing changed), `habitIn<T>(habit, lang): T` (dose/food/duration and `contLines`).

- [ ] Write `rxLanguage.test.ts`: every table row EN→BN and BN→EN (with N = 2 and a decimal 1.5); `1+0+1` ↔ `১+০+১`; `1/2+0+1/2` ↔ `১/২+০+১/২`; `0.5` → `০.৫` (no `।`); `Before Meal` (case) → `খাবারের আগে`; `1 days` → `১ দিন` → `1 days`; `2 weeks` → `২ সপ্তাহ` → `2 week`; unknown (`2.5 ml`, `Take rest`) unchanged both ways; an English cell unchanged by `en`, a Bangla cell unchanged by `bn`; mixed `2 মাস` → `২ মাস`; `rxItemsIn` converts dose/instruction/duration, leaves `drug` and note rows, returns the same array reference when nothing changes; `habitIn` converts its contLines.
- [ ] Run: `cd client && npx vitest run src/lib/rxLanguage.test.ts` — FAIL (module missing).
- [ ] Implement (canonical read → write; constants `MEAL_BN = "খাবারের"`, `HOUR_BN = "ঘণ্টা"` shared by read and write so the strings cannot drift).
- [ ] Run again — PASS. Commit `feat(rx): rxLanguage — ℞ cells in Bangla or English, by the approved table`.

### Task 2: `lib/kbdLang.ts` — the mode store

**Files:** Create `client/src/lib/kbdLang.ts`; modify `client/src/components/layout/BanglaTyping.tsx`

**Produces:** `type KbdLang`, `setKbdLang(next, userId?)`, `getKbdLang()`, `savedKbdLang(userId)`, `useKbdLang()`. `BanglaTyping.tsx` re-exports `setKbdLang` and `KbdLang` so existing imports keep working.

- [ ] Move `mode`, `listeners`, `storageKey`, `setMode`, `subscribe`, `useKbdLang` into `kbdLang.ts` unchanged in behaviour.
- [ ] `BanglaTyping.tsx` imports them; `export { setKbdLang, type KbdLang } from "@/lib/kbdLang";`.
- [ ] Run `npx vitest run src/components/layout/BanglaTyping.test.tsx` — PASS (no behaviour change). Commit `refactor(ban): the BAN/EN store in lib/kbdLang`.

### Task 3: one instruction across languages

**Files:** Modify `client/src/lib/medicineKey.ts` (`instructionKey`), `client/src/lib/monthlyCost.ts` (`unitsForMonth`); tests in `medicineKey.test.ts`, `monthlyCost.test.ts`.

- [ ] Tests: `instructionKey("খাবারের আগে") === instructionKey("Before meal")`; `instructionKey("১+০+১") === instructionKey("1+0+1")`; `instructionKey("২ সপ্তাহ") === instructionKey("2 week")`; English still distinct where it was (`2 weeks` vs `2 week`). Monthly cost: a line `১+০+১ / খাবারের পরে / ৭ দিন` prices the same as `1+0+1 / After meal / 7 days`.
- [ ] Run — FAIL.
- [ ] `instructionKey`: start from `rxCellIn(cell ?? "", "en")`. `unitsForMonth`: `dosesPerDay(rxCellIn(line.dose, "en"))`, `durationDays(rxCellIn(line.duration, "en"))` (food already goes through `instructionKey`).
- [ ] Run — PASS. Commit `fix(rx): a Bangla instruction is the same instruction, and is priced`.

### Task 4: the switch converts the pad

**Files:** Modify `BanglaTyping.tsx` (`LanguageToggle`); test in `BanglaTyping.test.tsx`.

- [ ] Test: render `LanguageToggle` with a mocked `useMuqsit` holding `setRxItems`; press BAN → `setRxItems` called with an updater turning `{dose:"1+0+1", instruction:"Before meal", duration:"7 days"}` into `১+০+১ / খাবারের আগে / ৭ দিন`; press EN → back.
- [ ] Implement: `const choose = (v) => { setKbdLang(v, user?.id); setRxItems((prev) => rxItemsIn(prev, v)); };` — the mount-time restore does NOT convert.
- [ ] PASS. Commit `feat(ban): the switch writes the ℞ columns in its language`.

### Task 5: typing and inserted lines

**Files:** Modify `MedicinePad.tsx` (three commit points + `pickHabit`), `RightColumn.tsx` (`addTemplate`, bulk `onAppend`), `DrugHistoryField.tsx` (`moveToRx`); create `MedicinePad.bangla.test.tsx`.

- [ ] Test (`MedicinePad.bangla.test.tsx`): a pad with `bangla`, mode BN, dose `1+0+1` + blur → `১+০+১`; food `Before meal` + Enter → `খাবারের আগে`; duration `7d` + blur → `৭ দিন` (shorthand expanded first, then converted); mode EN → left as typed (`1+0+1`); a pad WITHOUT `bangla` in BN → left as typed.
- [ ] Implement in `MedicinePad`: `const lang = useKbdLang(); const commit = (s) => (bangla && lang === "bn" ? rxCellIn(s, "bn") : s);` wrapped around `parseDose` / `parseFood` / `parseDuration` at all six call sites; `pickHabit` inserts `bangla ? habitIn(habit, lang) : habit`.
- [ ] `RightColumn`: `const lang = useKbdLang();` — `addTemplate` → `rxItemsIn(items.map(...), lang)`; bulk → `rxItemsIn(items, lang)`.
- [ ] `DrugHistoryField`: `const lang = useKbdLang();` — Move to Rx appends `rxItemsIn(r.items, lang)`.
- [ ] Run the pad, RightColumn-adjacent and DrugHistoryField suites — PASS. Commit `feat(ban): typed and inserted ℞ lines land in the current language`.

### Task 6: docs and verification

- [ ] `client/CLAUDE.md` BAN section: digits in these three cells are now converted on commit (physician's decision, 2026-10-14, reversing 2026-09-23 for them); the table; when conversion runs and why not on mirror arrival; the two known limits. `docs/DOMAIN.md` BAN bullet. `FUNCTIONAL-AUDIT.md`: "Your usual" split across languages (server change pending).
- [ ] `npx tsc --noEmit`; full `npx vitest run`.
- [ ] Sandbox: BAN/EN round trip on a pad, typing in BAN, Move to Rx and bulk in BAN, Preview PDF shows the Bangla cells fitting the page.
- [ ] Commit docs.
