import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: mock req / res / next
// ---------------------------------------------------------------------------

function createMockReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    headers: {},
    query: {},
    params: {},
    body: {},
    ...overrides,
  };
}

function createMockRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}

function createMockNext() {
  return vi.fn();
}

// ---------------------------------------------------------------------------
// Supabase chainable query builder mock
// ---------------------------------------------------------------------------

function mockSupabaseChain(resolvedValue: { data?: unknown; error?: unknown; count?: unknown } = { data: [], error: null, count: 0 }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockReturnValue(chain);
  chain.gt = vi.fn().mockReturnValue(chain);
  // Make it thenable so await works
  chain.then = (resolve: (v: unknown) => void) => resolve(resolvedValue);
  return chain;
}

// We keep a reference we can swap per-test
let currentChain: ReturnType<typeof mockSupabaseChain>;
let mockFrom: ReturnType<typeof vi.fn>;

// Track per-table chains for stats route (multiple from() calls)
let tableChains: Record<string, ReturnType<typeof mockSupabaseChain>>;

function resetTableChains() {
  tableChains = {};
}

// ---------------------------------------------------------------------------
// vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

vi.mock('../../shared/utils/supabase.js', () => {
  const fromFn = vi.fn().mockImplementation(() => currentChain);
  // Expose so tests can override
  mockFrom = fromFn;
  return {
    serviceClient: {
      from: fromFn,
    },
    createUserClient: vi.fn(),
    extractToken: vi.fn(),
  };
});

vi.mock('../../services/order-manager.js', () => ({
  orderManager: {
    placeOrder: vi.fn(),
    getOpenOrders: vi.fn(),
    cancelOrder: vi.fn(),
    getUserPositions: vi.fn(),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  AuthenticatedRequest: {},
}));

vi.mock('../middleware/validate.js', () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../schemas.js', () => ({
  createOrderSchema: {},
}));

// ---------------------------------------------------------------------------
// Extract route handlers from Express Router
// ---------------------------------------------------------------------------

function getRouteHandler(router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (...args: unknown[]) => unknown }> } }> }, method: string, path: string) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routePath === path && routeMethod === method) {
        // Return the last handler (actual route handler, after middleware)
        const handlers = layer.route.stack.map((s) => s.handle);
        return handlers[handlers.length - 1];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

// Also extract middleware at a specific position
function getRouteMiddleware(router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (...args: unknown[]) => unknown }> } }> }, method: string, path: string, index: number) {
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

// ============================================================================
// LEADERBOARD TESTS
// ============================================================================

describe('Leaderboard Routes', () => {
  let leaderboardRouter: ReturnType<typeof getRouteHandler>;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentChain = mockSupabaseChain();
    resetTableChains();
    const mod = await import('./leaderboards.js');
    leaderboardRouter = (mod.default as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (...args: unknown[]) => unknown }> } }> });
  });

  // ---------- GET /global ----------

  describe('GET /global', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(leaderboardRouter as ReturnType<typeof getRouteHandler>, 'get', '/global') as (...args: unknown[]) => Promise<void>;
    });

    it('returns ranked agents with default limit/offset', async () => {
      const agents = [
        { id: '1', name: 'Agent A', elo_rating: 1500 },
        { id: '2', name: 'Agent B', elo_rating: 1400 },
      ];
      currentChain = mockSupabaseChain({ data: agents, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([
        { id: '1', name: 'Agent A', elo_rating: 1500, rank: 1 },
        { id: '2', name: 'Agent B', elo_rating: 1400, rank: 2 },
      ]);
    });

    it('clamps limit to max 500', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { limit: '9999' } });
      const res = createMockRes();

      await handler(req, res);

      // limit=500, offset=0 -> range(0, 499)
      expect(currentChain.range).toHaveBeenCalledWith(0, 499);
    });

    it('clamps limit to min 1', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { limit: '-5' } });
      const res = createMockRes();

      await handler(req, res);

      // limit=1, offset=0 -> range(0, 0)
      expect(currentChain.range).toHaveBeenCalledWith(0, 0);
    });

    it('defaults offset to 0', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      // default limit=100, offset=0 -> range(0, 99)
      expect(currentChain.range).toHaveBeenCalledWith(0, 99);
    });

    it('passes correct query params to Supabase', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { limit: '20', offset: '10' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledWith('aio_agents');
      expect(currentChain.eq).toHaveBeenCalledWith('is_active', true);
      expect(currentChain.eq).toHaveBeenCalledWith('is_public', true);
      expect(currentChain.order).toHaveBeenCalledWith('elo_rating', { ascending: false });
      expect(currentChain.range).toHaveBeenCalledWith(10, 29);
    });

    it('adds rank field starting from offset+1', async () => {
      const agents = [
        { id: '1', elo_rating: 1500 },
        { id: '2', elo_rating: 1400 },
      ];
      currentChain = mockSupabaseChain({ data: agents, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { offset: '5' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result[0].rank).toBe(6);
      expect(result[1].rank).toBe(7);
    });

    it('returns 500 on Supabase error', async () => {
      currentChain = mockSupabaseChain({ data: null, error: new Error('DB error') });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get leaderboard' });
    });

    it('handles empty results', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('handles non-numeric limit gracefully (defaults to 100)', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { limit: 'abc' } });
      const res = createMockRes();

      await handler(req, res);

      // parseInt('abc') => NaN, NaN || 100 => 100
      expect(currentChain.range).toHaveBeenCalledWith(0, 99);
    });

    it('handles negative offset by clamping to 0', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { offset: '-10' } });
      const res = createMockRes();

      await handler(req, res);

      // Math.max(0, -10) => 0
      expect(currentChain.range).toHaveBeenCalledWith(0, 99);
    });
  });

  // ---------- GET /domain/:slug ----------

  describe('GET /domain/:slug', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(leaderboardRouter as ReturnType<typeof getRouteHandler>, 'get', '/domain/:slug') as (...args: unknown[]) => Promise<void>;
    });

    it('returns domain-ranked agents', async () => {
      const data = [
        {
          domain_rating: 1600,
          domain_wins: 5,
          domain_competitions: 10,
          agent: { id: '1', name: 'Agent A', elo_rating: 1500 },
        },
      ];
      currentChain = mockSupabaseChain({ data, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ params: { slug: 'trading' }, query: {} });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result[0]).toEqual({
        id: '1',
        name: 'Agent A',
        elo_rating: 1500,
        domain_rating: 1600,
        domain_wins: 5,
        domain_competitions: 10,
        rank: 1,
      });
    });

    it('flattens agent data with domain fields', async () => {
      const data = [
        {
          domain_rating: 1400,
          domain_wins: 2,
          domain_competitions: 3,
          agent: { id: '2', name: 'Agent B', slug: 'agent-b', color: '#fff' },
        },
      ];
      currentChain = mockSupabaseChain({ data, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ params: { slug: 'coding' }, query: {} });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Agent fields are at top level
      expect(result[0].id).toBe('2');
      expect(result[0].name).toBe('Agent B');
      expect(result[0].slug).toBe('agent-b');
      // Domain fields at top level
      expect(result[0].domain_rating).toBe(1400);
      expect(result[0].domain_wins).toBe(2);
      expect(result[0].domain_competitions).toBe(3);
    });

    it('passes domain slug to query', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ params: { slug: 'creative' }, query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledWith('aio_agent_domain_ratings');
      expect(currentChain.eq).toHaveBeenCalledWith('domain', 'creative');
    });

    it('returns 500 on error', async () => {
      currentChain = mockSupabaseChain({ data: null, error: new Error('DB fail') });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ params: { slug: 'trading' }, query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get leaderboard' });
    });

    it('handles empty results', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ params: { slug: 'games' }, query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('respects limit and offset for domain leaderboard', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ params: { slug: 'coding' }, query: { limit: '5', offset: '10' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.range).toHaveBeenCalledWith(10, 14);
    });

    it('orders by domain_rating descending', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ params: { slug: 'trading' }, query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.order).toHaveBeenCalledWith('domain_rating', { ascending: false });
    });

    it('filters by agent.is_active and agent.is_public', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ params: { slug: 'games' }, query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.eq).toHaveBeenCalledWith('agent.is_active', true);
      expect(currentChain.eq).toHaveBeenCalledWith('agent.is_public', true);
    });
  });

  // ---------- GET /top ----------

  describe('GET /top', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(leaderboardRouter as ReturnType<typeof getRouteHandler>, 'get', '/top') as (...args: unknown[]) => Promise<void>;
    });

    it('returns top agents with default count=10', async () => {
      const agents = [{ id: '1', name: 'Agent A', elo_rating: 1600 }];
      currentChain = mockSupabaseChain({ data: agents, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.limit).toHaveBeenCalledWith(10);
      expect(res.json).toHaveBeenCalledWith(agents);
    });

    it('clamps count to max 100', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { count: '500' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.limit).toHaveBeenCalledWith(100);
    });

    it('clamps count to min 1 when negative', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { count: '-5' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.limit).toHaveBeenCalledWith(1);
    });

    it('defaults count=10 when count is 0 (falsy)', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { count: '0' } });
      const res = createMockRes();

      await handler(req, res);

      // parseInt('0') || 10 => 10, because 0 is falsy
      expect(currentChain.limit).toHaveBeenCalledWith(10);
    });

    it('returns 500 on error', async () => {
      currentChain = mockSupabaseChain({ data: null, error: new Error('DB error') });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get top agents' });
    });

    it('queries correct table with filters', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledWith('aio_agents');
      expect(currentChain.eq).toHaveBeenCalledWith('is_active', true);
      expect(currentChain.eq).toHaveBeenCalledWith('is_public', true);
      expect(currentChain.order).toHaveBeenCalledWith('elo_rating', { ascending: false });
    });
  });

  // ---------- GET /stats ----------

  describe('GET /stats', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(leaderboardRouter as ReturnType<typeof getRouteHandler>, 'get', '/stats') as (...args: unknown[]) => Promise<void>;
    });

    it('returns all stats fields', async () => {
      // Stats makes 4 separate from() calls, each returning a chain
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 42 }),  // agents count
        mockSupabaseChain({ data: null, error: null, count: 15 }),  // total competitions
        mockSupabaseChain({ data: null, error: null, count: 8 }),   // completed competitions
        mockSupabaseChain({ data: [{ prize_pool: 5000 }, { prize_pool: 3000 }], error: null }), // prize data
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        totalAgents: 42,
        totalCompetitions: 15,
        completedCompetitions: 8,
        totalPrizePool: 8000,
      });
    });

    it('handles null counts (defaults to 0)', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: null }),
        mockSupabaseChain({ data: null, error: null, count: null }),
        mockSupabaseChain({ data: null, error: null, count: null }),
        mockSupabaseChain({ data: [], error: null }),
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        totalAgents: 0,
        totalCompetitions: 0,
        completedCompetitions: 0,
        totalPrizePool: 0,
      });
    });

    it('calculates totalPrizePool from prizeData', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 1 }),
        mockSupabaseChain({ data: null, error: null, count: 1 }),
        mockSupabaseChain({ data: null, error: null, count: 1 }),
        mockSupabaseChain({
          data: [
            { prize_pool: 1000 },
            { prize_pool: 2000 },
            { prize_pool: 500 },
          ],
          error: null,
        }),
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.totalPrizePool).toBe(3500);
    });

    it('handles empty prize data (0 total)', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 5 }),
        mockSupabaseChain({ data: null, error: null, count: 3 }),
        mockSupabaseChain({ data: null, error: null, count: 1 }),
        mockSupabaseChain({ data: [], error: null }),
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.totalPrizePool).toBe(0);
    });

    it('handles null prize_pool values in data', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 1 }),
        mockSupabaseChain({ data: null, error: null, count: 1 }),
        mockSupabaseChain({ data: null, error: null, count: 1 }),
        mockSupabaseChain({
          data: [
            { prize_pool: 1000 },
            { prize_pool: null },
            { prize_pool: 0 },
            { prize_pool: 2000 },
          ],
          error: null,
        }),
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.totalPrizePool).toBe(3000);
    });

    it('returns 500 on error', async () => {
      // First call throws
      mockFrom.mockImplementation(() => {
        throw new Error('DB connection failed');
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get stats' });
    });

    it('handles null prizeData (data is null)', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 10 }),
        mockSupabaseChain({ data: null, error: null, count: 5 }),
        mockSupabaseChain({ data: null, error: null, count: 2 }),
        mockSupabaseChain({ data: null, error: null }),
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.totalPrizePool).toBe(0);
    });
  });
});

// ============================================================================
// TRADING TESTS
// ============================================================================

describe('Trading Routes', () => {
  let tradingRouter: ReturnType<typeof getRouteHandler>;
  let orderManager: {
    placeOrder: ReturnType<typeof vi.fn>;
    getOpenOrders: ReturnType<typeof vi.fn>;
    cancelOrder: ReturnType<typeof vi.fn>;
    getUserPositions: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    currentChain = mockSupabaseChain();
    resetTableChains();

    const tradingMod = await import('./trading.js');
    tradingRouter = (tradingMod.default as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (...args: unknown[]) => unknown }> } }> });

    const omMod = await import('../../services/order-manager.js');
    orderManager = omMod.orderManager as typeof orderManager;
  });

  // ---------- requireRealMoneyEnabled middleware ----------

  describe('requireRealMoneyEnabled middleware', () => {
    it('returns 503 when feature disabled (default)', async () => {
      // The middleware is the first handler on POST /orders
      const middleware = getRouteMiddleware(tradingRouter as ReturnType<typeof getRouteHandler>, 'post', '/orders', 0) as (...args: unknown[]) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Real-money trading is currently disabled',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('also returns 503 on DELETE /orders/:id when feature disabled', async () => {
      const middleware = getRouteMiddleware(tradingRouter as ReturnType<typeof getRouteHandler>, 'delete', '/orders/:id', 0) as (...args: unknown[]) => void;

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ---------- POST /orders ----------

  describe('POST /orders', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      // The actual handler is the last function in the route stack
      handler = getRouteHandler(tradingRouter as ReturnType<typeof getRouteHandler>, 'post', '/orders') as (...args: unknown[]) => Promise<void>;
    });

    it('places order successfully', async () => {
      const mockOrder = { id: 'order-1', amount_cents: 1000 };
      orderManager.placeOrder.mockResolvedValue(mockOrder);

      const req = createMockReq({
        user: { id: 'user-1' },
        body: {
          marketId: 'market-1',
          marketSource: 'polymarket',
          outcome: 'yes',
          amountCents: 1000,
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(orderManager.placeOrder).toHaveBeenCalledWith('user-1', 'market-1', 'polymarket', 'yes', 1000);
      expect(res.json).toHaveBeenCalledWith({ order: mockOrder });
    });

    it('returns 400 on missing marketId', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        body: {
          marketSource: 'polymarket',
          outcome: 'yes',
          amountCents: 1000,
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required fields: marketId, marketSource, outcome, amountCents',
      });
    });

    it('returns 400 on missing marketSource', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        body: {
          marketId: 'market-1',
          outcome: 'yes',
          amountCents: 1000,
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 on missing outcome', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        body: {
          marketId: 'market-1',
          marketSource: 'polymarket',
          amountCents: 1000,
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 on missing amountCents', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        body: {
          marketId: 'market-1',
          marketSource: 'polymarket',
          outcome: 'yes',
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 on service error', async () => {
      orderManager.placeOrder.mockRejectedValue(new Error('Service unavailable'));

      const req = createMockReq({
        user: { id: 'user-1' },
        body: {
          marketId: 'market-1',
          marketSource: 'polymarket',
          outcome: 'yes',
          amountCents: 1000,
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to place order' });
    });

    it('returns 400 when all fields missing (empty body)', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        body: {},
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required fields: marketId, marketSource, outcome, amountCents',
      });
    });
  });

  // ---------- GET /orders ----------

  describe('GET /orders (open orders)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(tradingRouter as ReturnType<typeof getRouteHandler>, 'get', '/orders') as (...args: unknown[]) => Promise<void>;
    });

    it('returns user open orders', async () => {
      const mockOrders = [{ id: 'order-1' }, { id: 'order-2' }];
      orderManager.getOpenOrders.mockResolvedValue(mockOrders);

      const req = createMockReq({ user: { id: 'user-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(orderManager.getOpenOrders).toHaveBeenCalledWith('user-1');
      expect(res.json).toHaveBeenCalledWith({ orders: mockOrders });
    });

    it('returns 500 on service error', async () => {
      orderManager.getOpenOrders.mockRejectedValue(new Error('DB error'));

      const req = createMockReq({ user: { id: 'user-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch orders' });
    });
  });

  // ---------- GET /orders/:id ----------

  describe('GET /orders/:id', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(tradingRouter as ReturnType<typeof getRouteHandler>, 'get', '/orders/:id') as (...args: unknown[]) => Promise<void>;
    });

    it('returns specific order', async () => {
      const mockOrder = { id: 'order-1', amount_cents: 500 };
      const userDbChain = mockSupabaseChain({ data: mockOrder, error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        params: { id: 'order-1' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({ order: mockOrder });
    });

    it('returns 404 when not found', async () => {
      const userDbChain = mockSupabaseChain({ data: null, error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        params: { id: 'nonexistent' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Order not found' });
    });

    it('returns 404 on query error', async () => {
      const userDbChain = mockSupabaseChain({ data: null, error: new Error('query failed') });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        params: { id: 'order-1' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Order not found' });
    });

    it('returns 500 on unexpected error', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: {
          from: vi.fn().mockImplementation(() => {
            throw new Error('Connection lost');
          }),
        },
        params: { id: 'order-1' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch order' });
    });

    it('queries aio_real_bets by id and user_id', async () => {
      const userDbChain = mockSupabaseChain({ data: { id: 'order-1' }, error: null });
      const fromFn = vi.fn().mockReturnValue(userDbChain);

      const req = createMockReq({
        user: { id: 'user-99' },
        userClient: { from: fromFn },
        params: { id: 'order-42' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(fromFn).toHaveBeenCalledWith('aio_real_bets');
      expect(userDbChain.eq).toHaveBeenCalledWith('id', 'order-42');
      expect(userDbChain.eq).toHaveBeenCalledWith('user_id', 'user-99');
      expect(userDbChain.single).toHaveBeenCalled();
    });
  });

  // ---------- DELETE /orders/:id ----------

  describe('DELETE /orders/:id', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(tradingRouter as ReturnType<typeof getRouteHandler>, 'delete', '/orders/:id') as (...args: unknown[]) => Promise<void>;
    });

    it('cancels order successfully', async () => {
      orderManager.cancelOrder.mockResolvedValue(undefined);

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'order-1' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(orderManager.cancelOrder).toHaveBeenCalledWith('user-1', 'order-1');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 500 on error', async () => {
      orderManager.cancelOrder.mockRejectedValue(new Error('Cannot cancel'));

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'order-1' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to cancel order' });
    });
  });

  // ---------- GET /positions ----------

  describe('GET /positions', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(tradingRouter as ReturnType<typeof getRouteHandler>, 'get', '/positions') as (...args: unknown[]) => Promise<void>;
    });

    it('returns positions', async () => {
      const mockPositions = [{ market_id: 'm1', outcome: 'yes', shares: 10 }];
      orderManager.getUserPositions.mockResolvedValue(mockPositions);

      const req = createMockReq({ user: { id: 'user-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(orderManager.getUserPositions).toHaveBeenCalledWith('user-1');
      expect(res.json).toHaveBeenCalledWith({ positions: mockPositions });
    });

    it('returns 500 on error', async () => {
      orderManager.getUserPositions.mockRejectedValue(new Error('Service error'));

      const req = createMockReq({ user: { id: 'user-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch positions' });
    });
  });

  // ---------- GET /history ----------

  describe('GET /history', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(tradingRouter as ReturnType<typeof getRouteHandler>, 'get', '/history') as (...args: unknown[]) => Promise<void>;
    });

    it('returns paginated history', async () => {
      const trades = [{ id: 't1' }, { id: 't2' }];
      const userDbChain = mockSupabaseChain({ data: trades, error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: { page: '1', limit: '50' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        trades,
        page: 1,
        limit: 50,
        hasMore: false,
      });
    });

    it('defaults page=1 limit=50', async () => {
      const userDbChain = mockSupabaseChain({ data: [], error: null });
      const fromFn = vi.fn().mockReturnValue(userDbChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: fromFn },
        query: {},
      });
      const res = createMockRes();

      await handler(req, res);

      // range(0, 50) because it fetches limit+1 = 51, so range(0, 50)
      expect(userDbChain.range).toHaveBeenCalledWith(0, 50);
      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('clamps limit to max 100', async () => {
      const userDbChain = mockSupabaseChain({ data: [], error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: { limit: '500' },
      });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.limit).toBe(100);
    });

    it('sets hasMore=true when more rows exist', async () => {
      // For limit=2, fetch 3 rows to indicate more
      const trades = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
      const userDbChain = mockSupabaseChain({ data: trades, error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: { limit: '2' },
      });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.hasMore).toBe(true);
      // Should only return first 2 trades (sliced)
      expect(result.trades).toHaveLength(2);
      expect(result.trades).toEqual([{ id: 't1' }, { id: 't2' }]);
    });

    it('sets hasMore=false when no more rows', async () => {
      // For limit=10, fetch <=10 rows
      const trades = [{ id: 't1' }, { id: 't2' }];
      const userDbChain = mockSupabaseChain({ data: trades, error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: { limit: '10' },
      });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.hasMore).toBe(false);
      expect(result.trades).toHaveLength(2);
    });

    it('calculates offset from page and limit', async () => {
      const userDbChain = mockSupabaseChain({ data: [], error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: { page: '3', limit: '20' },
      });
      const res = createMockRes();

      await handler(req, res);

      // page=3, limit=20, offset=(3-1)*20=40, range(40, 60) (40 to 40+20)
      expect(userDbChain.range).toHaveBeenCalledWith(40, 60);
    });

    it('returns 500 on query error', async () => {
      const userDbChain = mockSupabaseChain({ data: null, error: new Error('DB error') });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: {},
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch trade history' });
    });

    it('returns 500 on unexpected error', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: {
          from: vi.fn().mockImplementation(() => {
            throw new Error('Connection lost');
          }),
        },
        query: {},
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch trade history' });
    });

    it('orders by created_at descending', async () => {
      const userDbChain = mockSupabaseChain({ data: [], error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: {},
      });
      const res = createMockRes();

      await handler(req, res);

      expect(userDbChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('handles null rawTrades gracefully', async () => {
      const userDbChain = mockSupabaseChain({ data: null, error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: {},
      });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.trades).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('queries aio_real_bets with user_id filter', async () => {
      const userDbChain = mockSupabaseChain({ data: [], error: null });
      const fromFn = vi.fn().mockReturnValue(userDbChain);

      const req = createMockReq({
        user: { id: 'user-55' },
        userClient: { from: fromFn },
        query: {},
      });
      const res = createMockRes();

      await handler(req, res);

      expect(fromFn).toHaveBeenCalledWith('aio_real_bets');
      expect(userDbChain.eq).toHaveBeenCalledWith('user_id', 'user-55');
    });

    it('handles exact limit count of rows (no extra row)', async () => {
      // Exactly limit rows returned => hasMore false
      const trades = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}` }));
      const userDbChain = mockSupabaseChain({ data: trades, error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: { limit: '10' },
      });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.hasMore).toBe(false);
      expect(result.trades).toHaveLength(10);
    });

    it('handles limit+1 rows exactly (hasMore true, sliced)', async () => {
      // limit+1 rows => hasMore true, returns limit rows
      const trades = Array.from({ length: 11 }, (_, i) => ({ id: `t${i}` }));
      const userDbChain = mockSupabaseChain({ data: trades, error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: vi.fn().mockReturnValue(userDbChain) },
        query: { limit: '10' },
      });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.hasMore).toBe(true);
      expect(result.trades).toHaveLength(10);
    });
  });
});
