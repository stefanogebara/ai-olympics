/**
 * Tests for kalshi-trading.ts
 *
 * Covers: loadCredentials, placeOrder, getOrderStatus, getUserPositions, cancelOrder.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFrom, mockSign, mockUpdate, mockCreateSign } = vi.hoisted(() => {
  const mockSign = vi.fn().mockReturnValue('mock-sig-base64');
  const mockUpdate = vi.fn().mockReturnThis();
  const mockEnd = vi.fn().mockReturnThis();
  const mockCreateSign = vi.fn().mockReturnValue({
    update: mockUpdate,
    end: mockEnd,
    sign: mockSign,
  });
  return { mockFrom: vi.fn(), mockSign, mockUpdate, mockCreateSign };
});

vi.mock('crypto', () => ({
  default: {
    createSign: mockCreateSign,
    constants: {
      RSA_PKCS1_PSS_PADDING: 6,
      RSA_PSS_SALTLEN_DIGEST: -1,
    },
  },
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

import { kalshiTradingService } from './kalshi-trading.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'insert', 'update', 'order']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

const CREDS = { apiKeyId: 'key-abc', privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----' };

function setupCredentials(overrides: Record<string, unknown> = {}) {
  mockFrom.mockReturnValueOnce(
    chain({ data: { encrypted_credentials: { ...CREDS, ...overrides } }, error: null })
  );
}

function mockFetch(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(String(body)),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function makeOrderResponse(overrides: Record<string, unknown> = {}) {
  return {
    order: {
      order_id: 'ord-1',
      ticker: 'TICKER',
      status: 'resting',
      side: 'yes',
      type: 'limit',
      count: 5,
      yes_price: 60,
      created_time: '2024-01-01T00:00:00Z',
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  mockSign.mockReturnValue('mock-sig-base64');
  mockUpdate.mockReturnThis();
  mockCreateSign.mockReturnValue({
    update: mockUpdate,
    end: vi.fn().mockReturnThis(),
    sign: mockSign,
  });
});

// ---------------------------------------------------------------------------
// loadCredentials
// ---------------------------------------------------------------------------

describe('loadCredentials', () => {
  it('returns credentials when DB record is valid', async () => {
    setupCredentials();
    const result = await kalshiTradingService.loadCredentials('user-1');
    expect(result).toEqual(CREDS);
    const q = mockFrom.mock.results[0].value;
    expect(mockFrom).toHaveBeenCalledWith('aio_exchange_credentials');
    expect(q.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(q.eq).toHaveBeenCalledWith('exchange', 'kalshi');
  });

  it('throws when DB returns an error', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: null, error: { message: 'not found' } })
    );
    await expect(kalshiTradingService.loadCredentials('user-1')).rejects.toThrow(
      'No Kalshi credentials found for user: not found'
    );
  });

  it('throws when apiKeyId is missing', async () => {
    setupCredentials({ apiKeyId: '' });
    await expect(kalshiTradingService.loadCredentials('user-1')).rejects.toThrow(
      'Invalid Kalshi credentials: missing apiKeyId or privateKeyPem'
    );
  });

  it('throws when privateKeyPem is missing', async () => {
    setupCredentials({ privateKeyPem: '' });
    await expect(kalshiTradingService.loadCredentials('user-1')).rejects.toThrow(
      'Invalid Kalshi credentials: missing apiKeyId or privateKeyPem'
    );
  });
});

// ---------------------------------------------------------------------------
// placeOrder
// ---------------------------------------------------------------------------

describe('placeOrder', () => {
  it('sends yes_price in body for yes side', async () => {
    setupCredentials();
    const fetchMock = mockFetch(makeOrderResponse());

    await kalshiTradingService.placeOrder('user-1', 'TICKER', 'yes', 5, 60);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.yes_price).toBe(60);
    expect(body.no_price).toBeUndefined();
    expect(body.side).toBe('yes');
    expect(body.count).toBe(5);
    expect(body.type).toBe('limit');
    expect(body.ticker).toBe('TICKER');
  });

  it('sends no_price in body for no side', async () => {
    setupCredentials();
    const fetchMock = mockFetch(makeOrderResponse({ side: 'no', no_price: 40 }));

    await kalshiTradingService.placeOrder('user-1', 'TICKER', 'no', 3, 40);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.no_price).toBe(40);
    expect(body.yes_price).toBeUndefined();
  });

  it('sends correct auth headers', async () => {
    setupCredentials();
    const fetchMock = mockFetch(makeOrderResponse());

    await kalshiTradingService.placeOrder('user-1', 'TICKER', 'yes', 1, 50);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['KALSHI-ACCESS-KEY']).toBe(CREDS.apiKeyId);
    expect(headers['KALSHI-ACCESS-SIGNATURE']).toBe('mock-sig-base64');
    expect(headers['KALSHI-ACCESS-TIMESTAMP']).toMatch(/^\d+$/);
  });

  it('signs with the path for POST orders', async () => {
    setupCredentials();
    mockFetch(makeOrderResponse());

    await kalshiTradingService.placeOrder('user-1', 'TICKER', 'yes', 1, 50);

    expect(mockCreateSign).toHaveBeenCalledWith('RSA-SHA256');
    const updateArg: string = mockUpdate.mock.calls[0][0] as string;
    expect(updateArg).toContain('POST');
    expect(updateArg).toContain('/trade-api/v2/portfolio/orders');
  });

  it('returns the order response', async () => {
    setupCredentials();
    const orderResp = makeOrderResponse();
    mockFetch(orderResp);

    const result = await kalshiTradingService.placeOrder('user-1', 'TICKER', 'yes', 5, 60);

    expect(result).toEqual(orderResp);
  });

  it('throws when response is not ok', async () => {
    setupCredentials();
    mockFetch('insufficient funds', false, 422);

    await expect(
      kalshiTradingService.placeOrder('user-1', 'TICKER', 'yes', 5, 60)
    ).rejects.toThrow('Kalshi order failed: 422 - insufficient funds');
  });
});

// ---------------------------------------------------------------------------
// getOrderStatus
// ---------------------------------------------------------------------------

describe('getOrderStatus', () => {
  it('fetches from correct URL and returns order', async () => {
    setupCredentials();
    const orderResp = makeOrderResponse({ order_id: 'ord-99' });
    const fetchMock = mockFetch(orderResp);

    const result = await kalshiTradingService.getOrderStatus('user-1', 'ord-99');

    expect(result).toEqual(orderResp);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/portfolio/orders/ord-99');
    // GET uses no method override — should use default
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['KALSHI-ACCESS-KEY']).toBe(CREDS.apiKeyId);
  });

  it('throws when response is not ok', async () => {
    setupCredentials();
    mockFetch(null, false, 404);

    await expect(
      kalshiTradingService.getOrderStatus('user-1', 'ord-missing')
    ).rejects.toThrow('Failed to get order status: 404');
  });
});

// ---------------------------------------------------------------------------
// getUserPositions
// ---------------------------------------------------------------------------

describe('getUserPositions', () => {
  const positions = [
    { ticker: 'TICK-1', market_exposure: 100, resting_orders_count: 0, total_traded: 200, realized_pnl: 10 },
  ];

  it('returns market_positions from response', async () => {
    setupCredentials();
    mockFetch({ market_positions: positions });

    const result = await kalshiTradingService.getUserPositions('user-1');

    expect(result).toEqual(positions);
  });

  it('returns empty array when market_positions is absent', async () => {
    setupCredentials();
    mockFetch({});

    const result = await kalshiTradingService.getUserPositions('user-1');

    expect(result).toEqual([]);
  });

  it('throws when response is not ok', async () => {
    setupCredentials();
    mockFetch(null, false, 401);

    await expect(kalshiTradingService.getUserPositions('user-1')).rejects.toThrow(
      'Failed to get positions: 401'
    );
  });
});

// ---------------------------------------------------------------------------
// cancelOrder
// ---------------------------------------------------------------------------

describe('cancelOrder', () => {
  it('sends DELETE to the correct URL with auth headers', async () => {
    setupCredentials();
    const fetchMock = mockFetch(null, true, 204);

    await kalshiTradingService.cancelOrder('user-1', 'ord-42');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/portfolio/orders/ord-42');
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['KALSHI-ACCESS-KEY']).toBe(CREDS.apiKeyId);
  });

  it('throws when response is not ok', async () => {
    setupCredentials();
    mockFetch(null, false, 403);

    await expect(
      kalshiTradingService.cancelOrder('user-1', 'ord-42')
    ).rejects.toThrow('Failed to cancel order: 403');
  });
});
