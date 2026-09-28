import { startOfDhakaDay } from './dhaka-day';

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
