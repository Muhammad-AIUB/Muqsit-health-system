// ⚕️ The appointment SMS to a patient of a day's queue — BOTH languages, in this
// one module (physician's sheet, 28/10/2026). The words are the physician's
// samples, kept as written; only stray spacing and punctuation were put right:
//
//   EN sample: "Mr.jubayer your appointment time to dr. Shahariar at labaid at
//               6.10PM. Be present 30min prior to your appointment time ."
//   BN sample: "জনাব জুবায়ের, ল্যাবএইড-এ ডাক্তার শাহরিয়ারের সাথে আপনার সাক্ষাতের সময়
//               সন্ধ্যা ৬:১০। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।"
//
// What differs from the samples, and why (each is a question for the physician,
// listed in FUNCTIONAL-AUDIT.md):
// - No "Mr." / "জনাব". Both are words for a man; the sample was about one
//   patient, and the app does not guess a title from the record's sex. The name
//   is followed by a comma in both languages (the Bangla sample has one).
// - " ." at the end of the English is "."; "dr." is kept as the physician wrote it.
// - The Bangla joins an English name with a hyphen: "{chamber}-এ" as in the
//   sample's "ল্যাবএইড-এ", and "ডাক্তার {name}-এর" where the sample has
//   "শাহরিয়ারের" — a name from the profile is not respelled in Bangla.
// - A leading "Dr." in the profile's name is left off, or the message would read
//   "dr. Dr. …" / "ডাক্তার Dr. …".
// - The Bangla word for the part of the day: the physician gave only সন্ধ্যা for
//   6:10 PM; the others are the usual ranges (`BANGLA_DAY_PERIODS`, below).

export type SmsLanguage = 'en' | 'bn';

export interface AppointmentInput {
  patientName: string;
  doctorName: string;
  chamber: string;
  /** The serial's time, minutes since midnight, from the day's schedule. */
  minutes: number;
}

const DAY = 24 * 60;
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

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
  const name = oneLine(input.patientName);
  const doctor = bareDoctorName(input.doctorName);
  const chamber = oneLine(input.chamber);
  if (lang === 'en') {
    return `${name}, your appointment time to dr. ${doctor} at ${chamber} at ${englishClock(input.minutes)}. Be present 30min prior to your appointment time.`;
  }
  return `${name}, ${chamber}-এ ডাক্তার ${doctor}-এর সাথে আপনার সাক্ষাতের সময় ${banglaClock(input.minutes)}। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।`;
}
