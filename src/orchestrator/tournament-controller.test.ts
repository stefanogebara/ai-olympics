/**
 * Tests for tournament-controller.ts
 *
 * Covers: createTournament, startTournament, cancelTournament,
 * getTournament, getBracket, getStandings, runMatch (via startTournament),
 * calculateEliminationStandings (via startTournament), createTournament factory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  TournamentRound,
  TournamentMatch,
  TournamentStanding,
} from '../shared/types/index.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  MockCompetitionController,
  mockCreateCompetition,
  mockStartCompetition,
  mockGetLeaderboard,
  mockGetCompetition,
  mockCtrlCleanup,
  mockGetTaskById,
  mockNanoid,
  mockEventBusEmit,
  mockCreateStreamEvent,
  mockGenerateSingleElimination,
  mockGenerateRoundRobin,
  mockGenerateSwiss,
  mockCalculateRoundRobinStandings,
  mockCalculateSwissFinalStandings,
} = vi.hoisted(() => {
  const mockCreateCompetition = vi.fn();
  const mockStartCompetition = vi.fn().mockResolvedValue(undefined);
  const mockGetLeaderboard = vi.fn();
  const mockGetCompetition = vi.fn().mockReturnValue({ id: 'comp-1' });
  const mockCtrlCleanup = vi.fn().mockResolvedValue(undefined);
  // Class mock so `new CompetitionController()` works in Vitest 4.x ESM
  class MockCompetitionController {
    createCompetition = mockCreateCompetition;
    startCompetition = mockStartCompetition;
    getLeaderboard = mockGetLeaderboard;
    getCompetition = mockGetCompetition;
    cleanup = mockCtrlCleanup;
  }

  const mockGetTaskById = vi.fn();
  const mockNanoid = vi.fn().mockReturnValue('abc1234567');
  const mockEventBusEmit = vi.fn();
  const mockCreateStreamEvent = vi.fn().mockReturnValue({ type: 'mock', data: {} });
  const mockGenerateSingleElimination = vi.fn();
  const mockGenerateRoundRobin = vi.fn();
  const mockGenerateSwiss = vi.fn();
  const mockCalculateRoundRobinStandings = vi.fn();
  const mockCalculateSwissFinalStandings = vi.fn();

  return {
    MockCompetitionController,
    mockCreateCompetition, mockStartCompetition, mockGetLeaderboard,
    mockGetCompetition, mockCtrlCleanup,
    mockGetTaskById, mockNanoid, mockEventBusEmit, mockCreateStreamEvent,
    mockGenerateSingleElimination, mockGenerateRoundRobin, mockGenerateSwiss,
    mockCalculateRoundRobinStandings, mockCalculateSwissFinalStandings,
  };
});

vi.mock('./competition-controller.js', () => ({
  CompetitionController: MockCompetitionController,
}));
vi.mock('./task-registry.js', () => ({ getTaskById: mockGetTaskById }));
vi.mock('../shared/utils/events.js', () => ({
  eventBus: { emit: mockEventBusEmit },
  createStreamEvent: mockCreateStreamEvent,
}));
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('nanoid', () => ({ nanoid: mockNanoid }));
vi.mock('./tournament-bracket.js', () => ({
  generateSingleEliminationBracket: mockGenerateSingleElimination,
  generateRoundRobinSchedule: mockGenerateRoundRobin,
  generateSwissPairings: mockGenerateSwiss,
  calculateRoundRobinStandings: mockCalculateRoundRobinStandings,
  calculateSwissFinalStandings: mockCalculateSwissFinalStandings,
}));

import { TournamentController, createTournament } from './tournament-controller.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const agent1 = { id: 'agent-1', name: 'Agent One', provider: 'claude' as const, model: 'claude-sonnet-4-5', color: '#f00' };
const agent2 = { id: 'agent-2', name: 'Agent Two', provider: 'openai' as const, model: 'gpt-4', color: '#0f0' };

const taskDef = {
  id: 'task-1', name: 'Task One', description: 'desc',
  scoringMethod: 'time' as const, timeLimit: 60, maxScore: 1000,
  category: 'speed' as const, difficulty: 'easy' as const,
  maxAgents: 4, config: {},
  startUrl: 'http://localhost/task',
  systemPrompt: 'sys', taskPrompt: 'task',
};

function makeMatch(id: string, agentIds: string[], roundId = 'r1'): TournamentMatch {
  return {
    id, roundId, matchNumber: 1, agentIds,
    isBye: false, status: 'pending', results: [],
  };
}

function makeRound(id: string, num: number, matches: TournamentMatch[]): TournamentRound {
  return {
    id, roundNumber: num, name: `Round ${num}`,
    matches, status: 'pending',
    advancingAgentIds: [], eliminatedAgentIds: [],
  };
}

// Build fresh bracket objects per-test (matches are mutated during runs)
function makeSingleElimResult() {
  return {
    rounds: [makeRound('r1', 1, [makeMatch('m1', ['agent-1', 'agent-2'])])],
    bracket: [{
      id: 'bn-1', roundNumber: 1, position: 0, matchId: 'm1',
      agentIds: ['agent-1', 'agent-2'], parentNodes: [],
    }],
  };
}

// Default leaderboard: agent-1 wins
const defaultLeaderboard = [
  { agentId: 'agent-1', totalScore: 100, eventsWon: 1, eventsCompleted: 1 },
  { agentId: 'agent-2', totalScore: 50, eventsWon: 0, eventsCompleted: 1 },
];

const defaultStandings: TournamentStanding[] = [
  { agentId: 'agent-1', agentName: 'Agent One', rank: 1, matchesWon: 1, matchesLost: 0, matchesTied: 0, totalScore: 100 },
  { agentId: 'agent-2', agentName: 'Agent Two', rank: 2, matchesWon: 0, matchesLost: 1, matchesTied: 0, totalScore: 50 },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();

  // Re-apply method defaults after resetAllMocks
  mockStartCompetition.mockResolvedValue(undefined);
  mockGetLeaderboard.mockReturnValue(defaultLeaderboard);
  mockGetCompetition.mockReturnValue({ id: 'comp-1' });
  mockCtrlCleanup.mockResolvedValue(undefined);
  mockCreateStreamEvent.mockReturnValue({ type: 'mock', data: {} });
  mockNanoid.mockReturnValue('abc1234567');

  // Task resolution
  mockGetTaskById.mockReturnValue(taskDef);

  // Bracket generators — recreated fresh each test to avoid mutation leaks
  mockGenerateSingleElimination.mockReturnValue(makeSingleElimResult());
  mockGenerateRoundRobin.mockReturnValue([
    makeRound('r1', 1, [makeMatch('m1', ['agent-1', 'agent-2'])]),
  ]);
  mockGenerateSwiss.mockReturnValue(
    makeRound('r1', 1, [makeMatch('m1', ['agent-1', 'agent-2'])])
  );
  mockCalculateRoundRobinStandings.mockReturnValue(defaultStandings);
  mockCalculateSwissFinalStandings.mockReturnValue(defaultStandings);
});

// ---------------------------------------------------------------------------
// createTournament
// ---------------------------------------------------------------------------

describe('createTournament', () => {
  it('returns tournament with id prefixed "tournament-"', () => {
    const ctrl = new TournamentController();
    const t = ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(t.id).toBe('tournament-abc1234567');
  });

  it('throws when all taskIds resolve to undefined', () => {
    mockGetTaskById.mockReturnValue(undefined);
    const ctrl = new TournamentController();
    expect(() =>
      ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['bad-id'] })
    ).toThrow('No valid tasks provided for tournament');
  });

  it('sets status to "pending" and seeds agents in order', () => {
    const ctrl = new TournamentController();
    const t = ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(t.status).toBe('pending');
    expect(t.seeds[0]).toEqual({ agentId: 'agent-1', seedNumber: 1 });
    expect(t.seeds[1]).toEqual({ agentId: 'agent-2', seedNumber: 2 });
  });

  it('calls generateSingleEliminationBracket for single-elimination', () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(mockGenerateSingleElimination).toHaveBeenCalledOnce();
  });

  it('calls generateRoundRobinSchedule for round-robin', () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'round-robin', agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(mockGenerateRoundRobin).toHaveBeenCalledWith([agent1, agent2]);
  });

  it('calls generateSwissPairings for swiss with round 1', () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'swiss', agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(mockGenerateSwiss).toHaveBeenCalledWith([agent1, agent2], [], 1);
  });

  it('stores tournament so getTournament returns it', () => {
    const ctrl = new TournamentController();
    const t = ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(ctrl.getTournament()).toBe(t);
  });
});

// ---------------------------------------------------------------------------
// startTournament
// ---------------------------------------------------------------------------

describe('startTournament', () => {
  it('throws when no tournament has been created', async () => {
    const ctrl = new TournamentController();
    await expect(ctrl.startTournament()).rejects.toThrow('No tournament created');
  });

  it('sets status to "running" then "completed"', async () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();
    expect(ctrl.getTournament()?.status).toBe('completed');
  });

  it('emits tournament:start and tournament:end events', async () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    const emittedTypes = mockCreateStreamEvent.mock.calls.map(([type]) => type);
    expect(emittedTypes).toContain('tournament:start');
    expect(emittedTypes).toContain('tournament:end');
  });

  it('marks match as completed with winnerId and loserId set', async () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    const match = ctrl.getTournament()!.rounds[0].matches[0];
    expect(match.status).toBe('completed');
    expect(match.winnerId).toBe('agent-1');
    expect(match.loserId).toBe('agent-2');
  });

  it('calls calculateRoundRobinStandings for round-robin', async () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'round-robin', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    expect(mockCalculateRoundRobinStandings).toHaveBeenCalledOnce();
    expect(ctrl.getStandings()).toEqual(defaultStandings);
  });

  it('calls calculateSwissFinalStandings for swiss', async () => {
    // Swiss with 2 agents = 2 rounds (log2(2)+1=2)
    // Round 1 set in createTournament; round 2 generated inside runSwiss
    mockGenerateSwiss
      .mockReturnValueOnce(makeRound('r1', 1, [makeMatch('m1', ['agent-1', 'agent-2'])]))
      .mockReturnValueOnce(makeRound('r2', 2, [makeMatch('m2', ['agent-1', 'agent-2'], 'r2')]));

    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'swiss', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    expect(mockCalculateSwissFinalStandings).toHaveBeenCalledOnce();
    expect(ctrl.getStandings()).toEqual(defaultStandings);
  });

  it('calls CompetitionController.createCompetition with the two match agents', async () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    expect(mockCreateCompetition).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({ id: 'agent-1' }),
          expect.objectContaining({ id: 'agent-2' }),
        ]),
      })
    );
  });

  it('sets match.competitionId from getCompetition', async () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    const match = ctrl.getTournament()!.rounds[0].matches[0];
    expect(match.competitionId).toBe('comp-1');
  });

  it('skips bye matches', async () => {
    const roundWithBye = makeRound('r1', 1, [
      { ...makeMatch('m1', ['agent-1', 'agent-2']), isBye: true },
    ]);
    mockGenerateSingleElimination.mockReturnValue({ rounds: [roundWithBye], bracket: [] });

    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    expect(mockStartCompetition).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runMatch: winner determination
// ---------------------------------------------------------------------------

describe('runMatch: winner determination', () => {
  it('sets winner to agent with higher score', async () => {
    mockGetLeaderboard.mockReturnValue([
      { agentId: 'agent-1', totalScore: 200, eventsWon: 1, eventsCompleted: 1 },
      { agentId: 'agent-2', totalScore: 100, eventsWon: 0, eventsCompleted: 1 },
    ]);

    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    const match = ctrl.getTournament()!.rounds[0].matches[0];
    expect(match.winnerId).toBe('agent-1');
    expect(match.loserId).toBe('agent-2');
  });

  it('randomly resolves a tie', async () => {
    mockGetLeaderboard.mockReturnValue([
      { agentId: 'agent-1', totalScore: 100, eventsWon: 1, eventsCompleted: 1 },
      { agentId: 'agent-2', totalScore: 100, eventsWon: 1, eventsCompleted: 1 },
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // winner = index 1 → agent-2

    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    const match = ctrl.getTournament()!.rounds[0].matches[0];
    expect(match.winnerId).toBe('agent-2');
    expect(match.loserId).toBe('agent-1');
  });

  it('randomly picks winner when competition throws', async () => {
    mockStartCompetition.mockRejectedValueOnce(new Error('competition failed'));
    vi.spyOn(Math, 'random').mockReturnValue(0); // Math.floor(0*2)=0 → agent-1

    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    const match = ctrl.getTournament()!.rounds[0].matches[0];
    expect(match.winnerId).toBeDefined();
    expect(match.status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// calculateEliminationStandings (via startTournament)
// ---------------------------------------------------------------------------

describe('calculateEliminationStandings', () => {
  it('winner gets rank 1 and loser gets rank 2', async () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    const standings = ctrl.getStandings();
    expect(standings[0].agentId).toBe('agent-1');
    expect(standings[0].rank).toBe(1);
    expect(standings[0].matchesWon).toBe(1);
    expect(standings[1].agentId).toBe('agent-2');
    expect(standings[1].rank).toBe(2);
    expect(standings[1].matchesLost).toBe(1);
    expect(standings[1].roundEliminated).toBe(1);
  });

  it('accumulates totalScore from match results', async () => {
    mockGetLeaderboard.mockReturnValue([
      { agentId: 'agent-1', totalScore: 750, eventsWon: 1, eventsCompleted: 1 },
      { agentId: 'agent-2', totalScore: 250, eventsWon: 0, eventsCompleted: 1 },
    ]);

    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();

    const standings = ctrl.getStandings();
    expect(standings[0].totalScore).toBe(750);
    expect(standings[1].totalScore).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// getTournament / getBracket / getStandings
// ---------------------------------------------------------------------------

describe('getTournament', () => {
  it('returns null when no tournament created', () => {
    expect(new TournamentController().getTournament()).toBeNull();
  });

  it('returns the tournament after createTournament', () => {
    const ctrl = new TournamentController();
    const t = ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(ctrl.getTournament()).toBe(t);
  });
});

describe('getBracket', () => {
  it('returns empty array when no tournament', () => {
    expect(new TournamentController().getBracket()).toEqual([]);
  });

  it('returns bracket from single-elimination tournament', () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(ctrl.getBracket().length).toBeGreaterThan(0);
  });
});

describe('getStandings', () => {
  it('returns empty array when no tournament', () => {
    expect(new TournamentController().getStandings()).toEqual([]);
  });

  it('returns populated standings after tournament completes', async () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.startTournament();
    expect(ctrl.getStandings().length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// cancelTournament
// ---------------------------------------------------------------------------

describe('cancelTournament', () => {
  it('sets status to "cancelled"', async () => {
    const ctrl = new TournamentController();
    ctrl.createTournament({ name: 'T', bracketType: 'single-elimination', agents: [agent1, agent2], taskIds: ['task-1'] });
    await ctrl.cancelTournament();
    expect(ctrl.getTournament()?.status).toBe('cancelled');
  });

  it('is a no-op when no tournament exists', async () => {
    const ctrl = new TournamentController();
    await expect(ctrl.cancelTournament()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createTournament factory
// ---------------------------------------------------------------------------

describe('createTournament factory', () => {
  it('uses "AI Olympics Tournament" as default name', () => {
    const ctrl = createTournament({ agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(ctrl.getTournament()?.name).toBe('AI Olympics Tournament');
  });

  it('uses "single-elimination" as default bracketType', () => {
    const ctrl = createTournament({ agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(ctrl.getTournament()?.bracketType).toBe('single-elimination');
  });

  it('respects provided name and bracketType', () => {
    const ctrl = createTournament({ name: 'My Tournament', bracketType: 'round-robin', agents: [agent1, agent2], taskIds: ['task-1'] });
    expect(ctrl.getTournament()?.name).toBe('My Tournament');
    expect(ctrl.getTournament()?.bracketType).toBe('round-robin');
  });
});
