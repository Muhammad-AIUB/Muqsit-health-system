import { dhakaDayKey, dhakaDayStart, isDayKey, startOfDhakaDay } from './dhaka-day';

describe('dhakaDayKey', () => {
  it('names the Dhaka calendar day as yyyy-mm-dd', () => {
    expect(dhakaDayKey(new Date('2026-09-29T10:00:00Z'))).toBe('2026-09-29');
  });

  it('rolls over at Dhaka midnight, not UTC midnight', () => {
    // 23:59 Dhaka on the 28th is 17:59 UTC the same day.
    expect(dhakaDayKey(new Date('2026-09-28T17:59:00Z'))).toBe('2026-09-28');
    // 00:00 Dhaka on the 29th is 18:00 UTC on the 28th.
    expect(dhakaDayKey(new Date('2026-09-28T18:00:00Z'))).toBe('2026-09-29');
  });

  it('crosses a month and a year end', () => {
    expect(dhakaDayKey(new Date('2026-12-31T18:00:00Z'))).toBe('2027-01-01');
  });
});

describe('dhakaDayStart', () => {
  it('is Dhaka midnight of a named day, as an instant', () => {
    expect(dhakaDayStart('2026-10-28').toISOString()).toBe('2026-10-27T18:00:00.000Z');
    expect(dhakaDayStart('2027-01-01').toISOString()).toBe('2026-12-31T18:00:00.000Z');
  });

  it('agrees with startOfDhakaDay and dhakaDayKey for any moment', () => {
    for (const iso of ['2026-09-28T17:59:00Z', '2026-09-28T18:00:00Z', '2026-12-31T23:59:59Z', '2028-02-29T05:00:00Z']) {
      const now = new Date(iso);
      expect(dhakaDayStart(dhakaDayKey(now)).toISOString()).toBe(startOfDhakaDay(now).toISOString());
    }
  });
});

describe('isDayKey', () => {
  it('accepts a real calendar day', () => {
    expect(isDayKey('2026-10-28')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);
  });

  it('refuses what is not a real day, so a typo is never stored', () => {
    for (const bad of ['', '28/10/2026', '2026-10-32', '2026-02-30', '2027-02-29', '2026-1-5', '2026-13-01', 'today', '2026-10-28T00:00']) {
      expect(isDayKey(bad)).toBe(false);
    }
  });
});

describe('startOfDhakaDay', () => {
  it('returns Dhaka midnight (18:00 UTC the previous day)', () => {
    expect(startOfDhakaDay(new Date('2026-09-29T10:00:00Z')).toISOString()).toBe('2026-09-28T18:00:00.000Z');
  });

  it('rolls over at Dhaka midnight, not server midnight', () => {
    // 23:59 Dhaka on the 28th → still the 28th.
    expect(startOfDhakaDay(new Date('2026-09-28T17:59:00Z')).toISOString()).toBe('2026-09-27T18:00:00.000Z');
    // 00:00 Dhaka on the 29th (still the 28th in Berlin/UTC) → the 29th.
    expect(startOfDhakaDay(new Date('2026-09-28T18:00:00Z')).toISOString()).toBe('2026-09-28T18:00:00.000Z');
    // 03:30 Dhaka — the window the old server-local midnight got wrong.
    expect(startOfDhakaDay(new Date('2026-09-28T21:30:00Z')).toISOString()).toBe('2026-09-28T18:00:00.000Z');
  });
});
