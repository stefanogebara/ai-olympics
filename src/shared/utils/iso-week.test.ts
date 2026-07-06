import { describe, it, expect } from 'vitest';
import { getISOWeek, getMondayOfISOWeek } from './iso-week.js';

describe('getISOWeek', () => {
  // 2026-01-01 is a Thursday, so ISO week 1 of 2026 = Dec 29 2025 .. Jan 4 2026.
  it('returns week 1 for Thursday 2026-01-01', () => {
    expect(getISOWeek(new Date('2026-01-01'))).toEqual({ weekNumber: 1, year: 2026 });
  });

  it('returns week 1 for Sunday 2026-01-04 (last day of ISO week 1)', () => {
    expect(getISOWeek(new Date('2026-01-04'))).toEqual({ weekNumber: 1, year: 2026 });
  });

  it('returns week 2 for Monday 2026-01-05', () => {
    expect(getISOWeek(new Date('2026-01-05'))).toEqual({ weekNumber: 2, year: 2026 });
  });

  it('returns week 3 for Monday 2026-01-12', () => {
    expect(getISOWeek(new Date('2026-01-12'))).toEqual({ weekNumber: 3, year: 2026 });
  });

  // Late-December days can belong to week 1 of the *next* ISO year.
  it('returns week 1 of 2026 for Wednesday 2025-12-31', () => {
    expect(getISOWeek(new Date('2025-12-31'))).toEqual({ weekNumber: 1, year: 2026 });
  });

  it('is timezone-independent (same result regardless of local offset)', () => {
    // A UTC-midnight instant must land on the same ISO week no matter the host
    // timezone. Constructing from an explicit UTC instant pins the contract.
    const utcMidnight = new Date(Date.UTC(2026, 0, 5)); // 2026-01-05T00:00Z
    expect(getISOWeek(utcMidnight)).toEqual({ weekNumber: 2, year: 2026 });
  });
});

describe('getMondayOfISOWeek', () => {
  it('returns Monday 2026-01-05 for 2026 week 2', () => {
    expect(getMondayOfISOWeek(2, 2026).toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });

  it('round-trips with getISOWeek', () => {
    for (let w = 1; w <= 52; w++) {
      const monday = getMondayOfISOWeek(w, 2026);
      expect(getISOWeek(monday)).toEqual({ weekNumber: w, year: 2026 });
    }
  });
});
