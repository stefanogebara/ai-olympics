/**
 * Tests for manifold-client.ts
 *
 * Covers: ManifoldClient (getMarkets, getMarket, getMarketBySlug,
 * searchMarkets, getMarketBets) and pure helpers (calculateShares,
 * poolToProbability, calculateExpectedValue, getImpliedProbability,
 * formatMarketSummary).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('../shared/utils/circuit-breaker.js', () => ({
  circuits: { manifold: { execute: mockExecute } },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  ManifoldClient,
  calculateShares,
  poolToProbability,
  calculateExpectedValue,
  getImpliedProbability,
  formatMarketSummary,
} from './manifold-client.js';
import type { ManifoldMarket } from './manifold-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MANIFOLD_BASE = 'https://api.manifold.markets';

function mockResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

/** Configure mockExecute to call through to the provided fetch mock. */
function setupFetch(fetchMock: ReturnType<typeof vi.fn>) {
  mockExecute.mockImplementation((fn: () => Promise<Response>) => fn());
  vi.stubGlobal('fetch', fetchMock);
}

const makeMarket = (overrides: Partial<ManifoldMarket> = {}): ManifoldMarket => ({
  id: 'market-1',
  creatorId: 'creator-1',
  creatorUsername: 'testuser',
  creatorName: 'Test User',
  createdTime: 1700000000000,
  question: 'Will AI win chess by 2030?',
  slug: 'will-ai-win-chess-2030',
  url: 'https://manifold.markets/testuser/will-ai-win-chess-2030',
  pool: { YES: 100, NO: 150 },
  probability: 0.6,
  totalLiquidity: 250,
  outcomeType: 'BINARY',
  mechanism: 'cpmm-1',
  volume: 1000,
  volume24Hours: 50,
  isResolved: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// ManifoldClient — getMarkets
// ---------------------------------------------------------------------------

describe('ManifoldClient.getMarkets', () => {
  let client: ManifoldClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ManifoldClient();
    fetchMock = vi.fn();
    setupFetch(fetchMock);
  });

  it('calls /v0/markets with no params when called with defaults', async () => {
    const markets = [makeMarket()];
    fetchMock.mockResolvedValue(mockResponse(markets));

    await client.getMarkets();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`${MANIFOLD_BASE}/v0/markets`)
    );
  });

  it('returns parsed JSON array', async () => {
    const markets = [makeMarket({ id: 'a' }), makeMarket({ id: 'b' })];
    fetchMock.mockResolvedValue(mockResponse(markets));

    const result = await client.getMarkets();

    expect(result).toEqual(markets);
  });

  it('includes limit, sort, filter, contractType, and before in the URL', async () => {
    fetchMock.mockResolvedValue(mockResponse([]));

    await client.getMarkets({
      limit: 10,
      sort: 'score',
      filter: 'open',
      contractType: 'BINARY',
      before: 'cursor-xyz',
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
    expect(url).toContain('sort=score');
    expect(url).toContain('filter=open');
    expect(url).toContain('contractType=BINARY');
    expect(url).toContain('before=cursor-xyz');
  });

  it('throws when the response is not ok', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, false, 500));

    await expect(client.getMarkets()).rejects.toThrow('Failed to fetch markets: 500');
  });
});

// ---------------------------------------------------------------------------
// ManifoldClient — getMarket
// ---------------------------------------------------------------------------

describe('ManifoldClient.getMarket', () => {
  let client: ManifoldClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ManifoldClient();
    fetchMock = vi.fn();
    setupFetch(fetchMock);
  });

  it('calls /v0/market/:id', async () => {
    fetchMock.mockResolvedValue(mockResponse(makeMarket()));

    await client.getMarket('market-42');

    expect(fetchMock).toHaveBeenCalledWith(`${MANIFOLD_BASE}/v0/market/market-42`);
  });

  it('returns the market object', async () => {
    const market = makeMarket({ id: 'market-42', question: 'Test question?' });
    fetchMock.mockResolvedValue(mockResponse(market));

    const result = await client.getMarket('market-42');

    expect(result).toEqual(market);
  });

  it('throws with market ID in the error message when not ok', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, false, 404));

    await expect(client.getMarket('missing-id')).rejects.toThrow('missing-id');
  });
});

// ---------------------------------------------------------------------------
// ManifoldClient — getMarketBySlug
// ---------------------------------------------------------------------------

describe('ManifoldClient.getMarketBySlug', () => {
  let client: ManifoldClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ManifoldClient();
    fetchMock = vi.fn();
    setupFetch(fetchMock);
  });

  it('calls /v0/slug/:slug', async () => {
    fetchMock.mockResolvedValue(mockResponse(makeMarket()));

    await client.getMarketBySlug('will-ai-win-chess-2030');

    expect(fetchMock).toHaveBeenCalledWith(
      `${MANIFOLD_BASE}/v0/slug/will-ai-win-chess-2030`
    );
  });

  it('returns the market object', async () => {
    const market = makeMarket({ slug: 'my-slug' });
    fetchMock.mockResolvedValue(mockResponse(market));

    const result = await client.getMarketBySlug('my-slug');

    expect(result).toEqual(market);
  });

  it('throws with slug in the error message when not ok', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, false, 404));

    await expect(client.getMarketBySlug('bad-slug')).rejects.toThrow('bad-slug');
  });
});

// ---------------------------------------------------------------------------
// ManifoldClient — searchMarkets
// ---------------------------------------------------------------------------

describe('ManifoldClient.searchMarkets', () => {
  let client: ManifoldClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ManifoldClient();
    fetchMock = vi.fn();
    setupFetch(fetchMock);
  });

  it('calls /v0/search-markets with the query as "term"', async () => {
    fetchMock.mockResolvedValue(mockResponse([]));

    await client.searchMarkets('AI sports');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`${MANIFOLD_BASE}/v0/search-markets`);
    expect(url).toContain('term=AI+sports');
  });

  it('includes optional params in the URL', async () => {
    fetchMock.mockResolvedValue(mockResponse([]));

    await client.searchMarkets('chess', {
      limit: 5,
      filter: 'open',
      sort: 'relevance',
      contractType: 'BINARY',
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=5');
    expect(url).toContain('filter=open');
    expect(url).toContain('sort=relevance');
    expect(url).toContain('contractType=BINARY');
  });

  it('returns the array of markets', async () => {
    const markets = [makeMarket({ id: 'x' })];
    fetchMock.mockResolvedValue(mockResponse(markets));

    const result = await client.searchMarkets('chess');

    expect(result).toEqual(markets);
  });

  it('throws when the response is not ok', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, false, 500));

    await expect(client.searchMarkets('error')).rejects.toThrow('Failed to search markets');
  });
});

// ---------------------------------------------------------------------------
// ManifoldClient — getMarketBets
// ---------------------------------------------------------------------------

describe('ManifoldClient.getMarketBets', () => {
  let client: ManifoldClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ManifoldClient();
    fetchMock = vi.fn();
    setupFetch(fetchMock);
  });

  it('calls /v0/bets with contractId and default limit 100', async () => {
    fetchMock.mockResolvedValue(mockResponse([]));

    await client.getMarketBets('market-99');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`${MANIFOLD_BASE}/v0/bets`);
    expect(url).toContain('contractId=market-99');
    expect(url).toContain('limit=100');
  });

  it('uses the provided limit', async () => {
    fetchMock.mockResolvedValue(mockResponse([]));

    await client.getMarketBets('market-99', 25);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=25');
  });

  it('returns the array of bets', async () => {
    const bets = [
      { id: 'bet-1', userId: 'u1', contractId: 'market-99', amount: 10, shares: 15,
        outcome: 'YES', probBefore: 0.5, probAfter: 0.55, createdTime: 1700000000 },
    ];
    fetchMock.mockResolvedValue(mockResponse(bets));

    const result = await client.getMarketBets('market-99');

    expect(result).toEqual(bets);
  });

  it('throws with market ID in the error message when not ok', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, false, 404));

    await expect(client.getMarketBets('bad-market')).rejects.toThrow('bad-market');
  });
});

// ---------------------------------------------------------------------------
// calculateShares
// ---------------------------------------------------------------------------

describe('calculateShares', () => {
  it('calculates YES shares using CPMM formula', () => {
    // pool YES=100, NO=150, amount=50
    // k = 100 * 150 = 15000
    // shares = 100 - 15000 / (150 + 50) = 100 - 75 = 25
    const shares = calculateShares({ YES: 100, NO: 150 }, 50, 'YES');
    expect(shares).toBeCloseTo(25, 5);
  });

  it('calculates NO shares using CPMM formula', () => {
    // pool YES=100, NO=150, amount=50
    // k = 100 * 150 = 15000
    // shares = 150 - 15000 / (100 + 50) = 150 - 100 = 50
    const shares = calculateShares({ YES: 100, NO: 150 }, 50, 'NO');
    expect(shares).toBeCloseTo(50, 5);
  });

  it('returns amount as fallback when YES pool is zero', () => {
    const shares = calculateShares({ YES: 0, NO: 100 }, 30, 'YES');
    expect(shares).toBe(30);
  });

  it('returns amount as fallback when NO pool is zero', () => {
    const shares = calculateShares({ YES: 100, NO: 0 }, 30, 'NO');
    expect(shares).toBe(30);
  });

  it('returns amount as fallback when both pools are zero', () => {
    const shares = calculateShares({ YES: 0, NO: 0 }, 40, 'YES');
    expect(shares).toBe(40);
  });

  it('returns at least 0 (never negative)', () => {
    // Very large amount — but the formula should still stay non-negative
    const shares = calculateShares({ YES: 10, NO: 10 }, 1000000, 'YES');
    expect(shares).toBeGreaterThanOrEqual(0);
  });

  it('returns more shares for larger amounts (monotonic)', () => {
    const pool = { YES: 200, NO: 200 };
    const small = calculateShares(pool, 10, 'YES');
    const large = calculateShares(pool, 100, 'YES');
    expect(large).toBeGreaterThan(small);
  });
});

// ---------------------------------------------------------------------------
// poolToProbability
// ---------------------------------------------------------------------------

describe('poolToProbability', () => {
  it('returns n / (y + n) for a normal pool', () => {
    // YES=100, NO=150 → 150/250 = 0.6
    expect(poolToProbability({ YES: 100, NO: 150 })).toBeCloseTo(0.6, 10);
  });

  it('returns 0.5 for an equal pool', () => {
    expect(poolToProbability({ YES: 100, NO: 100 })).toBe(0.5);
  });

  it('returns 0.5 for an empty pool (both zero)', () => {
    expect(poolToProbability({ YES: 0, NO: 0 })).toBe(0.5);
  });

  it('returns 0 when NO pool is 0 (certainty YES)', () => {
    expect(poolToProbability({ YES: 100, NO: 0 })).toBe(0);
  });

  it('returns 1 when YES pool is 0 (certainty NO)', () => {
    expect(poolToProbability({ YES: 0, NO: 100 })).toBe(1);
  });

  it('treats missing keys as 0', () => {
    expect(poolToProbability({})).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// calculateExpectedValue
// ---------------------------------------------------------------------------

describe('calculateExpectedValue', () => {
  const pool = { YES: 100, NO: 100 };

  it('returns positive EV when market probability < true probability for YES', () => {
    // Buying YES: pool p = 0.5 (50%), but true probability = 0.8 → positive EV
    const ev = calculateExpectedValue(pool, 10, 'YES', 0.8);
    expect(ev).toBeGreaterThan(0);
  });

  it('returns negative EV when market probability > true probability for YES', () => {
    // Market p = 0.5, true probability = 0.2 → negative EV for YES bet
    const ev = calculateExpectedValue(pool, 10, 'YES', 0.2);
    expect(ev).toBeLessThan(0);
  });

  it('returns positive EV for NO bet when true probability is low', () => {
    const ev = calculateExpectedValue(pool, 10, 'NO', 0.2);
    expect(ev).toBeGreaterThan(0);
  });

  it('uses calculateShares internally (consistent with it)', () => {
    const amount = 50;
    const shares = calculateShares(pool, amount, 'YES');
    const trueProbability = 0.7;
    const ev = calculateExpectedValue(pool, amount, 'YES', trueProbability);

    // EV = winProb * shares - lossProb * amount
    const expected = trueProbability * shares - (1 - trueProbability) * amount;
    expect(ev).toBeCloseTo(expected, 10);
  });
});

// ---------------------------------------------------------------------------
// getImpliedProbability
// ---------------------------------------------------------------------------

describe('getImpliedProbability', () => {
  it('returns market.probability when present', () => {
    const market = makeMarket({ probability: 0.72, pool: { YES: 100, NO: 50 } });
    expect(getImpliedProbability(market)).toBe(0.72);
  });

  it('falls back to poolToProbability when probability is undefined', () => {
    const market = makeMarket({ probability: undefined, pool: { YES: 100, NO: 150 } });
    // 150 / (100 + 150) = 0.6
    expect(getImpliedProbability(market)).toBeCloseTo(0.6, 10);
  });

  it('returns 0.5 when both probability and pool are absent', () => {
    const market = makeMarket({ probability: undefined, pool: undefined as unknown as Record<string, number> });
    expect(getImpliedProbability(market)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// formatMarketSummary
// ---------------------------------------------------------------------------

describe('formatMarketSummary', () => {
  it('includes the question', () => {
    const market = makeMarket({ question: 'Will AI beat humans at chess?', probability: 0.8 });
    const summary = formatMarketSummary(market);
    expect(summary).toContain('Will AI beat humans at chess?');
  });

  it('shows probability as a percentage', () => {
    const market = makeMarket({ probability: 0.755 });
    const summary = formatMarketSummary(market);
    expect(summary).toContain('75.5%');
  });

  it('shows formatted volume', () => {
    const market = makeMarket({ volume: 2000, probability: 0.5 });
    const summary = formatMarketSummary(market);
    expect(summary).toContain('2,000');
  });

  it('shows "No close date" when closeTime is absent', () => {
    const market = makeMarket({ closeTime: undefined, probability: 0.5 });
    const summary = formatMarketSummary(market);
    expect(summary).toContain('No close date');
  });

  it('shows a date string when closeTime is present', () => {
    const market = makeMarket({ closeTime: 1893456000000, probability: 0.5 }); // 2030-01-01
    const summary = formatMarketSummary(market);
    expect(summary).toMatch(/Closes: \S+/);
    expect(summary).not.toContain('No close date');
  });
});
