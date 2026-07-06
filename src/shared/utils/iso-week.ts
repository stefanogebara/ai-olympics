/**
 * ISO 8601 week helpers.
 *
 * ISO 8601: weeks start on Monday; week 1 is the week containing the first
 * Thursday of the year (equivalently, the week containing January 4th).
 *
 * IMPORTANT: every accessor here is UTC-based. A previous implementation read
 * the LOCAL date components (`getFullYear`/`getMonth`/`getDate`) and fed them
 * into `Date.UTC`, which shifted the result by a day on any machine west of
 * UTC and produced an off-by-one week near Monday boundaries. Gauntlet prize
 * weeks are attributed by UTC, so the computation must be UTC end-to-end.
 */

export interface ISOWeek {
  weekNumber: number;
  year: number;
}

/** Compute the ISO week number and ISO week-year for a given instant (UTC). */
export function getISOWeek(date: Date): ISOWeek {
  // Normalize to UTC midnight of the same calendar day (in UTC).
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // Shift to the Thursday of this ISO week; the year of that Thursday is the
  // ISO week-year. day 0 = Sunday -> treat as 7 so Monday..Sunday = 1..7.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return { weekNumber, year: d.getUTCFullYear() };
}

/** Compute the Monday 00:00:00 UTC instant for a given ISO week number + year. */
export function getMondayOfISOWeek(weekNumber: number, year: number): Date {
  // Jan 4 is always in week 1 of its ISO year.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayOfWeek = jan4.getUTCDay() || 7; // 1=Mon..7=Sun
  const week1Monday = new Date(jan4.getTime() - (jan4DayOfWeek - 1) * 86_400_000);
  return new Date(week1Monday.getTime() + (weekNumber - 1) * 7 * 86_400_000);
}
