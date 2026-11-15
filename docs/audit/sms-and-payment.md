# SMS and payment — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/sms-and-payment.md`](../rules/sms-and-payment.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Still to confirm about the words (`appointment-message.ts`)** — Physician to confirm: no title when sex not recorded or Other (+5 more: Mr./Ms., punctuation, names not respelled, `BANGLA_DAY_PERIODS`, after-midnight serials).
- **Who gets one** — Physician to confirm skipping the already-seen (Done or printed); missing or non-Bangladeshi mobile numbers are listed, never guessed.
- **The count** — GSM-7 160/153, UCS-2 70/67 per part, 1 taka per message; provider said 128 characters, the sample is 131 or 127 code points — 2 messages either way.
- **Assistants can send** — From the doctor's wallet; only the doctor sees the history and makes payment requests. To confirm.
- **Sending again** — A patient sent the same message in the last 30 minutes makes Send ask "Send these SMS again?"; nothing sent by itself; a lost answer is "may have been sent", not retried.
- **Payment: no gateway, no prices** — Physician / product owner to give the fee and say whether an unpaid subscription should do anything; no provider built (no bKash / Nagad); admin adds SMS by hand.

**To do — engineering work that is known and not done**

- **No real SMS has been sent** — No SMS keys here; tests use a fake gateway; real answers only pattern-checked (`SmsService`); delivery reports are not read.
- **SMS per chamber is not built** — The address is stored for it.

**Known limits and defects, recorded on purpose**

- **A send cut short keeps its reservation** — Stays "sending"; after 30 minutes a new send is allowed; the reservation of unsent messages is not returned and there is no admin adjustment route yet.

**Closed — kept as the record of what was done or decided**

- **SMS to the queue and Settings → Payment — built** — Bangla/English preview of what the SERVER would send, `N SMS × 1 taka`, balance, Buy SMS; per-patient results; Payment page with balance, Renew, requests, history.
- **Answered by the physician (01/11/2026)** — জনাব for male, জনাবা for female from recorded sex; Bangla time wholly in Bangla; Renew is the monthly subscription.
- **The chamber is the queue's (01/11/2026, with multi-chamber merged)** — The SMS names the chamber chosen on screen (name and address); with neither, nothing built and Settings → Chambers is asked for.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### SMS to a day's queue, and Settings → Payment (01/11/2026) - open for the physician

- [x] **Built:** "Send SMS to all patients" beside Print Queue (today or a later day with someone queued) asks Bangla or English, then shows what the SERVER would send — each patient, the number as it will be sent, the exact message, how many SMS it counts as — the total (`N SMS × 1 taka`), the balance and Send; with the balance short it says "Not enough SMS balance." and offers "Buy SMS" (Settings → Payment) instead of Send. Results are shown per patient in words (sent / failed / not sent, with the gateway's reason). Settings → Payment, right after Profile: the balance, Renew and Buy SMS, the requests with their status, and the SMS history (`server/CLAUDE.md`, `opd`; `client/CLAUDE.md`, OPD queue).

- [ ] **No real SMS has been sent.** There are no SMS keys in this environment: every test uses a fake gateway. The gateway's real answers (what "success" looks like, whether a long Bangla message is accepted whole) are still only pattern-checked (`SmsService`); "sent" means the gateway accepted it — delivery reports are not read.
- [x] **Answered by the physician (01/11/2026):** the title — জনাব for a male patient, জনাবা for a female one, from the recorded sex; the Bangla time is written wholly in Bangla (Bangla digits and a part-of-day word, no AM/PM); Renew is the monthly subscription.
- [ ] **Still to confirm about the words** (`server/src/sms/appointment-message.ts`, both samples pinned in its spec, the Bangla one with জনাব):
  - A sex **not recorded, or Other**: no title at all, just the name (a title is never guessed). Is that right?
  - English uses **Mr. / Ms.** by the same rule — an assumption; the physician named only the Bangla words.
  - "Mr.jubayer" is written "Mr. jubayer," (a space after the title, a comma after the name); "dr." is kept in lower case as in the sample; " ." at the end is ".".
  - In Bangla, a name from the profile is not respelled: "Labaid-এ ডাক্তার Shahariar-এর সাথে…" where the sample has "ল্যাবএইড-এ ডাক্তার শাহরিয়ারের". A leading "Dr." in the profile's name is left off.
  - **Bangla part of the day:** only সন্ধ্যা (for 6:10 PM) was given. Used: ভোর 4:00–5:59, সকাল 6:00–11:59, দুপুর 12:00–14:59, বিকাল 15:00–17:59, সন্ধ্যা 18:00–19:59, রাত 20:00–3:59 (`BANGLA_DAY_PERIODS`). Still to confirm.
  - A serial whose time is after midnight is not sent (listed "The serial time falls after midnight") — no sample words it.
- [x] **The chamber is the queue's (01/11/2026, with multi-chamber merged):** the SMS reads the queue and schedule of the chamber chosen on the screen and names THAT chamber — its own name and address ("Ibn Sina, Kalabagan"); the main chamber, whose name the app gave it, by its address (copied from the profile's first chamber when it was made). No separate chamber is picked for the message. Neither name nor address → "Add this chamber's name or address in Settings → Chambers", nothing built. A long address makes every message longer (and may cost more); the preview shows it.
- [ ] **Who gets one:** every patient of the day in the queue's order, except a patient already seen (Done, or the prescription printed) and a number that is missing or not a Bangladeshi mobile (listed, never guessed). The physician to confirm skipping the already-seen.
- [ ] **The count:** GSM-7 160 / 153 per part, anything not in the GSM alphabet (all Bangla) UCS-2 70 / 67 per part; 1 taka per message counted. The provider's Bangla screenshot said 128 characters; the sample as typed here is 131 code points (য় as য + nukta) or 127 (one character) — 2 messages either way, which is what is charged.
- [ ] **Assistants can send** (the OPD queue is open to every assistant), from the doctor's wallet; only the doctor sees the history and makes payment requests. To confirm.
- [ ] **Sending again:** a patient sent the very same message in the last 30 minutes makes Send ask "Send these SMS again?" (patients would get it twice). Nothing is ever sent by itself; an answer that does not arrive is said as "may have been sent" and not retried.
- [ ] **Payment: no gateway, no prices.** No payment provider was named, and none is built (no bKash / Nagad). Buy SMS asks for the number of SMS and, optionally, the amount and a note; **Renew is the doctor's monthly subscription** (physician, 01/11/2026) and asks for an optional number of months, amount and note. The request goes to the admin (admin console → SMS payments), who adds the SMS after the payment has come in, or marks a renewal done. **No fee was given** (per month or per SMS package), and the account has no subscription expiry in the app — marking a renewal done changes nothing else. The physician / product owner to give the fee and say whether an unpaid subscription should do anything.
- [ ] **A send cut short** (the API restarting in the middle) keeps its reservation: it stays "sending", its results say what went so far, and after 30 minutes a new send is allowed. The reservation of the messages that did not go is not returned by itself, and there is no route for an admin adjustment yet.

### Multiple chambers (01/11/2026) - open for the physician

- [ ] **SMS per chamber** is not built (the address is stored for it).
