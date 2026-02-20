import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: mock req / res
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
  return res as {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// Chainable Supabase mock
// ---------------------------------------------------------------------------

function createChainMock(resolveValue: { data?: unknown; error?: unknown; count?: number } = { data: null, error: null, count: 0 }) {
  const chain: Record<string, unknown> = {};
  const mockFn = () => chain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockReturnValue(chain);
  // Make it thenable so `await` resolves to resolveValue
  chain.then = (resolve: (val: unknown) => void) => resolve(resolveValue);
  return chain;
}

// ---------------------------------------------------------------------------
// Competition Manager mock
// ---------------------------------------------------------------------------

const mockCompetitionManager = {
  activeCount: 0,
  getActiveCompetition: vi.fn(),
  startCompetition: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../orchestrator/competition-manager.js', () => ({
  competitionManager: mockCompetitionManager,
}));

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

let serviceChain = createChainMock();
const mockServiceFrom = vi.fn(() => serviceChain);

vi.mock('../../shared/utils/supabase.js', () => ({
  serviceClient: { from: (...args: unknown[]) => mockServiceFrom(...args) },
}));

// ---------------------------------------------------------------------------
// Logger mock
// ---------------------------------------------------------------------------

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Auth middleware mock - auto-sets user and userClient
// ---------------------------------------------------------------------------

let mockUserChain = createChainMock();
const mockUserFrom = vi.fn(() => mockUserChain);

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: Record<string, unknown>, _res: unknown, next: () => void) => {
    _req.user = { id: 'user-1' };
    _req.userClient = { from: (...args: unknown[]) => mockUserFrom(...args) };
    next();
  },
}));

// ---------------------------------------------------------------------------
// Validate middleware mock - pass-through
// ---------------------------------------------------------------------------

vi.mock('../middleware/validate.js', () => ({
  validateBody: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// Schemas mock
// ---------------------------------------------------------------------------

vi.mock('../schemas.js', () => ({
  createCompetitionSchema: {},
  joinCompetitionSchema: {},
  voteSchema: {},
}));

// ---------------------------------------------------------------------------
// Router extraction helpers
// ---------------------------------------------------------------------------

type RouterLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

type RouterType = { stack: RouterLayer[] };

function getRouteHandler(router: RouterType, method: string, path: string) {
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

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Competitions Routes', () => {
  let router: RouterType;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset defaults
    serviceChain = createChainMock();
    mockServiceFrom.mockImplementation(() => serviceChain);

    mockUserChain = createChainMock();
    mockUserFrom.mockImplementation(() => mockUserChain);

    mockCompetitionManager.activeCount = 0;
    mockCompetitionManager.getActiveCompetition.mockReset();
    mockCompetitionManager.startCompetition.mockReset();
    mockCompetitionManager.startCompetition.mockResolvedValue(undefined);

    const mod = await import('./competitions.js');
    router = mod.default as unknown as RouterType;
  });

  // ========================================================================
  // Route structure
  // ========================================================================

  describe('Route structure', () => {
    it('has GET / route', () => {
      expect(() => getRouteHandler(router, 'get', '/')).not.toThrow();
    });

    it('has GET /domains/list route', () => {
      expect(() => getRouteHandler(router, 'get', '/domains/list')).not.toThrow();
    });

    it('has GET /:id route', () => {
      expect(() => getRouteHandler(router, 'get', '/:id')).not.toThrow();
    });

    it('has POST / route', () => {
      expect(() => getRouteHandler(router, 'post', '/')).not.toThrow();
    });

    it('has POST /:id/join route', () => {
      expect(() => getRouteHandler(router, 'post', '/:id/join')).not.toThrow();
    });

    it('has DELETE /:id/leave route', () => {
      expect(() => getRouteHandler(router, 'delete', '/:id/leave')).not.toThrow();
    });

    it('has POST /:id/start route', () => {
      expect(() => getRouteHandler(router, 'post', '/:id/start')).not.toThrow();
    });

    it('has GET /:id/live route', () => {
      expect(() => getRouteHandler(router, 'get', '/:id/live')).not.toThrow();
    });

    it('has POST /:id/vote route', () => {
      expect(() => getRouteHandler(router, 'post', '/:id/vote')).not.toThrow();
    });

    it('has GET /:id/votes route', () => {
      expect(() => getRouteHandler(router, 'get', '/:id/votes')).not.toThrow();
    });

    it('has DELETE /:id/vote route', () => {
      expect(() => getRouteHandler(router, 'delete', '/:id/vote')).not.toThrow();
    });
  });

  // ========================================================================
  // GET / (list competitions)
  // ========================================================================

  describe('GET / (list competitions)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/') as (...args: unknown[]) => Promise<void>;
    });

    it('returns competitions with default pagination', async () => {
      const competitions = [
        { id: 'c1', name: 'Test', participant_count: [{ count: 3 }] },
        { id: 'c2', name: 'Test2', participant_count: [{ count: 0 }] },
      ];
      serviceChain = createChainMock({ data: competitions, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([
        { id: 'c1', name: 'Test', participant_count: 3 },
        { id: 'c2', name: 'Test2', participant_count: 0 },
      ]);
    });

    it('applies domain filter by looking up domain_id', async () => {
      // First call: domain lookup, second call (thenable): main query
      const domainChain = createChainMock({ data: { id: 'dom-1' }, error: null });
      const mainChain = createChainMock({ data: [], error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation((table: string) => {
        if (table === 'aio_domains') {
          return domainChain;
        }
        callCount++;
        return mainChain;
      });

      const req = createMockReq({ query: { domain: 'coding' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockServiceFrom).toHaveBeenCalledWith('aio_domains');
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('applies status filter', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: { status: 'running' } });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.eq).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('applies mode (stake_mode) filter', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: { mode: 'sandbox' } });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.eq).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('clamps pagination limit to max 100', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: { limit: 500, offset: 0 } });
      const res = createMockRes();
      await handler(req, res);

      // range should be called with 0 and 99 (100 items, 0-indexed)
      expect(serviceChain.range).toHaveBeenCalledWith(0, 99);
    });

    it('clamps pagination limit to minimum 1', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: { limit: -5, offset: 0 } });
      const res = createMockRes();
      await handler(req, res);

      // safeLimit = Math.min(Math.max(1, -5), 100) = 1
      expect(serviceChain.range).toHaveBeenCalledWith(0, 0);
    });

    it('defaults limit to 50 and offset to 0', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      // default: safeLimit=50, safeOffset=0 -> range(0, 49)
      expect(serviceChain.range).toHaveBeenCalledWith(0, 49);
    });

    it('handles offset parameter', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: { limit: 10, offset: 20 } });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.range).toHaveBeenCalledWith(20, 29);
    });

    it('clamps negative offset to 0', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: { limit: 10, offset: -5 } });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.range).toHaveBeenCalledWith(0, 9);
    });

    it('processes participant_count array to count', async () => {
      const competitions = [
        { id: 'c1', participant_count: [{ count: 5 }] },
      ];
      serviceChain = createChainMock({ data: competitions, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result[0].participant_count).toBe(5);
    });

    it('processes empty participant_count array to 0', async () => {
      const competitions = [
        { id: 'c1', participant_count: [] },
      ];
      serviceChain = createChainMock({ data: competitions, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result[0].participant_count).toBe(0);
    });

    it('processes non-array participant_count to 0', async () => {
      const competitions = [
        { id: 'c1', participant_count: 42 },
      ];
      serviceChain = createChainMock({ data: competitions, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result[0].participant_count).toBe(0);
    });

    it('handles NaN limit by defaulting to 50', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: { limit: 'abc' } });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.range).toHaveBeenCalledWith(0, 49);
    });

    it('returns 500 on DB error', async () => {
      serviceChain = createChainMock({ data: null, error: { message: 'DB error' } });
      // Make the chain throw when awaited
      serviceChain.then = (_resolve: (val: unknown) => void, reject?: (err: unknown) => void) => {
        // This simulates `if (error) throw error;`
        // We need the chain to resolve with an error, then the handler throws
        return _resolve({ data: null, error: { message: 'DB error' } });
      };
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      // The handler does: const { data, error } = await query; if (error) throw error;
      // We need to simulate `throw error` path. Since we can't easily do that with
      // the chainable mock, let's make the chain throw directly.
      const throwChain = createChainMock();
      throwChain.then = (resolve: (val: unknown) => void) => {
        // Return data with error set, handler will throw it
        return resolve({ data: null, error: { message: 'DB fail' } });
      };
      mockServiceFrom.mockImplementation(() => throwChain);

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list competitions' });
    });

    it('handles null data gracefully', async () => {
      serviceChain = createChainMock({ data: null, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      // data?.map returns undefined, which gets passed to res.json
      expect(res.json).toHaveBeenCalled();
    });

    it('domain filter skips eq when domain not found', async () => {
      const domainChain = createChainMock({ data: null, error: null });
      const mainChain = createChainMock({ data: [], error: null });

      mockServiceFrom.mockImplementation((table: string) => {
        if (table === 'aio_domains') return domainChain;
        return mainChain;
      });

      const req = createMockReq({ query: { domain: 'nonexistent' } });
      const res = createMockRes();
      await handler(req, res);

      // Should still return results even if domain not found
      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  // ========================================================================
  // GET /:id (get single competition)
  // ========================================================================

  describe('GET /:id', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id') as (...args: unknown[]) => Promise<void>;
    });

    it('returns competition when found', async () => {
      const competition = { id: 'comp-1', name: 'Test Competition', status: 'lobby' };
      serviceChain = createChainMock({ data: competition, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(competition);
    });

    it('returns 404 when competition not found (null data)', async () => {
      serviceChain = createChainMock({ data: null, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ params: { id: 'nonexistent' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition not found' });
    });

    it('returns 404 when DB returns an error', async () => {
      serviceChain = createChainMock({ data: null, error: { code: 'PGRST116', message: 'not found' } });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ params: { id: 'bad-id' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition not found' });
    });

    it('returns 500 on unexpected error (throw)', async () => {
      const throwChain = createChainMock();
      throwChain.then = () => { throw new Error('Unexpected'); };
      mockServiceFrom.mockImplementation(() => throwChain);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get competition' });
    });
  });

  // ========================================================================
  // POST / (create competition)
  // ========================================================================

  describe('POST / (create competition)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/') as (...args: unknown[]) => Promise<void>;
    });

    it('creates competition successfully with 201', async () => {
      const created = { id: 'new-comp', name: 'My Comp', status: 'lobby' };
      // Rate limit check: userClient.from -> count: 0
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      // Insert chain
      const insertChain = createChainMock({ data: created, error: null });

      mockUserFrom.mockImplementation((table: string) => {
        if (table === 'aio_competitions') {
          // First call is rate limit, second is insert
          // We need to differentiate. Use a counter.
          return rateLimitChain;
        }
        return createChainMock();
      });

      // Make the rate limit chain resolve with count: 0
      rateLimitChain.then = (resolve: (val: unknown) => void) => resolve({ data: null, error: null, count: 0 });

      // Override for insert path (second call)
      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        if (userCallCount === 1) {
          // Rate limit check
          return rateLimitChain;
        }
        // Insert
        return insertChain;
      });

      // Insert chain resolves with created data
      insertChain.then = (resolve: (val: unknown) => void) => resolve({ data: created, error: null });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'My Comp', stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('returns 400 when name is missing', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { stake_mode: 'sandbox' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition name is required' });
    });

    it('returns 400 when name is empty string', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: '', stake_mode: 'sandbox' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition name is required' });
    });

    it('returns 429 when rate limit exceeded (3+ per hour)', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 3 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Rate limit: maximum 3 competitions per hour. Please wait and try again.',
      });
    });

    it('returns 429 when rate limit count is 5 (exceeds 3)', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 5 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('returns 400 for real stake_mode when real money is disabled', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'real', entry_fee: 100, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Real-money competitions are currently disabled. Use sandbox mode.',
      });
    });

    it('allows sandbox stake_mode', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock({ data: { id: 'c1' }, error: null });

      let callCount = 0;
      mockUserFrom.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? rateLimitChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('allows spectator stake_mode', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock({ data: { id: 'c1' }, error: null });

      let callCount = 0;
      mockUserFrom.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? rateLimitChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'spectator', entry_fee: 50, max_participants: 4 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 400 for invalid stake_mode', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'invalid_mode', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for negative entry_fee', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: -1, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'entry_fee must be a number between 0 and 10000' });
    });

    it('returns 400 for entry_fee over 10000', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 10001, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'entry_fee must be a number between 0 and 10000' });
    });

    it('returns 400 for non-number entry_fee', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 'free', max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'entry_fee must be a number between 0 and 10000' });
    });

    it('returns 400 for max_participants less than 2', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 0, max_participants: 1 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'max_participants must be an integer between 2 and 64' });
    });

    it('returns 400 for max_participants greater than 64', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 0, max_participants: 65 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'max_participants must be an integer between 2 and 64' });
    });

    it('returns 400 for non-integer max_participants', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      mockUserFrom.mockImplementation(() => rateLimitChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 0, max_participants: 3.5 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'max_participants must be an integer between 2 and 64' });
    });

    it('looks up domain_id by slug when domain_slug provided', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const domainChain = createChainMock({ data: { id: 'dom-1' }, error: null });
      const insertChain = createChainMock({ data: { id: 'c1', domain_id: 'dom-1' }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? rateLimitChain : insertChain;
      });

      mockServiceFrom.mockImplementation((table: string) => {
        if (table === 'aio_domains') return domainChain;
        return createChainMock();
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', domain_slug: 'coding', stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockServiceFrom).toHaveBeenCalledWith('aio_domains');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('validates task_ids as array of strings', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock({ data: { id: 'c1', task_ids: ['t1', 't2'] }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? rateLimitChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', task_ids: ['t1', 't2'], stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('nullifies invalid task_ids (non-array)', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock({ data: { id: 'c1', task_ids: null }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? rateLimitChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', task_ids: 'not-an-array', stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('nullifies task_ids with non-string elements', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock({ data: { id: 'c1', task_ids: null }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? rateLimitChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', task_ids: [1, 2, 3], stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('forces entry_fee to 0 for sandbox mode', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock({ data: { id: 'c1', entry_fee: 0 }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? rateLimitChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 500, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      // The insert should have been called with entry_fee: 0
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ entry_fee: 0 })
      );
    });

    it('uses defaults for missing optional fields', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock({ data: { id: 'c1' }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? rateLimitChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp' },
      });
      const res = createMockRes();
      await handler(req, res);

      // Should use defaults: stake_mode='sandbox', entry_fee=0, max_participants=8
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          stake_mode: 'sandbox',
          entry_fee: 0,
          max_participants: 8,
          status: 'lobby',
        })
      );
    });

    it('returns 500 on DB insert error', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock();
      insertChain.then = (resolve: (val: unknown) => void) =>
        resolve({ data: null, error: { message: 'Insert failed' } });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? rateLimitChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test Comp', stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create competition' });
    });

    it('passes scheduled_start to insert when provided', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock({ data: { id: 'c1' }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? rateLimitChain : insertChain;
      });

      const scheduledStart = '2026-03-01T12:00:00Z';
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test', scheduled_start: scheduledStart, stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ scheduled_start: scheduledStart })
      );
    });

    it('sets scheduled_start to null when not provided', async () => {
      const rateLimitChain = createChainMock({ data: null, error: null, count: 0 });
      const insertChain = createChainMock({ data: { id: 'c1' }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? rateLimitChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        body: { name: 'Test', stake_mode: 'sandbox', entry_fee: 0, max_participants: 8 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ scheduled_start: null })
      );
    });
  });

  // ========================================================================
  // POST /:id/join
  // ========================================================================

  describe('POST /:id/join', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/:id/join') as (...args: unknown[]) => Promise<void>;
    });

    it('joins competition successfully with 201', async () => {
      const participant = { id: 'p1', competition_id: 'comp-1', agent_id: 'agent-1' };

      // Service client: competition lookup
      const compChain = createChainMock({
        data: {
          id: 'comp-1',
          status: 'lobby',
          max_participants: 8,
          participant_count: [{ count: 2 }],
        },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      // User client: agent ownership + insert
      const agentChain = createChainMock({
        data: {
          id: 'agent-1',
          owner_id: 'user-1',
          is_active: true,
          verification_status: 'verified',
          last_verified_at: new Date().toISOString(),
        },
        error: null,
      });
      const insertChain = createChainMock({ data: participant, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? agentChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(participant);
    });

    it('returns 400 when agent_id is missing', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: {},
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent ID is required' });
    });

    it('returns 404 when competition not found', async () => {
      const compChain = createChainMock({ data: null, error: null });
      mockServiceFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'nonexistent' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition not found' });
    });

    it('returns 400 when competition is not in lobby', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'running', max_participants: 8, participant_count: [{ count: 2 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition is not accepting participants' });
    });

    it('returns 400 when competition is full', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 2, participant_count: [{ count: 2 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition is full' });
    });

    it('returns 403 when agent not owned by user', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: [{ count: 1 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const agentChain = createChainMock({
        data: { id: 'agent-1', owner_id: 'other-user', is_active: true, verification_status: 'verified', last_verified_at: new Date().toISOString() },
        error: null,
      });
      mockUserFrom.mockImplementation(() => agentChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized to use this agent' });
    });

    it('returns 403 when agent is null (not found)', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: [{ count: 1 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const agentChain = createChainMock({ data: null, error: null });
      mockUserFrom.mockImplementation(() => agentChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized to use this agent' });
    });

    it('returns 400 when agent is not active', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: [{ count: 1 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const agentChain = createChainMock({
        data: { id: 'agent-1', owner_id: 'user-1', is_active: false, verification_status: 'verified', last_verified_at: new Date().toISOString() },
        error: null,
      });
      mockUserFrom.mockImplementation(() => agentChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent is not active' });
    });

    it('returns 403 when agent verification status is not verified', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: [{ count: 1 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const agentChain = createChainMock({
        data: { id: 'agent-1', owner_id: 'user-1', is_active: true, verification_status: 'pending', last_verified_at: new Date().toISOString() },
        error: null,
      });
      mockUserFrom.mockImplementation(() => agentChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Agent must pass verification before joining competitions',
        verification_required: true,
      });
    });

    it('returns 403 when agent verification has expired (>24h)', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: [{ count: 1 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const expired = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
      const agentChain = createChainMock({
        data: { id: 'agent-1', owner_id: 'user-1', is_active: true, verification_status: 'verified', last_verified_at: expired },
        error: null,
      });
      mockUserFrom.mockImplementation(() => agentChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Agent must pass verification before joining competitions',
        verification_required: true,
      });
    });

    it('returns 403 when last_verified_at is null', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: [{ count: 1 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const agentChain = createChainMock({
        data: { id: 'agent-1', owner_id: 'user-1', is_active: true, verification_status: 'verified', last_verified_at: null },
        error: null,
      });
      mockUserFrom.mockImplementation(() => agentChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Agent must pass verification before joining competitions',
        verification_required: true,
      });
    });

    it('returns 400 on duplicate join (23505)', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: [{ count: 1 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const agentChain = createChainMock({
        data: { id: 'agent-1', owner_id: 'user-1', is_active: true, verification_status: 'verified', last_verified_at: new Date().toISOString() },
        error: null,
      });
      const insertChain = createChainMock({ data: null, error: { code: '23505', message: 'duplicate key' } });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? agentChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Already joined with this agent' });
    });

    it('returns 500 on non-duplicate DB insert error', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: [{ count: 1 }] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const agentChain = createChainMock({
        data: { id: 'agent-1', owner_id: 'user-1', is_active: true, verification_status: 'verified', last_verified_at: new Date().toISOString() },
        error: null,
      });
      const insertChain = createChainMock();
      insertChain.then = (resolve: (val: unknown) => void) =>
        resolve({ data: null, error: { code: 'XXXXX', message: 'Some error' } });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? agentChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to join competition' });
    });

    it('handles empty participant_count array (0 participants)', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: [] },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const agentChain = createChainMock({
        data: { id: 'agent-1', owner_id: 'user-1', is_active: true, verification_status: 'verified', last_verified_at: new Date().toISOString() },
        error: null,
      });
      const insertChain = createChainMock({ data: { id: 'p1' }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? agentChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('handles non-array participant_count (0 participants)', async () => {
      const compChain = createChainMock({
        data: { id: 'comp-1', status: 'lobby', max_participants: 8, participant_count: 5 },
        error: null,
      });
      mockServiceFrom.mockImplementation(() => compChain);

      const agentChain = createChainMock({
        data: { id: 'agent-1', owner_id: 'user-1', is_active: true, verification_status: 'verified', last_verified_at: new Date().toISOString() },
        error: null,
      });
      const insertChain = createChainMock({ data: { id: 'p1' }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? agentChain : insertChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      // non-array participant_count = 0, so not full
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // ========================================================================
  // DELETE /:id/leave
  // ========================================================================

  describe('DELETE /:id/leave', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'delete', '/:id/leave') as (...args: unknown[]) => Promise<void>;
    });

    it('leaves competition successfully with 204', async () => {
      const compChain = createChainMock({ data: { status: 'lobby' }, error: null });
      mockServiceFrom.mockImplementation(() => compChain);

      const deleteChain = createChainMock({ data: null, error: null });
      mockUserFrom.mockImplementation(() => deleteChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('returns 404 when competition not found', async () => {
      const compChain = createChainMock({ data: null, error: null });
      mockServiceFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'nonexistent' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition not found' });
    });

    it('returns 400 when competition is not in lobby', async () => {
      const compChain = createChainMock({ data: { status: 'running' }, error: null });
      mockServiceFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot leave a competition that has started' });
    });

    it('returns 400 when competition status is completed', async () => {
      const compChain = createChainMock({ data: { status: 'completed' }, error: null });
      mockServiceFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot leave a competition that has started' });
    });

    it('returns 500 on delete error', async () => {
      const compChain = createChainMock({ data: { status: 'lobby' }, error: null });
      mockServiceFrom.mockImplementation(() => compChain);

      const deleteChain = createChainMock();
      deleteChain.then = (resolve: (val: unknown) => void) =>
        resolve({ error: { message: 'Delete failed' } });
      mockUserFrom.mockImplementation(() => deleteChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to leave competition' });
    });
  });

  // ========================================================================
  // POST /:id/start
  // ========================================================================

  describe('POST /:id/start', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/:id/start') as (...args: unknown[]) => Promise<void>;
    });

    it('starts competition successfully', async () => {
      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'user-1',
        domain_id: 'dom-1',
        task_ids: ['t1'],
        max_participants: 8,
        participant_count: [{ count: 3 }],
      };

      const compChain = createChainMock({ data: competition, error: null });
      const updateChain = createChainMock({ data: { ...competition, status: 'running' }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? compChain : updateChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'comp-1' }));
      expect(mockCompetitionManager.startCompetition).toHaveBeenCalledWith('comp-1', { taskIds: ['t1'] });
    });

    it('returns 404 when competition not found', async () => {
      const compChain = createChainMock({ data: null, error: null });
      mockUserFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'nonexistent' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition not found' });
    });

    it('returns 403 when user is not the creator', async () => {
      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'other-user',
        participant_count: [{ count: 3 }],
      };
      const compChain = createChainMock({ data: competition, error: null });
      mockUserFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only the creator can start the competition' });
    });

    it('returns 400 when competition is not in lobby', async () => {
      const competition = {
        id: 'comp-1',
        status: 'running',
        created_by: 'user-1',
        participant_count: [{ count: 3 }],
      };
      const compChain = createChainMock({ data: competition, error: null });
      mockUserFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition has already started' });
    });

    it('returns 400 when less than 2 participants', async () => {
      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'user-1',
        participant_count: [{ count: 1 }],
      };
      const compChain = createChainMock({ data: competition, error: null });
      mockUserFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Need at least 2 participants to start' });
    });

    it('returns 400 when 0 participants', async () => {
      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'user-1',
        participant_count: [{ count: 0 }],
      };
      const compChain = createChainMock({ data: competition, error: null });
      mockUserFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Need at least 2 participants to start' });
    });

    it('returns 400 when participant_count is empty array', async () => {
      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'user-1',
        participant_count: [],
      };
      const compChain = createChainMock({ data: competition, error: null });
      mockUserFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Need at least 2 participants to start' });
    });

    it('returns 429 when concurrency limit reached', async () => {
      mockCompetitionManager.activeCount = 10; // Default MAX_CONCURRENT = 10

      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'user-1',
        participant_count: [{ count: 4 }],
      };
      const compChain = createChainMock({ data: competition, error: null });
      mockUserFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Server is at capacity (10/10 competitions running). Please try again later.',
      });
    });

    it('returns 409 when atomic update returns no data (already started)', async () => {
      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'user-1',
        participant_count: [{ count: 3 }],
      };
      const compChain = createChainMock({ data: competition, error: null });
      const updateChain = createChainMock({ data: null, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? compChain : updateChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Competition has already been started' });
    });

    it('handles fire-and-forget error: startCompetition rejects and reverts status', async () => {
      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'user-1',
        task_ids: ['t1'],
        participant_count: [{ count: 3 }],
      };
      const compChain = createChainMock({ data: competition, error: null });
      const updateChain = createChainMock({ data: { ...competition, status: 'running', task_ids: ['t1'] }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? compChain : updateChain;
      });

      // startCompetition rejects
      const rejectError = new Error('Orchestrator failed');
      mockCompetitionManager.startCompetition.mockRejectedValue(rejectError);

      // serviceClient.from should be called to revert
      const revertChain = createChainMock({ data: null, error: null });
      mockServiceFrom.mockImplementation(() => revertChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      // The response should still be success (fire-and-forget)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'comp-1' }));

      // Wait for the catch handler to execute
      await new Promise(resolve => setTimeout(resolve, 50));

      // Service client should have been called to revert status
      expect(mockServiceFrom).toHaveBeenCalledWith('aio_competitions');
    });

    it('returns 500 on unexpected error', async () => {
      const throwChain = createChainMock();
      throwChain.then = () => { throw new Error('Unexpected'); };
      mockUserFrom.mockImplementation(() => throwChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to start competition' });
    });

    it('handles non-array participant_count as 0', async () => {
      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'user-1',
        participant_count: 5, // non-array
      };
      const compChain = createChainMock({ data: competition, error: null });
      mockUserFrom.mockImplementation(() => compChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      // non-array = 0 participants, so should get "Need at least 2"
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Need at least 2 participants to start' });
    });

    it('allows exactly 2 participants', async () => {
      const competition = {
        id: 'comp-1',
        status: 'lobby',
        created_by: 'user-1',
        task_ids: null,
        participant_count: [{ count: 2 }],
      };
      const compChain = createChainMock({ data: competition, error: null });
      const updateChain = createChainMock({ data: { ...competition, status: 'running' }, error: null });

      let userCallCount = 0;
      mockUserFrom.mockImplementation(() => {
        userCallCount++;
        return userCallCount === 1 ? compChain : updateChain;
      });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'comp-1' }));
    });
  });

  // ========================================================================
  // GET /:id/live
  // ========================================================================

  describe('GET /:id/live', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id/live') as (...args: unknown[]) => Promise<void>;
    });

    it('returns live state when active competition exists', async () => {
      const mockController = {
        getCompetition: vi.fn().mockReturnValue({
          id: 'comp-1',
          name: 'Live Test',
          status: 'running',
          currentEventIndex: 2,
          events: [
            { id: 'e1', task: { name: 'Task 1' }, status: 'completed', results: [1, 2] },
            { id: 'e2', task: { name: 'Task 2' }, status: 'running', results: [] },
          ],
        }),
        getLeaderboard: vi.fn().mockReturnValue([
          { agentId: 'a1', score: 100 },
          { agentId: 'a2', score: 80 },
        ]),
      };
      mockCompetitionManager.getActiveCompetition.mockReturnValue(mockController);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockCompetitionManager.getActiveCompetition).toHaveBeenCalledWith('comp-1');
      expect(res.json).toHaveBeenCalledWith({
        id: 'comp-1',
        name: 'Live Test',
        status: 'running',
        currentEventIndex: 2,
        leaderboard: [
          { agentId: 'a1', score: 100 },
          { agentId: 'a2', score: 80 },
        ],
        events: [
          { id: 'e1', taskName: 'Task 1', status: 'completed', resultCount: 2 },
          { id: 'e2', taskName: 'Task 2', status: 'running', resultCount: 0 },
        ],
      });
    });

    it('returns 404 when no active competition', async () => {
      mockCompetitionManager.getActiveCompetition.mockReturnValue(null);

      const req = createMockReq({ params: { id: 'nonexistent' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'No active competition with this ID' });
    });

    it('returns 404 when controller returns undefined', async () => {
      mockCompetitionManager.getActiveCompetition.mockReturnValue(undefined);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'No active competition with this ID' });
    });

    it('returns 500 on error', async () => {
      mockCompetitionManager.getActiveCompetition.mockImplementation(() => {
        throw new Error('Internal error');
      });

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get live state' });
    });

    it('converts id param to string', async () => {
      mockCompetitionManager.getActiveCompetition.mockReturnValue(null);

      const req = createMockReq({ params: { id: '123' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockCompetitionManager.getActiveCompetition).toHaveBeenCalledWith('123');
    });
  });

  // ========================================================================
  // POST /:id/vote
  // ========================================================================

  describe('POST /:id/vote', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/:id/vote') as (...args: unknown[]) => Promise<void>;
    });

    it('casts vote successfully with 201', async () => {
      const vote = { id: 'v1', competition_id: 'comp-1', agent_id: 'a1', vote_type: 'cheer' };
      const insertChain = createChainMock({ data: vote, error: null });
      mockUserFrom.mockImplementation(() => insertChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'a1', vote_type: 'cheer' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(vote);
    });

    it('casts predict_win vote', async () => {
      const vote = { id: 'v2', vote_type: 'predict_win' };
      const insertChain = createChainMock({ data: vote, error: null });
      mockUserFrom.mockImplementation(() => insertChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'a1', vote_type: 'predict_win' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('casts mvp vote', async () => {
      const vote = { id: 'v3', vote_type: 'mvp' };
      const insertChain = createChainMock({ data: vote, error: null });
      mockUserFrom.mockImplementation(() => insertChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'a1', vote_type: 'mvp' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 400 when agent_id is missing', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { vote_type: 'cheer' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'agent_id and vote_type are required' });
    });

    it('returns 400 when vote_type is missing', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'agent_id and vote_type are required' });
    });

    it('returns 400 when both agent_id and vote_type are missing', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: {},
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'agent_id and vote_type are required' });
    });

    it('returns 400 for invalid vote_type', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'a1', vote_type: 'invalid' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'vote_type must be cheer, predict_win, or mvp' });
    });

    it('returns 409 on duplicate vote (23505)', async () => {
      const insertChain = createChainMock({ data: null, error: { code: '23505', message: 'duplicate' } });
      mockUserFrom.mockImplementation(() => insertChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'a1', vote_type: 'cheer' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'You have already cast this vote type in this competition' });
    });

    it('returns 500 on non-duplicate DB error', async () => {
      const insertChain = createChainMock();
      insertChain.then = (resolve: (val: unknown) => void) =>
        resolve({ data: null, error: { code: 'XXXXX', message: 'Error' } });
      mockUserFrom.mockImplementation(() => insertChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        body: { agent_id: 'a1', vote_type: 'cheer' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to cast vote' });
    });
  });

  // ========================================================================
  // GET /:id/votes
  // ========================================================================

  describe('GET /:id/votes', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id/votes') as (...args: unknown[]) => Promise<void>;
    });

    it('aggregates votes correctly', async () => {
      const votes = [
        { agent_id: 'a1', vote_type: 'cheer' },
        { agent_id: 'a1', vote_type: 'cheer' },
        { agent_id: 'a1', vote_type: 'predict_win' },
        { agent_id: 'a2', vote_type: 'mvp' },
        { agent_id: 'a2', vote_type: 'cheer' },
      ];
      serviceChain = createChainMock({ data: votes, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        a1: { cheers: 2, predict_win: 1, mvp: 0 },
        a2: { cheers: 1, predict_win: 0, mvp: 1 },
      });
    });

    it('returns empty object for no votes', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({});
    });

    it('returns empty object when data is null', async () => {
      serviceChain = createChainMock({ data: null, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({});
    });

    it('handles multiple agents with multiple vote types', async () => {
      const votes = [
        { agent_id: 'a1', vote_type: 'cheer' },
        { agent_id: 'a2', vote_type: 'predict_win' },
        { agent_id: 'a3', vote_type: 'mvp' },
        { agent_id: 'a1', vote_type: 'mvp' },
        { agent_id: 'a2', vote_type: 'cheer' },
        { agent_id: 'a3', vote_type: 'cheer' },
      ];
      serviceChain = createChainMock({ data: votes, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        a1: { cheers: 1, predict_win: 0, mvp: 1 },
        a2: { cheers: 1, predict_win: 1, mvp: 0 },
        a3: { cheers: 1, predict_win: 0, mvp: 1 },
      });
    });

    it('ignores unknown vote_type', async () => {
      const votes = [
        { agent_id: 'a1', vote_type: 'cheer' },
        { agent_id: 'a1', vote_type: 'unknown_type' },
      ];
      serviceChain = createChainMock({ data: votes, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        a1: { cheers: 1, predict_win: 0, mvp: 0 },
      });
    });

    it('returns 500 on DB error', async () => {
      serviceChain = createChainMock();
      serviceChain.then = (resolve: (val: unknown) => void) =>
        resolve({ data: null, error: { message: 'DB error' } });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq({ params: { id: 'comp-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get votes' });
    });
  });

  // ========================================================================
  // DELETE /:id/vote
  // ========================================================================

  describe('DELETE /:id/vote', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'delete', '/:id/vote') as (...args: unknown[]) => Promise<void>;
    });

    it('removes vote successfully with 204', async () => {
      const deleteChain = createChainMock({ data: null, error: null });
      mockUserFrom.mockImplementation(() => deleteChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        query: { vote_type: 'cheer' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('removes predict_win vote', async () => {
      const deleteChain = createChainMock({ data: null, error: null });
      mockUserFrom.mockImplementation(() => deleteChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        query: { vote_type: 'predict_win' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('removes mvp vote', async () => {
      const deleteChain = createChainMock({ data: null, error: null });
      mockUserFrom.mockImplementation(() => deleteChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        query: { vote_type: 'mvp' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('returns 400 when vote_type is missing', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        query: {},
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'vote_type must be cheer, predict_win, or mvp' });
    });

    it('returns 400 for invalid vote_type', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        query: { vote_type: 'invalid' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'vote_type must be cheer, predict_win, or mvp' });
    });

    it('returns 500 on DB error', async () => {
      const deleteChain = createChainMock();
      deleteChain.then = (resolve: (val: unknown) => void) =>
        resolve({ error: { message: 'Delete failed' } });
      mockUserFrom.mockImplementation(() => deleteChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserFrom },
        params: { id: 'comp-1' },
        query: { vote_type: 'cheer' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to remove vote' });
    });
  });

  // ========================================================================
  // GET /domains/list
  // ========================================================================

  describe('GET /domains/list', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/domains/list') as (...args: unknown[]) => Promise<void>;
    });

    it('returns domains list', async () => {
      const domains = [
        { id: 'd1', name: 'Coding', slug: 'coding', description: 'Code tasks', icon: 'code' },
        { id: 'd2', name: 'Trading', slug: 'trading', description: 'Trading tasks', icon: 'chart' },
      ];
      serviceChain = createChainMock({ data: domains, error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(mockServiceFrom).toHaveBeenCalledWith('aio_domains');
      expect(res.json).toHaveBeenCalledWith(domains);
    });

    it('returns empty array when no domains', async () => {
      serviceChain = createChainMock({ data: [], error: null });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns 500 on DB error', async () => {
      serviceChain = createChainMock();
      serviceChain.then = (resolve: (val: unknown) => void) =>
        resolve({ data: null, error: { message: 'DB error' } });
      mockServiceFrom.mockImplementation(() => serviceChain);

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list domains' });
    });

    it('returns 500 on thrown exception', async () => {
      const throwChain = createChainMock();
      throwChain.then = () => { throw new Error('Unexpected'); };
      mockServiceFrom.mockImplementation(() => throwChain);

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list domains' });
    });
  });
});
