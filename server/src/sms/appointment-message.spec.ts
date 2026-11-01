import {
  appointmentMessage,
  banglaClock,
  banglaDayPeriod,
  bareDoctorName,
  englishClock,
  oneLine,
} from './appointment-message';

// The physician's two samples (28/10/2026), as sent.
const EN_SAMPLE =
  'Mr.jubayer your appointment time to dr. Shahariar at labaid at 6.10PM. Be present 30min prior to your appointment time .';
const BN_SAMPLE =
  'জনাব জুবায়ের, ল্যাবএইড-এ ডাক্তার শাহরিয়ারের সাথে আপনার সাক্ষাতের সময় সন্ধ্যা ৬:১০। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।';

const at = (h: number, m: number) => h * 60 + m;

describe("appointmentMessage — the physician's samples", () => {
  it('English: the sample, without "Mr." and with its stray space and comma put right', () => {
    const msg = appointmentMessage('en', {
      patientName: 'jubayer',
      doctorName: 'Shahariar',
      chamber: 'labaid',
      minutes: at(18, 10),
    });
    expect(msg).toBe(
      'jubayer, your appointment time to dr. Shahariar at labaid at 6.10PM. Be present 30min prior to your appointment time.',
    );
    // Every word of the sample after the title is there, in order.
    const fixed = EN_SAMPLE.replace(/^Mr\./, '')
      .replace('jubayer your', 'jubayer, your')
      .replace(' .', '.');
    expect(msg).toBe(fixed);
  });

  it('Bangla: the sample, without "জনাব", an English name joined by a hyphen', () => {
    const msg = appointmentMessage('bn', {
      patientName: 'জুবায়ের',
      doctorName: 'শাহরিয়ার',
      chamber: 'ল্যাবএইড',
      minutes: at(18, 10),
    });
    expect(msg).toBe(
      'জুবায়ের, ল্যাবএইড-এ ডাক্তার শাহরিয়ার-এর সাথে আপনার সাক্ষাতের সময় সন্ধ্যা ৬:১০। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।',
    );
    // The sample's words, but for the title and the possessive's spelling.
    expect(msg).toBe(
      BN_SAMPLE.replace(/^জনাব /, '').replace('শাহরিয়ারের', 'শাহরিয়ার-এর'),
    );
  });

  it('a name from the profile, as the app has it', () => {
    expect(
      appointmentMessage('bn', {
        patientName: 'Jubayer',
        doctorName: 'Dr. Shahariar',
        chamber: 'Labaid',
        minutes: at(18, 10),
      }),
    ).toBe(
      'Jubayer, Labaid-এ ডাক্তার Shahariar-এর সাথে আপনার সাক্ষাতের সময় সন্ধ্যা ৬:১০। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।',
    );
  });

  it('a time past midnight is not worded: no message', () => {
    expect(
      appointmentMessage('en', {
        patientName: 'A',
        doctorName: 'B',
        chamber: 'C',
        minutes: 24 * 60 + 5,
      }),
    ).toBeNull();
  });
});

describe('the time', () => {
  it('English: 6.10PM, 12.05PM, 12.30AM, 9.00AM', () => {
    expect(englishClock(at(18, 10))).toBe('6.10PM');
    expect(englishClock(at(12, 5))).toBe('12.05PM');
    expect(englishClock(at(0, 30))).toBe('12.30AM');
    expect(englishClock(at(9, 0))).toBe('9.00AM');
  });

  it('Bangla: digits in Bangla, 12-hour, with the part of the day', () => {
    expect(banglaClock(at(18, 10))).toBe('সন্ধ্যা ৬:১০');
    expect(banglaClock(at(9, 5))).toBe('সকাল ৯:০৫');
    expect(banglaClock(at(13, 0))).toBe('দুপুর ১:০০');
    expect(banglaClock(at(16, 45))).toBe('বিকাল ৪:৪৫');
    expect(banglaClock(at(21, 0))).toBe('রাত ৯:০০');
    expect(banglaClock(at(5, 0))).toBe('ভোর ৫:০০');
  });

  it('every hour of the day has exactly one part', () => {
    for (let h = 0; h < 24; h++)
      expect(typeof banglaDayPeriod(h * 60)).toBe('string');
    expect(banglaDayPeriod(at(17, 59))).toBe('বিকাল');
    expect(banglaDayPeriod(at(18, 0))).toBe('সন্ধ্যা');
    expect(banglaDayPeriod(at(19, 59))).toBe('সন্ধ্যা');
    expect(banglaDayPeriod(at(20, 0))).toBe('রাত');
    expect(banglaDayPeriod(at(3, 59))).toBe('রাত');
    expect(banglaDayPeriod(at(4, 0))).toBe('ভোর');
  });
});

describe('what goes into it', () => {
  it('an address typed on several lines is one line', () => {
    expect(oneLine('  Labaid\n  Dhanmondi ')).toBe('Labaid Dhanmondi');
  });
  it('"Dr." is not said twice', () => {
    expect(bareDoctorName('Dr. Shahariar')).toBe('Shahariar');
    expect(bareDoctorName('dr Shahariar')).toBe('Shahariar');
    expect(bareDoctorName('Dr.Shahariar')).toBe('Shahariar');
    expect(bareDoctorName('Drishti Rahman')).toBe('Drishti Rahman');
  });
});
