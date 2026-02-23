/**
 * Tests for market-sync.ts
 *
 * Covers: syncPlatform, syncAllPlatforms, upsertMarkets,
 * runFullSync, runIncrementalSync, updateSyncStatus (indirect), start, stop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFrom, mockExecute, mockDetectCategory } = vi.hoisted(() => {
  // Set env var before module loads (POLYROUTER_API_KEY is a module-level const)
  process.env.POLYROUTER_API_KEY = 'test-api-key';
  return {
    mockFrom: vi.fn(),
    mockExecute: vi.fn(),
    mockDetectCategory: vi.fn().mockReturnValue('politics'),
  };
});

vi.mock('../shared/utils/circuit-breaker.js', () => ({
  circuits: { polyrouter: { execute: mockExecute } },
}));
vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));
vi.mock('./market-service.js', () => ({
  marketService: { detectCategory: mockDetectCategory },
}));
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { marketSyncService } from './market-sync.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  q.upsert = vi.fn().mockReturnValue(q);
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function makeMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'market-1',
    platform: 'polymarket',
    platform_id: 'pm-1',
    title: 'Will X happen?',
    description: 'A test market',
    status: 'open',
    market_type: 'binary',
    category: 'politics',
    outcomes: [{ id: 'yes', name: 'Yes' }, { id: 'no', name: 'No' }],
    current_prices: { yes: { price: 0.6 }, no: { price: 0.4 } },
    volume_24h: 1000,
    volume_7d: null,
    volume_total: 50000,
    liquidity: 10000,
    open_interest: null,
    source_url: 'https://polymarket.com/market/pm-1',
    created_at: '2024-01-01T00:00:00Z',
    last_synced_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeResponse(
  markets: unknown[],
  hasMore = false,
  nextCursor: string | null = null,
) {
  return {
    pagination: { total: markets.length, limit: 100, has_more: hasMore, next_cursor: nextCursor },
    markets,
    meta: {},
  };
}

function stubFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(String(body)),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mockExecute.mockImplementation((fn: () => unknown) => fn());
  mockDetectCategory.mockReturnValue('politics');
  mockFrom.mockReturnValue(chain());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (marketSyncService as any).isSyncing = false;
});

afterEach(() => {
  marketSyncService.stop();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// syncPlatform
// ---------------------------------------------------------------------------

describe('syncPlatform', () => {
  it('returns the count of synced markets for a single page', async () => {
    stubFetch(makeResponse([makeMarket(), makeMarket({ id: 'market-2', platform_id: 'pm-2' })]));

    const total = await marketSyncService.syncPlatform('polymarket');

    expect(total).toBe(2);
  });

  it('includes platform, status=open, and limit=100 as query params', async () => {
    const fetchFn = stubFetch(makeResponse([makeMarket()]));

    await marketSyncService.syncPlatform('kalshi');

    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain('platform=kalshi');
    expect(url).toContain('status=open');
    expect(url).toContain('limit=100');
  });

  it('breaks immediately and returns 0 when markets array is empty', async () => {
    stubFetch(makeResponse([]));

    const total = await marketSyncService.syncPlatform('polymarket');

    expect(total).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('calls detectCategory when market category is "other"', async () => {
    stubFetch(makeResponse([makeMarket({ category: 'other' })]));

    await marketSyncService.syncPlatform('polymarket');

    expect(mockDetectCategory).toHaveBeenCalledTimes(1);
  });

  it('skips detectCategory when category is already set', async () => {
    stubFetch(makeResponse([makeMarket({ category: 'politics' })]));

    await marketSyncService.syncPlatform('polymarket');

    expect(mockDetectCategory).not.toHaveBeenCalled();
  });

  it('overrides source for non-polymarket/non-kalshi platforms', async () => {
    stubFetch(makeResponse([makeMarket({ platform: 'manifold', platform_id: 'mf-1' })]));

    await marketSyncService.syncPlatform('polymarket');

    const q = mockFrom.mock.results[0].value;
    const upsertedRows = q.upsert.mock.calls[0][0] as Array<{ source: string }>;
    expect(upsertedRows[0].source).toBe('manifold');
  });

  it('builds outcomes from current_prices when outcomes array is empty', async () => {
    const market = makeMarket({
      outcomes: [],
      current_prices: { yes: { price: 0.7 }, no: { price: 0.3 } },
    });
    stubFetch(makeResponse([market]));

    await marketSyncService.syncPlatform('polymarket');

    const q = mockFrom.mock.results[0].value;
    const upsertedRows = q.upsert.mock.calls[0][0] as Array<{ outcomes: unknown[] }>;
    expect(upsertedRows[0].outcomes.length).toBe(2);
  });

  it('stops after 3 consecutive errors and returns 0', async () => {
    mockExecute.mockRejectedValue(new Error('API down'));

    const syncPromise = marketSyncService.syncPlatform('polymarket');
    // REQUEST_DELAY_MS * 2 = 1300ms per retry; advance past all 3
    await vi.advanceTimersByTimeAsync(1300 * 3 + 100);

    expect(await syncPromise).toBe(0);
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// upsertMarkets
// ---------------------------------------------------------------------------

describe('upsertMarkets', () => {
  const market = {
    id: 'pm-1',
    source: 'polymarket' as const,
    question: 'Will X happen?',
    description: 'A test market',
    category: 'politics',
    outcomes: [],
    volume24h: 1000,
    totalVolume: 50000,
    liquidity: 10000,
    closeTime: 0,
    status: 'open' as const,
    url: 'https://polymarket.com/pm-1',
  };

  it('is a no-op and does not hit the DB when markets is empty', async () => {
    await marketSyncService.upsertMarkets([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('upserts rows with correct shape to aio_markets', async () => {
    await marketSyncService.upsertMarkets([market]);

    const q = mockFrom.mock.results[0].value;
    expect(mockFrom).toHaveBeenCalledWith('aio_markets');
    expect(q.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pm-1',
          source: 'polymarket',
          question: 'Will X happen?',
          category: 'politics',
          status: 'open',
        }),
      ]),
      { onConflict: 'id,source' },
    );
  });

  it('throws when DB returns an error', async () => {
    const dbError = { message: 'constraint violation', code: 'PGRST409' };
    mockFrom.mockReturnValueOnce(chain({ data: null, error: dbError }));

    await expect(marketSyncService.upsertMarkets([market])).rejects.toEqual(dbError);
  });
});

// ---------------------------------------------------------------------------
// syncAllPlatforms
// ---------------------------------------------------------------------------

describe('syncAllPlatforms', () => {
  it('returns total market count across all platforms', async () => {
    stubFetch(makeResponse([
      makeMarket({ platform: 'polymarket', platform_id: 'pm-1' }),
      makeMarket({ platform: 'kalshi', platform_id: 'ks-1' }),
    ]));

    const total = await marketSyncService.syncAllPlatforms();

    expect(total).toBe(2);
  });

  it('groups markets by platform and upserts each group separately', async () => {
    stubFetch(makeResponse([
      makeMarket({ platform: 'polymarket', platform_id: 'pm-1' }),
      makeMarket({ platform: 'kalshi', platform_id: 'ks-1' }),
    ]));

    await marketSyncService.syncAllPlatforms();

    // One upsert call per platform group → two from('aio_markets') calls
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenCalledWith('aio_markets');
  });
});

// ---------------------------------------------------------------------------
// runFullSync
// ---------------------------------------------------------------------------

describe('runFullSync', () => {
  it('returns early without fetching when already syncing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (marketSyncService as any).isSyncing = true;

    await marketSyncService.runFullSync();

    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('syncs polymarket and kalshi, then updates sync status', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: vi.fn().mockResolvedValue(makeResponse([makeMarket()])),
        text: vi.fn().mockResolvedValue(''),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: vi.fn().mockResolvedValue(makeResponse([makeMarket({ platform: 'kalshi', platform_id: 'ks-1' })])),
        text: vi.fn().mockResolvedValue(''),
      });
    vi.stubGlobal('fetch', fetchFn);

    await marketSyncService.runFullSync();

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenCalledWith('aio_sync_status');
  });

  it('resets isSyncing to false in the finally block', async () => {
    stubFetch(makeResponse([]));

    await marketSyncService.runFullSync();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((marketSyncService as any).isSyncing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runIncrementalSync
// ---------------------------------------------------------------------------

describe('runIncrementalSync', () => {
  it('returns early without fetching when already syncing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (marketSyncService as any).isSyncing = true;

    await marketSyncService.runIncrementalSync();

    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('fetches first page from both platforms concurrently', async () => {
    stubFetch(makeResponse([makeMarket()]));

    await marketSyncService.runIncrementalSync();

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('upserts markets and updates aio_sync_status', async () => {
    stubFetch(makeResponse([makeMarket()]));

    await marketSyncService.runIncrementalSync();

    expect(mockFrom).toHaveBeenCalledWith('aio_markets');
    expect(mockFrom).toHaveBeenCalledWith('aio_sync_status');
  });

  it('continues gracefully when one platform fetch fails', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: vi.fn().mockResolvedValue(makeResponse([makeMarket()])),
        text: vi.fn().mockResolvedValue(''),
      })
      .mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchFn);

    await expect(marketSyncService.runIncrementalSync()).resolves.toBeUndefined();
    // Polymarket succeeded → aio_markets upserted
    expect(mockFrom).toHaveBeenCalledWith('aio_markets');
  });
});

// ---------------------------------------------------------------------------
// start / stop
// ---------------------------------------------------------------------------

describe('start / stop', () => {
  it('start calls runFullSync immediately and sets interval timers', () => {
    vi.spyOn(marketSyncService, 'runFullSync').mockResolvedValue(undefined);
    vi.spyOn(marketSyncService, 'runIncrementalSync').mockResolvedValue(undefined);

    marketSyncService.start();

    expect(marketSyncService.runFullSync).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((marketSyncService as any).fullSyncTimer).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((marketSyncService as any).incrementalSyncTimer).not.toBeNull();
  });

  it('stop clears both interval timers and nullifies the handles', () => {
    vi.spyOn(marketSyncService, 'runFullSync').mockResolvedValue(undefined);
    vi.spyOn(marketSyncService, 'runIncrementalSync').mockResolvedValue(undefined);

    marketSyncService.start();
    marketSyncService.stop();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((marketSyncService as any).fullSyncTimer).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((marketSyncService as any).incrementalSyncTimer).toBeNull();
  });
});
