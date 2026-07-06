/**
 * ISO 8601 week-number utilities.
 *
 * Single source of truth for gauntlet week bucketing — previously duplicated
 * in gauntlet-scheduler.ts and api/routes/gauntlet.ts, where both copies read
 * the date with LOCAL getters (getFullYear/getMonth/getDate). Because callers
 * pass UTC-parsed dates (e.g. `new Date('2026-01-12')` → midnight UTC), a
 * machine behind UTC read that instant back as the previous local day, shifting
 * the week boundary and mis-bucketing early-January runs by one week.
 */

/**
 * Get the ISO 8601 week number and week-year for a given date.
 *
 * ISO 8601: weeks start on Monday; week 1 is the week containing the first
 * Thursday of the year (equivalently, the week containing January 4th). The
 * returned `year` is the ISO week-year, which can differ from the calendar
 * year for dates in late December or early January.
 *
 * All arithmetic is done in UTC (via the UTC getters) so the result is
 * independent of the host machine's timezone.
 */
export function getISOWeek(date: Date): { weekNumber: number; year: number } {
  // Normalize to UTC midnight of the same calendar day, reading the input in
  // UTC so callers passing UTC-parsed dates get consistent results everywhere.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Shift to the Thursday of this ISO week: dayNum 1=Mon..7=Sun.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  // Week number = weeks elapsed since Jan 1 of the ISO week-year, +1.
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return { weekNumber, year: d.getUTCFullYear() };
}
