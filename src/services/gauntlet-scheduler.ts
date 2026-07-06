import { createLogger } from '../shared/utils/logger.js';
import { serviceClient } from '../shared/utils/supabase.js';
import { pickWeeklyTasks } from './gauntlet-tasks.js';
import { getISOWeek, getMondayOfISOWeek } from '../shared/utils/iso-week.js';

const log = createLogger('GauntletScheduler');

// Re-exported for backward compatibility with existing imports/tests.
export { getISOWeek };

/**
 * Create a new week record in aio_gauntlet_weeks for the given week.
 * Called on Monday 00:00 UTC.
 */
export async function createWeekRecord(weekNumber: number, year: number): Promise<void> {
  const tasks = pickWeeklyTasks(weekNumber, year);

  const monday = getMondayOfISOWeek(weekNumber, year);
  const starts_at = monday.toISOString();

  // Sunday 23:59:59 UTC = Monday + 6 days + 23h 59m 59s
  const sunday = new Date(monday.getTime() + 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 59000);
  const ends_at = sunday.toISOString();

  const { error } = await serviceClient
    .from('aio_gauntlet_weeks')
    .upsert(
      {
        week_number: weekNumber,
        year,
        task_ids: tasks.map((t) => t.id),
        prize_pool_cents: 0,
        status: 'active',
        starts_at,
        ends_at,
      },
      { onConflict: 'week_number,year' },
    );

  if (error) {
    log.error('Failed to create week record', { weekNumber, year, error: error.message });
    return;
  }

  log.info('Week record created/activated', { weekNumber, year, taskCount: tasks.length });
}

/**
 * Settle the current week: mark it as 'settled', timeout any still-running runs.
 * Called Sunday 23:59 UTC.
 */
export async function settleCurrentWeek(weekNumber: number, year: number): Promise<void> {
  const { error: weekError } = await serviceClient
    .from('aio_gauntlet_weeks')
    .update({ status: 'settled' })
    .eq('week_number', weekNumber)
    .eq('year', year);

  if (weekError) {
    log.error('Failed to settle week', { weekNumber, year, error: weekError.message });
    return;
  }

  const { data: timedOutRuns, error: runsError } = await serviceClient
    .from('aio_gauntlet_runs')
    .update({ status: 'timeout', updated_at: new Date().toISOString() })
    .eq('week_number', weekNumber)
    .eq('year', year)
    .eq('status', 'running')
    .select('id');

  if (runsError) {
    log.error('Failed to timeout running runs', { weekNumber, year, error: runsError.message });
    return;
  }

  const timedOutCount = timedOutRuns?.length ?? 0;
  log.info('Week settled', { weekNumber, year, timedOutRuns: timedOutCount });
}

/**
 * Start the weekly scheduler. Sets up an interval that polls every 60 seconds.
 * - Monday 00:00–00:01 UTC: creates week record
 * - Sunday 23:59 UTC: settles current week
 * Returns a cleanup function.
 */
export function startGauntletScheduler(): () => void {
  const lastCreatedWeek = new Set<string>();
  const lastSettledWeek = new Set<string>();

  const intervalId = setInterval(() => {
    const now = new Date();
    const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    const { weekNumber, year } = getISOWeek(now);
    const weekKey = `${year}-${weekNumber}`;

    // Monday 00:00–00:01 UTC: create week record
    if (utcDay === 1 && utcHour === 0 && utcMinute === 0 && !lastCreatedWeek.has(weekKey)) {
      lastCreatedWeek.add(weekKey);
      createWeekRecord(weekNumber, year).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error('createWeekRecord threw', { error: message });
      });
    }

    // Sunday 23:59 UTC: settle current week
    if (utcDay === 0 && utcHour === 23 && utcMinute === 59 && !lastSettledWeek.has(weekKey)) {
      lastSettledWeek.add(weekKey);
      settleCurrentWeek(weekNumber, year).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error('settleCurrentWeek threw', { error: message });
      });
    }
  }, 60_000);

  return () => {
    clearInterval(intervalId);
  };
}
