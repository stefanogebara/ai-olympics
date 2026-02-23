/**
 * Tests for competition-manager.ts
 *
 * Covers: startCompetition (DB fetch, agent mapping, task resolution,
 * controller lifecycle, result persistence, error rollback),
 * getActiveCompetition, cancelCompetition, cancelAll, activeCount.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (vi.hoisted so they can be referenced in vi.mock factories)
// ---------------------------------------------------------------------------

const {
  mockFrom,
  mockGetTask,
  mockDecrypt,
  mockUpdateRatings,
  mockCreateCompetition,
  mockStartCompetition,
  mockCancelController,
  mockCleanup,
  mockGetLeaderboard,
  mockGetCompetition,
  MockController,
} = vi.hoisted(() => {
  const ctrl = {
    createCompetition: vi.fn(),
    startCompetition: vi.fn().mockResolvedValue(undefined),
    cancelCompetition: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    getLeaderboard: vi.fn().mockReturnValue([]),
    getCompetition: vi.fn().mockReturnValue(null),
  };
  const MockController = vi.fn().mockReturnValue(ctrl);
  return {
    mockFrom: vi.fn(),
    mockGetTask: vi.fn(),
    mockDecrypt: vi.fn().mockReturnValue('decrypted-key'),
    mockUpdateRatings: vi.fn().mockResolvedValue(undefined),
    mockCreateCompetition: ctrl.createCompetition,
    mockStartCompetition: ctrl.startCompetition,
    mockCancelController: ctrl.cancelCompetition,
    mockCleanup: ctrl.cleanup,
    mockGetLeaderboard: ctrl.getLeaderboard,
    mockGetCompetition: ctrl.getCompetition,
    MockController,
  };
});

vi.mock('./competition-controller.js', () => ({
  CompetitionController: MockController,
}));
vi.mock('./task-registry.js', () => ({ getTask: mockGetTask }));
vi.mock('../shared/utils/crypto.js', () => ({ decrypt: mockDecrypt }));
vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));
vi.mock('../services/elo-service.js', () => ({
  eloService: { updateRatingsAfterCompetition: mockUpdateRatings },
}));

import { competitionManager } from './competition-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ChainFn = ReturnType<typeof vi.fn>;
type MockChain = {
  select: ChainFn; eq: ChainFn; update: ChainFn; insert: ChainFn;
  upsert: ChainFn; single: ChainFn; order: ChainFn; limit: ChainFn; range: ChainFn;
  then: (resolve: (v: unknown) => unknown, reject?: (v: unknown) => unknown) => Promise<unknown>;
};

function chain(result: unknown): MockChain {
  const obj = {} as MockChain;
  const methods = [
    'select', 'eq', 'update', 'insert', 'upsert', 'single',
    'order', 'limit', 'range',
  ] as const;
  for (const m of methods) {
    (obj as Record<string, unknown>)[m] = vi.fn().mockReturnValue(obj);
  }
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (v: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

const makeAgent = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Agent ${id}`,
  provider: 'claude',
  model: 'claude-sonnet-4-5-20250929',
  color: '#00FF00',
  agent_type: 'api_key',
  api_key_encrypted: 'enc-key',
  webhook_url: null,
  webhook_secret: null,
  persona_name: null,
  persona_description: null,
  persona_style: null,
  strategy: null,
  ...overrides,
});

const makeParticipant = (
  id: string,
  agentId: string,
  agentOverrides: Record<string, unknown> = {},
) => ({
  id,
  agent_id: agentId,
  competition_id: 'comp-1',
  agent: makeAgent(agentId, agentOverrides),
});

const makeCompetition = (overrides: Record<string, unknown> = {}) => ({
  id: 'comp-1',
  name: 'Test Competition',
  description: 'A test competition',
  domain: { slug: 'browser-tasks' },
  domain_id: 'domain-1',
  task_ids: ['form-blitz'],
  ...overrides,
});

const makeTask = (id = 'form-blitz') => ({
  id,
  name: 'Form Blitz',
  category: 'speed',
  difficulty: 'easy',
  timeLimit: 60,
  maxAgents: 4,
  config: {},
  scoringMethod: 'time',
  maxScore: 1000,
  startUrl: 'http://localhost:3002/tasks/form-blitz',
  systemPrompt: 'You are an AI agent.',
  taskPrompt: 'Fill out the form.',
});

/** Standard two-participant setup with all subsequent update chains */
function setupHappyPath(
  comp = makeCompetition(),
  participants = [
    makeParticipant('p1', 'agent-1'),
    makeParticipant('p2', 'agent-2'),
  ],
  extraChains: ReturnType<typeof chain>[] = [],
) {
  mockFrom
    .mockReturnValueOnce(chain({ data: comp, error: null }))        // read competition
    .mockReturnValueOnce(chain({ data: participants, error: null })) // read participants
    .mockReturnValueOnce(chain({ error: null }))                     // update p1 rank
    .mockReturnValueOnce(chain({ error: null }))                     // update p2 rank
    .mockReturnValueOnce(chain({ error: null }));                    // update comp status

  for (const c of extraChains) {
    mockFrom.mockReturnValueOnce(c);
  }
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // resetAllMocks clears once-queues AND default implementations, preventing
  // stale mockReturnValueOnce chains from leaking between tests.
  vi.resetAllMocks();

  // Re-setup MockController to return the shared mock ctrl object
  MockController.mockReturnValue({
    createCompetition: mockCreateCompetition,
    startCompetition: mockStartCompetition,
    cancelCompetition: mockCancelController,
    cleanup: mockCleanup,
    getLeaderboard: mockGetLeaderboard,
    getCompetition: mockGetCompetition,
  });

  // Default implementations
  mockStartCompetition.mockResolvedValue(undefined);
  mockCancelController.mockResolvedValue(undefined);
  mockCleanup.mockResolvedValue(undefined);
  mockGetLeaderboard.mockReturnValue([]);
  mockGetCompetition.mockReturnValue(null);
  mockDecrypt.mockReturnValue('decrypted-key');
  mockUpdateRatings.mockResolvedValue(undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (competitionManager as any).activeCompetitions.clear();
});

// ---------------------------------------------------------------------------
// startCompetition — validation & DB errors
// ---------------------------------------------------------------------------

describe('CompetitionManager.startCompetition — validation', () => {
  it('throws when competition DB query returns an error', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: null, error: { message: 'DB error' } })
    );

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Competition not found: comp-1');
  });

  it('throws when competition is not found (data is null)', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Competition not found: comp-1');
  });

  it('throws when participants query returns an error', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'DB error' } }));

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Not enough participants');
  });

  it('throws when fewer than 2 participants are returned', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(
        chain({ data: [makeParticipant('p1', 'a1')], error: null })
      );

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Not enough participants');
  });

  it('throws when participants have no agent record (< 2 valid configs)', async () => {
    const noAgent = { id: 'p1', agent_id: 'a1', competition_id: 'comp-1', agent: null };
    const noAgent2 = { id: 'p2', agent_id: 'a2', competition_id: 'comp-1', agent: null };

    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(chain({ data: [noAgent, noAgent2], error: null }));

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Not enough valid agent configs');
  });

  it('throws when decrypt fails for an api_key agent', async () => {
    mockDecrypt.mockImplementation(() => { throw new Error('bad key'); });

    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(
        chain({ data: [makeParticipant('p1', 'a1'), makeParticipant('p2', 'a2')], error: null })
      );

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Cannot decrypt API key');
  });

  it('throws when no valid tasks are resolved', async () => {
    mockGetTask.mockReturnValue(null); // task not in registry

    setupHappyPath();

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('No valid tasks resolved');
  });
});

// ---------------------------------------------------------------------------
// startCompetition — agent mapping
// ---------------------------------------------------------------------------

describe('CompetitionManager.startCompetition — agent mapping', () => {
  it('decrypts api_key_encrypted and sets apiKey on the agent config', async () => {
    mockDecrypt.mockReturnValue('my-decrypted-api-key');
    mockGetTask.mockReturnValue(makeTask());
    setupHappyPath();

    await competitionManager.startCompetition('comp-1');

    expect(mockCreateCompetition).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({ apiKey: 'my-decrypted-api-key' }),
        ]),
      })
    );
  });

  it('sets webhookUrl and webhookSecret for webhook agents', async () => {
    mockGetTask.mockReturnValue(makeTask());
    setupHappyPath(makeCompetition(), [
      makeParticipant('p1', 'a1', {
        agent_type: 'webhook',
        api_key_encrypted: null,
        webhook_url: 'https://my-agent.example.com/hook',
        webhook_secret: 'wh-secret',
      }),
      makeParticipant('p2', 'a2'),
    ]);

    await competitionManager.startCompetition('comp-1');

    expect(mockCreateCompetition).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({
            webhookUrl: 'https://my-agent.example.com/hook',
            webhookSecret: 'wh-secret',
          }),
        ]),
      })
    );
    // decrypt not called for webhook agent
    expect(mockDecrypt).not.toHaveBeenCalledWith(null);
  });

  it('maps provider, model, color and persona fields', async () => {
    mockGetTask.mockReturnValue(makeTask());
    setupHappyPath(makeCompetition(), [
      makeParticipant('p1', 'a1', {
        provider: 'openai',
        model: 'gpt-4o',
        color: '#ABCDEF',
        persona_name: 'Atlas',
        persona_description: 'Bold explorer',
        persona_style: 'aggressive',
        strategy: 'analytical',
      }),
      makeParticipant('p2', 'a2'),
    ]);

    await competitionManager.startCompetition('comp-1');

    expect(mockCreateCompetition).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({
            provider: 'openai',
            model: 'gpt-4o',
            color: '#ABCDEF',
            personaName: 'Atlas',
            personaDescription: 'Bold explorer',
            personaStyle: 'aggressive',
            strategy: 'analytical',
          }),
        ]),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// startCompetition — task resolution
// ---------------------------------------------------------------------------

describe('CompetitionManager.startCompetition — task resolution', () => {
  beforeEach(() => {
    mockGetTask.mockReturnValue(makeTask());
  });

  it('uses opts.taskIds when provided, ignoring competition.task_ids', async () => {
    const comp = makeCompetition({ task_ids: ['original-task'] });
    mockFrom
      .mockReturnValueOnce(chain({ data: comp, error: null }))
      .mockReturnValueOnce(
        chain({
          data: [makeParticipant('p1', 'a1'), makeParticipant('p2', 'a2')],
          error: null,
        })
      )
      .mockReturnValueOnce(chain({ error: null }))
      .mockReturnValueOnce(chain({ error: null }))
      .mockReturnValueOnce(chain({ error: null }));

    await competitionManager.startCompetition('comp-1', {
      taskIds: ['override-task'],
    });

    expect(mockGetTask).toHaveBeenCalledWith('override-task');
    expect(mockGetTask).not.toHaveBeenCalledWith('original-task');
  });

  it('uses competition.task_ids when no opts are given', async () => {
    setupHappyPath(makeCompetition({ task_ids: ['db-task'] }));

    await competitionManager.startCompetition('comp-1');

    expect(mockGetTask).toHaveBeenCalledWith('db-task');
  });

  it('falls back to domain defaults when task_ids is null', async () => {
    setupHappyPath(
      makeCompetition({ task_ids: null, domain: { slug: 'games' } })
    );

    await competitionManager.startCompetition('comp-1');

    // 'games' domain defaults: ['trivia', 'math', 'word', 'logic', 'chess']
    expect(mockGetTask).toHaveBeenCalledWith('trivia');
    expect(mockGetTask).toHaveBeenCalledWith('math');
  });

  it('falls back to FALLBACK_TASKS when domain has no defaults', async () => {
    setupHappyPath(
      makeCompetition({ task_ids: null, domain: { slug: 'unknown-domain' } })
    );

    await competitionManager.startCompetition('comp-1');

    expect(mockGetTask).toHaveBeenCalledWith('form-blitz');
  });

  it('skips task IDs that are not in the registry', async () => {
    // First call returns null (not found), subsequent return a valid task
    mockGetTask
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(makeTask('valid-task'));

    setupHappyPath(makeCompetition({ task_ids: ['missing', 'valid-task'] }));

    await competitionManager.startCompetition('comp-1');

    expect(mockCreateCompetition).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: [expect.objectContaining({ id: 'valid-task' })],
      })
    );
  });
});

// ---------------------------------------------------------------------------
// startCompetition — happy path lifecycle
// ---------------------------------------------------------------------------

describe('CompetitionManager.startCompetition — lifecycle', () => {
  it('creates controller with headless:true and passes name/description/agents/tasks', async () => {
    mockGetTask.mockReturnValue(makeTask());
    const comp = makeCompetition({ name: 'Grand Prix', description: 'Exciting!' });
    setupHappyPath(comp);

    await competitionManager.startCompetition('comp-1');

    expect(MockController).toHaveBeenCalledWith({ headless: true });
    expect(mockCreateCompetition).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Grand Prix',
        description: 'Exciting!',
        agents: expect.any(Array),
        tasks: expect.any(Array),
      })
    );
  });

  it('calls controller.startCompetition()', async () => {
    mockGetTask.mockReturnValue(makeTask());
    setupHappyPath();

    await competitionManager.startCompetition('comp-1');

    expect(mockStartCompetition).toHaveBeenCalled();
  });

  it('calls controller.cleanup() in finally block on success', async () => {
    mockGetTask.mockReturnValue(makeTask());
    setupHappyPath();

    await competitionManager.startCompetition('comp-1');

    expect(mockCleanup).toHaveBeenCalled();
  });

  it('calls controller.cleanup() in finally block on failure', async () => {
    mockGetTask.mockReturnValue(makeTask());
    mockStartCompetition.mockRejectedValueOnce(new Error('Boom'));
    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(
        chain({ data: [makeParticipant('p1', 'a1'), makeParticipant('p2', 'a2')], error: null })
      )
      .mockReturnValueOnce(chain({ error: null })); // lobby revert

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Boom');

    expect(mockCleanup).toHaveBeenCalled();
  });

  it('removes competition from activeCompetitions after completion', async () => {
    mockGetTask.mockReturnValue(makeTask());
    setupHappyPath();

    await competitionManager.startCompetition('comp-1');

    expect(competitionManager.getActiveCompetition('comp-1')).toBeNull();
  });

  it('removes competition from activeCompetitions after failure', async () => {
    mockGetTask.mockReturnValue(makeTask());
    mockStartCompetition.mockRejectedValueOnce(new Error('Crash'));
    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(
        chain({ data: [makeParticipant('p1', 'a1'), makeParticipant('p2', 'a2')], error: null })
      )
      .mockReturnValueOnce(chain({ error: null }));

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Crash');

    expect(competitionManager.getActiveCompetition('comp-1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// startCompetition — result persistence
// ---------------------------------------------------------------------------

describe('CompetitionManager.startCompetition — result persistence', () => {
  it('updates each participant final_rank and final_score', async () => {
    mockGetTask.mockReturnValue(makeTask());
    const participants = [
      makeParticipant('p1', 'agent-1'),
      makeParticipant('p2', 'agent-2'),
    ];
    mockGetLeaderboard.mockReturnValue([
      { agentId: 'agent-1', rank: 1, totalScore: 100 },
      { agentId: 'agent-2', rank: 2, totalScore: 50 },
    ]);

    const p1UpdateChain = chain({ error: null });
    const p2UpdateChain = chain({ error: null });
    const compUpdateChain = chain({ error: null });

    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(chain({ data: participants, error: null }))
      .mockReturnValueOnce(p1UpdateChain)
      .mockReturnValueOnce(p2UpdateChain)
      .mockReturnValueOnce(compUpdateChain);

    await competitionManager.startCompetition('comp-1');

    expect(p1UpdateChain.update).toHaveBeenCalledWith({
      final_rank: 1, final_score: 100,
    });
    expect(p2UpdateChain.update).toHaveBeenCalledWith({
      final_rank: 2, final_score: 50,
    });
  });

  it('marks competition as completed with ended_at', async () => {
    mockGetTask.mockReturnValue(makeTask());
    // Leaderboard entries are required for participant updates to run
    mockGetLeaderboard.mockReturnValue([
      { agentId: 'a1', rank: 1, totalScore: 100 },
      { agentId: 'a2', rank: 2, totalScore: 50 },
    ]);
    const compUpdateChain = chain({ error: null });

    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(
        chain({ data: [makeParticipant('p1', 'a1'), makeParticipant('p2', 'a2')], error: null })
      )
      .mockReturnValueOnce(chain({ error: null })) // p1 update
      .mockReturnValueOnce(chain({ error: null })) // p2 update
      .mockReturnValueOnce(compUpdateChain);       // competition status

    await competitionManager.startCompetition('comp-1');

    expect(compUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', ended_at: expect.any(String) })
    );
  });

  it('inserts replay rows when competition has events', async () => {
    mockGetTask.mockReturnValue(makeTask());
    // Leaderboard must match participant agent_ids ('a1', 'a2')
    mockGetLeaderboard.mockReturnValue([
      { agentId: 'a1', rank: 1, totalScore: 100 },
      { agentId: 'a2', rank: 2, totalScore: 50 },
    ]);
    // Event results must also use the same agent IDs
    mockGetCompetition.mockReturnValue({
      events: [
        {
          results: [
            { taskId: 'task-1', agentId: 'a1', actions: [{ type: 'click' }] },
            { taskId: 'task-1', agentId: 'a2', actions: [] },
          ],
        },
      ],
    });

    const replayChain = chain({ error: null });

    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(
        chain({ data: [makeParticipant('p1', 'a1'), makeParticipant('p2', 'a2')], error: null })
      )
      .mockReturnValueOnce(chain({ error: null })) // p1 update
      .mockReturnValueOnce(chain({ error: null })) // p2 update
      .mockReturnValueOnce(chain({ error: null })) // comp status
      .mockReturnValueOnce(replayChain);            // replay insert

    await competitionManager.startCompetition('comp-1');

    expect(replayChain.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          competition_id: 'comp-1',
          event_id: 'task-1',
          agent_id: 'a1',
          action_log: [{ type: 'click' }],
        }),
      ])
    );
  });

  it('calls eloService.updateRatingsAfterCompetition with correct args', async () => {
    mockGetTask.mockReturnValue(makeTask());
    const participants = [
      makeParticipant('p1', 'agent-1'),
      makeParticipant('p2', 'agent-2'),
    ];
    const leaderboard = [
      { agentId: 'agent-1', rank: 1, totalScore: 100 },
      { agentId: 'agent-2', rank: 2, totalScore: 50 },
    ];
    mockGetLeaderboard.mockReturnValue(leaderboard);
    setupHappyPath(makeCompetition(), participants);

    await competitionManager.startCompetition('comp-1');

    expect(mockUpdateRatings).toHaveBeenCalledWith(
      'comp-1',
      participants,
      leaderboard,
      'domain-1',
    );
  });
});

// ---------------------------------------------------------------------------
// startCompetition — error rollback
// ---------------------------------------------------------------------------

describe('CompetitionManager.startCompetition — error rollback', () => {
  it('reverts competition status to lobby when controller throws', async () => {
    mockGetTask.mockReturnValue(makeTask());
    mockStartCompetition.mockRejectedValueOnce(new Error('Agent crash'));

    const lobbyChain = chain({ error: null });
    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(
        chain({ data: [makeParticipant('p1', 'a1'), makeParticipant('p2', 'a2')], error: null })
      )
      .mockReturnValueOnce(lobbyChain);

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Agent crash');

    expect(lobbyChain.update).toHaveBeenCalledWith({
      status: 'lobby',
      started_at: null,
    });
  });

  it('rethrows the original error after rollback', async () => {
    mockGetTask.mockReturnValue(makeTask());
    mockStartCompetition.mockRejectedValueOnce(new Error('Specific failure'));

    mockFrom
      .mockReturnValueOnce(chain({ data: makeCompetition(), error: null }))
      .mockReturnValueOnce(
        chain({ data: [makeParticipant('p1', 'a1'), makeParticipant('p2', 'a2')], error: null })
      )
      .mockReturnValueOnce(chain({ error: null }));

    await expect(
      competitionManager.startCompetition('comp-1')
    ).rejects.toThrow('Specific failure');
  });
});

// ---------------------------------------------------------------------------
// getActiveCompetition
// ---------------------------------------------------------------------------

describe('CompetitionManager.getActiveCompetition', () => {
  it('returns null when competition is not active', () => {
    expect(competitionManager.getActiveCompetition('nonexistent')).toBeNull();
  });

  it('returns the controller when competition is active', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (competitionManager as any).activeCompetitions as Map<string, unknown>;
    const fakeController = { createCompetition: vi.fn() };
    map.set('comp-99', fakeController);

    expect(competitionManager.getActiveCompetition('comp-99')).toBe(fakeController);
  });
});

// ---------------------------------------------------------------------------
// cancelCompetition
// ---------------------------------------------------------------------------

describe('CompetitionManager.cancelCompetition', () => {
  it('returns false when competition is not active', async () => {
    const result = await competitionManager.cancelCompetition('ghost-id');
    expect(result).toBe(false);
  });

  it('cancels the controller and updates DB status to cancelled', async () => {
    const cancelledChain = chain({ error: null });
    mockFrom.mockReturnValueOnce(cancelledChain);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (competitionManager as any).activeCompetitions as Map<string, unknown>;
    map.set('comp-2', { cancelCompetition: mockCancelController });

    const result = await competitionManager.cancelCompetition('comp-2');

    expect(result).toBe(true);
    expect(mockCancelController).toHaveBeenCalled();
    expect(cancelledChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', ended_at: expect.any(String) })
    );
  });

  it('removes competition from activeCompetitions after cancel', async () => {
    mockFrom.mockReturnValueOnce(chain({ error: null }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (competitionManager as any).activeCompetitions as Map<string, unknown>;
    map.set('comp-3', { cancelCompetition: mockCancelController });

    await competitionManager.cancelCompetition('comp-3');

    expect(competitionManager.getActiveCompetition('comp-3')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cancelAll
// ---------------------------------------------------------------------------

describe('CompetitionManager.cancelAll', () => {
  it('cancels all active competitions', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ error: null }))
      .mockReturnValueOnce(chain({ error: null }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (competitionManager as any).activeCompetitions as Map<string, unknown>;
    const ctrl = { cancelCompetition: vi.fn().mockResolvedValue(undefined) };
    map.set('c1', ctrl);
    map.set('c2', ctrl);

    await competitionManager.cancelAll();

    expect(competitionManager.activeCount).toBe(0);
  });

  it('does nothing when there are no active competitions', async () => {
    await expect(competitionManager.cancelAll()).resolves.toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// activeCount
// ---------------------------------------------------------------------------

describe('CompetitionManager.activeCount', () => {
  it('returns 0 when nothing is running', () => {
    expect(competitionManager.activeCount).toBe(0);
  });

  it('returns the number of active competitions', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (competitionManager as any).activeCompetitions as Map<string, unknown>;
    map.set('c1', {});
    map.set('c2', {});
    expect(competitionManager.activeCount).toBe(2);
  });
});
