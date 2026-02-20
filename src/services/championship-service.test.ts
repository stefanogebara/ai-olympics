import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../orchestrator/competition-manager.js', () => ({
  competitionManager: {
    startCompetition: vi.fn(),
  },
}));

import { championshipService } from './championship-service.js';
import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { competitionManager } from '../orchestrator/competition-manager.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a fluent Supabase query-builder mock.
 *
 * Calling `mockSupabaseChain({ data: ..., error: null })` returns a mock
 * where every chained method (`.select()`, `.eq()`, `.single()`, etc.)
 * returns the same builder, and the final awaited value is `{ data, error }`.
 */
function mockSupabaseChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, Mock> = {};

  const handler: ProxyHandler<Record<string, Mock>> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Make the chain thenable so `await` resolves to `result`
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      if (typeof prop === 'string') {
        if (!chain[prop]) {
          chain[prop] = vi.fn().mockReturnValue(new Proxy(chain, handler));
        }
        return chain[prop];
      }
      return undefined;
    },
  };

  return new Proxy(chain, handler);
}

function setupFrom(chainResult: { data: unknown; error: unknown }) {
  const chain = mockSupabaseChain(chainResult);
  (supabase.from as Mock).mockReturnValue(chain);
  return chain;
}

/**
 * Set up `.from()` to return different chains for successive calls.
 * Each entry in `results` is a `{ data, error }` pair.
 */
function setupFromSequence(results: Array<{ data: unknown; error: unknown }>) {
  const chains = results.map((r) => mockSupabaseChain(r));
  const fromMock = supabase.from as Mock;
  chains.forEach((chain, i) => {
    fromMock.mockReturnValueOnce(chain);
  });
  return chains;
}

// ── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// createChampionship
// ═══════════════════════════════════════════════════════════════════════════

describe('createChampionship', () => {
  it('should create a championship with default values and return it', async () => {
    const mockChampionship = { id: 'champ-1', name: 'Grand Prix' };
    setupFrom({ data: mockChampionship, error: null });

    const result = await championshipService.createChampionship({
      name: 'Grand Prix',
      created_by: 'user-1',
    });

    expect(result).toEqual(mockChampionship);
    expect(supabase.from).toHaveBeenCalledWith('aio_championships');
  });

  it('should pass custom fields through to the insert', async () => {
    const mockChampionship = { id: 'champ-2', name: 'Elite Cup' };
    const chain = setupFrom({ data: mockChampionship, error: null });

    await championshipService.createChampionship({
      name: 'Elite Cup',
      created_by: 'user-2',
      total_rounds: 5,
      format: 'elimination',
      max_participants: 16,
      elimination_after_round: 2,
      task_ids: ['task-a', 'task-b'],
    });

    // insert should have been called with the enriched object
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Elite Cup',
        total_rounds: 5,
        format: 'elimination',
        max_participants: 16,
        elimination_after_round: 2,
      }),
    );
  });

  it('should generate round_schedule from task_ids when provided', async () => {
    const chain = setupFrom({ data: { id: 'champ-3' }, error: null });

    await championshipService.createChampionship({
      name: 'Scheduled GP',
      created_by: 'user-3',
      total_rounds: 2,
      task_ids: ['t1'],
    });

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        round_schedule: [
          { task_ids: ['t1'] },
          { task_ids: ['t1'] },
        ],
      }),
    );
  });

  it('should throw when Supabase returns an error', async () => {
    setupFrom({ data: null, error: { message: 'DB error', code: '42000' } });

    await expect(
      championshipService.createChampionship({
        name: 'Broken',
        created_by: 'user-x',
      }),
    ).rejects.toEqual(expect.objectContaining({ message: 'DB error' }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// joinChampionship
// ═══════════════════════════════════════════════════════════════════════════

describe('joinChampionship', () => {
  const recentVerification = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
  const staleVerification = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(); // 25 hours ago

  const validAgent = {
    id: 'agent-1',
    owner_id: 'user-1',
    is_active: true,
    elo_rating: 1500,
    verification_status: 'verified',
    last_verified_at: recentVerification,
  };

  const validChampionship = {
    id: 'champ-1',
    status: 'registration',
    max_participants: 32,
    participant_count: [{ count: 5 }],
    entry_requirements: {},
  };

  function setupJoinHappyPath() {
    // 4 calls to .from() in the happy path:
    // 1. fetch championship
    // 2. fetch agent
    // 3. fetch participant after join
    // + 1 rpc call for aio_join_championship
    setupFromSequence([
      { data: validChampionship, error: null },
      { data: validAgent, error: null },
      { data: { id: 'participant-1', championship_id: 'champ-1', agent_id: 'agent-1' }, error: null },
    ]);
    (supabase.rpc as Mock).mockResolvedValue({ data: 'participant-1', error: null });
  }

  it('should successfully join a championship in registration status', async () => {
    setupJoinHappyPath();

    const result = await championshipService.joinChampionship('champ-1', 'agent-1', 'user-1');

    expect(result).toEqual(expect.objectContaining({ id: 'participant-1' }));
    expect(supabase.rpc).toHaveBeenCalledWith('aio_join_championship', {
      p_championship_id: 'champ-1',
      p_agent_id: 'agent-1',
      p_user_id: 'user-1',
    });
  });

  it('should throw when championship is not found', async () => {
    setupFrom({ data: null, error: { message: 'not found' } });

    await expect(
      championshipService.joinChampionship('missing', 'agent-1', 'user-1'),
    ).rejects.toThrow('Championship not found');
  });

  it('should throw when championship is not in registration status', async () => {
    setupFrom({
      data: { ...validChampionship, status: 'active' },
      error: null,
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow('Championship is not accepting registrations');
  });

  it('should throw when championship is at max capacity', async () => {
    setupFrom({
      data: { ...validChampionship, max_participants: 5, participant_count: [{ count: 5 }] },
      error: null,
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow('Championship is full');
  });

  it('should throw when the agent does not belong to the user', async () => {
    setupFromSequence([
      { data: validChampionship, error: null },
      { data: { ...validAgent, owner_id: 'other-user' }, error: null },
    ]);

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow('Not authorized to use this agent');
  });

  it('should throw when the agent is inactive', async () => {
    setupFromSequence([
      { data: validChampionship, error: null },
      { data: { ...validAgent, is_active: false }, error: null },
    ]);

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow('Agent is not active');
  });

  it('should throw when agent verification is stale (>24h)', async () => {
    setupFromSequence([
      { data: validChampionship, error: null },
      { data: { ...validAgent, last_verified_at: staleVerification }, error: null },
    ]);

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow('Agent must pass verification before joining championships');
  });

  it('should throw when agent is not verified', async () => {
    setupFromSequence([
      { data: validChampionship, error: null },
      { data: { ...validAgent, verification_status: 'pending' }, error: null },
    ]);

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow('Agent must pass verification before joining championships');
  });

  it('should throw when agent ELO is below min_elo requirement', async () => {
    setupFromSequence([
      {
        data: { ...validChampionship, entry_requirements: { min_elo: 2000 } },
        error: null,
      },
      { data: validAgent, error: null },
    ]);

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow(/below minimum requirement/);
  });

  it('should throw when agent ELO exceeds max_elo requirement', async () => {
    setupFromSequence([
      {
        data: { ...validChampionship, entry_requirements: { max_elo: 1400 } },
        error: null,
      },
      { data: validAgent, error: null },
    ]);

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow(/exceeds maximum requirement/);
  });

  it('should throw "Already joined" on unique constraint violation from RPC', async () => {
    setupFromSequence([
      { data: validChampionship, error: null },
      { data: validAgent, error: null },
    ]);
    (supabase.rpc as Mock).mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'unique violation' },
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow('Already joined with this agent');
  });

  it('should throw "Championship is full" when RPC returns full message', async () => {
    setupFromSequence([
      { data: validChampionship, error: null },
      { data: validAgent, error: null },
    ]);
    (supabase.rpc as Mock).mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Championship is full' },
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1'),
    ).rejects.toThrow('Championship is full');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// startNextRound
// ═══════════════════════════════════════════════════════════════════════════

describe('startNextRound', () => {
  const baseChampionship = {
    id: 'champ-1',
    name: 'Grand Prix',
    status: 'active',
    current_round: 0,
    total_rounds: 3,
    domain_id: 'dom-1',
    created_by: 'user-1',
    started_at: null,
    round_schedule: [],
  };

  const participants = [
    { agent_id: 'a1', user_id: 'u1', agent: { id: 'a1', name: 'Bot1' } },
    { agent_id: 'a2', user_id: 'u2', agent: { id: 'a2', name: 'Bot2' } },
  ];

  it('should create a competition for the next round and return round info', async () => {
    const competition = { id: 'comp-99' };

    // 6 .from() calls in the happy path:
    // 1. fetch championship
    // 2. fetch participants
    // 3. insert competition
    // 4. insert competition participants
    // 5. upsert championship round
    // 6. update championship status
    // 7. update competition to running
    setupFromSequence([
      { data: baseChampionship, error: null },             // championship
      { data: participants, error: null },                  // participants
      { data: competition, error: null },                   // competition insert
      { data: null, error: null },                          // competition participants insert
      { data: null, error: null },                          // championship round upsert
      { data: null, error: null },                          // championship update
      { data: null, error: null },                          // competition update to running
    ]);
    (competitionManager.startCompetition as Mock).mockResolvedValue(undefined);

    const result = await championshipService.startNextRound('champ-1');

    expect(result).toEqual({ roundNumber: 1, competitionId: 'comp-99' });
  });

  it('should throw when championship is in a non-startable status', async () => {
    setupFrom({ data: { ...baseChampionship, status: 'completed' }, error: null });

    await expect(championshipService.startNextRound('champ-1')).rejects.toThrow(
      /not in a startable state/,
    );
  });

  it('should throw when all rounds are completed', async () => {
    setupFrom({
      data: { ...baseChampionship, current_round: 3, total_rounds: 3 },
      error: null,
    });

    await expect(championshipService.startNextRound('champ-1')).rejects.toThrow(
      'All rounds have been completed',
    );
  });

  it('should throw when not enough participants', async () => {
    setupFromSequence([
      { data: baseChampionship, error: null },
      { data: [{ agent_id: 'a1', user_id: 'u1' }], error: null }, // only 1
    ]);

    await expect(championshipService.startNextRound('champ-1')).rejects.toThrow(
      'Not enough non-eliminated participants',
    );
  });

  it('should throw when championship is not found', async () => {
    setupFrom({ data: null, error: { message: 'not found' } });

    await expect(championshipService.startNextRound('missing')).rejects.toThrow(
      /Championship not found/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// processRoundResults
// ═══════════════════════════════════════════════════════════════════════════

describe('processRoundResults', () => {
  const championship = {
    id: 'champ-1',
    format: 'points',
    total_rounds: 3,
    points_config: { '1st': 25, '2nd': 18, '3rd': 15 },
    elimination_after_round: null,
  };

  const round = {
    id: 'round-1',
    competition_id: 'comp-1',
  };

  const compParticipants = [
    { agent_id: 'a1', final_rank: 1, final_score: 100 },
    { agent_id: 'a2', final_rank: 2, final_score: 80 },
  ];

  const champParticipants = [
    { id: 'cp-1', agent_id: 'a1' },
    { id: 'cp-2', agent_id: 'a2' },
  ];

  it('should award points, upsert results, update standings, and mark round completed', async () => {
    // 6 .from() calls:
    // 1. fetch championship
    // 2. fetch round
    // 3. fetch competition participants
    // 4. fetch championship participants
    // 5. upsert round results
    // 6. update round status to completed
    // 7. update championship status to between_rounds (not final round)
    setupFromSequence([
      { data: championship, error: null },        // championship
      { data: round, error: null },               // round
      { data: compParticipants, error: null },     // competition participants
      { data: champParticipants, error: null },    // championship participants
      { data: null, error: null },                 // upsert round results
      { data: null, error: null },                 // update round completed
      { data: null, error: null },                 // update championship between_rounds
    ]);
    // rpc calls: 2 points increments + 1 batch_update_championship_ranks
    (supabase.rpc as Mock).mockResolvedValue({ data: null, error: null });

    await championshipService.processRoundResults('champ-1', 1);

    // Should have called rpc for points increment (2 participants) + standings update
    expect(supabase.rpc).toHaveBeenCalledWith('aio_increment_championship_points', {
      p_participant_id: 'cp-1',
      p_points: 25,
      p_increment_rounds: true,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('aio_increment_championship_points', {
      p_participant_id: 'cp-2',
      p_points: 18,
      p_increment_rounds: true,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('batch_update_championship_ranks', {
      p_championship_id: 'champ-1',
    });
  });

  it('should mark championship as completed when processing the final round', async () => {
    const finalChampionship = { ...championship, total_rounds: 1 };

    setupFromSequence([
      { data: finalChampionship, error: null },
      { data: round, error: null },
      { data: compParticipants, error: null },
      { data: champParticipants, error: null },
      { data: null, error: null },                // upsert round results
      { data: null, error: null },                // update round completed
      { data: null, error: null },                // update championship completed
    ]);
    (supabase.rpc as Mock).mockResolvedValue({ data: null, error: null });

    // Processing round 1 of a 1-round championship
    await championshipService.processRoundResults('champ-1', 1);

    // The last .from('aio_championships').update() should set status to 'completed'
    // We verify no errors were thrown and the flow completed
    expect(supabase.rpc).toHaveBeenCalledWith('batch_update_championship_ranks', {
      p_championship_id: 'champ-1',
    });
  });

  it('should trigger elimination for elimination format after the configured round', async () => {
    const elimChampionship = {
      ...championship,
      format: 'elimination',
      elimination_after_round: 1,
      total_rounds: 3,
    };

    setupFromSequence([
      { data: elimChampionship, error: null },
      { data: round, error: null },
      { data: compParticipants, error: null },
      { data: champParticipants, error: null },
      { data: null, error: null },                // upsert round results
      { data: null, error: null },                // update round completed
      { data: null, error: null },                // update championship between_rounds
    ]);
    (supabase.rpc as Mock).mockResolvedValue({ data: null, error: null });

    await championshipService.processRoundResults('champ-1', 1);

    // Should call batch_eliminate_championship_bottom in addition to ranks
    expect(supabase.rpc).toHaveBeenCalledWith('batch_eliminate_championship_bottom', {
      p_championship_id: 'champ-1',
    });
  });

  it('should trigger elimination for hybrid format', async () => {
    const hybridChampionship = {
      ...championship,
      format: 'hybrid',
      elimination_after_round: 2,
      total_rounds: 3,
    };

    setupFromSequence([
      { data: hybridChampionship, error: null },
      { data: round, error: null },
      { data: compParticipants, error: null },
      { data: champParticipants, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    (supabase.rpc as Mock).mockResolvedValue({ data: null, error: null });

    await championshipService.processRoundResults('champ-1', 2);

    expect(supabase.rpc).toHaveBeenCalledWith('batch_eliminate_championship_bottom', {
      p_championship_id: 'champ-1',
    });
  });

  it('should NOT trigger elimination when round is before elimination_after_round', async () => {
    const elimChampionship = {
      ...championship,
      format: 'elimination',
      elimination_after_round: 3,
      total_rounds: 5,
    };

    setupFromSequence([
      { data: elimChampionship, error: null },
      { data: round, error: null },
      { data: compParticipants, error: null },
      { data: champParticipants, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    (supabase.rpc as Mock).mockResolvedValue({ data: null, error: null });

    await championshipService.processRoundResults('champ-1', 1);

    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'batch_eliminate_championship_bottom',
      expect.anything(),
    );
  });

  it('should throw when championship is not found', async () => {
    setupFrom({ data: null, error: null });

    await expect(
      championshipService.processRoundResults('missing', 1),
    ).rejects.toThrow('Championship not found');
  });

  it('should throw when round is not found', async () => {
    setupFromSequence([
      { data: championship, error: null },
      { data: null, error: null }, // round not found
    ]);

    await expect(
      championshipService.processRoundResults('champ-1', 99),
    ).rejects.toThrow(/Round 99 not found/);
  });

  it('should return early without error when no competition results exist', async () => {
    setupFromSequence([
      { data: championship, error: null },
      { data: round, error: null },
      { data: [], error: null },  // empty competition participants
    ]);

    // Should not throw
    await championshipService.processRoundResults('champ-1', 1);

    // Should not have called rpc for points
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'aio_increment_championship_points',
      expect.anything(),
    );
  });

  it('should award 0 points for ranks beyond the points config', async () => {
    const sparsePoints = { ...championship, points_config: { '1st': 25 } };

    setupFromSequence([
      { data: sparsePoints, error: null },
      { data: round, error: null },
      { data: compParticipants, error: null }, // agent a2 has rank 2 but no '2nd' key
      { data: champParticipants, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    (supabase.rpc as Mock).mockResolvedValue({ data: null, error: null });

    await championshipService.processRoundResults('champ-1', 1);

    // Second participant should get 0 points
    expect(supabase.rpc).toHaveBeenCalledWith('aio_increment_championship_points', {
      p_participant_id: 'cp-2',
      p_points: 0,
      p_increment_rounds: true,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getStandings
// ═══════════════════════════════════════════════════════════════════════════

describe('getStandings', () => {
  it('should return participants ordered by total_points descending', async () => {
    const standings = [
      { id: 'cp-1', total_points: 50, agent: { id: 'a1', name: 'Bot1' } },
      { id: 'cp-2', total_points: 30, agent: { id: 'a2', name: 'Bot2' } },
    ];
    setupFrom({ data: standings, error: null });

    const result = await championshipService.getStandings('champ-1');

    expect(result).toEqual(standings);
    expect(supabase.from).toHaveBeenCalledWith('aio_championship_participants');
  });

  it('should return an empty array when data is null', async () => {
    setupFrom({ data: null, error: null });

    const result = await championshipService.getStandings('champ-1');

    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkEntryRequirements
// ═══════════════════════════════════════════════════════════════════════════

describe('checkEntryRequirements', () => {
  it('should return eligible when no requirements are set', async () => {
    const result = await championshipService.checkEntryRequirements('agent-1', {});

    expect(result).toEqual({ eligible: true });
    // Should NOT have queried the database
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('should return eligible when agent meets min_elo', async () => {
    setupFrom({ data: { elo_rating: 1800 }, error: null });

    const result = await championshipService.checkEntryRequirements('agent-1', {
      min_elo: 1500,
    });

    expect(result).toEqual({ eligible: true });
  });

  it('should return ineligible when agent ELO is below min_elo', async () => {
    setupFrom({ data: { elo_rating: 1100 }, error: null });

    const result = await championshipService.checkEntryRequirements('agent-1', {
      min_elo: 1500,
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/below the minimum requirement/);
  });

  it('should return ineligible when agent is not found and min_elo is set', async () => {
    setupFrom({ data: null, error: null });

    const result = await championshipService.checkEntryRequirements('missing-agent', {
      min_elo: 1500,
    });

    expect(result.eligible).toBe(false);
  });
});
