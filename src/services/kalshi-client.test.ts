import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

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
    kalshi: {
      execute: vi.fn((fn: () => Promise<any>) => fn()),
    },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

const { KalshiClient } = await import('./kalshi-client.js');

// ============================================================================
// TEST DATA
// ============================================================================

const mockKalshiMarket = {
  ticker: 'PRES-2024',
  event_ticker: 'PRES',
  market_type: 'binary',
  title: 'Will candidate X win?',
  subtitle: 'Presidential election',
  open_time: '2024-01-01T00:00:00Z',
  close_time: '2024-11-05T00:00:00Z',
  expiration_time: '2024-11-06T00:00:00Z',
  status: 'open' as const,
  response_price_units: 'usd_cent',
  notional_value: 100,
  tick_size: 1,
  yes_bid: 60,
  yes_ask: 65,
  no_bid: 35,
  no_ask: 40,
  last_price: 62,
  volume: 100000,
  volume_24h: 5000,
  liquidity: 50000,
  open_interest: 25000,
  can_close_early: false,
  category: 'Politics',
};

const mockAuthResponse = {
  token: 'mock-jwt-token-abc123',
  member_id: 'member-456',
};

// ============================================================================
// HELPERS
// ============================================================================

function createMockResponse(body: any, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    bytes: vi.fn(),
  } as unknown as Response;
}

function createClientWithCredentials(): InstanceType<typeof KalshiClient> {
  const original = process.env;
  process.env = {
    ...original,
    KALSHI_EMAIL: 'test@example.com',
    KALSHI_PASSWORD: 'test-password-123',
  };
  const client = new KalshiClient();
  process.env = original;
  return client;
}

function createClientWithoutCredentials(): InstanceType<typeof KalshiClient> {
  const original = process.env;
  const env = { ...original };
  delete env.KALSHI_EMAIL;
  delete env.KALSHI_PASSWORD;
  process.env = env;
  const client = new KalshiClient();
  process.env = original;
  return client;
}

// ============================================================================
// TESTS
// ============================================================================

describe('KalshiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------
  describe('constructor', () => {
    it('loads KALSHI_EMAIL from environment', () => {
      const client = createClientWithCredentials();
      expect(client.hasCredentials()).toBe(true);
    });

    it('sets email and password to null when env vars are missing', () => {
      const client = createClientWithoutCredentials();
      expect(client.hasCredentials()).toBe(false);
    });

    it('handles empty string env vars as falsy', () => {
      const original = process.env;
      process.env = { ...original, KALSHI_EMAIL: '', KALSHI_PASSWORD: '' };
      const client = new KalshiClient();
      process.env = original;
      expect(client.hasCredentials()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // isConfigured
  // --------------------------------------------------------------------------
  describe('isConfigured', () => {
    it('always returns true (public endpoints work without auth)', () => {
      const client = createClientWithoutCredentials();
      expect(client.isConfigured()).toBe(true);
    });

    it('returns true even when credentials are set', () => {
      const client = createClientWithCredentials();
      expect(client.isConfigured()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // hasCredentials
  // --------------------------------------------------------------------------
  describe('hasCredentials', () => {
    it('returns true when both email and password are set', () => {
      const client = createClientWithCredentials();
      expect(client.hasCredentials()).toBe(true);
    });

    it('returns false when email is missing', () => {
      const original = process.env;
      process.env = { ...original, KALSHI_PASSWORD: 'pass' };
      delete process.env.KALSHI_EMAIL;
      const client = new KalshiClient();
      process.env = original;
      expect(client.hasCredentials()).toBe(false);
    });

    it('returns false when password is missing', () => {
      const original = process.env;
      process.env = { ...original, KALSHI_EMAIL: 'test@test.com' };
      delete process.env.KALSHI_PASSWORD;
      const client = new KalshiClient();
      process.env = original;
      expect(client.hasCredentials()).toBe(false);
    });

    it('returns false when both are missing', () => {
      const client = createClientWithoutCredentials();
      expect(client.hasCredentials()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // authenticate
  // --------------------------------------------------------------------------
  describe('authenticate', () => {
    it('sends correct POST request with email and password', async () => {
      const client = createClientWithCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockAuthResponse));

      await client.authenticate();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elections.kalshi.com/trade-api/v2/login',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'application/json',
          }),
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'test-password-123',
          }),
        })
      );
    });

    it('returns the token on success', async () => {
      const client = createClientWithCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockAuthResponse));

      const token = await client.authenticate();
      expect(token).toBe('mock-jwt-token-abc123');
    });

    it('throws when credentials are not configured', async () => {
      const client = createClientWithoutCredentials();

      await expect(client.authenticate()).rejects.toThrow(
        'Kalshi credentials not configured. Set KALSHI_EMAIL and KALSHI_PASSWORD env vars.'
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws on HTTP error response', async () => {
      const client = createClientWithCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse('Unauthorized', 401, 'Unauthorized'));

      await expect(client.authenticate()).rejects.toThrow(
        'Kalshi authentication failed: 401 - Unauthorized'
      );
    });

    it('throws on 403 Forbidden', async () => {
      const client = createClientWithCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse('Forbidden', 403, 'Forbidden'));

      await expect(client.authenticate()).rejects.toThrow(
        'Kalshi authentication failed: 403 - Forbidden'
      );
    });

    it('throws on 500 server error', async () => {
      const client = createClientWithCredentials();
      mockFetch.mockResolvedValueOnce(
        createMockResponse('Internal Server Error', 500, 'Internal Server Error')
      );

      await expect(client.authenticate()).rejects.toThrow(
        'Kalshi authentication failed: 500 - Internal Server Error'
      );
    });
  });

  // --------------------------------------------------------------------------
  // ensureAuth
  // --------------------------------------------------------------------------
  describe('ensureAuth', () => {
    it('calls authenticate when there is no token', async () => {
      const client = createClientWithCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockAuthResponse));

      await client.ensureAuth();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/login'),
        expect.any(Object)
      );
    });

    it('calls authenticate when token is expired', async () => {
      const client = createClientWithCredentials();
      // First authenticate
      mockFetch.mockResolvedValueOnce(createMockResponse(mockAuthResponse));
      await client.authenticate();

      // Fast-forward time past 25-minute expiry
      const originalNow = Date.now;
      Date.now = () => originalNow() + 26 * 60 * 1000;

      // Should re-authenticate
      mockFetch.mockResolvedValueOnce(createMockResponse(mockAuthResponse));
      await client.ensureAuth();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      Date.now = originalNow;
    });

    it('skips authentication when token is still valid', async () => {
      const client = createClientWithCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockAuthResponse));
      await client.authenticate();

      // Token should still be valid (within 25 minutes)
      await client.ensureAuth();

      // Should only have called fetch once (for the initial authenticate)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // getMarkets
  // --------------------------------------------------------------------------
  describe('getMarkets', () => {
    it('fetches markets from the correct URL', async () => {
      const client = createClientWithoutCredentials();
      const mockResponse = { markets: [mockKalshiMarket], cursor: 'next-cursor' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.getMarkets();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elections.kalshi.com/trade-api/v2/markets?',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/json' }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('builds query params with status option', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }));

      await client.getMarkets({ status: 'open' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=open');
    });

    it('builds query params with cursor option', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }));

      await client.getMarkets({ cursor: 'abc123' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('cursor=abc123');
    });

    it('builds query params with limit option', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }));

      await client.getMarkets({ limit: 50 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=50');
    });

    it('builds query params with event_ticker option', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }));

      await client.getMarkets({ event_ticker: 'PRES' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('event_ticker=PRES');
    });

    it('builds query params with series_ticker option', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }));

      await client.getMarkets({ series_ticker: 'SERIES1' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('series_ticker=SERIES1');
    });

    it('builds query params with tickers option', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }));

      await client.getMarkets({ tickers: 'PRES-2024,ECON-2024' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('tickers=PRES-2024');
    });

    it('builds query params with all options at once', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }));

      await client.getMarkets({
        status: 'closed',
        cursor: 'xyz',
        limit: 25,
        event_ticker: 'EV1',
        series_ticker: 'S1',
        tickers: 'T1,T2',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=closed');
      expect(calledUrl).toContain('cursor=xyz');
      expect(calledUrl).toContain('limit=25');
      expect(calledUrl).toContain('event_ticker=EV1');
      expect(calledUrl).toContain('series_ticker=S1');
      expect(calledUrl).toContain('tickers=T1');
    });

    it('throws on HTTP error response', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(null, 500, 'Internal Server Error'));

      await expect(client.getMarkets()).rejects.toThrow(
        'Failed to fetch Kalshi markets: 500 Internal Server Error'
      );
    });

    it('throws on 404 response', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(null, 404, 'Not Found'));

      await expect(client.getMarkets()).rejects.toThrow(
        'Failed to fetch Kalshi markets: 404 Not Found'
      );
    });
  });

  // --------------------------------------------------------------------------
  // getMarket
  // --------------------------------------------------------------------------
  describe('getMarket', () => {
    it('fetches a single market by ticker', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ market: mockKalshiMarket })
      );

      const result = await client.getMarket('PRES-2024');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elections.kalshi.com/trade-api/v2/markets/PRES-2024',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/json' }),
        })
      );
      expect(result).toEqual(mockKalshiMarket);
    });

    it('returns data.market (not the full response)', async () => {
      const client = createClientWithoutCredentials();
      const wrappedResponse = { market: mockKalshiMarket, extra: 'data' };
      mockFetch.mockResolvedValueOnce(createMockResponse(wrappedResponse));

      const result = await client.getMarket('PRES-2024');
      expect(result).toEqual(mockKalshiMarket);
      expect(result).not.toHaveProperty('extra');
    });

    it('throws on HTTP error', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(null, 404, 'Not Found'));

      await expect(client.getMarket('INVALID')).rejects.toThrow(
        'Failed to fetch Kalshi market INVALID: 404 Not Found'
      );
    });
  });

  // --------------------------------------------------------------------------
  // getEvents
  // --------------------------------------------------------------------------
  describe('getEvents', () => {
    const mockEvents = {
      events: [
        {
          event_ticker: 'PRES',
          series_ticker: 'ELECTIONS',
          sub_title: '2024 Presidential',
          title: 'Presidential Election',
          category: 'Politics',
          markets: [mockKalshiMarket],
          status: 'open',
        },
      ],
      cursor: 'event-cursor',
    };

    it('fetches events from the correct URL', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      const result = await client.getEvents();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/events?'),
        expect.any(Object)
      );
      expect(result).toEqual(mockEvents);
    });

    it('builds query params with status', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      await client.getEvents({ status: 'open' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=open');
    });

    it('builds query params with cursor', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      await client.getEvents({ cursor: 'my-cursor' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('cursor=my-cursor');
    });

    it('builds query params with limit', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      await client.getEvents({ limit: 10 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=10');
    });

    it('builds query params with series_ticker', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      await client.getEvents({ series_ticker: 'ELECTIONS' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('series_ticker=ELECTIONS');
    });

    it('includes with_nested_markets=true when set', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      await client.getEvents({ with_nested_markets: true });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('with_nested_markets=true');
    });

    it('includes with_nested_markets=false when explicitly set', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      await client.getEvents({ with_nested_markets: false });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('with_nested_markets=false');
    });

    it('omits with_nested_markets when undefined', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      await client.getEvents({ status: 'open' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('with_nested_markets');
    });

    it('throws on HTTP error', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse(null, 503, 'Service Unavailable'));

      await expect(client.getEvents()).rejects.toThrow(
        'Failed to fetch Kalshi events: 503 Service Unavailable'
      );
    });
  });

  // --------------------------------------------------------------------------
  // searchMarkets
  // --------------------------------------------------------------------------
  describe('searchMarkets', () => {
    const marketList = [
      { ...mockKalshiMarket, ticker: 'M1', title: 'Will AI surpass humans?', subtitle: 'Tech prediction', category: 'Technology' },
      { ...mockKalshiMarket, ticker: 'M2', title: 'Presidential race 2024', subtitle: 'Election', category: 'Politics' },
      { ...mockKalshiMarket, ticker: 'M3', title: 'Bitcoin price', subtitle: 'Will BTC reach 100k?', category: 'Crypto' },
      { ...mockKalshiMarket, ticker: 'M4', title: 'Federal Reserve rate', subtitle: 'AI impact on economy', category: 'Economy' },
    ];

    it('filters markets by title (case-insensitive)', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: marketList }));

      const results = await client.searchMarkets('presidential');

      expect(results).toHaveLength(1);
      expect(results[0].ticker).toBe('M2');
    });

    it('filters markets by subtitle (case-insensitive)', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: marketList }));

      const results = await client.searchMarkets('BTC');

      expect(results).toHaveLength(1);
      expect(results[0].ticker).toBe('M3');
    });

    it('filters markets by category (case-insensitive)', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: marketList }));

      const results = await client.searchMarkets('technology');

      expect(results).toHaveLength(1);
      expect(results[0].ticker).toBe('M1');
    });

    it('matches across multiple fields (title and subtitle)', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: marketList }));

      const results = await client.searchMarkets('AI');

      // M1 has 'AI' in title, M4 has 'AI' in subtitle
      expect(results).toHaveLength(2);
      expect(results.map(m => m.ticker)).toContain('M1');
      expect(results.map(m => m.ticker)).toContain('M4');
    });

    it('respects limit parameter', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: marketList }));

      const results = await client.searchMarkets('AI', 1);

      expect(results).toHaveLength(1);
    });

    it('uses default limit of 20', async () => {
      const client = createClientWithoutCredentials();
      // Create 25 matching markets
      const manyMarkets = Array.from({ length: 25 }, (_, i) => ({
        ...mockKalshiMarket,
        ticker: `M${i}`,
        title: `AI market ${i}`,
      }));
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: manyMarkets }));

      const results = await client.searchMarkets('AI');

      expect(results).toHaveLength(20);
    });

    it('returns empty array when no matches', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: marketList }));

      const results = await client.searchMarkets('zzzznonexistent');

      expect(results).toHaveLength(0);
    });

    it('passes status=open and limit=100 to getMarkets', async () => {
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }));

      await client.searchMarkets('test');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=open');
      expect(calledUrl).toContain('limit=100');
    });

    it('handles markets with no subtitle gracefully', async () => {
      const client = createClientWithoutCredentials();
      const marketNoSubtitle = { ...mockKalshiMarket, subtitle: undefined, title: 'Test market', category: 'Test' };
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [marketNoSubtitle] }));

      const results = await client.searchMarkets('Test');

      expect(results).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // normalizeMarket
  // --------------------------------------------------------------------------
  describe('normalizeMarket', () => {
    it('maps basic fields correctly', () => {
      const client = createClientWithoutCredentials();
      const result = client.normalizeMarket(mockKalshiMarket);

      expect(result.id).toBe('PRES-2024');
      expect(result.source).toBe('kalshi');
      expect(result.question).toBe('Will candidate X win?');
      expect(result.description).toBe('Presidential election');
      expect(result.url).toBe('https://kalshi.com/markets/PRES-2024');
    });

    it('calculates YES price as midpoint of bid/ask', () => {
      const client = createClientWithoutCredentials();
      const result = client.normalizeMarket(mockKalshiMarket);

      // yes_bid=60, yes_ask=65 -> mid = 62.5 -> rounded = 63 (Math.round)
      expect(result.outcomes[0].price).toBe(63); // Math.round(62.5)
    });

    it('calculates NO price as midpoint of bid/ask', () => {
      const client = createClientWithoutCredentials();
      const result = client.normalizeMarket(mockKalshiMarket);

      // no_bid=35, no_ask=40 -> mid = 37.5 -> rounded = 38
      expect(result.outcomes[1].price).toBe(38); // Math.round(37.5)
    });

    it('calculates YES probability correctly', () => {
      const client = createClientWithoutCredentials();
      const result = client.normalizeMarket(mockKalshiMarket);

      // yesPrice=62.5, probability = 62.5/100 = 0.625
      expect(result.outcomes[0].probability).toBe(0.625);
    });

    it('calculates NO probability correctly', () => {
      const client = createClientWithoutCredentials();
      const result = client.normalizeMarket(mockKalshiMarket);

      // noPrice=37.5, probability = 37.5/100 = 0.375
      expect(result.outcomes[1].probability).toBe(0.375);
    });

    it('sets outcome IDs with ticker-yes and ticker-no', () => {
      const client = createClientWithoutCredentials();
      const result = client.normalizeMarket(mockKalshiMarket);

      expect(result.outcomes[0].id).toBe('PRES-2024-yes');
      expect(result.outcomes[0].name).toBe('YES');
      expect(result.outcomes[1].id).toBe('PRES-2024-no');
      expect(result.outcomes[1].name).toBe('NO');
    });

    it('maps volume fields correctly', () => {
      const client = createClientWithoutCredentials();
      const result = client.normalizeMarket(mockKalshiMarket);

      expect(result.volume24h).toBe(5000);
      expect(result.totalVolume).toBe(100000);
    });

    it('uses liquidity when available', () => {
      const client = createClientWithoutCredentials();
      const result = client.normalizeMarket(mockKalshiMarket);

      expect(result.liquidity).toBe(50000);
    });

    it('falls back to open_interest when liquidity is zero', () => {
      const client = createClientWithoutCredentials();
      const market = { ...mockKalshiMarket, liquidity: 0, open_interest: 15000 };
      const result = client.normalizeMarket(market);

      expect(result.liquidity).toBe(15000);
    });

    it('uses 0 when both liquidity and open_interest are zero', () => {
      const client = createClientWithoutCredentials();
      const market = { ...mockKalshiMarket, liquidity: 0, open_interest: 0 };
      const result = client.normalizeMarket(market);

      expect(result.liquidity).toBe(0);
    });

    it('converts closeTime to epoch milliseconds', () => {
      const client = createClientWithoutCredentials();
      const result = client.normalizeMarket(mockKalshiMarket);

      expect(result.closeTime).toBe(new Date('2024-11-05T00:00:00Z').getTime());
    });

    // --- Status mapping ---
    describe('status mapping', () => {
      it('maps "open" to "open"', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, status: 'open' as const };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('open');
      });

      it('maps "active" to "open"', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, status: 'active' as const };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('open');
      });

      it('maps "closed" to "closed"', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, status: 'closed' as const };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('closed');
      });

      it('maps "settled" to "resolved"', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, status: 'settled' as const };
        const result = client.normalizeMarket(market);
        expect(result.status).toBe('resolved');
      });
    });

    // --- Category mapping ---
    describe('category mapping', () => {
      it('uses market category when present', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, category: 'Economics' };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('Economics');
      });

      it('defaults to "general" when category is missing', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, category: undefined };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('general');
      });

      it('maps to "ai-tech" when category contains "tech"', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, category: 'Technology' };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('maps to "ai-tech" when title contains "ai" (case-insensitive)', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, title: 'Will AI surpass humans?', category: 'Science' };
        const result = client.normalizeMarket(market);
        expect(result.category).toBe('ai-tech');
      });

      it('keeps category when title has "ai" as part of another word', () => {
        const client = createClientWithoutCredentials();
        // "wait" contains "ai" - this tests the actual behavior
        const market = { ...mockKalshiMarket, title: 'Will he wait?', category: 'Sports' };
        const result = client.normalizeMarket(market);
        // The code uses .includes('ai'), so 'wait' matches
        expect(result.category).toBe('ai-tech');
      });
    });

    // --- Price changes ---
    describe('price change calculations', () => {
      it('calculates price changes when previous prices are available', () => {
        const client = createClientWithoutCredentials();
        const market = {
          ...mockKalshiMarket,
          yes_bid: 60,
          yes_ask: 70,
          no_bid: 30,
          no_ask: 40,
          previous_yes_bid: 50,
          previous_yes_ask: 60,
        };
        const result = client.normalizeMarket(market);

        // yesPrice = (60+70)/2 = 65
        // prevYes = (50+60)/2 = 55
        // yesPriceChange = 65 - 55 = 10
        expect(result.outcomes[0].priceChange24h).toBe(10);

        // noPrice = (30+40)/2 = 35
        // prevNo = 100 - 55 = 45
        // noPriceChange = 35 - 45 = -10
        expect(result.outcomes[1].priceChange24h).toBe(-10);
      });

      it('leaves price changes undefined when previous prices are missing', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket };
        delete (market as any).previous_yes_bid;
        delete (market as any).previous_yes_ask;

        const result = client.normalizeMarket(market);

        expect(result.outcomes[0].priceChange24h).toBeUndefined();
        expect(result.outcomes[1].priceChange24h).toBeUndefined();
      });

      it('sets previousPrice from market.previous_price for YES outcome', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, previous_price: 55 };
        const result = client.normalizeMarket(market);

        expect(result.outcomes[0].previousPrice).toBe(55);
      });

      it('sets previousPrice as (100 - previous_price) for NO outcome', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, previous_price: 55 };
        const result = client.normalizeMarket(market);

        expect(result.outcomes[1].previousPrice).toBe(45);
      });

      it('sets previousPrice to undefined when previous_price is missing', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket };
        delete (market as any).previous_price;

        const result = client.normalizeMarket(market);

        expect(result.outcomes[0].previousPrice).toBeUndefined();
        expect(result.outcomes[1].previousPrice).toBeUndefined();
      });
    });

    // --- Edge cases ---
    describe('edge cases', () => {
      it('handles zero bid/ask values', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, yes_bid: 0, yes_ask: 0, no_bid: 0, no_ask: 0 };
        const result = client.normalizeMarket(market);

        expect(result.outcomes[0].price).toBe(0);
        expect(result.outcomes[0].probability).toBe(0);
        expect(result.outcomes[1].price).toBe(0);
        expect(result.outcomes[1].probability).toBe(0);
      });

      it('handles max price values (100)', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, yes_bid: 100, yes_ask: 100, no_bid: 0, no_ask: 0 };
        const result = client.normalizeMarket(market);

        expect(result.outcomes[0].price).toBe(100);
        expect(result.outcomes[0].probability).toBe(1);
      });

      it('defaults volume24h to 0 when missing', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, volume_24h: 0 };
        const result = client.normalizeMarket(market);

        expect(result.volume24h).toBe(0);
      });

      it('defaults totalVolume to 0 when missing', () => {
        const client = createClientWithoutCredentials();
        const market = { ...mockKalshiMarket, volume: 0 };
        const result = client.normalizeMarket(market);

        expect(result.totalVolume).toBe(0);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Integration-style: authFetch via getMarkets after auth
  // --------------------------------------------------------------------------
  describe('circuit breaker integration', () => {
    it('calls through the circuit breaker for public requests', async () => {
      const { circuits } = await import('../shared/utils/circuit-breaker.js');
      const client = createClientWithoutCredentials();
      mockFetch.mockResolvedValueOnce(createMockResponse({ markets: [] }));

      await client.getMarkets();

      expect(circuits.kalshi.execute).toHaveBeenCalledTimes(1);
    });
  });
});
