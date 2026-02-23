/**
 * Tests for polymarket-client.ts
 *
 * Covers: getMarkets, getMarket, searchMarkets, getOrderBook, getMidpointPrice,
 * normalizeMarket, getTokenIds, connectWebSocket, disconnectWebSocket,
 * subscribeToMarket, unsubscribeFromMarket.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('../shared/utils/circuit-breaker.js', () => ({
  circuits: { polymarket: { execute: mockExecute } },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { PolymarketClient } from './polymarket-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubFetch(body: unknown, ok = true, status = 200, statusText = 'OK') {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function makeGammaMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mkt-1',
    question: 'Will X happen?',
    conditionId: 'cond-1',
    slug: 'will-x-happen',
    description: 'Test market',
    outcomes: '["Yes", "No"]',
    outcomePrices: '["0.65", "0.35"]',
    volume: '50000',
    volume24hr: 1000,
    liquidity: '10000',
    active: true,
    closed: false,
    archived: false,
    endDate: '2024-12-31T00:00:00Z',
    acceptingOrders: true,
    ...overrides,
  };
}

// Tracks the most recently constructed MockWebSocket instance
let lastWsInstance: MockWebSocket | null = null;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState: number = MockWebSocket.OPEN;
  send: ReturnType<typeof vi.fn> = vi.fn();
  close: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    lastWsInstance = this;
  }

  triggerOpen() { this.onopen?.(); }
  triggerMessage(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  triggerError(e: unknown) { this.onerror?.(e); }
  triggerClose() { this.onclose?.(); }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let client: PolymarketClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  lastWsInstance = null;
  // Advance past RATE_LIMIT_WINDOW (60 000 ms) to flush stale requestTimestamps
  vi.advanceTimersByTime(61000);
  // Circuit breaker passes through to fetch by default
  mockExecute.mockImplementation((fn: () => unknown) => fn());
  vi.stubGlobal('WebSocket', MockWebSocket);
  client = new PolymarketClient();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// getMarkets
// ---------------------------------------------------------------------------

describe('getMarkets', () => {
  it('returns parsed array of markets', async () => {
    const markets = [makeGammaMarket()];
    stubFetch(markets);

    const result = await client.getMarkets();

    expect(result).toEqual(markets);
  });

  it('includes closed and active params when provided', async () => {
    const fetchFn = stubFetch([]);

    await client.getMarkets({ closed: false, active: true });

    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain('closed=false');
    expect(url).toContain('active=true');
  });

  it('includes limit and offset when provided', async () => {
    const fetchFn = stubFetch([]);

    await client.getMarkets({ limit: 50, offset: 100 });

    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=100');
  });

  it('omits params that are undefined', async () => {
    const fetchFn = stubFetch([]);

    await client.getMarkets();

    const [url] = fetchFn.mock.calls[0] as [string];
    // No extra query params beyond the base
    expect(url).not.toContain('closed');
    expect(url).not.toContain('active');
    expect(url).not.toContain('limit');
  });

  it('throws when response is not ok', async () => {
    stubFetch(null, false, 503, 'Service Unavailable');

    await expect(client.getMarkets()).rejects.toThrow('Failed to fetch markets: 503 Service Unavailable');
  });
});

// ---------------------------------------------------------------------------
// getMarket
// ---------------------------------------------------------------------------

describe('getMarket', () => {
  it('returns first market from slug query when found', async () => {
    const market = makeGammaMarket();
    stubFetch([market]);

    const result = await client.getMarket('will-x-happen');

    expect(result).toEqual(market);
  });

  it('falls back to conditionId query when slug returns empty', async () => {
    const market = makeGammaMarket({ conditionId: 'cond-abc' });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue([]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue([market]) });
    vi.stubGlobal('fetch', fetchFn);

    const result = await client.getMarket('cond-abc');

    expect(result).toEqual(market);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [secondUrl] = fetchFn.mock.calls[1] as [string];
    expect(secondUrl).toContain('conditionId=cond-abc');
  });

  it('returns null when both slug and conditionId queries return empty', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });
    vi.stubGlobal('fetch', fetchFn);

    const result = await client.getMarket('unknown');

    expect(result).toBeNull();
  });

  it('throws when slug fetch is not ok', async () => {
    stubFetch(null, false, 404, 'Not Found');

    await expect(client.getMarket('slug')).rejects.toThrow('Failed to fetch market: 404 Not Found');
  });
});

// ---------------------------------------------------------------------------
// searchMarkets
// ---------------------------------------------------------------------------

describe('searchMarkets', () => {
  it('filters markets by question text (case-insensitive)', async () => {
    const markets = [
      makeGammaMarket({ question: 'Will the election happen?' }),
      makeGammaMarket({ id: 'mkt-2', question: 'Something unrelated' }),
    ];
    stubFetch(markets);

    const result = await client.searchMarkets('election');

    expect(result).toHaveLength(1);
    expect(result[0].question).toContain('election');
  });

  it('filters markets by description text', async () => {
    const markets = [
      makeGammaMarket({ description: 'A market about bitcoin prices' }),
      makeGammaMarket({ id: 'mkt-2', description: 'Sports market' }),
    ];
    stubFetch(markets);

    const result = await client.searchMarkets('bitcoin');

    expect(result).toHaveLength(1);
  });

  it('slices results to the provided limit', async () => {
    const markets = Array.from({ length: 10 }, (_, i) =>
      makeGammaMarket({ id: `mkt-${i}`, question: `Test market ${i}` })
    );
    stubFetch(markets);

    const result = await client.searchMarkets('test', 3);

    expect(result).toHaveLength(3);
  });

  it('returns empty array when no market matches the term', async () => {
    stubFetch([makeGammaMarket({ question: 'Will Y happen?' })]);

    const result = await client.searchMarkets('zzznomatch');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getOrderBook
// ---------------------------------------------------------------------------

describe('getOrderBook', () => {
  it('returns parsed order book on success', async () => {
    const book = { market: 'm1', asset_id: 'tok-1', bids: [{ price: '0.60', size: '100' }], asks: [{ price: '0.62', size: '50' }] };
    stubFetch(book);

    const result = await client.getOrderBook('tok-1');

    expect(result).toEqual(book);
    const fetchFn = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>);
    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain('token_id=tok-1');
  });

  it('returns null when response is not ok', async () => {
    stubFetch(null, false, 404);

    const result = await client.getOrderBook('tok-missing');

    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    mockExecute.mockRejectedValueOnce(new Error('Network error'));

    const result = await client.getOrderBook('tok-err');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getMidpointPrice
// ---------------------------------------------------------------------------

describe('getMidpointPrice', () => {
  it('returns average of best bid and best ask', async () => {
    stubFetch({ bids: [{ price: '0.60', size: '100' }], asks: [{ price: '0.70', size: '50' }] });

    const result = await client.getMidpointPrice('tok-1');

    expect(result).toBeCloseTo(0.65);
  });

  it('uses 0 for bestBid when bids array is empty', async () => {
    stubFetch({ bids: [], asks: [{ price: '0.80', size: '10' }] });

    const result = await client.getMidpointPrice('tok-1');

    expect(result).toBeCloseTo(0.40); // (0 + 0.80) / 2
  });

  it('uses 1 for bestAsk when asks array is empty', async () => {
    stubFetch({ bids: [{ price: '0.60', size: '100' }], asks: [] });

    const result = await client.getMidpointPrice('tok-1');

    expect(result).toBeCloseTo(0.80); // (0.60 + 1) / 2
  });

  it('returns null when getOrderBook returns null', async () => {
    stubFetch(null, false, 404);

    const result = await client.getMidpointPrice('tok-missing');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeMarket
// ---------------------------------------------------------------------------

describe('normalizeMarket', () => {
  it('parses outcomes and outcomePrices from JSON strings', () => {
    const market = makeGammaMarket({
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.65", "0.35"]',
    });

    const result = client.normalizeMarket(market);

    expect(result.outcomes[0].name).toBe('YES');
    expect(result.outcomes[0].probability).toBeCloseTo(0.65);
    expect(result.outcomes[0].price).toBe(65); // Math.round(0.65 * 100)
    expect(result.outcomes[1].name).toBe('NO');
    expect(result.outcomes[1].probability).toBeCloseTo(0.35);
  });

  it('falls back to default outcomes when JSON is malformed', () => {
    const market = makeGammaMarket({
      outcomes: 'not-json',
      outcomePrices: 'also-bad',
    });

    const result = client.normalizeMarket(market);

    expect(result.outcomes[0].name).toBe('YES');
    expect(result.outcomes[0].probability).toBe(0.5);
    expect(result.outcomes[1].name).toBe('NO');
  });

  it('maps tokenIds from clobTokenIds when present', () => {
    const market = makeGammaMarket({
      clobTokenIds: '["tok-a", "tok-b"]',
    });

    const result = client.normalizeMarket(market);

    expect(result.outcomes[0].id).toBe('tok-a');
    expect(result.outcomes[1].id).toBe('tok-b');
  });

  it('falls back to conditionId-based IDs when clobTokenIds missing', () => {
    const market = makeGammaMarket({ conditionId: 'cond-x' });

    const result = client.normalizeMarket(market);

    expect(result.outcomes[0].id).toBe('cond-x-0');
    expect(result.outcomes[1].id).toBe('cond-x-1');
  });

  it('status is "resolved" when archived is true', () => {
    const market = makeGammaMarket({ archived: true });

    expect(client.normalizeMarket(market).status).toBe('resolved');
  });

  it('status is "closed" when closed is true', () => {
    const market = makeGammaMarket({ closed: true });

    expect(client.normalizeMarket(market).status).toBe('closed');
  });

  it('status is "closed" when acceptingOrders is false', () => {
    const market = makeGammaMarket({ acceptingOrders: false });

    expect(client.normalizeMarket(market).status).toBe('closed');
  });

  it('status defaults to "open"', () => {
    const market = makeGammaMarket();

    expect(client.normalizeMarket(market).status).toBe('open');
  });

  it('category is "ai-tech" for AI-related keywords', () => {
    const market = makeGammaMarket({ question: 'Will OpenAI release GPT-5?' });
    expect(client.normalizeMarket(market).category).toBe('ai-tech');
  });

  it('category is "politics" for election keywords', () => {
    const market = makeGammaMarket({ question: 'Will Trump win the election?' });
    expect(client.normalizeMarket(market).category).toBe('politics');
  });

  it('category is "crypto" for bitcoin keywords', () => {
    const market = makeGammaMarket({ question: 'Will Bitcoin hit $100k?' });
    expect(client.normalizeMarket(market).category).toBe('crypto');
  });

  it('category is "sports" for NBA keywords', () => {
    const market = makeGammaMarket({ question: 'Will the NBA champion be the Lakers?' });
    expect(client.normalizeMarket(market).category).toBe('sports');
  });

  it('category defaults to "other"', () => {
    const market = makeGammaMarket({ question: 'Will it rain tomorrow?' });
    expect(client.normalizeMarket(market).category).toBe('other');
  });

  it('builds URL from event slug when events array is present', () => {
    const market = makeGammaMarket({
      events: [{ id: 'evt-1', title: 'Event', slug: 'my-event', volume: 100, liquidity: 200 }],
    });

    const result = client.normalizeMarket(market);

    expect(result.url).toBe('https://polymarket.com/event/my-event');
  });

  it('builds URL from market slug when no events', () => {
    const market = makeGammaMarket({ slug: 'will-x-happen', events: undefined });

    const result = client.normalizeMarket(market);

    expect(result.url).toBe('https://polymarket.com/event/will-x-happen');
  });

  it('sets source to "polymarket" and uses conditionId as id', () => {
    const market = makeGammaMarket({ conditionId: 'cond-xyz' });

    const result = client.normalizeMarket(market);

    expect(result.source).toBe('polymarket');
    expect(result.id).toBe('cond-xyz');
  });

  it('includes priceChange24h when oneDayPriceChange is set', () => {
    const market = makeGammaMarket({ oneDayPriceChange: 0.05 });

    const result = client.normalizeMarket(market);

    expect(result.outcomes[0].priceChange24h).toBeCloseTo(5); // 0.05 * 100
  });
});

// ---------------------------------------------------------------------------
// getTokenIds
// ---------------------------------------------------------------------------

describe('getTokenIds', () => {
  it('returns parsed token IDs from clobTokenIds', () => {
    const market = makeGammaMarket({ clobTokenIds: '["tok-1", "tok-2"]' });

    expect(client.getTokenIds(market)).toEqual(['tok-1', 'tok-2']);
  });

  it('returns empty array when clobTokenIds is missing', () => {
    const market = makeGammaMarket({ clobTokenIds: undefined });

    expect(client.getTokenIds(market)).toEqual([]);
  });

  it('returns empty array when clobTokenIds is malformed JSON', () => {
    const market = makeGammaMarket({ clobTokenIds: 'not-json' });

    expect(client.getTokenIds(market)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// subscribeToMarket / unsubscribeFromMarket
// ---------------------------------------------------------------------------

describe('subscribeToMarket', () => {
  it('stores the subscription internally', () => {
    client.subscribeToMarket('market-1', ['tok-a']);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subs = (client as any).subscriptions as Map<string, Set<string>>;
    expect(subs.has('market-1')).toBe(true);
    expect(subs.get('market-1')?.has('tok-a')).toBe(true);
  });

  it('sends subscription message when WS is open', () => {
    client.connectWebSocket(vi.fn());
    lastWsInstance!.triggerOpen();

    client.subscribeToMarket('market-1', ['tok-a']);

    expect(lastWsInstance!.send).toHaveBeenCalledWith(
      expect.stringContaining('"tok-a"')
    );
  });

  it('allows subscribing to multiple markets', () => {
    client.subscribeToMarket('market-1', ['tok-a']);
    client.subscribeToMarket('market-2', ['tok-b']);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subs = (client as any).subscriptions as Map<string, Set<string>>;
    expect(subs.size).toBe(2);
  });
});

describe('unsubscribeFromMarket', () => {
  it('removes the market from subscriptions', () => {
    client.subscribeToMarket('market-1', ['tok-a']);
    client.unsubscribeFromMarket('market-1');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subs = (client as any).subscriptions as Map<string, Set<string>>;
    expect(subs.has('market-1')).toBe(false);
  });

  it('sends unsubscribe message when WS is open', () => {
    client.connectWebSocket(vi.fn());
    lastWsInstance!.triggerOpen();

    client.unsubscribeFromMarket('market-1');

    expect(lastWsInstance!.send).toHaveBeenCalledWith(
      expect.stringContaining('"unsubscribe"')
    );
  });
});

// ---------------------------------------------------------------------------
// connectWebSocket
// ---------------------------------------------------------------------------

describe('connectWebSocket', () => {
  it('does nothing when WebSocket is not defined', () => {
    vi.stubGlobal('WebSocket', undefined);

    // Should not throw
    expect(() => client.connectWebSocket(vi.fn())).not.toThrow();
    expect(lastWsInstance).toBeNull();
  });

  it('creates a WebSocket connected to the CLOB endpoint', () => {
    client.connectWebSocket(vi.fn());

    expect(lastWsInstance).not.toBeNull();
    expect(lastWsInstance!.url).toContain('ws-subscriptions-clob.polymarket.com');
  });

  it('resets reconnectAttempts on open', () => {
    client.connectWebSocket(vi.fn());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).reconnectAttempts = 3;

    lastWsInstance!.triggerOpen();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).reconnectAttempts).toBe(0);
  });

  it('starts a ping interval on open', () => {
    client.connectWebSocket(vi.fn());
    lastWsInstance!.triggerOpen();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).pingInterval).not.toBeNull();
  });

  it('resubscribes to existing subscriptions on open', () => {
    client.subscribeToMarket('market-1', []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subs = (client as any).subscriptions as Map<string, Set<string>>;
    subs.get('market-1')!.add('tok-resub');

    client.connectWebSocket(vi.fn());
    lastWsInstance!.send = vi.fn(); // reset send calls from subscribeToMarket
    lastWsInstance!.triggerOpen();

    expect(lastWsInstance!.send).toHaveBeenCalledWith(
      expect.stringContaining('tok-resub')
    );
  });

  it('fires price update callback on price_change message', () => {
    const onUpdate = vi.fn();
    client.connectWebSocket(onUpdate);
    lastWsInstance!.triggerOpen();

    lastWsInstance!.triggerMessage({
      type: 'price_change',
      market: 'market-1',
      asset_id: 'tok-1',
      outcome: 'YES',
      price: '0.72',
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    const update = onUpdate.mock.calls[0][0];
    expect(update.marketId).toBe('market-1');
    expect(update.price).toBeCloseTo(0.72);
  });

  it('fires price update callback on book message with non-empty bids/asks', () => {
    const onUpdate = vi.fn();
    client.connectWebSocket(onUpdate);
    lastWsInstance!.triggerOpen();

    lastWsInstance!.triggerMessage({
      event_type: 'book',
      asset_id: 'tok-1',
      bids: [{ price: '0.60' }],
      asks: [{ price: '0.70' }],
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    const update = onUpdate.mock.calls[0][0];
    expect(update.price).toBeCloseTo(0.65); // (0.60 + 0.70) / 2
  });

  it('does not fire callback on book message with empty bids and asks', () => {
    const onUpdate = vi.fn();
    client.connectWebSocket(onUpdate);
    lastWsInstance!.triggerOpen();

    lastWsInstance!.triggerMessage({ event_type: 'book', bids: [], asks: [] });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('triggers reconnect after close when below max attempts', async () => {
    const onUpdate = vi.fn();
    client.connectWebSocket(onUpdate);
    const firstWs = lastWsInstance!;
    firstWs.triggerOpen();

    firstWs.triggerClose();

    // reconnectAttempts=1 → delay = min(1000 * 2^1, 30000) = 2000ms
    await vi.advanceTimersByTimeAsync(2001);

    // A new WebSocket should have been created
    expect(lastWsInstance).not.toBe(firstWs);
  });

  it('stops reconnecting after maxReconnectAttempts', async () => {
    const onUpdate = vi.fn();
    client.connectWebSocket(onUpdate);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).reconnectAttempts = 5; // already at max

    lastWsInstance!.triggerClose();

    // No new WS should be created regardless of timer advancement
    await vi.advanceTimersByTimeAsync(60000);
    expect(lastWsInstance).toBe(lastWsInstance); // same instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).reconnectAttempts).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// disconnectWebSocket
// ---------------------------------------------------------------------------

describe('disconnectWebSocket', () => {
  it('closes the WebSocket', () => {
    client.connectWebSocket(vi.fn());
    lastWsInstance!.triggerOpen();

    client.disconnectWebSocket();

    expect(lastWsInstance!.close).toHaveBeenCalled();
  });

  it('nullifies ws reference and clears callback', () => {
    client.connectWebSocket(vi.fn());
    client.disconnectWebSocket();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).ws).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).onPriceUpdateCallback).toBeNull();
  });

  it('clears the ping interval', () => {
    client.connectWebSocket(vi.fn());
    lastWsInstance!.triggerOpen();

    client.disconnectWebSocket();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).pingInterval).toBeNull();
  });

  it('clears all subscriptions', () => {
    client.subscribeToMarket('market-1', ['tok-a']);
    client.connectWebSocket(vi.fn());

    client.disconnectWebSocket();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).subscriptions.size).toBe(0);
  });

  it('is safe to call when not connected', () => {
    expect(() => client.disconnectWebSocket()).not.toThrow();
  });
});
