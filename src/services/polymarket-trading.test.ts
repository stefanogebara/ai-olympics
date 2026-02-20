import { describe, it, expect, vi, beforeEach } from 'vitest';

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
const { polymarketTradingService } = await import('./polymarket-trading.js');

// ============================================================================
// Test data factories
// ============================================================================

const MOCK_USER_ID = 'user-poly-123';

function makeCredentials(overrides: Record<string, string> = {}) {
  return {
    address: '0xAbCdEf1234567890',
    apiSecret: 'poly-secret-key-xyz',
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

// ============================================================================
// loadCredentials()
// ============================================================================

describe('PolymarketTradingService.loadCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('returns credentials when found in database', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    const result = await polymarketTradingService.loadCredentials(MOCK_USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('aio_exchange_credentials');
    expect(chain.select).toHaveBeenCalledWith('encrypted_credentials');
    expect(chain.eq).toHaveBeenCalledWith('user_id', MOCK_USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('exchange', 'polymarket');
    expect(chain.single).toHaveBeenCalled();
    expect(result).toEqual(creds);
  });

  it('throws when no credentials exist for user', async () => {
    const chain = chainable(null, { message: 'Row not found' });
    mockFrom.mockReturnValue(chain);

    await expect(
      polymarketTradingService.loadCredentials(MOCK_USER_ID)
    ).rejects.toThrow('No Polymarket credentials found for user: Row not found');
  });

  it('throws when database returns an error', async () => {
    const chain = chainable(null, { message: 'connection refused' });
    mockFrom.mockReturnValue(chain);

    await expect(
      polymarketTradingService.loadCredentials('user-db-error')
    ).rejects.toThrow('No Polymarket credentials found for user: connection refused');
  });

  it('propagates unexpected errors', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected supabase crash');
    });

    await expect(
      polymarketTradingService.loadCredentials(MOCK_USER_ID)
    ).rejects.toThrow('Unexpected supabase crash');
  });
});

// ============================================================================
// placeMarketOrder()
// ============================================================================

describe('PolymarketTradingService.placeMarketOrder', () => {
  const conditionId = 'cond-abc-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('places a YES order and returns order result', async () => {
    // Mock loadCredentials via DB
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    // Mock global fetch
    const responseBody = {
      orderID: 'poly-order-1',
      status: 'filled',
      fills: [{ price: '0.65', size: '100' }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(responseBody) as any);

    const result = await polymarketTradingService.placeMarketOrder(
      MOCK_USER_ID, conditionId, 'YES', 100
    );

    expect(result.orderId).toBe('poly-order-1');
    expect(result.status).toBe('filled');
    expect(result.fills).toEqual([{ price: '0.65', size: '100' }]);
  });

  it('maps YES outcome to BUY side', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ orderID: 'o-1', status: 'submitted', fills: [] }) as any
    );

    await polymarketTradingService.placeMarketOrder(MOCK_USER_ID, conditionId, 'YES', 50);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.side).toBe('BUY');
    expect(body.type).toBe('market');
    expect(body.market).toBe(conditionId);
  });

  it('maps non-YES outcome to SELL side', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ orderID: 'o-2', status: 'submitted', fills: [] }) as any
    );

    await polymarketTradingService.placeMarketOrder(MOCK_USER_ID, conditionId, 'NO', 25);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.side).toBe('SELL');
  });

  it('sends correct auth headers from credentials', async () => {
    const creds = makeCredentials({ address: '0xMyAddr', apiSecret: 'mySecret' });
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ id: 'o-3', status: 'submitted', fills: [] }) as any
    );

    await polymarketTradingService.placeMarketOrder(MOCK_USER_ID, conditionId, 'YES', 10);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;
    expect(headers['POLY-ADDRESS']).toBe('0xMyAddr');
    expect(headers['POLY-SIGNATURE']).toBe('mySecret');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['POLY-TIMESTAMP']).toBeDefined();
    expect(headers['POLY-NONCE']).toBe('0');
  });

  it('uses correct CLOB API URL', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ orderID: 'o-url', status: 'ok', fills: [] }) as any
    );

    await polymarketTradingService.placeMarketOrder(MOCK_USER_ID, conditionId, 'YES', 10);

    const fetchUrl = vi.mocked(globalThis.fetch).mock.calls[0][0];
    expect(fetchUrl).toBe('https://clob.polymarket.com/order');
  });

  it('throws when API returns non-ok response', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse('Insufficient balance', false, 400) as any
    );

    await expect(
      polymarketTradingService.placeMarketOrder(MOCK_USER_ID, conditionId, 'YES', 10000)
    ).rejects.toThrow('Polymarket order failed: 400');
  });

  it('throws when fetch itself rejects', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await expect(
      polymarketTradingService.placeMarketOrder(MOCK_USER_ID, conditionId, 'YES', 50)
    ).rejects.toThrow('Network error');
  });

  it('throws when credentials cannot be loaded', async () => {
    const chain = chainable(null, { message: 'no creds' });
    mockFrom.mockReturnValue(chain);

    await expect(
      polymarketTradingService.placeMarketOrder(MOCK_USER_ID, conditionId, 'YES', 50)
    ).rejects.toThrow('No Polymarket credentials found for user: no creds');
  });

  it('falls back to result.id when orderID is missing', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ id: 'fallback-id', status: 'submitted' }) as any
    );

    const result = await polymarketTradingService.placeMarketOrder(
      MOCK_USER_ID, conditionId, 'YES', 10
    );

    expect(result.orderId).toBe('fallback-id');
  });

  it('returns empty string orderId when neither orderID nor id exist', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ status: 'submitted' }) as any
    );

    const result = await polymarketTradingService.placeMarketOrder(
      MOCK_USER_ID, conditionId, 'YES', 10
    );

    expect(result.orderId).toBe('');
  });

  it('defaults status to "submitted" when API response has no status', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ orderID: 'o-no-status' }) as any
    );

    const result = await polymarketTradingService.placeMarketOrder(
      MOCK_USER_ID, conditionId, 'YES', 10
    );

    expect(result.status).toBe('submitted');
  });

  it('defaults fills to empty array when API response has no fills', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ orderID: 'o-no-fills', status: 'filled' }) as any
    );

    const result = await polymarketTradingService.placeMarketOrder(
      MOCK_USER_ID, conditionId, 'YES', 10
    );

    expect(result.fills).toEqual([]);
  });

  it('handles case-insensitive YES outcome', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ orderID: 'o-case', status: 'ok', fills: [] }) as any
    );

    await polymarketTradingService.placeMarketOrder(MOCK_USER_ID, conditionId, 'yes', 10);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.side).toBe('BUY');
  });
});

// ============================================================================
// getOrderStatus()
// ============================================================================

describe('PolymarketTradingService.getOrderStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('returns order status from API', async () => {
    const orderData = {
      id: 'order-123',
      status: 'filled',
      side: 'BUY',
      size: '100',
      price: '0.65',
      filled: '100',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(orderData) as any);

    const result = await polymarketTradingService.getOrderStatus('order-123');

    expect(result).toEqual(orderData);
    expect(globalThis.fetch).toHaveBeenCalledWith('https://clob.polymarket.com/order/order-123');
  });

  it('throws when API returns non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse('Not found', false, 404) as any
    );

    await expect(
      polymarketTradingService.getOrderStatus('nonexistent')
    ).rejects.toThrow('Failed to get order status: 404');
  });

  it('throws when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Timeout'));

    await expect(
      polymarketTradingService.getOrderStatus('order-timeout')
    ).rejects.toThrow('Timeout');
  });
});

// ============================================================================
// getUserPositions()
// ============================================================================

describe('PolymarketTradingService.getUserPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('returns positions for a user', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    const positions = [
      { market: 'cond-1', size: '100', side: 'YES' },
      { market: 'cond-2', size: '50', side: 'NO' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(positions) as any);

    const result = await polymarketTradingService.getUserPositions(MOCK_USER_ID);

    expect(result).toEqual(positions);
    expect(result).toHaveLength(2);
  });

  it('sends auth headers from credentials', async () => {
    const creds = makeCredentials({ address: '0xPosAddr', apiSecret: 'posSecret' });
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse([]) as any);

    await polymarketTradingService.getUserPositions(MOCK_USER_ID);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;
    expect(headers['POLY-ADDRESS']).toBe('0xPosAddr');
    expect(headers['POLY-SIGNATURE']).toBe('posSecret');
  });

  it('includes conditionId as market query param when provided', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse([]) as any);

    await polymarketTradingService.getUserPositions(MOCK_USER_ID, 'cond-xyz');

    const fetchUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(fetchUrl).toContain('market=cond-xyz');
  });

  it('omits market param when conditionId is not provided', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse([]) as any);

    await polymarketTradingService.getUserPositions(MOCK_USER_ID);

    const fetchUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(fetchUrl).not.toContain('market=');
  });

  it('throws when API returns non-ok response', async () => {
    const creds = makeCredentials();
    const chain = chainable({ encrypted_credentials: creds });
    mockFrom.mockReturnValue(chain);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse('Forbidden', false, 403) as any
    );

    await expect(
      polymarketTradingService.getUserPositions(MOCK_USER_ID)
    ).rejects.toThrow('Failed to get positions: 403');
  });

  it('throws when credentials cannot be loaded', async () => {
    const chain = chainable(null, { message: 'no creds' });
    mockFrom.mockReturnValue(chain);

    await expect(
      polymarketTradingService.getUserPositions(MOCK_USER_ID)
    ).rejects.toThrow('No Polymarket credentials found for user: no creds');
  });
});
