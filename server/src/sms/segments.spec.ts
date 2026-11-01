import { SMS_COST_TAKA_PER_SEGMENT, smsSegments } from './segments';

// The two screenshots of the provider's own counter (physician, 28/10/2026).
const ENGLISH_SAMPLE =
  'Mr.jubayer your appointment time to dr. Shahariar at labaid at 6.10PM. Be present 30min prior to your appointment time .';
const BANGLA_SAMPLE =
  'জনাব জুবায়ের, ল্যাবএইড-এ ডাক্তার শাহরিয়ারের সাথে আপনার সাক্ষাতের সময় সন্ধ্যা ৬:১০। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।';

describe('smsSegments', () => {
  it("the provider's English screenshot: 120 characters, 1 message", () => {
    expect(ENGLISH_SAMPLE.length).toBe(120);
    expect(smsSegments(ENGLISH_SAMPLE)).toEqual({
      encoding: 'GSM-7',
      units: 120,
      segments: 1,
    });
  });

  // The provider counted 128 characters. Which code points the physician's text
  // held is not known: য় is one (U+09DF) or two (য + nukta), and the sentence
  // has four of them — 127 or 131 here. Every way of writing it is 2 messages,
  // which is what the screenshot proves.
  it("the provider's Bangla screenshot: 2 messages, however য় is written", () => {
    const decomposed = BANGLA_SAMPLE.normalize('NFC');
    const precomposed = BANGLA_SAMPLE.replace(/\u09AF\u09BC/g, '\u09DF');
    expect(decomposed.length).toBe(131);
    expect(precomposed.length).toBe(127);
    expect(smsSegments(decomposed)).toEqual({
      encoding: 'UCS-2',
      units: 131,
      segments: 2,
    });
    expect(smsSegments(precomposed)).toEqual({
      encoding: 'UCS-2',
      units: 127,
      segments: 2,
    });
    expect(smsSegments('ক'.repeat(128)).segments).toBe(2);
  });

  it('GSM-7: 160 is one message, 161 is two parts of 153', () => {
    expect(smsSegments('a'.repeat(160)).segments).toBe(1);
    expect(smsSegments('a'.repeat(161)).segments).toBe(2);
    expect(smsSegments('a'.repeat(306)).segments).toBe(2);
    expect(smsSegments('a'.repeat(307)).segments).toBe(3);
  });

  it('UCS-2: 70 is one message, 71 is two parts of 67', () => {
    expect(smsSegments('ক'.repeat(70))).toEqual({
      encoding: 'UCS-2',
      units: 70,
      segments: 1,
    });
    expect(smsSegments('ক'.repeat(71)).segments).toBe(2);
    expect(smsSegments('ক'.repeat(134)).segments).toBe(2);
    expect(smsSegments('ক'.repeat(135)).segments).toBe(3);
  });

  it('one Bangla letter makes the whole text UCS-2', () => {
    expect(smsSegments('a'.repeat(100) + 'ক')).toEqual({
      encoding: 'UCS-2',
      units: 101,
      segments: 2,
    });
  });

  it('an extension character takes two places, and is never split across parts', () => {
    expect(smsSegments('€')).toEqual({
      encoding: 'GSM-7',
      units: 2,
      segments: 1,
    });
    expect(smsSegments('a'.repeat(159) + '€').segments).toBe(2); // 161 places
    // 152 + a two-place character does not fit a part of 153: it starts the next.
    expect(smsSegments('a'.repeat(152) + '€' + 'a'.repeat(152)).segments).toBe(
      3,
    );
  });

  it('a curly quote is not GSM-7', () => {
    expect(smsSegments('it’s').encoding).toBe('UCS-2');
  });

  it('an empty text is no message; each message costs 1 taka', () => {
    expect(smsSegments('').segments).toBe(0);
    expect(SMS_COST_TAKA_PER_SEGMENT).toBe(1);
  });
});
