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
    user: { id: 'admin-user-id', is_admin: true },
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
// Supabase chainable query builder mock
// ---------------------------------------------------------------------------

function mockSupabaseChain(
  resolvedValue: { data?: unknown; error?: unknown; count?: unknown } = {
    data: null,
    error: null,
    count: 0,
  },
) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'like', 'ilike', 'in', 'is', 'or', 'and',
    'order', 'range', 'limit', 'single', 'maybeSingle',
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  // Make it thenable so await works
  chain.then = (resolve: (v: unknown) => void) => resolve(resolvedValue);
  return chain;
}

// We keep references we can swap per-test
let currentChain: ReturnType<typeof mockSupabaseChain>;
let mockFrom: ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

vi.mock('../../shared/utils/supabase.js', () => {
  const fromFn = vi.fn().mockImplementation(() => currentChain);
  mockFrom = fromFn;
  return {
    serviceClient: { from: fromFn },
    createUserClient: vi.fn(),
    extractToken: vi.fn(),
  };
});

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => {
    (_req as Record<string, unknown>).user = {
      id: 'admin-user-id',
      is_admin: true,
    };
    next();
  }),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  AuthenticatedRequest: {},
}));

vi.mock('../middleware/validate.js', () => ({
  validateBody: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
}));

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../schemas.js', () => ({
  updateUserSchema: {},
  reviewAgentSchema: {},
  updateCompetitionStatusSchema: {},
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

function getRouteHandler(
  router: RouterStack,
  method: string,
  path: string,
) {
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

// ============================================================================
// ADMIN ROUTE TESTS
// ============================================================================

describe('Admin Routes', () => {
  let adminRouter: RouterStack;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentChain = mockSupabaseChain();
    const mod = await import('./admin.js');
    adminRouter = mod.default as unknown as RouterStack;
  });

  // ==========================================================================
  // GET /stats
  // ==========================================================================

  describe('GET /stats', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(adminRouter, 'get', '/stats') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns all four stat counts on success', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 42 }),   // aio_profiles
        mockSupabaseChain({ data: null, error: null, count: 15 }),   // aio_agents
        mockSupabaseChain({ data: null, error: null, count: 8 }),    // aio_competitions
        mockSupabaseChain({ data: null, error: null, count: 3 }),    // aio_agents (pending)
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
        totalUsers: 42,
        totalAgents: 15,
        totalCompetitions: 8,
        pendingAgents: 3,
      });
    });

    it('queries correct tables in parallel', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 0 }),
        mockSupabaseChain({ data: null, error: null, count: 0 }),
        mockSupabaseChain({ data: null, error: null, count: 0 }),
        mockSupabaseChain({ data: null, error: null, count: 0 }),
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledTimes(4);
      expect(mockFrom).toHaveBeenNthCalledWith(1, 'aio_profiles');
      expect(mockFrom).toHaveBeenNthCalledWith(2, 'aio_agents');
      expect(mockFrom).toHaveBeenNthCalledWith(3, 'aio_competitions');
      expect(mockFrom).toHaveBeenNthCalledWith(4, 'aio_agents');
    });

    it('uses count-only queries with head: true', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 0 }),
        mockSupabaseChain({ data: null, error: null, count: 0 }),
        mockSupabaseChain({ data: null, error: null, count: 0 }),
        mockSupabaseChain({ data: null, error: null, count: 0 }),
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      // All four selects should use head: true for count-only queries
      for (const chain of chains) {
        expect(chain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
      }
    });

    it('filters pending agents by approval_status', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 0 }),
        mockSupabaseChain({ data: null, error: null, count: 0 }),
        mockSupabaseChain({ data: null, error: null, count: 0 }),
        mockSupabaseChain({ data: null, error: null, count: 0 }),
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      // Only the 4th chain (pending agents) should have .eq called
      expect(chains[0].eq).not.toHaveBeenCalled();
      expect(chains[1].eq).not.toHaveBeenCalled();
      expect(chains[2].eq).not.toHaveBeenCalled();
      expect(chains[3].eq).toHaveBeenCalledWith('approval_status', 'pending_review');
    });

    it('defaults null counts to 0', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null, count: null }),
        mockSupabaseChain({ data: null, error: null, count: null }),
        mockSupabaseChain({ data: null, error: null, count: null }),
        mockSupabaseChain({ data: null, error: null, count: null }),
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
        totalUsers: 0,
        totalAgents: 0,
        totalCompetitions: 0,
        pendingAgents: 0,
      });
    });

    it('defaults undefined counts to 0', async () => {
      let callIndex = 0;
      const chains = [
        mockSupabaseChain({ data: null, error: null }),
        mockSupabaseChain({ data: null, error: null }),
        mockSupabaseChain({ data: null, error: null }),
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

      expect(res.json).toHaveBeenCalledWith({
        totalUsers: 0,
        totalAgents: 0,
        totalCompetitions: 0,
        pendingAgents: 0,
      });
    });

    it('returns 500 on database error', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('DB connection failed');
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch stats' });
    });

    it('returns 500 when Promise.all rejects', async () => {
      let callIndex = 0;
      const failingChain: Record<string, unknown> = {};
      failingChain.select = vi.fn().mockReturnValue(failingChain);
      failingChain.eq = vi.fn().mockReturnValue(failingChain);
      failingChain.then = (_resolve: unknown, reject: (e: Error) => void) =>
        reject(new Error('Query timeout'));

      const chains = [
        mockSupabaseChain({ data: null, error: null, count: 5 }),
        failingChain,
        mockSupabaseChain({ data: null, error: null, count: 3 }),
        mockSupabaseChain({ data: null, error: null, count: 1 }),
      ];
      mockFrom.mockImplementation(() => {
        const chain = chains[callIndex];
        callIndex++;
        return chain;
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch stats' });
    });
  });

  // ==========================================================================
  // GET /users
  // ==========================================================================

  describe('GET /users', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(adminRouter, 'get', '/users') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns users with default pagination (page 1, limit 25)', async () => {
      const users = [
        { id: '1', username: 'alice', display_name: 'Alice' },
        { id: '2', username: 'bob', display_name: 'Bob' },
      ];
      currentChain = mockSupabaseChain({ data: users, error: null, count: 2 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        users,
        total: 2,
        page: 1,
        limit: 25,
      });
    });

    it('uses custom page and limit from query params', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { page: '3', limit: '10' } });
      const res = createMockRes();

      await handler(req, res);

      // page=3, limit=10, offset=(3-1)*10=20, range(20, 29)
      expect(currentChain.range).toHaveBeenCalledWith(20, 29);
      expect(res.json).toHaveBeenCalledWith({
        users: [],
        total: 0,
        page: 3,
        limit: 10,
      });
    });

    it('clamps limit to max 100', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { limit: '500' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.limit).toBe(100);
    });

    it('clamps limit to min 1', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { limit: '-5' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.limit).toBe(1);
    });

    it('clamps page to min 1', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { page: '-3' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.page).toBe(1);
    });

    it('applies search filter with .or() when search is present', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { search: 'alice' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.or).toHaveBeenCalledWith(
        'username.ilike.%alice%,display_name.ilike.%alice%',
      );
    });

    it('sanitizes search query by removing special characters', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { search: 'al%ice_.(bob),test' } });
      const res = createMockRes();

      await handler(req, res);

      // %_,.() are all removed
      expect(currentChain.or).toHaveBeenCalledWith(
        'username.ilike.%alicebobtest%,display_name.ilike.%alicebobtest%',
      );
    });

    it('does not call .or() when search is empty string', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { search: '' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.or).not.toHaveBeenCalled();
    });

    it('does not call .or() when search is whitespace only', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { search: '   ' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.or).not.toHaveBeenCalled();
    });

    it('does not call .or() when search is not provided', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.or).not.toHaveBeenCalled();
    });

    it('orders by created_at descending', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('queries aio_profiles table', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledWith('aio_profiles');
    });

    it('selects correct columns with count', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.select).toHaveBeenCalledWith(
        'id, username, display_name, avatar_url, is_verified, is_admin, wallet_balance, created_at',
        { count: 'exact' },
      );
    });

    it('returns empty users array when data is null', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.users).toEqual([]);
    });

    it('returns total 0 when count is null', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.total).toBe(0);
    });

    it('throws on Supabase error, returns 500', async () => {
      currentChain = mockSupabaseChain({
        data: null,
        error: new Error('DB error'),
        count: null,
      });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch users' });
    });

    it('returns 500 on unexpected exception', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch users' });
    });

    it('defaults non-numeric page to 1', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { page: 'abc' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.page).toBe(1);
    });

    it('defaults non-numeric limit to 25', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { limit: 'xyz' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.limit).toBe(25);
    });

    it('calculates offset correctly for page 2', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { page: '2', limit: '25' } });
      const res = createMockRes();

      await handler(req, res);

      // offset = (2-1)*25 = 25, range(25, 49)
      expect(currentChain.range).toHaveBeenCalledWith(25, 49);
    });
  });

  // ==========================================================================
  // PATCH /users/:id
  // ==========================================================================

  describe('PATCH /users/:id', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(adminRouter, 'patch', '/users/:id') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('updates is_admin field only', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'user-1' },
        body: { is_admin: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({ is_admin: true });
      expect(currentChain.eq).toHaveBeenCalledWith('id', 'user-1');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('updates is_verified field only', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'user-2' },
        body: { is_verified: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({ is_verified: true });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('updates both is_admin and is_verified', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'user-3' },
        body: { is_admin: false, is_verified: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({
        is_admin: false,
        is_verified: true,
      });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 400 when no valid fields provided', async () => {
      const req = createMockReq({
        params: { id: 'user-4' },
        body: {},
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No valid fields to update',
      });
    });

    it('ignores non-boolean is_admin (string)', async () => {
      const req = createMockReq({
        params: { id: 'user-5' },
        body: { is_admin: 'true' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No valid fields to update',
      });
    });

    it('ignores non-boolean is_verified (number)', async () => {
      const req = createMockReq({
        params: { id: 'user-6' },
        body: { is_verified: 1 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No valid fields to update',
      });
    });

    it('ignores non-boolean is_admin but accepts valid is_verified', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'user-7' },
        body: { is_admin: 'yes', is_verified: false },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({ is_verified: false });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('ignores unknown fields', async () => {
      const req = createMockReq({
        params: { id: 'user-8' },
        body: { username: 'hacker', role: 'superadmin' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No valid fields to update',
      });
    });

    it('queries aio_profiles table', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'user-1' },
        body: { is_admin: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledWith('aio_profiles');
    });

    it('returns 500 on database error', async () => {
      currentChain = mockSupabaseChain({
        data: null,
        error: new Error('Update failed'),
      });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'user-1' },
        body: { is_admin: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update user' });
    });

    it('returns 500 on unexpected exception', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      const req = createMockReq({
        params: { id: 'user-1' },
        body: { is_admin: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update user' });
    });

    it('handles false boolean values correctly', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'user-9' },
        body: { is_admin: false, is_verified: false },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({
        is_admin: false,
        is_verified: false,
      });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // ==========================================================================
  // GET /agents
  // ==========================================================================

  describe('GET /agents', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(adminRouter, 'get', '/agents') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('defaults status to pending_review', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.eq).toHaveBeenCalledWith('approval_status', 'pending_review');
    });

    it('uses custom status filter', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { status: 'approved' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.eq).toHaveBeenCalledWith('approval_status', 'approved');
    });

    it('skips status filter when status is "all"', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { status: 'all' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.eq).not.toHaveBeenCalled();
    });

    it('returns agents with default pagination', async () => {
      const agents = [
        { id: 'a1', name: 'TestAgent', approval_status: 'pending_review' },
      ];
      currentChain = mockSupabaseChain({ data: agents, error: null, count: 1 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        agents,
        total: 1,
        page: 1,
        limit: 25,
      });
    });

    it('applies custom pagination', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { page: '2', limit: '10' } });
      const res = createMockRes();

      await handler(req, res);

      // offset = (2-1)*10 = 10, range(10, 19)
      expect(currentChain.range).toHaveBeenCalledWith(10, 19);
      expect(res.json).toHaveBeenCalledWith({
        agents: [],
        total: 0,
        page: 2,
        limit: 10,
      });
    });

    it('clamps limit to max 100', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { limit: '999' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.limit).toBe(100);
    });

    it('queries aio_agents table with join', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledWith('aio_agents');
      expect(currentChain.select).toHaveBeenCalledWith(
        expect.stringContaining('owner:aio_profiles!owner_id(id, username, display_name)'),
        { count: 'exact' },
      );
    });

    it('orders by created_at descending', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('returns empty agents array when data is null', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.agents).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      currentChain = mockSupabaseChain({
        data: null,
        error: new Error('DB error'),
        count: null,
      });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch agents' });
    });

    it('returns 500 on unexpected exception', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch agents' });
    });

    it('uses rejected status filter', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { status: 'rejected' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.eq).toHaveBeenCalledWith('approval_status', 'rejected');
    });
  });

  // ==========================================================================
  // POST /agents/:id/review
  // ==========================================================================

  describe('POST /agents/:id/review', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(adminRouter, 'post', '/agents/:id/review') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('approves agent with correct update payload', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'agent-1' },
        body: { approved: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          approval_status: 'approved',
          approval_note: null,
          reviewed_by: 'admin-user-id',
        }),
      );
      expect(currentChain.eq).toHaveBeenCalledWith('id', 'agent-1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        status: 'approved',
      });
    });

    it('rejects agent with note', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'agent-2' },
        body: { approved: false, note: 'Does not meet guidelines' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          approval_status: 'rejected',
          approval_note: 'Does not meet guidelines',
          reviewed_by: 'admin-user-id',
        }),
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        status: 'rejected',
      });
    });

    it('rejects agent without note (note defaults to null)', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'agent-3' },
        body: { approved: false },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          approval_status: 'rejected',
          approval_note: null,
        }),
      );
    });

    it('sets reviewed_at to current timestamp', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const before = new Date().toISOString();

      const req = createMockReq({
        params: { id: 'agent-4' },
        body: { approved: true },
      });
      const res = createMockRes();

      await handler(req, res);

      const after = new Date().toISOString();
      const updateCall = (currentChain.update as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(updateCall.reviewed_at).toBeDefined();
      expect(updateCall.reviewed_at >= before).toBe(true);
      expect(updateCall.reviewed_at <= after).toBe(true);
    });

    it('returns 400 when approved is not a boolean', async () => {
      const req = createMockReq({
        params: { id: 'agent-5' },
        body: { approved: 'yes' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'approved field (boolean) is required',
      });
    });

    it('returns 400 when approved is missing', async () => {
      const req = createMockReq({
        params: { id: 'agent-6' },
        body: {},
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'approved field (boolean) is required',
      });
    });

    it('returns 400 when approved is a number', async () => {
      const req = createMockReq({
        params: { id: 'agent-7' },
        body: { approved: 1 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'approved field (boolean) is required',
      });
    });

    it('queries aio_agents table', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'agent-1' },
        body: { approved: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledWith('aio_agents');
    });

    it('returns 500 on database error', async () => {
      currentChain = mockSupabaseChain({
        data: null,
        error: new Error('Update failed'),
      });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'agent-1' },
        body: { approved: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to review agent',
      });
    });

    it('returns 500 on unexpected exception', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      const req = createMockReq({
        params: { id: 'agent-1' },
        body: { approved: true },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to review agent',
      });
    });

    it('uses adminUser.id for reviewed_by from request user', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'agent-1' },
        body: { approved: true },
        user: { id: 'specific-admin-id', is_admin: true },
      });
      const res = createMockRes();

      await handler(req, res);

      const updateCall = (currentChain.update as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(updateCall.reviewed_by).toBe('specific-admin-id');
    });
  });

  // ==========================================================================
  // GET /competitions
  // ==========================================================================

  describe('GET /competitions', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(adminRouter, 'get', '/competitions') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns competitions with default pagination', async () => {
      const competitions = [
        { id: 'c1', name: 'Test Comp', status: 'lobby' },
      ];
      currentChain = mockSupabaseChain({
        data: competitions,
        error: null,
        count: 1,
      });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        competitions,
        total: 1,
        page: 1,
        limit: 25,
      });
    });

    it('does not apply status filter when no status query param', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.eq).not.toHaveBeenCalled();
    });

    it('applies status filter when status param provided', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { status: 'running' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.eq).toHaveBeenCalledWith('status', 'running');
    });

    it('applies custom pagination', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { page: '3', limit: '5' } });
      const res = createMockRes();

      await handler(req, res);

      // offset = (3-1)*5 = 10, range(10, 14)
      expect(currentChain.range).toHaveBeenCalledWith(10, 14);
      expect(res.json).toHaveBeenCalledWith({
        competitions: [],
        total: 0,
        page: 3,
        limit: 5,
      });
    });

    it('clamps limit to max 100', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { limit: '200' } });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.limit).toBe(100);
    });

    it('queries aio_competitions table with joins', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledWith('aio_competitions');
      expect(currentChain.select).toHaveBeenCalledWith(
        expect.stringContaining('domain:aio_domains(name, slug)'),
        { count: 'exact' },
      );
      expect(currentChain.select).toHaveBeenCalledWith(
        expect.stringContaining('creator:aio_profiles!created_by(username, display_name)'),
        { count: 'exact' },
      );
    });

    it('orders by created_at descending', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('returns empty competitions array when data is null', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.competitions).toEqual([]);
    });

    it('returns total 0 when count is null', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.total).toBe(0);
    });

    it('returns 500 on database error', async () => {
      currentChain = mockSupabaseChain({
        data: null,
        error: new Error('DB error'),
        count: null,
      });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to fetch competitions',
      });
    });

    it('returns 500 on unexpected exception', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to fetch competitions',
      });
    });

    it('filters by lobby status', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { status: 'lobby' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.eq).toHaveBeenCalledWith('status', 'lobby');
    });

    it('filters by completed status', async () => {
      currentChain = mockSupabaseChain({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({ query: { status: 'completed' } });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.eq).toHaveBeenCalledWith('status', 'completed');
    });
  });

  // ==========================================================================
  // PATCH /competitions/:id
  // ==========================================================================

  describe('PATCH /competitions/:id', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(adminRouter, 'patch', '/competitions/:id') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('updates competition status to lobby', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'comp-1' },
        body: { status: 'lobby' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({ status: 'lobby' });
      expect(currentChain.eq).toHaveBeenCalledWith('id', 'comp-1');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('updates competition status to starting', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'comp-2' },
        body: { status: 'starting' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({ status: 'starting' });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('updates competition status to running', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'comp-3' },
        body: { status: 'running' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({ status: 'running' });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('updates competition status to completed', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'comp-4' },
        body: { status: 'completed' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({ status: 'completed' });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('updates competition status to cancelled', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'comp-5' },
        body: { status: 'cancelled' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(currentChain.update).toHaveBeenCalledWith({
        status: 'cancelled',
      });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 400 for invalid status', async () => {
      const req = createMockReq({
        params: { id: 'comp-6' },
        body: { status: 'invalid_status' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid status. Must be one of: lobby, starting, running, completed, cancelled',
      });
    });

    it('returns 400 for empty status', async () => {
      const req = createMockReq({
        params: { id: 'comp-7' },
        body: { status: '' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for undefined status', async () => {
      const req = createMockReq({
        params: { id: 'comp-8' },
        body: {},
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('queries aio_competitions table', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'comp-1' },
        body: { status: 'lobby' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).toHaveBeenCalledWith('aio_competitions');
    });

    it('returns 500 on database error', async () => {
      currentChain = mockSupabaseChain({
        data: null,
        error: new Error('Update failed'),
      });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'comp-1' },
        body: { status: 'lobby' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to update competition',
      });
    });

    it('returns 500 on unexpected exception', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      const req = createMockReq({
        params: { id: 'comp-1' },
        body: { status: 'lobby' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to update competition',
      });
    });

    it('returns 400 for numeric status', async () => {
      const req = createMockReq({
        params: { id: 'comp-9' },
        body: { status: 123 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for status with extra whitespace', async () => {
      const req = createMockReq({
        params: { id: 'comp-10' },
        body: { status: ' lobby ' },
      });
      const res = createMockRes();

      await handler(req, res);

      // ' lobby ' !== 'lobby', so should be 400
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('does not call update when status is invalid', async () => {
      currentChain = mockSupabaseChain({ data: null, error: null });
      mockFrom.mockReturnValue(currentChain);

      const req = createMockReq({
        params: { id: 'comp-11' },
        body: { status: 'invalid' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ROUTER STRUCTURE
  // ==========================================================================

  describe('Router Structure', () => {
    it('has all 7 expected routes', () => {
      const routes: Array<{ method: string; path: string }> = [];
      for (const layer of adminRouter.stack) {
        if (layer.route) {
          const method = Object.keys(layer.route.methods)[0];
          routes.push({ method, path: layer.route.path });
        }
      }

      expect(routes).toContainEqual({ method: 'get', path: '/stats' });
      expect(routes).toContainEqual({ method: 'get', path: '/users' });
      expect(routes).toContainEqual({ method: 'patch', path: '/users/:id' });
      expect(routes).toContainEqual({ method: 'get', path: '/agents' });
      expect(routes).toContainEqual({
        method: 'post',
        path: '/agents/:id/review',
      });
      expect(routes).toContainEqual({ method: 'get', path: '/competitions' });
      expect(routes).toContainEqual({
        method: 'patch',
        path: '/competitions/:id',
      });
    });

    it('applies requireAuth and requireAdmin as router-level middleware', () => {
      // Non-route layers are middleware applied via router.use()
      const middlewareLayers = adminRouter.stack.filter(
        (layer) => !layer.route,
      );
      // There should be at least 2 middleware layers (requireAuth, requireAdmin)
      expect(middlewareLayers.length).toBeGreaterThanOrEqual(2);
    });
  });
});
