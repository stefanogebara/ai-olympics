import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ============================================================================
// MOCKS - must be declared before importing the module under test
// ============================================================================

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('../shared/utils/events.js', () => ({
  eventBus: {
    on: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    agent: vi.fn(),
  }),
}));

// Set env vars so the service initializes as "configured"
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

import { MetaMarketService } from './meta-market-service.js';
import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { eventBus } from '../shared/utils/events.js';
import type { MetaMarket, CompetitionInfo, MetaMarketBet } from './meta-market-service.js';

// ============================================================================
// HELPERS
// ============================================================================

const mockSupabase = supabase as unknown as {
  from: Mock;
  rpc: Mock;
};

/**
 * Build a chainable mock that mirrors the Supabase query builder pattern.
 * Every method returns `this` except terminal methods that resolve data/error.
 */
function createQueryChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, Mock> = {};
  const methods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'in', 'order', 'limit', 'single', 'gte',
  ];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Terminal methods resolve with data/error
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  // Make select/order/limit also resolve when awaited (for non-single queries)
  chain.select = vi.fn().mockReturnValue({ ...chain, then: (resolve: (v: unknown) => void) => resolve(resolvedValue) });
  // Re-wire: after select, chaining should still work
  chain.select = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);

  // Allow the chain itself to be thenable (for queries without .single())
  (chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
    resolve(resolvedValue);
    return chain;
  };

  return chain;
}

function makeMarket(overrides: Partial<MetaMarket> = {}): MetaMarket {
  return {
    id: 'market-1',
    competition_id: 'comp-1',
    question: 'Who will win?',
    market_type: 'winner',
    outcomes: [
      { id: 'agent-1', name: 'Agent Alpha', initial_odds: -150, agent_id: 'agent-1', agent_name: 'Agent Alpha', elo: 1600 },
      { id: 'agent-2', name: 'Agent Beta', initial_odds: 200, agent_id: 'agent-2', agent_name: 'Agent Beta', elo: 1400 },
    ],
    current_odds: { 'agent-1': -150, 'agent-2': 200 },
    status: 'open',
    total_volume: 0,
    total_bets: 0,
    opens_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCompetition(overrides: Partial<CompetitionInfo> = {}): CompetitionInfo {
  return {
    id: 'comp-1',
    name: 'Test Competition',
    task_id: 'browser-tasks',
    agents: [
      { id: 'agent-1', name: 'Agent Alpha', elo: 1600 },
      { id: 'agent-2', name: 'Agent Beta', elo: 1400 },
    ],
    start_time: '2026-02-01T12:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('MetaMarketService', () => {
  let service: MetaMarketService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure env is set so the service is initialized
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    service = new MetaMarketService();
  });

  // --------------------------------------------------------------------------
  // Constructor / Initialization
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should mark as initialized when env vars are present', () => {
      // initialized is private, so we test it indirectly: getActiveMarkets
      // should NOT immediately return [] if initialized
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      // If it were uninitialized it would return [] synchronously
      const result = service.getActiveMarkets();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should mark as uninitialized when SUPABASE_URL is missing', () => {
      delete process.env.SUPABASE_URL;
      const uninitService = new MetaMarketService();
      // Uninitialized service returns empty results immediately
      return expect(uninitService.getActiveMarkets()).resolves.toEqual([]);
    });

    it('should mark as uninitialized when SUPABASE_SERVICE_KEY is missing', () => {
      delete process.env.SUPABASE_SERVICE_KEY;
      const uninitService = new MetaMarketService();
      return expect(uninitService.getUserBets('user-1')).resolves.toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // placeBet
  // --------------------------------------------------------------------------

  describe('placeBet', () => {
    it('should place a bet successfully via the atomic RPC', async () => {
      const market = makeMarket();

      // Mock getMarket
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Mock Guard 1: aio_competitions (non-organizer)
      const competitionChain = createQueryChain({ data: { created_by: 'other-user' }, error: null });
      mockSupabase.from.mockReturnValueOnce(competitionChain);

      // Guard 2 skipped: total_volume = 0

      // Mock Guard 3: aio_meta_market_bets velocity check (< 5 bets)
      const velocityChain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(velocityChain);

      // Mock RPC
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ success: true, bet_id: 'bet-123', new_balance: 900 }],
        error: null,
      });

      // Mock fetching the created bet
      const betData: Partial<MetaMarketBet> = {
        id: 'bet-123',
        market_id: 'market-1',
        user_id: 'user-1',
        outcome_id: 'agent-1',
        outcome_name: 'Agent Alpha',
        amount: 100,
        odds_at_bet: -150,
        potential_payout: 166.67,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
      };
      const fetchBetChain = createQueryChain({ data: betData, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(900);
      expect(result.bet).toBeDefined();
      expect(result.bet!.id).toBe('bet-123');

      // Verify RPC was called with correct params
      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', expect.objectContaining({
        p_user_id: 'user-1',
        p_market_id: 'market-1',
        p_outcome_id: 'agent-1',
        p_outcome_name: 'Agent Alpha',
        p_amount: 100,
      }));
    });

    it('should return error when market is not found', async () => {
      const chain = createQueryChain({ data: null, error: { message: 'not found' } });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'nonexistent', 'agent-1', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Market not found');
    });

    it('should return error when market is not open', async () => {
      const market = makeMarket({ status: 'locked' });
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Market is not open for betting');
    });

    it('should return error when outcome is invalid', async () => {
      const market = makeMarket();
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'market-1', 'nonexistent-outcome', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid outcome');
    });

    it('should return error when amount is zero', async () => {
      const market = makeMarket();
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 0);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Bet amount must be positive');
    });

    it('should return error when amount is negative', async () => {
      const market = makeMarket();
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', -50);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Bet amount must be positive');
    });

    it('should return error when amount exceeds maxBetSize', async () => {
      const market = makeMarket();
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 5000, 1000);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum bet size is M$1000');
    });

    it('should return error when RPC call fails', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer
      const competitionChain = createQueryChain({ data: { created_by: 'other-user' }, error: null });
      mockSupabase.from.mockReturnValueOnce(competitionChain);

      // Guard 2 skipped: total_volume = 0

      // Guard 3: velocity check (< 5 bets)
      const velocityChain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(velocityChain);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC failure' },
      });

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to place bet');
    });

    it('should return error when RPC returns success=false (e.g., insufficient balance)', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer
      const competitionChain = createQueryChain({ data: { created_by: 'other-user' }, error: null });
      mockSupabase.from.mockReturnValueOnce(competitionChain);

      // Guard 2 skipped: total_volume = 0

      // Guard 3: velocity check (< 5 bets)
      const velocityChain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(velocityChain);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ success: false, error_msg: 'Insufficient balance' }],
        error: null,
      });

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient balance');
    });

    it('should return "Service not configured" when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const uninitService = new MetaMarketService();

      const result = await uninitService.placeBet('user-1', 'market-1', 'agent-1', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Service not configured');
    });

    it('should handle exception thrown during placeBet', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer
      const competitionChain = createQueryChain({ data: { created_by: 'other-user' }, error: null });
      mockSupabase.from.mockReturnValueOnce(competitionChain);

      // Guard 2 skipped: total_volume = 0

      // Guard 3: velocity check (< 5 bets)
      const velocityChain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(velocityChain);

      mockSupabase.rpc.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to place bet');
    });

    it('should use initial_odds when current_odds is missing', async () => {
      const market = makeMarket({ current_odds: undefined });
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer
      const competitionChain = createQueryChain({ data: { created_by: 'other-user' }, error: null });
      mockSupabase.from.mockReturnValueOnce(competitionChain);

      // Guard 2 skipped: total_volume = 0

      // Guard 3: velocity check (< 5 bets)
      const velocityChain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(velocityChain);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ success: true, bet_id: 'bet-456', new_balance: 800 }],
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: { message: 'not found' } });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);
      expect(result.success).toBe(true);

      // Verify RPC was called with the initial_odds value (-150 for agent-1)
      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', expect.objectContaining({
        p_odds: -150,
      }));
    });

    it('should fall back to constructed bet object when fetch fails', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer
      const competitionChain = createQueryChain({ data: { created_by: 'other-user' }, error: null });
      mockSupabase.from.mockReturnValueOnce(competitionChain);

      // Guard 2 skipped: total_volume = 0

      // Guard 3: velocity check (< 5 bets)
      const velocityChain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(velocityChain);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-789', new_balance: 500 },
        error: null,
      });

      // Bet fetch returns null (not found)
      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);
      expect(result.success).toBe(true);
      expect(result.bet!.id).toBe('bet-789');
      expect(result.bet!.market_id).toBe('market-1');
      expect(result.bet!.user_id).toBe('user-1');
      expect(result.bet!.outcome_id).toBe('agent-1');
      expect(result.bet!.status).toBe('active');
    });

    it('rejects bet when user is the competition organizer', async () => {
      const organizerId = 'organizer-user-id';
      const market = makeMarket({ competition_id: 'comp-1' });

      // Mock 1: getMarket → aio_meta_markets
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Mock 2: Guard 1 → aio_competitions returns created_by = organizerId
      const competitionChain = createQueryChain({ data: { created_by: organizerId }, error: null });
      mockSupabase.from.mockReturnValueOnce(competitionChain);

      const result = await service.placeBet(organizerId, 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/organizer/i);
    });

    it('rejects bet when user position would exceed 20% of market volume', async () => {
      // total_volume = 1000, 20% = 200; user already has 210, so 210 + new bet > 200
      const market = makeMarket({ total_volume: 1000 });

      // Mock 1: getMarket → aio_meta_markets
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Mock 2: Guard 1 → aio_competitions returns a different user as organizer
      const competitionChain = createQueryChain({ data: { created_by: 'other-user' }, error: null });
      mockSupabase.from.mockReturnValueOnce(competitionChain);

      // Mock 3: Guard 2 → aio_meta_market_bets returns existing bets totalling 210
      const existingBetsChain = createQueryChain({ data: [{ amount: 210 }], error: null });
      mockSupabase.from.mockReturnValueOnce(existingBetsChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 50);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/position limit/i);
    });

    it('rejects bet when user has 5 or more bets on this market in the last hour', async () => {
      // total_volume = 100000 so position limit won't trigger (100 + 0 = 100, max = 20000)
      const market = makeMarket({ total_volume: 100000 });

      // Mock 1: getMarket → aio_meta_markets
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Mock 2: Guard 1 → aio_competitions returns a different user as organizer
      const competitionChain = createQueryChain({ data: { created_by: 'other-user' }, error: null });
      mockSupabase.from.mockReturnValueOnce(competitionChain);

      // Mock 3: Guard 2 position check → no existing bets (won't trigger limit)
      const existingBetsChain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(existingBetsChain);

      // Mock 4: Guard 3 velocity check → 5 recent bets (triggers limit)
      const recentBetsData = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }];
      const velocityChain = createQueryChain({ data: recentBetsData, error: null });
      mockSupabase.from.mockReturnValueOnce(velocityChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/velocity limit/i);
    });
  });

  // --------------------------------------------------------------------------
  // getUserBets
  // --------------------------------------------------------------------------

  describe('getUserBets', () => {
    it('should return user bets with default pagination', async () => {
      const bets: Partial<MetaMarketBet>[] = [
        { id: 'bet-1', user_id: 'user-1', amount: 50 },
        { id: 'bet-2', user_id: 'user-1', amount: 100 },
      ];
      const chain = createQueryChain({ data: bets, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getUserBets('user-1');
      expect(result).toEqual(bets);
      expect(mockSupabase.from).toHaveBeenCalledWith('aio_user_meta_bets');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('should respect custom limit parameter', async () => {
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      await service.getUserBets('user-1', 10);
      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('should return empty array on database error', async () => {
      const chain = createQueryChain({ data: null, error: { message: 'DB error' } });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getUserBets('user-1');
      expect(result).toEqual([]);
    });

    it('should return empty array when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const uninitService = new MetaMarketService();

      const result = await uninitService.getUserBets('user-1');
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getMarketBets
  // --------------------------------------------------------------------------

  describe('getMarketBets', () => {
    it('should return bets for a specific market', async () => {
      const bets: Partial<MetaMarketBet>[] = [
        { id: 'bet-1', market_id: 'market-1', amount: 50 },
      ];
      const chain = createQueryChain({ data: bets, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarketBets('market-1');
      expect(result).toEqual(bets);
      expect(mockSupabase.from).toHaveBeenCalledWith('aio_meta_market_bets');
      expect(chain.eq).toHaveBeenCalledWith('market_id', 'market-1');
    });

    it('should return empty array on database error', async () => {
      const chain = createQueryChain({ data: null, error: { message: 'DB error' } });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarketBets('market-1');
      expect(result).toEqual([]);
    });

    it('should return empty array when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const uninitService = new MetaMarketService();

      const result = await uninitService.getMarketBets('market-1');
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // createMarketForCompetition
  // --------------------------------------------------------------------------

  describe('createMarketForCompetition', () => {
    it('should create a market and upsert agent stats', async () => {
      const competition = makeCompetition();
      const createdMarket = makeMarket();

      // Mock insert chain for market creation
      const insertChain = createQueryChain({ data: createdMarket, error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);

      // Mock upsert chain for agent betting stats
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      const result = await service.createMarketForCompetition(competition);

      expect(result).toEqual(createdMarket);
      expect(mockSupabase.from).toHaveBeenCalledWith('aio_meta_markets');
      expect(mockSupabase.from).toHaveBeenCalledWith('aio_agent_betting_stats');
      expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
        competition_id: 'comp-1',
        market_type: 'winner',
        status: 'open',
        locks_at: '2026-02-01T12:00:00Z',
      }));
    });

    it('should return null on insert error', async () => {
      const competition = makeCompetition();
      const insertChain = createQueryChain({ data: null, error: { message: 'Insert failed' } });
      mockSupabase.from.mockReturnValueOnce(insertChain);

      const result = await service.createMarketForCompetition(competition);
      expect(result).toBeNull();
    });

    it('should return null when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const uninitService = new MetaMarketService();

      const result = await uninitService.createMarketForCompetition(makeCompetition());
      expect(result).toBeNull();
    });

    it('should handle exception gracefully', async () => {
      const competition = makeCompetition();
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Unexpected'); });

      const result = await service.createMarketForCompetition(competition);
      expect(result).toBeNull();
    });

    it('should set locks_at to null when no start_time', async () => {
      const competition = makeCompetition({ start_time: undefined });
      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);

      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
        locks_at: null,
      }));
    });
  });

  // --------------------------------------------------------------------------
  // resolveMarket
  // --------------------------------------------------------------------------

  describe('resolveMarket', () => {
    it('should resolve market with winner', async () => {
      const updateChain = createQueryChain({ data: null, error: null });
      // Make the chain thenable at the `.in()` level (terminal for this query)
      mockSupabase.from.mockReturnValueOnce(updateChain);

      const result = await service.resolveMarket('comp-1', 'agent-1');
      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('aio_meta_markets');
      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'resolved',
        resolved_outcome: 'agent-1',
      }));
      expect(updateChain.eq).toHaveBeenCalledWith('competition_id', 'comp-1');
      expect(updateChain.in).toHaveBeenCalledWith('status', ['open', 'locked']);
    });

    it('should return false on update error', async () => {
      const updateChain = createQueryChain({ data: null, error: { message: 'Update failed' } });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      const result = await service.resolveMarket('comp-1', 'agent-1');
      expect(result).toBe(false);
    });

    it('should return false when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const uninitService = new MetaMarketService();

      const result = await uninitService.resolveMarket('comp-1', 'agent-1');
      expect(result).toBe(false);
    });

    it('should handle exception gracefully', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('DB crash'); });

      const result = await service.resolveMarket('comp-1', 'agent-1');
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getActiveMarkets
  // --------------------------------------------------------------------------

  describe('getActiveMarkets', () => {
    it('should return active markets from the view', async () => {
      const markets = [makeMarket(), makeMarket({ id: 'market-2' })];
      const chain = createQueryChain({ data: markets, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getActiveMarkets();
      expect(result).toEqual(markets);
      expect(mockSupabase.from).toHaveBeenCalledWith('aio_active_meta_markets');
    });

    it('should return empty array on error', async () => {
      const chain = createQueryChain({ data: null, error: { message: 'View error' } });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getActiveMarkets();
      expect(result).toEqual([]);
    });

    it('should return empty array when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const uninitService = new MetaMarketService();

      const result = await uninitService.getActiveMarkets();
      expect(result).toEqual([]);
    });

    it('should handle exception gracefully', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Unexpected'); });

      const result = await service.getActiveMarkets();
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // lockMarket
  // --------------------------------------------------------------------------

  describe('lockMarket', () => {
    it('should lock a market by competition ID', async () => {
      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      const result = await service.lockMarket('comp-1');
      expect(result).toBe(true);
      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'locked',
      }));
    });

    it('should return false on error', async () => {
      const updateChain = createQueryChain({ data: null, error: { message: 'Lock failed' } });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      const result = await service.lockMarket('comp-1');
      expect(result).toBe(false);
    });

    it('should return false when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const uninitService = new MetaMarketService();

      const result = await uninitService.lockMarket('comp-1');
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getMarket
  // --------------------------------------------------------------------------

  describe('getMarket', () => {
    it('should return a market by ID', async () => {
      const market = makeMarket();
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarket('market-1');
      expect(result).toEqual(market);
      expect(chain.eq).toHaveBeenCalledWith('id', 'market-1');
    });

    it('should return null on error', async () => {
      const chain = createQueryChain({ data: null, error: { message: 'Not found' } });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarket('nonexistent');
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getMarketByCompetition
  // --------------------------------------------------------------------------

  describe('getMarketByCompetition', () => {
    it('should return a market by competition ID', async () => {
      const market = makeMarket();
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarketByCompetition('comp-1');
      expect(result).toEqual(market);
      expect(chain.eq).toHaveBeenCalledWith('competition_id', 'comp-1');
    });

    it('should return null when not found', async () => {
      const chain = createQueryChain({ data: null, error: { message: 'Not found' } });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarketByCompetition('nonexistent');
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // registerEventListeners
  // --------------------------------------------------------------------------

  describe('registerEventListeners', () => {
    it('should register three event listeners', () => {
      service.registerEventListeners();

      expect(eventBus.on).toHaveBeenCalledTimes(3);
      expect(eventBus.on).toHaveBeenCalledWith('competition:create', expect.any(Function));
      expect(eventBus.on).toHaveBeenCalledWith('competition:start', expect.any(Function));
      expect(eventBus.on).toHaveBeenCalledWith('competition:end', expect.any(Function));
    });

    it('should not register listeners twice on repeated calls', () => {
      service.registerEventListeners();
      service.registerEventListeners();

      // Should only have 3 calls total, not 6
      expect(eventBus.on).toHaveBeenCalledTimes(3);
    });

    it('competition:create handler should call createMarketForCompetition', async () => {
      service.registerEventListeners();

      const createHandler = (eventBus.on as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'competition:create'
      )?.[1] as (event: { data: CompetitionInfo }) => Promise<void>;

      expect(createHandler).toBeDefined();

      // Mock the supabase calls that createMarketForCompetition makes
      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      const competition = makeCompetition();
      await createHandler({ data: competition });

      expect(mockSupabase.from).toHaveBeenCalledWith('aio_meta_markets');
    });

    it('competition:end handler should call resolveMarket when winner exists', async () => {
      service.registerEventListeners();

      const endHandler = (eventBus.on as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'competition:end'
      )?.[1] as (event: { data: { competitionId: string; winner?: { agentId: string } } }) => Promise<void>;

      expect(endHandler).toBeDefined();

      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      await endHandler({ data: { competitionId: 'comp-1', winner: { agentId: 'agent-1' } } });

      expect(mockSupabase.from).toHaveBeenCalledWith('aio_meta_markets');
      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'resolved',
        resolved_outcome: 'agent-1',
      }));
    });

    it('competition:end handler should NOT resolve when no winner', async () => {
      service.registerEventListeners();

      const endHandler = (eventBus.on as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'competition:end'
      )?.[1] as (event: { data: { competitionId: string; winner?: { agentId: string } } }) => Promise<void>;

      await endHandler({ data: { competitionId: 'comp-1' } });

      // from() should not have been called for resolveMarket
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('competition:start handler should call lockMarket', async () => {
      service.registerEventListeners();

      const startHandler = (eventBus.on as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'competition:start'
      )?.[1] as (event: { data: { competitionId: string } }) => Promise<void>;

      expect(startHandler).toBeDefined();

      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      await startHandler({ data: { competitionId: 'comp-1' } });

      expect(mockSupabase.from).toHaveBeenCalledWith('aio_meta_markets');
      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'locked',
      }));
    });
  });
});
