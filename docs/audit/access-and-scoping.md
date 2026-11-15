# Access and scoping — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/access-and-scoping.md`](../rules/access-and-scoping.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Unowned patients are retained but unreachable** — Owner to define "mobile number and security access": does an unowned patient appear to every doctor or must be claimed, prior history exposure, patient consent (OTP?).
- **An assistant without `rx.medicines` can still READ the list** — List readable via the API (`GET /rx-habits?q=`) as "Your usual" is; pad locked and + greyed; refusing the read is a one-line guard if wanted.
- **A supervising doctor's Save & print is refused the owner's histories** — Physician to say whether a supervisor's visit should reach the owner's histories; until then "…was not updated" is true (`PATCH /patients/:id` refuses).
- **A supervising doctor now ADDS to the shared On-examination history** — Append only, own name; before, refused; investigation summary and drug history unchanged (owner's practice only).
- **Who may add and remove Disease / Surgical history** — Physician to say if only the author, or only the owner's practice, should remove; now every doctor who reaches the patient (assistants with `rx.history`).

**To do — engineering work that is known and not done**

- **Supervising doctor list** — Hardcoded mock; add/edit/delete not wired.

**Known limits and defects, recorded on purpose**

- **Owner's patient DELETE removes a supervising practice's parked visit** — It refuses only over another doctor's prescriptions; there is no screen for the delete today.
- **A parked visit written as the user switches practice** — Can land under the new practice when retried after a 401 (`apiFetch` re-reads the header); for a user assisting two practices that both supervise the patient; rare.

---

# The threads, in full

## 1. Not persisted (in-memory only — "save & reload = gone")

- [ ] **Supervising doctor list** — hardcoded mock; add/edit/delete not wired.

## Open threads — decisions owed, not bugs (2026-07-27)

- [ ] **Unowned patients are retained but unreachable.** Deleting a doctor no
  longer deletes their patients (`Patient.doctorId` → `SetNull`), which is the
  owner's stated model: a patient is not the property of the account that
  registered them. But `accessibleWhere()` matches owner-or-supervisor, so a
  patient with `doctorId = null` cannot be found by the next doctor's mobile
  lookup. The owner described the intended path as "mobile number **and security
  access**" — what that second half means is the open question. Widening the
  lookup to unowned patients exposes PII across practices, so it needs its own
  design: does an unowned patient appear to every doctor or must they be claimed;
  does claiming expose the prior history or only new visits; is patient consent
  (OTP?) required. See `server/CLAUDE.md` → Rule 2.

### Add Bulk Medicine (2026-10-13) — what it does not do, for the physician

- [ ] **An assistant without `rx.medicines` can still READ the list** through
  the API, as they can "Your usual" (`GET /rx-habits?q=`). The key is enforced
  where it matters — the pad is locked and the + greyed — and the list holds no
  patient. Refusing the read as well is a one-line guard if wanted.

### Nothing lost on a reload, nothing filed twice (19/10/2026)

- [ ] **A supervising doctor's Save & print tries to bring the owner's histories up to date and is refused** (`PATCH /patients/:id` refuses every supervising doctor, by design), so the doctor is told "…was not updated" for the drug, investigation and examination histories. Seen while reading for the review of dfdd1c4, older than this round, not run in a browser: whether a supervisor's visit should reach the owner's histories is the physician's to say; until then the box is true.

- [ ] **The owner's patient DELETE removes a supervising practice's parked visit** with the patient (it refuses only over another doctor's prescriptions). There is no screen for the delete today.
- [ ] **A parked visit written as the user switches practice** can land under the new practice when the request is retried after a 401 (`apiFetch` re-reads the header) — for a user assisting two practices that both supervise the patient. Rare.

### On examination shared + Patient Records history sections (31/10/2026) - open for the physician

- [ ] **A supervising doctor now ADDS to the shared On-examination history** (append only, own name). Before, their Save & print's examination-history write was refused. Investigation summary and drug history are unchanged (still the owner's practice only).

### History in the sidebar: the patient's Disease / Surgical history (02/11/2026) - open for the physician

- [ ] **Who may add and remove:** every doctor who reaches the patient — the owner's practice (and its assistants with History's key `rx.history`; the server asks an assistant for any `rx.*` key, as for the append) and a supervising doctor. Removal is not limited to the entry's author (the server keeps who removed it, and Undo). The physician to say if only the author, or only the owner's practice, should remove.
