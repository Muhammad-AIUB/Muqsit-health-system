// ⚕️ The appointment SMS to a patient of a day's queue — BOTH languages, in this
// one module (physician's sheet, 28/10/2026). The words are the physician's
// samples, kept as written; only stray spacing and punctuation were put right:
//
//   EN sample: "Mr.jubayer your appointment time to dr. Shahariar at labaid at
//               6.10PM. Be present 30min prior to your appointment time ."
//   BN sample: "জনাব জুবায়ের, ল্যাবএইড-এ ডাক্তার শাহরিয়ারের সাথে আপনার সাক্ষাতের সময়
//               সন্ধ্যা ৬:১০। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।"
//
// The physician's answers (01/11/2026, relayed by the lead session):
// - Title: "jonab male hole, female hole jonaba" — জনাব for a male patient,
//   জনাবা for a female one, read from the RECORDED sex (`normaliseSex`, a copy of
//   client/src/lib/sex.ts). English: Mr. / Ms. by the same rule (an assumption,
//   flagged in FUNCTIONAL-AUDIT.md). A sex not recorded, or Other, gets NO title —
//   just the name: never a guess.
// - "banglate time banglatei likha thakbe": in the Bangla message the time is
//   wholly Bangla — Bangla digits and a Bangla part-of-day word, no AM/PM.
//
// What still differs from the samples, and why (questions for the physician,
// listed in FUNCTIONAL-AUDIT.md):
// - "Mr.jubayer" is written "Mr. jubayer," (a space after the title, and a comma
//   after the name as the Bangla sample has); " ." at the end is "."; "dr." is
//   kept as the physician wrote it.
// - The Bangla joins an English name with a hyphen: "{chamber}-এ" as in the
//   sample's "ল্যাবএইড-এ", and "ডাক্তার {name}-এর" where the sample has
//   "শাহরিয়ারের" — a name from the profile is not respelled in Bangla.
// - A leading "Dr." in the profile's name is left off, or the message would read
//   "dr. Dr. …" / "ডাক্তার Dr. …".
// - The Bangla word for the part of the day: the physician gave only সন্ধ্যা for
//   6:10 PM; the others are the usual ranges (`BANGLA_DAY_PERIODS`, below), still
//   the physician's to confirm.

export type SmsLanguage = 'en' | 'bn';

export interface AppointmentInput {
  patientName: string;
  /** The patient's sex as recorded (`Male` / `M` / `Female` / `F` / …); decides the title. */
  sex?: string | null;
  doctorName: string;
  chamber: string;
  /** The serial's time, minutes since midnight, from the day's schedule. */
  minutes: number;
}

const DAY = 24 * 60;
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export type Sex = 'Male' | 'Female' | 'Other';

/** A COPY of `client/src/lib/sex.ts#normaliseSex`: both spellings the queue
 *  row holds ("Male" / "M"); anything unrecognised is "" — never a sex. */
export function normaliseSex(raw: string | null | undefined): Sex | '' {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'm' || s === 'male') return 'Male';
  if (s === 'f' || s === 'female') return 'Female';
  if (s === 'o' || s === 'other') return 'Other';
  return '';
}

/** The title before the name: জনাব / জনাবা, Mr. / Ms. — none for a sex not
 *  recorded or Other. */
export function salutation(
  lang: SmsLanguage,
  sex: string | null | undefined,
): string {
  const s = normaliseSex(sex);
  if (s === 'Male') return lang === 'bn' ? 'জনাব' : 'Mr.';
  if (s === 'Female') return lang === 'bn' ? 'জনাবা' : 'Ms.';
  return '';
}

/** Collapse whitespace (an address is typed on several lines) and trim. */
export function oneLine(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** The profile's name without a leading "Dr." — the template says it already. */
export function bareDoctorName(name: string | null | undefined): string {
  return oneLine(name)
    .replace(/^dr\.?\s+/i, '')
    .replace(/^dr\.(?=\S)/i, '');
}

/** Whether a time is one this message can say: the same calendar day. A serial
 *  past midnight is "next day" in the queue, and no sample says how to word it. */
export function isSayableTime(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0 && minutes < DAY;
}

function twelveHour(minutes: number): { h: number; mm: string; pm: boolean } {
  const h24 = Math.floor(minutes / 60);
  return {
    h: h24 % 12 === 0 ? 12 : h24 % 12,
    mm: String(minutes % 60).padStart(2, '0'),
    pm: h24 >= 12,
  };
}

/** `6.10PM` — the English sample's way of writing a time. */
export function englishClock(minutes: number): string {
  const { h, mm, pm } = twelveHour(minutes);
  return `${h}.${mm}${pm ? 'PM' : 'AM'}`;
}

export function banglaDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

// ⚕️ The part of the day before a Bangla time, by the hour (24-hour clock, from
// inclusive, to exclusive). Only সন্ধ্যা at 6:10 PM is the physician's; the rest
// are the conventional ranges and are the physician's to confirm.
export const BANGLA_DAY_PERIODS: ReadonlyArray<{
  from: number;
  to: number;
  word: string;
}> = [
  { from: 4, to: 6, word: 'ভোর' },
  { from: 6, to: 12, word: 'সকাল' },
  { from: 12, to: 15, word: 'দুপুর' },
  { from: 15, to: 18, word: 'বিকাল' },
  { from: 18, to: 20, word: 'সন্ধ্যা' },
  { from: 20, to: 24, word: 'রাত' },
  { from: 0, to: 4, word: 'রাত' },
];

export function banglaDayPeriod(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return (
    BANGLA_DAY_PERIODS.find((p) => h >= p.from && h < p.to) as { word: string }
  ).word;
}

/** `সন্ধ্যা ৬:১০` — the Bangla sample's way of writing a time. */
export function banglaClock(minutes: number): string {
  const { h, mm } = twelveHour(minutes);
  return `${banglaDayPeriod(minutes)} ${banglaDigits(`${h}:${mm}`)}`;
}

/** The message, or `null` when the time cannot be said (past midnight). */
export function appointmentMessage(
  lang: SmsLanguage,
  input: AppointmentInput,
): string | null {
  if (!isSayableTime(input.minutes)) return null;
  const title = salutation(lang, input.sex);
  const name = (title ? `${title} ` : '') + oneLine(input.patientName);
  const doctor = bareDoctorName(input.doctorName);
  const chamber = oneLine(input.chamber);
  if (lang === 'en') {
    return `${name}, your appointment time to dr. ${doctor} at ${chamber} at ${englishClock(input.minutes)}. Be present 30min prior to your appointment time.`;
  }
  return `${name}, ${chamber}-এ ডাক্তার ${doctor}-এর সাথে আপনার সাক্ষাতের সময় ${banglaClock(input.minutes)}। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।`;
}
