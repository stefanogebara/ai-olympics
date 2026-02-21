import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ============================================================================
// MOCKS - must be declared before importing modules under test
// ============================================================================

// -- Supabase chainable mock with Proxy pattern --
function createSupabaseChain(resolveValue: any = { data: null, error: null, count: 0 }) {
  const handler: ProxyHandler<any> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        return (resolve: Function) => resolve(resolveValue);
      }
      return vi.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

const mockServiceFrom = vi.fn();

vi.mock('../../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: (...args: any[]) => mockServiceFrom(...args),
    auth: { getUser: vi.fn() },
  },
  createUserClient: vi.fn(),
  extractToken: vi.fn(),
}));

vi.mock('../../services/meta-market-service.js', () => ({
  metaMarketService: {
    getActiveMarkets: vi.fn(),
    getMarket: vi.fn(),
    getMarketByCompetition: vi.fn(),
    getUserBets: vi.fn(),
    getMarketBets: vi.fn(),
    placeBet: vi.fn(),
  },
}));

vi.mock('../../services/verification-challenge-service.js', () => ({
  generateVerificationSession: vi.fn(),
}));

vi.mock('../../services/verification-scoring.js', () => ({
  scoreSpeedArithmetic: vi.fn(),
  scoreSpeedJsonParse: vi.fn(),
  scoreStructuredOutput: vi.fn(),
  scoreBehavioralTiming: vi.fn(),
  computeVerificationResult: vi.fn(),
}));

vi.mock('../../shared/utils/crypto.js', () => ({
  encrypt: vi.fn().mockReturnValue('encrypted-data'),
  decrypt: vi.fn().mockReturnValue('{}'),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: any, _res: any, next: any) => next()),
  AuthenticatedRequest: {},
}));

vi.mock('../middleware/validate.js', () => ({
  validateBody: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    agent: vi.fn(),
  }),
}));

vi.mock('../schemas.js', () => ({
  placeBetSchema: {},
  startVerificationSchema: {},
  respondVerificationSchema: {},
}));

// ============================================================================
// IMPORTS - after mocks
// ============================================================================

import metaMarketsRouter from './meta-markets.js';
import verificationRouter from './verification.js';
import { metaMarketService } from '../../services/meta-market-service.js';
import { generateVerificationSession } from '../../services/verification-challenge-service.js';
import {
  scoreSpeedArithmetic,
  scoreSpeedJsonParse,
  scoreStructuredOutput,
  scoreBehavioralTiming,
  computeVerificationResult,
} from '../../services/verification-scoring.js';
import { encrypt, decrypt } from '../../shared/utils/crypto.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract the last handler (the actual route handler) from an Express router.
 * Middleware handlers (auth, validate) are mocked to pass-through, so we want the final one.
 */
function getRouteHandler(router: any, method: string, path: string): Function {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routePath === path && routeMethod === method) {
        const handlers = layer.route.stack.map((s: any) => s.handle);
        return handlers[handlers.length - 1];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

function createMockReq(overrides: any = {}): any {
  return {
    headers: { authorization: 'Bearer test-token' },
    query: {},
    params: {},
    body: {},
    user: { id: 'user-1' },
    userClient: createSupabaseChain(),
    ...overrides,
  };
}

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

// Cast mocked services for easy access
const mockMetaMarket = metaMarketService as unknown as Record<string, Mock>;
const mockGenSession = generateVerificationSession as Mock;
const mockScoreArithmetic = scoreSpeedArithmetic as Mock;
const mockScoreJson = scoreSpeedJsonParse as Mock;
const mockScoreStructured = scoreStructuredOutput as Mock;
const mockScoreBehavioral = scoreBehavioralTiming as Mock;
const mockComputeResult = computeVerificationResult as Mock;
const mockEncrypt = encrypt as Mock;
const mockDecrypt = decrypt as Mock;

// ============================================================================
// META-MARKETS TESTS
// ============================================================================

describe('Meta-Markets Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // GET / - List active markets
  // --------------------------------------------------------------------------
  describe('GET / (list markets)', () => {
    const handler = getRouteHandler(metaMarketsRouter, 'get', '/');

    it('returns markets with count', async () => {
      const markets = [{ id: '1', question: 'Who wins?' }, { id: '2', question: 'Score?' }];
      mockMetaMarket.getActiveMarkets.mockResolvedValue(markets);

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.getActiveMarkets).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ markets, count: 2 });
    });

    it('returns empty array when no markets', async () => {
      mockMetaMarket.getActiveMarkets.mockResolvedValue([]);

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({ markets: [], count: 0 });
    });

    it('returns 500 on service error', async () => {
      mockMetaMarket.getActiveMarkets.mockRejectedValue(new Error('DB down'));

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch markets' });
    });
  });

  // --------------------------------------------------------------------------
  // GET /:id - Get specific market
  // --------------------------------------------------------------------------
  describe('GET /:id (get market)', () => {
    const handler = getRouteHandler(metaMarketsRouter, 'get', '/:id');

    it('returns market by id', async () => {
      const market = { id: 'market-1', question: 'Who wins?' };
      mockMetaMarket.getMarket.mockResolvedValue(market);

      const req = createMockReq({ params: { id: 'market-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.getMarket).toHaveBeenCalledWith('market-1');
      expect(res.json).toHaveBeenCalledWith(market);
    });

    it('returns 404 when market not found', async () => {
      mockMetaMarket.getMarket.mockResolvedValue(null);

      const req = createMockReq({ params: { id: 'nonexistent' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Market not found' });
    });

    it('returns 500 on service error', async () => {
      mockMetaMarket.getMarket.mockRejectedValue(new Error('DB error'));

      const req = createMockReq({ params: { id: 'market-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch market' });
    });

    it('converts params.id to string', async () => {
      mockMetaMarket.getMarket.mockResolvedValue({ id: '123' });

      const req = createMockReq({ params: { id: 123 } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.getMarket).toHaveBeenCalledWith('123');
    });
  });

  // --------------------------------------------------------------------------
  // GET /competition/:competitionId - Get market by competition
  // --------------------------------------------------------------------------
  describe('GET /competition/:competitionId', () => {
    const handler = getRouteHandler(metaMarketsRouter, 'get', '/competition/:competitionId');

    it('returns market for competition', async () => {
      const market = { id: 'm-1', competition_id: 'comp-1' };
      mockMetaMarket.getMarketByCompetition.mockResolvedValue(market);

      const req = createMockReq({ params: { competitionId: 'comp-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.getMarketByCompetition).toHaveBeenCalledWith('comp-1');
      expect(res.json).toHaveBeenCalledWith(market);
    });

    it('returns 404 when no market found', async () => {
      mockMetaMarket.getMarketByCompetition.mockResolvedValue(null);

      const req = createMockReq({ params: { competitionId: 'comp-nope' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'No market found for this competition' });
    });

    it('returns 500 on error', async () => {
      mockMetaMarket.getMarketByCompetition.mockRejectedValue(new Error('fail'));

      const req = createMockReq({ params: { competitionId: 'comp-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch market' });
    });
  });

  // --------------------------------------------------------------------------
  // GET /user/bets - Get user's bets
  // --------------------------------------------------------------------------
  describe('GET /user/bets', () => {
    const handler = getRouteHandler(metaMarketsRouter, 'get', '/user/bets');

    it('returns user bets with count', async () => {
      const bets = [{ id: 'b-1' }, { id: 'b-2' }];
      mockMetaMarket.getUserBets.mockResolvedValue(bets);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.getUserBets).toHaveBeenCalledWith('user-1', 50);
      expect(res.json).toHaveBeenCalledWith({ bets, count: 2 });
    });

    it('uses default limit of 50 when not provided', async () => {
      mockMetaMarket.getUserBets.mockResolvedValue([]);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.getUserBets).toHaveBeenCalledWith('user-1', 50);
    });

    it('parses and uses provided limit', async () => {
      mockMetaMarket.getUserBets.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: '25' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.getUserBets).toHaveBeenCalledWith('user-1', 25);
    });

    it('clamps limit to max 100', async () => {
      mockMetaMarket.getUserBets.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: '200' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.getUserBets).toHaveBeenCalledWith('user-1', 100);
    });

    it('uses default limit for non-numeric limit', async () => {
      mockMetaMarket.getUserBets.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: 'abc' } });
      const res = createMockRes();

      await handler(req, res);

      // parseInt('abc') => NaN, || 50 => 50, Math.min(50, 100) => 50
      expect(mockMetaMarket.getUserBets).toHaveBeenCalledWith('user-1', 50);
    });

    it('handles array-valued limit query param', async () => {
      mockMetaMarket.getUserBets.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: ['10', '20'] } });
      const res = createMockRes();

      await handler(req, res);

      // Takes first element of array
      expect(mockMetaMarket.getUserBets).toHaveBeenCalledWith('user-1', 10);
    });

    it('returns 500 on error', async () => {
      mockMetaMarket.getUserBets.mockRejectedValue(new Error('fail'));

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch bets' });
    });
  });

  // --------------------------------------------------------------------------
  // GET /:id/bets - Get market bets
  // --------------------------------------------------------------------------
  describe('GET /:id/bets', () => {
    const handler = getRouteHandler(metaMarketsRouter, 'get', '/:id/bets');

    it('returns market bets with count', async () => {
      const bets = [{ id: 'b-1' }, { id: 'b-2' }, { id: 'b-3' }];
      mockMetaMarket.getMarketBets.mockResolvedValue(bets);

      const req = createMockReq({ params: { id: 'market-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.getMarketBets).toHaveBeenCalledWith('market-1');
      expect(res.json).toHaveBeenCalledWith({ bets, count: 3 });
    });

    it('returns empty array when no bets', async () => {
      mockMetaMarket.getMarketBets.mockResolvedValue([]);

      const req = createMockReq({ params: { id: 'market-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({ bets: [], count: 0 });
    });

    it('returns 500 on error', async () => {
      mockMetaMarket.getMarketBets.mockRejectedValue(new Error('fail'));

      const req = createMockReq({ params: { id: 'market-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch bets' });
    });
  });

  // --------------------------------------------------------------------------
  // POST /:id/bet - Place bet
  // --------------------------------------------------------------------------
  describe('POST /:id/bet', () => {
    const handler = getRouteHandler(metaMarketsRouter, 'post', '/:id/bet');

    it('places bet successfully', async () => {
      const result = { success: true, bet: { id: 'bet-1' } };
      mockMetaMarket.placeBet.mockResolvedValue(result);

      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 'outcome-1', amount: 100 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.placeBet).toHaveBeenCalledWith('user-1', 'market-1', 'outcome-1', 100);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('returns 400 when outcomeId missing (empty string)', async () => {
      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: '', amount: 100 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required fields: outcomeId, amount',
      });
    });

    it('returns 400 when amount is undefined', async () => {
      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 'outcome-1' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required fields: outcomeId, amount',
      });
    });

    it('returns 400 when amount is NaN', async () => {
      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 'outcome-1', amount: 'not-a-number' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Amount must be a positive number',
      });
    });

    it('returns 400 when amount is 0', async () => {
      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 'outcome-1', amount: 0 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Amount must be a positive number',
      });
    });

    it('returns 400 when amount is negative', async () => {
      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 'outcome-1', amount: -50 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Amount must be a positive number',
      });
    });

    it('returns 400 when service returns success:false', async () => {
      const result = { success: false, error: 'Insufficient balance' };
      mockMetaMarket.placeBet.mockResolvedValue(result);

      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 'outcome-1', amount: 100 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('returns 500 on service error', async () => {
      mockMetaMarket.placeBet.mockRejectedValue(new Error('crash'));

      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 'outcome-1', amount: 50 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to place bet' });
    });

    it('parses float amounts correctly', async () => {
      const result = { success: true, bet: { id: 'bet-1' } };
      mockMetaMarket.placeBet.mockResolvedValue(result);

      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 'outcome-1', amount: '99.5' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.placeBet).toHaveBeenCalledWith('user-1', 'market-1', 'outcome-1', 99.5);
    });

    it('converts marketId param to string', async () => {
      const result = { success: true, bet: { id: 'bet-1' } };
      mockMetaMarket.placeBet.mockResolvedValue(result);

      const req = createMockReq({
        params: { id: 456 },
        body: { outcomeId: 'outcome-1', amount: 50 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.placeBet).toHaveBeenCalledWith('user-1', '456', 'outcome-1', 50);
    });

    it('converts outcomeId to string', async () => {
      const result = { success: true, bet: { id: 'bet-1' } };
      mockMetaMarket.placeBet.mockResolvedValue(result);

      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 123, amount: 50 },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.placeBet).toHaveBeenCalledWith('user-1', 'market-1', '123', 50);
    });

    it('uses authenticated user id for bet placement', async () => {
      const result = { success: true, bet: { id: 'bet-1' } };
      mockMetaMarket.placeBet.mockResolvedValue(result);

      const req = createMockReq({
        params: { id: 'market-1' },
        body: { outcomeId: 'outcome-1', amount: 50 },
        user: { id: 'custom-user-id' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockMetaMarket.placeBet).toHaveBeenCalledWith('custom-user-id', 'market-1', 'outcome-1', 50);
    });
  });
});

// ============================================================================
// VERIFICATION TESTS
// ============================================================================

describe('Verification Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServiceFrom.mockReset();
  });

  // --------------------------------------------------------------------------
  // Serialization helpers (exported from module scope, tested via route behavior)
  // --------------------------------------------------------------------------
  describe('serializeExpectedAnswers / deserializeExpectedAnswers (round-trip via route)', () => {
    // These helpers are tested indirectly through the /start and /respond routes.
    // We verify the encrypt/decrypt calls receive serialized Map data.

    it('serializes Maps for encryption in /start', async () => {
      const handler = getRouteHandler(verificationRouter, 'post', '/start');

      const arithmeticAnswers = new Map([['q1', 42]]);
      const jsonAnswers = new Map<string, unknown>([['q2', { key: 'value' }]]);

      mockGenSession.mockReturnValue({
        challenges: [{ type: 'speed_arithmetic', timeLimit: 5000, data: {} }],
        expectedAnswers: {
          speed_arithmetic: arithmeticAnswers,
          speed_json_parse: jsonAnswers,
          structured_output: { rule: 'test' },
          behavioral_timing: null,
        },
      });

      // userClient query to check agent ownership
      const userClientChain = createSupabaseChain({
        data: { id: 'agent-1', owner_id: 'user-1', verification_status: 'unverified', last_verified_at: null },
        error: null,
      });

      // serviceClient queries: existing session check, insert session, insert challenges, update session
      const existingSessionChain = createSupabaseChain({ data: null, error: null });
      const insertSessionChain = createSupabaseChain({ data: { id: 'session-1' }, error: null });
      const insertChallengesChain = createSupabaseChain({ data: null, error: null });
      const updateSessionChain = createSupabaseChain({ data: null, error: null });

      let serviceCallCount = 0;
      mockServiceFrom.mockImplementation(() => {
        serviceCallCount++;
        if (serviceCallCount === 1) return existingSessionChain;  // check existing session
        if (serviceCallCount === 2) return insertSessionChain;    // insert session
        if (serviceCallCount === 3) return insertChallengesChain; // insert challenges
        if (serviceCallCount === 4) return updateSessionChain;    // update with encrypted answers
        return createSupabaseChain();
      });

      const req = createMockReq({
        body: { agent_id: 'agent-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockEncrypt).toHaveBeenCalled();
      // The encrypt call receives serialized JSON with Maps converted to objects
      const serialized = (mockEncrypt as Mock).mock.calls[0][0];
      const parsed = JSON.parse(serialized);
      expect(parsed.speed_arithmetic).toEqual({ q1: 42 });
      expect(parsed.speed_json_parse).toEqual({ q2: { key: 'value' } });
      expect(parsed.structured_output).toEqual({ rule: 'test' });
    });

    it('deserializes Maps from decrypted data in /respond', async () => {
      const handler = getRouteHandler(verificationRouter, 'post', '/:sessionId/respond');

      const decryptedData = JSON.stringify({
        speed_arithmetic: { q1: 42 },
        speed_json_parse: { q2: 'val' },
        structured_output: { rule: 'test' },
      });
      mockDecrypt.mockReturnValue(decryptedData);

      // Session query
      const sessionChain = createSupabaseChain({
        data: {
          id: 'session-1',
          agent_id: 'agent-1',
          agent: { id: 'agent-1', owner_id: 'user-1' },
          status: 'in_progress',
          expires_at: new Date(Date.now() + 60000).toISOString(),
          started_at: new Date(Date.now() - 2000).toISOString(),
          expected_answers_encrypted: 'encrypted-data',
        },
        error: null,
      });

      // Challenges query
      const challengesChain = createSupabaseChain({
        data: [
          { id: 'ch-1', challenge_type: 'speed_arithmetic', session_id: 'session-1' },
        ],
        error: null,
      });

      // All subsequent update chains
      const updateChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return sessionChain;
        if (callCount === 2) return challengesChain;
        return updateChain;
      });

      const mockResult = {
        type: 'speed_arithmetic',
        passed: true,
        score: 90,
        responseTimeMs: 1500,
        details: {},
      };
      mockScoreArithmetic.mockReturnValue(mockResult);
      mockComputeResult.mockReturnValue({
        passed: true,
        totalScore: 90,
        speedScore: 90,
        structuredScore: 0,
        behavioralScore: 0,
        challengeResults: [mockResult],
      });

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: {
          speed_arithmetic: { answers: [{ id: 'q1', result: 42 }] },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      // Verify scoreSpeedArithmetic received a Map (deserialized from JSON)
      const expectedAnswersArg = mockScoreArithmetic.mock.calls[0][1];
      expect(expectedAnswersArg).toBeInstanceOf(Map);
      expect(expectedAnswersArg.get('q1')).toBe(42);
    });
  });

  // --------------------------------------------------------------------------
  // POST /start - Start verification session
  // --------------------------------------------------------------------------
  describe('POST /start', () => {
    const handler = getRouteHandler(verificationRouter, 'post', '/start');

    it('returns 400 when agent_id missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'agent_id is required' });
    });

    it('returns 403 when agent not owned by user', async () => {
      const userClientChain = createSupabaseChain({
        data: { id: 'agent-1', owner_id: 'other-user', verification_status: 'unverified', last_verified_at: null },
        error: null,
      });

      const req = createMockReq({
        body: { agent_id: 'agent-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized to verify this agent' });
    });

    it('returns 403 when agent not found', async () => {
      const userClientChain = createSupabaseChain({ data: null, error: null });

      const req = createMockReq({
        body: { agent_id: 'nonexistent' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized to verify this agent' });
    });

    it('returns 200 when already verified within 24h', async () => {
      const recentTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      const userClientChain = createSupabaseChain({
        data: {
          id: 'agent-1',
          owner_id: 'user-1',
          verification_status: 'verified',
          last_verified_at: recentTime,
        },
        error: null,
      });

      const req = createMockReq({
        body: { agent_id: 'agent-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        already_verified: true,
        message: 'Agent is already verified (valid for 24h)',
        last_verified_at: recentTime,
      });
    });

    it('returns 409 when existing session active', async () => {
      const userClientChain = createSupabaseChain({
        data: {
          id: 'agent-1',
          owner_id: 'user-1',
          verification_status: 'unverified',
          last_verified_at: null,
        },
        error: null,
      });

      const existingSessionChain = createSupabaseChain({
        data: { id: 'existing-session', status: 'in_progress', expires_at: new Date(Date.now() + 60000).toISOString() },
        error: null,
      });

      mockServiceFrom.mockReturnValue(existingSessionChain);

      const req = createMockReq({
        body: { agent_id: 'agent-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      const jsonArg = (res.json as Mock).mock.calls[0][0];
      expect(jsonArg.error).toBe('Active verification session already exists');
      expect(jsonArg.session_id).toBe('existing-session');
    });

    it('creates session and returns 201 with challenges', async () => {
      const userClientChain = createSupabaseChain({
        data: {
          id: 'agent-1',
          owner_id: 'user-1',
          verification_status: 'unverified',
          last_verified_at: null,
        },
        error: null,
      });

      const challenges = [
        { type: 'speed_arithmetic', timeLimit: 5000, data: { problems: [] } },
      ];
      mockGenSession.mockReturnValue({
        challenges,
        expectedAnswers: {
          speed_arithmetic: new Map(),
          speed_json_parse: new Map(),
          structured_output: {},
          behavioral_timing: null,
        },
      });

      const noExistingSessionChain = createSupabaseChain({ data: null, error: null });
      const insertSessionChain = createSupabaseChain({ data: { id: 'new-session-1' }, error: null });
      const insertChallengesChain = createSupabaseChain({ data: null, error: null });
      const updateChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return noExistingSessionChain;
        if (callCount === 2) return insertSessionChain;
        if (callCount === 3) return insertChallengesChain;
        if (callCount === 4) return updateChain;
        return createSupabaseChain();
      });

      const req = createMockReq({
        body: { agent_id: 'agent-1', competition_id: 'comp-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const jsonArg = (res.json as Mock).mock.calls[0][0];
      expect(jsonArg.session_id).toBe('new-session-1');
      expect(jsonArg.challenges).toEqual(challenges);
      expect(jsonArg.expires_at).toBeDefined();
    });

    it('returns 500 when session creation fails', async () => {
      const userClientChain = createSupabaseChain({
        data: {
          id: 'agent-1',
          owner_id: 'user-1',
          verification_status: 'unverified',
          last_verified_at: null,
        },
        error: null,
      });

      mockGenSession.mockReturnValue({
        challenges: [],
        expectedAnswers: {
          speed_arithmetic: new Map(),
          speed_json_parse: new Map(),
          structured_output: {},
          behavioral_timing: null,
        },
      });

      const noExistingSessionChain = createSupabaseChain({ data: null, error: null });
      const failedInsertChain = createSupabaseChain({ data: null, error: { message: 'insert failed' } });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return noExistingSessionChain;
        if (callCount === 2) return failedInsertChain;
        return createSupabaseChain();
      });

      const req = createMockReq({
        body: { agent_id: 'agent-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create verification session' });
    });

    it('encrypts expected answers', async () => {
      const userClientChain = createSupabaseChain({
        data: { id: 'agent-1', owner_id: 'user-1', verification_status: 'unverified', last_verified_at: null },
        error: null,
      });

      mockGenSession.mockReturnValue({
        challenges: [],
        expectedAnswers: {
          speed_arithmetic: new Map([['a', 1]]),
          speed_json_parse: new Map(),
          structured_output: {},
          behavioral_timing: null,
        },
      });

      const noExistingChain = createSupabaseChain({ data: null, error: null });
      const insertChain = createSupabaseChain({ data: { id: 'sess-1' }, error: null });
      const genericChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return noExistingChain;
        if (callCount === 2) return insertChain;
        return genericChain;
      });

      const req = createMockReq({
        body: { agent_id: 'agent-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockEncrypt).toHaveBeenCalledTimes(1);
      const serialized = mockEncrypt.mock.calls[0][0];
      expect(JSON.parse(serialized).speed_arithmetic).toEqual({ a: 1 });
    });

    it('returns 500 on unexpected error', async () => {
      const userClientChain = createSupabaseChain({
        data: { id: 'agent-1', owner_id: 'user-1', verification_status: 'unverified', last_verified_at: null },
        error: null,
      });

      mockGenSession.mockImplementation(() => {
        throw new Error('unexpected crash');
      });

      const noExistingChain = createSupabaseChain({ data: null, error: null });
      mockServiceFrom.mockReturnValue(noExistingChain);

      const req = createMockReq({
        body: { agent_id: 'agent-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to start verification' });
    });

    it('does not return already_verified when status is verified but older than 24h', async () => {
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
      const userClientChain = createSupabaseChain({
        data: {
          id: 'agent-1',
          owner_id: 'user-1',
          verification_status: 'verified',
          last_verified_at: oldTime,
        },
        error: null,
      });

      mockGenSession.mockReturnValue({
        challenges: [],
        expectedAnswers: {
          speed_arithmetic: new Map(),
          speed_json_parse: new Map(),
          structured_output: {},
          behavioral_timing: null,
        },
      });

      const noExistingChain = createSupabaseChain({ data: null, error: null });
      const insertChain = createSupabaseChain({ data: { id: 'sess-new' }, error: null });
      const genericChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return noExistingChain;
        if (callCount === 2) return insertChain;
        return genericChain;
      });

      const req = createMockReq({
        body: { agent_id: 'agent-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      // Should proceed to create session, not return already_verified
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('does not return already_verified when status is unverified', async () => {
      const recentTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const userClientChain = createSupabaseChain({
        data: {
          id: 'agent-1',
          owner_id: 'user-1',
          verification_status: 'unverified',
          last_verified_at: recentTime,
        },
        error: null,
      });

      mockGenSession.mockReturnValue({
        challenges: [],
        expectedAnswers: {
          speed_arithmetic: new Map(),
          speed_json_parse: new Map(),
          structured_output: {},
          behavioral_timing: null,
        },
      });

      const noExistingChain = createSupabaseChain({ data: null, error: null });
      const insertChain = createSupabaseChain({ data: { id: 'sess-new-2' }, error: null });
      const genericChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return noExistingChain;
        if (callCount === 2) return insertChain;
        return genericChain;
      });

      const req = createMockReq({
        body: { agent_id: 'agent-1' },
        userClient: userClientChain,
      });
      const res = createMockRes();

      await handler(req, res);

      // Unverified should not trigger already_verified even with recent last_verified_at
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // --------------------------------------------------------------------------
  // POST /:sessionId/respond - Submit verification answers
  // --------------------------------------------------------------------------
  describe('POST /:sessionId/respond', () => {
    const handler = getRouteHandler(verificationRouter, 'post', '/:sessionId/respond');

    function setupRespondMocks(overrides: {
      sessionData?: any;
      challengesData?: any;
      decryptResult?: string;
      scoreResult?: any;
      computeResult?: any;
    } = {}) {
      const sessionData = overrides.sessionData ?? {
        id: 'session-1',
        agent_id: 'agent-1',
        agent: { id: 'agent-1', owner_id: 'user-1' },
        status: 'in_progress',
        expires_at: new Date(Date.now() + 60000).toISOString(),
        started_at: new Date(Date.now() - 2000).toISOString(),
        expected_answers_encrypted: 'encrypted-data',
      };

      const challengesData = overrides.challengesData ?? [
        { id: 'ch-1', challenge_type: 'speed_arithmetic', session_id: 'session-1' },
      ];

      const sessionChain = createSupabaseChain({ data: sessionData, error: null });
      const challengesChain = createSupabaseChain({ data: challengesData, error: null });
      const updateChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return sessionChain;
        if (callCount === 2) return challengesChain;
        return updateChain;
      });

      const decryptResult = overrides.decryptResult ?? JSON.stringify({
        speed_arithmetic: { q1: 42 },
        speed_json_parse: {},
        structured_output: {},
      });
      mockDecrypt.mockReturnValue(decryptResult);

      const scoreResult = overrides.scoreResult ?? {
        type: 'speed_arithmetic',
        passed: true,
        score: 90,
        responseTimeMs: 1500,
        details: {},
      };
      mockScoreArithmetic.mockReturnValue(scoreResult);

      const computeResult = overrides.computeResult ?? {
        passed: true,
        totalScore: 90,
        speedScore: 90,
        structuredScore: 0,
        behavioralScore: 0,
        challengeResults: [scoreResult],
      };
      mockComputeResult.mockReturnValue(computeResult);

      return { sessionData, challengesData, scoreResult, computeResult };
    }

    it('returns 404 when session not found', async () => {
      mockServiceFrom.mockReturnValue(createSupabaseChain({ data: null, error: null }));

      const req = createMockReq({
        params: { sessionId: 'nonexistent' },
        body: { speed_arithmetic: {} },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Verification session not found' });
    });

    it('returns 403 when not agent owner', async () => {
      const sessionChain = createSupabaseChain({
        data: {
          id: 'session-1',
          agent: { id: 'agent-1', owner_id: 'other-user' },
          status: 'in_progress',
        },
        error: null,
      });
      mockServiceFrom.mockReturnValue(sessionChain);

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: {} },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized' });
    });

    it('returns 400 when session not in_progress', async () => {
      const sessionChain = createSupabaseChain({
        data: {
          id: 'session-1',
          agent: { id: 'agent-1', owner_id: 'user-1' },
          status: 'passed',
        },
        error: null,
      });
      mockServiceFrom.mockReturnValue(sessionChain);

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: {} },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Session is passed, cannot submit answers' });
    });

    it('returns 410 when session expired', async () => {
      const expiredTime = new Date(Date.now() - 60000).toISOString();
      const sessionChain = createSupabaseChain({
        data: {
          id: 'session-1',
          agent: { id: 'agent-1', owner_id: 'user-1' },
          status: 'in_progress',
          expires_at: expiredTime,
        },
        error: null,
      });
      const updateChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return sessionChain;
        return updateChain;
      });

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: {} },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith({ error: 'Verification session has expired' });
    });

    it('returns 410 when no encrypted answers', async () => {
      const sessionChain = createSupabaseChain({
        data: {
          id: 'session-1',
          agent: { id: 'agent-1', owner_id: 'user-1' },
          status: 'in_progress',
          expires_at: new Date(Date.now() + 60000).toISOString(),
          expected_answers_encrypted: null,
        },
        error: null,
      });
      mockServiceFrom.mockReturnValue(sessionChain);

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: {} },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Session answers not found. Please start a new session.',
      });
    });

    it('returns 500 when decryption fails', async () => {
      const sessionChain = createSupabaseChain({
        data: {
          id: 'session-1',
          agent: { id: 'agent-1', owner_id: 'user-1' },
          status: 'in_progress',
          expires_at: new Date(Date.now() + 60000).toISOString(),
          started_at: new Date().toISOString(),
          expected_answers_encrypted: 'bad-data',
        },
        error: null,
      });
      mockServiceFrom.mockReturnValue(sessionChain);
      mockDecrypt.mockImplementation(() => {
        throw new Error('decrypt failed');
      });

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: {} },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to decrypt session data' });
    });

    it('returns 500 when no challenges found', async () => {
      const sessionChain = createSupabaseChain({
        data: {
          id: 'session-1',
          agent_id: 'agent-1',
          agent: { id: 'agent-1', owner_id: 'user-1' },
          status: 'in_progress',
          expires_at: new Date(Date.now() + 60000).toISOString(),
          started_at: new Date().toISOString(),
          expected_answers_encrypted: 'encrypted-data',
        },
        error: null,
      });
      const noChallengesChain = createSupabaseChain({ data: [], error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return sessionChain;
        if (callCount === 2) return noChallengesChain;
        return createSupabaseChain();
      });

      mockDecrypt.mockReturnValue(JSON.stringify({
        speed_arithmetic: {},
        speed_json_parse: {},
        structured_output: {},
      }));

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: {} },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'No challenges found for session' });
    });

    it('returns 500 when challenges is null', async () => {
      const sessionChain = createSupabaseChain({
        data: {
          id: 'session-1',
          agent_id: 'agent-1',
          agent: { id: 'agent-1', owner_id: 'user-1' },
          status: 'in_progress',
          expires_at: new Date(Date.now() + 60000).toISOString(),
          started_at: new Date().toISOString(),
          expected_answers_encrypted: 'encrypted-data',
        },
        error: null,
      });
      const nullChallengesChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return sessionChain;
        if (callCount === 2) return nullChallengesChain;
        return createSupabaseChain();
      });

      mockDecrypt.mockReturnValue(JSON.stringify({
        speed_arithmetic: {},
        speed_json_parse: {},
        structured_output: {},
      }));

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: {} },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'No challenges found for session' });
    });

    it('scores challenges and returns results on pass', async () => {
      const { computeResult } = setupRespondMocks();

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: {
          speed_arithmetic: { answers: [{ id: 'q1', result: 42 }] },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockScoreArithmetic).toHaveBeenCalled();
      expect(mockComputeResult).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
      const jsonArg = (res.json as Mock).mock.calls[0][0];
      expect(jsonArg.passed).toBe(true);
      expect(jsonArg.total_score).toBe(90);
      expect(jsonArg.status).toBe('passed');
      expect(jsonArg.challenge_results).toHaveLength(1);
    });

    it('handles failed verification result', async () => {
      setupRespondMocks({
        computeResult: {
          passed: false,
          totalScore: 30,
          speedScore: 30,
          structuredScore: 0,
          behavioralScore: 0,
          challengeResults: [],
        },
      });

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: {
          speed_arithmetic: { answers: [{ id: 'q1', result: 99 }] },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      const jsonArg = (res.json as Mock).mock.calls[0][0];
      expect(jsonArg.passed).toBe(false);
      expect(jsonArg.status).toBe('failed');
    });

    it('scores all four challenge types when all provided', async () => {
      const sessionData = {
        id: 'session-1',
        agent_id: 'agent-1',
        agent: { id: 'agent-1', owner_id: 'user-1' },
        status: 'in_progress',
        expires_at: new Date(Date.now() + 60000).toISOString(),
        started_at: new Date(Date.now() - 2000).toISOString(),
        expected_answers_encrypted: 'encrypted-data',
      };

      const challengesData = [
        { id: 'ch-1', challenge_type: 'speed_arithmetic', session_id: 'session-1' },
        { id: 'ch-2', challenge_type: 'speed_json_parse', session_id: 'session-1' },
        { id: 'ch-3', challenge_type: 'structured_output', session_id: 'session-1' },
        { id: 'ch-4', challenge_type: 'behavioral_timing', session_id: 'session-1' },
      ];

      const sessionChain = createSupabaseChain({ data: sessionData, error: null });
      const challengesChain = createSupabaseChain({ data: challengesData, error: null });
      const updateChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return sessionChain;
        if (callCount === 2) return challengesChain;
        return updateChain;
      });

      mockDecrypt.mockReturnValue(JSON.stringify({
        speed_arithmetic: { q1: 42 },
        speed_json_parse: { q2: 'val' },
        structured_output: { rule: 'test' },
      }));

      const makeResult = (type: string) => ({
        type,
        passed: true,
        score: 80,
        responseTimeMs: 1000,
        details: {},
      });

      mockScoreArithmetic.mockReturnValue(makeResult('speed_arithmetic'));
      mockScoreJson.mockReturnValue(makeResult('speed_json_parse'));
      mockScoreStructured.mockReturnValue(makeResult('structured_output'));
      mockScoreBehavioral.mockReturnValue(makeResult('behavioral_timing'));
      mockComputeResult.mockReturnValue({
        passed: true,
        totalScore: 80,
        speedScore: 80,
        structuredScore: 80,
        behavioralScore: 80,
        challengeResults: [
          makeResult('speed_arithmetic'),
          makeResult('speed_json_parse'),
          makeResult('structured_output'),
          makeResult('behavioral_timing'),
        ],
      });

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: {
          speed_arithmetic: { answers: [] },
          speed_json_parse: { answers: [] },
          structured_output: { output: {} },
          behavioral_timing: { responses: [] },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockScoreArithmetic).toHaveBeenCalledTimes(1);
      expect(mockScoreJson).toHaveBeenCalledTimes(1);
      expect(mockScoreStructured).toHaveBeenCalledTimes(1);
      expect(mockScoreBehavioral).toHaveBeenCalledTimes(1);
      expect(mockComputeResult).toHaveBeenCalledTimes(1);

      const jsonArg = (res.json as Mock).mock.calls[0][0];
      expect(jsonArg.challenge_results).toHaveLength(4);
    });

    it('handles verification history update for existing history', async () => {
      const sessionData = {
        id: 'session-1',
        agent_id: 'agent-1',
        agent: { id: 'agent-1', owner_id: 'user-1' },
        status: 'in_progress',
        expires_at: new Date(Date.now() + 60000).toISOString(),
        started_at: new Date(Date.now() - 2000).toISOString(),
        expected_answers_encrypted: 'encrypted-data',
      };

      const sessionChain = createSupabaseChain({ data: sessionData, error: null });
      const challengesChain = createSupabaseChain({
        data: [{ id: 'ch-1', challenge_type: 'speed_arithmetic', session_id: 'session-1' }],
        error: null,
      });
      const updateChain = createSupabaseChain({ data: null, error: null });
      const existingHistoryChain = createSupabaseChain({
        data: {
          agent_id: 'agent-1',
          total_verifications: 5,
          total_passes: 3,
          average_score: 75,
        },
        error: null,
      });

      let callCount = 0;
      mockServiceFrom.mockImplementation((table: string) => {
        callCount++;
        if (callCount === 1) return sessionChain;
        if (callCount === 2) return challengesChain;
        // The rest are updates; we need to return history for the history check
        if (table === 'aio_agent_verification_history') {
          return existingHistoryChain;
        }
        return updateChain;
      });

      mockDecrypt.mockReturnValue(JSON.stringify({
        speed_arithmetic: { q1: 42 },
        speed_json_parse: {},
        structured_output: {},
      }));

      mockScoreArithmetic.mockReturnValue({
        type: 'speed_arithmetic', passed: true, score: 90, responseTimeMs: 1000, details: {},
      });
      mockComputeResult.mockReturnValue({
        passed: true, totalScore: 90, speedScore: 90, structuredScore: 0, behavioralScore: 0,
        challengeResults: [],
      });

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: { answers: [{ id: 'q1', result: 42 }] } },
      });
      const res = createMockRes();

      await handler(req, res);

      // Should have completed successfully
      const jsonArg = (res.json as Mock).mock.calls[0][0];
      expect(jsonArg.passed).toBe(true);
    });

    it('returns 500 on unexpected error', async () => {
      mockServiceFrom.mockImplementation(() => {
        throw new Error('Unexpected DB error');
      });

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: {} },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to process verification response' });
    });

    it('does not call scoring functions for missing challenge types', async () => {
      setupRespondMocks();

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: {
          speed_arithmetic: { answers: [{ id: 'q1', result: 42 }] },
          // No speed_json_parse, structured_output, behavioral_timing
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(mockScoreArithmetic).toHaveBeenCalledTimes(1);
      expect(mockScoreJson).not.toHaveBeenCalled();
      expect(mockScoreStructured).not.toHaveBeenCalled();
      expect(mockScoreBehavioral).not.toHaveBeenCalled();
    });

    it('includes session_id in response', async () => {
      setupRespondMocks();

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: { answers: [] } },
      });
      const res = createMockRes();

      await handler(req, res);

      const jsonArg = (res.json as Mock).mock.calls[0][0];
      expect(jsonArg.session_id).toBe('session-1');
    });

    it('includes all score breakdowns in response', async () => {
      setupRespondMocks({
        computeResult: {
          passed: true,
          totalScore: 85,
          speedScore: 90,
          structuredScore: 80,
          behavioralScore: 75,
          challengeResults: [],
        },
      });

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: { answers: [] } },
      });
      const res = createMockRes();

      await handler(req, res);

      const jsonArg = (res.json as Mock).mock.calls[0][0];
      expect(jsonArg.speed_score).toBe(90);
      expect(jsonArg.structured_score).toBe(80);
      expect(jsonArg.behavioral_score).toBe(75);
      expect(jsonArg.total_score).toBe(85);
    });

    it('maps challenge_results with correct fields', async () => {
      const challengeResult = {
        type: 'speed_arithmetic',
        passed: true,
        score: 95,
        responseTimeMs: 1200,
        details: { correct: 19, total: 20 },
      };
      setupRespondMocks({
        scoreResult: challengeResult,
        computeResult: {
          passed: true,
          totalScore: 95,
          speedScore: 95,
          structuredScore: 0,
          behavioralScore: 0,
          challengeResults: [challengeResult],
        },
      });

      const req = createMockReq({
        params: { sessionId: 'session-1' },
        body: { speed_arithmetic: { answers: [] } },
      });
      const res = createMockRes();

      await handler(req, res);

      const jsonArg = (res.json as Mock).mock.calls[0][0];
      expect(jsonArg.challenge_results[0]).toEqual({
        type: 'speed_arithmetic',
        passed: true,
        score: 95,
        response_time_ms: 1200,
        details: { correct: 19, total: 20 },
      });
    });
  });

  // --------------------------------------------------------------------------
  // GET /:sessionId - Get session status
  // --------------------------------------------------------------------------
  describe('GET /:sessionId', () => {
    const handler = getRouteHandler(verificationRouter, 'get', '/:sessionId');

    it('returns session data', async () => {
      const sessionData = {
        id: 'session-1',
        status: 'passed',
        agent: { id: 'agent-1', owner_id: 'user-1', name: 'Agent One' },
        challenges: [{ id: 'ch-1' }],
      };
      mockServiceFrom.mockReturnValue(createSupabaseChain({ data: sessionData, error: null }));

      const req = createMockReq({ params: { sessionId: 'session-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(sessionData);
    });

    it('returns 404 when not found', async () => {
      mockServiceFrom.mockReturnValue(createSupabaseChain({ data: null, error: null }));

      const req = createMockReq({ params: { sessionId: 'nonexistent' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Session not found' });
    });

    it('returns 403 when not owner', async () => {
      const sessionData = {
        id: 'session-1',
        agent: { id: 'agent-1', owner_id: 'other-user' },
      };
      mockServiceFrom.mockReturnValue(createSupabaseChain({ data: sessionData, error: null }));

      const req = createMockReq({ params: { sessionId: 'session-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authorized' });
    });

    it('returns 500 on error', async () => {
      mockServiceFrom.mockImplementation(() => {
        throw new Error('DB error');
      });

      const req = createMockReq({ params: { sessionId: 'session-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get verification session' });
    });
  });

  // --------------------------------------------------------------------------
  // GET /agent/:agentId - Get agent verification history
  // --------------------------------------------------------------------------
  describe('GET /agent/:agentId', () => {
    const handler = getRouteHandler(verificationRouter, 'get', '/agent/:agentId');

    it('returns history and recent sessions', async () => {
      const historyData = {
        agent_id: 'agent-1',
        total_verifications: 5,
        total_passes: 3,
        average_score: 75,
      };
      const recentSessions = [
        { id: 's-1', status: 'passed', verification_score: 90 },
        { id: 's-2', status: 'failed', verification_score: 40 },
      ];

      const historyChain = createSupabaseChain({ data: historyData, error: null });
      const sessionsChain = createSupabaseChain({ data: recentSessions, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return historyChain;
        if (callCount === 2) return sessionsChain;
        return createSupabaseChain();
      });

      const req = createMockReq({ params: { agentId: 'agent-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        history: historyData,
        recent_sessions: recentSessions,
      });
    });

    it('handles null history', async () => {
      const historyChain = createSupabaseChain({ data: null, error: null });
      const sessionsChain = createSupabaseChain({ data: [], error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return historyChain;
        if (callCount === 2) return sessionsChain;
        return createSupabaseChain();
      });

      const req = createMockReq({ params: { agentId: 'agent-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        history: null,
        recent_sessions: [],
      });
    });

    it('handles null recent_sessions', async () => {
      const historyChain = createSupabaseChain({ data: null, error: null });
      const sessionsChain = createSupabaseChain({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return historyChain;
        if (callCount === 2) return sessionsChain;
        return createSupabaseChain();
      });

      const req = createMockReq({ params: { agentId: 'agent-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        history: null,
        recent_sessions: [],
      });
    });

    it('returns 500 on error', async () => {
      mockServiceFrom.mockImplementation(() => {
        throw new Error('DB crash');
      });

      const req = createMockReq({ params: { agentId: 'agent-1' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get verification history' });
    });
  });
});
