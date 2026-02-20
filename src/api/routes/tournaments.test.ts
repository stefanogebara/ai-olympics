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
// Chain mock for Supabase query builder
// ---------------------------------------------------------------------------

function createChainMock(resolveValue: { data?: unknown; error?: unknown; count?: number } = { data: null, error: null, count: 0 }) {
  const chain: Record<string, unknown> = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(resolveValue);
      return vi.fn().mockReturnValue(chain);
    },
  });
  return chain;
}

// ---------------------------------------------------------------------------
// Mock tournament manager
// ---------------------------------------------------------------------------

const mockTournamentManager = {
  getActiveTournament: vi.fn(),
  startTournament: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../orchestrator/tournament-manager.js', () => ({
  tournamentManager: mockTournamentManager,
}));

// ---------------------------------------------------------------------------
// Mock supabase (serviceClient)
// ---------------------------------------------------------------------------

let serviceFromResolveMap: Record<string, { data?: unknown; error?: unknown }> = {};

const mockServiceFrom = vi.fn((table: string) => {
  const resolveValue = serviceFromResolveMap[table] || { data: null, error: null };
  return createChainMock(resolveValue);
});

vi.mock('../../shared/utils/supabase.js', () => ({
  serviceClient: { from: (...args: unknown[]) => mockServiceFrom(...args) },
}));

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock auth middleware - injects user + userClient
// ---------------------------------------------------------------------------

let mockUserClientFrom: ReturnType<typeof vi.fn>;
let mockUserClientRpc: ReturnType<typeof vi.fn>;

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: Record<string, unknown>, _res: unknown, next: () => void) => {
    _req.user = { id: 'user-1' };
    _req.userClient = {
      from: (...args: unknown[]) => mockUserClientFrom(...args),
      rpc: (...args: unknown[]) => mockUserClientRpc(...args),
    };
    next();
  },
}));

// ---------------------------------------------------------------------------
// Mock validate middleware
// ---------------------------------------------------------------------------

vi.mock('../middleware/validate.js', () => ({
  validateBody: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// Mock schemas
// ---------------------------------------------------------------------------

vi.mock('../schemas.js', () => ({
  createTournamentSchema: {},
  joinTournamentSchema: {},
}));

// ---------------------------------------------------------------------------
// Router helpers (same pattern as games.test.ts)
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

function getAllRouteHandlers(router: RouterType, method: string, path: string) {
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

async function runHandlerChain(
  handlers: Array<(...args: unknown[]) => unknown>,
  req: Record<string, unknown>,
  res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> },
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
    // If response was already sent, stop the chain
    if (res.json.mock.calls.length > 0 || res.send.mock.calls.length > 0) break;
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Tournament Routes', () => {
  let router: RouterType;

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceFromResolveMap = {};

    // Default userClient mocks
    mockUserClientFrom = vi.fn(() => createChainMock());
    mockUserClientRpc = vi.fn().mockResolvedValue({ data: 'join-id-1', error: null });

    const mod = await import('./tournaments.js');
    router = mod.default as unknown as RouterType;
  });

  // ========================================================================
  // Route structure
  // ========================================================================

  describe('Route structure', () => {
    it('has GET / route', () => {
      expect(() => getRouteHandler(router, 'get', '/')).not.toThrow();
    });

    it('has GET /:id route', () => {
      expect(() => getRouteHandler(router, 'get', '/:id')).not.toThrow();
    });

    it('has POST / route', () => {
      expect(() => getAllRouteHandlers(router, 'post', '/')).not.toThrow();
    });

    it('has POST /:id/join route', () => {
      expect(() => getAllRouteHandlers(router, 'post', '/:id/join')).not.toThrow();
    });

    it('has DELETE /:id/leave route', () => {
      expect(() => getAllRouteHandlers(router, 'delete', '/:id/leave')).not.toThrow();
    });

    it('has POST /:id/start route', () => {
      expect(() => getAllRouteHandlers(router, 'post', '/:id/start')).not.toThrow();
    });

    it('has GET /:id/bracket route', () => {
      expect(() => getRouteHandler(router, 'get', '/:id/bracket')).not.toThrow();
    });

    it('POST / has requireAuth and validateBody middleware', () => {
      const handlers = getAllRouteHandlers(router, 'post', '/');
      expect(handlers.length).toBeGreaterThanOrEqual(3);
    });

    it('POST /:id/join has requireAuth and validateBody middleware', () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      expect(handlers.length).toBeGreaterThanOrEqual(3);
    });

    it('DELETE /:id/leave has requireAuth middleware', () => {
      const handlers = getAllRouteHandlers(router, 'delete', '/:id/leave');
      expect(handlers.length).toBeGreaterThanOrEqual(2);
    });

    it('POST /:id/start has requireAuth middleware', () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      expect(handlers.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ========================================================================
  // GET / (list tournaments)
  // ========================================================================

  describe('GET / (list tournaments)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/') as (...args: unknown[]) => Promise<void>;
    });

    it('returns tournaments array with default pagination', async () => {
      const tournaments = [
        { id: 't1', name: 'Tourney 1', participant_count: [{ count: 3 }] },
        { id: 't2', name: 'Tourney 2', participant_count: [{ count: 5 }] },
      ];
      serviceFromResolveMap['aio_tournaments'] = { data: tournaments, error: null };

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalled();
      const result = res.json.mock.calls[0][0];
      expect(result).toHaveLength(2);
      expect(result[0].participant_count).toBe(3);
      expect(result[1].participant_count).toBe(5);
    });

    it('processes participant_count from array format', async () => {
      const tournaments = [
        { id: 't1', name: 'T', participant_count: [{ count: 7 }] },
      ];
      serviceFromResolveMap['aio_tournaments'] = { data: tournaments, error: null };

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result[0].participant_count).toBe(7);
    });

    it('returns 0 when participant_count array is empty', async () => {
      const tournaments = [
        { id: 't1', name: 'T', participant_count: [] },
      ];
      serviceFromResolveMap['aio_tournaments'] = { data: tournaments, error: null };

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result[0].participant_count).toBe(0);
    });

    it('returns 0 when participant_count is not an array', async () => {
      const tournaments = [
        { id: 't1', name: 'T', participant_count: 5 },
      ];
      serviceFromResolveMap['aio_tournaments'] = { data: tournaments, error: null };

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result[0].participant_count).toBe(0);
    });

    it('applies status filter when provided', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: [], error: null };

      const req = createMockReq({ query: { status: 'lobby' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockServiceFrom).toHaveBeenCalledWith('aio_tournaments');
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('does not filter when no status provided', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: [], error: null };

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('clamps limit to max 100', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: [], error: null };

      const req = createMockReq({ query: { limit: '500' } });
      const res = createMockRes();
      await handler(req, res);

      // The query is built with clamped values; we verify it doesn't error
      expect(res.json).toHaveBeenCalled();
    });

    it('clamps limit to min 1', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: [], error: null };

      const req = createMockReq({ query: { limit: '0' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalled();
    });

    it('defaults NaN limit to 50', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: [], error: null };

      const req = createMockReq({ query: { limit: 'abc' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalled();
    });

    it('handles offset=0 correctly', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: [], error: null };

      const req = createMockReq({ query: { offset: '0' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalled();
    });

    it('clamps negative offset to 0', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: [], error: null };

      const req = createMockReq({ query: { offset: '-10' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalled();
    });

    it('defaults NaN offset to 0', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: [], error: null };

      const req = createMockReq({ query: { offset: 'xyz' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalled();
    });

    it('returns empty array when data is null', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: null, error: null };

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalled();
    });

    it('returns 500 when DB throws an error', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: null, error: { message: 'DB error' } };

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list tournaments' });
    });

    it('handles pagination with both limit and offset', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: [], error: null };

      const req = createMockReq({ query: { limit: '10', offset: '20' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  // ========================================================================
  // GET /:id (single tournament)
  // ========================================================================

  describe('GET /:id (single tournament)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id') as (...args: unknown[]) => Promise<void>;
    });

    it('returns tournament data when found', async () => {
      const tournament = {
        id: 't1',
        name: 'Test Tournament',
        status: 'lobby',
        participants: [],
        matches: [],
      };
      serviceFromResolveMap['aio_tournaments'] = { data: tournament, error: null };

      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(tournament);
    });

    it('returns 404 when tournament not found (null data)', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: null, error: null };

      const req = createMockReq({ params: { id: 'nonexistent' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament not found' });
    });

    it('returns 404 when DB returns error', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: null, error: { message: 'Not found' } };

      const req = createMockReq({ params: { id: 'bad-id' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament not found' });
    });

    it('returns 500 on unexpected exception', async () => {
      // Force an unhandled exception by making mockServiceFrom throw
      mockServiceFrom.mockImplementationOnce(() => {
        throw new Error('Unexpected crash');
      });

      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get tournament' });
    });
  });

  // ========================================================================
  // POST / (create tournament)
  // ========================================================================

  describe('POST / (create tournament)', () => {
    it('creates tournament successfully with defaults and returns 201', async () => {
      const createdTournament = {
        id: 't-new',
        name: 'My Tournament',
        bracket_type: 'single-elimination',
        max_participants: 16,
        best_of: 1,
        status: 'lobby',
      };
      mockUserClientFrom.mockReturnValue(createChainMock({ data: createdTournament, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'My Tournament' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(createdTournament);
    });

    it('returns 400 when name is missing', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: {} });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament name is required' });
    });

    it('returns 400 when name is empty string', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { name: '' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament name is required' });
    });

    it('returns 400 for invalid bracket_type', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', bracket_type: 'battle-royale' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid bracket type' });
    });

    it('accepts single-elimination bracket_type', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't1' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', bracket_type: 'single-elimination' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('accepts double-elimination bracket_type', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't2' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', bracket_type: 'double-elimination' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('accepts round-robin bracket_type', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't3' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', bracket_type: 'round-robin' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('accepts swiss bracket_type', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't4' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', bracket_type: 'swiss' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('defaults bracket_type to single-elimination when not provided', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't5', bracket_type: 'single-elimination' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('accepts valid task_ids array of strings', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't6' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', task_ids: ['task-1', 'task-2'] },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('sets task_ids to null when not an array', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't7' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', task_ids: 'not-an-array' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('sets task_ids to null when array contains non-strings', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't8' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', task_ids: [1, 2, 3] },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('sets task_ids to null when undefined', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't9' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('uses custom max_participants and best_of', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't10' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', max_participants: 32, best_of: 3 },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('includes domain_id when provided', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't11' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T', domain_id: 'domain-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('sets domain_id to null when not provided', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: { id: 't12' }, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 500 when DB insert fails', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: null, error: { message: 'Insert failed' } }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { name: 'T' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create tournament' });
    });
  });

  // ========================================================================
  // POST /:id/join (join tournament)
  // ========================================================================

  describe('POST /:id/join (join tournament)', () => {
    function setupJoinMocks(overrides: {
      tournament?: Record<string, unknown> | null;
      agent?: Record<string, unknown> | null;
      rpcResult?: { data: unknown; error: unknown };
      participant?: Record<string, unknown> | null;
    } = {}) {
      const {
        tournament = {
          id: 't1',
          status: 'lobby',
          max_participants: 16,
          created_by: 'other-user',
          participant_count: [{ count: 2 }],
        },
        agent = {
          id: 'agent-1',
          owner_id: 'user-1',
          is_active: true,
          verification_status: 'verified',
          last_verified_at: new Date().toISOString(),
        },
        rpcResult = { data: 'join-id-1', error: null },
        participant = { id: 'join-id-1', tournament_id: 't1', agent_id: 'agent-1', user_id: 'user-1' },
      } = overrides;

      // serviceClient.from('aio_tournaments') for tournament lookup
      serviceFromResolveMap['aio_tournaments'] = { data: tournament, error: null };
      // serviceClient.from('aio_tournament_participants') for fetching participant after join
      serviceFromResolveMap['aio_tournament_participants'] = { data: participant, error: null };

      // userClient.from('aio_agents') for agent lookup
      mockUserClientFrom.mockReturnValue(createChainMock({ data: agent, error: null }));

      // userClient.rpc for join
      mockUserClientRpc.mockResolvedValue(rpcResult);
    }

    it('joins tournament successfully and returns 201', async () => {
      setupJoinMocks();

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });

    it('calls RPC with correct parameters', async () => {
      setupJoinMocks();

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(mockUserClientRpc).toHaveBeenCalledWith('aio_join_tournament', {
        p_tournament_id: 't1',
        p_agent_id: 'agent-1',
        p_user_id: 'user-1',
      });
    });

    it('returns 400 when agent_id is missing', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: {},
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent ID is required' });
    });

    it('returns 404 when tournament not found', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: null, error: null };

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 'nonexistent' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament not found' });
    });

    it('returns 400 when tournament is not in lobby status', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'running', max_participants: 16, participant_count: [{ count: 2 }] },
        error: null,
      };

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament is not accepting participants' });
    });

    it('returns 400 when tournament is completed', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'completed', max_participants: 16, participant_count: [{ count: 8 }] },
        error: null,
      };

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament is not accepting participants' });
    });

    it('returns 400 when tournament is full', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'lobby', max_participants: 4, participant_count: [{ count: 4 }] },
        error: null,
      };

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament is full' });
    });

    it('handles participant_count as non-array (defaults to 0)', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'lobby', max_participants: 16, participant_count: 0 },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({
        data: {
          id: 'agent-1', owner_id: 'user-1', is_active: true,
          verification_status: 'verified', last_verified_at: new Date().toISOString(),
        },
        error: null,
      }));
      mockUserClientRpc.mockResolvedValue({ data: 'join-id-1', error: null });
      serviceFromResolveMap['aio_tournament_participants'] = {
        data: { id: 'join-id-1' },
        error: null,
      };

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // Should proceed since currentCount (0) < max_participants (16)
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 403 when agent is not owned by user', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'lobby', max_participants: 16, participant_count: [{ count: 2 }] },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({
        data: { id: 'agent-1', owner_id: 'other-user', is_active: true },
        error: null,
      }));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized to use this agent' });
    });

    it('returns 403 when agent is null (not found)', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'lobby', max_participants: 16, participant_count: [{ count: 2 }] },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({ data: null, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'nonexistent-agent' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized to use this agent' });
    });

    it('returns 400 when agent is not active', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'lobby', max_participants: 16, participant_count: [{ count: 2 }] },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({
        data: { id: 'agent-1', owner_id: 'user-1', is_active: false },
        error: null,
      }));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent is not active' });
    });

    it('returns 403 when agent is not verified', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'lobby', max_participants: 16, participant_count: [{ count: 2 }] },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({
        data: {
          id: 'agent-1', owner_id: 'user-1', is_active: true,
          verification_status: 'pending', last_verified_at: new Date().toISOString(),
        },
        error: null,
      }));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Agent must pass verification before joining tournaments',
        verification_required: true,
      });
    });

    it('returns 403 when agent has no last_verified_at', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'lobby', max_participants: 16, participant_count: [{ count: 2 }] },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({
        data: {
          id: 'agent-1', owner_id: 'user-1', is_active: true,
          verification_status: 'verified', last_verified_at: null,
        },
        error: null,
      }));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Agent must pass verification before joining tournaments',
        verification_required: true,
      });
    });

    it('returns 403 when verification expired (>24h ago)', async () => {
      const expired = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'lobby', max_participants: 16, participant_count: [{ count: 2 }] },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({
        data: {
          id: 'agent-1', owner_id: 'user-1', is_active: true,
          verification_status: 'verified', last_verified_at: expired,
        },
        error: null,
      }));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Agent must pass verification before joining tournaments',
        verification_required: true,
      });
    });

    it('allows agent verified within 24h', async () => {
      const recent = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      setupJoinMocks({
        agent: {
          id: 'agent-1', owner_id: 'user-1', is_active: true,
          verification_status: 'verified', last_verified_at: recent,
        },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 400 for duplicate join (RPC error 23505)', async () => {
      setupJoinMocks({
        rpcResult: { data: null, error: { code: '23505', message: 'unique_violation' } },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Already joined with this agent' });
    });

    it('returns 400 when RPC error message includes "full"', async () => {
      setupJoinMocks({
        rpcResult: { data: null, error: { code: 'PGRST', message: 'Tournament is full' } },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament is full' });
    });

    it('fetches participant after successful join', async () => {
      const participant = { id: 'join-id-1', tournament_id: 't1', agent_id: 'agent-1', user_id: 'user-1', seed: 1 };
      setupJoinMocks({ participant });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(participant);
    });

    it('returns 500 when RPC throws unexpected error', async () => {
      setupJoinMocks({
        rpcResult: { data: null, error: { code: 'OTHER', message: 'Unexpected DB failure' } },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to join tournament' });
    });

    it('returns 500 on exception in handler', async () => {
      mockServiceFrom.mockImplementationOnce(() => {
        throw new Error('Catastrophic failure');
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to join tournament' });
    });

    it('handles empty participant_count array for tournament', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { id: 't1', status: 'lobby', max_participants: 16, participant_count: [] },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({
        data: {
          id: 'agent-1', owner_id: 'user-1', is_active: true,
          verification_status: 'verified', last_verified_at: new Date().toISOString(),
        },
        error: null,
      }));
      mockUserClientRpc.mockResolvedValue({ data: 'join-id-1', error: null });
      serviceFromResolveMap['aio_tournament_participants'] = { data: { id: 'join-id-1' }, error: null };

      const handlers = getAllRouteHandlers(router, 'post', '/:id/join');
      const req = createMockReq({
        params: { id: 't1' },
        body: { agent_id: 'agent-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // Empty array -> count = 0, which is < 16 -> should proceed
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // ========================================================================
  // DELETE /:id/leave (leave tournament)
  // ========================================================================

  describe('DELETE /:id/leave (leave tournament)', () => {
    it('leaves tournament successfully and returns 204', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { status: 'lobby' },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({ data: null, error: null }));

      const handlers = getAllRouteHandlers(router, 'delete', '/:id/leave');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('returns 404 when tournament not found', async () => {
      serviceFromResolveMap['aio_tournaments'] = { data: null, error: null };

      const handlers = getAllRouteHandlers(router, 'delete', '/:id/leave');
      const req = createMockReq({ params: { id: 'nonexistent' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament not found' });
    });

    it('returns 400 when tournament is not in lobby', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { status: 'running' },
        error: null,
      };

      const handlers = getAllRouteHandlers(router, 'delete', '/:id/leave');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot leave a tournament that has started' });
    });

    it('returns 400 when tournament is completed', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { status: 'completed' },
        error: null,
      };

      const handlers = getAllRouteHandlers(router, 'delete', '/:id/leave');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot leave a tournament that has started' });
    });

    it('returns 500 when delete operation fails', async () => {
      serviceFromResolveMap['aio_tournaments'] = {
        data: { status: 'lobby' },
        error: null,
      };
      mockUserClientFrom.mockReturnValue(createChainMock({ data: null, error: { message: 'Delete failed' } }));

      const handlers = getAllRouteHandlers(router, 'delete', '/:id/leave');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to leave tournament' });
    });

    it('returns 500 on unexpected exception', async () => {
      mockServiceFrom.mockImplementationOnce(() => {
        throw new Error('Crash');
      });

      const handlers = getAllRouteHandlers(router, 'delete', '/:id/leave');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to leave tournament' });
    });
  });

  // ========================================================================
  // POST /:id/start (start tournament)
  // ========================================================================

  describe('POST /:id/start (start tournament)', () => {
    function setupStartMocks(overrides: {
      tournament?: Record<string, unknown> | null;
    } = {}) {
      const {
        tournament = {
          id: 't1',
          status: 'lobby',
          created_by: 'user-1',
          domain_id: 'domain-1',
          bracket_type: 'single-elimination',
          task_ids: null,
          best_of: 1,
          max_participants: 16,
          participant_count: [{ count: 4 }],
        },
      } = overrides;

      mockUserClientFrom.mockReturnValue(createChainMock({ data: tournament, error: null }));
    }

    it('starts tournament successfully and returns message', async () => {
      setupStartMocks();

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'Tournament starting', tournamentId: 't1' });
    });

    it('calls tournamentManager.startTournament with string ID', async () => {
      setupStartMocks();

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(mockTournamentManager.startTournament).toHaveBeenCalledWith('t1');
    });

    it('returns 404 when tournament not found', async () => {
      mockUserClientFrom.mockReturnValue(createChainMock({ data: null, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 'nonexistent' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament not found' });
    });

    it('returns 403 when user is not the creator', async () => {
      setupStartMocks({
        tournament: {
          id: 't1', status: 'lobby', created_by: 'other-user',
          participant_count: [{ count: 4 }],
        },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only the creator can start the tournament' });
    });

    it('returns 400 when tournament is not in lobby', async () => {
      setupStartMocks({
        tournament: {
          id: 't1', status: 'running', created_by: 'user-1',
          participant_count: [{ count: 4 }],
        },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament has already started' });
    });

    it('returns 400 when tournament is completed', async () => {
      setupStartMocks({
        tournament: {
          id: 't1', status: 'completed', created_by: 'user-1',
          participant_count: [{ count: 4 }],
        },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament has already started' });
    });

    it('returns 400 when less than 2 participants', async () => {
      setupStartMocks({
        tournament: {
          id: 't1', status: 'lobby', created_by: 'user-1',
          participant_count: [{ count: 1 }],
        },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Need at least 2 participants to start' });
    });

    it('returns 400 when 0 participants', async () => {
      setupStartMocks({
        tournament: {
          id: 't1', status: 'lobby', created_by: 'user-1',
          participant_count: [{ count: 0 }],
        },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Need at least 2 participants to start' });
    });

    it('handles participant_count as non-array (defaults to 0)', async () => {
      setupStartMocks({
        tournament: {
          id: 't1', status: 'lobby', created_by: 'user-1',
          participant_count: 5,
        },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // Non-array -> participantCount = 0 -> less than 2 -> 400
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Need at least 2 participants to start' });
    });

    it('handles empty participant_count array (defaults to 0)', async () => {
      setupStartMocks({
        tournament: {
          id: 't1', status: 'lobby', created_by: 'user-1',
          participant_count: [],
        },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Need at least 2 participants to start' });
    });

    it('allows start with exactly 2 participants', async () => {
      setupStartMocks({
        tournament: {
          id: 't1', status: 'lobby', created_by: 'user-1',
          participant_count: [{ count: 2 }],
        },
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'Tournament starting', tournamentId: 't1' });
    });

    it('fire-and-forget: startTournament is called asynchronously', async () => {
      setupStartMocks();
      // Make startTournament return a pending promise
      let resolveStart: () => void;
      const startPromise = new Promise<void>((resolve) => { resolveStart = resolve; });
      mockTournamentManager.startTournament.mockReturnValue(startPromise);

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // Response sent before startTournament resolves
      expect(res.json).toHaveBeenCalledWith({ message: 'Tournament starting', tournamentId: 't1' });
      expect(mockTournamentManager.startTournament).toHaveBeenCalled();

      // Clean up the pending promise
      resolveStart!();
      await startPromise;
    });

    it('orchestrator failure reverts status to lobby in DB', async () => {
      setupStartMocks();
      const orchestratorError = new Error('Orchestrator crashed');
      mockTournamentManager.startTournament.mockRejectedValue(orchestratorError);

      // Track the serviceClient.from call for revert
      const revertChain = createChainMock({ data: null, error: null });
      let revertCalled = false;
      mockServiceFrom.mockImplementation((table: string) => {
        if (table === 'aio_tournaments') {
          revertCalled = true;
          return revertChain;
        }
        return createChainMock();
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // Response should still be sent immediately
      expect(res.json).toHaveBeenCalledWith({ message: 'Tournament starting', tournamentId: 't1' });

      // Wait for the catch handler to execute
      await vi.waitFor(() => {
        expect(revertCalled).toBe(true);
      });
    });

    it('returns 500 on unexpected exception', async () => {
      mockUserClientFrom.mockImplementation(() => {
        throw new Error('Unexpected');
      });

      const handlers = getAllRouteHandlers(router, 'post', '/:id/start');
      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to start tournament' });
    });
  });

  // ========================================================================
  // GET /:id/bracket (bracket data)
  // ========================================================================

  describe('GET /:id/bracket (bracket data)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id/bracket') as (...args: unknown[]) => Promise<void>;
    });

    it('returns bracket from active tournament in memory', async () => {
      const mockController = {
        getTournament: () => ({
          id: 'tid',
          status: 'running',
          rounds: [
            { id: 'r1', roundNumber: 1, name: 'Round 1', status: 'active', matches: [] },
          ],
        }),
        getBracket: () => ({ type: 'single-elimination' }),
        getStandings: () => [{ agentId: 'a1', wins: 1, losses: 0 }],
      };
      mockTournamentManager.getActiveTournament.mockReturnValue(mockController);

      const req = createMockReq({ params: { id: 'tid' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        bracket: { type: 'single-elimination' },
        standings: [{ agentId: 'a1', wins: 1, losses: 0 }],
        rounds: [
          { id: 'r1', roundNumber: 1, name: 'Round 1', status: 'active', matches: [] },
        ],
        status: 'running',
      });
    });

    it('handles controller with null tournament gracefully', async () => {
      const mockController = {
        getTournament: () => null,
        getBracket: () => ({ type: 'round-robin' }),
        getStandings: () => [],
      };
      mockTournamentManager.getActiveTournament.mockReturnValue(mockController);

      const req = createMockReq({ params: { id: 'tid' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        bracket: { type: 'round-robin' },
        standings: [],
        rounds: undefined,
        status: undefined,
      });
    });

    it('handles controller with tournament having multiple rounds', async () => {
      const mockController = {
        getTournament: () => ({
          id: 'tid',
          status: 'running',
          rounds: [
            { id: 'r1', roundNumber: 1, name: 'Round 1', status: 'completed', matches: [{ id: 'm1' }] },
            { id: 'r2', roundNumber: 2, name: 'Finals', status: 'active', matches: [{ id: 'm2' }] },
          ],
        }),
        getBracket: () => ({ type: 'double-elimination' }),
        getStandings: () => [
          { agentId: 'a1', wins: 2, losses: 0 },
          { agentId: 'a2', wins: 1, losses: 1 },
        ],
      };
      mockTournamentManager.getActiveTournament.mockReturnValue(mockController);

      const req = createMockReq({ params: { id: 'tid' } });
      const res = createMockRes();
      await handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.rounds).toHaveLength(2);
      expect(result.standings).toHaveLength(2);
      expect(result.status).toBe('running');
    });

    it('falls back to DB when tournament is not in memory', async () => {
      mockTournamentManager.getActiveTournament.mockReturnValue(null);

      const tournamentData = {
        bracket_data: { seeds: [1, 2, 3, 4] },
        status: 'completed',
      };
      const matchesData = [
        { id: 'm1', round_number: 1, match_number: 1 },
        { id: 'm2', round_number: 1, match_number: 2 },
      ];

      // First call: aio_tournaments, second call: aio_tournament_matches
      let callCount = 0;
      mockServiceFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'aio_tournaments') {
          return createChainMock({ data: tournamentData, error: null });
        }
        if (table === 'aio_tournament_matches') {
          return createChainMock({ data: matchesData, error: null });
        }
        return createChainMock();
      });

      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        bracket_data: { seeds: [1, 2, 3, 4] },
        matches: matchesData,
        status: 'completed',
      });
    });

    it('returns 404 when DB fallback finds no tournament', async () => {
      mockTournamentManager.getActiveTournament.mockReturnValue(null);
      mockServiceFrom.mockImplementation((table: string) => {
        if (table === 'aio_tournaments') {
          return createChainMock({ data: null, error: null });
        }
        return createChainMock();
      });

      const req = createMockReq({ params: { id: 'nonexistent' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament not found' });
    });

    it('returns 404 when DB fallback returns error', async () => {
      mockTournamentManager.getActiveTournament.mockReturnValue(null);
      mockServiceFrom.mockImplementation((table: string) => {
        if (table === 'aio_tournaments') {
          return createChainMock({ data: null, error: { message: 'not found' } });
        }
        return createChainMock();
      });

      const req = createMockReq({ params: { id: 'bad' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tournament not found' });
    });

    it('returns empty matches array when DB matches query returns null', async () => {
      mockTournamentManager.getActiveTournament.mockReturnValue(null);

      let callCount = 0;
      mockServiceFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'aio_tournaments') {
          return createChainMock({ data: { bracket_data: null, status: 'lobby' }, error: null });
        }
        if (table === 'aio_tournament_matches') {
          return createChainMock({ data: null, error: null });
        }
        return createChainMock();
      });

      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        bracket_data: null,
        matches: [],
        status: 'lobby',
      });
    });

    it('returns 500 on unexpected exception', async () => {
      mockTournamentManager.getActiveTournament.mockImplementation(() => {
        throw new Error('Memory corruption');
      });

      const req = createMockReq({ params: { id: 't1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get bracket data' });
    });

    it('passes tournament id as string to getActiveTournament', async () => {
      mockTournamentManager.getActiveTournament.mockReturnValue(null);
      serviceFromResolveMap['aio_tournaments'] = { data: null, error: null };

      const req = createMockReq({ params: { id: 12345 } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockTournamentManager.getActiveTournament).toHaveBeenCalledWith('12345');
    });

    it('maps only specific round fields from tournament object', async () => {
      const mockController = {
        getTournament: () => ({
          id: 'tid',
          status: 'running',
          rounds: [
            {
              id: 'r1',
              roundNumber: 1,
              name: 'Round 1',
              status: 'active',
              matches: [{ id: 'm1' }],
              extraField: 'should-not-appear',
            },
          ],
        }),
        getBracket: () => ({}),
        getStandings: () => [],
      };
      mockTournamentManager.getActiveTournament.mockReturnValue(mockController);

      const req = createMockReq({ params: { id: 'tid' } });
      const res = createMockRes();
      await handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.rounds[0]).toEqual({
        id: 'r1',
        roundNumber: 1,
        name: 'Round 1',
        status: 'active',
        matches: [{ id: 'm1' }],
      });
      // extraField should NOT be in the mapped output
      expect(result.rounds[0].extraField).toBeUndefined();
    });
  });
});
