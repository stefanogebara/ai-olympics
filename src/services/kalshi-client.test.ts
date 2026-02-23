/**
 * Tests for kalshi-client.ts
 *
 * Covers: KalshiClient (credentials, authenticate, ensureAuth, getMarkets,
 * getMarket, getEvents, searchMarkets, normalizeMarket).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('../shared/utils/circuit-breaker.js', () => ({
  circuits: { kalshi: { execute: mockExecute } },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// polymarket-client is imported for the UnifiedMarket type only — no mock needed
vi.mock('./polymarket-client.js', () => ({}));

import { KalshiClient } from './kalshi-client.js';
import type { KalshiMarket } from './kalshi-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(''),
  } as unknown as Response;
}

function errResponse(status: number, body = 'error'): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: vi.fn(),
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const makeMarket = (overrides: Partial<KalshiMarket> = {}): KalshiMarket => ({
  ticker: 'TICK-1',
  event_ticker: 'EVENT-1',
  market_type: 'binary',
  title: 'Will X happen?',
  open_time: '2024-01-01T00:00:00Z',
  close_time: '2025-06-30T00:00:00Z',
  expiration_time: '2025-06-30T00:00:00Z',
  status: 'open',
  response_price_units: 'usd_cent',
  notional_value: 100,
  tick_size: 1,
  yes_bid: 40,
  yes_ask: 46,
  no_bid: 54,
  no_ask: 60,
  last_price: 43,
  volume: 5000,
  volume_24h: 200,
  liquidity: 1000,
  open_interest: 500,
  can_close_early: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

describe('KalshiClient — credentials', () => {
  afterEach(() => {
    delete process.env.KALSHI_EMAIL;
    delete process.env.KALSHI_PASSWORD;
  });

  it('hasCredentials returns true when both email and password are set', () => {
    process.env.KALSHI_EMAIL = 'test@example.com';
    process.env.KALSHI_PASSWORD = 'secret';
    const client = new KalshiClient();
    expect(client.hasCredentials()).toBe(true);
  });

  it('hasCredentials returns false when email is missing', () => {
    delete process.env.KALSHI_EMAIL;
    process.env.KALSHI_PASSWORD = 'secret';
    const client = new KalshiClient();
    expect(client.hasCredentials()).toBe(false);
  });

  it('hasCredentials returns false when password is missing', () => {
    process.env.KALSHI_EMAIL = 'test@example.com';
    delete process.env.KALSHI_PASSWORD;
    const client = new KalshiClient();
    expect(client.hasCredentials()).toBe(false);
  });

  it('hasCredentials returns false when neither is set', () => {
    delete process.env.KALSHI_EMAIL;
    delete process.env.KALSHI_PASSWORD;
    const client = new KalshiClient();
    expect(client.hasCredentials()).toBe(false);
  });

  it('isConfigured always returns true (public reads work without auth)', () => {
    const client = new KalshiClient();
    expect(client.isConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// authenticate
// ---------------------------------------------------------------------------

describe('KalshiClient.authenticate', () => {
  let client: KalshiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KALSHI_EMAIL = 'user@example.com';
    process.env.KALSHI_PASSWORD = 'pass123';
    client = new KalshiClient();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    delete process.env.KALSHI_EMAIL;
    delete process.env.KALSHI_PASSWORD;
    vi.unstubAllGlobals();
  });

  it('POSTs to /login with email and password', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ token: 'tok-abc', member_id: 'mem-123' })
    );

    await client.authenticate();

    expect(fetchMock).toHaveBeenCalledWith(
      `${KALSHI_BASE}/login`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'pass123' }),
      })
    );
  });

  it('returns the token on success', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ token: 'tok-xyz', member_id: 'mem-789' })
    );

    const token = await client.authenticate();

    expect(token).toBe('tok-xyz');
  });

  it('stores token and memberId on success', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ token: 'stored-tok', member_id: 'stored-mem' })
    );

    await client.authenticate();

    // Access private fields via any cast to test state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priv = client as any;
    expect(priv.token).toBe('stored-tok');
    expect(priv.memberId).toBe('stored-mem');
  });

  it('sets tokenExpiry to ~25 minutes from now', async () => {
    const before = Date.now();
    fetchMock.mockResolvedValue(
      okResponse({ token: 'tok', member_id: 'mem' })
    );

    await client.authenticate();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expiry = (client as any).tokenExpiry as number;
    const expectedWindow = 25 * 60 * 1000;
    expect(expiry).toBeGreaterThanOrEqual(before + expectedWindow - 100);
    expect(expiry).toBeLessThanOrEqual(before + expectedWindow + 1000);
  });

  it('throws when credentials are not configured', async () => {
    delete process.env.KALSHI_EMAIL;
    delete process.env.KALSHI_PASSWORD;
    const unconfigured = new KalshiClient();

    await expect(unconfigured.authenticate()).rejects.toThrow(
      'Kalshi credentials not configured'
    );
  });

  it('throws with status code when login returns non-ok', async () => {
    fetchMock.mockResolvedValue(errResponse(401, 'Invalid credentials'));

    await expect(client.authenticate()).rejects.toThrow('401');
  });
});

// ---------------------------------------------------------------------------
// ensureAuth
// ---------------------------------------------------------------------------

describe('KalshiClient.ensureAuth', () => {
  let client: KalshiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new KalshiClient();
  });

  it('calls authenticate when no token is set', async () => {
    const spy = vi.spyOn(client, 'authenticate').mockResolvedValue('new-tok');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).ensureAuth();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does not call authenticate when token is still valid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priv = client as any;
    priv.token = 'valid-tok';
    priv.tokenExpiry = Date.now() + 100_000;

    const spy = vi.spyOn(client, 'authenticate').mockResolvedValue('new-tok');
    await priv.ensureAuth();
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls authenticate when token is expired', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priv = client as any;
    priv.token = 'expired-tok';
    priv.tokenExpiry = Date.now() - 1000;

    const spy = vi.spyOn(client, 'authenticate').mockResolvedValue('refreshed-tok');
    await priv.ensureAuth();
    expect(spy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// getMarkets
// ---------------------------------------------------------------------------

describe('KalshiClient.getMarkets', () => {
  let client: KalshiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new KalshiClient();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockExecute.mockImplementation((fn: () => Promise<Response>) => fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('calls GET /markets with no params by default', async () => {
    fetchMock.mockResolvedValue(okResponse({ markets: [] }));

    await client.getMarkets();

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`${KALSHI_BASE}/markets`);
  });

  it('returns the markets array and cursor', async () => {
    const markets = [makeMarket()];
    fetchMock.mockResolvedValue(okResponse({ markets, cursor: 'next-page' }));

    const result = await client.getMarkets();

    expect(result.markets).toEqual(markets);
    expect(result.cursor).toBe('next-page');
  });

  it('includes all optional params in the URL', async () => {
    fetchMock.mockResolvedValue(okResponse({ markets: [] }));

    await client.getMarkets({
      status: 'open',
      cursor: 'cursor-abc',
      limit: 50,
      event_ticker: 'EVENT-X',
      series_ticker: 'SERIES-Y',
      tickers: 'TICK-1,TICK-2',
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('status=open');
    expect(url).toContain('cursor=cursor-abc');
    expect(url).toContain('limit=50');
    expect(url).toContain('event_ticker=EVENT-X');
    expect(url).toContain('series_ticker=SERIES-Y');
    expect(url).toContain('tickers=TICK-1%2CTICK-2');
  });

  it('throws when response is not ok', async () => {
    fetchMock.mockResolvedValue(errResponse(503));

    await expect(client.getMarkets()).rejects.toThrow(
      'Failed to fetch Kalshi markets: 503'
    );
  });
});

// ---------------------------------------------------------------------------
// getMarket
// ---------------------------------------------------------------------------

describe('KalshiClient.getMarket', () => {
  let client: KalshiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new KalshiClient();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockExecute.mockImplementation((fn: () => Promise<Response>) => fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('calls GET /markets/:ticker', async () => {
    fetchMock.mockResolvedValue(okResponse({ market: makeMarket() }));

    await client.getMarket('TICK-42');

    expect(fetchMock).toHaveBeenCalledWith(
      `${KALSHI_BASE}/markets/TICK-42`,
      expect.any(Object)
    );
  });

  it('returns data.market (unwraps envelope)', async () => {
    const market = makeMarket({ ticker: 'TICK-42', title: 'Specific question?' });
    fetchMock.mockResolvedValue(okResponse({ market }));

    const result = await client.getMarket('TICK-42');

    expect(result).toEqual(market);
  });

  it('throws with ticker in message when not ok', async () => {
    fetchMock.mockResolvedValue(errResponse(404));

    await expect(client.getMarket('MISSING')).rejects.toThrow('MISSING');
  });
});

// ---------------------------------------------------------------------------
// getEvents
// ---------------------------------------------------------------------------

describe('KalshiClient.getEvents', () => {
  let client: KalshiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new KalshiClient();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockExecute.mockImplementation((fn: () => Promise<Response>) => fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('calls GET /events', async () => {
    fetchMock.mockResolvedValue(okResponse({ events: [] }));

    await client.getEvents();

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`${KALSHI_BASE}/events`);
  });

  it('includes optional params including with_nested_markets', async () => {
    fetchMock.mockResolvedValue(okResponse({ events: [] }));

    await client.getEvents({
      status: 'open',
      cursor: 'c1',
      limit: 10,
      series_ticker: 'SER',
      with_nested_markets: true,
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('status=open');
    expect(url).toContain('cursor=c1');
    expect(url).toContain('limit=10');
    expect(url).toContain('series_ticker=SER');
    expect(url).toContain('with_nested_markets=true');
  });

  it('passes with_nested_markets=false correctly', async () => {
    fetchMock.mockResolvedValue(okResponse({ events: [] }));

    await client.getEvents({ with_nested_markets: false });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('with_nested_markets=false');
  });

  it('throws when response is not ok', async () => {
    fetchMock.mockResolvedValue(errResponse(500));

    await expect(client.getEvents()).rejects.toThrow(
      'Failed to fetch Kalshi events: 500'
    );
  });
});

// ---------------------------------------------------------------------------
// searchMarkets
// ---------------------------------------------------------------------------

describe('KalshiClient.searchMarkets', () => {
  let client: KalshiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  const markets = [
    makeMarket({ ticker: 'A', title: 'Will AI win chess?', category: 'tech' }),
    makeMarket({ ticker: 'B', title: 'Stock market crash?', subtitle: 'AI driven crash' }),
    makeMarket({ ticker: 'C', title: 'Election 2026?', category: 'politics' }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    client = new KalshiClient();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockExecute.mockImplementation((fn: () => Promise<Response>) => fn());
    fetchMock.mockResolvedValue(okResponse({ markets }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('filters by title (case-insensitive)', async () => {
    const result = await client.searchMarkets('chess');
    expect(result.map(m => m.ticker)).toEqual(['A']);
  });

  it('filters by subtitle', async () => {
    const result = await client.searchMarkets('driven crash');
    expect(result.map(m => m.ticker)).toEqual(['B']);
  });

  it('filters by category', async () => {
    const result = await client.searchMarkets('politics');
    expect(result.map(m => m.ticker)).toEqual(['C']);
  });

  it('returns all matches when multiple match', async () => {
    const result = await client.searchMarkets('ai'); // matches title A and subtitle B
    expect(result.map(m => m.ticker)).toContain('A');
    expect(result.map(m => m.ticker)).toContain('B');
  });

  it('respects the limit parameter', async () => {
    // All 3 match '' but limit=2
    const result = await client.searchMarkets('', 2);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when nothing matches', async () => {
    const result = await client.searchMarkets('zzz-no-match');
    expect(result).toEqual([]);
  });

  it('uses status=open and limit=100 internally', async () => {
    await client.searchMarkets('AI');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('status=open');
    expect(url).toContain('limit=100');
  });
});

// ---------------------------------------------------------------------------
// normalizeMarket
// ---------------------------------------------------------------------------

describe('KalshiClient.normalizeMarket', () => {
  const client = new KalshiClient();

  it('sets id to ticker and source to "kalshi"', () => {
    const result = client.normalizeMarket(makeMarket({ ticker: 'MY-TICK' }));
    expect(result.id).toBe('MY-TICK');
    expect(result.source).toBe('kalshi');
  });

  it('sets question to title and description to subtitle', () => {
    const result = client.normalizeMarket(
      makeMarket({ title: 'My question?', subtitle: 'Some detail' })
    );
    expect(result.question).toBe('My question?');
    expect(result.description).toBe('Some detail');
  });

  it('calculates YES mid-price from bid/ask', () => {
    // yes_bid=40, yes_ask=46 → mid=43
    const result = client.normalizeMarket(makeMarket({ yes_bid: 40, yes_ask: 46 }));
    const yes = result.outcomes.find(o => o.name === 'YES')!;
    expect(yes.price).toBe(43);
    expect(yes.probability).toBeCloseTo(0.43, 5);
  });

  it('calculates NO mid-price from bid/ask', () => {
    // no_bid=54, no_ask=60 → mid=57
    const result = client.normalizeMarket(makeMarket({ no_bid: 54, no_ask: 60 }));
    const no = result.outcomes.find(o => o.name === 'NO')!;
    expect(no.price).toBe(57);
    expect(no.probability).toBeCloseTo(0.57, 5);
  });

  it('outcome ids use ticker as prefix', () => {
    const result = client.normalizeMarket(makeMarket({ ticker: 'T1' }));
    expect(result.outcomes[0].id).toBe('T1-yes');
    expect(result.outcomes[1].id).toBe('T1-no');
  });

  it('includes price change when previous bid/ask are available', () => {
    const market = makeMarket({
      yes_bid: 40, yes_ask: 46,   // mid = 43
      no_bid: 54, no_ask: 60,     // mid = 57
      previous_yes_bid: 38, previous_yes_ask: 42, // prevYes = 40
    });
    const result = client.normalizeMarket(market);
    const yes = result.outcomes.find(o => o.name === 'YES')!;
    const no = result.outcomes.find(o => o.name === 'NO')!;
    // yesPriceChange = 43 - 40 = 3
    expect(yes.priceChange24h).toBeCloseTo(3, 5);
    // prevNo = 100 - 40 = 60; noPriceChange = 57 - 60 = -3
    expect(no.priceChange24h).toBeCloseTo(-3, 5);
  });

  it('leaves priceChange24h undefined when previous prices absent', () => {
    const result = client.normalizeMarket(makeMarket());
    expect(result.outcomes[0].priceChange24h).toBeUndefined();
  });

  it('maps status "settled" to "resolved"', () => {
    expect(client.normalizeMarket(makeMarket({ status: 'settled' })).status).toBe('resolved');
  });

  it('maps status "closed" to "closed"', () => {
    expect(client.normalizeMarket(makeMarket({ status: 'closed' })).status).toBe('closed');
  });

  it('maps status "active" to "open"', () => {
    expect(client.normalizeMarket(makeMarket({ status: 'active' })).status).toBe('open');
  });

  it('maps status "open" to "open"', () => {
    expect(client.normalizeMarket(makeMarket({ status: 'open' })).status).toBe('open');
  });

  it('maps category containing "tech" to "ai-tech"', () => {
    const result = client.normalizeMarket(makeMarket({ category: 'technology' }));
    expect(result.category).toBe('ai-tech');
  });

  it('maps to "ai-tech" when title contains "ai" (case-insensitive)', () => {
    const result = client.normalizeMarket(
      makeMarket({ category: 'sports', title: 'Will AI beat humans?' })
    );
    expect(result.category).toBe('ai-tech');
  });

  it('uses "general" as default category when no category set', () => {
    const result = client.normalizeMarket(
      makeMarket({ category: undefined, title: 'Something else?' })
    );
    expect(result.category).toBe('general');
  });

  it('converts close_time string to millisecond timestamp', () => {
    const market = makeMarket({ close_time: '2025-06-30T00:00:00Z' });
    const result = client.normalizeMarket(market);
    expect(result.closeTime).toBe(new Date('2025-06-30T00:00:00Z').getTime());
  });

  it('uses volume_24h for volume24h, defaulting to 0', () => {
    expect(client.normalizeMarket(makeMarket({ volume_24h: 350 })).volume24h).toBe(350);
    expect(client.normalizeMarket(makeMarket({ volume_24h: 0 })).volume24h).toBe(0);
  });

  it('uses volume for totalVolume, defaulting to 0', () => {
    expect(client.normalizeMarket(makeMarket({ volume: 9999 })).totalVolume).toBe(9999);
  });

  it('uses liquidity when non-zero', () => {
    expect(client.normalizeMarket(makeMarket({ liquidity: 500 })).liquidity).toBe(500);
  });

  it('falls back to open_interest when liquidity is 0', () => {
    const result = client.normalizeMarket(makeMarket({ liquidity: 0, open_interest: 300 }));
    expect(result.liquidity).toBe(300);
  });

  it('builds the Kalshi URL from ticker', () => {
    const result = client.normalizeMarket(makeMarket({ ticker: 'TICK-99' }));
    expect(result.url).toBe('https://kalshi.com/markets/TICK-99');
  });
});
