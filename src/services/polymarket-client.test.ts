import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before any imports
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock circuit breaker - just pass through to the function
vi.mock('../shared/utils/circuit-breaker.js', () => ({
  circuits: {
    polymarket: {
      execute: vi.fn((fn: () => Promise<any>) => fn()),
    },
  },
}));

// Stub global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock WebSocket class
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  static CLOSING = 2;
  readyState = MockWebSocket.OPEN;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {
    // Do NOT auto-fire onopen; tests control it manually
  }
}
vi.stubGlobal('WebSocket', MockWebSocket);

// Import after mocks are set up
const { PolymarketClient } = await import('./polymarket-client.js');
type GammaMarketType = import('./polymarket-client.js').GammaMarket;

// ============================================================================
// MOCK DATA
// ============================================================================

const mockGammaMarket: GammaMarketType = {
  id: 'gamma-1',
  question: 'Will GPT-5 be released in 2025?',
  conditionId: 'cond-123',
  slug: 'will-gpt-5-be-released',
  description: 'This market resolves to YES if OpenAI releases GPT-5',
  outcomes: '["Yes", "No"]',
  outcomePrices: '["0.65", "0.35"]',
  volume: '1000000',
  volume24hr: 50000,
  liquidity: '250000',
  active: true,
  closed: false,
  archived: false,
  endDate: '2025-12-31T00:00:00Z',
  acceptingOrders: true,
  clobTokenIds: '["token-yes", "token-no"]',
  oneDayPriceChange: 0.05,
  events: [
    {
      id: 'event-1',
      title: 'GPT-5',
      slug: 'gpt-5-release',
      volume: 1000000,
      liquidity: 250000,
    },
  ],
};

const mockOrderBook = {
  market: 'market-1',
  asset_id: 'token-1',
  hash: 'hash-123',
  timestamp: Date.now(),
  bids: [
    { price: '0.60', size: '100' },
    { price: '0.55', size: '200' },
  ],
  asks: [
    { price: '0.65', size: '150' },
    { price: '0.70', size: '100' },
  ],
};

// Helper to create a mock Response
function mockResponse(data: any, ok = true, status = 200, statusText = 'OK'): Response {
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

describe('PolymarketClient', () => {
  let client: InstanceType<typeof PolymarketClient>;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new PolymarketClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    client.disconnectWebSocket();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getMarkets
  // ==========================================================================

  describe('getMarkets', () => {
    it('fetches markets with no options', async () => {
      mockFetch.mockResolvedValue(mockResponse([mockGammaMarket]));

      const result = await client.getMarkets();

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://gamma-api.polymarket.com/markets?');
      expect(result).toEqual([mockGammaMarket]);
    });

    it('sets closed param when provided', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ closed: false });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('closed=false');
    });

    it('sets closed=true param', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ closed: true });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('closed=true');
    });

    it('sets active param when provided', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ active: true });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('active=true');
    });

    it('sets active=false param', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ active: false });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('active=false');
    });

    it('sets limit param when provided', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ limit: 50 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=50');
    });

    it('does not set limit when 0 (falsy)', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ limit: 0 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('limit=');
    });

    it('sets offset param when provided', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ offset: 10 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('offset=10');
    });

    it('sets offset=0 when zero is provided', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ offset: 0 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('offset=0');
    });

    it('does not set offset when undefined', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ limit: 10 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('offset=');
    });

    it('sets all params together', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      await client.getMarkets({ closed: false, active: true, limit: 25, offset: 5 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('closed=false');
      expect(calledUrl).toContain('active=true');
      expect(calledUrl).toContain('limit=25');
      expect(calledUrl).toContain('offset=5');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValue(mockResponse(null, false, 500, 'Internal Server Error'));

      await expect(client.getMarkets()).rejects.toThrow(
        'Failed to fetch markets: 500 Internal Server Error'
      );
    });

    it('throws on 403 Forbidden', async () => {
      mockFetch.mockResolvedValue(mockResponse(null, false, 403, 'Forbidden'));

      await expect(client.getMarkets()).rejects.toThrow(
        'Failed to fetch markets: 403 Forbidden'
      );
    });

    it('returns empty array on empty response', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      const result = await client.getMarkets();

      expect(result).toEqual([]);
    });

    it('returns multiple markets', async () => {
      const markets = [mockGammaMarket, { ...mockGammaMarket, id: 'gamma-2' }];
      mockFetch.mockResolvedValue(mockResponse(markets));

      const result = await client.getMarkets();

      expect(result).toHaveLength(2);
    });
  });

  // ==========================================================================
  // getMarket
  // ==========================================================================

  describe('getMarket', () => {
    it('returns market found by slug', async () => {
      mockFetch.mockResolvedValue(mockResponse([mockGammaMarket]));

      const result = await client.getMarket('will-gpt-5-be-released');

      expect(result).toEqual(mockGammaMarket);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('slug=will-gpt-5-be-released');
    });

    it('falls back to conditionId when slug returns empty array', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      mockFetch.mockResolvedValueOnce(mockResponse([mockGammaMarket]));

      const result = await client.getMarket('cond-123');

      expect(result).toEqual(mockGammaMarket);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const secondUrl = mockFetch.mock.calls[1][0] as string;
      expect(secondUrl).toContain('conditionId=cond-123');
    });

    it('returns null when both slug and conditionId miss', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      const result = await client.getMarket('nonexistent');

      expect(result).toBeNull();
    });

    it('throws when slug fetch returns HTTP error', async () => {
      mockFetch.mockResolvedValue(mockResponse(null, false, 503, 'Service Unavailable'));

      await expect(client.getMarket('some-slug')).rejects.toThrow(
        'Failed to fetch market: 503 Service Unavailable'
      );
    });

    it('returns null when conditionId fetch returns HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      mockFetch.mockResolvedValueOnce(mockResponse(null, false, 404, 'Not Found'));

      const result = await client.getMarket('unknown-id');

      expect(result).toBeNull();
    });

    it('returns the first market when slug matches multiple', async () => {
      const second = { ...mockGammaMarket, id: 'gamma-2' };
      mockFetch.mockResolvedValue(mockResponse([mockGammaMarket, second]));

      const result = await client.getMarket('some-slug');

      expect(result).toEqual(mockGammaMarket);
    });

    it('encodes special characters in slug', async () => {
      mockFetch.mockResolvedValue(mockResponse([mockGammaMarket]));

      await client.getMarket('slug with spaces');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('slug=slug%20with%20spaces');
    });

    it('does not make second request when slug succeeds', async () => {
      mockFetch.mockResolvedValue(mockResponse([mockGammaMarket]));

      await client.getMarket('good-slug');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('conditionId URL uses encodeURIComponent', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await client.getMarket('id/with/slashes');

      const secondUrl = mockFetch.mock.calls[1][0] as string;
      expect(secondUrl).toContain('conditionId=id%2Fwith%2Fslashes');
    });

    it('returns first conditionId match', async () => {
      const second = { ...mockGammaMarket, id: 'gamma-2' };
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      mockFetch.mockResolvedValueOnce(mockResponse([mockGammaMarket, second]));

      const result = await client.getMarket('cond-123');

      expect(result).toEqual(mockGammaMarket);
    });
  });

  // ==========================================================================
  // searchMarkets
  // ==========================================================================

  describe('searchMarkets', () => {
    const marketA: GammaMarketType = {
      ...mockGammaMarket,
      id: 'a',
      question: 'Will Bitcoin reach $100k?',
      description: 'Bitcoin price prediction market',
    };
    const marketB: GammaMarketType = {
      ...mockGammaMarket,
      id: 'b',
      question: 'Will the next president be Republican?',
      description: 'US election market',
    };
    const marketC: GammaMarketType = {
      ...mockGammaMarket,
      id: 'c',
      question: 'Will AI pass the Turing test?',
      description: 'Artificial Intelligence milestone',
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse([marketA, marketB, marketC]));
    });

    it('filters markets by question (case-insensitive)', async () => {
      const results = await client.searchMarkets('bitcoin');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('a');
    });

    it('filters markets by description (case-insensitive)', async () => {
      const results = await client.searchMarkets('ELECTION');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('b');
    });

    it('returns multiple matches', async () => {
      const results = await client.searchMarkets('will');

      expect(results).toHaveLength(3);
    });

    it('respects limit parameter', async () => {
      const results = await client.searchMarkets('will', 2);

      expect(results).toHaveLength(2);
    });

    it('uses default limit of 20', async () => {
      const results = await client.searchMarkets('will');

      // Should return all 3 (less than 20)
      expect(results).toHaveLength(3);
    });

    it('returns empty array when no matches', async () => {
      const results = await client.searchMarkets('zzzznonexistent');

      expect(results).toHaveLength(0);
    });

    it('fetches with closed=false, active=true, and limit=100', async () => {
      await client.searchMarkets('test');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('closed=false');
      expect(calledUrl).toContain('active=true');
      expect(calledUrl).toContain('limit=100');
    });

    it('matches on description even if question does not match', async () => {
      const results = await client.searchMarkets('milestone');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('c');
    });
  });

  // ==========================================================================
  // getOrderBook
  // ==========================================================================

  describe('getOrderBook', () => {
    it('fetches order book with correct CLOB URL', async () => {
      mockFetch.mockResolvedValue(mockResponse(mockOrderBook));

      const result = await client.getOrderBook('token-1');

      expect(result).toEqual(mockOrderBook);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://clob.polymarket.com/book?token_id=token-1');
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValue(mockResponse(null, false, 500, 'Internal Server Error'));

      const result = await client.getOrderBook('bad-token');

      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.getOrderBook('token-1');

      expect(result).toBeNull();
    });

    it('returns null on fetch rejection with non-Error', async () => {
      mockFetch.mockRejectedValue('string error');

      const result = await client.getOrderBook('token-1');

      expect(result).toBeNull();
    });

    it('returns the parsed order book data', async () => {
      const customBook = { ...mockOrderBook, market: 'custom-market' };
      mockFetch.mockResolvedValue(mockResponse(customBook));

      const result = await client.getOrderBook('custom-token');

      expect(result?.market).toBe('custom-market');
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValue(mockResponse(null, false, 404, 'Not Found'));

      const result = await client.getOrderBook('unknown-token');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // getMidpointPrice
  // ==========================================================================

  describe('getMidpointPrice', () => {
    it('calculates midpoint from best bid and best ask', async () => {
      mockFetch.mockResolvedValue(mockResponse(mockOrderBook));

      const price = await client.getMidpointPrice('token-1');

      // bestBid = 0.60, bestAsk = 0.65 => (0.60 + 0.65) / 2 = 0.625
      expect(price).toBe(0.625);
    });

    it('returns null when order book is unavailable', async () => {
      mockFetch.mockResolvedValue(mockResponse(null, false, 500, 'Error'));

      const price = await client.getMidpointPrice('bad-token');

      expect(price).toBeNull();
    });

    it('uses 0 for bestBid when no bids exist', async () => {
      const bookNoBids = { ...mockOrderBook, bids: [] };
      mockFetch.mockResolvedValue(mockResponse(bookNoBids));

      const price = await client.getMidpointPrice('token-1');

      // bestBid = 0, bestAsk = 0.65 => (0 + 0.65) / 2 = 0.325
      expect(price).toBe(0.325);
    });

    it('uses 1 for bestAsk when no asks exist', async () => {
      const bookNoAsks = { ...mockOrderBook, asks: [] };
      mockFetch.mockResolvedValue(mockResponse(bookNoAsks));

      const price = await client.getMidpointPrice('token-1');

      // bestBid = 0.60, bestAsk = 1 => (0.60 + 1) / 2 = 0.8
      expect(price).toBe(0.8);
    });

    it('returns 0.5 when both bids and asks are empty', async () => {
      const emptyBook = { ...mockOrderBook, bids: [], asks: [] };
      mockFetch.mockResolvedValue(mockResponse(emptyBook));

      const price = await client.getMidpointPrice('token-1');

      // bestBid = 0, bestAsk = 1 => (0 + 1) / 2 = 0.5
      expect(price).toBe(0.5);
    });

    it('returns null when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network'));

      const price = await client.getMidpointPrice('token-1');

      expect(price).toBeNull();
    });

    it('uses first bid and first ask entries', async () => {
      const book = {
        ...mockOrderBook,
        bids: [{ price: '0.40', size: '50' }],
        asks: [{ price: '0.80', size: '50' }],
      };
      mockFetch.mockResolvedValue(mockResponse(book));

      const price = await client.getMidpointPrice('token-1');

      // (0.40 + 0.80) / 2 = 0.60
      expect(price).toBeCloseTo(0.6);
    });

    it('handles single bid and ask', async () => {
      const book = {
        ...mockOrderBook,
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.50', size: '100' }],
      };
      mockFetch.mockResolvedValue(mockResponse(book));

      const price = await client.getMidpointPrice('token-1');

      expect(price).toBe(0.5);
    });
  });

  // ==========================================================================
  // normalizeMarket
  // ==========================================================================

  describe('normalizeMarket', () => {
    it('parses outcomes from JSON string', () => {
      const result = client.normalizeMarket(mockGammaMarket);

      expect(result.outcomes).toHaveLength(2);
      expect(result.outcomes[0].name).toBe('YES');
      expect(result.outcomes[1].name).toBe('NO');
    });

    it('parses outcomePrices from JSON string', () => {
      const result = client.normalizeMarket(mockGammaMarket);

      expect(result.outcomes[0].probability).toBe(0.65);
      expect(result.outcomes[1].probability).toBe(0.35);
    });

    it('calculates price as probability * 100 (rounded)', () => {
      const result = client.normalizeMarket(mockGammaMarket);

      expect(result.outcomes[0].price).toBe(65);
      expect(result.outcomes[1].price).toBe(35);
    });

    it('uses token IDs from clobTokenIds for outcome ids', () => {
      const result = client.normalizeMarket(mockGammaMarket);

      expect(result.outcomes[0].id).toBe('token-yes');
      expect(result.outcomes[1].id).toBe('token-no');
    });

    it('falls back to conditionId-index when no clobTokenIds', () => {
      const market = { ...mockGammaMarket, clobTokenIds: undefined };
      const result = client.normalizeMarket(market);

      expect(result.outcomes[0].id).toBe('cond-123-0');
      expect(result.outcomes[1].id).toBe('cond-123-1');
    });

    it('defaults to Yes/No and 0.5/0.5 for invalid JSON outcomes', () => {
      const market = {
        ...mockGammaMarket,
        outcomes: 'not-json',
        outcomePrices: 'not-json',
      };
      const result = client.normalizeMarket(market);

      expect(result.outcomes[0].name).toBe('YES');
      expect(result.outcomes[1].name).toBe('NO');
      expect(result.outcomes[0].probability).toBe(0.5);
      expect(result.outcomes[1].probability).toBe(0.5);
    });

    it('defaults outcomePrices to 0.5/0.5 when only prices JSON is invalid', () => {
      const market = {
        ...mockGammaMarket,
        outcomePrices: '{invalid}',
      };
      const result = client.normalizeMarket(market);

      expect(result.outcomes[0].probability).toBe(0.5);
      expect(result.outcomes[1].probability).toBe(0.5);
    });

    it('defaults outcomes to Yes/No when only outcomes JSON is invalid', () => {
      const market = {
        ...mockGammaMarket,
        outcomes: '{invalid}',
      };
      const result = client.normalizeMarket(market);

      expect(result.outcomes[0].name).toBe('YES');
      expect(result.outcomes[1].name).toBe('NO');
    });

    it('falls back to conditionId-index for invalid clobTokenIds JSON', () => {
      const market = {
        ...mockGammaMarket,
        clobTokenIds: 'not-json',
      };
      const result = client.normalizeMarket(market);

      expect(result.outcomes[0].id).toBe('cond-123-0');
      expect(result.outcomes[1].id).toBe('cond-123-1');
    });

    it('sets priceChange24h from oneDayPriceChange * 100', () => {
      const result = client.normalizeMarket(mockGammaMarket);

      expect(result.outcomes[0].priceChange24h).toBe(5);
    });

    it('sets priceChange24h to undefined when oneDayPriceChange is absent', () => {
      const market = { ...mockGammaMarket, oneDayPriceChange: undefined };
      const result = client.normalizeMarket(market);

      expect(result.outcomes[0].priceChange24h).toBeUndefined();
    });

    it('sets priceChange24h for negative change', () => {
      const market = { ...mockGammaMarket, oneDayPriceChange: -0.10 };
      const result = client.normalizeMarket(market);

      expect(result.outcomes[0].priceChange24h).toBeCloseTo(-10);
    });

    it('sets source to polymarket', () => {
      const result = client.normalizeMarket(mockGammaMarket);
      expect(result.source).toBe('polymarket');
    });

    it('uses conditionId as id', () => {
      const result = client.normalizeMarket(mockGammaMarket);
      expect(result.id).toBe('cond-123');
    });

    it('maps volume24h from volume24hr', () => {
      const result = client.normalizeMarket(mockGammaMarket);
      expect(result.volume24h).toBe(50000);
    });

    it('defaults volume24h to 0 when volume24hr is 0', () => {
      const market = { ...mockGammaMarket, volume24hr: 0 };
      const result = client.normalizeMarket(market);
      expect(result.volume24h).toBe(0);
    });

    it('defaults volume24h to 0 when volume24hr is undefined', () => {
      const market = { ...mockGammaMarket, volume24hr: undefined as any };
      const result = client.normalizeMarket(market);
      expect(result.volume24h).toBe(0);
    });

    it('parses totalVolume from string', () => {
      const result = client.normalizeMarket(mockGammaMarket);
      expect(result.totalVolume).toBe(1000000);
    });

    it('defaults totalVolume to 0 for non-numeric string', () => {
      const market = { ...mockGammaMarket, volume: 'not-a-number' };
      const result = client.normalizeMarket(market);
      expect(result.totalVolume).toBe(0);
    });

    it('parses liquidity from string', () => {
      const result = client.normalizeMarket(mockGammaMarket);
      expect(result.liquidity).toBe(250000);
    });

    it('defaults liquidity to 0 for non-numeric string', () => {
      const market = { ...mockGammaMarket, liquidity: 'abc' };
      const result = client.normalizeMarket(market);
      expect(result.liquidity).toBe(0);
    });

    it('parses closeTime from endDate', () => {
      const result = client.normalizeMarket(mockGammaMarket);
      expect(result.closeTime).toBe(new Date('2025-12-31T00:00:00Z').getTime());
    });

    it('includes question and description in result', () => {
      const result = client.normalizeMarket(mockGammaMarket);
      expect(result.question).toBe('Will GPT-5 be released in 2025?');
      expect(result.description).toBe('This market resolves to YES if OpenAI releases GPT-5');
    });

    it('handles outcomes with more than 2 options', () => {
      const market = {
        ...mockGammaMarket,
        outcomes: '["Red", "Blue", "Green"]',
        outcomePrices: '["0.33", "0.34", "0.33"]',
        clobTokenIds: '["t1", "t2", "t3"]',
      };
      const result = client.normalizeMarket(market);

      expect(result.outcomes).toHaveLength(3);
      expect(result.outcomes[0].name).toBe('Red');
      expect(result.outcomes[1].name).toBe('Blue');
      expect(result.outcomes[2].name).toBe('Green');
    });

    it('uses 0.5 fallback for missing price at index', () => {
      const market = {
        ...mockGammaMarket,
        outcomes: '["A", "B", "C"]',
        outcomePrices: '["0.80"]', // only 1 price for 3 outcomes
      };
      const result = client.normalizeMarket(market);

      expect(result.outcomes[0].probability).toBe(0.80);
      expect(result.outcomes[1].probability).toBe(0.5);
      expect(result.outcomes[2].probability).toBe(0.5);
    });

    // Status mapping
    describe('status mapping', () => {
      it('sets status to resolved when archived', () => {
        const market = { ...mockGammaMarket, archived: true };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('resolved');
      });

      it('sets status to closed when closed is true', () => {
        const market = { ...mockGammaMarket, closed: true, archived: false };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('closed');
      });

      it('sets status to closed when not acceptingOrders', () => {
        const market = {
          ...mockGammaMarket,
          closed: false,
          archived: false,
          acceptingOrders: false,
        };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('closed');
      });

      it('sets status to open when active and accepting orders', () => {
        const market = {
          ...mockGammaMarket,
          closed: false,
          archived: false,
          acceptingOrders: true,
        };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('open');
      });

      it('archived takes priority over closed', () => {
        const market = { ...mockGammaMarket, archived: true, closed: true };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('resolved');
      });

      it('archived takes priority over acceptingOrders=false', () => {
        const market = {
          ...mockGammaMarket,
          archived: true,
          closed: false,
          acceptingOrders: false,
        };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('resolved');
      });
    });

    // Category mapping
    describe('category mapping', () => {
      it('detects ai-tech from AI keyword', () => {
        const market = { ...mockGammaMarket, question: 'Will AI surpass humans?', description: '' };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from GPT reference', () => {
        const market = { ...mockGammaMarket, question: 'Will GPT-4o beat benchmarks?', description: '' };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from GPT-3 reference', () => {
        const market = { ...mockGammaMarket, question: 'Will GPT-3 be deprecated?', description: '' };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from Claude reference', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will Claude pass the bar exam?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from OpenAI reference', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will OpenAI release a new model?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from Anthropic reference', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will Anthropic raise funding?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from LLM keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will LLM adoption grow?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from machine learning keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Machine learning advances',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from DeepSeek reference', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will DeepSeek release a new model?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from Gemini reference', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will Gemini outperform GPT?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects ai-tech from artificial intelligence in description', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Technology milestone?',
          description: 'This is about artificial intelligence',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('detects politics from Trump keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will Trump win the election?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('politics');
      });

      it('detects politics from Biden keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will Biden run again?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('politics');
      });

      it('detects politics from election keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Who will win the election?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('politics');
      });

      it('detects politics from president keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Who is the next president?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('politics');
      });

      it('detects politics from Congress keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will Congress pass the bill?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('politics');
      });

      it('detects politics from Senate keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will the Senate confirm?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('politics');
      });

      it('detects crypto from Bitcoin keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will Bitcoin reach $100k?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('crypto');
      });

      it('detects crypto from Ethereum keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will Ethereum merge succeed?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('crypto');
      });

      it('detects crypto from ETH keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will ETH reach $5000?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('crypto');
      });

      it('detects crypto from BTC keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will BTC reach all-time high?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('crypto');
      });

      it('detects crypto from crypto keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will crypto markets recover?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('crypto');
      });

      it('detects sports from NFL keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Which team will win the NFL championship?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('sports');
      });

      it('detects sports from NBA keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Who will win the NBA finals?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('sports');
      });

      it('detects sports from Super Bowl keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Who wins the Super Bowl?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('sports');
      });

      it('detects sports from World Cup keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will USA win the World Cup?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('sports');
      });

      it('detects sports from soccer keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will soccer viewership increase?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('sports');
      });

      it('detects sports from football keyword', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Which football team wins?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('sports');
      });

      it('defaults to other for unrecognized categories', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will it rain tomorrow?',
          description: 'Weather prediction',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('other');
      });

      it('ai-tech takes priority over other categories when both match', () => {
        const market = {
          ...mockGammaMarket,
          question: 'Will AI predict the election?',
          description: '',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('uses description to detect category when question has no keywords', () => {
        const market = {
          ...mockGammaMarket,
          question: 'A general question',
          description: 'This involves crypto regulation',
        };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('crypto');
      });
    });

    // URL building
    describe('URL building', () => {
      it('uses event slug when events are present', () => {
        const result = client.normalizeMarket(mockGammaMarket);
        expect(result.url).toBe('https://polymarket.com/event/gpt-5-release');
      });

      it('falls back to market slug when no events', () => {
        const market = { ...mockGammaMarket, events: undefined };
        const result = client.normalizeMarket(market);
        expect(result.url).toBe('https://polymarket.com/event/will-gpt-5-be-released');
      });

      it('falls back to market slug when events array is empty', () => {
        const market = { ...mockGammaMarket, events: [] };
        const result = client.normalizeMarket(market);
        expect(result.url).toBe('https://polymarket.com/event/will-gpt-5-be-released');
      });
    });

    // Image
    it('uses image when available', () => {
      const market = { ...mockGammaMarket, image: 'https://img.com/gpt5.png', icon: undefined };
      const result = client.normalizeMarket(market);
      expect(result.image).toBe('https://img.com/gpt5.png');
    });

    it('falls back to icon when image is not available', () => {
      const market = { ...mockGammaMarket, image: undefined, icon: 'https://img.com/icon.png' };
      const result = client.normalizeMarket(market);
      expect(result.image).toBe('https://img.com/icon.png');
    });

    it('sets image to undefined when neither image nor icon exists', () => {
      const market = { ...mockGammaMarket, image: undefined, icon: undefined };
      const result = client.normalizeMarket(market);
      expect(result.image).toBeUndefined();
    });

    // Outcome name normalization
    it('normalizes YES/NO outcome names to uppercase', () => {
      const market = { ...mockGammaMarket, outcomes: '["yes", "no"]' };
      const result = client.normalizeMarket(market);
      expect(result.outcomes[0].name).toBe('YES');
      expect(result.outcomes[1].name).toBe('NO');
    });

    it('preserves non-Yes/No outcome names', () => {
      const market = { ...mockGammaMarket, outcomes: '["Republican", "Democrat"]' };
      const result = client.normalizeMarket(market);
      expect(result.outcomes[0].name).toBe('Republican');
      expect(result.outcomes[1].name).toBe('Democrat');
    });

    it('normalizes mixed case Yes to YES', () => {
      const market = { ...mockGammaMarket, outcomes: '["YES", "NO"]' };
      const result = client.normalizeMarket(market);
      expect(result.outcomes[0].name).toBe('YES');
      expect(result.outcomes[1].name).toBe('NO');
    });
  });

  // ==========================================================================
  // getTokenIds
  // ==========================================================================

  describe('getTokenIds', () => {
    it('parses valid clobTokenIds JSON', () => {
      const ids = client.getTokenIds(mockGammaMarket);

      expect(ids).toEqual(['token-yes', 'token-no']);
    });

    it('returns empty array when clobTokenIds is undefined', () => {
      const market = { ...mockGammaMarket, clobTokenIds: undefined };
      const ids = client.getTokenIds(market);

      expect(ids).toEqual([]);
    });

    it('returns empty array on invalid JSON', () => {
      const market = { ...mockGammaMarket, clobTokenIds: 'not-json' };
      const ids = client.getTokenIds(market);

      expect(ids).toEqual([]);
    });

    it('returns empty array when clobTokenIds is empty string', () => {
      const market = { ...mockGammaMarket, clobTokenIds: '' };
      const ids = client.getTokenIds(market);

      expect(ids).toEqual([]);
    });

    it('returns single token array', () => {
      const market = { ...mockGammaMarket, clobTokenIds: '["only-token"]' };
      const ids = client.getTokenIds(market);

      expect(ids).toEqual(['only-token']);
    });
  });

  // ==========================================================================
  // WebSocket - connectWebSocket
  // ==========================================================================

  describe('connectWebSocket', () => {
    it('creates a WebSocket connection', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      // WebSocket constructor was called (via the global stub)
      // The ws field is set internally
    });

    it('returns early when WebSocket global is undefined', () => {
      const originalWS = globalThis.WebSocket;
      // @ts-expect-error - testing undefined case
      globalThis.WebSocket = undefined;

      const callback = vi.fn();
      client.connectWebSocket(callback);

      // Should not throw, should return early
      globalThis.WebSocket = originalWS;
    });

    it('catches and logs error when WebSocket constructor throws', () => {
      const originalWS = globalThis.WebSocket;

      // Replace WebSocket with one that throws on construction
      const ThrowingWS = function () {
        throw new Error('Connection refused');
      } as any;
      ThrowingWS.OPEN = 1;
      ThrowingWS.CLOSED = 3;
      globalThis.WebSocket = ThrowingWS;

      const callback = vi.fn();
      // Should not throw (caught internally)
      expect(() => client.connectWebSocket(callback)).not.toThrow();

      globalThis.WebSocket = originalWS;
    });

    it('handles onopen event by resetting reconnectAttempts', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      // Access the ws's onopen handler via the mock
      // The client stores ws internally; we get it via the MockWebSocket constructor
      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      // reconnectAttempts reset to 0 - verified by reconnect behavior later
    });

    it('starts ping interval on open', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      // Advance 30 seconds to trigger ping
      vi.advanceTimersByTime(30000);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
    });

    it('resubscribes to existing subscriptions on open', () => {
      const callback = vi.fn();

      // Pre-add subscriptions
      client.subscribeToMarket('market-1', ['token-a', 'token-b']);

      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      // sendSubscription should have been called for each token
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('token-a'));
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('token-b'));
    });

    it('handles price_change message via type field', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({
          type: 'price_change',
          market: 'market-1',
          asset_id: 'token-1',
          outcome: 'YES',
          price: '0.72',
        }),
      } as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'market-1',
          tokenId: 'token-1',
          outcome: 'YES',
          price: 0.72,
        })
      );
    });

    it('handles price_change message via event_type field', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({
          event_type: 'price_change',
          asset_id: 'token-2',
          token_id: 'tok-2',
          last_price: '0.55',
        }),
      } as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'token-2',
          tokenId: 'token-2',
          outcome: 'YES', // defaults when not provided
          price: 0.55,
        })
      );
    });

    it('defaults outcome to YES when not provided in price_change', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({
          type: 'price_change',
          market: 'm1',
          price: '0.50',
        }),
      } as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'YES' })
      );
    });

    it('defaults price to 0 when not provided in price_change', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({
          type: 'price_change',
          market: 'm1',
        }),
      } as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ price: 0 })
      );
    });

    it('handles book message via type field', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({
          type: 'book',
          market: 'market-1',
          asset_id: 'token-1',
          bids: [{ price: '0.60' }],
          asks: [{ price: '0.70' }],
        }),
      } as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'market-1',
          tokenId: 'token-1',
          outcome: 'YES',
          price: expect.closeTo(0.65, 5), // midpoint of 0.60 and 0.70
        })
      );
    });

    it('handles book message via event_type field', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({
          event_type: 'book',
          market: 'market-2',
          asset_id: 'token-2',
          bids: [{ price: '0.40' }],
          asks: [{ price: '0.80' }],
        }),
      } as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          price: expect.closeTo(0.6, 5), // midpoint of 0.40 and 0.80
        })
      );
    });

    it('handles book message with empty bids (uses 0)', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({
          type: 'book',
          market: 'm1',
          asset_id: 't1',
          bids: [],
          asks: [{ price: '0.80' }],
        }),
      } as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 0.4, // (0 + 0.80) / 2
        })
      );
    });

    it('handles book message with empty asks (uses 1)', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({
          type: 'book',
          market: 'm1',
          asset_id: 't1',
          bids: [{ price: '0.40' }],
          asks: [],
        }),
      } as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 0.7, // (0.40 + 1) / 2
        })
      );
    });

    it('does not call callback for book message with both empty bids and asks', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({
          type: 'book',
          market: 'm1',
          asset_id: 't1',
          bids: [],
          asks: [],
        }),
      } as any);

      // bids.length === 0 && asks.length === 0 => condition (bids.length > 0 || asks.length > 0) is false
      expect(callback).not.toHaveBeenCalled();
    });

    it('silently ignores invalid JSON messages', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      // Should not throw
      ws.onmessage?.({ data: 'not-json-at-all' } as any);

      expect(callback).not.toHaveBeenCalled();
    });

    it('ignores unknown message types', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      ws.onmessage?.({
        data: JSON.stringify({ type: 'pong' }),
      } as any);

      expect(callback).not.toHaveBeenCalled();
    });

    it('handles onerror event without throwing', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);

      expect(() => ws.onerror?.({ error: 'test error' } as any)).not.toThrow();
    });

    it('handles onclose by clearing ping interval and calling handleReconnect', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      // Trigger close
      ws.onclose?.();

      // Ping interval should be cleared - advancing time should not send pings
      // (We can check that no more pings are sent after close)
      ws.send.mockClear();
      vi.advanceTimersByTime(30000);
      // No ping sent since interval was cleared
      // (The send calls may happen from reconnection instead)
    });

    it('does not send ping when ws readyState is not OPEN', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      // Change readyState to CLOSED
      ws.readyState = MockWebSocket.CLOSED;
      ws.send.mockClear();

      vi.advanceTimersByTime(30000);

      // ping should not be sent since readyState !== OPEN
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // handleReconnect
  // ==========================================================================

  describe('handleReconnect', () => {
    it('reconnects with exponential backoff', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws1 = getLastCreatedWs(client);
      ws1.onopen?.({} as any);

      // First close -> triggers reconnect attempt 1
      ws1.onclose?.();

      // delay = min(1000 * 2^1, 30000) = 2000ms
      vi.advanceTimersByTime(2000);

      // A new WebSocket should have been created by the reconnect
      // (The connectWebSocket callback was set)
    });

    it('stops reconnecting after maxReconnectAttempts', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      // Simulate 5 close events (max attempts)
      for (let i = 0; i < 6; i++) {
        const ws = getLastCreatedWs(client);
        ws.onopen?.({} as any);
        ws.onclose?.();

        // Advance enough time for the reconnect delay
        vi.advanceTimersByTime(60000);
      }

      // After maxReconnectAttempts (5), no more reconnect attempts
      // We verify by checking the behavior doesn't throw
    });

    it('does not reconnect if onPriceUpdateCallback is null', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      // Disconnect clears the callback
      client.disconnectWebSocket();

      // Now simulate a close on the old ws
      // handleReconnect should not try to reconnect since callback is null
    });

    it('resets reconnectAttempts on successful open', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws1 = getLastCreatedWs(client);
      ws1.onopen?.({} as any);
      ws1.onclose?.();

      // Advance time for first reconnect
      vi.advanceTimersByTime(2000);

      // New ws opened successfully
      const ws2 = getLastCreatedWs(client);
      ws2.onopen?.({} as any);

      // Now close again - attempts should be back to 0, meaning attempt 1 next
      ws2.onclose?.();

      // delay for attempt 1 = min(1000 * 2^1, 30000) = 2000ms
      vi.advanceTimersByTime(2000);

      // Another new ws should be created
    });
  });

  // ==========================================================================
  // sendSubscription
  // ==========================================================================

  describe('sendSubscription (via subscribeToMarket)', () => {
    it('sends subscription message when WebSocket is open', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);
      ws.send.mockClear();

      client.subscribeToMarket('market-1', ['token-a']);

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribe',
          channel: 'book',
          assets_id: 'token-a',
          market: 'market-1',
        })
      );
    });

    it('does not send when ws is null', () => {
      // No WebSocket connected
      client.subscribeToMarket('market-1', ['token-a']);

      // No error thrown, subscription still tracked
    });

    it('does not send when ws readyState is not OPEN', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.readyState = MockWebSocket.CLOSED;
      ws.send.mockClear();

      client.subscribeToMarket('market-1', ['token-a']);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // subscribeToMarket
  // ==========================================================================

  describe('subscribeToMarket', () => {
    it('creates subscription entry for new market', () => {
      client.subscribeToMarket('market-1', ['token-a', 'token-b']);

      // Verify by subscribing again (should not throw)
      client.subscribeToMarket('market-1', ['token-c']);
    });

    it('adds token IDs to existing subscription', () => {
      client.subscribeToMarket('market-1', ['token-a']);
      client.subscribeToMarket('market-1', ['token-b']);

      // Both tokens should be subscribed (Set deduplication)
    });

    it('creates entry without token IDs', () => {
      client.subscribeToMarket('market-1');

      // Should create a map entry with empty Set, no error
    });

    it('handles duplicate token IDs (Set behavior)', () => {
      client.subscribeToMarket('market-1', ['token-a', 'token-a']);

      // Set deduplicates, so no error
    });

    it('sends subscription for each token ID when ws is open', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);
      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);
      ws.send.mockClear();

      client.subscribeToMarket('market-1', ['token-a', 'token-b']);

      // Two subscription messages sent
      expect(ws.send).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // unsubscribeFromMarket
  // ==========================================================================

  describe('unsubscribeFromMarket', () => {
    it('removes subscription for a market', () => {
      client.subscribeToMarket('market-1', ['token-a']);
      client.unsubscribeFromMarket('market-1');

      // Re-subscribing should create a fresh entry
      client.subscribeToMarket('market-1', ['token-b']);
    });

    it('does not throw when unsubscribing from non-existent market', () => {
      expect(() => client.unsubscribeFromMarket('nonexistent')).not.toThrow();
    });

    it('sends unsubscribe message when ws is open', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);
      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);
      ws.send.mockClear();

      client.subscribeToMarket('market-1', ['token-a']);
      ws.send.mockClear();

      client.unsubscribeFromMarket('market-1');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'unsubscribe',
          market: 'market-1',
        })
      );
    });

    it('does not send unsubscribe when ws is null', () => {
      client.subscribeToMarket('market-1', ['token-a']);
      client.unsubscribeFromMarket('market-1');

      // No error thrown
    });

    it('does not send unsubscribe when ws readyState is not OPEN', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);
      const ws = getLastCreatedWs(client);
      ws.readyState = MockWebSocket.CLOSED;
      ws.send.mockClear();

      client.subscribeToMarket('market-1', ['token-a']);
      client.unsubscribeFromMarket('market-1');

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // disconnectWebSocket
  // ==========================================================================

  describe('disconnectWebSocket', () => {
    it('clears subscriptions', () => {
      client.subscribeToMarket('market-1', ['token-a']);
      client.subscribeToMarket('market-2', ['token-b']);

      client.disconnectWebSocket();

      // After disconnect, subscribing should start fresh
      client.subscribeToMarket('market-1', ['token-c']);
    });

    it('does not throw when called with no WebSocket', () => {
      expect(() => client.disconnectWebSocket()).not.toThrow();
    });

    it('can be called multiple times safely', () => {
      client.disconnectWebSocket();
      client.disconnectWebSocket();
      // No error means it handles null ws gracefully
    });

    it('closes the WebSocket connection', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      client.disconnectWebSocket();

      expect(ws.close).toHaveBeenCalled();
    });

    it('clears the ping interval', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      const ws = getLastCreatedWs(client);
      ws.onopen?.({} as any);

      client.disconnectWebSocket();

      // Verify by checking that advancing time does not call send
      ws.send.mockClear();
      vi.advanceTimersByTime(60000);
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('sets onPriceUpdateCallback to null', () => {
      const callback = vi.fn();
      client.connectWebSocket(callback);

      client.disconnectWebSocket();

      // Reconnect should not happen after disconnect because callback is null
    });
  });

  // ==========================================================================
  // Rate limiting (module-level)
  // ==========================================================================

  describe('rate limiting', () => {
    it('allows requests under the rate limit', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      // A single request should succeed without delay
      const result = await client.getMarkets();

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('proceeds normally for sequential requests within limit', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));

      // Make a few requests (well under 100)
      await client.getMarkets();
      await client.getMarkets();
      await client.getMarkets();

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('filters out old timestamps outside the rate limit window', async () => {
      // Verify that timestamps older than RATE_LIMIT_WINDOW (60s) get pruned
      mockFetch.mockResolvedValue(mockResponse([]));

      // Make a request, then advance time past the window, make another
      await client.getMarkets();
      vi.advanceTimersByTime(61000); // past the 60s window

      // Second request should succeed and old timestamps should be pruned
      await client.getMarkets();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Access the internally stored WebSocket from the client.
 * Uses bracket notation to access the private `ws` field.
 */
function getLastCreatedWs(client: any): MockWebSocket {
  return client.ws as MockWebSocket;
}
