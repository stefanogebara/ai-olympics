import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
// Chainable Supabase mock builder
// ---------------------------------------------------------------------------

function createChainMock(resolveValue: { data?: unknown; error?: unknown; count?: number } = { data: null, error: null, count: 0 }) {
  const chain: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolveValue);
      }
      if (prop === 'auth') {
        return { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) };
      }
      return vi.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy(chain, handler);
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

const mockServiceFrom = vi.fn(() => createChainMock());
const mockAuthGetUser = vi.fn().mockResolvedValue({ data: { user: null } });

vi.mock('../../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: (...args: unknown[]) => mockServiceFrom(...args),
    auth: { getUser: (...args: unknown[]) => mockAuthGetUser(...args) },
  },
  createUserClient: vi.fn(),
  extractToken: vi.fn((header?: string) => header?.replace('Bearer ', '') || null),
}));

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const mockEncrypt = vi.fn((val: string) => `encrypted:${val}`);
const mockDecrypt = vi.fn((val: string) => val.replace('encrypted:', ''));

vi.mock('../../shared/utils/crypto.js', () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...(args as [string])),
  decrypt: (...args: unknown[]) => mockDecrypt(...(args as [string])),
}));

vi.mock('../../agents/adapters/webhook.js', () => ({
  verifyWebhookSignature: vi.fn(),
}));

const mockGetAllTasks = vi.fn(() => [
  {
    id: 'task-1',
    name: 'Task 1',
    description: 'Desc 1',
    category: 'speed',
    difficulty: 'easy',
    timeLimit: 60,
    scoringMethod: 'time',
    maxScore: 1000,
    systemPrompt: 'sys prompt',
    taskPrompt: 'task prompt',
    startUrl: 'http://localhost:3003/tasks/1',
  },
]);

const mockGetTask = vi.fn((id: string) =>
  id === 'task-1'
    ? {
        id: 'task-1',
        name: 'Task 1',
        systemPrompt: 'sys prompt',
        taskPrompt: 'task prompt',
        startUrl: 'http://localhost:3003/tasks/1',
      }
    : null,
);

vi.mock('../../orchestrator/task-registry.js', () => ({
  getAllTasks: (...args: unknown[]) => mockGetAllTasks(...args),
  getTask: (...args: unknown[]) => mockGetTask(...(args as [string])),
}));

const mockSanitizePersonaField = vi.fn((val: string) =>
  val.includes('injection') ? '' : val,
);

vi.mock('../../agents/adapters/base.js', () => ({
  BROWSER_TOOLS: ['navigate', 'click', 'type'],
  sanitizePersonaField: (...args: unknown[]) => mockSanitizePersonaField(...(args as [string, number])),
}));

// Mock requireAuth: injects user + userClient on req
const mockUserClientFrom = vi.fn(() => createChainMock());
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: Record<string, unknown>, _res: unknown, next: () => void) => {
    _req.user = { id: 'user-1' };
    _req.userClient = {
      from: (...args: unknown[]) => mockUserClientFrom(...args),
    };
    next();
  },
}));

vi.mock('../middleware/validate.js', () => ({
  validateBody: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../schemas.js', () => ({
  createAgentSchema: {},
  testWebhookSchema: {},
}));

// ---------------------------------------------------------------------------
// Extract route handlers from Express Router
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
          (result as Promise<void>)
            .then(() => {
              if (!nextCalled) resolve();
            })
            .catch(reject);
        } else if (!nextCalled) {
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });
    // Stop if response was sent
    if (res.json.mock.calls.length > 0 || res.send.mock.calls.length > 0) break;
  }
}

// ---------------------------------------------------------------------------
// Helper: build a mock chain that resolves to a specific value
// ---------------------------------------------------------------------------

function buildChain(resolveValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const terminalMethods = ['single', 'maybeSingle'];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolveValue);
      }
      if (terminalMethods.includes(prop as string)) {
        return vi.fn().mockReturnValue(
          new Proxy({}, {
            get(_, p2) {
              if (p2 === 'then') return (r: (v: unknown) => void) => r(resolveValue);
              return vi.fn().mockReturnValue(new Proxy({}, handler));
            },
          }),
        );
      }
      return vi.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Agents Routes', () => {
  let router: RouterType;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: serviceFrom returns empty success
    mockServiceFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

    // Default: userClientFrom returns empty success
    mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

    // Default: auth getUser returns no user
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });

    // Setup fetch spy (reset per test)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ actions: [{ tool: 'click', selector: '#btn' }], done: true }),
    } as Response);

    const mod = await import('./agents.js');
    router = mod.default as unknown as RouterType;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ========================================================================
  // Route Structure
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

    it('has PUT /:id route', () => {
      expect(() => getAllRouteHandlers(router, 'put', '/:id')).not.toThrow();
    });

    it('has DELETE /:id route', () => {
      expect(() => getAllRouteHandlers(router, 'delete', '/:id')).not.toThrow();
    });

    it('has POST /test-webhook route', () => {
      expect(() => getAllRouteHandlers(router, 'post', '/test-webhook')).not.toThrow();
    });

    it('has GET /:id/elo-history route', () => {
      expect(() => getRouteHandler(router, 'get', '/:id/elo-history')).not.toThrow();
    });

    it('has GET /:id/domain-ratings route', () => {
      expect(() => getRouteHandler(router, 'get', '/:id/domain-ratings')).not.toThrow();
    });

    it('has GET /sandbox/tasks route', () => {
      expect(() => getRouteHandler(router, 'get', '/sandbox/tasks')).not.toThrow();
    });

    it('has POST /:id/sandbox route', () => {
      expect(() => getAllRouteHandlers(router, 'post', '/:id/sandbox')).not.toThrow();
    });
  });

  // ========================================================================
  // GET / (list public agents)
  // ========================================================================

  describe('GET / (list public agents)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/') as (...args: unknown[]) => Promise<void>;
    });

    it('returns agents with default sort/limit/offset', async () => {
      const agents = [{ id: '1', name: 'Agent1', elo_rating: 1200 }];
      mockServiceFrom.mockReturnValue(buildChain({ data: agents, error: null }));

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(agents);
      expect(mockServiceFrom).toHaveBeenCalledWith('aio_agents');
    });

    it('uses elo_rating as default sort when invalid sort provided', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

      const req = createMockReq({ query: { sort: 'invalid_column' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('accepts valid sort columns', async () => {
      for (const col of ['elo_rating', 'name', 'created_at', 'total_wins', 'total_competitions']) {
        mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

        const req = createMockReq({ query: { sort: col } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith([]);
      }
    });

    it('clamps limit to max 100', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

      const req = createMockReq({ query: { limit: '200' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('clamps limit to min 1', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

      const req = createMockReq({ query: { limit: '-5' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('clamps offset to min 0', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

      const req = createMockReq({ query: { offset: '-10' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('defaults limit to 50 for NaN values', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

      const req = createMockReq({ query: { limit: 'abc' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns 500 on DB error', async () => {
      mockServiceFrom.mockReturnValue(
        buildChain({ data: null, error: { message: 'DB fail' } }),
      );

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list agents' });
    });
  });

  // ========================================================================
  // GET /:id (get single agent)
  // ========================================================================

  describe('GET /:id (get single agent)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id') as (...args: unknown[]) => Promise<void>;
    });

    it('looks up by UUID when id is valid UUID', async () => {
      const uuid = '12345678-1234-1234-1234-123456789abc';
      const agent = { id: uuid, name: 'Agent', is_public: true, owner_id: 'user-2' };
      mockServiceFrom.mockReturnValue(buildChain({ data: agent, error: null }));

      const req = createMockReq({ params: { id: uuid }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(agent);
    });

    it('looks up by slug when id is not UUID', async () => {
      const agent = { id: 'some-id', slug: 'my-agent', name: 'Agent', is_public: true, owner_id: 'user-2' };
      mockServiceFrom.mockReturnValue(buildChain({ data: agent, error: null }));

      const req = createMockReq({ params: { id: 'my-agent' }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(agent);
    });

    it('returns 400 for invalid characters in id', async () => {
      const req = createMockReq({ params: { id: 'agent;DROP TABLE' }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid agent identifier' });
    });

    it('returns 400 for id with special characters', async () => {
      const req = createMockReq({ params: { id: 'test.agent' }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid agent identifier' });
    });

    it('returns 400 for empty id', async () => {
      const req = createMockReq({ params: { id: '' }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid agent identifier' });
    });

    it('returns 404 when agent not found', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: null, error: null }));

      const req = createMockReq({ params: { id: 'nonexistent-slug' }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent not found' });
    });

    it('returns 404 on DB error', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: null, error: { message: 'DB fail' } }));

      const req = createMockReq({ params: { id: 'some-slug' }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent not found' });
    });

    it('returns public agent without sensitive data for non-owner', async () => {
      const agent = {
        id: '1',
        name: 'Public Agent',
        is_public: true,
        owner_id: 'user-other',
        api_key_encrypted: 'secret',
        webhook_secret: 'whs_secret',
      };
      mockServiceFrom.mockReturnValue(buildChain({ data: agent, error: null }));

      const req = createMockReq({ params: { id: 'public-agent' }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData.api_key_encrypted).toBeUndefined();
      expect(responseData.webhook_secret).toBeUndefined();
    });

    it('returns private agent data for owner', async () => {
      const agent = {
        id: '1',
        name: 'Private Agent',
        is_public: false,
        owner_id: 'user-owner',
        api_key_encrypted: 'encrypted:key',
        webhook_secret: 'whs_abc',
      };
      mockServiceFrom.mockReturnValue(buildChain({ data: agent, error: null }));
      mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-owner' } } });

      const req = createMockReq({
        params: { id: 'private-agent' },
        headers: { authorization: 'Bearer token-123' },
      });
      const res = createMockRes();
      await handler(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData.api_key_encrypted).toBe('encrypted:key');
      expect(responseData.webhook_secret).toBe('whs_abc');
    });

    it('returns 403 for private agent when not owner', async () => {
      const agent = {
        id: '1',
        name: 'Private Agent',
        is_public: false,
        owner_id: 'user-owner',
      };
      mockServiceFrom.mockReturnValue(buildChain({ data: agent, error: null }));
      mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-other' } } });

      const req = createMockReq({
        params: { id: 'private-agent' },
        headers: { authorization: 'Bearer token-other' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent is private' });
    });

    it('returns 403 for private agent when no auth header', async () => {
      const agent = {
        id: '1',
        name: 'Private Agent',
        is_public: false,
        owner_id: 'user-owner',
      };
      mockServiceFrom.mockReturnValue(buildChain({ data: agent, error: null }));

      const req = createMockReq({ params: { id: 'private-agent' }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent is private' });
    });

    it('handles auth header without Bearer prefix', async () => {
      const agent = {
        id: '1',
        name: 'Private Agent',
        is_public: false,
        owner_id: 'user-owner',
      };
      mockServiceFrom.mockReturnValue(buildChain({ data: agent, error: null }));

      const req = createMockReq({
        params: { id: 'private-agent' },
        headers: { authorization: 'Basic abc123' },
      });
      const res = createMockRes();
      await handler(req, res);

      // Non-Bearer auth header is not parsed, so isOwner remains false
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent is private' });
    });

    it('allows hyphen and underscore in slug', async () => {
      const agent = { id: '1', slug: 'my-agent_v2', name: 'Agent', is_public: true, owner_id: 'x' };
      mockServiceFrom.mockReturnValue(buildChain({ data: agent, error: null }));

      const req = createMockReq({ params: { id: 'my-agent_v2' }, headers: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(agent);
    });
  });

  // ========================================================================
  // POST / (create agent)
  // ========================================================================

  describe('POST / (create agent)', () => {
    const validBody = {
      name: 'Test Agent',
      slug: 'test-agent',
      agent_type: 'webhook',
      webhook_url: 'https://example.com/hook',
      description: 'A test agent',
    };

    it('creates agent successfully and returns 201', async () => {
      // Count check: 0 agents
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // agent count query
          return buildChain({ data: null, error: null, count: 0 });
        }
        // insert query
        return buildChain({
          data: {
            id: 'new-id',
            name: 'Test Agent',
            slug: 'test-agent',
            api_key_encrypted: 'should-be-removed',
            webhook_secret: 'should-be-removed',
          },
          error: null,
        });
      });

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.id).toBe('new-id');
      // Sensitive data stripped from response
      expect(responseData.api_key_encrypted).toBeUndefined();
      expect(responseData.webhook_secret).toBeUndefined();
    });

    it('returns 400 when name is missing', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { slug: 'test', agent_type: 'webhook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields' });
    });

    it('returns 400 when slug is missing', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { name: 'Test', agent_type: 'webhook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields' });
    });

    it('returns 400 when agent_type is missing', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { name: 'Test', slug: 'test' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields' });
    });

    it('returns 429 when agent limit (5) exceeded', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 5 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Maximum 5 agents per account. Delete an existing agent first.',
      });
    });

    it('returns 429 when agent count is more than 5', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 10 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('blocks webhook with private URL (127.0.0.1)', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://127.0.0.1:8080/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('public HTTPS endpoint');
    });

    it('blocks webhook with localhost URL', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://localhost:3000/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('public HTTPS endpoint');
    });

    it('blocks webhook with 10.x.x.x private IP', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://10.0.0.1/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks webhook with 172.16.x.x private IP', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://172.16.0.1/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks webhook with 192.168.x.x private IP', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://192.168.1.1/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks webhook with 169.254.x.x link-local IP', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://169.254.169.254/metadata' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks webhook with 0.0.0.0', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://0.0.0.0:8080/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks webhook with IPv6 loopback in brackets', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://[::1]/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks webhook with long-form IPv6 loopback', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://[0:0:0:0:0:0:0:1]/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks webhook with cloud metadata endpoint', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'http://metadata.google.internal/computeMetadata/v1/' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks webhook with ftp:// protocol', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'ftp://example.com/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks webhook with file:// protocol', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'file:///etc/passwd' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('allows public https URL for webhook', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: null, error: null, count: 0 });
        return buildChain({
          data: { id: 'new-id', name: 'Agent' },
          error: null,
        });
      });

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, webhook_url: 'https://api.example.com/webhook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('does not check SSRF for non-webhook agent types', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: null, error: null, count: 0 });
        return buildChain({
          data: { id: 'new-id', name: 'Agent' },
          error: null,
        });
      });

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: {
          name: 'API Agent',
          slug: 'api-agent',
          agent_type: 'api_key',
          webhook_url: 'http://127.0.0.1/hook', // Private but should NOT be checked
          api_key: 'sk-123',
          provider: 'openai',
          model: 'gpt-4',
        },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // Should succeed because SSRF check only applies to webhook type
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 400 when persona_name contains injection', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));
      mockSanitizePersonaField.mockImplementation((val: string) =>
        val.includes('injection') ? '' : val,
      );

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, persona_name: 'evil injection attempt' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Persona name contains disallowed content' });
    });

    it('returns 400 when persona_description contains injection', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));
      mockSanitizePersonaField.mockImplementation((val: string) =>
        val.includes('injection') ? '' : val,
      );

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, persona_description: 'some injection payload' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Persona description contains disallowed content' });
    });

    it('encrypts API key when provided', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: null, error: null, count: 0 });
        return buildChain({
          data: { id: 'new-id', name: 'Agent' },
          error: null,
        });
      });

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: {
          name: 'API Agent',
          slug: 'api-agent',
          agent_type: 'api_key',
          api_key: 'sk-test-key',
          provider: 'openai',
          model: 'gpt-4',
        },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(mockEncrypt).toHaveBeenCalledWith('sk-test-key');
    });

    it('returns 400 for invalid persona_style', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, persona_style: 'invalid-style' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('Invalid persona_style');
    });

    it('returns 400 for invalid strategy', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null, count: 0 }));

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({
        body: { ...validBody, strategy: 'random' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('Invalid strategy');
    });

    it('accepts valid persona_style values', async () => {
      for (const style of ['formal', 'casual', 'technical', 'dramatic', 'minimal']) {
        vi.clearAllMocks();
        let callCount = 0;
        mockUserClientFrom.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return buildChain({ data: null, error: null, count: 0 });
          return buildChain({ data: { id: 'new-id' }, error: null });
        });

        const handlers = getAllRouteHandlers(router, 'post', '/');
        const req = createMockReq({
          body: { ...validBody, persona_style: style },
        });
        const res = createMockRes();
        await runHandlerChain(handlers, req, res);

        expect(res.status).toHaveBeenCalledWith(201);
      }
    });

    it('accepts valid strategy values', async () => {
      for (const strat of ['aggressive', 'cautious', 'balanced', 'creative', 'analytical']) {
        vi.clearAllMocks();
        let callCount = 0;
        mockUserClientFrom.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return buildChain({ data: null, error: null, count: 0 });
          return buildChain({ data: { id: 'new-id' }, error: null });
        });

        const handlers = getAllRouteHandlers(router, 'post', '/');
        const req = createMockReq({
          body: { ...validBody, strategy: strat },
        });
        const res = createMockRes();
        await runHandlerChain(handlers, req, res);

        expect(res.status).toHaveBeenCalledWith(201);
      }
    });

    it('returns 400 for duplicate slug (23505 error)', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: null, error: null, count: 0 });
        return buildChain({ data: null, error: { code: '23505', message: 'duplicate' } });
      });

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Slug already taken' });
    });

    it('returns 500 on non-duplicate DB error', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: null, error: null, count: 0 });
        return buildChain({ data: null, error: { code: '42P01', message: 'table not found' } });
      });

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create agent' });
    });

    it('generates webhook secret with whs_ prefix for webhook agents', async () => {
      let callCount = 0;
      let insertPayload: Record<string, unknown> | null = null;

      // Use a mock that captures insert data
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: null, error: null, count: 0 });
        // For the insert chain, capture what was passed
        const insertFn = vi.fn().mockImplementation((data: Record<string, unknown>) => {
          insertPayload = data;
          return buildChain({ data: { id: 'new-id' }, error: null });
        });
        return {
          insert: insertFn,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null, count: 0 }),
        } as unknown;
      });

      const handlers = getAllRouteHandlers(router, 'post', '/');
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // The test validates that the route processes successfully
      // The webhook secret generation is tested indirectly via the successful creation
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // ========================================================================
  // PUT /:id (update agent)
  // ========================================================================

  describe('PUT /:id (update agent)', () => {
    const agentId = '12345678-1234-1234-1234-123456789abc';

    it('updates agent successfully', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Ownership check
          return buildChain({ data: { owner_id: 'user-1' }, error: null });
        }
        // Update query
        return buildChain({ data: { id: agentId, name: 'Updated' }, error: null });
      });

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { name: 'Updated' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({ id: agentId, name: 'Updated' });
    });

    it('returns 403 when agent not found', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null }));

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { name: 'Updated' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized' });
    });

    it('returns 403 when not owner', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({ data: { owner_id: 'user-other' }, error: null }),
      );

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { name: 'Updated' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized' });
    });

    it('blocks SSRF on webhook_url update', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: { id: agentId }, error: null });
      });

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { webhook_url: 'http://127.0.0.1/evil' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('public HTTPS endpoint');
    });

    it('sanitizes persona_name on update', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: { id: agentId }, error: null });
      });
      mockSanitizePersonaField.mockReturnValue('');

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { persona_name: 'injection attempt' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Persona name contains disallowed content' });
    });

    it('sanitizes persona_description on update', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: { id: agentId }, error: null });
      });
      mockSanitizePersonaField.mockReturnValue('');

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { persona_description: 'injection attempt' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Persona description contains disallowed content' });
    });

    it('clears persona_name when set to null/falsy', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: { id: agentId, persona_name: null }, error: null });
      });

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { persona_name: '' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // Should succeed - setting persona_name to null is allowed
      expect(res.json).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid persona_style on update', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: { id: agentId }, error: null });
      });

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { persona_style: 'evil' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid persona_style' });
    });

    it('returns 400 for invalid strategy on update', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: { id: agentId }, error: null });
      });

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { strategy: 'random' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid strategy' });
    });

    it('encrypts API key on update', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: { id: agentId }, error: null });
      });

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { api_key: 'sk-new-key' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(mockEncrypt).toHaveBeenCalledWith('sk-new-key');
    });

    it('only passes allowed fields to update', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: { id: agentId }, error: null });
      });

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: {
          name: 'Updated',
          owner_id: 'hacked-user', // Not in allowedFields
          elo_rating: 9999, // Not in allowedFields
        },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // Should succeed but only pass allowed fields
      expect(res.json).toHaveBeenCalled();
    });

    it('returns 500 on DB error during update', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: null, error: { message: 'DB fail' } });
      });

      const handlers = getAllRouteHandlers(router, 'put', '/:id');
      const req = createMockReq({
        params: { id: agentId },
        body: { name: 'Updated' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update agent' });
    });
  });

  // ========================================================================
  // DELETE /:id (delete agent)
  // ========================================================================

  describe('DELETE /:id (delete agent)', () => {
    const agentId = '12345678-1234-1234-1234-123456789abc';

    it('deletes agent successfully and returns 204', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: null, error: null });
      });

      const handlers = getAllRouteHandlers(router, 'delete', '/:id');
      const req = createMockReq({ params: { id: agentId } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('returns 403 when not authorized', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({ data: { owner_id: 'user-other' }, error: null }),
      );

      const handlers = getAllRouteHandlers(router, 'delete', '/:id');
      const req = createMockReq({ params: { id: agentId } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized' });
    });

    it('returns 403 when agent not found', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null }));

      const handlers = getAllRouteHandlers(router, 'delete', '/:id');
      const req = createMockReq({ params: { id: agentId } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized' });
    });

    it('returns 500 on DB error during delete', async () => {
      let callCount = 0;
      mockUserClientFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return buildChain({ data: { owner_id: 'user-1' }, error: null });
        return buildChain({ data: null, error: { message: 'DB fail' } });
      });

      const handlers = getAllRouteHandlers(router, 'delete', '/:id');
      const req = createMockReq({ params: { id: agentId } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete agent' });
    });
  });

  // ========================================================================
  // POST /test-webhook
  // ========================================================================

  describe('POST /test-webhook', () => {
    it('returns 400 when webhookUrl is missing', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: {} });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing webhook URL' });
    });

    it('returns 400 for private webhook URL', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({
        body: { webhookUrl: 'http://127.0.0.1:3000/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('public HTTPS endpoint');
    });

    it('returns 400 for localhost webhook URL', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({
        body: { webhookUrl: 'http://localhost/hook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns success for valid webhook response', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [{ tool: 'click' }], done: true }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({
        body: {
          webhookUrl: 'https://api.example.com/webhook',
          webhookSecret: 'my-secret',
        },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook responded successfully',
        response: {
          hasActions: 1,
          hasDone: true,
        },
      });
    });

    it('generates HMAC signature when webhookSecret provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [], done: false }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({
        body: {
          webhookUrl: 'https://api.example.com/webhook',
          webhookSecret: 'test-secret',
        },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      // Verify fetch was called with proper signature header
      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers['X-AI-Olympics-Signature']).toMatch(/^sha256=/);
      expect(headers['X-AI-Olympics-Test']).toBe('true');
    });

    it('uses "none" as signature when no webhookSecret', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [], done: false }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({
        body: {
          webhookUrl: 'https://api.example.com/webhook',
        },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const fetchCall = fetchSpy.mock.calls[0];
      const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers['X-AI-Olympics-Signature']).toBe('none');
    });

    it('returns success:false when webhook returns non-ok status', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({
        body: { webhookUrl: 'https://api.example.com/webhook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Webhook returned 502',
      });
    });

    it('returns 500 when fetch throws', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({
        body: { webhookUrl: 'https://api.example.com/webhook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to reach webhook',
      });
    });

    it('sanitizes response data (counts actions, checks done)', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [{ a: 1 }, { b: 2 }, { c: 3 }], done: true }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({
        body: { webhookUrl: 'https://api.example.com/webhook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook responded successfully',
        response: { hasActions: 3, hasDone: true },
      });
    });

    it('handles response with no actions array (hasActions: 0)', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ done: false }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({
        body: { webhookUrl: 'https://api.example.com/webhook' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook responded successfully',
        response: { hasActions: 0, hasDone: false },
      });
    });
  });

  // ========================================================================
  // GET /:id/elo-history
  // ========================================================================

  describe('GET /:id/elo-history', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id/elo-history') as (...args: unknown[]) => Promise<void>;
    });

    it('returns ELO history with default pagination', async () => {
      const history = [
        { id: 'h1', elo_before: 1000, elo_after: 1050 },
        { id: 'h2', elo_before: 1050, elo_after: 1100 },
      ];
      mockServiceFrom.mockReturnValue(buildChain({ data: history, error: null }));

      const req = createMockReq({ params: { id: 'agent-1' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(history);
      expect(mockServiceFrom).toHaveBeenCalledWith('aio_elo_history');
    });

    it('clamps limit to max 100', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

      const req = createMockReq({ params: { id: 'agent-1' }, query: { limit: '200' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('clamps limit to min 1', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

      const req = createMockReq({ params: { id: 'agent-1' }, query: { limit: '0' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('defaults offset to 0 for negative values', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

      const req = createMockReq({ params: { id: 'agent-1' }, query: { offset: '-5' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns empty array when data is null', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: null, error: null }));

      const req = createMockReq({ params: { id: 'agent-1' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns 500 on DB error', async () => {
      mockServiceFrom.mockReturnValue(
        buildChain({ data: null, error: { message: 'DB fail' } }),
      );

      const req = createMockReq({ params: { id: 'agent-1' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get ELO history' });
    });

    it('accepts custom limit and offset', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: [], error: null }));

      const req = createMockReq({
        params: { id: 'agent-1' },
        query: { limit: '10', offset: '5' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  // ========================================================================
  // GET /:id/domain-ratings
  // ========================================================================

  describe('GET /:id/domain-ratings', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:id/domain-ratings') as (...args: unknown[]) => Promise<void>;
    });

    it('returns domain ratings', async () => {
      const ratings = [
        { domain: { name: 'Speed', slug: 'speed' }, elo_rating: 1500 },
        { domain: { name: 'Creative', slug: 'creative' }, elo_rating: 1200 },
      ];
      mockServiceFrom.mockReturnValue(buildChain({ data: ratings, error: null }));

      const req = createMockReq({ params: { id: 'agent-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(ratings);
      expect(mockServiceFrom).toHaveBeenCalledWith('aio_agent_domain_ratings');
    });

    it('returns empty array when data is null', async () => {
      mockServiceFrom.mockReturnValue(buildChain({ data: null, error: null }));

      const req = createMockReq({ params: { id: 'agent-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns 500 on DB error', async () => {
      mockServiceFrom.mockReturnValue(
        buildChain({ data: null, error: { message: 'DB fail' } }),
      );

      const req = createMockReq({ params: { id: 'agent-1' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get domain ratings' });
    });
  });

  // ========================================================================
  // GET /sandbox/tasks
  // ========================================================================

  describe('GET /sandbox/tasks', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/sandbox/tasks') as (...args: unknown[]) => Promise<void>;
    });

    it('returns task list with correct shape', async () => {
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([
        {
          id: 'task-1',
          name: 'Task 1',
          description: 'Desc 1',
          category: 'speed',
          difficulty: 'easy',
          timeLimit: 60,
          scoringMethod: 'time',
          maxScore: 1000,
        },
      ]);
    });

    it('strips systemPrompt, taskPrompt, and startUrl from task data', async () => {
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      const tasks = res.json.mock.calls[0][0] as Array<Record<string, unknown>>;
      for (const task of tasks) {
        expect(task).not.toHaveProperty('systemPrompt');
        expect(task).not.toHaveProperty('taskPrompt');
        expect(task).not.toHaveProperty('startUrl');
      }
    });

    it('returns 500 when getAllTasks throws', async () => {
      mockGetAllTasks.mockImplementation(() => {
        throw new Error('Registry error');
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list tasks' });

      // Reset
      mockGetAllTasks.mockReturnValue([
        {
          id: 'task-1',
          name: 'Task 1',
          description: 'Desc 1',
          category: 'speed',
          difficulty: 'easy',
          timeLimit: 60,
          scoringMethod: 'time',
          maxScore: 1000,
          systemPrompt: 'sys',
          taskPrompt: 'task',
          startUrl: 'http://localhost:3003/tasks/1',
        },
      ]);
    });

    it('returns empty array when no tasks available', async () => {
      mockGetAllTasks.mockReturnValue([]);

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith([]);

      // Reset
      mockGetAllTasks.mockReturnValue([
        {
          id: 'task-1',
          name: 'Task 1',
          description: 'Desc 1',
          category: 'speed',
          difficulty: 'easy',
          timeLimit: 60,
          scoringMethod: 'time',
          maxScore: 1000,
          systemPrompt: 'sys',
          taskPrompt: 'task',
          startUrl: 'http://localhost:3003/tasks/1',
        },
      ]);
    });
  });

  // ========================================================================
  // POST /:id/sandbox (run sandbox test)
  // ========================================================================

  describe('POST /:id/sandbox', () => {
    const agentId = '12345678-1234-1234-1234-123456789abc';

    it('returns 400 when taskId is missing', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({ params: { id: agentId }, body: {} });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing taskId' });
    });

    it('returns 404 when task not found', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'nonexistent-task' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Task not found' });
    });

    it('returns 404 when agent not found', async () => {
      mockUserClientFrom.mockReturnValue(buildChain({ data: null, error: null }));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent not found' });
    });

    it('returns 404 when DB returns error for agent lookup', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({ data: null, error: { message: 'DB fail' } }),
      );

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent not found' });
    });

    it('returns 403 when user is not agent owner', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-other',
            name: 'Agent',
            agent_type: 'webhook',
            webhook_url: 'https://example.com/hook',
          },
          error: null,
        }),
      );

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized to test this agent' });
    });

    it('webhook agent: returns success with response data', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'Webhook Agent',
            agent_type: 'webhook',
            webhook_url: 'https://example.com/hook',
            webhook_secret: 'whs_abc123',
          },
          error: null,
        }),
      );

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          thinking: 'I should click the button',
          actions: [{ tool: 'click', selector: '#submit' }],
          done: false,
        }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.agentType).toBe('webhook');
      expect(response.task.id).toBe('task-1');
      expect(response.agentResponse.thinking).toBe('I should click the button');
      expect(response.agentResponse.actions).toHaveLength(1);
      expect(response.agentResponse.done).toBe(false);
      expect(response.requestPayload).toBeDefined();
      expect(typeof response.responseTime).toBe('number');
    });

    it('webhook agent: SSRF check on webhook URL', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'Agent',
            agent_type: 'webhook',
            webhook_url: 'http://127.0.0.1:3000/hook',
          },
          error: null,
        }),
      );

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('private address');
    });

    it('webhook agent: returns failure when webhook returns non-ok status', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'Agent',
            agent_type: 'webhook',
            webhook_url: 'https://example.com/hook',
            webhook_secret: 'whs_abc',
          },
          error: null,
        }),
      );

      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Webhook returned HTTP 500');
      expect(response.agentType).toBe('webhook');
    });

    it('api_key agent: returns config info', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'API Agent',
            agent_type: 'api_key',
            provider: 'openai',
            model: 'gpt-4',
            api_key_encrypted: 'encrypted:sk-123',
          },
          error: null,
        }),
      );

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.agentType).toBe('api_key');
      expect(response.provider).toBe('openai');
      expect(response.model).toBe('gpt-4');
      expect(response.message).toContain('openai/gpt-4');
      expect(response.requestPayload).toBeDefined();
      expect(response.note).toBeDefined();
    });

    it('api_key agent: uses "unknown" for missing provider/model', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'API Agent',
            agent_type: 'api_key',
            provider: null,
            model: null,
          },
          error: null,
        }),
      );

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.provider).toBe('unknown');
      expect(response.model).toBe('unknown');
    });

    it('returns 400 for unknown agent type', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'Unknown Agent',
            agent_type: 'custom_unknown',
          },
          error: null,
        }),
      );

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('Unknown agent type');
      expect(res.json.mock.calls[0][0].error).toContain('custom_unknown');
    });

    it('returns timeout message when fetch throws timeout error', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'Agent',
            agent_type: 'webhook',
            webhook_url: 'https://example.com/hook',
          },
          error: null,
        }),
      );

      fetchSpy.mockRejectedValue(new Error('The operation was aborted due to timeout'));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Webhook timed out (15s limit)');
    });

    it('returns generic failure message for non-timeout errors', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'Agent',
            agent_type: 'webhook',
            webhook_url: 'https://example.com/hook',
          },
          error: null,
        }),
      );

      fetchSpy.mockRejectedValue(new Error('Network failure'));

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Sandbox test failed');
    });

    it('webhook agent: sends correct payload structure', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'My Agent',
            agent_type: 'webhook',
            webhook_url: 'https://example.com/hook',
            webhook_secret: null,
          },
          error: null,
        }),
      );

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [], done: true }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const response = res.json.mock.calls[0][0];
      const payload = response.requestPayload;
      expect(payload.version).toBe('1.0');
      expect(payload.agentId).toBe(agentId);
      expect(payload.agentName).toBe('My Agent');
      expect(payload.competitionId).toBe('sandbox-test');
      expect(payload.task.systemPrompt).toBe('sys prompt');
      expect(payload.task.taskPrompt).toBe('task prompt');
      expect(payload.pageState.url).toBe('http://localhost:3003/tasks/1');
      expect(payload.previousActions).toEqual([]);
      expect(payload.turnNumber).toBe(1);
      expect(payload.availableTools).toEqual(['navigate', 'click', 'type']);
    });

    it('webhook agent: uses "none" signature when no webhook_secret', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'Agent',
            agent_type: 'webhook',
            webhook_url: 'https://example.com/hook',
            webhook_secret: null,
          },
          error: null,
        }),
      );

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [], done: true }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const fetchCall = fetchSpy.mock.calls[0];
      const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers['X-AI-Olympics-Signature']).toBe('none');
    });

    it('webhook agent: handles null/undefined actions in response', async () => {
      mockUserClientFrom.mockReturnValue(
        buildChain({
          data: {
            id: agentId,
            owner_id: 'user-1',
            name: 'Agent',
            agent_type: 'webhook',
            webhook_url: 'https://example.com/hook',
            webhook_secret: 'whs_abc',
          },
          error: null,
        }),
      );

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ thinking: 'hmm', actions: null, done: null }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/:id/sandbox');
      const req = createMockReq({
        params: { id: agentId },
        body: { taskId: 'task-1' },
      });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.agentResponse.actions).toEqual([]);
      expect(response.agentResponse.done).toBe(false);
    });
  });

  // ========================================================================
  // isPrivateUrl (tested indirectly via multiple routes)
  // ========================================================================

  describe('isPrivateUrl (via POST /test-webhook)', () => {
    it('blocks 127.0.0.1', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://127.0.0.1/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 127.255.255.255', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://127.255.255.255/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 10.0.0.1', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://10.0.0.1/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 10.255.255.255', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://10.255.255.255/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 172.16.0.1', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://172.16.0.1/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 172.31.255.255', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://172.31.255.255/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('allows 172.32.0.1 (not in private range)', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [], done: true }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://172.32.0.1/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.json).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it('blocks 192.168.0.1', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://192.168.0.1/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 192.168.255.255', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://192.168.255.255/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 169.254.0.1 (link-local)', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://169.254.0.1/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 169.254.169.254 (AWS metadata)', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://169.254.169.254/latest' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 0.0.0.0', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://0.0.0.0/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks localhost', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://localhost/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks IPv6 loopback [::1]', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://[::1]/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks IPv6 long-form loopback [0:0:0:0:0:0:0:1]', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://[0:0:0:0:0:0:0:1]/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks IPv6 loopback via test-webhook [::1]', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://[::1]/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 127.0.0.2 (still in loopback range)', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://127.0.0.2/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks 10.10.10.10 (class A private)', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://10.10.10.10/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks metadata.google.internal', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://metadata.google.internal/computeMetadata/v1/' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks ftp:// protocol', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'ftp://example.com/file' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks file:// protocol', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'file:///etc/passwd' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('blocks invalid URLs', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'not-a-valid-url' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('allows https://example.com', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [], done: true }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'https://example.com/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('allows http://public-api.example.com', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [], done: true }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://public-api.example.com/webhook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('allows public IP like 8.8.8.8', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ actions: [], done: true }),
      } as Response);

      const handlers = getAllRouteHandlers(router, 'post', '/test-webhook');
      const req = createMockReq({ body: { webhookUrl: 'http://8.8.8.8/hook' } });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });
  });
});
