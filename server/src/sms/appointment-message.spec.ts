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
  it('English, a male patient: the sample with "Mr." and its stray spacing put right', () => {
    const msg = appointmentMessage('en', {
      patientName: 'jubayer',
      sex: 'Male',
      doctorName: 'Shahariar',
      chamber: 'labaid',
      minutes: at(18, 10),
    });
    expect(msg).toBe(
      'Mr. jubayer, your appointment time to dr. Shahariar at labaid at 6.10PM. Be present 30min prior to your appointment time.',
    );
    // Every word of the sample, in order: only a space after "Mr.", a comma
    // after the name, and the space before the last full stop changed.
    const fixed = EN_SAMPLE.replace(/^Mr\./, 'Mr. ')
      .replace('jubayer your', 'jubayer, your')
      .replace(' .', '.');
    expect(msg).toBe(fixed);
  });

  it('Bangla, a male patient: the sample with জনাব, word for word but the possessive', () => {
    const msg = appointmentMessage('bn', {
      patientName: 'জুবায়ের',
      sex: 'M',
      doctorName: 'শাহরিয়ার',
      chamber: 'ল্যাবএইড',
      minutes: at(18, 10),
    });
    expect(msg).toBe(
      'জনাব জুবায়ের, ল্যাবএইড-এ ডাক্তার শাহরিয়ার-এর সাথে আপনার সাক্ষাতের সময় সন্ধ্যা ৬:১০। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।',
    );
    expect(msg).toBe(BN_SAMPLE.replace('শাহরিয়ারের', 'শাহরিয়ার-এর'));
  });

  it('a female patient: জনাবা / Ms.', () => {
    const base = {
      patientName: 'Rahima',
      doctorName: 'Shahariar',
      chamber: 'Labaid',
      minutes: at(18, 10),
    };
    expect(appointmentMessage('bn', { ...base, sex: 'Female' })).toMatch(
      /^জনাবা Rahima, /,
    );
    expect(appointmentMessage('en', { ...base, sex: 'F' })).toMatch(
      /^Ms\. Rahima, your /,
    );
  });

  it('⚕️ a sex not recorded, or Other: no title — never a guess', () => {
    const base = {
      patientName: 'Karim',
      doctorName: 'Shahariar',
      chamber: 'Labaid',
      minutes: at(18, 10),
    };
    for (const sex of [null, undefined, '', 'Other', 'O', 'unknown']) {
      expect(appointmentMessage('bn', { ...base, sex })).toMatch(
        /^Karim, Labaid-এ /,
      );
      expect(appointmentMessage('en', { ...base, sex })).toMatch(
        /^Karim, your /,
      );
    }
  });

  it('⚕️ the Bangla message says the time wholly in Bangla — no Latin digit, no AM/PM', () => {
    for (const minutes of [
      at(0, 5),
      at(5, 30),
      at(9, 0),
      at(12, 45),
      at(16, 10),
      at(18, 10),
      at(23, 59),
    ]) {
      const msg = appointmentMessage('bn', {
        patientName: 'রহিম',
        sex: 'Male',
        doctorName: 'করিম',
        chamber: 'ল্যাবএইড',
        minutes,
      }) as string;
      expect(msg).not.toMatch(/[0-9]|AM|PM/);
    }
  });

  it('a name from the profile, as the app has it', () => {
    expect(
      appointmentMessage('bn', {
        patientName: 'Jubayer',
        sex: 'Male',
        doctorName: 'Dr. Shahariar',
        chamber: 'Labaid',
        minutes: at(18, 10),
      }),
    ).toBe(
      'জনাব Jubayer, Labaid-এ ডাক্তার Shahariar-এর সাথে আপনার সাক্ষাতের সময় সন্ধ্যা ৬:১০। নির্ধারিত সময়ের ৩০ মিনিট আগে উপস্থিত থাকবেন।',
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
