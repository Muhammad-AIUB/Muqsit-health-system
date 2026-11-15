# Settings → Statistics

> **Read this before changing the code it covers.** Named in these rules: `client/src/lib/opdPresence.ts#isCompleted`, `components/statistics/PatientStatistics.tsx`, `lib/statistics.ts#readDays|readMonths|readOverall|readDiagnoses`, `DiseaseStatistics.tsx`, `SettingsView.tsx`, `StatisticsView.tsx`, `visit-stats.ts`, `VisitBarChart.tsx`, `/settings/statistics`, `/statistics/diseases`, `GET /statistics/visits/days|months|overall`, `server/CLAUDE.md`, `queueDate`, `ChambersService.resolve`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `client/CLAUDE.md` and `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- How it works — Settings → Statistics (`StatisticsView.tsx`, `/settings/statistics`) has Patient statistics and Disease statistics tabs; read only; assistants may open it.
- Patient statistics: chamber value is `all` or an id, NOT `X-Chamber`; hand-drawn SVG `VisitBarChart.tsx` uses `C` variables and scrolls, never shrinks; a missing average is `—`, never 0 (+1 more)
- Statistics never shows one period under another's name: queries keyed by practice, chamber and period, no `keepPreviousData`; "Loading numbers…" while the next one loads; `gcTime` 60 s.
- Statistics answers are checked to BE the numbers (`lib/statistics.ts` readers, `networkMode: "always"`); a bad body is "Could not load the …numbers." with Try again, never "nobody came".
- How it works — Disease statistics lists Final diagnoses with distinct-patient counts in the server's order, each whole and as written; no chamber; empty said in words; asked only when the tab opens.
- Statistics uses no locale: months from a table (`monthTitle`), weekday from UTC arithmetic, a count is `String`, an average `toFixed(1)`.
- How it works — Statistics counts only queued patients (seen / total serial), said on the page; pinned in `lib/statistics.test.ts` and `components/tabs/StatisticsView.test.tsx`.
- `statistics` is read only, `JwtAuthGuard, WorkstationGuard` and `@WorkstationDoctorId()` on every query; open to assistants with no owner check or key.
- "Seen" is the queue's Completed (`SEEN_SQL`, matching `isCompleted`) — must never disagree with the OPD card; a visit's day is `queueDate` else Dhaka day of `createdAt`, never `createdAt` alone.
- Statistics chamber is a claim: unknown / another practice's / removed id is 404, never the total in its place; two values 400; the `X-Chamber` header is NOT read here.
- `visit-stats.ts`: days/months zero-filled; calendar averages from first seen visit to today, one decimal, `null` (never 0) with nothing seen; answer carries the server's Dhaka `today`.
- Diseases group `finalDiagnosis` by `foldDiagnosis` (capitals and spacing only, nothing merged by meaning), counting DISTINCT PATIENTS; no chamber; each practice counts its own.
- Known limit — Statistics SQL not measured beyond a handful of rows; time it against `muqsit_load_test` with tens of thousands of visits before calling it fast.
- How it works — Statistics is pinned in `statistics.service.spec.ts`, `statistics.controller.spec.ts` (chamber claim) and `test/statistics.int-spec.ts` (SQL on real Postgres).

---

# The rules, in full

## Settings → Statistics (physician's sheet, 11/11/2026)

_From `client/CLAUDE.md`._

A card right after Payment (`SettingsView.tsx`, `/settings/statistics`, `barChart` in `Icon.tsx`); `StatisticsView.tsx` has a horizontal menu (`role="tablist"`) of **Patient statistics** and **Disease statistics**. Read only; assistants may open it. The server's rules are in `server/CLAUDE.md` (`statistics`).

- **Patient statistics** (`components/statistics/PatientStatistics.tsx`): the chamber (`All chamber total` first, then the practice's chambers; the value sent is `all` or the chamber's id — NOT the global "My Chamber"/`X-Chamber`, which the statistics routes ignore) and `By days` / `By months`; ‹ › move a month or a year. **The chart is `VisitBarChart.tsx`, drawn by hand as an SVG** (no chart library in the app): by days a light bar (total serial, `C.ok[100]` with a `C.ok[400]` outline — a pale green alone has no contrast on white) and a dark one (seen, `C.ok[600]`) for EVERY day of the month; by months one dark bar per month with its seen number above it. Every colour is a `C` variable. **The drawing is not shrunk to a narrow screen** (as the Health-trend chart): its box scrolls sideways. Each day or month has its tooltip, also with no one booked. Under the chart: the period's totals. **Five overall numbers** (Total visit, Average monthly visits, Average daily visits, This month's visit (up to today), Previous month visit) with a line saying what each is over ("Over 76 calendar days"); an average that does not exist is `—`, never 0; "this month" / "previous month" are named from the SERVER's `today`, not the PC's clock.
- **Never one period under another's name.** The queries are keyed by chamber and month/year and NOT kept across a change (no `keepPreviousData`): while the next month is on its way the chart is "Loading numbers…", not last month's bars under the new month's caption. Every key carries the practice, and the data is not kept between visits (`gcTime` 60 s). A chosen chamber that is no longer in the list goes back to the total (the server would answer 404).
- **An answer is checked to BE the numbers before it is drawn** (`lib/statistics.ts#readDays|readMonths|readOverall|readDiagnoses`, `networkMode: "always"`): an empty body or a hospital Wi-Fi's sign-in page is "Could not load the …numbers." with Try again, never "nobody came". The chart and the overall numbers fail apart. An older server's overall answer with no `today` is a failure too.
- **Disease statistics** (`DiseaseStatistics.tsx`): the practice's Final diagnoses with the number of different patients, in the server's order (most first, then A–Z), each shown whole and as written; empty is said in words; no chamber (a prescription holds none). The tab is asked only when opened.
- **No locale anywhere:** months come from a table (`monthTitle`), a weekday from UTC arithmetic, a count is `String`, an average `toFixed(1)`.
- Seen / total serial / Only queued patients are counted — said on the page under the overall numbers. Pinned in `lib/statistics.test.ts` and `components/tabs/StatisticsView.test.tsx`.

## `statistics` — Settings → Statistics (physician's sheet, 11/11/2026)

_From `server/CLAUDE.md`._

Read only (`GET /statistics/visits/days|months|overall`, `/statistics/diseases`; `docs/API.md` §5.12d), no migration, `@UseGuards(JwtAuthGuard, WorkstationGuard)` and `@WorkstationDoctorId()` on every query (Rule 1). Open to the practice's assistants (physician's decision) — no owner check, no key. Rules that are safety, not style:

- **"Seen" is the queue's Completed** — `"status" = 'done' OR COALESCE("rxStatus", '') = 'complete'` (`SEEN_SQL`), one copy beside `client/src/lib/opdPresence.ts#isCompleted`: the OPD card and this number must never disagree about who was seen. A visit's day is `queueDate`, else the Dhaka day of `createdAt` (`+ interval '6 hours'`, the fixed UTC+6 the queue uses), never `createdAt` alone. Total serial is every queue row of the day.
- **The chamber is a claim** (`StatisticsController.scope`): absent / empty / `all` = every chamber; else `ChambersService.resolve` — the default chamber's id means "no chamber" (`chamberId IS NULL`), another practice's / a removed / a made-up id is **404, never the total in its place**, two values is 400. The global `X-Chamber` header ("My Chamber") is NOT read here: the screen's own dropdown decides.
- **The arithmetic is in `visit-stats.ts`** (pure, `visit-stats.spec.ts`): every day / month is zero-filled; `overallFigures` gives the CALENDAR averages — seen ÷ every day from the first seen visit to today, ÷ every month from that visit's month to this one, both ends included (physician, 11/11/2026) — one decimal, `null` (never 0) with nothing seen or a first visit dated after today; the answer carries `today`, the server's Dhaka day, so the screen names "this month" from it and not from a PC clock.
- **Diseases:** the practice's `Prescription.finalDiagnosis` lines, grouped by `foldDiagnosis` (capitals and spacing only — the `drug-advice` `diagnosis` fold; `DM` ≠ `Diabetes mellitus`, nothing is merged by meaning), counting DISTINCT PATIENTS, the newest wording shown, most patients first then A–Z. A prescription holds no chamber, so there is none here. A supervising doctor's prescriptions are stored under their own `doctorId` (Rule 2), so each practice counts its own.
- **Not measured:** the SQL scans one doctor's `OpdVisit` rows (`@@index([doctorId, createdAt])`; the day expression cannot use the `queueDate` index) and one doctor's prescriptions unnested; run on the test database with a handful of rows only. Time it against `muqsit_load_test` with a doctor of tens of thousands of visits before calling it fast (root CLAUDE.md, "a query … that has only met the six rows of a test table").
- Pinned in `statistics.service.spec.ts` (which question is asked: whose practice, which chamber, which rule for seen), `statistics.controller.spec.ts` (the chamber claim) and `test/statistics.int-spec.ts` (the SQL against a real Postgres: seen, the day, the Dhaka midnight, chambers, another practice, an assistant, 401 / 403).
