/**
 * Extra tests for rating-service.ts covering the async
 * updateRatingsAfterCompetition function (DB persistence layer).
 *
 * The companion file rating-service.test.ts already covers the pure
 * math helpers at ~100%. This file targets lines 312-421 to push
 * overall file coverage from ~63% to 95%+.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock infrastructure
// ---------------------------------------------------------------------------

const mockRpc = vi.fn().mockResolvedValue({ error: null });
const mockInsert = vi.fn().mockResolvedValue({ error: null });

/** Default resolve value returned by any chained Supabase query. */
let agentsQueryResult: { data: any; error: any } = { data: [], error: null };

/**
 * A Proxy-based Supabase chain mock.
 * Every property access returns another proxy so that arbitrary chains like
 *   supabase.from('x').select('y').in('z', ids)
 * all work without manually stubbing each method.
 * Thenable support lets `await supabase.from(...)...` resolve to the value.
 */
function createChain() {
  const handler: ProxyHandler<any> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        return (resolve: Function) => resolve(agentsQueryResult);
      }
      if (prop === 'insert') {
        return mockInsert;
      }
      return vi.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

const mockFrom = vi.fn().mockReturnValue(createChain());

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

// Capture logger calls so we can assert on them
const mockLogInfo = vi.fn();
const mockLogError = vi.fn();

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: mockLogInfo,
    error: mockLogError,
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import the function under test AFTER mocks are in place
// ---------------------------------------------------------------------------

const { updateRatingsAfterCompetition } = await import('./rating-service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal LeaderboardEntry matching the real interface. */
function lb(agentId: string, rank: number) {
  return {
    agentId,
    agentName: `Agent ${agentId}`,
    totalScore: 100 - rank,
    eventsWon: rank === 1 ? 1 : 0,
    eventsCompleted: 1,
    rank,
  };
}

/** Build an agent row as returned from the aio_agents table. */
function agentRow(
  id: string,
  overrides: Partial<{
    elo_rating: number | null;
    total_competitions: number | null;
    rating_deviation: number | null;
    volatility: number | null;
  }> = {}
) {
  return {
    id,
    elo_rating: overrides.elo_rating !== undefined ? overrides.elo_rating : 1500,
    total_competitions:
      overrides.total_competitions !== undefined ? overrides.total_competitions : 10,
    rating_deviation:
      overrides.rating_deviation !== undefined ? overrides.rating_deviation : 200,
    volatility: overrides.volatility !== undefined ? overrides.volatility : 0.06,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateRatingsAfterCompetition', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the chain mock so each test can override agentsQueryResult
    mockFrom.mockReturnValue(createChain());

    // Defaults: everything succeeds
    agentsQueryResult = {
      data: [agentRow('a1'), agentRow('a2')],
      error: null,
    };
    mockRpc.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: null });
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('fetches agent ratings from aio_agents', async () => {
    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)]
    );
    expect(mockFrom).toHaveBeenCalledWith('aio_agents');
  });

  it('calls supabase.rpc aio_update_agent_elo for each agent', async () => {
    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)]
    );

    const rpcCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_update_agent_elo'
    );
    expect(rpcCalls.length).toBe(2);

    // Verify the shape of the parameters for the first agent
    const params = rpcCalls[0][1];
    expect(params).toHaveProperty('p_agent_id');
    expect(params).toHaveProperty('p_new_rating');
    expect(params).toHaveProperty('p_new_rd');
    expect(params).toHaveProperty('p_new_volatility');
  });

  it('inserts elo_history for each agent', async () => {
    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)]
    );

    expect(mockFrom).toHaveBeenCalledWith('aio_elo_history');

    // Two agents => two insert calls
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('passes correct fields to elo_history insert', async () => {
    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    // Only one agent, so exactly one insert
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row).toMatchObject({
      agent_id: 'a1',
      competition_id: 'comp-1',
      final_rank: 1,
      participant_count: 1,
      domain_id: null,
    });
    expect(row).toHaveProperty('rating_before');
    expect(row).toHaveProperty('rating_after');
    expect(row).toHaveProperty('rating_change');
    expect(row).toHaveProperty('rd_before');
    expect(row).toHaveProperty('rd_after');
    expect(row).toHaveProperty('volatility_before');
    expect(row).toHaveProperty('volatility_after');
  });

  it('logs success with competition id and agent count', async () => {
    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)]
    );

    expect(mockLogInfo).toHaveBeenCalledWith(
      'Glicko-2 ratings updated',
      expect.objectContaining({
        competitionId: 'comp-1',
        agentCount: 2,
        domainId: 'none',
      })
    );
  });

  // -----------------------------------------------------------------------
  // Early returns on DB errors
  // -----------------------------------------------------------------------

  it('returns early when agents query returns error', async () => {
    agentsQueryResult = {
      data: null,
      error: { message: 'DB down' },
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to fetch agent ratings',
      expect.objectContaining({ error: 'DB down' })
    );
    // Should NOT have called rpc or insert
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns early when agents query returns null data', async () => {
    agentsQueryResult = { data: null, error: null };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to fetch agent ratings',
      expect.objectContaining({ error: undefined })
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Default values for null DB columns
  // -----------------------------------------------------------------------

  it('defaults elo_rating to 1500 when null', async () => {
    agentsQueryResult = {
      data: [agentRow('a1', { elo_rating: null })],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    // The insert should record the default 1500 as ratingBefore
    const row = mockInsert.mock.calls[0][0];
    expect(row.rating_before).toBe(1500);
  });

  it('defaults rating_deviation to 350 when null', async () => {
    agentsQueryResult = {
      data: [agentRow('a1', { rating_deviation: null })],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    const row = mockInsert.mock.calls[0][0];
    expect(row.rd_before).toBe(350);
  });

  it('defaults volatility to 0.06 when null', async () => {
    agentsQueryResult = {
      data: [agentRow('a1', { volatility: null })],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    const row = mockInsert.mock.calls[0][0];
    expect(row.volatility_before).toBe(0.06);
  });

  it('defaults total_competitions to 0 when null', async () => {
    agentsQueryResult = {
      data: [agentRow('a1', { total_competitions: null })],
      error: null,
    };

    // Should not throw -- totalCompetitions is used but only for building
    // the Glicko2Rating struct, which is consumed by calculateMultiPlayerGlicko2
    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    expect(mockRpc).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Rankings map
  // -----------------------------------------------------------------------

  it('builds rankings map from leaderboard', async () => {
    const leaderboard = [lb('a1', 1), lb('a2', 2)];
    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      leaderboard
    );

    // Both agents should have RPC calls (both are in the rankings)
    const rpcCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_update_agent_elo'
    );
    expect(rpcCalls.length).toBe(2);
  });

  it('skips agent when rank is undefined (agent in ratings but not leaderboard)', async () => {
    // Agent a2 is in agentsData but NOT in the leaderboard
    agentsQueryResult = {
      data: [agentRow('a1'), agentRow('a2')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1)] // only a1 in leaderboard
    );

    // calculateMultiPlayerGlicko2 will skip a2 because its rank is undefined
    // in the rankings map, so rpc should only be called for a1
    const rpcCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_update_agent_elo'
    );
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0][1].p_agent_id).toBe('a1');
  });

  // -----------------------------------------------------------------------
  // Error logging for individual DB operations
  // -----------------------------------------------------------------------

  it('logs error when RPC update fails', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'RPC failed' } });

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to update agent rating',
      expect.objectContaining({ agentId: 'a1', error: 'RPC failed' })
    );
  });

  it('logs error when history insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'Insert failed' } });

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to insert rating history',
      expect.objectContaining({ agentId: 'a1', error: 'Insert failed' })
    );
  });

  // -----------------------------------------------------------------------
  // Domain-specific ratings
  // -----------------------------------------------------------------------

  it('calls domain rating upsert when domainId provided', async () => {
    agentsQueryResult = {
      data: [agentRow('a1')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)],
      'domain-xyz'
    );

    const domainCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_upsert_domain_rating'
    );
    expect(domainCalls.length).toBe(1);
    expect(domainCalls[0][1]).toMatchObject({
      p_agent_id: 'a1',
      p_domain_id: 'domain-xyz',
      p_is_win: true,
    });
  });

  it('sets isWin=true for rank 1 agent', async () => {
    agentsQueryResult = {
      data: [agentRow('a1'), agentRow('a2')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)],
      'dom-1'
    );

    const domainCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_upsert_domain_rating'
    );
    const a1Call = domainCalls.find((c: any[]) => c[1].p_agent_id === 'a1');
    expect(a1Call![1].p_is_win).toBe(true);
  });

  it('sets isWin=false for non-rank-1 agent', async () => {
    agentsQueryResult = {
      data: [agentRow('a1'), agentRow('a2')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)],
      'dom-1'
    );

    const domainCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_upsert_domain_rating'
    );
    const a2Call = domainCalls.find((c: any[]) => c[1].p_agent_id === 'a2');
    expect(a2Call![1].p_is_win).toBe(false);
  });

  it('does NOT call domain upsert when domainId is undefined', async () => {
    agentsQueryResult = {
      data: [agentRow('a1')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
      // domainId omitted => undefined
    );

    const domainCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_upsert_domain_rating'
    );
    expect(domainCalls.length).toBe(0);
  });

  it('does NOT call domain upsert when domainId is null', async () => {
    agentsQueryResult = {
      data: [agentRow('a1')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)],
      null
    );

    const domainCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_upsert_domain_rating'
    );
    expect(domainCalls.length).toBe(0);
  });

  it('logs error when domain upsert fails', async () => {
    // aio_update_agent_elo succeeds, aio_upsert_domain_rating fails
    mockRpc.mockImplementation((name: string) => {
      if (name === 'aio_upsert_domain_rating') {
        return Promise.resolve({ error: { message: 'Domain RPC failed' } });
      }
      return Promise.resolve({ error: null });
    });

    agentsQueryResult = {
      data: [agentRow('a1')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)],
      'dom-1'
    );

    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to upsert domain rating',
      expect.objectContaining({
        agentId: 'a1',
        domainId: 'dom-1',
        error: 'Domain RPC failed',
      })
    );
  });

  it('passes null domainId in elo_history when domainId not provided', async () => {
    agentsQueryResult = {
      data: [agentRow('a1')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    const row = mockInsert.mock.calls[0][0];
    expect(row.domain_id).toBeNull();
  });

  it('passes domainId in elo_history when provided', async () => {
    agentsQueryResult = {
      data: [agentRow('a1')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)],
      'dom-42'
    );

    const row = mockInsert.mock.calls[0][0];
    expect(row.domain_id).toBe('dom-42');
  });

  it('logs domainId in success message when provided', async () => {
    agentsQueryResult = {
      data: [agentRow('a1')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)],
      'dom-42'
    );

    expect(mockLogInfo).toHaveBeenCalledWith(
      'Glicko-2 ratings updated',
      expect.objectContaining({ domainId: 'dom-42' })
    );
  });

  // -----------------------------------------------------------------------
  // Top-level error catch
  // -----------------------------------------------------------------------

  it('catches top-level errors and logs them', async () => {
    // Make `from` throw synchronously
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected crash');
    });

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to update ratings',
      expect.objectContaining({
        competitionId: 'comp-1',
        error: 'Unexpected crash',
      })
    );
  });

  it('catches non-Error thrown values and stringifies them', async () => {
    mockFrom.mockImplementation(() => {
      throw 'string error'; // eslint-disable-line no-throw-literal
    });

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to update ratings',
      expect.objectContaining({
        error: 'string error',
      })
    );
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('handles empty participants array', async () => {
    agentsQueryResult = { data: [], error: null };

    await updateRatingsAfterCompetition('comp-1', [], []);

    // No agents => no RPC calls, but should still log success
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockLogInfo).toHaveBeenCalledWith(
      'Glicko-2 ratings updated',
      expect.objectContaining({ agentCount: 0 })
    );
  });

  it('handles single participant', async () => {
    agentsQueryResult = {
      data: [agentRow('solo')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'solo' }],
      [lb('solo', 1)]
    );

    // Single participant => calculateMultiPlayerGlicko2 runs with no opponents
    // RPC should still be called
    const rpcCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_update_agent_elo'
    );
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0][1].p_agent_id).toBe('solo');
  });

  it('handles three agents with domain', async () => {
    agentsQueryResult = {
      data: [agentRow('a1'), agentRow('a2'), agentRow('a3')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }, { agent_id: 'a3' }],
      [lb('a1', 1), lb('a2', 2), lb('a3', 3)],
      'dom-1'
    );

    // 3 RPC calls for elo update + 3 RPC calls for domain upsert
    expect(mockRpc).toHaveBeenCalledTimes(6);

    // 3 history inserts
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it('continues processing remaining agents when one RPC fails', async () => {
    let callCount = 0;
    mockRpc.mockImplementation((name: string) => {
      if (name === 'aio_update_agent_elo') {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ error: { message: 'First agent failed' } });
        }
      }
      return Promise.resolve({ error: null });
    });

    agentsQueryResult = {
      data: [agentRow('a1'), agentRow('a2')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)]
    );

    // Both agents should have had their history inserted despite first RPC failing
    expect(mockInsert).toHaveBeenCalledTimes(2);
    // Error logged for first agent
    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to update agent rating',
      expect.anything()
    );
    // Success still logged at the end
    expect(mockLogInfo).toHaveBeenCalledWith(
      'Glicko-2 ratings updated',
      expect.anything()
    );
  });

  it('continues processing when history insert fails', async () => {
    let insertCallCount = 0;
    mockInsert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        return Promise.resolve({ error: { message: 'Insert boom' } });
      }
      return Promise.resolve({ error: null });
    });

    agentsQueryResult = {
      data: [agentRow('a1'), agentRow('a2')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)]
    );

    // Both inserts attempted
    expect(mockInsert).toHaveBeenCalledTimes(2);
    // Error logged for first
    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to insert rating history',
      expect.objectContaining({ error: 'Insert boom' })
    );
    // Success logged at end
    expect(mockLogInfo).toHaveBeenCalled();
  });

  it('computes correct rating changes (winner gains, loser drops)', async () => {
    agentsQueryResult = {
      data: [agentRow('a1'), agentRow('a2')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)]
    );

    // Find the inserts for each agent
    const a1Insert = mockInsert.mock.calls.find(
      (c: any[]) => c[0].agent_id === 'a1'
    );
    const a2Insert = mockInsert.mock.calls.find(
      (c: any[]) => c[0].agent_id === 'a2'
    );

    expect(a1Insert).toBeDefined();
    expect(a2Insert).toBeDefined();

    // Winner should have positive change, loser negative
    expect(a1Insert![0].rating_change).toBeGreaterThan(0);
    expect(a2Insert![0].rating_change).toBeLessThan(0);
  });

  it('records participant_count correctly', async () => {
    agentsQueryResult = {
      data: [agentRow('a1'), agentRow('a2'), agentRow('a3')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }, { agent_id: 'a3' }],
      [lb('a1', 1), lb('a2', 2), lb('a3', 3)]
    );

    // All inserts should record participant_count = 3
    for (const call of mockInsert.mock.calls) {
      expect(call[0].participant_count).toBe(3);
    }
  });

  it('passes domain upsert params with correct Glicko-2 fields', async () => {
    agentsQueryResult = {
      data: [agentRow('a1')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)],
      'dom-1'
    );

    const domainCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_upsert_domain_rating'
    );
    expect(domainCalls.length).toBe(1);
    const params = domainCalls[0][1];
    expect(params).toHaveProperty('p_agent_id', 'a1');
    expect(params).toHaveProperty('p_domain_id', 'dom-1');
    expect(params).toHaveProperty('p_elo_rating');
    expect(params).toHaveProperty('p_is_win', true);
    expect(params).toHaveProperty('p_rd');
    expect(params).toHaveProperty('p_volatility');
    expect(typeof params.p_elo_rating).toBe('number');
    expect(typeof params.p_rd).toBe('number');
    expect(typeof params.p_volatility).toBe('number');
  });

  it('passes rpc update params with correct Glicko-2 fields', async () => {
    agentsQueryResult = {
      data: [agentRow('a1')],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }],
      [lb('a1', 1)]
    );

    const eloCalls = mockRpc.mock.calls.filter(
      (c: any[]) => c[0] === 'aio_update_agent_elo'
    );
    expect(eloCalls.length).toBe(1);
    const params = eloCalls[0][1];
    expect(typeof params.p_new_rating).toBe('number');
    expect(typeof params.p_new_rd).toBe('number');
    expect(typeof params.p_new_volatility).toBe('number');
  });

  it('handles agents with custom ratings', async () => {
    agentsQueryResult = {
      data: [
        agentRow('a1', { elo_rating: 1800, rating_deviation: 100, volatility: 0.04 }),
        agentRow('a2', { elo_rating: 1200, rating_deviation: 300, volatility: 0.08 }),
      ],
      error: null,
    };

    await updateRatingsAfterCompetition(
      'comp-1',
      [{ agent_id: 'a1' }, { agent_id: 'a2' }],
      [lb('a1', 1), lb('a2', 2)]
    );

    const a1Insert = mockInsert.mock.calls.find(
      (c: any[]) => c[0].agent_id === 'a1'
    );
    expect(a1Insert![0].rating_before).toBe(1800);
    expect(a1Insert![0].rd_before).toBe(100);
    expect(a1Insert![0].volatility_before).toBe(0.04);

    const a2Insert = mockInsert.mock.calls.find(
      (c: any[]) => c[0].agent_id === 'a2'
    );
    expect(a2Insert![0].rating_before).toBe(1200);
    expect(a2Insert![0].rd_before).toBe(300);
    expect(a2Insert![0].volatility_before).toBe(0.08);
  });
});
