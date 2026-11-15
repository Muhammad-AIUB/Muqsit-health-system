# SMS and payment

> **Read this before changing the code it covers.** Named in these rules: `sms/sms.service.ts`, `manual-sms-wallet.sql`, `sms-wallet.service.ts`, `POST /opd/sms/send`, `src/sms/`, `normaliseBdMobile()`, `SmsService`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- Day SMS: never sent by itself, today/later only; chamber and time are the queue's; title from RECORDED sex, never guessed; charge only what the gateway took (+N more; SQL not applied).
- `SmsService.send()` result must never be `void`-ed into a swallowed catch; HTTP 200 is not delivery proof; numbers go through `normaliseBdMobile()`, which refuses rather than guesses.

---

# The rules, in full

## ⚠️ `opd` — the queue is booked by DAY (28/10/2026)

_From `server/CLAUDE.md`._

- **SMS to every patient of a day — built 2026-11-01 (`src/sms/`, `manual-sms-wallet.sql`, NOT applied to the shared database; apply it BEFORE the release is deployed).** `POST /opd/sms/preview` sends and charges nothing; `POST /opd/sms/send` is a press of the doctor's and carries the preview's `signature`. Rules that are safety, not style:
  - **Today or a later day only, refused in the SERVICE** (`requireSendableDay`), and an empty day is refused. Never sent by itself.
  - **⚕️ The chamber is the queue's** (multi-chamber, merged 01/11/2026): `OpdSmsController` resolves `X-Chamber` through `ChambersService.resolve` exactly as the OPD controller does (no header = the default chamber, NULL; another practice's or a removed chamber = 404) and the service reads `OpdService.list` / `getSchedule` for THAT chamber. The place the message names is that `OpdChamber`'s own name and address (`chamberOf`: `name, address`; the default chamber's app-given name "Main chamber" is left off, so it is its address — copied from the profile's first chamber when the default was made). Neither is ever picked separately from the queue: a patient of one chamber must not be told another's address. Both empty → a `problem` ("Add this chamber's name or address in Settings → Chambers"), nothing built. There is no `chamberId` in the body.
  - **The time is the Print Queue's**: `OpdService.list` (the order shown — `OpdModule` exports `OpdService` for this) and `slotTimes` over `OpdService.getSchedule`. `schedule.ts#slotTimes` is a COPY of `client/src/lib/opdSchedule.ts#slotTimes`; the specs hold the same cases — edit one, edit both. A serial past midnight is skipped (no sample words it).
  - **The words are the physician's samples** (`appointment-message.ts`, both languages, pinned against the samples in its spec; the Bangla sample is pinned with জনাব for a male patient): **the title follows the RECORDED sex** of the queue row (`normaliseSex`, a copy of `client/src/lib/sex.ts`) — জনাব / জনাবা in Bangla (physician, 01/11/2026), Mr. / Ms. in English (an assumption, by the same rule); a sex not recorded, or Other, gets no title, never a guess. **The Bangla time is wholly Bangla** — Bangla digits and a part-of-day word, no AM/PM (physician, 01/11/2026). `dr.` as written, an English name joined in Bangla with `-এ` / `-এর`, a leading `Dr.` in the profile's name left off. The part-of-day words beyond সন্ধ্যা are conventional ranges (`BANGLA_DAY_PERIODS`) — still the physician's to confirm.
  - **Counted as the provider counts** (`segments.ts`: GSM-7 160/153, any non-GSM character → UCS-2 70/67, a character never split across parts); **1 taka per message counted** (`SMS_COST_TAKA_PER_SEGMENT`, the one constant).
  - **Only what the gateway took is charged.** The job's cost is reserved (ledger `send`) under the wallet's lock, the messages go one at a time (`SmsService.send` — its `{ok, detail}` is shown per patient, never swallowed), and what did not go is refunded (ledger `refund`) in a `finally`. **An unconfigured gateway logs and answers ok — so `send` refuses it (503 `SMS_NOT_CONFIGURED`) before anything is reserved.**
  - **One job per (doctor, chamber, day, language)** (`SmsSendJob.chamberId`), decided under `pg_advisory_xact_lock('sms:…')`: a job still `sending` (within 30 min) is 409 `SMS_SENDING`; a patient sent this very message (number + words) within 30 minutes makes it 409 `SMS_REPEAT` unless `confirmRepeat`.
  - **The wallet** (`sms-wallet.service.ts`): `SmsWallet.doctorId` is the PRACTICE doctor (`@WorkstationDoctorId()`); balance and ledger change together in one transaction holding `SELECT … FOR UPDATE` on the wallet, with `ROW_LOCK_TX`; never below 0 (refused before writing; the SQL adds a CHECK). `test/sms-wallet.int-spec.ts` runs two sends at once against the database (checked red with the lock and the check broken, in a copy).
  - **Who:** preview / send / balance — anyone at the workstation, an assistant included (the OPD queue is open to every assistant: `opd.addPatient`, always granted); ledger and payment requests — the doctor only (`ws.role === 'owner'`). A payment request's `quantity` is the SMS to buy (`sms`, required) or the MONTHS of the monthly subscription to renew (`renew`, optional — physician, 01/11/2026: "Renew means monthly subscription fees"); no fee or package is the app's. Admin routes (`/admin/payment-requests`) take `RolesGuard` + `@Roles('admin')`.
  - **Not covered:** a job cut short by the process ending stays `sending` with its reservation taken (its `results` say what went so far); after 30 minutes a new send is allowed, the reservation is not refunded by itself — an admin `adjust` is by hand, and there is no route for it. Delivery reports are not read: "sent" means the gateway accepted it.

## Gotchas

_From `server/CLAUDE.md`._

- **SMS** (`sms/sms.service.ts`, 24bulksmsbd) — `SMS_CUSTOMER_ID/SMS_API_KEY`, optional `SMS_API_URL`. Same unconfigured-is-fine posture as mail: it logs instead of sending. **`SmsModule` is in `AppModule` since 2026-11-01** — its first caller is the SMS to a day's queue (`opd` section above); the cross-practice OTP-consent design can use the exported `SmsService`. Two rules for every caller: `send()` returns `{ok, detail, ms, raw}` and must never be `void`-ed into a swallowed catch — a lost access code that nobody hears about is the whole failure mode; and the gateway answers **HTTP 200 for business failures too** (bad key, no balance), so status alone is not proof of delivery, which is why the body is pattern-checked and the first few raw responses are logged. Numbers go through `normaliseBdMobile()`, which refuses anything that isn't `01[3-9]XXXXXXXX` rather than guessing — a guessed digit sends a patient's code to a stranger.
