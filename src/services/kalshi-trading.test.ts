import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Chainable Supabase query mock helper
// ============================================================================

function chainable(data: unknown = null, error: unknown = null) {
  const chain: Record<string, any> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'eq', 'neq',
    'gt', 'gte', 'order', 'limit', 'range', 'single', 'maybeSingle',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: Function) => resolve({ data, error });
  return chain;
}

// ============================================================================
// Mock external dependencies before importing
// ============================================================================

const mockFrom = vi.fn();

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import AFTER mocks are registered
const { kalshiTradingService } = await import('./kalshi-trading.js');

// ============================================================================
// Stub the private signRequest method on the prototype so we don't need real
// RSA keys or a working crypto.createSign mock.
// Access via Object.getPrototypeOf to reach the class prototype.
// ============================================================================

const serviceProto = Object.getPrototypeOf(kalshiTradingService);
const originalSignRequest = serviceProto.signRequest;

// ============================================================================
// Test data factories
// ============================================================================

const MOCK_USER_ID = 'user-kalshi-123';

function makeCredentials(overrides: Record<string, string> = {}) {
  return {
    apiKeyId: 'kalshi-api-key-id',
    privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----',
    ...overrides,
  };
}

function makeFetchResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function makeOrderResponse(overrides: Record<string, unknown> = {}) {
  return {
    order: {
      order_id: 'kalshi-order-1',
      ticker: 'TICKER-ABC',
      status: 'resting',
      side: 'yes',
      type: 'limit',
      count: 10,
      yes_price: 65,
      created_time: '2026-01-15T10:00:00Z',
      ...overrides,
    },
  };
}

// ============================================================================
// loadCredentials()
// ============================================================================

describe('KalshiTradingService.loadCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns credentials when found in database', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    const result = await kalshiTradingService.loadCredentials(MOCK_USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('aio_exchange_credentials');
    expect(chain.select).toHaveBeenCalledWith('encrypted_credentials');
    expect(chain.eq).toHaveBeenCalledWith('user_id', MOCK_USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('exchange', 'kalshi');
    expect(chain.single).toHaveBeenCalled();
    expect(result).toEqual(creds);
  });

  it('throws when no credentials exist for user', async () => {
    const chain = chainable(null, { message: 'Row not found' });
    mockFrom.mockReturnValue(chain);

    await expect(
      kalshiTradingService.loadCredentials(MOCK_USER_ID)
    ).rejects.toThrow('No Kalshi credentials found for user: Row not found');
  });

  it('throws when apiKeyId is missing', async () => {
    const badCreds = { apiKeyId: '', privateKeyPem: 'some-key' };
    const chain = chainable({ encrypted_credentials: badCreds });
    mockFrom.mockReturnValue(chain);

    await expect(
      kalshiTradingService.loadCredentials(MOCK_USER_ID)
    ).rejects.toThrow('Invalid Kalshi credentials: missing apiKeyId or privateKeyPem');
  });

  it('throws when privateKeyPem is missing', async () => {
    const badCreds = { apiKeyId: 'some-id', privateKeyPem: '' };
    const chain = chainable({ encrypted_credentials: badCreds });
    mockFrom.mockReturnValue(chain);

    await expect(
      kalshiTradingService.loadCredentials(MOCK_USER_ID)
    ).rejects.toThrow('Invalid Kalshi credentials: missing apiKeyId or privateKeyPem');
  });

  it('throws when database returns an error', async () => {
    const chain = chainable(null, { message: 'connection timeout' });
    mockFrom.mockReturnValue(chain);

    await expect(
      kalshiTradingService.loadCredentials('user-db-error')
    ).rejects.toThrow('No Kalshi credentials found for user: connection timeout');
  });
});

// ============================================================================
// placeOrder()
// ============================================================================

describe('KalshiTradingService.placeOrder', () => {
  const ticker = 'KXBTC-26FEB14-T99999';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // Stub the private signRequest so crypto is never called
    serviceProto.signRequest = vi.fn().mockReturnValue('mock-signature-base64');
  });

  afterEach(() => {
    serviceProto.signRequest = originalSignRequest;
  });

  it('places a YES limit order and returns order response', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    const orderResp = makeOrderResponse();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(orderResp) as any);

    const result = await kalshiTradingService.placeOrder(
      MOCK_USER_ID, ticker, 'yes', 10, 65
    );

    expect(result.order.order_id).toBe('kalshi-order-1');
    expect(result.order.side).toBe('yes');
    expect(result.order.ticker).toBe('TICKER-ABC');
  });

  it('sends yes_price for YES side orders', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(makeOrderResponse()) as any
    );

    await kalshiTradingService.placeOrder(MOCK_USER_ID, ticker, 'yes', 5, 70);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.yes_price).toBe(70);
    expect(body.no_price).toBeUndefined();
    expect(body.type).toBe('limit');
    expect(body.count).toBe(5);
  });

  it('sends no_price for NO side orders', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(makeOrderResponse({ side: 'no', no_price: 30 })) as any
    );

    await kalshiTradingService.placeOrder(MOCK_USER_ID, ticker, 'no', 3, 30);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.no_price).toBe(30);
    expect(body.yes_price).toBeUndefined();
  });

  it('sends correct auth headers', async () => {
    const creds = makeCredentials({ apiKeyId: 'my-key-id' });
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(makeOrderResponse()) as any
    );

    await kalshiTradingService.placeOrder(MOCK_USER_ID, ticker, 'yes', 1, 50);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;
    expect(headers['KALSHI-ACCESS-KEY']).toBe('my-key-id');
    expect(headers['KALSHI-ACCESS-SIGNATURE']).toBe('mock-signature-base64');
    expect(headers['KALSHI-ACCESS-TIMESTAMP']).toBeDefined();
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');
  });

  it('uses correct Kalshi API URL for orders', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(makeOrderResponse()) as any
    );

    await kalshiTradingService.placeOrder(MOCK_USER_ID, ticker, 'yes', 1, 50);

    const fetchUrl = vi.mocked(globalThis.fetch).mock.calls[0][0];
    expect(fetchUrl).toBe(
      'https://api.elections.kalshi.com/trade-api/v2/portfolio/orders'
    );
  });

  it('throws when API returns non-ok response', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse('Insufficient funds', false, 400) as any
    );

    await expect(
      kalshiTradingService.placeOrder(MOCK_USER_ID, ticker, 'yes', 10, 65)
    ).rejects.toThrow('Kalshi order failed: 400');
  });

  it('throws when fetch itself rejects', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('DNS resolution failed'));

    await expect(
      kalshiTradingService.placeOrder(MOCK_USER_ID, ticker, 'yes', 1, 50)
    ).rejects.toThrow('DNS resolution failed');
  });

  it('throws when credentials cannot be loaded', async () => {
    const chain = chainable(null, { message: 'not found' });
    mockFrom.mockReturnValue(chain);

    await expect(
      kalshiTradingService.placeOrder(MOCK_USER_ID, ticker, 'yes', 1, 50)
    ).rejects.toThrow('No Kalshi credentials found for user: not found');
  });

  it('includes ticker in the order body', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(makeOrderResponse()) as any
    );

    await kalshiTradingService.placeOrder(MOCK_USER_ID, 'MY-TICKER', 'yes', 1, 50);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.ticker).toBe('MY-TICKER');
    expect(body.side).toBe('yes');
  });
});

// ============================================================================
// getOrderStatus()
// ============================================================================

describe('KalshiTradingService.getOrderStatus', () => {
  const orderId = 'kalshi-order-status-1';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    serviceProto.signRequest = vi.fn().mockReturnValue('mock-signature-base64');
  });

  afterEach(() => {
    serviceProto.signRequest = originalSignRequest;
  });

  it('returns order status from API', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    const orderResp = makeOrderResponse({ status: 'filled' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(orderResp) as any);

    const result = await kalshiTradingService.getOrderStatus(MOCK_USER_ID, orderId);

    expect(result.order.status).toBe('filled');
  });

  it('calls the correct API endpoint with orderId', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(makeOrderResponse()) as any
    );

    await kalshiTradingService.getOrderStatus(MOCK_USER_ID, 'specific-order-id');

    const fetchUrl = vi.mocked(globalThis.fetch).mock.calls[0][0];
    expect(fetchUrl).toBe(
      'https://api.elections.kalshi.com/trade-api/v2/portfolio/orders/specific-order-id'
    );
  });

  it('throws when API returns non-ok response', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse('Not found', false, 404) as any
    );

    await expect(
      kalshiTradingService.getOrderStatus(MOCK_USER_ID, 'nonexistent')
    ).rejects.toThrow('Failed to get order status: 404');
  });

  it('throws when fetch rejects', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection reset'));

    await expect(
      kalshiTradingService.getOrderStatus(MOCK_USER_ID, orderId)
    ).rejects.toThrow('Connection reset');
  });

  it('loads credentials for the given userId', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(makeOrderResponse()) as any
    );

    await kalshiTradingService.getOrderStatus('user-xyz', orderId);

    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-xyz');
  });
});

// ============================================================================
// getUserPositions()
// ============================================================================

describe('KalshiTradingService.getUserPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    serviceProto.signRequest = vi.fn().mockReturnValue('mock-signature-base64');
  });

  afterEach(() => {
    serviceProto.signRequest = originalSignRequest;
  });

  it('returns positions for a user', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    const positions = [
      { ticker: 'T1', market_exposure: 100, resting_orders_count: 2, total_traded: 50, realized_pnl: 10 },
      { ticker: 'T2', market_exposure: 200, resting_orders_count: 0, total_traded: 100, realized_pnl: -5 },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ market_positions: positions }) as any
    );

    const result = await kalshiTradingService.getUserPositions(MOCK_USER_ID);

    expect(result).toEqual(positions);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no market_positions field', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({}) as any
    );

    const result = await kalshiTradingService.getUserPositions(MOCK_USER_ID);

    expect(result).toEqual([]);
  });

  it('uses correct API endpoint', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ market_positions: [] }) as any
    );

    await kalshiTradingService.getUserPositions(MOCK_USER_ID);

    const fetchUrl = vi.mocked(globalThis.fetch).mock.calls[0][0];
    expect(fetchUrl).toBe(
      'https://api.elections.kalshi.com/trade-api/v2/portfolio/positions'
    );
  });

  it('throws when API returns non-ok response', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse('Server error', false, 500) as any
    );

    await expect(
      kalshiTradingService.getUserPositions(MOCK_USER_ID)
    ).rejects.toThrow('Failed to get positions: 500');
  });

  it('throws when credentials cannot be loaded', async () => {
    const chain = chainable(null, { message: 'missing creds' });
    mockFrom.mockReturnValue(chain);

    await expect(
      kalshiTradingService.getUserPositions(MOCK_USER_ID)
    ).rejects.toThrow('No Kalshi credentials found for user: missing creds');
  });

  it('sends auth headers from credentials', async () => {
    const creds = makeCredentials({ apiKeyId: 'pos-key-id' });
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ market_positions: [] }) as any
    );

    await kalshiTradingService.getUserPositions(MOCK_USER_ID);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;
    expect(headers['KALSHI-ACCESS-KEY']).toBe('pos-key-id');
    expect(headers['KALSHI-ACCESS-SIGNATURE']).toBe('mock-signature-base64');
  });
});

// ============================================================================
// cancelOrder()
// ============================================================================

describe('KalshiTradingService.cancelOrder', () => {
  const orderId = 'kalshi-cancel-order-1';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    serviceProto.signRequest = vi.fn().mockReturnValue('mock-signature-base64');
  });

  afterEach(() => {
    serviceProto.signRequest = originalSignRequest;
  });

  it('cancels an order successfully', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(null, true, 204) as any
    );

    await expect(
      kalshiTradingService.cancelOrder(MOCK_USER_ID, orderId)
    ).resolves.toBeUndefined();
  });

  it('calls DELETE on the correct endpoint', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(null, true, 204) as any
    );

    await kalshiTradingService.cancelOrder(MOCK_USER_ID, 'specific-cancel-id');

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(fetchCall[0]).toBe(
      'https://api.elections.kalshi.com/trade-api/v2/portfolio/orders/specific-cancel-id'
    );
    expect(fetchCall[1]?.method).toBe('DELETE');
  });

  it('throws when API returns non-ok response', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse('Order already filled', false, 409) as any
    );

    await expect(
      kalshiTradingService.cancelOrder(MOCK_USER_ID, orderId)
    ).rejects.toThrow('Failed to cancel order: 409');
  });

  it('throws when fetch rejects', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));

    await expect(
      kalshiTradingService.cancelOrder(MOCK_USER_ID, orderId)
    ).rejects.toThrow('Network failure');
  });

  it('throws when credentials cannot be loaded', async () => {
    const chain = chainable(null, { message: 'auth error' });
    mockFrom.mockReturnValue(chain);

    await expect(
      kalshiTradingService.cancelOrder(MOCK_USER_ID, orderId)
    ).rejects.toThrow('No Kalshi credentials found for user: auth error');
  });

  it('sends auth headers with DELETE request', async () => {
    const creds = makeCredentials({ apiKeyId: 'del-key' });
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(null, true, 204) as any
    );

    await kalshiTradingService.cancelOrder(MOCK_USER_ID, orderId);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;
    expect(headers['KALSHI-ACCESS-KEY']).toBe('del-key');
    expect(headers['KALSHI-ACCESS-SIGNATURE']).toBe('mock-signature-base64');
  });
});
