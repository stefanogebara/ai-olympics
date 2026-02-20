import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: mock req / res / next
// ---------------------------------------------------------------------------

function createMockReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    headers: {},
    query: {},
    params: {},
    body: {},
    user: { id: 'test-user-id' },
    userClient: createMockUserClient(),
    ...overrides,
  };
}

function createMockUserClient() {
  const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
  return {
    from: vi.fn(() => ({
      upsert: upsertFn,
    })),
    _upsertFn: upsertFn, // expose for assertions
  };
}

function createMockRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res as {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

function createMockNext() {
  return vi.fn();
}

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockWalletService = {
  getBalance: vi.fn(),
  getOrCreateWallet: vi.fn(),
  getTransactionHistory: vi.fn(),
};

const mockStripeService = {
  createCheckoutSession: vi.fn(),
  handleWebhook: vi.fn(),
};

const mockCryptoWalletService = {
  getDepositAddress: vi.fn(),
  executeWithdrawal: vi.fn(),
  linkWallet: vi.fn(),
  getLinkedWallets: vi.fn(),
};

const mockEncrypt = vi.fn((data: string) => `encrypted:${data}`);

// ---------------------------------------------------------------------------
// vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

vi.mock('../../services/wallet-service.js', () => ({
  walletService: mockWalletService,
}));

vi.mock('../../services/stripe-service.js', () => ({
  stripeService: mockStripeService,
}));

vi.mock('../../services/crypto-wallet-service.js', () => ({
  cryptoWalletService: mockCryptoWalletService,
}));

vi.mock('../../shared/utils/crypto.js', () => ({
  encrypt: mockEncrypt,
}));

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  AuthenticatedRequest: {},
}));

vi.mock('../middleware/validate.js', () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../schemas.js', () => ({
  stripeDepositSchema: {},
  cryptoWithdrawSchema: {},
  cryptoWalletSchema: {},
  exchangeCredentialsSchema: {},
}));

// ---------------------------------------------------------------------------
// Extract route handlers from Express Router
// ---------------------------------------------------------------------------

type RouterStack = {
  stack: Array<{
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: Array<{ handle: (...args: unknown[]) => unknown }>;
    };
  }>;
};

function getRouteHandler(router: RouterStack, method: string, path: string) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routePath === path && routeMethod === method) {
        const handlers = layer.route.stack.map((s) => s.handle);
        return handlers[handlers.length - 1];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

function getRouteMiddleware(router: RouterStack, method: string, path: string, index: number) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routePath === path && routeMethod === method) {
        const handlers = layer.route.stack.map((s) => s.handle);
        return handlers[index];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

function getRouteHandlerCount(router: RouterStack, method: string, path: string): number {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routePath === path && routeMethod === method) {
        return layer.route.stack.length;
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

// ============================================================================
// PAYMENTS ROUTES TESTS
// ============================================================================

describe('Payments Routes', () => {
  let router: RouterStack;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./payments.js');
    router = mod.default as unknown as RouterStack;
  });

  // ---------- Route registration verification ----------

  describe('Route registration', () => {
    it('registers GET /wallet', () => {
      expect(() => getRouteHandler(router, 'get', '/wallet')).not.toThrow();
    });

    it('registers POST /wallet', () => {
      expect(() => getRouteHandler(router, 'post', '/wallet')).not.toThrow();
    });

    it('registers POST /deposit/stripe', () => {
      expect(() => getRouteHandler(router, 'post', '/deposit/stripe')).not.toThrow();
    });

    it('registers POST /deposit/crypto', () => {
      expect(() => getRouteHandler(router, 'post', '/deposit/crypto')).not.toThrow();
    });

    it('registers POST /withdraw/stripe', () => {
      expect(() => getRouteHandler(router, 'post', '/withdraw/stripe')).not.toThrow();
    });

    it('registers POST /withdraw/crypto', () => {
      expect(() => getRouteHandler(router, 'post', '/withdraw/crypto')).not.toThrow();
    });

    it('registers GET /transactions', () => {
      expect(() => getRouteHandler(router, 'get', '/transactions')).not.toThrow();
    });

    it('registers POST /webhook/stripe', () => {
      expect(() => getRouteHandler(router, 'post', '/webhook/stripe')).not.toThrow();
    });

    it('registers POST /crypto-wallets', () => {
      expect(() => getRouteHandler(router, 'post', '/crypto-wallets')).not.toThrow();
    });

    it('registers GET /crypto-wallets', () => {
      expect(() => getRouteHandler(router, 'get', '/crypto-wallets')).not.toThrow();
    });

    it('registers POST /exchange-credentials', () => {
      expect(() => getRouteHandler(router, 'post', '/exchange-credentials')).not.toThrow();
    });
  });

  // ---------- requireRealMoneyEnabled middleware ----------

  describe('requireRealMoneyEnabled middleware', () => {
    it('returns 503 on POST /deposit/stripe when real money is disabled', () => {
      const middleware = getRouteMiddleware(router, 'post', '/deposit/stripe', 0) as (
        ...args: unknown[]
      ) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Real-money features are currently disabled',
        message: 'Deposits and withdrawals are disabled during the beta period.',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 503 on POST /deposit/crypto when real money is disabled', () => {
      const middleware = getRouteMiddleware(router, 'post', '/deposit/crypto', 0) as (
        ...args: unknown[]
      ) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 503 on POST /withdraw/stripe when real money is disabled', () => {
      const middleware = getRouteMiddleware(router, 'post', '/withdraw/stripe', 0) as (
        ...args: unknown[]
      ) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 503 on POST /withdraw/crypto when real money is disabled', () => {
      const middleware = getRouteMiddleware(router, 'post', '/withdraw/crypto', 0) as (
        ...args: unknown[]
      ) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });

    it('includes descriptive error and message fields in 503 response', () => {
      const middleware = getRouteMiddleware(router, 'post', '/deposit/stripe', 0) as (
        ...args: unknown[]
      ) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('beta');
    });

    it('does not apply requireRealMoneyEnabled to GET /wallet', () => {
      // GET /wallet should NOT have requireRealMoneyEnabled as first middleware
      const handlerCount = getRouteHandlerCount(router, 'get', '/wallet');
      // GET /wallet has [authMiddleware, handler] = 2 handlers
      // deposit/stripe has [requireRealMoney, auth, validate, handler] = 4+
      expect(handlerCount).toBeLessThan(4);
    });

    it('does not apply requireRealMoneyEnabled to POST /webhook/stripe', () => {
      const handlerCount = getRouteHandlerCount(router, 'post', '/webhook/stripe');
      // webhook has no requireRealMoneyEnabled, no auth -> just [handler] = 1
      expect(handlerCount).toBe(1);
    });
  });

  // ---------- GET /wallet ----------

  describe('GET /wallet', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/wallet') as (...args: unknown[]) => Promise<void>;
    });

    it('returns wallet balance on success', async () => {
      const walletData = { id: 'w1', balance_cents: 5000, currency: 'USD' };
      mockWalletService.getBalance.mockResolvedValue(walletData);

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getBalance).toHaveBeenCalledWith('test-user-id', req.userClient);
      expect(res.json).toHaveBeenCalledWith({ wallet: walletData });
    });

    it('returns 500 when walletService.getBalance throws', async () => {
      mockWalletService.getBalance.mockRejectedValue(new Error('DB error'));

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch wallet' });
    });

    it('uses user.id from request', async () => {
      mockWalletService.getBalance.mockResolvedValue({ balance: 0 });

      const req = createMockReq({ user: { id: 'custom-user-42' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getBalance).toHaveBeenCalledWith('custom-user-42', req.userClient);
    });

    it('passes userClient to service for RLS', async () => {
      mockWalletService.getBalance.mockResolvedValue({ balance: 100 });

      const userClient = createMockUserClient();
      const req = createMockReq({ userClient });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getBalance).toHaveBeenCalledWith('test-user-id', userClient);
    });
  });

  // ---------- POST /wallet ----------

  describe('POST /wallet', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/wallet') as (...args: unknown[]) => Promise<void>;
    });

    it('creates and returns wallet on success', async () => {
      const walletData = { id: 'w-new', balance_cents: 0, currency: 'USD' };
      mockWalletService.getOrCreateWallet.mockResolvedValue(walletData);

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getOrCreateWallet).toHaveBeenCalledWith('test-user-id', req.userClient);
      expect(res.json).toHaveBeenCalledWith({ wallet: walletData });
    });

    it('returns 500 when walletService.getOrCreateWallet throws', async () => {
      mockWalletService.getOrCreateWallet.mockRejectedValue(new Error('Creation failed'));

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create wallet' });
    });

    it('passes user.id and userClient to service', async () => {
      mockWalletService.getOrCreateWallet.mockResolvedValue({ id: 'w1' });

      const userClient = createMockUserClient();
      const req = createMockReq({ user: { id: 'user-abc' }, userClient });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getOrCreateWallet).toHaveBeenCalledWith('user-abc', userClient);
    });
  });

  // ---------- POST /deposit/stripe ----------

  describe('POST /deposit/stripe', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/deposit/stripe') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('creates checkout session and returns url on success', async () => {
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/session-123',
      });

      const req = createMockReq({
        body: { amountCents: 5000, email: 'test@example.com' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        'test-user-id',
        'test@example.com',
        5000,
      );
      expect(res.json).toHaveBeenCalledWith({
        url: 'https://checkout.stripe.com/session-123',
      });
    });

    it('returns 400 when amountCents is missing', async () => {
      const req = createMockReq({
        body: { email: 'test@example.com' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required fields: amountCents, email',
      });
    });

    it('returns 400 when email is missing', async () => {
      const req = createMockReq({
        body: { amountCents: 5000 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required fields: amountCents, email',
      });
    });

    it('returns 400 when both amountCents and email are missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('supports snake_case amount_cents field', async () => {
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/s1',
      });

      const req = createMockReq({
        body: { amount_cents: 3000, email: 'user@test.com' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        'test-user-id',
        'user@test.com',
        3000,
      );
      expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.stripe.com/s1' });
    });

    it('prefers amountCents over amount_cents when both are provided', async () => {
      mockStripeService.createCheckoutSession.mockResolvedValue({ url: 'https://x.com/s' });

      const req = createMockReq({
        body: { amountCents: 5000, amount_cents: 3000, email: 'x@y.com' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        'test-user-id',
        'x@y.com',
        5000,
      );
    });

    it('returns 500 when stripe service throws', async () => {
      mockStripeService.createCheckoutSession.mockRejectedValue(new Error('Stripe API error'));

      const req = createMockReq({
        body: { amountCents: 5000, email: 'test@example.com' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create checkout session' });
    });

    it('uses user.id from authenticated request', async () => {
      mockStripeService.createCheckoutSession.mockResolvedValue({ url: 'https://x.com' });

      const req = createMockReq({
        user: { id: 'premium-user' },
        body: { amountCents: 1000, email: 'premium@test.com' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        'premium-user',
        'premium@test.com',
        1000,
      );
    });
  });

  // ---------- POST /deposit/crypto ----------

  describe('POST /deposit/crypto', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/deposit/crypto') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns deposit address with network and token on success', async () => {
      mockCryptoWalletService.getDepositAddress.mockResolvedValue('0xABC123DEF456');

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.getDepositAddress).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        address: '0xABC123DEF456',
        network: 'polygon',
        token: 'USDC',
      });
    });

    it('returns 500 when crypto service throws', async () => {
      mockCryptoWalletService.getDepositAddress.mockRejectedValue(new Error('Network error'));

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get deposit address' });
    });

    it('always returns polygon network and USDC token', async () => {
      mockCryptoWalletService.getDepositAddress.mockResolvedValue('0x111');

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.network).toBe('polygon');
      expect(result.token).toBe('USDC');
    });
  });

  // ---------- POST /withdraw/stripe ----------

  describe('POST /withdraw/stripe', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/withdraw/stripe') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns coming soon message', async () => {
      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Stripe Connect withdrawal coming soon',
      });
    });

    it('does not call any external service', async () => {
      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
      expect(mockStripeService.handleWebhook).not.toHaveBeenCalled();
      expect(mockCryptoWalletService.executeWithdrawal).not.toHaveBeenCalled();
    });

    it('returns 500 when res.json throws (catch path)', async () => {
      const req = createMockReq();
      const res = createMockRes();
      // Make the first json call throw to exercise the catch block
      let callCount = 0;
      (res.json as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Serialization failed');
        }
        return res;
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledTimes(2);
    });
  });

  // ---------- POST /withdraw/crypto ----------

  describe('POST /withdraw/crypto', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/withdraw/crypto') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('executes withdrawal and returns txHash on success', async () => {
      mockCryptoWalletService.executeWithdrawal.mockResolvedValue({
        txHash: '0xabc123def456',
      });

      const req = createMockReq({
        body: { toAddress: '0xRecipient', amountCents: 5000 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.executeWithdrawal).toHaveBeenCalledWith(
        'test-user-id',
        '0xRecipient',
        5000,
      );
      expect(res.json).toHaveBeenCalledWith({ txHash: '0xabc123def456' });
    });

    it('returns 400 when toAddress is missing', async () => {
      const req = createMockReq({
        body: { amountCents: 5000 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required fields: toAddress, amountCents',
      });
    });

    it('returns 400 when amountCents is missing', async () => {
      const req = createMockReq({
        body: { toAddress: '0xRecipient' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required fields: toAddress, amountCents',
      });
    });

    it('returns 400 when both fields are missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('supports snake_case to_address field', async () => {
      mockCryptoWalletService.executeWithdrawal.mockResolvedValue({
        txHash: '0xsnake',
      });

      const req = createMockReq({
        body: { to_address: '0xSnakeAddr', amountCents: 2000 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.executeWithdrawal).toHaveBeenCalledWith(
        'test-user-id',
        '0xSnakeAddr',
        2000,
      );
    });

    it('supports snake_case amount_cents field', async () => {
      mockCryptoWalletService.executeWithdrawal.mockResolvedValue({
        txHash: '0xsnake2',
      });

      const req = createMockReq({
        body: { toAddress: '0xAddr', amount_cents: 3000 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.executeWithdrawal).toHaveBeenCalledWith(
        'test-user-id',
        '0xAddr',
        3000,
      );
    });

    it('prefers camelCase over snake_case when both provided', async () => {
      mockCryptoWalletService.executeWithdrawal.mockResolvedValue({ txHash: '0xpref' });

      const req = createMockReq({
        body: {
          toAddress: '0xCamel',
          to_address: '0xSnake',
          amountCents: 7000,
          amount_cents: 3000,
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.executeWithdrawal).toHaveBeenCalledWith(
        'test-user-id',
        '0xCamel',
        7000,
      );
    });

    it('returns 500 when crypto service throws', async () => {
      mockCryptoWalletService.executeWithdrawal.mockRejectedValue(
        new Error('Insufficient funds'),
      );

      const req = createMockReq({
        body: { toAddress: '0xRecipient', amountCents: 5000 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to process withdrawal' });
    });
  });

  // ---------- GET /transactions ----------

  describe('GET /transactions', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/transactions') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns transactions with default pagination (page 1, limit 50)', async () => {
      const txns = [{ id: 'tx1' }, { id: 'tx2' }];
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: txns });

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getTransactionHistory).toHaveBeenCalledWith(
        'test-user-id',
        1,
        50,
        req.userClient,
      );
      expect(res.json).toHaveBeenCalledWith({
        transactions: txns,
        page: 1,
        limit: 50,
        hasMore: false,
      });
    });

    it('uses custom page and limit from query', async () => {
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: [] });

      const req = createMockReq({ query: { page: '3', limit: '25' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getTransactionHistory).toHaveBeenCalledWith(
        'test-user-id',
        3,
        25,
        req.userClient,
      );
      expect(res.json).toHaveBeenCalledWith({
        transactions: [],
        page: 3,
        limit: 25,
        hasMore: false,
      });
    });

    it('clamps limit to max 100', async () => {
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: [] });

      const req = createMockReq({ query: { limit: '500' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getTransactionHistory).toHaveBeenCalledWith(
        'test-user-id',
        1,
        100,
        req.userClient,
      );
      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.limit).toBe(100);
    });

    it('defaults limit to 50 for non-numeric value', async () => {
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: [] });

      const req = createMockReq({ query: { limit: 'abc' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getTransactionHistory).toHaveBeenCalledWith(
        'test-user-id',
        1,
        50,
        req.userClient,
      );
    });

    it('defaults page to 1 for non-numeric value', async () => {
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: [] });

      const req = createMockReq({ query: { page: 'xyz' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getTransactionHistory).toHaveBeenCalledWith(
        'test-user-id',
        1,
        50,
        req.userClient,
      );
    });

    it('sets hasMore true when transactions.length equals limit', async () => {
      const txns = Array.from({ length: 25 }, (_, i) => ({ id: `tx${i}` }));
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: txns });

      const req = createMockReq({ query: { limit: '25' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.hasMore).toBe(true);
    });

    it('sets hasMore false when transactions.length is less than limit', async () => {
      const txns = [{ id: 'tx1' }];
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: txns });

      const req = createMockReq({ query: { limit: '50' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.hasMore).toBe(false);
    });

    it('handles array query params for page (uses first element)', async () => {
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: [] });

      const req = createMockReq({ query: { page: ['2', '5'], limit: '10' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getTransactionHistory).toHaveBeenCalledWith(
        'test-user-id',
        2,
        10,
        req.userClient,
      );
    });

    it('handles array query params for limit (uses first element)', async () => {
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: [] });

      const req = createMockReq({ query: { page: '1', limit: ['20', '50'] } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getTransactionHistory).toHaveBeenCalledWith(
        'test-user-id',
        1,
        20,
        req.userClient,
      );
    });

    it('returns 500 when walletService.getTransactionHistory throws', async () => {
      mockWalletService.getTransactionHistory.mockRejectedValue(new Error('DB error'));

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch transactions' });
    });

    it('returns empty transactions when result has zero items', async () => {
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: [] });

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.transactions).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('passes userClient to service for RLS', async () => {
      mockWalletService.getTransactionHistory.mockResolvedValue({ transactions: [] });

      const userClient = createMockUserClient();
      const req = createMockReq({ userClient });
      const res = createMockRes();

      await handler(req, res);

      expect(mockWalletService.getTransactionHistory).toHaveBeenCalledWith(
        'test-user-id',
        1,
        50,
        userClient,
      );
    });
  });

  // ---------- POST /webhook/stripe ----------

  describe('POST /webhook/stripe', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/webhook/stripe') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns 400 when stripe-signature header is missing', async () => {
      const req = createMockReq({ headers: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing stripe-signature header' });
    });

    it('returns { received: true } on successful webhook processing', async () => {
      mockStripeService.handleWebhook.mockResolvedValue(undefined);

      const body = Buffer.from('raw-body');
      const req = createMockReq({
        headers: { 'stripe-signature': 'whsec_test123' },
        body,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockStripeService.handleWebhook).toHaveBeenCalledWith(body, 'whsec_test123');
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('returns 400 when webhook handling fails', async () => {
      mockStripeService.handleWebhook.mockRejectedValue(
        new Error('Signature verification failed'),
      );

      const req = createMockReq({
        headers: { 'stripe-signature': 'whsec_invalid' },
        body: 'raw',
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Webhook processing failed' });
    });

    it('does not require auth middleware', () => {
      // Webhook route should only have 1 handler (no auth, no validation)
      const handlerCount = getRouteHandlerCount(router, 'post', '/webhook/stripe');
      expect(handlerCount).toBe(1);
    });

    it('passes raw body to stripe service', async () => {
      mockStripeService.handleWebhook.mockResolvedValue(undefined);

      const rawBody = '{"type":"checkout.session.completed"}';
      const req = createMockReq({
        headers: { 'stripe-signature': 'sig_123' },
        body: rawBody,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockStripeService.handleWebhook).toHaveBeenCalledWith(rawBody, 'sig_123');
    });
  });

  // ---------- POST /crypto-wallets ----------

  describe('POST /crypto-wallets', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/crypto-wallets') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('links wallet and returns it on success', async () => {
      const walletData = { id: 'cw1', address: '0xLinked', user_id: 'test-user-id' };
      mockCryptoWalletService.linkWallet.mockResolvedValue(walletData);

      const req = createMockReq({
        body: { walletAddress: '0xLinked' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.linkWallet).toHaveBeenCalledWith(
        'test-user-id',
        '0xLinked',
      );
      expect(res.json).toHaveBeenCalledWith({ wallet: walletData });
    });

    it('returns 400 when walletAddress is missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required field: walletAddress',
      });
    });

    it('supports snake_case wallet_address field', async () => {
      const walletData = { id: 'cw2', address: '0xSnakeWallet' };
      mockCryptoWalletService.linkWallet.mockResolvedValue(walletData);

      const req = createMockReq({
        body: { wallet_address: '0xSnakeWallet' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.linkWallet).toHaveBeenCalledWith(
        'test-user-id',
        '0xSnakeWallet',
      );
      expect(res.json).toHaveBeenCalledWith({ wallet: walletData });
    });

    it('prefers camelCase walletAddress over snake_case wallet_address', async () => {
      mockCryptoWalletService.linkWallet.mockResolvedValue({ id: 'cw3' });

      const req = createMockReq({
        body: { walletAddress: '0xCamelAddr', wallet_address: '0xSnakeAddr' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.linkWallet).toHaveBeenCalledWith(
        'test-user-id',
        '0xCamelAddr',
      );
    });

    it('returns 500 when linkWallet service throws', async () => {
      mockCryptoWalletService.linkWallet.mockRejectedValue(new Error('Duplicate wallet'));

      const req = createMockReq({
        body: { walletAddress: '0xDuplicate' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to link crypto wallet' });
    });

    it('uses user.id from request for linking', async () => {
      mockCryptoWalletService.linkWallet.mockResolvedValue({ id: 'cw4' });

      const req = createMockReq({
        user: { id: 'specific-user' },
        body: { walletAddress: '0xAddr' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.linkWallet).toHaveBeenCalledWith(
        'specific-user',
        '0xAddr',
      );
    });
  });

  // ---------- GET /crypto-wallets ----------

  describe('GET /crypto-wallets', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/crypto-wallets') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns linked wallets array on success', async () => {
      const wallets = [
        { id: 'cw1', address: '0xAddr1' },
        { id: 'cw2', address: '0xAddr2' },
      ];
      mockCryptoWalletService.getLinkedWallets.mockResolvedValue(wallets);

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.getLinkedWallets).toHaveBeenCalledWith('test-user-id');
      expect(res.json).toHaveBeenCalledWith({ wallets });
    });

    it('returns empty array when no wallets linked', async () => {
      mockCryptoWalletService.getLinkedWallets.mockResolvedValue([]);

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({ wallets: [] });
    });

    it('returns 500 when getLinkedWallets throws', async () => {
      mockCryptoWalletService.getLinkedWallets.mockRejectedValue(new Error('DB error'));

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch crypto wallets' });
    });

    it('uses user.id from request', async () => {
      mockCryptoWalletService.getLinkedWallets.mockResolvedValue([]);

      const req = createMockReq({ user: { id: 'wallet-user-99' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockCryptoWalletService.getLinkedWallets).toHaveBeenCalledWith('wallet-user-99');
    });
  });

  // ---------- POST /exchange-credentials ----------

  describe('POST /exchange-credentials', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/exchange-credentials') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('encrypts credentials and upserts successfully', async () => {
      const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const userClient = {
        from: vi.fn(() => ({
          upsert: upsertFn,
        })),
      };
      const req = createMockReq({
        userClient,
        body: {
          exchange: 'binance',
          credentials: { apiKey: 'key123', apiSecret: 'secret456' },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockEncrypt).toHaveBeenCalledWith(
        JSON.stringify({ apiKey: 'key123', apiSecret: 'secret456' }),
      );
      expect(userClient.from).toHaveBeenCalledWith('aio_exchange_credentials');
      expect(upsertFn).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'test-user-id',
          exchange: 'binance',
          encrypted_credentials: expect.stringContaining('encrypted:'),
          updated_at: expect.any(String),
        }),
        { onConflict: 'user_id,exchange' },
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 400 when exchange is missing', async () => {
      const req = createMockReq({
        body: { credentials: { apiKey: 'key' } },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required fields: exchange, credentials',
      });
    });

    it('returns 400 when credentials is missing', async () => {
      const req = createMockReq({
        body: { exchange: 'binance' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required fields: exchange, credentials',
      });
    });

    it('returns 400 when both exchange and credentials are missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 when upsert returns an error', async () => {
      const upsertFn = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'RLS violation' },
      });
      const userClient = {
        from: vi.fn(() => ({
          upsert: upsertFn,
        })),
      };
      const req = createMockReq({
        userClient,
        body: {
          exchange: 'coinbase',
          credentials: { apiKey: 'key' },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to store credentials' });
    });

    it('returns 500 when an unexpected error is thrown', async () => {
      const userClient = {
        from: vi.fn(() => {
          throw new Error('Connection lost');
        }),
      };
      const req = createMockReq({
        userClient,
        body: {
          exchange: 'kraken',
          credentials: { apiKey: 'k' },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to store credentials' });
    });

    it('encrypts credentials as JSON string', async () => {
      const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const userClient = {
        from: vi.fn(() => ({ upsert: upsertFn })),
      };
      const credentials = { key: 'abc', secret: 'xyz', passphrase: '123' };
      const req = createMockReq({
        userClient,
        body: { exchange: 'ftx', credentials },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockEncrypt).toHaveBeenCalledWith(JSON.stringify(credentials));
    });

    it('includes updated_at in upsert data', async () => {
      const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const userClient = {
        from: vi.fn(() => ({ upsert: upsertFn })),
      };
      const req = createMockReq({
        userClient,
        body: { exchange: 'binance', credentials: { k: 'v' } },
      });
      const res = createMockRes();

      await handler(req, res);

      const upsertArgs = upsertFn.mock.calls[0][0];
      expect(upsertArgs).toHaveProperty('updated_at');
      // Validate it's an ISO date string
      expect(new Date(upsertArgs.updated_at).toISOString()).toBe(upsertArgs.updated_at);
    });

    it('uses onConflict user_id,exchange for upsert', async () => {
      const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const userClient = {
        from: vi.fn(() => ({ upsert: upsertFn })),
      };
      const req = createMockReq({
        userClient,
        body: { exchange: 'binance', credentials: { k: 'v' } },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(upsertFn).toHaveBeenCalledWith(
        expect.any(Object),
        { onConflict: 'user_id,exchange' },
      );
    });

    it('uses user-scoped client (userClient) not service client', async () => {
      const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const userClient = {
        from: vi.fn(() => ({ upsert: upsertFn })),
      };
      const req = createMockReq({
        userClient,
        body: { exchange: 'binance', credentials: { k: 'v' } },
      });
      const res = createMockRes();

      await handler(req, res);

      // Verify it's the userClient.from that was called
      expect(userClient.from).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// REAL MONEY ENABLED TESTS
// Tests with ENABLE_REAL_MONEY_TRADING=true to cover the next() path
// ============================================================================

describe('Payments Routes (real money enabled)', () => {
  let enabledRouter: RouterStack;

  beforeAll(async () => {
    vi.stubEnv('ENABLE_REAL_MONEY_TRADING', 'true');
    vi.resetModules();
    const mod = await import('./payments.js');
    enabledRouter = mod.default as unknown as RouterStack;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireRealMoneyEnabled passes through when enabled', () => {
    it('calls next() on POST /deposit/stripe when real money is enabled', () => {
      const middleware = getRouteMiddleware(enabledRouter, 'post', '/deposit/stripe', 0) as (
        ...args: unknown[]
      ) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() on POST /deposit/crypto when real money is enabled', () => {
      const middleware = getRouteMiddleware(enabledRouter, 'post', '/deposit/crypto', 0) as (
        ...args: unknown[]
      ) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() on POST /withdraw/stripe when real money is enabled', () => {
      const middleware = getRouteMiddleware(enabledRouter, 'post', '/withdraw/stripe', 0) as (
        ...args: unknown[]
      ) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() on POST /withdraw/crypto when real money is enabled', () => {
      const middleware = getRouteMiddleware(enabledRouter, 'post', '/withdraw/crypto', 0) as (
        ...args: unknown[]
      ) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('POST /deposit/stripe (enabled)', () => {
    it('processes deposit when real money is enabled', async () => {
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/enabled-session',
      });

      const handler = getRouteHandler(enabledRouter, 'post', '/deposit/stripe') as (
        ...args: unknown[]
      ) => Promise<void>;

      const req = createMockReq({
        body: { amountCents: 10000, email: 'enabled@test.com' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        url: 'https://checkout.stripe.com/enabled-session',
      });
    });
  });

  describe('POST /withdraw/stripe (enabled)', () => {
    it('returns coming soon message when enabled', async () => {
      const handler = getRouteHandler(enabledRouter, 'post', '/withdraw/stripe') as (
        ...args: unknown[]
      ) => Promise<void>;

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Stripe Connect withdrawal coming soon',
      });
    });
  });

  describe('POST /withdraw/crypto (enabled)', () => {
    it('processes crypto withdrawal when real money is enabled', async () => {
      mockCryptoWalletService.executeWithdrawal.mockResolvedValue({
        txHash: '0xenabled',
      });

      const handler = getRouteHandler(enabledRouter, 'post', '/withdraw/crypto') as (
        ...args: unknown[]
      ) => Promise<void>;

      const req = createMockReq({
        body: { toAddress: '0xTarget', amountCents: 2000 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({ txHash: '0xenabled' });
    });
  });
});
