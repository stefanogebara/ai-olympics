/**
 * Extra tests for meta-market-service.ts
 *
 * The companion file meta-market-service.test.ts covers the basic happy/error
 * paths at ~74% line coverage and ~15% function coverage. This file targets
 * the remaining gaps to push overall coverage to 95%+:
 *
 * - calculateOddsFromElo (pure function, tested indirectly via createMarketForCompetition)
 * - calculatePayout (pure function, tested indirectly via placeBet RPC params)
 * - Edge cases in every public method
 * - Event listener handler edge cases
 * - Singleton export validation
 */
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

// Ensure env is set so the service initializes as "configured"
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

import { MetaMarketService, metaMarketService } from './meta-market-service.js';
import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { eventBus } from '../shared/utils/events.js';
import type {
  MetaMarket,
  MetaMarketBet,
  CompetitionInfo,
  MarketOutcome,
} from './meta-market-service.js';

// ============================================================================
// HELPERS
// ============================================================================

const mockSupabase = supabase as unknown as {
  from: Mock;
  rpc: Mock;
};

/**
 * Build a chainable mock that mirrors the Supabase query builder pattern.
 * Every method returns `this` except terminal resolution.
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
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);

  // Make chain thenable for queries without .single()
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

describe('MetaMarketService (extra coverage)', () => {
  let service: MetaMarketService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    service = new MetaMarketService();
  });

  // --------------------------------------------------------------------------
  // Singleton export
  // --------------------------------------------------------------------------

  describe('singleton export', () => {
    it('should export a MetaMarketService instance as metaMarketService', () => {
      expect(metaMarketService).toBeInstanceOf(MetaMarketService);
    });

    it('should have the same type as a new instance', () => {
      expect(typeof metaMarketService.getActiveMarkets).toBe('function');
      expect(typeof metaMarketService.placeBet).toBe('function');
      expect(typeof metaMarketService.lockMarket).toBe('function');
      expect(typeof metaMarketService.resolveMarket).toBe('function');
      expect(typeof metaMarketService.getUserBets).toBe('function');
      expect(typeof metaMarketService.getMarketBets).toBe('function');
      expect(typeof metaMarketService.getMarket).toBe('function');
      expect(typeof metaMarketService.getMarketByCompetition).toBe('function');
      expect(typeof metaMarketService.createMarketForCompetition).toBe('function');
      expect(typeof metaMarketService.registerEventListeners).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Constructor / Initialization - edge cases
  // --------------------------------------------------------------------------

  describe('constructor (edge cases)', () => {
    it('should initialize when both env vars are set', () => {
      const s = new MetaMarketService();
      // Verify it tries to use supabase (meaning initialized=true)
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(chain);
      const promise = s.getActiveMarkets();
      expect(promise).toBeInstanceOf(Promise);
      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should not initialize when both env vars are missing', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;
      const s = new MetaMarketService();
      const result = await s.getActiveMarkets();
      expect(result).toEqual([]);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should not initialize when SUPABASE_URL is empty string', async () => {
      process.env.SUPABASE_URL = '';
      const s = new MetaMarketService();
      const result = await s.lockMarket('comp-1');
      expect(result).toBe(false);
    });

    it('should not initialize when SUPABASE_SERVICE_KEY is empty string', async () => {
      process.env.SUPABASE_SERVICE_KEY = '';
      const s = new MetaMarketService();
      const result = await s.resolveMarket('comp-1', 'agent-1');
      expect(result).toBe(false);
    });

    it('should return null from getMarket when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const s = new MetaMarketService();
      const result = await s.getMarket('market-1');
      expect(result).toBeNull();
    });

    it('should return null from getMarketByCompetition when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const s = new MetaMarketService();
      const result = await s.getMarketByCompetition('comp-1');
      expect(result).toBeNull();
    });

    it('should return null from createMarketForCompetition when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const s = new MetaMarketService();
      const result = await s.createMarketForCompetition(makeCompetition());
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // calculateOddsFromElo (tested indirectly through createMarketForCompetition)
  // --------------------------------------------------------------------------

  describe('calculateOddsFromElo (indirect)', () => {
    it('should produce negative odds for the favorite (higher ELO)', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'fav', name: 'Favorite', elo: 1800 },
          { id: 'dog', name: 'Underdog', elo: 1200 },
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      // Favorite should have negative odds
      expect(insertCall.current_odds['fav']).toBeLessThan(0);
      // Underdog should have positive odds
      expect(insertCall.current_odds['dog']).toBeGreaterThan(0);
    });

    it('should produce equal odds when agents have equal ELO', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'a1', name: 'Agent 1', elo: 1500 },
          { id: 'a2', name: 'Agent 2', elo: 1500 },
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      // Equal ELO => expectedScore = 0.5 => both hit the >= 0.5 branch
      // -(0.5/(1-0.5))*100 = -100
      expect(insertCall.current_odds['a1']).toBe(-100);
      expect(insertCall.current_odds['a2']).toBe(-100);
    });

    it('should use default ELO (1500) when agent has no elo', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'a1', name: 'Agent 1' }, // no elo
          { id: 'a2', name: 'Agent 2' }, // no elo
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      // Both default to 1500, equal odds
      expect(insertCall.current_odds['a1']).toBe(-100);
      expect(insertCall.current_odds['a2']).toBe(-100);
    });

    it('should handle 3+ agents correctly', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'a1', name: 'Top', elo: 1800 },
          { id: 'a2', name: 'Mid', elo: 1500 },
          { id: 'a3', name: 'Bot', elo: 1200 },
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      // Top agent should be the biggest favorite (most negative)
      expect(insertCall.current_odds['a1']).toBeLessThan(insertCall.current_odds['a2']);
      // Bot agent should be the biggest underdog (most positive)
      expect(insertCall.current_odds['a3']).toBeGreaterThan(insertCall.current_odds['a2']);
    });

    it('should handle a single agent', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'solo', name: 'Solo Agent', elo: 1500 },
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      // Single agent: avg == elo, expectedScore == 0.5, odds == -100
      expect(insertCall.current_odds['solo']).toBe(-100);
    });

    it('should handle mixed agents with and without elo', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'a1', name: 'With ELO', elo: 1700 },
          { id: 'a2', name: 'Without ELO' }, // defaults to 1500
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      // Agent with higher ELO should be favored
      expect(insertCall.current_odds['a1']).toBeLessThan(insertCall.current_odds['a2']);
    });

    it('should produce outcomes array matching the agents', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'a1', name: 'Alpha', elo: 1600 },
          { id: 'a2', name: 'Beta', elo: 1400 },
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      const outcomes = insertCall.outcomes as MarketOutcome[];

      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]).toEqual(expect.objectContaining({
        id: 'a1',
        name: 'Alpha',
        agent_id: 'a1',
        agent_name: 'Alpha',
        elo: 1600,
      }));
      expect(outcomes[1]).toEqual(expect.objectContaining({
        id: 'a2',
        name: 'Beta',
        agent_id: 'a2',
        agent_name: 'Beta',
        elo: 1400,
      }));
    });

    it('should produce correct question and description', async () => {
      const competition = makeCompetition({
        name: 'Grand Prix',
        task_id: 'speed-race',
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.question).toBe('Who will win the Grand Prix?');
      expect(insertCall.description).toBe('Bet on which AI agent will win this speed-race competition.');
    });

    it('should handle very large elo differences', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'god', name: 'God Tier', elo: 3000 },
          { id: 'noob', name: 'Noob', elo: 500 },
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      // God tier should have very negative odds
      expect(insertCall.current_odds['god']).toBeLessThan(-500);
      // Noob should have very positive odds
      expect(insertCall.current_odds['noob']).toBeGreaterThan(500);
    });
  });

  // --------------------------------------------------------------------------
  // calculatePayout (tested indirectly through placeBet RPC params)
  // --------------------------------------------------------------------------

  describe('calculatePayout (indirect)', () => {
    it('should calculate correct payout for positive odds (underdog)', async () => {
      const market = makeMarket({
        current_odds: { 'agent-2': 200 },
        outcomes: [
          { id: 'agent-2', name: 'Agent Beta', initial_odds: 200 },
        ],
      });
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-1', new_balance: 900 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      await service.placeBet('user-1', 'market-1', 'agent-2', 100);

      // Positive odds: payout = 100 + 100*(200/100) = 100 + 200 = 300
      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', expect.objectContaining({
        p_potential_payout: 300,
        p_odds: 200,
      }));
    });

    it('should calculate correct payout for negative odds (favorite)', async () => {
      const market = makeMarket({
        current_odds: { 'agent-1': -200 },
        outcomes: [
          { id: 'agent-1', name: 'Agent Alpha', initial_odds: -200 },
        ],
      });
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-1', new_balance: 900 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      // Negative odds: payout = 100 + 100*(100/200) = 100 + 50 = 150
      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', expect.objectContaining({
        p_potential_payout: 150,
        p_odds: -200,
      }));
    });

    it('should calculate correct payout for -100 odds (even favorite)', async () => {
      const market = makeMarket({
        current_odds: { 'agent-1': -100 },
        outcomes: [
          { id: 'agent-1', name: 'Agent Alpha', initial_odds: -100 },
        ],
      });
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-1', new_balance: 900 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      // -100 odds: payout = 100 + 100*(100/100) = 100 + 100 = 200
      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', expect.objectContaining({
        p_potential_payout: 200,
        p_odds: -100,
      }));
    });

    it('should calculate correct payout for +100 odds (even underdog)', async () => {
      const market = makeMarket({
        current_odds: { 'agent-2': 100 },
        outcomes: [
          { id: 'agent-2', name: 'Agent Beta', initial_odds: 100 },
        ],
      });
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-1', new_balance: 900 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      await service.placeBet('user-1', 'market-1', 'agent-2', 100);

      // +100 odds: payout = 100 + 100*(100/100) = 100 + 100 = 200
      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', expect.objectContaining({
        p_potential_payout: 200,
        p_odds: 100,
      }));
    });

    it('should calculate correct payout for large positive odds', async () => {
      const market = makeMarket({
        current_odds: { 'agent-2': 500 },
        outcomes: [
          { id: 'agent-2', name: 'Agent Beta', initial_odds: 500 },
        ],
      });
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-1', new_balance: 950 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      await service.placeBet('user-1', 'market-1', 'agent-2', 50);

      // +500 odds: payout = 50 + 50*(500/100) = 50 + 250 = 300
      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', expect.objectContaining({
        p_potential_payout: 300,
        p_odds: 500,
      }));
    });

    it('should calculate correct payout for large negative odds', async () => {
      const market = makeMarket({
        current_odds: { 'agent-1': -500 },
        outcomes: [
          { id: 'agent-1', name: 'Agent Alpha', initial_odds: -500 },
        ],
      });
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-1', new_balance: 750 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      await service.placeBet('user-1', 'market-1', 'agent-1', 250);

      // -500 odds: payout = 250 + 250*(100/500) = 250 + 50 = 300
      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', expect.objectContaining({
        p_potential_payout: 300,
        p_odds: -500,
      }));
    });

    it('should use initial_odds when current_odds has no entry for the outcome', async () => {
      const market = makeMarket({
        current_odds: { 'other-agent': -150 }, // No entry for agent-1
        outcomes: [
          { id: 'agent-1', name: 'Agent Alpha', initial_odds: -200 },
        ],
      });
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-1', new_balance: 900 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', expect.objectContaining({
        p_odds: -200, // Should use initial_odds since current_odds lacks this key
      }));
    });
  });

  // --------------------------------------------------------------------------
  // createMarketForCompetition - additional edge cases
  // --------------------------------------------------------------------------

  describe('createMarketForCompetition (edge cases)', () => {
    it('should upsert agent betting stats for all agents', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'a1', name: 'Alpha', elo: 1600 },
          { id: 'a2', name: 'Beta', elo: 1400 },
          { id: 'a3', name: 'Gamma', elo: 1500 },
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      expect(upsertChain.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ agent_id: 'a1', markets_featured: 1 }),
          expect.objectContaining({ agent_id: 'a2', markets_featured: 1 }),
          expect.objectContaining({ agent_id: 'a3', markets_featured: 1 }),
        ]),
        { onConflict: 'agent_id' }
      );
    });

    it('should set market_type to winner', async () => {
      const competition = makeCompetition();

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
        market_type: 'winner',
        status: 'open',
      }));
    });

    it('should include last_featured_at in agent stats', async () => {
      const competition = makeCompetition();

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      expect(upsertChain.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ last_featured_at: expect.any(String) }),
        ]),
        expect.any(Object)
      );
    });

    it('should return the created market data', async () => {
      const competition = makeCompetition();
      const createdMarket = makeMarket({ id: 'new-market-id' });

      const insertChain = createQueryChain({ data: createdMarket, error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      const result = await service.createMarketForCompetition(competition);

      expect(result).toEqual(createdMarket);
      expect(result!.id).toBe('new-market-id');
    });

    it('should call select and single after insert', async () => {
      const competition = makeCompetition();

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      expect(insertChain.insert).toHaveBeenCalled();
      expect(insertChain.select).toHaveBeenCalled();
      expect(insertChain.single).toHaveBeenCalled();
    });

    it('should set initial_odds on each outcome', async () => {
      const competition = makeCompetition({
        agents: [
          { id: 'a1', name: 'Alpha', elo: 1600 },
          { id: 'a2', name: 'Beta', elo: 1400 },
        ],
      });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await service.createMarketForCompetition(competition);

      const insertCall = insertChain.insert.mock.calls[0][0];
      const outcomes = insertCall.outcomes as MarketOutcome[];
      outcomes.forEach((outcome: MarketOutcome) => {
        expect(typeof outcome.initial_odds).toBe('number');
        expect(outcome.initial_odds).toBe(insertCall.current_odds[outcome.id]);
      });
    });
  });

  // --------------------------------------------------------------------------
  // getActiveMarkets - additional edge cases
  // --------------------------------------------------------------------------

  describe('getActiveMarkets (edge cases)', () => {
    it('should query from aio_active_meta_markets view', async () => {
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      await service.getActiveMarkets();

      expect(mockSupabase.from).toHaveBeenCalledWith('aio_active_meta_markets');
      expect(chain.select).toHaveBeenCalledWith('*');
    });

    it('should return multiple markets', async () => {
      const markets = [
        makeMarket({ id: 'm1' }),
        makeMarket({ id: 'm2' }),
        makeMarket({ id: 'm3' }),
      ];
      const chain = createQueryChain({ data: markets, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getActiveMarkets();

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('m1');
      expect(result[2].id).toBe('m3');
    });

    it('should handle thrown exception', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Connection lost'); });

      const result = await service.getActiveMarkets();

      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getMarket - additional edge cases
  // --------------------------------------------------------------------------

  describe('getMarket (edge cases)', () => {
    it('should query aio_meta_markets with eq on id', async () => {
      const market = makeMarket();
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      await service.getMarket('market-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('aio_meta_markets');
      expect(chain.eq).toHaveBeenCalledWith('id', 'market-123');
      expect(chain.single).toHaveBeenCalled();
    });

    it('should return null when uninitialized', async () => {
      delete process.env.SUPABASE_URL;
      const s = new MetaMarketService();

      const result = await s.getMarket('market-1');

      expect(result).toBeNull();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should handle thrown exception', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Network error'); });

      const result = await service.getMarket('market-1');

      expect(result).toBeNull();
    });

    it('should return market data on success', async () => {
      const market = makeMarket({ id: 'specific-market' });
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarket('specific-market');

      expect(result).toEqual(market);
    });
  });

  // --------------------------------------------------------------------------
  // getMarketByCompetition - additional edge cases
  // --------------------------------------------------------------------------

  describe('getMarketByCompetition (edge cases)', () => {
    it('should query with competition_id, order desc, limit 1', async () => {
      const market = makeMarket();
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      await service.getMarketByCompetition('comp-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('aio_meta_markets');
      expect(chain.eq).toHaveBeenCalledWith('competition_id', 'comp-123');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.limit).toHaveBeenCalledWith(1);
      expect(chain.single).toHaveBeenCalled();
    });

    it('should return null on thrown exception', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('DB down'); });

      const result = await service.getMarketByCompetition('comp-1');

      expect(result).toBeNull();
    });

    it('should return null when not found (no error logging)', async () => {
      const chain = createQueryChain({ data: null, error: { message: 'Not found' } });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarketByCompetition('nonexistent');

      expect(result).toBeNull();
    });

    it('should return market data on success', async () => {
      const market = makeMarket({ competition_id: 'specific-comp' });
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarketByCompetition('specific-comp');

      expect(result).toEqual(market);
    });
  });

  // --------------------------------------------------------------------------
  // placeBet - additional edge cases
  // --------------------------------------------------------------------------

  describe('placeBet (edge cases)', () => {
    it('should use default maxBetSize of 1000 when not provided', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Try to bet 1001 with default maxBetSize
      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 1001);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum bet size is M$1000');
    });

    it('should allow bet exactly at maxBetSize', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-1', new_balance: 0 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 1000);

      expect(result.success).toBe(true);
    });

    it('should respect custom maxBetSize', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 600, 500);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum bet size is M$500');
    });

    it('should handle RPC returning a non-array (single object) result', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      // RPC returns a single object, not an array
      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-single', new_balance: 800 },
        error: null,
      });

      const fetchBetChain = createQueryChain({
        data: { id: 'bet-single', market_id: 'market-1', user_id: 'user-1', outcome_id: 'agent-1', outcome_name: 'Agent Alpha', amount: 100, odds_at_bet: -150, potential_payout: 166.67, status: 'active', created_at: '2026-01-01T00:00:00Z' },
        error: null,
      });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(true);
      expect(result.bet!.id).toBe('bet-single');
      expect(result.newBalance).toBe(800);
    });

    it('should handle RPC returning success=false without error_msg', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ success: false }], // No error_msg
        error: null,
      });

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to place bet'); // Fallback message
    });

    it('should handle RPC returning null data (no row)', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to place bet');
    });

    it('should handle RPC returning empty array', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to place bet');
    });

    it('should reject market with status "resolved"', async () => {
      const market = makeMarket({ status: 'resolved' });
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Market is not open for betting');
    });

    it('should reject market with status "cancelled"', async () => {
      const market = makeMarket({ status: 'cancelled' });
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Market is not open for betting');
    });

    it('should reject market with status "draft"', async () => {
      const market = makeMarket({ status: 'draft' });
      const chain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Market is not open for betting');
    });

    it('should pass correct RPC params including outcome_name', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-1', new_balance: 900 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('place_meta_market_bet_atomic', {
        p_user_id: 'user-1',
        p_market_id: 'market-1',
        p_outcome_id: 'agent-1',
        p_outcome_name: 'Agent Alpha',
        p_amount: 100,
        p_odds: -150,
        p_potential_payout: expect.any(Number),
      });
    });

    it('should construct fallback bet with correct fields', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-fallback', new_balance: 500 },
        error: null,
      });

      // Fetch bet returns null
      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(true);
      expect(result.bet).toEqual(expect.objectContaining({
        id: 'bet-fallback',
        market_id: 'market-1',
        user_id: 'user-1',
        outcome_id: 'agent-1',
        outcome_name: 'Agent Alpha',
        amount: 100,
        odds_at_bet: -150,
        status: 'active',
        created_at: expect.any(String),
      }));
      expect(result.bet!.potential_payout).toBeCloseTo(166.67, 1);
    });

    it('should return fetched bet over fallback when fetch succeeds', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-fetched', new_balance: 500 },
        error: null,
      });

      const fetchedBet = {
        id: 'bet-fetched',
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
      const fetchBetChain = createQueryChain({ data: fetchedBet, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(true);
      expect(result.bet!.id).toBe('bet-fetched');
      expect(result.bet!.created_at).toBe('2026-01-01T00:00:00Z');
    });

    it('should handle bet on the second outcome', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-beta', new_balance: 700 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-2', 100);

      expect(result.success).toBe(true);
      expect(result.bet!.outcome_id).toBe('agent-2');
      expect(result.bet!.outcome_name).toBe('Agent Beta');
      // +200 odds: payout = 100 + 100*(200/100) = 300
      expect(result.bet!.potential_payout).toBe(300);
    });

    it('should handle very small bet amount', async () => {
      const market = makeMarket();
      const getMarketChain = createQueryChain({ data: market, error: null });
      mockSupabase.from.mockReturnValueOnce(getMarketChain);

      // Guard 1: non-organizer; Guard 2 skipped (total_volume=0)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: { created_by: 'other-user' }, error: null }));
      // Guard 3: velocity check (< 5 bets)
      mockSupabase.from.mockReturnValueOnce(createQueryChain({ data: [], error: null }));

      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, bet_id: 'bet-tiny', new_balance: 999 },
        error: null,
      });

      const fetchBetChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(fetchBetChain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 1);

      expect(result.success).toBe(true);
      expect(result.bet!.amount).toBe(1);
    });

    it('should handle getMarket returning null (not error)', async () => {
      const chain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Market not found');
    });
  });

  // --------------------------------------------------------------------------
  // lockMarket - additional edge cases
  // --------------------------------------------------------------------------

  describe('lockMarket (edge cases)', () => {
    it('should update with status locked and updated_at', async () => {
      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      await service.lockMarket('comp-1');

      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'locked',
        updated_at: expect.any(String),
      }));
    });

    it('should filter by competition_id and status=open', async () => {
      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      await service.lockMarket('comp-xyz');

      expect(updateChain.eq).toHaveBeenCalledWith('competition_id', 'comp-xyz');
      expect(updateChain.eq).toHaveBeenCalledWith('status', 'open');
    });

    it('should handle thrown exception', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Connection reset'); });

      const result = await service.lockMarket('comp-1');

      expect(result).toBe(false);
    });

    it('should return true on success', async () => {
      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      const result = await service.lockMarket('comp-1');

      expect(result).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // resolveMarket - additional edge cases
  // --------------------------------------------------------------------------

  describe('resolveMarket (edge cases)', () => {
    it('should update with resolves_at timestamp', async () => {
      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      await service.resolveMarket('comp-1', 'winner-id');

      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'resolved',
        resolved_outcome: 'winner-id',
        resolves_at: expect.any(String),
        updated_at: expect.any(String),
      }));
    });

    it('should filter by competition_id and status in [open, locked]', async () => {
      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      await service.resolveMarket('comp-99', 'agent-99');

      expect(updateChain.eq).toHaveBeenCalledWith('competition_id', 'comp-99');
      expect(updateChain.in).toHaveBeenCalledWith('status', ['open', 'locked']);
    });

    it('should handle thrown exception', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('DB exploded'); });

      const result = await service.resolveMarket('comp-1', 'agent-1');

      expect(result).toBe(false);
    });

    it('should return true on success even with different winner', async () => {
      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      const result = await service.resolveMarket('comp-1', 'agent-2');

      expect(result).toBe(true);
      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
        resolved_outcome: 'agent-2',
      }));
    });
  });

  // --------------------------------------------------------------------------
  // getUserBets - additional edge cases
  // --------------------------------------------------------------------------

  describe('getUserBets (edge cases)', () => {
    it('should query from aio_user_meta_bets view', async () => {
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      await service.getUserBets('user-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('aio_user_meta_bets');
      expect(chain.select).toHaveBeenCalledWith('*');
    });

    it('should order by created_at descending', async () => {
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      await service.getUserBets('user-1');

      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should use default limit of 50', async () => {
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      await service.getUserBets('user-1');

      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('should handle thrown exception', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Timeout'); });

      const result = await service.getUserBets('user-1');

      expect(result).toEqual([]);
    });

    it('should return multiple bets', async () => {
      const bets = [
        { id: 'b1', user_id: 'user-1', amount: 50 },
        { id: 'b2', user_id: 'user-1', amount: 100 },
        { id: 'b3', user_id: 'user-1', amount: 200 },
      ];
      const chain = createQueryChain({ data: bets, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getUserBets('user-1');

      expect(result).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // getMarketBets - additional edge cases
  // --------------------------------------------------------------------------

  describe('getMarketBets (edge cases)', () => {
    it('should query from aio_meta_market_bets table', async () => {
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      await service.getMarketBets('market-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('aio_meta_market_bets');
    });

    it('should order by created_at descending', async () => {
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      await service.getMarketBets('market-1');

      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should handle thrown exception', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Network error'); });

      const result = await service.getMarketBets('market-1');

      expect(result).toEqual([]);
    });

    it('should return multiple bets for a market', async () => {
      const bets = [
        { id: 'b1', market_id: 'market-1', amount: 50 },
        { id: 'b2', market_id: 'market-1', amount: 100 },
      ];
      const chain = createQueryChain({ data: bets, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarketBets('market-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('b1');
    });

    it('should return empty array when market has no bets', async () => {
      const chain = createQueryChain({ data: [], error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await service.getMarketBets('market-empty');

      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // registerEventListeners - additional edge cases
  // --------------------------------------------------------------------------

  describe('registerEventListeners (edge cases)', () => {
    it('should register exactly 3 listeners', () => {
      service.registerEventListeners();

      expect((eventBus.on as Mock)).toHaveBeenCalledTimes(3);
    });

    it('should be idempotent on 3 consecutive calls', () => {
      service.registerEventListeners();
      service.registerEventListeners();
      service.registerEventListeners();

      expect((eventBus.on as Mock)).toHaveBeenCalledTimes(3);
    });

    it('competition:create handler should forward competition data', async () => {
      service.registerEventListeners();

      const createHandler = ((eventBus.on as Mock) as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'competition:create'
      )?.[1] as (event: { data: CompetitionInfo }) => Promise<void>;

      const competition = makeCompetition({ id: 'forwarded-comp', name: 'Forwarded' });

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);
      const upsertChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(upsertChain);

      await createHandler({ data: competition });

      expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
        competition_id: 'forwarded-comp',
        question: 'Who will win the Forwarded?',
      }));
    });

    it('competition:start handler should call lockMarket with competitionId', async () => {
      service.registerEventListeners();

      const startHandler = ((eventBus.on as Mock) as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'competition:start'
      )?.[1] as (event: { data: { competitionId: string } }) => Promise<void>;

      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      await startHandler({ data: { competitionId: 'comp-lock-test' } });

      expect(updateChain.eq).toHaveBeenCalledWith('competition_id', 'comp-lock-test');
    });

    it('competition:end handler should not resolve when winner has no agentId', async () => {
      service.registerEventListeners();

      const endHandler = ((eventBus.on as Mock) as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'competition:end'
      )?.[1] as (event: { data: { competitionId: string; winner?: { agentId: string } } }) => Promise<void>;

      // winner exists but no agentId
      await endHandler({ data: { competitionId: 'comp-1', winner: undefined } });

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('competition:end handler should resolve with correct winnerId', async () => {
      service.registerEventListeners();

      const endHandler = ((eventBus.on as Mock) as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'competition:end'
      )?.[1] as (event: { data: { competitionId: string; winner?: { agentId: string } } }) => Promise<void>;

      const updateChain = createQueryChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(updateChain);

      await endHandler({ data: { competitionId: 'comp-end', winner: { agentId: 'winner-agent' } } });

      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'resolved',
        resolved_outcome: 'winner-agent',
      }));
    });
  });

  // --------------------------------------------------------------------------
  // Cross-cutting: exception handling in all methods
  // --------------------------------------------------------------------------

  describe('exception handling', () => {
    it('createMarketForCompetition should catch exception from upsert chain', async () => {
      const competition = makeCompetition();

      const insertChain = createQueryChain({ data: makeMarket(), error: null });
      mockSupabase.from.mockReturnValueOnce(insertChain);

      // Second from call (upsert) throws
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Upsert failed'); });

      const result = await service.createMarketForCompetition(competition);

      // The exception is caught by the try/catch, but since it happens
      // AFTER the successful insert, the function already has data.
      // Actually looking at the code, the insert is awaited first, then
      // the upsert is awaited. If upsert throws, the catch block returns null.
      expect(result).toBeNull();
    });

    it('placeBet should return Market not found when getMarket throws', async () => {
      // When from() throws, getMarket catches it and returns null,
      // then placeBet sees null and returns 'Market not found'
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('getMarket exploded'); });

      const result = await service.placeBet('user-1', 'market-1', 'agent-1', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Market not found');
    });
  });
});
