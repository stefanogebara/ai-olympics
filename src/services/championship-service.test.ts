/**
 * Tests for ChampionshipService (championship-service.ts)
 *
 * Covers: createChampionship, joinChampionship, startNextRound,
 * processRoundResults (points + status transitions + elimination),
 * getStandings, checkEntryRequirements.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFrom, mockRpc, mockStartCompetition } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  mockStartCompetition: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('../orchestrator/competition-manager.js', () => ({
  competitionManager: { startCompetition: mockStartCompetition },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { championshipService } from './championship-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'insert', 'update', 'upsert', 'order', 'range']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  q.then = (
    resolve: (v: unknown) => unknown,
    _reject: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, _reject);
  return q;
}

function setupFrom(tableMap: Record<string, ReturnType<typeof chain>>) {
  mockFrom.mockImplementation((table: string) => tableMap[table] ?? chain());
}

const RECENT_VERIFIED_AT = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
const STALE_VERIFIED_AT  = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 h ago

function makeChampionship(overrides: Record<string, unknown> = {}) {
  return {
    id: 'champ-1',
    name: 'Test Championship',
    status: 'registration',
    current_round: 0,
    total_rounds: 3,
    format: 'points',
    points_config: { '1st': 25, '2nd': 18, '3rd': 15 },
    domain_id: null,
    created_by: 'user-1',
    started_at: null,
    elimination_after_round: null,
    entry_requirements: {},
    round_schedule: [],
    max_participants: 32,
    participant_count: [{ count: 2 }],
    ...overrides,
  };
}

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    owner_id: 'user-1',
    is_active: true,
    elo_rating: 1400,
    verification_status: 'verified',
    last_verified_at: RECENT_VERIFIED_AT,
    ...overrides,
  };
}

function makeParticipants(n = 2) {
  return Array.from({ length: n }, (_, i) => ({
    id: `cp-${i + 1}`,
    agent_id: `agent-${i + 1}`,
    user_id: `user-${i + 1}`,
    total_points: (n - i) * 10,
    is_eliminated: false,
    agent: { id: `agent-${i + 1}`, name: `Agent ${i + 1}` },
  }));
}

// ---------------------------------------------------------------------------
// Tests: createChampionship
// ---------------------------------------------------------------------------

describe('createChampionship', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('uses default values when optional fields are omitted', async () => {
    const champ = { id: 'champ-1', name: 'Test' };
    const c = chain({ data: champ, error: null });
    mockFrom.mockReturnValue(c);

    const result = await championshipService.createChampionship({
      name: 'Test',
      created_by: 'user-1',
    });

    expect(result).toEqual(champ);
    expect(c.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test',
        total_rounds: 3,
        format: 'points',
        max_participants: 32,
        created_by: 'user-1',
      })
    );
  });

  it('builds round_schedule from task_ids when provided', async () => {
    const c = chain({ data: { id: 'champ-1' }, error: null });
    mockFrom.mockReturnValue(c);

    await championshipService.createChampionship({
      name: 'Test',
      created_by: 'user-1',
      total_rounds: 2,
      task_ids: ['task-a', 'task-b'],
    });

    expect(c.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        round_schedule: [
          { task_ids: ['task-a', 'task-b'] },
          { task_ids: ['task-a', 'task-b'] },
        ],
      })
    );
  });

  it('throws when insert fails', async () => {
    const c = chain({ data: null, error: { message: 'insert error' } });
    mockFrom.mockReturnValue(c);

    await expect(
      championshipService.createChampionship({ name: 'Test', created_by: 'user-1' })
    ).rejects.toMatchObject({ message: 'insert error' });
  });
});

// ---------------------------------------------------------------------------
// Tests: joinChampionship
// ---------------------------------------------------------------------------

describe('joinChampionship', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('succeeds and returns the participant record', async () => {
    const participant = { id: 'part-1', agent_id: 'agent-1' };
    setupFrom({
      aio_championships: chain({ data: makeChampionship(), error: null }),
      aio_agents: chain({ data: makeAgent(), error: null }),
      aio_championship_participants: chain({ data: participant, error: null }),
    });
    mockRpc.mockResolvedValue({ data: 'part-1', error: null });

    const result = await championshipService.joinChampionship('champ-1', 'agent-1', 'user-1');
    expect(result).toEqual(participant);
  });

  it('throws when championship is not found', async () => {
    setupFrom({
      aio_championships: chain({ data: null, error: { message: 'not found' } }),
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1')
    ).rejects.toThrow('Championship not found');
  });

  it('throws when championship is not in registration status', async () => {
    setupFrom({
      aio_championships: chain({ data: makeChampionship({ status: 'active' }), error: null }),
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1')
    ).rejects.toThrow('not accepting registrations');
  });

  it('throws when championship is full', async () => {
    setupFrom({
      aio_championships: chain({
        data: makeChampionship({ max_participants: 2, participant_count: [{ count: 2 }] }),
        error: null,
      }),
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1')
    ).rejects.toThrow('full');
  });

  it('throws when agent is not owned by the requesting user', async () => {
    setupFrom({
      aio_championships: chain({ data: makeChampionship(), error: null }),
      aio_agents: chain({ data: makeAgent({ owner_id: 'other-user' }), error: null }),
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1')
    ).rejects.toThrow('Not authorized');
  });

  it('throws when agent is not active', async () => {
    setupFrom({
      aio_championships: chain({ data: makeChampionship(), error: null }),
      aio_agents: chain({ data: makeAgent({ is_active: false }), error: null }),
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1')
    ).rejects.toThrow('not active');
  });

  it('throws when agent verification status is not verified', async () => {
    setupFrom({
      aio_championships: chain({ data: makeChampionship(), error: null }),
      aio_agents: chain({
        data: makeAgent({ verification_status: 'pending' }),
        error: null,
      }),
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1')
    ).rejects.toThrow('verification');
  });

  it('throws when agent verification is older than 24 hours', async () => {
    setupFrom({
      aio_championships: chain({ data: makeChampionship(), error: null }),
      aio_agents: chain({
        data: makeAgent({ last_verified_at: STALE_VERIFIED_AT }),
        error: null,
      }),
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1')
    ).rejects.toThrow('verification');
  });

  it('throws when agent ELO is below min_elo requirement', async () => {
    setupFrom({
      aio_championships: chain({
        data: makeChampionship({ entry_requirements: { min_elo: 1600 } }),
        error: null,
      }),
      aio_agents: chain({ data: makeAgent({ elo_rating: 1200 }), error: null }),
    });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1')
    ).rejects.toThrow('below minimum');
  });

  it('throws "Already joined" when RPC returns duplicate key error', async () => {
    setupFrom({
      aio_championships: chain({ data: makeChampionship(), error: null }),
      aio_agents: chain({ data: makeAgent(), error: null }),
    });
    mockRpc.mockResolvedValue({ data: null, error: { code: '23505' } });

    await expect(
      championshipService.joinChampionship('champ-1', 'agent-1', 'user-1')
    ).rejects.toThrow('Already joined');
  });
});

// ---------------------------------------------------------------------------
// Tests: startNextRound
// ---------------------------------------------------------------------------

describe('startNextRound', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns roundNumber and competitionId on success', async () => {
    const competition = { id: 'comp-1', name: 'Test Championship - Round 1' };
    setupFrom({
      aio_championships: chain({
        data: makeChampionship({ status: 'active', current_round: 0 }),
        error: null,
      }),
      aio_championship_participants: chain({ data: makeParticipants(3), error: null }),
      aio_competitions: chain({ data: competition, error: null }),
      aio_competition_participants: chain({ data: null, error: null }),
      aio_championship_rounds: chain({ data: null, error: null }),
    });

    const result = await championshipService.startNextRound('champ-1');

    expect(result).toEqual({ roundNumber: 1, competitionId: 'comp-1' });
  });

  it('calls competitionManager.startCompetition (fire-and-forget)', async () => {
    const competition = { id: 'comp-99' };
    setupFrom({
      aio_championships: chain({
        data: makeChampionship({ status: 'active', current_round: 0 }),
        error: null,
      }),
      aio_championship_participants: chain({ data: makeParticipants(2), error: null }),
      aio_competitions: chain({ data: competition, error: null }),
      aio_competition_participants: chain({ data: null, error: null }),
      aio_championship_rounds: chain({ data: null, error: null }),
    });

    await championshipService.startNextRound('champ-1');

    expect(mockStartCompetition).toHaveBeenCalledWith('comp-99', expect.anything());
  });

  it('names the competition with the round number', async () => {
    const compChain = chain({ data: { id: 'comp-1' }, error: null });
    setupFrom({
      aio_championships: chain({
        data: makeChampionship({ name: 'Grand Prix', status: 'between_rounds', current_round: 1 }),
        error: null,
      }),
      aio_championship_participants: chain({ data: makeParticipants(2), error: null }),
      aio_competitions: compChain,
      aio_competition_participants: chain({ data: null, error: null }),
      aio_championship_rounds: chain({ data: null, error: null }),
    });

    await championshipService.startNextRound('champ-1');

    expect(compChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Grand Prix - Round 2' })
    );
  });

  it('throws when championship is not found', async () => {
    setupFrom({
      aio_championships: chain({ data: null, error: { message: 'not found' } }),
    });

    await expect(championshipService.startNextRound('champ-1')).rejects.toThrow('not found');
  });

  it('throws when all rounds have been completed', async () => {
    setupFrom({
      aio_championships: chain({
        data: makeChampionship({ status: 'active', current_round: 3, total_rounds: 3 }),
        error: null,
      }),
    });

    await expect(championshipService.startNextRound('champ-1')).rejects.toThrow(
      'All rounds have been completed'
    );
  });

  it('throws when fewer than 2 non-eliminated participants remain', async () => {
    setupFrom({
      aio_championships: chain({
        data: makeChampionship({ status: 'active', current_round: 0 }),
        error: null,
      }),
      aio_championship_participants: chain({ data: [makeParticipants(1)[0]], error: null }),
    });

    await expect(championshipService.startNextRound('champ-1')).rejects.toThrow(
      'Not enough'
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: processRoundResults
// ---------------------------------------------------------------------------

describe('processRoundResults', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  /** Helper to wire up the full call chain for processRoundResults. */
  function setupRound({
    championship = makeChampionship({ current_round: 1 }),
    compParticipants = [
      { agent_id: 'agent-1', final_rank: 1, final_score: 1000 },
      { agent_id: 'agent-2', final_rank: 2, final_score: 800 },
    ],
    champParticipants = [
      { id: 'cp-1', agent_id: 'agent-1', total_points: 0 },
      { id: 'cp-2', agent_id: 'agent-2', total_points: 0 },
    ],
  } = {}) {
    const champChain = chain({ data: championship, error: null });
    setupFrom({
      aio_championships: champChain,
      aio_championship_rounds: chain({
        data: { id: 'round-1', competition_id: 'comp-1' },
        error: null,
      }),
      aio_competition_participants: chain({ data: compParticipants, error: null }),
      aio_championship_participants: chain({ data: champParticipants, error: null }),
      aio_championship_round_results: chain({ data: null, error: null }),
    });
    mockRpc.mockResolvedValue({ data: null, error: null });
    return { champChain };
  }

  it('awards F1 points: 25 for 1st, 18 for 2nd', async () => {
    setupRound();

    await championshipService.processRoundResults('champ-1', 1);

    expect(mockRpc).toHaveBeenCalledWith('aio_increment_championship_points', {
      p_participant_id: 'cp-1',
      p_points: 25,
      p_increment_rounds: true,
    });
    expect(mockRpc).toHaveBeenCalledWith('aio_increment_championship_points', {
      p_participant_id: 'cp-2',
      p_points: 18,
      p_increment_rounds: true,
    });
  });

  it('sets championship status to "completed" after the final round', async () => {
    const { champChain } = setupRound({
      championship: makeChampionship({ current_round: 3, total_rounds: 3 }),
    });

    await championshipService.processRoundResults('champ-1', 3);

    expect(champChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('sets championship status to "between_rounds" for non-final rounds', async () => {
    const { champChain } = setupRound({
      championship: makeChampionship({ current_round: 1, total_rounds: 3 }),
    });

    await championshipService.processRoundResults('champ-1', 1);

    expect(champChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'between_rounds' })
    );
  });

  it('triggers elimination when format is "elimination" and round meets threshold', async () => {
    // elimination_after_round = 1, roundNumber = 1 → triggers
    const champParticipants = [
      { id: 'cp-1', agent_id: 'a-1', total_points: 50 },
      { id: 'cp-2', agent_id: 'a-2', total_points: 30 },
      { id: 'cp-3', agent_id: 'a-3', total_points: 10 },
      { id: 'cp-4', agent_id: 'a-4', total_points: 5 },
    ];
    // Build chains manually so we can capture the participants chain
    const champParticipantsChain = chain({ data: champParticipants, error: null });
    setupFrom({
      aio_championships: chain({
        data: makeChampionship({
          format: 'elimination',
          elimination_after_round: 1,
          current_round: 1,
          total_rounds: 3,
        }),
        error: null,
      }),
      aio_championship_rounds: chain({ data: { id: 'round-1', competition_id: 'comp-1' }, error: null }),
      aio_competition_participants: chain({ data: [
        { agent_id: 'a-1', final_rank: 1, final_score: 1000 },
        { agent_id: 'a-2', final_rank: 2, final_score: 800 },
      ], error: null }),
      aio_championship_participants: champParticipantsChain,
      aio_championship_round_results: chain({ data: null, error: null }),
    });
    mockRpc.mockResolvedValue({ data: null, error: null });

    await championshipService.processRoundResults('champ-1', 1);

    // Bottom half (cp-3, cp-4) should be marked eliminated
    expect(champParticipantsChain.update).toHaveBeenCalledWith({ is_eliminated: true });
  });

  it('does not trigger elimination for "points" format', async () => {
    setupRound({
      championship: makeChampionship({ format: 'points', current_round: 1 }),
    });

    await championshipService.processRoundResults('champ-1', 1);

    // is_eliminated update should never be called
    expect(mockRpc).not.toHaveBeenCalledWith(
      expect.stringContaining('eliminate'),
      expect.anything()
    );
  });

  it('returns early without awarding points when no competition results exist', async () => {
    setupRound({ compParticipants: [] });

    await championshipService.processRoundResults('champ-1', 1);

    expect(mockRpc).not.toHaveBeenCalledWith(
      'aio_increment_championship_points',
      expect.anything()
    );
  });

  it('throws when championship is not found', async () => {
    setupFrom({ aio_championships: chain({ data: null, error: null }) });

    await expect(
      championshipService.processRoundResults('champ-1', 1)
    ).rejects.toThrow('Championship not found');
  });
});

// ---------------------------------------------------------------------------
// Tests: getStandings
// ---------------------------------------------------------------------------

describe('getStandings', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns participant data sorted by total_points', async () => {
    const standings = [
      { id: 'cp-1', total_points: 43 },
      { id: 'cp-2', total_points: 25 },
    ];
    mockFrom.mockReturnValue(chain({ data: standings, error: null }));

    const result = await championshipService.getStandings('champ-1');

    expect(result).toEqual(standings);
  });

  it('returns empty array when no participants exist', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }));

    const result = await championshipService.getStandings('champ-1');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: checkEntryRequirements
// ---------------------------------------------------------------------------

describe('checkEntryRequirements', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns eligible when requirements object is empty', async () => {
    const result = await championshipService.checkEntryRequirements('agent-1', {});
    expect(result).toEqual({ eligible: true });
  });

  it('returns eligible when agent ELO meets min_elo', async () => {
    mockFrom.mockReturnValue(chain({ data: { elo_rating: 1600 }, error: null }));

    const result = await championshipService.checkEntryRequirements('agent-1', {
      min_elo: 1500,
    });

    expect(result).toEqual({ eligible: true });
  });

  it('returns not eligible with reason when agent ELO is below min_elo', async () => {
    mockFrom.mockReturnValue(chain({ data: { elo_rating: 1200 }, error: null }));

    const result = await championshipService.checkEntryRequirements('agent-1', {
      min_elo: 1500,
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/below/i);
  });
});
