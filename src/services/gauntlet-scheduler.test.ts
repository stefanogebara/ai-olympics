/**
 * Tests for GauntletScheduler (gauntlet-scheduler.ts)
 *
 * Covers: getISOWeek, createWeekRecord, settleCurrentWeek, startGauntletScheduler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

const { mockFrom, mockPickWeeklyTasks } = vi.hoisted(() => {
  const mockPickWeeklyTasks = vi.fn().mockReturnValue([
    { id: 'web-001' },
    { id: 'web-002' },
    { id: 'gh-001' },
    { id: 'gh-002' },
    { id: 'wild-001' },
  ]);

  return {
    mockFrom: vi.fn(),
    mockPickWeeklyTasks,
  };
});

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));

vi.mock('./gauntlet-tasks.js', () => ({
  pickWeeklyTasks: mockPickWeeklyTasks,
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  getISOWeek,
  createWeekRecord,
  settleCurrentWeek,
  startGauntletScheduler,
} from './gauntlet-scheduler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'insert', 'update', 'upsert', 'order', 'limit']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.then = (
    resolve: (v: unknown) => unknown,
    _reject: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, _reject);
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getISOWeek
// ---------------------------------------------------------------------------

describe('getISOWeek', () => {
  it('returns week 2 for Monday 2026-01-05', () => {
    const result = getISOWeek(new Date('2026-01-05'));
    expect(result.weekNumber).toBe(2);
    expect(result.year).toBe(2026);
  });

  it('returns week 1 for Sunday 2026-01-04', () => {
    const result = getISOWeek(new Date('2026-01-04'));
    expect(result.weekNumber).toBe(1);
    expect(result.year).toBe(2026);
  });

  it('returns week 3 for Monday 2026-01-12', () => {
    const result = getISOWeek(new Date('2026-01-12'));
    expect(result.weekNumber).toBe(3);
    expect(result.year).toBe(2026);
  });
});

// ---------------------------------------------------------------------------
// createWeekRecord
// ---------------------------------------------------------------------------

describe('createWeekRecord', () => {
  it('calls serviceClient.from("aio_gauntlet_weeks").upsert() with correct fields', async () => {
    const q = makeChain({ data: null, error: null });
    mockFrom.mockReturnValue(q);

    await createWeekRecord(2, 2026);

    expect(mockFrom).toHaveBeenCalledWith('aio_gauntlet_weeks');
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        week_number: 2,
        year: 2026,
        prize_pool_cents: 0,
        status: 'active',
      }),
      expect.objectContaining({ onConflict: 'week_number,year' }),
    );
  });

  it('upserts a task_ids array containing 5 task IDs', async () => {
    const q = makeChain({ data: null, error: null });
    mockFrom.mockReturnValue(q);

    await createWeekRecord(2, 2026);

    const upsertArg = q.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(Array.isArray(upsertArg['task_ids'])).toBe(true);
    expect((upsertArg['task_ids'] as string[]).length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// settleCurrentWeek
// ---------------------------------------------------------------------------

describe('settleCurrentWeek', () => {
  it('updates aio_gauntlet_weeks to settled and times out running runs', async () => {
    const weeksChain = makeChain({ data: null, error: null });
    const runsChain = makeChain({ data: [{ id: 'run-1' }, { id: 'run-2' }], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'aio_gauntlet_weeks') return weeksChain;
      if (table === 'aio_gauntlet_runs') return runsChain;
      return makeChain();
    });

    await settleCurrentWeek(2, 2026);

    // Weeks table: status set to 'settled'
    expect(weeksChain.update).toHaveBeenCalledWith({ status: 'settled' });
    expect(weeksChain.eq).toHaveBeenCalledWith('week_number', 2);
    expect(weeksChain.eq).toHaveBeenCalledWith('year', 2026);

    // Runs table: status set to 'timeout'
    expect(runsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'timeout' }),
    );
    expect(runsChain.eq).toHaveBeenCalledWith('week_number', 2);
    expect(runsChain.eq).toHaveBeenCalledWith('year', 2026);
    expect(runsChain.eq).toHaveBeenCalledWith('status', 'running');
  });
});

// ---------------------------------------------------------------------------
// startGauntletScheduler
// ---------------------------------------------------------------------------

describe('startGauntletScheduler', () => {
  it('returns a cleanup function', () => {
    const cleanup = startGauntletScheduler();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('calling the cleanup function does not throw', () => {
    const cleanup = startGauntletScheduler();
    expect(() => cleanup()).not.toThrow();
  });
});
