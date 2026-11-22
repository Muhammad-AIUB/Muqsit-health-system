# Admin console — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/admin.md`](../rules/admin.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Admin tabs "Supervising account" and "Team for IPD" — NOT built** — Waiting on the physician's details ("Details kalke dissi"); the sheet of 16/11/2026 names them again with no details, and the physician said not to add them yet.
- **Account page (16/11/2026) — decisions the builder took** — Point system: whole numbers only, an empty box is "not scored" (never 0), one Save replaces all ten, admin-only. Remove MHS logo: the header tile and the printed foot's mark only; the app name stays and "By EXHORT" keeps its wording. Isolate: closes access already given, not only new access.
- **Account page — not run against the real console** — Seen in a browser only against a stand-in API with made-up data; not on production data, not in Safari / Firefox, not on a phone.

**Closed — kept as the record of what was done or decided**

- **The admin console (:3001) has no night mode** — Out of scope by the physician's choice.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### Night mode — ☀ / ☾ (2026-10-15)

- [ ] **The admin console (:3001) has no night mode.** It is out of scope by the physician's choice.

### Settings → Statistics (11/11/2026) - open for the physician

- [ ] **Item 2 of the same sheet — the admin console's two new tabs, "Supervising account" and "Team for IPD" — is NOT built:** the physician wrote that the details would follow ("Details kalke dissi"). The sheet of 16/11/2026 ends with the same two names beside a screenshot of the sidebar (an arrow under "SMS payments") and still no details; asked, the physician said not to add them yet. Nothing is built, not even an empty tab.

### Account page: Profile, Dr's patient data, Profile settings (physician's sheet, 16/11/2026) - open for the physician

- [ ] **Point system — what the builder chose.** (1) Whole numbers 1–10 only: "1-10 er moddhe value" could also mean 7.5; 7.5 is refused, not rounded. (2) A box left empty is "not scored", never 0, and Save replaces all ten, so clearing a box clears it. (3) Only the admin sees it — the doctor never does, and the scores sit in their own table (`DoctorPointScore`) so no doctor-facing answer can carry them. (4) Nothing is computed from it (no total, no average, no effect on the account); the sheet asked only to keep the values. The physician to say if any of this is wrong, and what the scores are for.
- [ ] **Remove MHS logo — scope.** Removed: the "MHS+" tile in the desktop and phone header, and the "MHS" mark at the foot of every printed page. Not removed: the words "Muqsit Health System" beside the tile in the desktop header, the login / sign-up screens (nobody is in a practice yet), the "MHS is suggesting" alert wording, and "By [EXHORT]" on the sheet — whose wording stays "By", not "Developed by". The physician to say if the name should go too.
- [ ] **A change reaches a doctor who is already signed in only when they reload or pick their practice again** (the practice is held from the moment it was chosen). The sheet is not changed mid-visit.
- [ ] **Isolate closes access already given.** The switch is read in the access query, so a patient opened by code before the switch stops opening for both sides while either is isolated, and opens again when it is off. Nothing is deleted. The physician to say if instead only NEW access should be refused.
- [ ] **View details no longer opens a new tab,** and Print / Save as PDF is on the Profile tab only. The record itself prints as before.
- [ ] **Dr's patient data is numbers only.** No patient is named or opened from the admin's page; the chamber list is read without making the default chamber.
