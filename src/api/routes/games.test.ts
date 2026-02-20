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
// Mock puzzle service
// ---------------------------------------------------------------------------

const mockPuzzleService = {
  getGameTypes: vi.fn(),
  getLeaderboard: vi.fn(),
  getGlobalLeaderboard: vi.fn(),
  getUserStats: vi.fn(),
  getRecentAttempts: vi.fn(),
  getPuzzle: vi.fn(),
  submitAnswer: vi.fn(),
  checkAnswer: vi.fn(),
  submitSession: vi.fn(),
};

vi.mock('../../services/puzzle-service/index.js', () => ({
  puzzleService: mockPuzzleService,
  GAME_TYPES: ['math', 'logic', 'word', 'trivia', 'code', 'chess', 'cipher', 'spatial'] as const,
  DIFFICULTIES: ['easy', 'medium', 'hard'] as const,
}));

// ---------------------------------------------------------------------------
// Mock supabase utils
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockAgentFrom = vi.fn();
const mockAgentSelect = vi.fn();
const mockAgentEq = vi.fn();
const mockAgentSingle = vi.fn();

vi.mock('../../shared/utils/supabase.js', () => {
  const chainable: Record<string, unknown> = {};
  chainable.select = vi.fn().mockReturnValue(chainable);
  chainable.eq = vi.fn().mockReturnValue(chainable);
  chainable.single = vi.fn().mockResolvedValue({ data: null, error: null });

  return {
    serviceClient: {
      from: vi.fn().mockReturnValue(chainable),
    },
    createUserClient: vi.fn(() => ({
      auth: { getUser: mockGetUser },
      from: mockAgentFrom,
    })),
    extractToken: vi.fn((header?: string) => header?.replace('Bearer ', '') || null),
  };
});

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../middleware/validate.js', () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../schemas.js', () => ({
  puzzleSubmitSchema: {},
  sessionSubmitSchema: {},
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

/**
 * Run the full handler chain (middleware + route handler) sequentially.
 * Stops if any handler sends a response (calls res.json or res.status).
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
          // Synchronous handler that didn't call next - check if response was sent
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });
    // If response was already sent, stop the chain
    if (res.json.mock.calls.length > 0) break;
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Games Routes', () => {
  let router: RouterType;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset agent ownership verification chain
    mockAgentFrom.mockReturnValue({
      select: mockAgentSelect.mockReturnValue({
        eq: mockAgentEq.mockReturnValue({
          single: mockAgentSingle.mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    // Default: getUser returns no user (unauthenticated)
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const mod = await import('./games.js');
    router = mod.default as unknown as RouterType;
  });

  // ========================================================================
  // 1. GET / (list game types)
  // ========================================================================

  describe('GET / (list game types)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/') as (...args: unknown[]) => Promise<void>;
    });

    it('returns games array with count on success', async () => {
      const gameTypes = [
        { id: 'math', name: 'Math', description: 'Math puzzles' },
        { id: 'logic', name: 'Logic', description: 'Logic puzzles' },
      ];
      mockPuzzleService.getGameTypes.mockResolvedValue(gameTypes);

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getGameTypes).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        games: gameTypes,
        count: 2,
      });
    });

    it('returns empty array when no game types exist', async () => {
      mockPuzzleService.getGameTypes.mockResolvedValue([]);

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({ games: [], count: 0 });
    });

    it('returns 500 when puzzleService.getGameTypes throws', async () => {
      mockPuzzleService.getGameTypes.mockRejectedValue(new Error('DB connection failed'));

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch game types' });
    });
  });

  // ========================================================================
  // 2. GET /leaderboard (combined)
  // ========================================================================

  describe('GET /leaderboard (combined)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/leaderboard') as (...args: unknown[]) => Promise<void>;
    });

    it('calls getLeaderboard for each game type and merges results sorted by score', async () => {
      // Return entries for two game types, leave others empty
      mockPuzzleService.getLeaderboard.mockImplementation((gameType: string) => {
        if (gameType === 'math') {
          return Promise.resolve([
            { player_type: 'user', player_id: 'u1', total_score: 100, player_name: 'Alice' },
          ]);
        }
        if (gameType === 'logic') {
          return Promise.resolve([
            { player_type: 'agent', player_id: 'a1', total_score: 200, player_name: 'BotX' },
          ]);
        }
        return Promise.resolve([]);
      });

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      // Should have called getLeaderboard for all 8 game types
      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledTimes(8);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Sorted descending: 200 first, 100 second
      expect(result.leaderboard[0]).toEqual({
        gameType: 'logic',
        userId: undefined,
        agentId: 'a1',
        score: 200,
        username: 'BotX',
      });
      expect(result.leaderboard[1]).toEqual({
        gameType: 'math',
        userId: 'u1',
        agentId: undefined,
        score: 100,
        username: 'Alice',
      });
    });

    it('respects limit query param with default of 10', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      // default limit = 10
      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith(expect.any(String), 10);
    });

    it('parses explicit limit query param', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: '25' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith(expect.any(String), 25);
    });

    it('clamps limit to max 50', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: '999' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith(expect.any(String), 50);
    });

    it('defaults NaN limit to 10', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: 'abc' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith(expect.any(String), 10);
    });

    it('handles array limit param (takes first)', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: ['5', '20'] } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith(expect.any(String), 5);
    });

    it('returns count of total entries', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([
        { player_type: 'user', player_id: 'u1', total_score: 50, player_name: 'X' },
      ]);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // 8 game types * 1 entry each
      expect(result.count).toBe(8);
    });

    it('returns 500 when service throws', async () => {
      mockPuzzleService.getLeaderboard.mockRejectedValue(new Error('Service down'));

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch leaderboard' });
    });

    it('maps user entries with userId and agent entries with agentId', async () => {
      mockPuzzleService.getLeaderboard.mockImplementation((gameType: string) => {
        if (gameType === 'math') {
          return Promise.resolve([
            { player_type: 'user', player_id: 'user-1', total_score: 50, player_name: 'Human' },
            { player_type: 'agent', player_id: 'agent-1', total_score: 40, player_name: 'Bot' },
          ]);
        }
        return Promise.resolve([]);
      });

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const userEntry = result.leaderboard.find((e: { userId?: string }) => e.userId === 'user-1');
      const agentEntry = result.leaderboard.find((e: { agentId?: string }) => e.agentId === 'agent-1');
      expect(userEntry.agentId).toBeUndefined();
      expect(agentEntry.userId).toBeUndefined();
    });
  });

  // ========================================================================
  // 3. GET /leaderboard/global
  // ========================================================================

  describe('GET /leaderboard/global', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/leaderboard/global') as (...args: unknown[]) => Promise<void>;
    });

    it('returns global leaderboard on success', async () => {
      const leaderboard = [
        { player_id: 'u1', total_score: 500 },
        { player_id: 'u2', total_score: 300 },
      ];
      mockPuzzleService.getGlobalLeaderboard.mockResolvedValue(leaderboard);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        leaderboard,
        count: 2,
      });
    });

    it('defaults limit to 50', async () => {
      mockPuzzleService.getGlobalLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getGlobalLeaderboard).toHaveBeenCalledWith(50);
    });

    it('parses explicit limit', async () => {
      mockPuzzleService.getGlobalLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: '25' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getGlobalLeaderboard).toHaveBeenCalledWith(25);
    });

    it('clamps limit to max 100', async () => {
      mockPuzzleService.getGlobalLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: '999' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getGlobalLeaderboard).toHaveBeenCalledWith(100);
    });

    it('defaults NaN limit to 50', async () => {
      mockPuzzleService.getGlobalLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: 'abc' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getGlobalLeaderboard).toHaveBeenCalledWith(50);
    });

    it('handles array limit param', async () => {
      mockPuzzleService.getGlobalLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: ['30', '70'] } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getGlobalLeaderboard).toHaveBeenCalledWith(30);
    });

    it('returns 500 when service throws', async () => {
      mockPuzzleService.getGlobalLeaderboard.mockRejectedValue(new Error('DB error'));

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch global leaderboard' });
    });

    it('returns empty leaderboard with count 0', async () => {
      mockPuzzleService.getGlobalLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({ leaderboard: [], count: 0 });
    });
  });

  // ========================================================================
  // 4. GET /stats/me (requires auth)
  // ========================================================================

  describe('GET /stats/me', () => {
    it('returns user stats when authenticated', async () => {
      const stats = { totalGames: 10, wins: 5, averageScore: 75 };
      mockPuzzleService.getUserStats.mockResolvedValue(stats);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.getUserStats).toHaveBeenCalledWith('user-123', undefined);
      expect(res.json).toHaveBeenCalledWith(stats);
    });

    it('passes gameType query param to getUserStats', async () => {
      const stats = { totalGames: 3, wins: 2 };
      mockPuzzleService.getUserStats.mockResolvedValue(stats);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: { gameType: 'math' },
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.getUserStats).toHaveBeenCalledWith('user-123', 'math');
    });

    it('handles array gameType query param (takes first)', async () => {
      mockPuzzleService.getUserStats.mockResolvedValue({});
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: { gameType: ['logic', 'math'] },
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.getUserStats).toHaveBeenCalledWith('user-123', 'logic');
    });

    it('returns 401 when not authenticated', async () => {
      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({ headers: {}, query: {} });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('returns 401 when auth fails (no user returned)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer invalid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('returns 500 when getUserStats throws', async () => {
      mockPuzzleService.getUserStats.mockRejectedValue(new Error('DB fail'));
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch user stats' });
    });

    it('continues without auth when auth middleware throws (optional auth)', async () => {
      // When the auth middleware itself throws, it catches and calls next()
      mockGetUser.mockRejectedValue(new Error('Token expired'));

      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer expired-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      // Should get 401 because userId is not set (auth failed silently)
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ========================================================================
  // 5. GET /history/me (requires auth)
  // ========================================================================

  describe('GET /history/me', () => {
    it('returns user history when authenticated', async () => {
      const history = [{ id: 'attempt-1', score: 80 }, { id: 'attempt-2', score: 95 }];
      mockPuzzleService.getRecentAttempts.mockResolvedValue(history);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-456' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/history/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.getRecentAttempts).toHaveBeenCalledWith('user-456', 20);
      expect(res.json).toHaveBeenCalledWith({ history, count: 2 });
    });

    it('returns 401 when not authenticated', async () => {
      const handlers = getAllRouteHandlers(router, 'get', '/history/me');
      const req = createMockReq({ headers: {}, query: {} });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('respects limit query param', async () => {
      mockPuzzleService.getRecentAttempts.mockResolvedValue([]);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-456' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/history/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: { limit: '50' },
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.getRecentAttempts).toHaveBeenCalledWith('user-456', 50);
    });

    it('clamps limit to max 100', async () => {
      mockPuzzleService.getRecentAttempts.mockResolvedValue([]);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-456' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/history/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: { limit: '500' },
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.getRecentAttempts).toHaveBeenCalledWith('user-456', 100);
    });

    it('defaults NaN limit to 20', async () => {
      mockPuzzleService.getRecentAttempts.mockResolvedValue([]);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-456' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/history/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: { limit: 'bad' },
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.getRecentAttempts).toHaveBeenCalledWith('user-456', 20);
    });

    it('handles array limit param', async () => {
      mockPuzzleService.getRecentAttempts.mockResolvedValue([]);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-456' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/history/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: { limit: ['10', '50'] },
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.getRecentAttempts).toHaveBeenCalledWith('user-456', 10);
    });

    it('returns 500 when getRecentAttempts throws', async () => {
      mockPuzzleService.getRecentAttempts.mockRejectedValue(new Error('DB error'));
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-456' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/history/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch user history' });
    });

    it('returns empty history when no attempts', async () => {
      mockPuzzleService.getRecentAttempts.mockResolvedValue([]);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-456' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/history/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.json).toHaveBeenCalledWith({ history: [], count: 0 });
    });
  });

  // ========================================================================
  // 6. GET /:type (game type details)
  // ========================================================================

  describe('GET /:type (game type details)', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:type') as (...args: unknown[]) => Promise<void>;
    });

    it('returns game details for valid type', async () => {
      const gameTypes = [
        { id: 'math', name: 'Math Puzzles', description: 'Solve math problems' },
        { id: 'logic', name: 'Logic Puzzles', description: 'Solve logic puzzles' },
      ];
      mockPuzzleService.getGameTypes.mockResolvedValue(gameTypes);

      const req = createMockReq({ params: { type: 'math' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(gameTypes[0]);
    });

    it('returns 400 for invalid game type', async () => {
      const req = createMockReq({ params: { type: 'invalid-type' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const errorResponse = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(errorResponse.error).toContain('Invalid game type');
      expect(errorResponse.error).toContain('math');
      expect(errorResponse.error).toContain('logic');
    });

    it('returns 404 when type is valid but not found in results', async () => {
      mockPuzzleService.getGameTypes.mockResolvedValue([
        { id: 'logic', name: 'Logic' },
      ]);

      const req = createMockReq({ params: { type: 'math' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Game type not found' });
    });

    it('returns 500 when getGameTypes throws', async () => {
      mockPuzzleService.getGameTypes.mockRejectedValue(new Error('Service error'));

      const req = createMockReq({ params: { type: 'math' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch game type' });
    });

    it('lists valid types in error message', async () => {
      const req = createMockReq({ params: { type: 'unknown' } });
      const res = createMockRes();
      await handler(req, res);

      const errorResponse = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(errorResponse.error).toBe(
        'Invalid game type. Valid types: math, logic, word, trivia, code, chess, cipher, spatial'
      );
    });
  });

  // ========================================================================
  // 7. GET /:type/puzzle
  // ========================================================================

  describe('GET /:type/puzzle', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:type/puzzle') as (...args: unknown[]) => Promise<void>;
    });

    it('returns puzzle with default medium difficulty', async () => {
      const puzzle = { id: 'p1', question: 'What is 2+2?', difficulty: 'medium' };
      mockPuzzleService.getPuzzle.mockResolvedValue(puzzle);

      const req = createMockReq({ params: { type: 'math' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getPuzzle).toHaveBeenCalledWith('math', 'medium');
      expect(res.json).toHaveBeenCalledWith(puzzle);
    });

    it('uses specified valid difficulty', async () => {
      const puzzle = { id: 'p2', question: 'Hard question', difficulty: 'hard' };
      mockPuzzleService.getPuzzle.mockResolvedValue(puzzle);

      const req = createMockReq({ params: { type: 'math' }, query: { difficulty: 'hard' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getPuzzle).toHaveBeenCalledWith('math', 'hard');
    });

    it('uses easy difficulty when specified', async () => {
      mockPuzzleService.getPuzzle.mockResolvedValue({ id: 'p3' });

      const req = createMockReq({ params: { type: 'logic' }, query: { difficulty: 'easy' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getPuzzle).toHaveBeenCalledWith('logic', 'easy');
    });

    it('defaults to medium for invalid difficulty', async () => {
      mockPuzzleService.getPuzzle.mockResolvedValue({ id: 'p4' });

      const req = createMockReq({ params: { type: 'math' }, query: { difficulty: 'extreme' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getPuzzle).toHaveBeenCalledWith('math', 'medium');
    });

    it('handles array difficulty param (takes first)', async () => {
      mockPuzzleService.getPuzzle.mockResolvedValue({ id: 'p5' });

      const req = createMockReq({ params: { type: 'math' }, query: { difficulty: ['easy', 'hard'] } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getPuzzle).toHaveBeenCalledWith('math', 'easy');
    });

    it('returns 400 for invalid game type', async () => {
      const req = createMockReq({ params: { type: 'invalid' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].error).toContain('Invalid game type');
    });

    it('returns 500 when puzzle generation returns null', async () => {
      mockPuzzleService.getPuzzle.mockResolvedValue(null);

      const req = createMockReq({ params: { type: 'math' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate puzzle' });
    });

    it('returns 500 when getPuzzle throws', async () => {
      mockPuzzleService.getPuzzle.mockRejectedValue(new Error('AI service down'));

      const req = createMockReq({ params: { type: 'math' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate puzzle' });
    });

    it('returns puzzle with undefined difficulty (defaults to medium)', async () => {
      mockPuzzleService.getPuzzle.mockResolvedValue({ id: 'p6' });

      const req = createMockReq({ params: { type: 'word' }, query: { difficulty: undefined } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getPuzzle).toHaveBeenCalledWith('word', 'medium');
    });
  });

  // ========================================================================
  // 8. POST /:type/submit
  // ========================================================================

  describe('POST /:type/submit', () => {
    it('anonymous submit: calls checkAnswer when no auth', async () => {
      const result = { correct: true, score: 100 };
      mockPuzzleService.checkAnswer.mockResolvedValue(result);

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42', timeMs: 5000 },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.checkAnswer).toHaveBeenCalledWith('p1', '42', 5000);
      expect(mockPuzzleService.submitAnswer).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('anonymous submit: defaults timeMs to 0 when not provided', async () => {
      mockPuzzleService.checkAnswer.mockResolvedValue({ correct: false });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42' },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.checkAnswer).toHaveBeenCalledWith('p1', '42', 0);
    });

    it('authenticated submit: calls submitAnswer with userId', async () => {
      const result = { correct: true, score: 150 };
      mockPuzzleService.submitAnswer.mockResolvedValue(result);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-789' } } });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'logic' },
        body: { puzzleId: 'p2', answer: 'true', timeMs: 3000 },
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.submitAnswer).toHaveBeenCalledWith('p2', 'true', 3000, 'user-789', undefined);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('agent submit with auth: calls submitAnswer with agentId', async () => {
      const agentUuid = '12345678-1234-1234-1234-123456789abc';
      const result = { correct: true, score: 200 };
      mockPuzzleService.submitAnswer.mockResolvedValue(result);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-owner' } } });
      // Agent ownership check returns matching owner
      mockAgentSingle.mockResolvedValue({ data: { owner_id: 'user-owner' }, error: null });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'code' },
        body: { puzzleId: 'p3', answer: 'console.log("hello")', timeMs: 10000, agentId: agentUuid },
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.submitAnswer).toHaveBeenCalledWith('p3', 'console.log("hello")', 10000, 'user-owner', agentUuid);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('agent submit with query agentId: calls submitAnswer with agentId', async () => {
      const agentUuid = '12345678-1234-1234-1234-123456789abc';
      const result = { correct: true };
      mockPuzzleService.submitAnswer.mockResolvedValue(result);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-owner' } } });
      mockAgentSingle.mockResolvedValue({ data: { owner_id: 'user-owner' }, error: null });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p4', answer: '7' },
        headers: { authorization: 'Bearer valid-token' },
        query: { agentId: agentUuid },
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.submitAnswer).toHaveBeenCalled();
    });

    it('agent without auth returns 401', async () => {
      const agentUuid = '12345678-1234-1234-1234-123456789abc';

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p5', answer: '10', agentId: agentUuid },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
        success: false,
        error: 'Authentication required when submitting as an agent',
      });
    });

    it('agent ownership mismatch returns 403', async () => {
      const agentUuid = '12345678-1234-1234-1234-123456789abc';
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-wrong' } } });
      // Agent belongs to a different user
      mockAgentSingle.mockResolvedValue({ data: { owner_id: 'user-real-owner' }, error: null });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p6', answer: '5', agentId: agentUuid },
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
        success: false,
        error: 'Not authorized to submit as this agent',
      });
    });

    it('returns 400 when puzzleId is missing', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { answer: '42' },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
        success: false,
        error: 'Missing required fields: puzzleId, answer',
      });
    });

    it('returns 400 when answer is undefined', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1' },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].success).toBe(false);
    });

    it('allows answer=0 (falsy but not undefined)', async () => {
      mockPuzzleService.checkAnswer.mockResolvedValue({ correct: true });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: 0 },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.checkAnswer).toHaveBeenCalledWith('p1', '0', 0);
    });

    it('allows answer="" (empty string)', async () => {
      mockPuzzleService.checkAnswer.mockResolvedValue({ correct: false });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '' },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.checkAnswer).toHaveBeenCalledWith('p1', '', 0);
    });

    it('returns 400 for invalid game type', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'invalid' },
        body: { puzzleId: 'p1', answer: '42' },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
        success: false,
        error: 'Invalid game type. Valid types: math, logic, word, trivia, code, chess, cipher, spatial',
      });
    });

    it('returns 500 when submitAnswer throws', async () => {
      mockPuzzleService.submitAnswer.mockRejectedValue(new Error('DB error'));
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42', timeMs: 1000 },
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to submit answer' });
    });

    it('returns 500 when checkAnswer throws', async () => {
      mockPuzzleService.checkAnswer.mockRejectedValue(new Error('Puzzle not found'));

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42' },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to submit answer' });
    });

    it('converts numeric answer to string', async () => {
      mockPuzzleService.checkAnswer.mockResolvedValue({ correct: true });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: 42, timeMs: 500 },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.checkAnswer).toHaveBeenCalledWith('p1', '42', 500);
    });

    it('non-UUID agentId in body still triggers agent path (bodyAgentId fallback)', async () => {
      // The middleware ignores non-UUID agentId, but the handler destructures
      // agentId directly from body as bodyAgentId, which bypasses UUID check.
      // So 'not-a-uuid' is still truthy => agentId && !userId => 401
      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42', agentId: 'not-a-uuid' },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
        success: false,
        error: 'Authentication required when submitting as an agent',
      });
    });

    it('agent ownership check passes when agent not found in DB', async () => {
      const agentUuid = '12345678-1234-1234-1234-123456789abc';
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
      // Agent not found (data is null)
      mockAgentSingle.mockResolvedValue({ data: null, error: null });
      mockPuzzleService.submitAnswer.mockResolvedValue({ correct: true });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42', agentId: agentUuid },
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      // Should proceed since agent is not found (no ownership violation)
      expect(mockPuzzleService.submitAnswer).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 9. POST /:type/session
  // ========================================================================

  describe('POST /:type/session', () => {
    it('submits session when authenticated', async () => {
      const result = { success: true, sessionId: 's1' };
      mockPuzzleService.submitSession.mockResolvedValue(result);
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-session' } } });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/session');
      const req = createMockReq({
        params: { type: 'math' },
        body: { score: 850, correctCount: 8, totalQuestions: 10, timeSpentMs: 60000 },
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.submitSession).toHaveBeenCalledWith('math', 'user-session', {
        score: 850,
        correctCount: 8,
        totalQuestions: 10,
        timeSpentMs: 60000,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('returns 401 when not authenticated', async () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:type/session');
      const req = createMockReq({
        params: { type: 'math' },
        body: { score: 100, correctCount: 1, totalQuestions: 5, timeSpentMs: 10000 },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required to save scores',
      });
    });

    it('returns 400 for invalid game type', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-session' } } });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/session');
      const req = createMockReq({
        params: { type: 'invalid' },
        body: { score: 100, correctCount: 1, totalQuestions: 5, timeSpentMs: 10000 },
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
        success: false,
        error: 'Invalid game type. Valid types: math, logic, word, trivia, code, chess, cipher, spatial',
      });
    });

    it('returns 500 when submitSession throws', async () => {
      mockPuzzleService.submitSession.mockRejectedValue(new Error('DB error'));
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-session' } } });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/session');
      const req = createMockReq({
        params: { type: 'math' },
        body: { score: 100, correctCount: 1, totalQuestions: 5, timeSpentMs: 10000 },
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to submit session' });
    });

    it('passes all body fields to submitSession', async () => {
      mockPuzzleService.submitSession.mockResolvedValue({ success: true });
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-session' } } });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/session');
      const sessionData = { score: 500, correctCount: 5, totalQuestions: 10, timeSpentMs: 30000 };
      const req = createMockReq({
        params: { type: 'chess' },
        body: sessionData,
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.submitSession).toHaveBeenCalledWith('chess', 'user-session', sessionData);
    });

    it('validates game type before checking auth', async () => {
      // User IS authenticated but game type is invalid
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-session' } } });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/session');
      const req = createMockReq({
        params: { type: 'bogus' },
        body: { score: 100 },
        headers: { authorization: 'Bearer valid-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      // Auth check (401) comes before game type check (400) in the code
      // Actually looking at the code: userId check comes first, then gameType check
      // So with auth, we should get 400 for invalid game type
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ========================================================================
  // 10. GET /:type/leaderboard
  // ========================================================================

  describe('GET /:type/leaderboard', () => {
    let handler: (...args: unknown[]) => Promise<void>;

    beforeEach(() => {
      handler = getRouteHandler(router, 'get', '/:type/leaderboard') as (...args: unknown[]) => Promise<void>;
    });

    it('returns leaderboard for valid game type', async () => {
      const leaderboard = [
        { player_id: 'u1', total_score: 500 },
        { player_id: 'u2', total_score: 300 },
      ];
      mockPuzzleService.getLeaderboard.mockResolvedValue(leaderboard);

      const req = createMockReq({ params: { type: 'math' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith('math', 50);
      expect(res.json).toHaveBeenCalledWith({
        gameType: 'math',
        leaderboard,
        count: 2,
      });
    });

    it('returns 400 for invalid game type', async () => {
      const req = createMockReq({ params: { type: 'invalid' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].error).toContain('Invalid game type');
    });

    it('respects limit query param', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ params: { type: 'logic' }, query: { limit: '25' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith('logic', 25);
    });

    it('clamps limit to max 100', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ params: { type: 'math' }, query: { limit: '999' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith('math', 100);
    });

    it('defaults NaN limit to 50', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ params: { type: 'math' }, query: { limit: 'abc' } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith('math', 50);
    });

    it('handles array limit param', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ params: { type: 'math' }, query: { limit: ['10', '20'] } });
      const res = createMockRes();
      await handler(req, res);

      expect(mockPuzzleService.getLeaderboard).toHaveBeenCalledWith('math', 10);
    });

    it('returns 500 when service throws', async () => {
      mockPuzzleService.getLeaderboard.mockRejectedValue(new Error('Service error'));

      const req = createMockReq({ params: { type: 'math' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch leaderboard' });
    });

    it('returns empty leaderboard with count 0', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ params: { type: 'chess' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        gameType: 'chess',
        leaderboard: [],
        count: 0,
      });
    });

    it('includes gameType in response', async () => {
      mockPuzzleService.getLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ params: { type: 'cipher' }, query: {} });
      const res = createMockRes();
      await handler(req, res);

      const result = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.gameType).toBe('cipher');
    });
  });

  // ========================================================================
  // Optional Auth Middleware (unit tests via handler chains)
  // ========================================================================

  describe('optionalAuthMiddleware', () => {
    it('sets userId from Bearer token when user is found', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-auth-ok' } } });

      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer my-token' },
        query: {},
      });
      const res = createMockRes();
      mockPuzzleService.getUserStats.mockResolvedValue({ games: 0 });

      await runHandlerChain(handlers, req, res);

      expect(mockPuzzleService.getUserStats).toHaveBeenCalledWith('user-auth-ok', undefined);
    });

    it('does not set userId when no auth header', async () => {
      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      // Should get 401 since userId not set
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('does not set userId when auth header is not Bearer', async () => {
      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: { authorization: 'Basic some-creds' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('sets agentId from body when valid UUID', async () => {
      const agentUuid = '12345678-1234-1234-1234-123456789abc';
      mockPuzzleService.checkAnswer.mockResolvedValue({ correct: true });

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42', agentId: agentUuid },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      // agentId is set but no userId, so should get 401 for agent submit
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('sets agentId from query when valid UUID', async () => {
      const agentUuid = 'abcdef12-3456-7890-abcd-ef1234567890';

      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42' },
        headers: {},
        query: { agentId: agentUuid },
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      // agentId set from query, no auth => 401
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('non-UUID agentId in body still triggers agent path via bodyAgentId', async () => {
      // Middleware ignores invalid UUIDs for req.agentId, but the handler reads
      // agentId from body directly (bodyAgentId). Since 'not-valid' is truthy,
      // it enters the agent path => 401 because no userId
      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42', agentId: 'not-a-valid-uuid' },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('numeric agentId in body still triggers agent path via bodyAgentId', async () => {
      // bodyAgentId = 12345 which is truthy => enters agent path => 401
      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      const req = createMockReq({
        params: { type: 'math' },
        body: { puzzleId: 'p1', answer: '42', agentId: 12345 },
        headers: {},
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('continues without auth when getUser throws', async () => {
      mockGetUser.mockRejectedValue(new Error('Token invalid'));

      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      const req = createMockReq({
        headers: { authorization: 'Bearer bad-token' },
        query: {},
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      // Auth failed silently, userId not set => 401
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ========================================================================
  // Route structure tests
  // ========================================================================

  describe('Route structure', () => {
    it('has GET / route', () => {
      expect(() => getRouteHandler(router, 'get', '/')).not.toThrow();
    });

    it('has GET /leaderboard route', () => {
      expect(() => getRouteHandler(router, 'get', '/leaderboard')).not.toThrow();
    });

    it('has GET /leaderboard/global route', () => {
      expect(() => getRouteHandler(router, 'get', '/leaderboard/global')).not.toThrow();
    });

    it('has GET /stats/me route', () => {
      expect(() => getRouteHandler(router, 'get', '/stats/me')).not.toThrow();
    });

    it('has GET /history/me route', () => {
      expect(() => getRouteHandler(router, 'get', '/history/me')).not.toThrow();
    });

    it('has GET /:type route', () => {
      expect(() => getRouteHandler(router, 'get', '/:type')).not.toThrow();
    });

    it('has GET /:type/puzzle route', () => {
      expect(() => getRouteHandler(router, 'get', '/:type/puzzle')).not.toThrow();
    });

    it('has POST /:type/submit route', () => {
      expect(() => getRouteHandler(router, 'post', '/:type/submit')).not.toThrow();
    });

    it('has POST /:type/session route', () => {
      expect(() => getRouteHandler(router, 'post', '/:type/session')).not.toThrow();
    });

    it('has GET /:type/leaderboard route', () => {
      expect(() => getRouteHandler(router, 'get', '/:type/leaderboard')).not.toThrow();
    });

    it('stats/me route has optionalAuthMiddleware (multiple handlers)', () => {
      const handlers = getAllRouteHandlers(router, 'get', '/stats/me');
      expect(handlers.length).toBeGreaterThan(1);
    });

    it('history/me route has optionalAuthMiddleware (multiple handlers)', () => {
      const handlers = getAllRouteHandlers(router, 'get', '/history/me');
      expect(handlers.length).toBeGreaterThan(1);
    });

    it('submit route has optionalAuthMiddleware + validateBody (3+ handlers)', () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:type/submit');
      expect(handlers.length).toBeGreaterThanOrEqual(3);
    });

    it('session route has optionalAuthMiddleware + validateBody (3+ handlers)', () => {
      const handlers = getAllRouteHandlers(router, 'post', '/:type/session');
      expect(handlers.length).toBeGreaterThanOrEqual(3);
    });
  });
});
