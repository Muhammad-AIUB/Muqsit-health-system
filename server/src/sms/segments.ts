// How many SMS a text is sent as (physician's sheet, 28/10/2026: "note bangla and
// English er sms count different"). The provider's own screen proves the rule:
// an English text of 120 characters is 1 message, a Bangla text of 128 is 2.
//
// - A text whose every character is in the GSM 03.38 alphabet goes as GSM-7:
//   160 in one message, 153 in each part of a longer one. A character of the
//   extension table (`^ { } \ [ ] ~ | €` and form feed) takes two places.
// - Anything else (every Bangla letter, an emoji, a curly quote) makes the whole
//   text UCS-2: 70 in one message, 67 in each part. A character outside the
//   Basic Multilingual Plane takes two places.
// A character is never split across two parts, so a part may hold one place
// fewer than its size.
//
// What a message COSTS is `segments × SMS_COST_TAKA_PER_SEGMENT`.

/** 1 taka for each SMS the provider counts (physician: "Proti sms er 1 taka kore katbe"). */
export const SMS_COST_TAKA_PER_SEGMENT = 1;

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENSION = '\f^{}\\[~]|€';

const BASIC = new Set(Array.from(GSM_BASIC));
const EXTENSION = new Set(Array.from(GSM_EXTENSION));

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export interface SmsCount {
  encoding: SmsEncoding;
  /** Places the text takes in its encoding. */
  units: number;
  /** Messages the provider counts — and charges. */
  segments: number;
}

const LIMITS: Record<SmsEncoding, { single: number; part: number }> = {
  'GSM-7': { single: 160, part: 153 },
  'UCS-2': { single: 70, part: 67 },
};

export function smsSegments(text: string): SmsCount {
  const chars = Array.from(text ?? '');
  const gsm = chars.every((c) => BASIC.has(c) || EXTENSION.has(c));
  const encoding: SmsEncoding = gsm ? 'GSM-7' : 'UCS-2';
  // A code point's places: an extension character is escape + itself in GSM-7;
  // a code point beyond U+FFFF is a surrogate pair in UCS-2.
  const cost = (c: string) => (gsm ? (EXTENSION.has(c) ? 2 : 1) : c.length);
  const units = chars.reduce((n, c) => n + cost(c), 0);
  const { single, part } = LIMITS[encoding];
  if (units === 0) return { encoding, units, segments: 0 };
  if (units <= single) return { encoding, units, segments: 1 };
  let segments = 1;
  let room = part;
  for (const c of chars) {
    const k = cost(c);
    if (k > room) {
      segments += 1;
      room = part;
    }
    room -= k;
  }
  return { encoding, units, segments };
}
