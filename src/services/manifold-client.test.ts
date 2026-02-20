import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies BEFORE importing the module
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../shared/utils/circuit-breaker.js', () => ({
  circuits: {
    manifold: {
      execute: vi.fn((fn: () => Promise<any>) => fn()),
    },
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks are set up
const {
  ManifoldClient,
  calculateShares,
  poolToProbability,
  calculateExpectedValue,
  getImpliedProbability,
  formatMarketSummary,
} = await import('./manifold-client.js');

// ============================================================================
// MOCK DATA
// ============================================================================

const mockMarket = {
  id: 'market-1',
  creatorId: 'user-1',
  creatorUsername: 'testuser',
  creatorName: 'Test User',
  createdTime: Date.now() - 86400000,
  question: 'Will AI pass the Turing test?',
  slug: 'will-ai-pass-turing-test',
  url: 'https://manifold.markets/testuser/will-ai-pass-turing-test',
  pool: { YES: 100, NO: 200 },
  probability: 0.65,
  totalLiquidity: 300,
  outcomeType: 'BINARY' as const,
  mechanism: 'cpmm-1' as const,
  volume: 5000,
  volume24Hours: 500,
  isResolved: false,
  closeTime: Date.now() + 86400000,
};

const mockMarket2 = {
  ...mockMarket,
  id: 'market-2',
  question: 'Will GPT-5 be released in 2026?',
  slug: 'will-gpt5-be-released-2026',
  pool: { YES: 300, NO: 100 },
  probability: 0.45,
  volume: 12000,
  volume24Hours: 1500,
};

const mockBet = {
  id: 'bet-1',
  userId: 'user-1',
  contractId: 'market-1',
  amount: 50,
  shares: 75,
  outcome: 'YES',
  probBefore: 0.6,
  probAfter: 0.65,
  createdTime: Date.now(),
};

// ============================================================================
// HELPER: create mock Response
// ============================================================================

function createMockResponse(data: unknown, ok = true, status = 200, statusText = 'OK'): Response {
  return {
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(data),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    text: vi.fn(),
    bytes: vi.fn(),
  } as unknown as Response;
}

// ============================================================================
// TESTS
// ============================================================================

describe('ManifoldClient', () => {
  let client: InstanceType<typeof ManifoldClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    client = new ManifoldClient();
  });

  // --------------------------------------------------------------------------
  // getMarkets
  // --------------------------------------------------------------------------
  describe('getMarkets', () => {
    it('fetches markets with no options', async () => {
      mockFetch.mockResolvedValue(createMockResponse([mockMarket]));

      const result = await client.getMarkets();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://api.manifold.markets/v0/markets');
      expect(result).toEqual([mockMarket]);
    });

    it('builds URL with limit parameter', async () => {
      mockFetch.mockResolvedValue(createMockResponse([mockMarket]));

      await client.getMarkets({ limit: 10 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=10');
    });

    it('builds URL with sort parameter', async () => {
      mockFetch.mockResolvedValue(createMockResponse([]));

      await client.getMarkets({ sort: 'newest' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('sort=newest');
    });

    it('builds URL with filter parameter', async () => {
      mockFetch.mockResolvedValue(createMockResponse([]));

      await client.getMarkets({ filter: 'open' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('filter=open');
    });

    it('builds URL with contractType parameter', async () => {
      mockFetch.mockResolvedValue(createMockResponse([]));

      await client.getMarkets({ contractType: 'BINARY' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('contractType=BINARY');
    });

    it('builds URL with before parameter', async () => {
      mockFetch.mockResolvedValue(createMockResponse([]));

      await client.getMarkets({ before: 'abc-cursor' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('before=abc-cursor');
    });

    it('builds URL with all parameters combined', async () => {
      mockFetch.mockResolvedValue(createMockResponse([]));

      await client.getMarkets({
        limit: 20,
        sort: 'liquidity',
        filter: 'resolved',
        contractType: 'MULTIPLE_CHOICE',
        before: 'xyz-cursor',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=20');
      expect(calledUrl).toContain('sort=liquidity');
      expect(calledUrl).toContain('filter=resolved');
      expect(calledUrl).toContain('contractType=MULTIPLE_CHOICE');
      expect(calledUrl).toContain('before=xyz-cursor');
    });

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, false, 500, 'Internal Server Error'));

      await expect(client.getMarkets()).rejects.toThrow(
        'Failed to fetch markets: 500 Internal Server Error'
      );
    });

    it('throws error on 404 response', async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, false, 404, 'Not Found'));

      await expect(client.getMarkets()).rejects.toThrow(
        'Failed to fetch markets: 404 Not Found'
      );
    });

    it('returns parsed JSON data from response', async () => {
      const markets = [mockMarket, mockMarket2];
      mockFetch.mockResolvedValue(createMockResponse(markets));

      const result = await client.getMarkets();

      expect(result).toEqual(markets);
      expect(result).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // getMarket
  // --------------------------------------------------------------------------
  describe('getMarket', () => {
    it('builds correct URL with marketId', async () => {
      mockFetch.mockResolvedValue(createMockResponse(mockMarket));

      const result = await client.getMarket('market-1');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://api.manifold.markets/v0/market/market-1');
      expect(result).toEqual(mockMarket);
    });

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, false, 404, 'Not Found'));

      await expect(client.getMarket('nonexistent')).rejects.toThrow(
        'Failed to fetch market nonexistent: 404 Not Found'
      );
    });

    it('handles different market IDs', async () => {
      mockFetch.mockResolvedValue(createMockResponse(mockMarket2));

      await client.getMarket('market-2');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/v0/market/market-2');
    });
  });

  // --------------------------------------------------------------------------
  // getMarketBySlug
  // --------------------------------------------------------------------------
  describe('getMarketBySlug', () => {
    it('builds correct URL with slug', async () => {
      mockFetch.mockResolvedValue(createMockResponse(mockMarket));

      const result = await client.getMarketBySlug('will-ai-pass-turing-test');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://api.manifold.markets/v0/slug/will-ai-pass-turing-test');
      expect(result).toEqual(mockMarket);
    });

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, false, 404, 'Not Found'));

      await expect(client.getMarketBySlug('nonexistent-slug')).rejects.toThrow(
        'Failed to fetch market with slug nonexistent-slug: 404 Not Found'
      );
    });

    it('returns parsed market data', async () => {
      mockFetch.mockResolvedValue(createMockResponse(mockMarket));

      const result = await client.getMarketBySlug('will-ai-pass-turing-test');

      expect(result.id).toBe('market-1');
      expect(result.question).toBe('Will AI pass the Turing test?');
    });
  });

  // --------------------------------------------------------------------------
  // searchMarkets
  // --------------------------------------------------------------------------
  describe('searchMarkets', () => {
    it('builds URL with search term', async () => {
      mockFetch.mockResolvedValue(createMockResponse([mockMarket]));

      await client.searchMarkets('AI');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://api.manifold.markets/v0/search-markets');
      expect(calledUrl).toContain('term=AI');
    });

    it('builds URL with all search options', async () => {
      mockFetch.mockResolvedValue(createMockResponse([]));

      await client.searchMarkets('election', {
        limit: 5,
        filter: 'open',
        sort: 'relevance',
        contractType: 'BINARY',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('term=election');
      expect(calledUrl).toContain('limit=5');
      expect(calledUrl).toContain('filter=open');
      expect(calledUrl).toContain('sort=relevance');
      expect(calledUrl).toContain('contractType=BINARY');
    });

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, false, 500, 'Internal Server Error'));

      await expect(client.searchMarkets('test')).rejects.toThrow(
        'Failed to search markets: 500 Internal Server Error'
      );
    });

    it('returns matching markets', async () => {
      const markets = [mockMarket, mockMarket2];
      mockFetch.mockResolvedValue(createMockResponse(markets));

      const result = await client.searchMarkets('AI');

      expect(result).toEqual(markets);
      expect(result).toHaveLength(2);
    });

    it('handles empty search results', async () => {
      mockFetch.mockResolvedValue(createMockResponse([]));

      const result = await client.searchMarkets('xyznonexistent');

      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getMarketBets
  // --------------------------------------------------------------------------
  describe('getMarketBets', () => {
    it('builds URL with contractId and default limit', async () => {
      mockFetch.mockResolvedValue(createMockResponse([mockBet]));

      await client.getMarketBets('market-1');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://api.manifold.markets/v0/bets');
      expect(calledUrl).toContain('contractId=market-1');
      expect(calledUrl).toContain('limit=100');
    });

    it('builds URL with custom limit', async () => {
      mockFetch.mockResolvedValue(createMockResponse([]));

      await client.getMarketBets('market-1', 50);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=50');
    });

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, false, 403, 'Forbidden'));

      await expect(client.getMarketBets('market-1')).rejects.toThrow(
        'Failed to fetch bets for market market-1: 403 Forbidden'
      );
    });

    it('returns parsed bets data', async () => {
      const bets = [mockBet, { ...mockBet, id: 'bet-2', outcome: 'NO' }];
      mockFetch.mockResolvedValue(createMockResponse(bets));

      const result = await client.getMarketBets('market-1');

      expect(result).toEqual(bets);
      expect(result).toHaveLength(2);
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

describe('calculateShares', () => {
  it('calculates YES shares correctly for standard pool', () => {
    const pool = { YES: 100, NO: 200 };
    const shares = calculateShares(pool, 50, 'YES');

    // k = 100 * 200 = 20000
    // shares = 100 - 20000 / (200 + 50) = 100 - 80 = 20
    expect(shares).toBeCloseTo(20, 5);
  });

  it('calculates NO shares correctly for standard pool', () => {
    const pool = { YES: 100, NO: 200 };
    const shares = calculateShares(pool, 50, 'NO');

    // k = 100 * 200 = 20000
    // shares = 200 - 20000 / (100 + 50) = 200 - 133.33 = 66.67
    expect(shares).toBeCloseTo(66.6667, 3);
  });

  it('returns amount as fallback when YES pool is 0', () => {
    const pool = { YES: 0, NO: 200 };
    const shares = calculateShares(pool, 50, 'YES');

    expect(shares).toBe(50);
  });

  it('returns amount as fallback when NO pool is 0', () => {
    const pool = { YES: 100, NO: 0 };
    const shares = calculateShares(pool, 50, 'NO');

    expect(shares).toBe(50);
  });

  it('returns amount as fallback for completely empty pool', () => {
    const pool = {};
    const shares = calculateShares(pool, 100, 'YES');

    expect(shares).toBe(100);
  });

  it('returns non-negative shares via Math.max(0, ...)', () => {
    // Even with odd inputs, shares should never be negative
    const pool = { YES: 100, NO: 200 };
    const shares = calculateShares(pool, 0, 'YES');

    expect(shares).toBeGreaterThanOrEqual(0);
  });

  it('calculates correctly for equal pool balances', () => {
    const pool = { YES: 100, NO: 100 };
    const shares = calculateShares(pool, 50, 'YES');

    // k = 100 * 100 = 10000
    // shares = 100 - 10000 / (100 + 50) = 100 - 66.67 = 33.33
    expect(shares).toBeCloseTo(33.3333, 3);
  });

  it('calculates correctly for large bet amounts', () => {
    const pool = { YES: 1000, NO: 1000 };
    const shares = calculateShares(pool, 10000, 'YES');

    // k = 1000 * 1000 = 1000000
    // shares = 1000 - 1000000 / (1000 + 10000) = 1000 - 90.91 = 909.09
    expect(shares).toBeCloseTo(909.0909, 3);
  });

  it('returns 0 shares for 0 bet amount', () => {
    const pool = { YES: 100, NO: 200 };
    const shares = calculateShares(pool, 0, 'YES');

    // k = 20000
    // shares = 100 - 20000 / 200 = 100 - 100 = 0
    expect(shares).toBe(0);
  });
});

describe('poolToProbability', () => {
  it('calculates probability from pool balances', () => {
    const pool = { YES: 100, NO: 200 };
    const prob = poolToProbability(pool);

    // prob = NO / (YES + NO) = 200 / 300 = 0.6667
    expect(prob).toBeCloseTo(0.6667, 3);
  });

  it('returns 0.5 for empty pool', () => {
    const pool = {};
    const prob = poolToProbability(pool);

    expect(prob).toBe(0.5);
  });

  it('returns 0.5 when both YES and NO are 0', () => {
    const pool = { YES: 0, NO: 0 };
    const prob = poolToProbability(pool);

    expect(prob).toBe(0.5);
  });

  it('returns high probability when NO pool is much larger', () => {
    const pool = { YES: 10, NO: 990 };
    const prob = poolToProbability(pool);

    // prob = 990 / 1000 = 0.99
    expect(prob).toBeCloseTo(0.99, 2);
  });

  it('returns low probability when YES pool is much larger', () => {
    const pool = { YES: 990, NO: 10 };
    const prob = poolToProbability(pool);

    // prob = 10 / 1000 = 0.01
    expect(prob).toBeCloseTo(0.01, 2);
  });

  it('returns 0.5 for equal pool balances', () => {
    const pool = { YES: 500, NO: 500 };
    const prob = poolToProbability(pool);

    expect(prob).toBe(0.5);
  });

  it('handles missing YES key', () => {
    const pool = { NO: 100 };
    const prob = poolToProbability(pool);

    // YES defaults to 0, prob = 100 / (0 + 100) = 1.0
    expect(prob).toBe(1.0);
  });

  it('handles missing NO key', () => {
    const pool = { YES: 100 };
    const prob = poolToProbability(pool);

    // NO defaults to 0, prob = 0 / (100 + 0) = 0.0
    expect(prob).toBe(0.0);
  });
});

describe('calculateExpectedValue', () => {
  it('calculates positive EV for underpriced YES outcome', () => {
    const pool = { YES: 100, NO: 200 };
    // Market implies ~66.7% YES probability
    // If we believe true prob is 90%, YES is underpriced
    const ev = calculateExpectedValue(pool, 50, 'YES', 0.9);

    // shares = 20 (from CPMM)
    // expectedWin = 0.9 * 20 = 18
    // expectedLoss = 0.1 * 50 = 5
    // EV = 18 - 5 = 13
    expect(ev).toBeCloseTo(13, 0);
  });

  it('calculates negative EV for overpriced YES outcome', () => {
    const pool = { YES: 100, NO: 200 };
    // If we believe true prob is 10%, YES is overpriced
    const ev = calculateExpectedValue(pool, 50, 'YES', 0.1);

    // shares = 20
    // expectedWin = 0.1 * 20 = 2
    // expectedLoss = 0.9 * 50 = 45
    // EV = 2 - 45 = -43
    expect(ev).toBeCloseTo(-43, 0);
  });

  it('calculates EV for NO outcome', () => {
    const pool = { YES: 100, NO: 200 };
    // For NO outcome: winProbability = 1 - trueProbability
    const ev = calculateExpectedValue(pool, 50, 'NO', 0.3);

    // shares for NO = 200 - 20000 / (100 + 50) = 66.67
    // winProbability (NO wins) = 1 - 0.3 = 0.7
    // expectedWin = 0.7 * 66.67 = 46.67
    // expectedLoss = 0.3 * 50 = 15
    // EV = 46.67 - 15 = 31.67
    expect(ev).toBeCloseTo(31.67, 0);
  });

  it('returns 0 EV for 0 bet amount', () => {
    const pool = { YES: 100, NO: 200 };
    const ev = calculateExpectedValue(pool, 0, 'YES', 0.5);

    // shares = 0, expectedWin = 0, expectedLoss = 0
    expect(ev).toBe(0);
  });

  it('calculates EV at 50% true probability', () => {
    const pool = { YES: 100, NO: 100 };
    const ev = calculateExpectedValue(pool, 50, 'YES', 0.5);

    // shares = 33.33
    // expectedWin = 0.5 * 33.33 = 16.67
    // expectedLoss = 0.5 * 50 = 25
    // EV = 16.67 - 25 = -8.33
    expect(ev).toBeCloseTo(-8.33, 0);
  });
});

describe('getImpliedProbability', () => {
  it('returns probability field when available', () => {
    const prob = getImpliedProbability(mockMarket);

    expect(prob).toBe(0.65);
  });

  it('falls back to pool calculation when probability is undefined', () => {
    const market = {
      ...mockMarket,
      probability: undefined,
      pool: { YES: 100, NO: 200 },
    };
    const prob = getImpliedProbability(market);

    // poolToProbability: 200 / 300 = 0.6667
    expect(prob).toBeCloseTo(0.6667, 3);
  });

  it('returns 0.5 when neither probability nor pool is available', () => {
    const market = {
      ...mockMarket,
      probability: undefined,
      pool: undefined as any,
    };
    const prob = getImpliedProbability(market);

    expect(prob).toBe(0.5);
  });

  it('returns 0 probability correctly', () => {
    const market = { ...mockMarket, probability: 0 };
    // probability is 0, but 0 is a defined value
    // However, `if (market.probability !== undefined)` would catch this
    const prob = getImpliedProbability(market);

    expect(prob).toBe(0);
  });

  it('returns 1.0 probability correctly', () => {
    const market = { ...mockMarket, probability: 1.0 };
    const prob = getImpliedProbability(market);

    expect(prob).toBe(1.0);
  });

  it('uses pool when probability is explicitly undefined', () => {
    const market = {
      ...mockMarket,
      probability: undefined,
      pool: { YES: 50, NO: 50 },
    };
    const prob = getImpliedProbability(market);

    expect(prob).toBe(0.5);
  });
});

describe('formatMarketSummary', () => {
  it('formats market summary with all fields', () => {
    const summary = formatMarketSummary(mockMarket);

    expect(summary).toContain('Will AI pass the Turing test?');
    expect(summary).toContain('65.0%');
    expect(summary).toContain('5,000');
    // closeTime is set, so there should be a date
    expect(summary).not.toContain('No close date');
  });

  it('shows "No close date" when closeTime is missing', () => {
    const market = { ...mockMarket, closeTime: undefined };
    const summary = formatMarketSummary(market);

    expect(summary).toContain('No close date');
  });

  it('formats probability as percentage', () => {
    const market = { ...mockMarket, probability: 0.123 };
    const summary = formatMarketSummary(market);

    expect(summary).toContain('12.3%');
  });

  it('formats volume with locale string', () => {
    const market = { ...mockMarket, volume: 1234567 };
    const summary = formatMarketSummary(market);

    // toLocaleString formats with commas (in en-US)
    expect(summary).toContain('M$');
  });

  it('includes Probability label', () => {
    const summary = formatMarketSummary(mockMarket);

    expect(summary).toContain('Probability:');
  });

  it('includes Volume label', () => {
    const summary = formatMarketSummary(mockMarket);

    expect(summary).toContain('Volume:');
  });

  it('includes Closes label', () => {
    const summary = formatMarketSummary(mockMarket);

    expect(summary).toContain('Closes:');
  });

  it('formats with newline between question and details', () => {
    const summary = formatMarketSummary(mockMarket);
    const lines = summary.split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Will AI pass the Turing test?');
    expect(lines[1]).toContain('Probability:');
  });

  it('handles 100% probability', () => {
    const market = { ...mockMarket, probability: 1.0 };
    const summary = formatMarketSummary(market);

    expect(summary).toContain('100.0%');
  });

  it('handles 0% probability', () => {
    const market = { ...mockMarket, probability: 0 };
    const summary = formatMarketSummary(market);

    expect(summary).toContain('0.0%');
  });
});
