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
    user: { id: 'user-1' },
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
let serviceChain: ReturnType<typeof mockSupabaseChain>;
let mockServiceFrom: ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Mock championship service
// ---------------------------------------------------------------------------

const mockChampionshipService = {
  createChampionship: vi.fn(),
  joinChampionship: vi.fn(),
  getStandings: vi.fn(),
  startNextRound: vi.fn(),
  processRoundResults: vi.fn(),
};

vi.mock('../../services/championship-service.js', () => ({
  championshipService: mockChampionshipService,
}));

// ---------------------------------------------------------------------------
// Mock supabase
// ---------------------------------------------------------------------------

vi.mock('../../shared/utils/supabase.js', () => {
  const fromFn = vi.fn().mockImplementation(() => serviceChain);
  mockServiceFrom = fromFn;
  return {
    serviceClient: { from: fromFn },
  };
});

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock auth middleware - sets req.user and req.userClient
// ---------------------------------------------------------------------------

let mockUserClientChain: ReturnType<typeof mockSupabaseChain>;
const mockUserClientFrom = vi.fn();

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => {
    const req = _req as Record<string, unknown>;
    req.user = { id: 'user-1' };
    req.userClient = { from: mockUserClientFrom };
    next();
  }),
  AuthenticatedRequest: {},
}));

// ---------------------------------------------------------------------------
// Mock validate middleware
// ---------------------------------------------------------------------------

vi.mock('../middleware/validate.js', () => ({
  validateBody: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
}));

// ---------------------------------------------------------------------------
// Mock schemas
// ---------------------------------------------------------------------------

vi.mock('../schemas.js', () => ({
  createChampionshipSchema: {},
  joinChampionshipSchema: {},
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
        const handlers = layer.route.stack.map((s) => s.handle);
        return handlers[handlers.length - 1];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

function getAllRouteHandlers(router: RouterStack, method: string, path: string) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routePath === path && routeMethod === method) {
        return layer.route.stack.map((s) => s.handle);
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/**
 * Run the full handler chain (middleware + route handler) sequentially.
 * Stops if any handler sends a response (calls res.json or res.status().json).
 */
async function runHandlerChain(
  handlers: Array<(...args: unknown[]) => unknown>,
  req: Record<string, unknown>,
  res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> },
) {
  for (const handler of handlers) {
    let nextCalled = false;
    await new Promise<void>((resolve, reject) => {
      const next = (err?: unknown) => {
        if (err) return reject(err);
        nextCalled = true;
        resolve();
      };
      try {
        const result = handler(req, res, next);
        if (result && typeof (result as Promise<void>).then === 'function') {
          (result as Promise<void>).then(() => {
            if (!nextCalled) resolve();
          }).catch(reject);
        } else if (!nextCalled) {
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });
    if (res.json.mock.calls.length > 0) break;
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Championships Routes', () => {
  let router: RouterStack;

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceChain = mockSupabaseChain();
    mockUserClientChain = mockSupabaseChain();
    mockUserClientFrom.mockReturnValue(mockUserClientChain);

    const mod = await import('./championships.js');
    router = mod.default as unknown as RouterStack;
  });

  // ==========================================================================
  // 1. GET / (list championships)
  // ==========================================================================

  describe('GET / (list championships)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns championships with default pagination', async () => {
      const championships = [
        { id: 'c1', name: 'Championship 1', participant_count: [{ count: 5 }] },
        { id: 'c2', name: 'Championship 2', participant_count: [{ count: 3 }] },
      ];
      serviceChain = mockSupabaseChain({ data: championships, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([
        { id: 'c1', name: 'Championship 1', participant_count: 5 },
        { id: 'c2', name: 'Championship 2', participant_count: 3 },
      ]);
    });

    it('applies status filter when provided', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: { status: 'registration' } });
      const res = createMockRes();
      await handler(req, res);

      // The chain should have eq called for status
      expect(serviceChain.eq).toHaveBeenCalledWith('status', 'registration');
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('does not apply status filter when not provided', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      // eq should only be called from the chain methods, not for status
      // Since no status filter, eq should not have been called with 'status'
      const eqCalls = (serviceChain.eq as ReturnType<typeof vi.fn>).mock.calls;
      const statusCalls = eqCalls.filter((c: unknown[]) => c[0] === 'status');
      expect(statusCalls.length).toBe(0);
    });

    it('clamps limit to max 100', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: { limit: '200' } });
      const res = createMockRes();
      await handler(req, res);

      // range should be called with offset=0 and offset+100-1=99
      expect(serviceChain.range).toHaveBeenCalledWith(0, 99);
    });

    it('clamps limit to min 1 when negative is provided', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: { limit: '-5' } });
      const res = createMockRes();
      await handler(req, res);

      // Number('-5') = -5, -5 || 50 = -5 (truthy), Math.max(1,-5) = 1, Math.min(1,100) = 1
      // range(0, 0+1-1) = range(0, 0)
      expect(serviceChain.range).toHaveBeenCalledWith(0, 0);
    });

    it('treats limit=0 as falsy and defaults to 50', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: { limit: '0' } });
      const res = createMockRes();
      await handler(req, res);

      // Number('0') = 0, 0 || 50 = 50, range(0, 49)
      expect(serviceChain.range).toHaveBeenCalledWith(0, 49);
    });

    it('uses provided limit and offset for pagination', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: { limit: '10', offset: '20' } });
      const res = createMockRes();
      await handler(req, res);

      // range(20, 20+10-1) = range(20, 29)
      expect(serviceChain.range).toHaveBeenCalledWith(20, 29);
    });

    it('defaults limit to 50 when invalid', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: { limit: 'abc' } });
      const res = createMockRes();
      await handler(req, res);

      // NaN || 50 = 50, range(0, 49)
      expect(serviceChain.range).toHaveBeenCalledWith(0, 49);
    });

    it('defaults offset to 0 when invalid', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: { offset: 'abc' } });
      const res = createMockRes();
      await handler(req, res);

      // offset: NaN || 0 = 0, limit: 50 default
      expect(serviceChain.range).toHaveBeenCalledWith(0, 49);
    });

    it('clamps negative offset to 0', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: { offset: '-5' } });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.range).toHaveBeenCalledWith(0, 49);
    });

    it('handles participant_count as array', async () => {
      const data = [
        { id: 'c1', participant_count: [{ count: 10 }] },
      ];
      serviceChain = mockSupabaseChain({ data, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([
        { id: 'c1', participant_count: 10 },
      ]);
    });

    it('handles participant_count as empty array', async () => {
      const data = [
        { id: 'c1', participant_count: [] },
      ];
      serviceChain = mockSupabaseChain({ data, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([
        { id: 'c1', participant_count: 0 },
      ]);
    });

    it('handles participant_count as non-array (returns 0)', async () => {
      const data = [
        { id: 'c1', participant_count: 5 },
      ];
      serviceChain = mockSupabaseChain({ data, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([
        { id: 'c1', participant_count: 0 },
      ]);
    });

    it('handles null data by returning empty mapped result', async () => {
      serviceChain = mockSupabaseChain({ data: null, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      // data?.map returns undefined
      expect(res.json).toHaveBeenCalledWith(undefined);
    });

    it('returns 500 on database error', async () => {
      serviceChain = mockSupabaseChain({ data: null, error: { message: 'DB error' } });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list championships' });
    });

    it('queries aio_championships table', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(mockServiceFrom).toHaveBeenCalledWith('aio_championships');
    });

    it('orders results by created_at descending', async () => {
      serviceChain = mockSupabaseChain({ data: [], error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  // ==========================================================================
  // 2. GET /:id (get single championship)
  // ==========================================================================

  describe('GET /:id (get single championship)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns championship data when found', async () => {
      const championship = {
        id: 'champ-1',
        name: 'Test Championship',
        domain: { id: 'd1', name: 'Domain 1' },
        participants: [],
        rounds: [],
        creator: { username: 'testuser' },
      };
      serviceChain = mockSupabaseChain({ data: championship, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ params: { id: 'champ-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(championship);
    });

    it('returns 404 when championship not found (null data)', async () => {
      serviceChain = mockSupabaseChain({ data: null, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ params: { id: 'nonexistent' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Championship not found' });
    });

    it('returns 404 when database returns error', async () => {
      serviceChain = mockSupabaseChain({ data: null, error: { message: 'Not found' } });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ params: { id: 'bad-id' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Championship not found' });
    });

    it('returns 500 when unexpected error is thrown', async () => {
      // Make the chain throw an exception
      serviceChain = mockSupabaseChain();
      serviceChain.then = () => { throw new Error('Unexpected'); };
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ params: { id: 'champ-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get championship' });
    });

    it('queries with correct id parameter', async () => {
      serviceChain = mockSupabaseChain({ data: { id: 'champ-42' }, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ params: { id: 'champ-42' } });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.eq).toHaveBeenCalledWith('id', 'champ-42');
      expect(serviceChain.single).toHaveBeenCalled();
    });

    it('queries aio_championships table with correct joins', async () => {
      serviceChain = mockSupabaseChain({ data: { id: 'c1' }, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({ params: { id: 'c1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockServiceFrom).toHaveBeenCalledWith('aio_championships');
    });
  });

  // ==========================================================================
  // 3. GET /:id/standings
  // ==========================================================================

  describe('GET /:id/standings', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id/standings') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns standings from championship service', async () => {
      const standings = [
        { rank: 1, agent_id: 'a1', points: 100 },
        { rank: 2, agent_id: 'a2', points: 80 },
      ];
      mockChampionshipService.getStandings.mockResolvedValue(standings);

      const req = createMockReq({ params: { id: 'champ-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.getStandings).toHaveBeenCalledWith('champ-1');
      expect(res.json).toHaveBeenCalledWith(standings);
    });

    it('returns empty standings array', async () => {
      mockChampionshipService.getStandings.mockResolvedValue([]);

      const req = createMockReq({ params: { id: 'champ-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns 500 when service throws', async () => {
      mockChampionshipService.getStandings.mockRejectedValue(new Error('Service error'));

      const req = createMockReq({ params: { id: 'champ-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get standings' });
    });

    it('converts id param to string', async () => {
      mockChampionshipService.getStandings.mockResolvedValue([]);

      const req = createMockReq({ params: { id: 123 } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.getStandings).toHaveBeenCalledWith('123');
    });
  });

  // ==========================================================================
  // 4. POST / (create championship)
  // ==========================================================================

  describe('POST / (create championship)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('creates championship successfully and returns 201', async () => {
      const created = { id: 'new-champ', name: 'Test Championship' };
      mockChampionshipService.createChampionship.mockResolvedValue(created);

      const req = createMockReq({
        user: { id: 'user-1' },
        body: {
          name: 'Test Championship',
          domain_id: 'domain-1',
          format: 'points',
        },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('returns 400 when name is missing', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        body: { format: 'points' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Championship name is required' });
    });

    it('returns 400 when name is empty string', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        body: { name: '', format: 'points' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Championship name is required' });
    });

    it('returns 400 when format is invalid', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        body: { name: 'Test', format: 'invalid' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid format. Must be points, elimination, or hybrid',
      });
    });

    it('accepts format "points"', async () => {
      mockChampionshipService.createChampionship.mockResolvedValue({ id: 'c1' });

      const req = createMockReq({
        user: { id: 'user-1' },
        body: { name: 'Test', format: 'points' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('accepts format "elimination"', async () => {
      mockChampionshipService.createChampionship.mockResolvedValue({ id: 'c1' });

      const req = createMockReq({
        user: { id: 'user-1' },
        body: { name: 'Test', format: 'elimination' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('accepts format "hybrid"', async () => {
      mockChampionshipService.createChampionship.mockResolvedValue({ id: 'c1' });

      const req = createMockReq({
        user: { id: 'user-1' },
        body: { name: 'Test', format: 'hybrid' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('defaults format to "points" when not provided', async () => {
      mockChampionshipService.createChampionship.mockResolvedValue({ id: 'c1' });

      const req = createMockReq({
        user: { id: 'user-1' },
        body: { name: 'Test' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.createChampionship).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'points' }),
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('defaults total_rounds to 3 when not provided', async () => {
      mockChampionshipService.createChampionship.mockResolvedValue({ id: 'c1' });

      const req = createMockReq({
        user: { id: 'user-1' },
        body: { name: 'Test', format: 'points' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.createChampionship).toHaveBeenCalledWith(
        expect.objectContaining({ total_rounds: 3 }),
      );
    });

    it('defaults max_participants to 32 when not provided', async () => {
      mockChampionshipService.createChampionship.mockResolvedValue({ id: 'c1' });

      const req = createMockReq({
        user: { id: 'user-1' },
        body: { name: 'Test', format: 'points' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.createChampionship).toHaveBeenCalledWith(
        expect.objectContaining({ max_participants: 32 }),
      );
    });

    it('passes all body fields to championship service', async () => {
      mockChampionshipService.createChampionship.mockResolvedValue({ id: 'c1' });

      const body = {
        name: 'Full Championship',
        domain_id: 'domain-1',
        total_rounds: 5,
        format: 'hybrid',
        points_config: { win: 10, loss: 0 },
        elimination_after_round: 3,
        max_participants: 16,
        entry_requirements: { min_elo: 1200 },
        registration_deadline: '2026-03-01',
        task_ids: ['task-1', 'task-2'],
      };
      const req = createMockReq({
        user: { id: 'user-1' },
        body,
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.createChampionship).toHaveBeenCalledWith({
        name: 'Full Championship',
        domain_id: 'domain-1',
        total_rounds: 5,
        format: 'hybrid',
        points_config: { win: 10, loss: 0 },
        elimination_after_round: 3,
        max_participants: 16,
        entry_requirements: { min_elo: 1200 },
        created_by: 'user-1',
        registration_deadline: '2026-03-01',
        task_ids: ['task-1', 'task-2'],
      });
    });

    it('sets created_by from authenticated user', async () => {
      mockChampionshipService.createChampionship.mockResolvedValue({ id: 'c1' });

      const req = createMockReq({
        user: { id: 'user-42' },
        body: { name: 'Test', format: 'points' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.createChampionship).toHaveBeenCalledWith(
        expect.objectContaining({ created_by: 'user-42' }),
      );
    });

    it('returns 500 when service throws', async () => {
      mockChampionshipService.createChampionship.mockRejectedValue(
        new Error('Service failure'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        body: { name: 'Test', format: 'points' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create championship' });
    });

    it('runs through auth and validate middleware', () => {
      const handlers = getAllRouteHandlers(router, 'post', '/');
      // Should have: requireAuth, validateBody middleware, and route handler = 3 handlers
      expect(handlers.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================================================
  // 5. POST /:id/join (join championship)
  // ==========================================================================

  describe('POST /:id/join (join championship)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/:id/join') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('joins championship successfully and returns 201', async () => {
      const participant = { id: 'p1', championship_id: 'c1', agent_id: 'a1' };
      mockChampionshipService.joinChampionship.mockResolvedValue(participant);

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.joinChampionship).toHaveBeenCalledWith('c1', 'a1', 'user-1');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(participant);
    });

    it('returns 400 when agent_id is missing', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: {},
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent ID is required' });
    });

    it('returns 400 when agent_id is empty string', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: '' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent ID is required' });
    });

    it('returns 404 when error message contains "not found"', async () => {
      mockChampionshipService.joinChampionship.mockRejectedValue(
        new Error('Championship not found'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Championship not found' });
    });

    it('returns 403 when error message contains "Not authorized"', async () => {
      mockChampionshipService.joinChampionship.mockRejectedValue(
        new Error('Not authorized to use this agent'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized to use this agent' });
    });

    it('returns 400 when error message contains "Already joined"', async () => {
      mockChampionshipService.joinChampionship.mockRejectedValue(
        new Error('Already joined'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Already joined' });
    });

    it('returns 400 when error message contains "not accepting"', async () => {
      mockChampionshipService.joinChampionship.mockRejectedValue(
        new Error('Championship is not accepting participants'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Championship is not accepting participants',
      });
    });

    it('returns 400 when error message contains "full"', async () => {
      mockChampionshipService.joinChampionship.mockRejectedValue(
        new Error('Championship is full'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Championship is full' });
    });

    it('returns 400 when error message contains "ELO"', async () => {
      mockChampionshipService.joinChampionship.mockRejectedValue(
        new Error('ELO rating too low'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'ELO rating too low' });
    });

    it('returns 500 with generic message for unknown errors', async () => {
      mockChampionshipService.joinChampionship.mockRejectedValue(
        new Error('Unknown server error'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to join championship' });
    });

    it('returns 500 with generic message when error is not an Error instance', async () => {
      mockChampionshipService.joinChampionship.mockRejectedValue('string error');

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 'c1' },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      // Non-Error -> message='', statusCode=500
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to join championship' });
    });

    it('converts id param to string', async () => {
      const participant = { id: 'p1' };
      mockChampionshipService.joinChampionship.mockResolvedValue(participant);

      const req = createMockReq({
        user: { id: 'user-1' },
        params: { id: 123 },
        body: { agent_id: 'a1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.joinChampionship).toHaveBeenCalledWith('123', 'a1', 'user-1');
    });

    it('runs through auth and validate middleware', () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      expect(handlers.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================================================
  // 6. DELETE /:id/leave (leave championship)
  // ==========================================================================

  describe('DELETE /:id/leave (leave championship)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'delete', '/:id/leave') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('leaves championship successfully', async () => {
      // Service client returns championship in registration status
      serviceChain = mockSupabaseChain({
        data: { status: 'registration' },
        error: null,
      });
      mockServiceFrom.mockReturnValue(serviceChain);

      // User client delete succeeds
      mockUserClientChain = mockSupabaseChain({ data: null, error: null });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'Left championship' });
    });

    it('returns 404 when championship not found', async () => {
      serviceChain = mockSupabaseChain({ data: null, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'nonexistent' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Championship not found' });
    });

    it('returns 400 when championship status is not registration', async () => {
      serviceChain = mockSupabaseChain({
        data: { status: 'in_progress' },
        error: null,
      });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cannot leave a championship that has already started',
      });
    });

    it('returns 400 when championship status is completed', async () => {
      serviceChain = mockSupabaseChain({
        data: { status: 'completed' },
        error: null,
      });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cannot leave a championship that has already started',
      });
    });

    it('returns 500 when delete operation fails', async () => {
      serviceChain = mockSupabaseChain({
        data: { status: 'registration' },
        error: null,
      });
      mockServiceFrom.mockReturnValue(serviceChain);

      // User client delete returns error
      mockUserClientChain = mockSupabaseChain({
        data: null,
        error: { message: 'Delete failed' },
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to leave championship' });
    });

    it('deletes from aio_championship_participants with correct filters', async () => {
      serviceChain = mockSupabaseChain({
        data: { status: 'registration' },
        error: null,
      });
      mockServiceFrom.mockReturnValue(serviceChain);

      mockUserClientChain = mockSupabaseChain({ data: null, error: null });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockUserClientFrom).toHaveBeenCalledWith('aio_championship_participants');
      expect(mockUserClientChain.delete).toHaveBeenCalled();
      expect(mockUserClientChain.eq).toHaveBeenCalledWith('championship_id', 'c1');
      expect(mockUserClientChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('converts id param to string', async () => {
      serviceChain = mockSupabaseChain({
        data: { status: 'registration' },
        error: null,
      });
      mockServiceFrom.mockReturnValue(serviceChain);

      mockUserClientChain = mockSupabaseChain({ data: null, error: null });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 456 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockUserClientChain.eq).toHaveBeenCalledWith('championship_id', '456');
    });

    it('runs through auth middleware', () => {
      const handlers = getAllRouteHandlers(router, 'delete', '/:id/leave');
      expect(handlers.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // 7. POST /:id/start-round (start next round)
  // ==========================================================================

  describe('POST /:id/start-round (start next round)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/:id/start-round') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('starts round successfully when user is creator', async () => {
      // userClient returns championship with matching creator
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'user-1' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      const result = { round_number: 2, status: 'in_progress' };
      mockChampionshipService.startNextRound.mockResolvedValue(result);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.startNextRound).toHaveBeenCalledWith('c1');
      expect(res.json).toHaveBeenCalledWith({
        message: 'Round starting',
        round_number: 2,
        status: 'in_progress',
      });
    });

    it('returns 404 when championship not found', async () => {
      mockUserClientChain = mockSupabaseChain({ data: null, error: null });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'nonexistent' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Championship not found' });
    });

    it('returns 403 when user is not the creator', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'other-user' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only the creator can start rounds' });
    });

    it('returns 400 when service throws', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'user-1' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      mockChampionshipService.startNextRound.mockRejectedValue(
        new Error('Cannot start round'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to start championship round' });
    });

    it('queries aio_championships for creator verification', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'user-1' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      mockChampionshipService.startNextRound.mockResolvedValue({ round: 1 });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockUserClientFrom).toHaveBeenCalledWith('aio_championships');
      expect(mockUserClientChain.select).toHaveBeenCalledWith('created_by');
    });

    it('converts id param to string', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'user-1' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      mockChampionshipService.startNextRound.mockResolvedValue({ round: 1 });

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 789 },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.startNextRound).toHaveBeenCalledWith('789');
    });

    it('runs through auth middleware', () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:id/start-round');
      expect(handlers.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // 8. POST /:id/process-round/:roundNumber (process round results)
  // ==========================================================================

  describe('POST /:id/process-round/:roundNumber (process round results)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'post', '/:id/process-round/:roundNumber') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('processes round successfully', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'user-1' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      mockChampionshipService.processRoundResults.mockResolvedValue(undefined);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1', roundNumber: '2' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockChampionshipService.processRoundResults).toHaveBeenCalledWith('c1', 2);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Round results processed',
        roundNumber: 2,
      });
    });

    it('returns 400 for NaN round number', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1', roundNumber: 'abc' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid round number' });
    });

    it('returns 400 for round number 0', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1', roundNumber: '0' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid round number' });
    });

    it('returns 400 for negative round number', async () => {
      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1', roundNumber: '-1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid round number' });
    });

    it('accepts round number 1 as valid', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'user-1' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      mockChampionshipService.processRoundResults.mockResolvedValue(undefined);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1', roundNumber: '1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Round results processed',
        roundNumber: 1,
      });
    });

    it('returns 404 when championship not found', async () => {
      mockUserClientChain = mockSupabaseChain({ data: null, error: null });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'nonexistent', roundNumber: '1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Championship not found' });
    });

    it('returns 403 when user is not the creator', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'other-user' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1', roundNumber: '1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Only the creator can process round results',
      });
    });

    it('returns 400 when service throws', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'user-1' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      mockChampionshipService.processRoundResults.mockRejectedValue(
        new Error('Processing failed'),
      );

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1', roundNumber: '1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to process round results' });
    });

    it('queries aio_championships for creator verification', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'user-1' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      mockChampionshipService.processRoundResults.mockResolvedValue(undefined);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1', roundNumber: '3' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockUserClientFrom).toHaveBeenCalledWith('aio_championships');
      expect(mockUserClientChain.select).toHaveBeenCalledWith('created_by');
      expect(mockUserClientChain.eq).toHaveBeenCalledWith('id', 'c1');
    });

    it('parses round number as integer', async () => {
      mockUserClientChain = mockSupabaseChain({
        data: { created_by: 'user-1' },
        error: null,
      });
      mockUserClientFrom.mockReturnValue(mockUserClientChain);

      mockChampionshipService.processRoundResults.mockResolvedValue(undefined);

      const req = createMockReq({
        user: { id: 'user-1' },
        userClient: { from: mockUserClientFrom },
        params: { id: 'c1', roundNumber: '3.7' },
      });
      const res = createMockRes();
      await handler(req, res);

      // parseInt('3.7', 10) = 3
      expect(mockChampionshipService.processRoundResults).toHaveBeenCalledWith('c1', 3);
    });

    it('runs through auth middleware', () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:id/process-round/:roundNumber');
      expect(handlers.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // 9. GET /:id/rounds/:roundNumber/results (get round results)
  // ==========================================================================

  describe('GET /:id/rounds/:roundNumber/results', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id/rounds/:roundNumber/results') as (
        ...args: unknown[]
      ) => Promise<void>;
    });

    it('returns round results when found', async () => {
      const round = {
        id: 'r1',
        round_number: 1,
        status: 'completed',
        results: [
          { id: 'res1', score: 100, participant: { agent: { name: 'Agent1' } } },
        ],
      };
      serviceChain = mockSupabaseChain({ data: round, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({
        params: { id: 'c1', roundNumber: '1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(round);
    });

    it('returns 404 when round not found', async () => {
      serviceChain = mockSupabaseChain({ data: null, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({
        params: { id: 'c1', roundNumber: '99' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Round not found' });
    });

    it('returns 500 on database error', async () => {
      serviceChain = mockSupabaseChain();
      serviceChain.then = () => { throw new Error('DB error'); };
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({
        params: { id: 'c1', roundNumber: '1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get round results' });
    });

    it('queries aio_championship_rounds with correct filters', async () => {
      serviceChain = mockSupabaseChain({ data: { id: 'r1' }, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({
        params: { id: 'c1', roundNumber: '2' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(mockServiceFrom).toHaveBeenCalledWith('aio_championship_rounds');
      expect(serviceChain.eq).toHaveBeenCalledWith('championship_id', 'c1');
      expect(serviceChain.eq).toHaveBeenCalledWith('round_number', 2);
      expect(serviceChain.single).toHaveBeenCalled();
    });

    it('converts roundNumber param to integer', async () => {
      serviceChain = mockSupabaseChain({ data: { id: 'r1' }, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({
        params: { id: 'c1', roundNumber: '5' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.eq).toHaveBeenCalledWith('round_number', 5);
    });

    it('converts id param to string', async () => {
      serviceChain = mockSupabaseChain({ data: { id: 'r1' }, error: null });
      mockServiceFrom.mockReturnValue(serviceChain);

      const req = createMockReq({
        params: { id: 999, roundNumber: '1' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(serviceChain.eq).toHaveBeenCalledWith('championship_id', '999');
    });

    it('does not require authentication', () => {
      const handlers = getAllRouteHandlers(router, 'get', '/:id/rounds/:roundNumber/results');
      // Only the route handler, no auth middleware
      expect(handlers.length).toBe(1);
    });
  });

  // ==========================================================================
  // Route registration verification
  // ==========================================================================

  describe('Route registration', () => {
    it('registers all 9 expected routes', () => {
      const routes: Array<{ method: string; path: string }> = [];
      for (const layer of router.stack) {
        if (layer.route) {
          const method = Object.keys(layer.route.methods)[0];
          routes.push({ method, path: layer.route.path });
        }
      }

      expect(routes).toContainEqual({ method: 'get', path: '/' });
      expect(routes).toContainEqual({ method: 'get', path: '/:id' });
      expect(routes).toContainEqual({ method: 'get', path: '/:id/standings' });
      expect(routes).toContainEqual({ method: 'post', path: '/' });
      expect(routes).toContainEqual({ method: 'post', path: '/:id/join' });
      expect(routes).toContainEqual({ method: 'delete', path: '/:id/leave' });
      expect(routes).toContainEqual({ method: 'post', path: '/:id/start-round' });
      expect(routes).toContainEqual({ method: 'post', path: '/:id/process-round/:roundNumber' });
      expect(routes).toContainEqual({ method: 'get', path: '/:id/rounds/:roundNumber/results' });
    });

    it('exports router as default export', async () => {
      const mod = await import('./championships.js');
      expect(mod.default).toBeDefined();
    });
  });
});
