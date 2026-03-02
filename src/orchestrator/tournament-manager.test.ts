/**
 * Tests for tournament-manager.ts
 *
 * Covers: startTournament (validation, agent mapping, seeding, task resolution,
 * status updates, failure rollback), persistResults, getActiveTournament,
 * cancelTournament, cancelAll, activeCount.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — all vi.hoisted so factories can reference them
// ---------------------------------------------------------------------------

const {
  mockFrom,
  mockDecrypt,
  mockGetTask,
  MockController,
  mockCreateTournament,
  mockStartTournament,
  mockCancelCtrl,
  mockGetTournament,
  mockGetStandings,
} = vi.hoisted(() => {
  const mockCreateTournament = vi.fn();
  const mockStartTournament = vi.fn().mockResolvedValue(undefined);
  const mockCancelCtrl = vi.fn().mockResolvedValue(undefined);
  const mockGetTournament = vi.fn().mockReturnValue(null);
  const mockGetStandings = vi.fn().mockReturnValue([]);

  // Class mock so `new TournamentController()` works in Vitest 4.x ESM
  class MockController {
    createTournament = mockCreateTournament;
    startTournament = mockStartTournament;
    cancelTournament = mockCancelCtrl;
    getTournament = mockGetTournament;
    getStandings = mockGetStandings;
  }

  return {
    mockFrom: vi.fn(),
    mockDecrypt: vi.fn(),
    mockGetTask: vi.fn(),
    MockController,
    mockCreateTournament,
    mockStartTournament,
    mockCancelCtrl,
    mockGetTournament,
    mockGetStandings,
  };
});

vi.mock('./tournament-controller.js', () => ({ TournamentController: MockController }));
vi.mock('./task-registry.js', () => ({ getTask: mockGetTask }));
vi.mock('../shared/utils/crypto.js', () => ({ decrypt: mockDecrypt }));
vi.mock('../shared/utils/supabase.js', () => ({ serviceClient: { from: mockFrom } }));
vi.mock('../services/elo-service.js', () => ({ eloService: {} }));
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { tournamentManager } from './tournament-manager.js';

// ---------------------------------------------------------------------------
// Types + chain helper
// ---------------------------------------------------------------------------

type ChainFn = ReturnType<typeof vi.fn>;
type MockChain = {
  select: ChainFn; eq: ChainFn; update: ChainFn; insert: ChainFn; single: ChainFn;
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
};

function chain(result: unknown = { data: null, error: null }): MockChain {
  const q = {} as MockChain;
  for (const m of ['select', 'eq', 'update', 'insert'] as const) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const baseTournament = {
  id: 'tour-1',
  name: 'Test Tournament',
  bracket_type: 'single_elimination',
  task_ids: ['form-blitz'],
  domain_id: 'dom-1',
  best_of: 1,
  domain: { slug: 'browser-tasks' },
};

function makeAgent(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Agent ${id}`,
    provider: 'claude',
    model: 'claude-sonnet-4-5',
    color: '#6B7280',
    agent_type: 'api_key',
    api_key_encrypted: `enc-${id}`,
    elo_rating: 1200,
    webhook_url: null,
    webhook_secret: null,
    persona_name: null,
    persona_description: null,
    persona_style: null,
    strategy: null,
    ...overrides,
  };
}

function makeParticipant(id: string, agentId: string, agentOverrides: Record<string, unknown> = {}) {
  return { id, agent_id: agentId, agent: makeAgent(agentId, agentOverrides) };
}

const twoParticipants = [
  makeParticipant('tp-1', 'a1', { elo_rating: 1400 }),
  makeParticipant('tp-2', 'a2', { elo_rating: 1200 }),
];

/**
 * Set up mock DB calls for the happy-path startTournament (2 agents, empty rounds).
 * Call order:
 *  1  tournament read
 *  2  participants read
 *  3  tournament update → seeding
 *  4  participant a1 seed update
 *  5  participant a2 seed update
 *  6  tournament update → running
 *  7  tournament update → completed  (persistResults, empty rounds)
 */
function setupHappyPath(tournamentOverrides: Record<string, unknown> = {}) {
  const tour = { ...baseTournament, ...tournamentOverrides };
  mockFrom
    .mockReturnValueOnce(chain({ data: tour, error: null }))           // 1
    .mockReturnValueOnce(chain({ data: twoParticipants, error: null }))// 2
    .mockReturnValueOnce(chain({ data: null, error: null }))           // 3 seeding
    .mockReturnValueOnce(chain({ data: null, error: null }))           // 4 a1 seed
    .mockReturnValueOnce(chain({ data: null, error: null }))           // 5 a2 seed
    .mockReturnValueOnce(chain({ data: null, error: null }))           // 6 running
    .mockReturnValueOnce(chain({ data: null, error: null }));          // 7 completed
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();

  mockStartTournament.mockResolvedValue(undefined);
  mockCancelCtrl.mockResolvedValue(undefined);
  // Default: persistResults returns early (no DB calls)
  mockGetTournament.mockReturnValue(null);
  mockGetStandings.mockReturnValue([]);

  mockDecrypt.mockReturnValue('decrypted-key');
  mockGetTask.mockReturnValue({ id: 'form-blitz', name: 'Form Blitz' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tournamentManager as any).activeTournaments.clear();
});

// ---------------------------------------------------------------------------
// startTournament — validation
// ---------------------------------------------------------------------------

describe('startTournament — validation', () => {
  it('throws when tournament is not found', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'not found' } }));
    await expect(tournamentManager.startTournament('tour-x')).rejects.toThrow(
      'Tournament not found: tour-x'
    );
  });

  it('throws when participants fetch errors', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'DB error' } }));
    await expect(tournamentManager.startTournament('tour-1')).rejects.toThrow(
      'Not enough participants for tournament tour-1'
    );
  });

  it('throws when fewer than 2 participants', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: [twoParticipants[0]], error: null }));
    await expect(tournamentManager.startTournament('tour-1')).rejects.toThrow(
      'Not enough participants'
    );
  });

  it('throws when no valid agent configs after mapping (all agents null)', async () => {
    const noAgentParticipants = [
      { id: 'tp-1', agent_id: 'a1', agent: null },
      { id: 'tp-2', agent_id: 'a2', agent: null },
    ];
    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: noAgentParticipants, error: null }));
    await expect(tournamentManager.startTournament('tour-1')).rejects.toThrow(
      'Not enough valid agent configs after mapping'
    );
  });

  it('throws when decrypt fails for an api_key agent', async () => {
    mockDecrypt.mockImplementation(() => { throw new Error('bad key'); });
    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: twoParticipants, error: null }));
    await expect(tournamentManager.startTournament('tour-1')).rejects.toThrow(
      'Cannot decrypt API key for agent'
    );
  });

  it('throws when no valid tasks are resolved', async () => {
    mockGetTask.mockReturnValue(null); // task not in registry
    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: twoParticipants, error: null }));
    await expect(tournamentManager.startTournament('tour-1')).rejects.toThrow(
      'No valid tasks resolved for tournament'
    );
  });
});

// ---------------------------------------------------------------------------
// startTournament — agent mapping
// ---------------------------------------------------------------------------

describe('startTournament — agent mapping', () => {
  it('decrypts API keys for api_key agents', async () => {
    setupHappyPath();
    await tournamentManager.startTournament('tour-1');

    expect(mockDecrypt).toHaveBeenCalledWith('enc-a1');
    expect(mockDecrypt).toHaveBeenCalledWith('enc-a2');
    const { agents } = mockCreateTournament.mock.calls[0][0];
    expect(agents[0].apiKey).toBe('decrypted-key');
  });

  it('uses webhook URL for webhook agents (no decrypt)', async () => {
    const webhookParticipants = [
      makeParticipant('tp-1', 'a1', {
        agent_type: 'webhook',
        webhook_url: 'https://agent1.example.com/webhook',
        webhook_secret: 'sec1',
        api_key_encrypted: null,
        elo_rating: 1400,
      }),
      makeParticipant('tp-2', 'a2', { elo_rating: 1200 }),
    ];
    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: webhookParticipants, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }));

    await tournamentManager.startTournament('tour-1');

    const { agents } = mockCreateTournament.mock.calls[0][0];
    const webhookAgent = agents.find((a: { id: string }) => a.id === 'a1');
    expect(webhookAgent.webhookUrl).toBe('https://agent1.example.com/webhook');
    expect(mockDecrypt).not.toHaveBeenCalledWith(expect.stringContaining('a1'));
  });

  it('sorts agents by ELO descending (higher ELO = seed 1)', async () => {
    // a2 has higher ELO than a1
    const participants = [
      makeParticipant('tp-1', 'a1', { elo_rating: 1000 }),
      makeParticipant('tp-2', 'a2', { elo_rating: 1800 }),
    ];
    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: participants, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null })) // seeding
      .mockReturnValueOnce(chain({ data: null, error: null })) // a2 seed (first after sort)
      .mockReturnValueOnce(chain({ data: null, error: null })) // a1 seed (second)
      .mockReturnValueOnce(chain({ data: null, error: null })) // running
      .mockReturnValueOnce(chain({ data: null, error: null })); // completed

    await tournamentManager.startTournament('tour-1');

    const { agents } = mockCreateTournament.mock.calls[0][0];
    expect(agents[0].id).toBe('a2'); // highest ELO first
    expect(agents[1].id).toBe('a1');
  });
});

// ---------------------------------------------------------------------------
// startTournament — task resolution + controller
// ---------------------------------------------------------------------------

describe('startTournament — task resolution', () => {
  it('uses FALLBACK_TASKS when task_ids is empty', async () => {
    setupHappyPath({ task_ids: [] });
    await tournamentManager.startTournament('tour-1');

    expect(mockGetTask).toHaveBeenCalledWith('form-blitz');
    const { taskIds } = mockCreateTournament.mock.calls[0][0];
    expect(taskIds).toContain('form-blitz');
  });

  it('passes correct params to TournamentController', async () => {
    setupHappyPath();
    await tournamentManager.startTournament('tour-1');

    expect(mockCreateTournament).toHaveBeenCalledWith(
      expect.objectContaining({
        name: baseTournament.name,
        bracketType: baseTournament.bracket_type,
        bestOf: baseTournament.best_of,
        taskIds: baseTournament.task_ids,
        agents: expect.arrayContaining([
          expect.objectContaining({ id: 'a1' }),
          expect.objectContaining({ id: 'a2' }),
        ]),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// startTournament — failure rollback
// ---------------------------------------------------------------------------

describe('startTournament — failure rollback', () => {
  it('reverts tournament status to lobby and re-throws on controller failure', async () => {
    const controllerError = new Error('controller crashed');
    mockStartTournament.mockRejectedValueOnce(controllerError);

    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: twoParticipants, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null })) // seeding
      .mockReturnValueOnce(chain({ data: null, error: null })) // a1 seed
      .mockReturnValueOnce(chain({ data: null, error: null })) // a2 seed
      .mockReturnValueOnce(chain({ data: null, error: null })) // running
      .mockReturnValueOnce(chain({ data: null, error: null })); // revert → lobby

    await expect(tournamentManager.startTournament('tour-1')).rejects.toThrow('controller crashed');

    const revertChain = mockFrom.mock.results[6].value as MockChain;
    expect(revertChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'lobby', started_at: null })
    );
  });

  it('removes tournament from activeTournaments after completion', async () => {
    setupHappyPath();
    expect(tournamentManager.activeCount).toBe(0);

    await tournamentManager.startTournament('tour-1');

    expect(tournamentManager.activeCount).toBe(0);
  });

  it('removes tournament from activeTournaments after failure', async () => {
    mockStartTournament.mockRejectedValueOnce(new Error('boom'));
    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: twoParticipants, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }));

    await expect(tournamentManager.startTournament('tour-1')).rejects.toThrow();
    expect(tournamentManager.activeCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// persistResults (via startTournament with real tournament data)
// ---------------------------------------------------------------------------

describe('persistResults', () => {
  const mockTournamentData = {
    rounds: [
      {
        id: 'r-1',
        roundNumber: 1,
        name: 'Round 1',
        status: 'completed',
        matches: [
          {
            matchNumber: 1,
            agentIds: ['a1', 'a2'],
            results: [
              { agentId: 'a1', score: 100 },
              { agentId: 'a2', score: 80 },
            ],
            competitionId: 'comp-1',
            winnerId: 'a1',
            isBye: false,
            status: 'completed',
          },
        ],
      },
    ],
    bracket: null,
    currentRoundIndex: 0,
  };

  const mockStandings = [
    { agentId: 'a1', rank: 1, matchesWon: 1, matchesLost: 0, totalScore: 100 },
    { agentId: 'a2', rank: 2, matchesWon: 0, matchesLost: 1, totalScore: 80 },
  ];

  function setupWithResults() {
    mockGetTournament.mockReturnValue(mockTournamentData);
    mockGetStandings.mockReturnValue(mockStandings);

    // 1 tournament read, 1 participants read, seeding update, 2 seed updates,
    // running update, 1 match insert, 2 standing updates, completed update
    mockFrom
      .mockReturnValueOnce(chain({ data: baseTournament, error: null }))
      .mockReturnValueOnce(chain({ data: twoParticipants, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null })) // seeding
      .mockReturnValueOnce(chain({ data: null, error: null })) // a1 seed
      .mockReturnValueOnce(chain({ data: null, error: null })) // a2 seed
      .mockReturnValueOnce(chain({ data: null, error: null })) // running
      .mockReturnValueOnce(chain({ data: null, error: null })) // match insert
      .mockReturnValueOnce(chain({ data: null, error: null })) // a1 standing update
      .mockReturnValueOnce(chain({ data: null, error: null })) // a2 standing update
      .mockReturnValueOnce(chain({ data: null, error: null })); // completed
  }

  it('inserts match rows with correct data', async () => {
    setupWithResults();
    await tournamentManager.startTournament('tour-1');

    const matchInsertChain = mockFrom.mock.results[6].value as MockChain;
    expect(matchInsertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tournament_id: 'tour-1',
        round_number: 1,
        match_number: 1,
        agent_1_id: 'a1',
        agent_2_id: 'a2',
        winner_id: 'a1',
        agent_1_score: 100,
        agent_2_score: 80,
        is_bye: false,
        status: 'completed',
      })
    );
  });

  it('updates participant standings', async () => {
    setupWithResults();
    await tournamentManager.startTournament('tour-1');

    const a1UpdateChain = mockFrom.mock.results[7].value as MockChain;
    expect(a1UpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ final_placement: 1, matches_won: 1, total_score: 100 })
    );
    expect(a1UpdateChain.eq).toHaveBeenCalledWith('id', 'tp-1');

    const a2UpdateChain = mockFrom.mock.results[8].value as MockChain;
    expect(a2UpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ final_placement: 2, matches_won: 0, total_score: 80 })
    );
    expect(a2UpdateChain.eq).toHaveBeenCalledWith('id', 'tp-2');
  });

  it('marks tournament as completed', async () => {
    setupWithResults();
    await tournamentManager.startTournament('tour-1');

    const completedChain = mockFrom.mock.results[9].value as MockChain;
    expect(completedChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
  });
});

// ---------------------------------------------------------------------------
// getActiveTournament
// ---------------------------------------------------------------------------

describe('getActiveTournament', () => {
  it('returns the controller when the tournament is active', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeCtrl = {} as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tournamentManager as any).activeTournaments.set('tour-99', fakeCtrl);
    expect(tournamentManager.getActiveTournament('tour-99')).toBe(fakeCtrl);
  });

  it('returns null when tournament is not active', () => {
    expect(tournamentManager.getActiveTournament('tour-none')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cancelTournament
// ---------------------------------------------------------------------------

describe('cancelTournament', () => {
  it('returns false when tournament is not active', async () => {
    const result = await tournamentManager.cancelTournament('tour-x');
    expect(result).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('cancels the controller and updates DB status to cancelled', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeCtrl = { cancelTournament: mockCancelCtrl } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tournamentManager as any).activeTournaments.set('tour-1', fakeCtrl);
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));

    const result = await tournamentManager.cancelTournament('tour-1');

    expect(result).toBe(true);
    expect(mockCancelCtrl).toHaveBeenCalled();
    expect(tournamentManager.getActiveTournament('tour-1')).toBeNull();
    const updateChain = mockFrom.mock.results[0].value as MockChain;
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    );
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'tour-1');
  });
});

// ---------------------------------------------------------------------------
// cancelAll
// ---------------------------------------------------------------------------

describe('cancelAll', () => {
  it('cancels all active tournaments', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl1 = { cancelTournament: vi.fn().mockResolvedValue(undefined) } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl2 = { cancelTournament: vi.fn().mockResolvedValue(undefined) } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tournamentManager as any).activeTournaments.set('tour-A', ctrl1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tournamentManager as any).activeTournaments.set('tour-B', ctrl2);
    mockFrom
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }));

    await tournamentManager.cancelAll();

    expect(ctrl1.cancelTournament).toHaveBeenCalled();
    expect(ctrl2.cancelTournament).toHaveBeenCalled();
    expect(tournamentManager.activeCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// activeCount
// ---------------------------------------------------------------------------

describe('activeCount', () => {
  it('reflects the number of active tournaments', () => {
    expect(tournamentManager.activeCount).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tournamentManager as any).activeTournaments.set('t1', {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tournamentManager as any).activeTournaments.set('t2', {});
    expect(tournamentManager.activeCount).toBe(2);
  });
});
