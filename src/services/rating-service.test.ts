import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must be hoisted so env vars are set before module imports
const { mockFrom, mockRpc } = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  return {
    mockFrom: vi.fn(),
    mockRpc: vi.fn(),
  };
});

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  GLICKO2_SCALE,
  TAU,
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOL,
  MIN_RATING,
  toGlicko2Scale,
  fromGlicko2Scale,
  g,
  E,
  calculateNewVolatility,
  calculateGlicko2,
  calculateMultiPlayerGlicko2,
  updateRatingsAfterCompetition,
  type Glicko2Rating,
} from './rating-service.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Supabase query chain — all methods return `q` for fluent chaining.
 * `q.then` makes it await-able as a thenable (handles all terminal methods).
 */
function chain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  const q: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'insert', 'update', 'upsert', 'delete']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function makeLeaderboardEntry(agentId: string, rank: number) {
  return {
    agentId,
    agentName: `Agent ${agentId}`,
    totalScore: 100,
    eventsWon: rank === 1 ? 1 : 0,
    eventsCompleted: 1,
    rank,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Glicko-2 Rating Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFrom.mockReturnValue(chain());
    mockRpc.mockResolvedValue({ error: null });
  });

  // ========================================================================
  // Constants
  // ========================================================================
  describe('Constants', () => {
    it('GLICKO2_SCALE is 173.7178', () => {
      expect(GLICKO2_SCALE).toBe(173.7178);
    });

    it('TAU is 0.5', () => {
      expect(TAU).toBe(0.5);
    });

    it('DEFAULT_RATING is 1500', () => {
      expect(DEFAULT_RATING).toBe(1500);
    });

    it('DEFAULT_RD is 350', () => {
      expect(DEFAULT_RD).toBe(350);
    });

    it('DEFAULT_VOL is 0.06', () => {
      expect(DEFAULT_VOL).toBe(0.06);
    });

    it('MIN_RATING is 100', () => {
      expect(MIN_RATING).toBe(100);
    });
  });

  // ========================================================================
  // Scale conversions
  // ========================================================================
  describe('toGlicko2Scale / fromGlicko2Scale', () => {
    it('round-trips default rating correctly', () => {
      const { mu, phi } = toGlicko2Scale(DEFAULT_RATING, DEFAULT_RD);
      const { rating, rd } = fromGlicko2Scale(mu, phi);
      expect(rating).toBeCloseTo(DEFAULT_RATING, 5);
      expect(rd).toBeCloseTo(DEFAULT_RD, 5);
    });

    it('converts 1500 rating to mu=0', () => {
      const { mu } = toGlicko2Scale(1500, 350);
      expect(mu).toBeCloseTo(0, 10);
    });

    it('converts non-default rating correctly', () => {
      const { mu, phi } = toGlicko2Scale(1800, 200);
      expect(mu).toBeCloseTo(300 / GLICKO2_SCALE, 5);
      expect(phi).toBeCloseTo(200 / GLICKO2_SCALE, 5);

      const { rating, rd } = fromGlicko2Scale(mu, phi);
      expect(rating).toBeCloseTo(1800, 5);
      expect(rd).toBeCloseTo(200, 5);
    });

    it('round-trips various ratings', () => {
      const testCases = [
        { r: 1000, rd: 100 },
        { r: 2000, rd: 50 },
        { r: 1500, rd: 350 },
        { r: 1200, rd: 250 },
      ];
      for (const { r, rd } of testCases) {
        const g2 = toGlicko2Scale(r, rd);
        const back = fromGlicko2Scale(g2.mu, g2.phi);
        expect(back.rating).toBeCloseTo(r, 4);
        expect(back.rd).toBeCloseTo(rd, 4);
      }
    });

    it('rating above 1500 gives positive mu', () => {
      const { mu } = toGlicko2Scale(1700, 200);
      expect(mu).toBeGreaterThan(0);
    });

    it('rating below 1500 gives negative mu', () => {
      const { mu } = toGlicko2Scale(1300, 200);
      expect(mu).toBeLessThan(0);
    });
  });

  // ========================================================================
  // g() function
  // ========================================================================
  describe('g(phi)', () => {
    it('returns 1 when phi is 0 (perfectly known opponent)', () => {
      expect(g(0)).toBeCloseTo(1.0, 10);
    });

    it('returns value between 0 and 1 for positive phi', () => {
      const result = g(1.0);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('decreases as phi increases', () => {
      expect(g(0.5)).toBeGreaterThan(g(1.0));
      expect(g(1.0)).toBeGreaterThan(g(2.0));
    });

    it('is deterministic for the same input', () => {
      expect(g(1.5)).toBeCloseTo(g(1.5), 10);
    });

    it('matches expected value for RD=30 (phi=0.1727)', () => {
      const phi = 30 / GLICKO2_SCALE;
      const result = g(phi);
      expect(result).toBeCloseTo(0.9955, 3);
    });

    it('g(DEFAULT_RD / GLICKO2_SCALE) ≈ 0.669', () => {
      const phi = DEFAULT_RD / GLICKO2_SCALE; // ≈ 2.015
      expect(g(phi)).toBeCloseTo(0.669, 2);
    });
  });

  // ========================================================================
  // E() function
  // ========================================================================
  describe('E(mu, mu_j, phi_j)', () => {
    it('returns 0.5 for equal ratings with any RD', () => {
      expect(E(0, 0, 1.0)).toBeCloseTo(0.5, 10);
      expect(E(1.5, 1.5, 0.5)).toBeCloseTo(0.5, 10);
    });

    it('returns > 0.5 when player is stronger', () => {
      expect(E(1.0, 0.0, 1.0)).toBeGreaterThan(0.5);
    });

    it('returns < 0.5 when player is weaker', () => {
      expect(E(0.0, 1.0, 1.0)).toBeLessThan(0.5);
    });

    it('E(a,b,phi) + E(b,a,phi) = 1 (symmetry)', () => {
      const e1 = E(1.0, 0.5, 0.8);
      const e2 = E(0.5, 1.0, 0.8);
      expect(e1 + e2).toBeCloseTo(1.0, 10);
    });

    it('returns value between 0 and 1', () => {
      const result = E(2.0, -2.0, 0.5);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('higher opponent phi reduces rating advantage', () => {
      const sharpAdvantage = E(1, 0, 0) - 0.5;
      const blurredAdvantage = E(1, 0, 3) - 0.5;
      expect(sharpAdvantage).toBeGreaterThan(blurredAdvantage);
    });
  });

  // ========================================================================
  // calculateNewVolatility
  // ========================================================================
  describe('calculateNewVolatility', () => {
    it('converges to a positive value', () => {
      const newSigma = calculateNewVolatility(DEFAULT_VOL, 0.5, DEFAULT_RD / GLICKO2_SCALE, 1.0);
      expect(newSigma).toBeGreaterThan(0);
      expect(isFinite(newSigma)).toBe(true);
    });

    it('stays close to original for small delta', () => {
      const sigma = DEFAULT_VOL;
      const newSigma = calculateNewVolatility(sigma, 0.001, DEFAULT_RD / GLICKO2_SCALE, 1.0);
      expect(Math.abs(newSigma - sigma)).toBeLessThan(0.01);
    });

    it('increases for large unexpected results (large delta)', () => {
      const sigma = DEFAULT_VOL;
      const phi = 0.5;
      const v = 1.0;
      const smallDelta = calculateNewVolatility(sigma, 0.1, phi, v);
      const largeDelta = calculateNewVolatility(sigma, 3.0, phi, v);
      expect(largeDelta).toBeGreaterThan(smallDelta);
    });

    it('returns a finite number (does not diverge)', () => {
      const result = calculateNewVolatility(0.06, 1.5, 1.2, 0.8);
      expect(typeof result).toBe('number');
      expect(isNaN(result)).toBe(false);
      expect(isFinite(result)).toBe(true);
    });
  });

  // ========================================================================
  // calculateGlicko2 (single player)
  // ========================================================================
  describe('calculateGlicko2', () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    const equalOpponent = { rating: 1500, rd: 200 };

    it('increases rating for a win', () => {
      const result = calculateGlicko2(player, [equalOpponent], [1.0]);
      expect(result.rating).toBeGreaterThan(1500);
    });

    it('decreases rating for a loss', () => {
      const result = calculateGlicko2(player, [equalOpponent], [0.0]);
      expect(result.rating).toBeLessThan(1500);
    });

    it('draw against equal opponent: rating unchanged', () => {
      const result = calculateGlicko2(player, [equalOpponent], [0.5]);
      expect(result.rating).toBe(player.rating);
    });

    it('RD shrinks after playing a game', () => {
      const result = calculateGlicko2({ rating: 1500, rd: 300, volatility: 0.06 }, [equalOpponent], [0.5]);
      expect(result.rd).toBeLessThan(300);
    });

    it('RD increases (up to cap) when no opponents', () => {
      const result = calculateGlicko2({ rating: 1500, rd: 100, volatility: 0.06 }, [], []);
      expect(result.rd).toBeGreaterThan(100);
      expect(result.rd).toBeLessThanOrEqual(DEFAULT_RD);
    });

    it('no opponents: rating is unchanged', () => {
      const result = calculateGlicko2(player, [], []);
      expect(result.rating).toBe(player.rating);
    });

    it('no opponents: volatility is unchanged', () => {
      const result = calculateGlicko2(player, [], []);
      expect(result.volatility).toBe(player.volatility);
    });

    it('win vs stronger opponent gives larger gain than win vs equal', () => {
      const strongerOpponent = { rating: 1700, rd: 200 };
      const gainVsEqual = calculateGlicko2(player, [equalOpponent], [1.0]).rating - player.rating;
      const gainVsStronger = calculateGlicko2(player, [strongerOpponent], [1.0]).rating - player.rating;
      expect(gainVsStronger).toBeGreaterThan(gainVsEqual);
    });

    it('handles multiple opponents', () => {
      const opponents = [
        { rating: 1400, rd: 30 },
        { rating: 1550, rd: 100 },
        { rating: 1700, rd: 300 },
      ];
      const result = calculateGlicko2(player, opponents, [1.0, 0.0, 1.0]);
      expect(result.rating).toBeDefined();
      expect(result.rd).toBeLessThan(200);
    });

    it('rating never falls below MIN_RATING', () => {
      const weakPlayer = { rating: MIN_RATING + 50, rd: 100, volatility: 0.06 };
      const strongOpponent = { rating: 3000, rd: 50 };
      const result = calculateGlicko2(weakPlayer, [strongOpponent, strongOpponent, strongOpponent], [0, 0, 0]);
      expect(result.rating).toBeGreaterThanOrEqual(MIN_RATING);
    });

    it('all wins vs all losses: wins result in higher rating', () => {
      const allWins = calculateGlicko2(player, [equalOpponent, equalOpponent, equalOpponent], [1, 1, 1]);
      const allLosses = calculateGlicko2(player, [equalOpponent, equalOpponent, equalOpponent], [0, 0, 0]);
      expect(allWins.rating).toBeGreaterThan(allLosses.rating);
    });

    // Glicko-2 paper example (Section 8) — 2 wins + 1 loss → net positive for these opponents
    it('matches paper example directional result', () => {
      const opponents = [
        { rating: 1400, rd: 30 },
        { rating: 1550, rd: 100 },
        { rating: 1700, rd: 300 },
      ];
      const result = calculateGlicko2(player, opponents, [1.0, 0.0, 1.0]);
      expect(result.rating).toBeGreaterThan(1500);
      expect(result.rating).toBeLessThan(1600);
      expect(result.rd).toBeGreaterThan(140);
      expect(result.rd).toBeLessThan(180);
    });

    it('returns finite values for all fields', () => {
      const result = calculateGlicko2(player, [equalOpponent], [1.0]);
      expect(Number.isFinite(result.rating)).toBe(true);
      expect(Number.isFinite(result.rd)).toBe(true);
      expect(Number.isFinite(result.volatility)).toBe(true);
    });
  });

  // ========================================================================
  // calculateMultiPlayerGlicko2
  // ========================================================================
  describe('calculateMultiPlayerGlicko2', () => {
    const makeAgent = (overrides: Partial<Glicko2Rating> = {}): Glicko2Rating => ({
      id: 'a',
      rating: DEFAULT_RATING,
      rd: 200,
      volatility: DEFAULT_VOL,
      totalCompetitions: 10,
      ...overrides,
    });

    it('winner gains rating, loser drops rating', () => {
      const agents = [makeAgent({ id: 'a' }), makeAgent({ id: 'b' })];
      const rankings = new Map([['a', 1], ['b', 2]]);
      const results = calculateMultiPlayerGlicko2(agents, rankings);
      expect(results.get('a')!.change).toBeGreaterThan(0);
      expect(results.get('b')!.change).toBeLessThan(0);
    });

    it('change = ratingAfter - ratingBefore', () => {
      const agents = [makeAgent({ id: 'a' }), makeAgent({ id: 'b' })];
      const rankings = new Map([['a', 1], ['b', 2]]);
      const results = calculateMultiPlayerGlicko2(agents, rankings);
      for (const [, result] of results) {
        expect(result.change).toBe(result.ratingAfter - result.ratingBefore);
      }
    });

    it('high-RD players change more than low-RD players', () => {
      const highRd = [makeAgent({ id: 'a', rd: 300 }), makeAgent({ id: 'b', rd: 300 })];
      const lowRd = [makeAgent({ id: 'a', rd: 50 }), makeAgent({ id: 'b', rd: 50 })];
      const rankings = new Map([['a', 1], ['b', 2]]);

      const highRdResults = calculateMultiPlayerGlicko2(highRd, rankings);
      const lowRdResults = calculateMultiPlayerGlicko2(lowRd, rankings);

      expect(Math.abs(highRdResults.get('a')!.change))
        .toBeGreaterThan(Math.abs(lowRdResults.get('a')!.change));
    });

    it('RD shrinks after competition', () => {
      const agents = [makeAgent({ id: 'a', rd: 300 }), makeAgent({ id: 'b', rd: 300 })];
      const rankings = new Map([['a', 1], ['b', 2]]);
      const results = calculateMultiPlayerGlicko2(agents, rankings);
      expect(results.get('a')!.rdAfter).toBeLessThan(300);
      expect(results.get('b')!.rdAfter).toBeLessThan(300);
    });

    it('enforces minimum rating floor (MIN_RATING=100)', () => {
      const agents = [
        makeAgent({ id: 'strong', rating: 2000, rd: 50 }),
        makeAgent({ id: 'weak', rating: 100, rd: 50 }),
      ];
      const rankings = new Map([['strong', 1], ['weak', 2]]);
      const results = calculateMultiPlayerGlicko2(agents, rankings);
      expect(results.get('weak')!.ratingAfter).toBeGreaterThanOrEqual(MIN_RATING);
    });

    it('handles 4-player competition in correct rank order', () => {
      const agents = ['a', 'b', 'c', 'd'].map(id => makeAgent({ id }));
      const rankings = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
      const results = calculateMultiPlayerGlicko2(agents, rankings);

      expect(results.get('a')!.change).toBeGreaterThan(0);
      expect(results.get('d')!.change).toBeLessThan(0);
      expect(results.get('a')!.change).toBeGreaterThan(results.get('b')!.change);
      expect(results.get('c')!.change).toBeGreaterThan(results.get('d')!.change);
    });

    it('tied ranks (same rank = draw): equal-rated agents have ~0 change', () => {
      const agents = [makeAgent({ id: 'a' }), makeAgent({ id: 'b' })];
      const rankings = new Map([['a', 1], ['b', 1]]);
      const results = calculateMultiPlayerGlicko2(agents, rankings);
      expect(Math.abs(results.get('a')!.change)).toBeLessThan(5);
      expect(Math.abs(results.get('b')!.change)).toBeLessThan(5);
    });

    it('agent with missing rank is excluded from results', () => {
      const agents = [makeAgent({ id: 'a' }), makeAgent({ id: 'b' })];
      const rankings = new Map([['a', 1]]); // b not ranked
      const results = calculateMultiPlayerGlicko2(agents, rankings);
      expect(results.has('a')).toBe(true);
      expect(results.has('b')).toBe(false);
    });

    it('tracks volatility before/after', () => {
      const agents = [makeAgent({ id: 'a' }), makeAgent({ id: 'b' })];
      const rankings = new Map([['a', 1], ['b', 2]]);
      const results = calculateMultiPlayerGlicko2(agents, rankings);
      const res = results.get('a')!;

      expect(res.volatilityBefore).toBe(DEFAULT_VOL);
      expect(res.volatilityAfter).toBeGreaterThan(0);
    });

    it('single agent: RD increases, rating unchanged (no opponents)', () => {
      const agents = [makeAgent({ id: 'solo', rd: 200 })];
      const rankings = new Map([['solo', 1]]);
      const results = calculateMultiPlayerGlicko2(agents, rankings);
      const res = results.get('solo')!;

      expect(res.change).toBe(0);
      expect(res.rdAfter).toBeGreaterThan(res.rdBefore);
    });

    it('empty agents returns empty map', () => {
      const results = calculateMultiPlayerGlicko2([], new Map());
      expect(results.size).toBe(0);
    });
  });

  // ========================================================================
  // updateRatingsAfterCompetition (DB persistence)
  // ========================================================================
  describe('updateRatingsAfterCompetition', () => {
    const competitionId = 'comp-1';

    const agentsDbRows = [
      { id: 'agent-1', elo_rating: 1500, rating_deviation: 200, volatility: 0.06, total_competitions: 5 },
      { id: 'agent-2', elo_rating: 1500, rating_deviation: 200, volatility: 0.06, total_competitions: 5 },
    ];

    const participants = [{ agent_id: 'agent-1' }, { agent_id: 'agent-2' }];

    const leaderboard = [
      makeLeaderboardEntry('agent-1', 1),
      makeLeaderboardEntry('agent-2', 2),
    ];

    /** Happy-path setup: agents fetch returns data; all subsequent from() calls succeed. */
    function setupFetch(data = agentsDbRows, fetchError: unknown = null) {
      mockFrom
        .mockReturnValueOnce(chain({ data, error: fetchError })) // agents fetch
        .mockReturnValue(chain({ data: null, error: null }));    // history inserts (fallback)
    }

    it('fetches agents by participant IDs', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      expect(mockFrom).toHaveBeenCalledWith('aio_agents');
      const agentsChain = mockFrom.mock.results[0].value;
      expect(agentsChain.select).toHaveBeenCalled();
      expect(agentsChain.in).toHaveBeenCalledWith('id', ['agent-1', 'agent-2']);
    });

    it('calls aio_update_agent_elo rpc for each agent', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      const eloRpcs = mockRpc.mock.calls.filter((args: any[]) => args[0] === 'aio_update_agent_elo');
      expect(eloRpcs.length).toBe(2);

      const updatedIds = eloRpcs.map((args: any[]) => (args[1] as any).p_agent_id);
      expect(updatedIds).toContain('agent-1');
      expect(updatedIds).toContain('agent-2');
    });

    it('passes new Glicko-2 values to rpc update', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      const rpcCall = mockRpc.mock.calls.find(
        (args: any[]) =>
          args[0] === 'aio_update_agent_elo' && (args[1] as any).p_agent_id === 'agent-1'
      );
      expect(rpcCall).toBeDefined();
      expect(typeof (rpcCall![1] as any).p_new_rating).toBe('number');
      expect(typeof (rpcCall![1] as any).p_new_rd).toBe('number');
      expect(typeof (rpcCall![1] as any).p_new_volatility).toBe('number');
    });

    it('inserts an elo history record for each agent', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      const historyCalls = mockFrom.mock.calls.filter((args: any[]) => args[0] === 'aio_elo_history');
      expect(historyCalls.length).toBe(2);
    });

    it('history record contains required fields', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      const firstHistoryIdx = mockFrom.mock.calls.findIndex(
        (args: any[]) => args[0] === 'aio_elo_history'
      );
      const insertArg = mockFrom.mock.results[firstHistoryIdx].value.insert.mock.calls[0][0];

      expect(insertArg.competition_id).toBe(competitionId);
      expect(insertArg.agent_id).toBeDefined();
      expect(insertArg.rating_before).toBeDefined();
      expect(insertArg.rating_after).toBeDefined();
      expect(insertArg.rating_change).toBeDefined();
      expect(insertArg.final_rank).toBeDefined();
      expect(insertArg.participant_count).toBe(leaderboard.length);
    });

    it('history record includes Glicko-2 deviation/volatility fields', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      const firstHistoryIdx = mockFrom.mock.calls.findIndex(
        (args: any[]) => args[0] === 'aio_elo_history'
      );
      const insertArg = mockFrom.mock.results[firstHistoryIdx].value.insert.mock.calls[0][0];

      expect(insertArg.rd_before).toBeDefined();
      expect(insertArg.rd_after).toBeDefined();
      expect(insertArg.volatility_before).toBeDefined();
      expect(insertArg.volatility_after).toBeDefined();
    });

    it('domain_id is null in history when domainId is not provided', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      const firstHistoryIdx = mockFrom.mock.calls.findIndex(
        (args: any[]) => args[0] === 'aio_elo_history'
      );
      const insertArg = mockFrom.mock.results[firstHistoryIdx].value.insert.mock.calls[0][0];
      expect(insertArg.domain_id).toBeNull();
    });

    it('domain_id in history matches the provided domainId', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard, 'domain-abc');

      const firstHistoryIdx = mockFrom.mock.calls.findIndex(
        (args: any[]) => args[0] === 'aio_elo_history'
      );
      const insertArg = mockFrom.mock.results[firstHistoryIdx].value.insert.mock.calls[0][0];
      expect(insertArg.domain_id).toBe('domain-abc');
    });

    it('does NOT call aio_upsert_domain_rating when domainId is absent', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      const domainRpcs = mockRpc.mock.calls.filter(
        (args: any[]) => args[0] === 'aio_upsert_domain_rating'
      );
      expect(domainRpcs.length).toBe(0);
    });

    it('calls aio_upsert_domain_rating once per agent when domainId is provided', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard, 'domain-1');

      const domainRpcs = mockRpc.mock.calls.filter(
        (args: any[]) => args[0] === 'aio_upsert_domain_rating'
      );
      expect(domainRpcs.length).toBe(2);
    });

    it('domain rpc sets p_is_win=true for rank-1, false otherwise', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard, 'domain-1');

      const winnerRpc = mockRpc.mock.calls.find(
        (args: any[]) =>
          args[0] === 'aio_upsert_domain_rating' && (args[1] as any).p_agent_id === 'agent-1'
      );
      const loserRpc = mockRpc.mock.calls.find(
        (args: any[]) =>
          args[0] === 'aio_upsert_domain_rating' && (args[1] as any).p_agent_id === 'agent-2'
      );

      expect((winnerRpc![1] as any).p_domain_id).toBe('domain-1');
      expect((winnerRpc![1] as any).p_is_win).toBe(true);
      expect((loserRpc![1] as any).p_is_win).toBe(false);
    });

    it('domain rpc receives updated rating/rd/volatility values', async () => {
      setupFetch();
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard, 'domain-1');

      const domainRpc = mockRpc.mock.calls.find(
        (args: any[]) =>
          args[0] === 'aio_upsert_domain_rating' && (args[1] as any).p_agent_id === 'agent-1'
      );
      expect(typeof (domainRpc![1] as any).p_elo_rating).toBe('number');
      expect(typeof (domainRpc![1] as any).p_rd).toBe('number');
      expect(typeof (domainRpc![1] as any).p_volatility).toBe('number');
    });

    it('returns early (no rpc calls) when agent fetch fails', async () => {
      mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'DB error' } }));
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('returns early when agents data is null', async () => {
      mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));
      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('continues processing remaining agents after an elo rpc error', async () => {
      setupFetch();
      mockRpc
        .mockResolvedValueOnce({ error: { message: 'update failed' } }) // agent-1 elo update fails
        .mockResolvedValue({ error: null });

      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      // Both history inserts should still happen
      const historyCalls = mockFrom.mock.calls.filter(
        (args: any[]) => args[0] === 'aio_elo_history'
      );
      expect(historyCalls.length).toBe(2);
    });

    it('continues processing after a history insert error', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ data: agentsDbRows, error: null }))           // agents fetch
        .mockReturnValue(chain({ data: null, error: { message: 'insert fail' } })); // all history inserts fail

      await updateRatingsAfterCompetition(competitionId, participants, leaderboard);

      // Both elo update RPCs should still have been called
      const eloRpcs = mockRpc.mock.calls.filter(
        (args: any[]) => args[0] === 'aio_update_agent_elo'
      );
      expect(eloRpcs.length).toBe(2);
    });

    it('handles empty participants without throwing', async () => {
      mockFrom.mockReturnValueOnce(chain({ data: [], error: null }));
      await updateRatingsAfterCompetition(competitionId, [], []);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('falls back to DEFAULT values when DB row fields are null', async () => {
      const nullRow = [{
        id: 'agent-1',
        elo_rating: null,
        rating_deviation: null,
        volatility: null,
        total_competitions: null,
      }];
      mockFrom.mockReturnValueOnce(chain({ data: nullRow, error: null }));

      await updateRatingsAfterCompetition(
        competitionId,
        [{ agent_id: 'agent-1' }],
        [makeLeaderboardEntry('agent-1', 1)]
      );

      const rpcCall = mockRpc.mock.calls.find(
        (args: any[]) => args[0] === 'aio_update_agent_elo'
      );
      expect(rpcCall).toBeDefined();
      expect(typeof (rpcCall![1] as any).p_new_rating).toBe('number');
    });

    it('does not throw on unexpected runtime error', async () => {
      mockFrom.mockImplementation(() => { throw new Error('unexpected'); });
      await expect(
        updateRatingsAfterCompetition(competitionId, participants, leaderboard)
      ).resolves.toBeUndefined();
    });
  });
});
