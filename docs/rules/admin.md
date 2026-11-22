# Admin console

> **Read this before changing the code it covers.** Named in these rules: `admin.service.ts#hardDelete`, `accessibleWhere()`, `Patient.doctorId`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- Deleting a doctor must not delete their patients: `hardDelete` relies on `onDelete: SetNull`; orphans are unreachable; findability needs its own access design, never bolted onto a delete path.

- "View details" opens the account's own page in the SAME tab (Back + Profile / Dr's patient data / Profile settings), not a print-only new tab; Back returns to the list the account is in (`?tab=`).
- Dr's patient data is the doctor's own Statistics, read only, through the same service and chamber rule (`chamber-scope.ts`); reading it never writes (no default chamber is made); the admin's copy of the helpers is held to the client's by `client/src/lib/adminCopies.test.ts`.
- Profile settings: `isolated` and `hideMhsLogo` are saved the moment they are ticked, after asking in the page's own `Dialog`, and the box shows what the SERVER answered; only the two booleans can be set through the route.
- The Point system is the admin's alone: its own table (`DoctorPointScore`), never a `User` column, never in a doctor-facing answer; ten fixed criteria, whole numbers 1–10, the save is the whole set, nothing rounded or clamped.

---

# The rules, in full

## Account page — Profile settings, Point system, Dr's patient data (physician's sheet, 16/11/2026)

_New with this feature._ The sheet: "View details a click korle onne page a jabe na, click korle ai page a jabe" (Back; Profile · Dr's patient data · Profile settings).

- **Same tab, and a Back that knows where it came from.** `View details` is a `Link` to `/accounts/[id]` (it was `window.open(…, "_blank")`). Back goes to `/?tab=<list>`: Trash if the account is in Trash, else its tier. The list in `app/page.tsx` keeps which list is open in the address (`replaceState`, router state kept), so a reload and Back both return to it. Print / Save as PDF is on the Profile tab only; the print rules (everything outside `.doc` hidden) are unchanged.
- **Dr's patient data** ("11.11.26 ar moto dr jeita dekhbe oitai dekhbe") is the doctor's Settings → Statistics: Patient statistics (chamber, by days / by months, the bar chart, the five overall numbers) and Disease statistics. Read only and numbers only — no patient is named or opened. The routes are `GET /admin/users/:id/statistics/…`; they call `StatisticsService` and `resolveChamberScope` (the ONE copy of the chamber rule, also used by the doctor's own controller), so the admin and the doctor can never read a chamber differently. The chamber list is read straight from `OpdChamber` — `ChambersService.list` makes the default chamber on first read, and an admin looking at an account must not write into it. The admin's `lib/statistics.ts` and `BarChart.tsx` are COPIES of the client's (the admin is its own package) — edit one, edit both; `client/src/lib/adminCopies.test.ts` runs the same cases against both and the admin has no test runner of its own. Every answer is checked to BE the numbers before it is drawn, and a period is never shown under another's name (`useLoad` drops the old answer when the key changes).
- **Profile settings — two switches** (`PATCH /admin/users/:id/settings`). *Isolate this dr's system from others*: see `access-and-scoping.md` (it is read inside the reach query). *Remove MHS logo*: the practice's screens (`DesktopShell`, `MobileShell`) and the foot of every printed sheet leave the MHS mark off; "By EXHORT" stays — the physician's "developed by exhort thakbe", read as "stays as it is" (the wording "By" is unchanged; the app's name "Muqsit Health System" in the desktop header is not the logo and is not removed — the physician to say). Both reach the app through `GET /workstations` (the PRACTICE's setting: an assistant sees the practice's). Each change asks first, is logged with who made it, and is a boolean only: role, tier and approval cannot be set through it (pinned by an int test).
- **Point system** — ten criteria in the sheet's order (Integrity and honesty, Academic knowledge, Clinical competence, Communication, Professionalism, Empathy and behaviour, Clinical maturity, Teamwork and leadership, Accountability, Financial ethics), each `/10`: "Ami 1-10 er moddhe value boshaia save kore rakhbo". Decisions the builder took, for the physician to confirm (`docs/audit/admin.md`): whole numbers only (7.5 is refused, not rounded); a box left empty is "not scored", never 0; one Save for all ten, which replaces the whole set (so there is no read-modify-write to race on); the doctor never sees it. `server/src/admin/point-system.ts` is the one place the ten names and the range live; the admin's `lib/points.ts` only reads what was typed.

## ⚠️ Rule 2 — the patient access model (do not widen casually)

_From `server/CLAUDE.md`._

**Deleting a doctor must not delete their patients.** A patient is not the property of the account that registered them: the same person returns to a different doctor and is found again by mobile. `admin.service.ts#hardDelete` therefore does a plain user delete and lets `Patient.doctorId`'s `onDelete: SetNull` keep the row, its demographics and its durable history (`investigationSummary`, `onExaminationSummary`, `drugHistory`, `familyMembers`). That doctor's own `Prescription` rows still cascade, which is consistent — they were never visible to another doctor. **Known gap:** `accessibleWhere()` matches `{ doctorId }` OR an assigned supervisor, so a patient left with `doctorId = null` is retained but **not reachable** through the mobile lookup. Making unowned patients findable exposes PII across practices and needs its own access design — do not bolt it onto a delete path. _(Closed 16/11/2026, not by this entry: the access design is the patient's own code — `docs/rules/access-and-scoping.md`, "Opened with the patient's own code". The lookup itself is still not widened.)_
