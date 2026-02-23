/**
 * Tests for polymarket-trading.ts
 *
 * Covers: loadCredentials, placeMarketOrder, getOrderStatus, getUserPositions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { polymarketTradingService } from './polymarket-trading.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'update', 'insert', 'order']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function mockFetch(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(String(body)),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const CREDS = { address: '0xABC', apiSecret: 'secret-key' };

function setupCredentials(overrides: Record<string, unknown> = {}) {
  mockFrom.mockReturnValueOnce(
    chain({ data: { encrypted_credentials: { ...CREDS, ...overrides } }, error: null })
  );
}

// ---------------------------------------------------------------------------
// loadCredentials
// ---------------------------------------------------------------------------

describe('loadCredentials', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns encrypted_credentials on success', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: { encrypted_credentials: CREDS }, error: null })
    );

    const result = await polymarketTradingService.loadCredentials('user-1');

    expect(result).toEqual(CREDS);
    const q = mockFrom.mock.results[0].value;
    expect(mockFrom).toHaveBeenCalledWith('aio_exchange_credentials');
    expect(q.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(q.eq).toHaveBeenCalledWith('exchange', 'polymarket');
    expect(q.single).toHaveBeenCalled();
  });

  it('throws when DB returns an error', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: null, error: { message: 'not found' } })
    );

    await expect(polymarketTradingService.loadCredentials('user-x')).rejects.toThrow(
      'No Polymarket credentials found for user: not found'
    );
  });
});

// ---------------------------------------------------------------------------
// placeMarketOrder
// ---------------------------------------------------------------------------

describe('placeMarketOrder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('maps YES outcome to BUY side', async () => {
    setupCredentials();
    const fetchMock = mockFetch({ orderID: 'ord-1', status: 'submitted', fills: [] });

    await polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'YES', 50);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.side).toBe('BUY');
    expect(body.market).toBe('cond-1');
    expect(body.size).toBe('50');
    expect(body.type).toBe('market');
  });

  it('maps NO outcome to SELL side', async () => {
    setupCredentials();
    const fetchMock = mockFetch({ orderID: 'ord-2', status: 'submitted', fills: [] });

    await polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'NO', 25);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.side).toBe('SELL');
  });

  it('is case-insensitive for outcome (yes → BUY)', async () => {
    setupCredentials();
    mockFetch({ orderID: 'ord-3', status: 'submitted', fills: [] });

    await polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'yes', 10);

    const fetchMock = vi.mocked(global.fetch);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.side).toBe('BUY');
  });

  it('sends credentials in request headers', async () => {
    setupCredentials();
    const fetchMock = mockFetch({ orderID: 'ord-4', status: 'submitted', fills: [] });

    await polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'YES', 100);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://clob.polymarket.com/order');
    expect((init.headers as Record<string, string>)['POLY-ADDRESS']).toBe(CREDS.address);
    expect((init.headers as Record<string, string>)['POLY-SIGNATURE']).toBe(CREDS.apiSecret);
  });

  it('returns orderId from orderID field', async () => {
    setupCredentials();
    mockFetch({ orderID: 'ord-from-orderID', status: 'filled', fills: [{ price: '0.9', size: '10' }] });

    const result = await polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'YES', 10);

    expect(result.orderId).toBe('ord-from-orderID');
    expect(result.status).toBe('filled');
    expect(result.fills).toEqual([{ price: '0.9', size: '10' }]);
  });

  it('falls back to id field when orderID is absent', async () => {
    setupCredentials();
    mockFetch({ id: 'ord-from-id', status: 'submitted' });

    const result = await polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'YES', 10);

    expect(result.orderId).toBe('ord-from-id');
  });

  it('defaults orderId to empty string and fills to [] when both absent', async () => {
    setupCredentials();
    mockFetch({ status: 'submitted' });

    const result = await polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'YES', 10);

    expect(result.orderId).toBe('');
    expect(result.fills).toEqual([]);
  });

  it('defaults status to "submitted" when absent', async () => {
    setupCredentials();
    mockFetch({ orderID: 'ord-9' });

    const result = await polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'YES', 10);

    expect(result.status).toBe('submitted');
  });

  it('throws when response is not ok', async () => {
    setupCredentials();
    mockFetch('Order rejected', false, 400);

    await expect(
      polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'YES', 10)
    ).rejects.toThrow('Polymarket order failed: 400 - Order rejected');
  });

  it('propagates credential load failure', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: null, error: { message: 'no creds' } })
    );

    await expect(
      polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'YES', 10)
    ).rejects.toThrow('No Polymarket credentials found');
  });

  it('uses empty strings when credentials lack address/apiSecret', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: { encrypted_credentials: {} }, error: null })
    );
    const fetchMock = mockFetch({ orderID: 'ord-x', status: 'submitted', fills: [] });

    await polymarketTradingService.placeMarketOrder('user-1', 'cond-1', 'YES', 10);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['POLY-ADDRESS']).toBe('');
    expect((init.headers as Record<string, string>)['POLY-SIGNATURE']).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getOrderStatus
// ---------------------------------------------------------------------------

describe('getOrderStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fetches from correct URL and returns order status', async () => {
    const statusData = {
      id: 'ord-1',
      status: 'filled',
      side: 'BUY',
      size: '100',
      price: '0.85',
      filled: '100',
    };
    const fetchMock = mockFetch(statusData);

    const result = await polymarketTradingService.getOrderStatus('ord-1');

    expect(result).toEqual(statusData);
    expect(fetchMock).toHaveBeenCalledWith('https://clob.polymarket.com/order/ord-1');
  });

  it('throws when response is not ok', async () => {
    mockFetch(null, false, 404);

    await expect(polymarketTradingService.getOrderStatus('ord-missing')).rejects.toThrow(
      'Failed to get order status: 404'
    );
  });

  it('propagates network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(polymarketTradingService.getOrderStatus('ord-1')).rejects.toThrow('network down');
  });
});

// ---------------------------------------------------------------------------
// getUserPositions
// ---------------------------------------------------------------------------

describe('getUserPositions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fetches positions without conditionId', async () => {
    setupCredentials();
    const positions = [{ tokenId: 'tok-1', size: '50' }];
    const fetchMock = mockFetch(positions);

    const result = await polymarketTradingService.getUserPositions('user-1');

    expect(result).toEqual(positions);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://clob.polymarket.com/positions?');
  });

  it('appends market param when conditionId is provided', async () => {
    setupCredentials();
    const positions = [{ tokenId: 'tok-2', size: '25' }];
    const fetchMock = mockFetch(positions);

    await polymarketTradingService.getUserPositions('user-1', 'cond-42');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://clob.polymarket.com/positions?market=cond-42');
  });

  it('sends credentials in headers', async () => {
    setupCredentials();
    const fetchMock = mockFetch([]);

    await polymarketTradingService.getUserPositions('user-1');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['POLY-ADDRESS']).toBe(CREDS.address);
    expect((init.headers as Record<string, string>)['POLY-SIGNATURE']).toBe(CREDS.apiSecret);
  });

  it('throws when response is not ok', async () => {
    setupCredentials();
    mockFetch(null, false, 403);

    await expect(polymarketTradingService.getUserPositions('user-1')).rejects.toThrow(
      'Failed to get positions: 403'
    );
  });

  it('propagates credential load failure', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: null, error: { message: 'unauthorized' } })
    );

    await expect(polymarketTradingService.getUserPositions('user-1')).rejects.toThrow(
      'No Polymarket credentials found'
    );
  });
});
