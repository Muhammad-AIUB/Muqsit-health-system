import { createHmac, randomInt, timingSafeEqual } from 'crypto';

// ⚕️ The patient's own code (16/11/2026). A doctor of another practice types the
// patient's mobile number, the patient's phone receives a code, the doctor enters
// it: only then does the patient open for that practice. Everything here is pure
// so that it can be pinned without a database.

/** Six digits: short enough to read out on the phone, guarded by the limits below. */
export const CODE_DIGITS = 6;
/** A code stops working after this long. */
export const CODE_TTL_MS = 10 * 60_000;
/** Wrong tries one code allows; the next try — even the right code — is refused. */
export const MAX_WRONG_TRIES = 5;
/** The same practice cannot ask for another code for the same patient sooner. */
export const RESEND_AFTER_MS = 60_000;
/** Codes sent to ONE patient's phone in an hour, from every practice together:
 *  a doctor (or a stranger with a doctor's account) cannot fill a phone with SMS. */
export const MAX_CODES_PER_PATIENT_PER_HOUR = 5;
export const HOUR_MS = 60 * 60_000;

/** A fresh code: uniformly random, never `Math.random`, zero-padded ("004821"). */
export function newCode(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
}

/**
 * What the doctor typed, as a code — or null when it cannot be one. Spaces are
 * taken out (a code pasted from a message as "482 913" is the same code), nothing
 * else is guessed: letters, a different length or a pasted sentence are null.
 */
export function readCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\s+/g, '');
  return new RegExp(`^\\d{${CODE_DIGITS}}$`).test(digits) ? digits : null;
}

/**
 * The code is stored only as a keyed hash that names the patient and the practice
 * it was issued for: a code issued for one pair does not open another, and the
 * table alone (without the server's secret) does not give the codes back.
 */
export function hashCode(secret: string, patientId: string, doctorId: string, code: string): string {
  // JSON, not "a:b:c": two different triples must never write the same string.
  return createHmac('sha256', secret).update(JSON.stringify([patientId, doctorId, code])).digest('hex');
}

/** Compared in constant time; a hash of another length is simply not equal. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `01712345678` → `017*****678`: enough for the doctor to tell the patient where it went. */
export function maskMobile(mobile: string): string {
  const d = mobile.replace(/\s+/g, '');
  if (d.length < 7) return '*'.repeat(d.length);
  return `${d.slice(0, 3)}${'*'.repeat(d.length - 6)}${d.slice(-3)}`;
}

// ── Age, as a patient is told apart in the list ─────────────────────────
// A COPY of `client/src/lib/age.ts` (DOB wins; a manual age ticks up one a year
// since the year it was recorded) — edit one, edit both.

export function ageFromDob(dob: Date | null | undefined, now: Date): number | null {
  if (!dob || Number.isNaN(dob.getTime())) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function ageOf(
  p: { dob: Date | null; age: number | null; ageAsOfYear: number | null },
  now: Date,
): number | null {
  const fromDob = ageFromDob(p.dob, now);
  if (fromDob != null) return fromDob;
  if (p.age == null) return null;
  if (!p.ageAsOfYear) return p.age;
  const bumped = p.age + (now.getFullYear() - p.ageAsOfYear);
  return bumped >= 0 ? bumped : p.age;
}

/** The longest doctor's name the message carries. */
export const NAME_MAX = 40;

/**
 * The SMS the patient reads: the code, who it lets in and what it opens, who it
 * is for, how long it lives. One GSM-7 message (160) for a Latin name up to about
 * 28 characters; a longer or Bangla name takes a second part, which the platform
 * pays for. The wording is the builder's, not the physician's — to be confirmed.
 * The doctor's name is a stored string, so line breaks and control characters are
 * taken out: a name must not be able to add a line to the message.
 */
export function codeMessage(code: string, doctorName: string): string {
  const who = doctorName.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return `Muqsit Health System: code ${code} lets ${who || 'the doctor'} open your health record. Tell it to them only if you are with them. Valid 10 minutes.`;
}
