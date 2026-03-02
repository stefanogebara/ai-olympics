/**
 * Tests for competition-controller.ts
 *
 * Covers: createCompetition, calculateScore, processEventResults,
 * startCompetition, judged scoring, pause/resume, cancel, cleanup,
 * getters, createQuickCompetition factory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockCreateLocalSandbox, mockStopSandbox, mockSandboxCleanup,
  mockRunTask, mockRunnerInitialize, mockRunnerCleanup,
  mockTimerStart, mockTimerStop, mockTimerPause, mockTimerResume, mockTimerElapsed,
  mockJudgeSubmission,
  mockSaveSnapshot, mockRemoveSnapshot, mockDeleteEventLog,
  mockEventBusEmit, mockCreateStreamEvent,
  mockNanoid,
  mockAgentPresets,
} = vi.hoisted(() => {
  const mockCreateLocalSandbox = vi.fn();
  const mockStopSandbox = vi.fn();
  const mockSandboxCleanup = vi.fn();

  const mockRunTask = vi.fn();
  const mockRunnerInitialize = vi.fn();
  const mockRunnerCleanup = vi.fn();

  const mockTimerStart = vi.fn();
  const mockTimerStop = vi.fn();
  const mockTimerPause = vi.fn();
  const mockTimerResume = vi.fn();
  const mockTimerElapsed = vi.fn().mockReturnValue(5000);

  const mockJudgeSubmission = vi.fn();
  const mockSaveSnapshot = vi.fn();
  const mockRemoveSnapshot = vi.fn();
  const mockDeleteEventLog = vi.fn();
  const mockEventBusEmit = vi.fn();
  const mockCreateStreamEvent = vi.fn().mockReturnValue({ type: 'mock', data: {} });
  const mockNanoid = vi.fn().mockReturnValue('abc1234567');

  const mockAgentPresets = {
    claude: { id: 'claude', name: 'Claude', provider: 'claude' as const, model: 'claude-sonnet-4-5', color: '#fff' },
    'gpt-4': { id: 'gpt-4', name: 'GPT-4', provider: 'openai' as const, model: 'gpt-4', color: '#fff' },
    gemini: { id: 'gemini', name: 'Gemini', provider: 'google' as const, model: 'gemini-pro', color: '#fff' },
  };

  return {
    mockCreateLocalSandbox, mockStopSandbox, mockSandboxCleanup,
    mockRunTask, mockRunnerInitialize, mockRunnerCleanup,
    mockTimerStart, mockTimerStop, mockTimerPause, mockTimerResume, mockTimerElapsed,
    mockJudgeSubmission, mockSaveSnapshot, mockRemoveSnapshot, mockDeleteEventLog,
    mockEventBusEmit, mockCreateStreamEvent,
    mockNanoid,
    mockAgentPresets,
  };
});

vi.mock('nanoid', () => ({ nanoid: mockNanoid }));
vi.mock('../agents/runner.js', () => ({
  AgentRunner: class {
    initialize = mockRunnerInitialize;
    runTask = mockRunTask;
    cleanup = mockRunnerCleanup;
  },
}));
vi.mock('./sandbox-manager.js', () => ({
  sandboxManager: {
    createLocalSandbox: mockCreateLocalSandbox,
    stopSandbox: mockStopSandbox,
    cleanup: mockSandboxCleanup,
  },
}));
vi.mock('../shared/utils/events.js', () => ({
  eventBus: { emit: mockEventBusEmit },
  createStreamEvent: mockCreateStreamEvent,
}));
vi.mock('../shared/utils/timer.js', () => ({
  PrecisionTimer: class {
    start = mockTimerStart;
    stop = mockTimerStop;
    pause = mockTimerPause;
    resume = mockTimerResume;
    elapsed = mockTimerElapsed;
  },
  formatDuration: vi.fn().mockReturnValue('5s'),
}));
vi.mock('../services/judging-service.js', () => ({
  judgingService: { judgeSubmission: mockJudgeSubmission },
}));
vi.mock('../shared/utils/redis.js', () => ({
  saveCompetitionSnapshot: mockSaveSnapshot,
  removeCompetitionSnapshot: mockRemoveSnapshot,
  deleteEventLog: mockDeleteEventLog,
}));
vi.mock('../shared/config.js', () => ({ AGENT_PRESETS: mockAgentPresets }));
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { CompetitionController, createQuickCompetition } from './competition-controller.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const agent1 = { id: 'agent-1', name: 'Agent 1', provider: 'claude' as const, model: 'claude-sonnet-4-5', color: '#f00' };
const agent2 = { id: 'agent-2', name: 'Agent 2', provider: 'openai' as const, model: 'gpt-4', color: '#00f' };

const task1 = {
  id: 'task-1',
  name: 'Task One',
  description: 'A test task',
  scoringMethod: 'time' as const,
  timeLimit: 60,
  maxScore: 1000,
  category: 'speed' as const,
  difficulty: 'easy' as const,
  maxAgents: 4,
  config: {},
  startUrl: 'http://localhost/task',
  systemPrompt: 'You are an AI agent.',
  taskPrompt: 'Complete the task.',
};

// Default runner task result (success)
const successResult = { success: true, result: 'done', completionTime: 30000, actions: [] };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();

  // Re-apply resolved values
  mockCreateLocalSandbox.mockResolvedValue({ id: 'sandbox-1', status: 'ready', browserEndpoint: 'local' });
  mockStopSandbox.mockResolvedValue(undefined);
  mockSandboxCleanup.mockResolvedValue(undefined);
  mockRunnerInitialize.mockResolvedValue(undefined);
  mockRunnerCleanup.mockResolvedValue(undefined);
  mockTimerElapsed.mockReturnValue(5000);
  mockSaveSnapshot.mockResolvedValue(undefined);
  mockRemoveSnapshot.mockResolvedValue(undefined);
  mockDeleteEventLog.mockResolvedValue(undefined);
  mockCreateStreamEvent.mockReturnValue({ type: 'mock', data: {} });
  mockNanoid.mockReturnValue('abc1234567');
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// createCompetition
// ---------------------------------------------------------------------------

describe('createCompetition', () => {
  it('returns competition with generated ID prefixed comp-', () => {
    const ctrl = new CompetitionController();
    const comp = ctrl.createCompetition({ name: 'Test', description: 'desc', agents: [agent1], tasks: [task1] });
    expect(comp.id).toBe('comp-abc1234567');
  });

  it('sets status to scheduled', () => {
    const ctrl = new CompetitionController();
    const comp = ctrl.createCompetition({ name: 'T', description: '', agents: [agent1], tasks: [task1] });
    expect(comp.status).toBe('scheduled');
  });

  it('creates one event per task', () => {
    const ctrl = new CompetitionController();
    const comp = ctrl.createCompetition({ name: 'T', description: '', agents: [agent1], tasks: [task1, task1] });
    expect(comp.events).toHaveLength(2);
    expect(comp.events[0].status).toBe('pending');
  });

  it('initializes leaderboard with all agents at zero scores', () => {
    const ctrl = new CompetitionController();
    const comp = ctrl.createCompetition({ name: 'T', description: '', agents: [agent1, agent2], tasks: [task1] });
    expect(comp.leaderboard).toHaveLength(2);
    expect(comp.leaderboard[0].totalScore).toBe(0);
    expect(comp.leaderboard[0].eventsWon).toBe(0);
  });

  it('assigns initial ranks starting at 1', () => {
    const ctrl = new CompetitionController();
    const comp = ctrl.createCompetition({ name: 'T', description: '', agents: [agent1, agent2], tasks: [task1] });
    expect(comp.leaderboard[0].rank).toBe(1);
    expect(comp.leaderboard[1].rank).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// calculateScore (private — accessed via cast)
// ---------------------------------------------------------------------------

describe('calculateScore', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score = (ctrl: CompetitionController, task: unknown, result: unknown) =>
    (ctrl as any).calculateScore(task, result);

  let ctrl: CompetitionController;
  beforeEach(() => { ctrl = new CompetitionController(); });

  it('returns 0 for any failed result regardless of scoring method', () => {
    expect(score(ctrl, { scoringMethod: 'time', timeLimit: 60, maxScore: 1000 }, { success: false, actions: [] })).toBe(0);
    expect(score(ctrl, { scoringMethod: 'accuracy', timeLimit: 60, maxScore: 500 }, { success: false, actions: [] })).toBe(0);
    expect(score(ctrl, { scoringMethod: 'composite', timeLimit: 60, maxScore: 800 }, { success: false, actions: [] })).toBe(0);
  });

  it('time: awards maxScore for near-instant completion', () => {
    const t = { scoringMethod: 'time', timeLimit: 60, maxScore: 1000 };
    // completionTime=1ms → timeTaken=1, timeRatio≈0.9999 → round(100+899.98)=1000
    // Note: completionTime=0 is falsy so the code falls back to maxTime
    expect(score(ctrl, t, { success: true, completionTime: 1, actions: [] })).toBe(1000);
  });

  it('time: awards exactly 100 (base) for completing at the time limit', () => {
    const t = { scoringMethod: 'time', timeLimit: 60, maxScore: 1000 };
    // timeTaken = 60000ms = timeLimit → timeRatio = 0 → 100 + 0 = 100
    expect(score(ctrl, t, { success: true, completionTime: 60000, actions: [] })).toBe(100);
  });

  it('accuracy: returns maxScore on success', () => {
    const t = { scoringMethod: 'accuracy', timeLimit: 60, maxScore: 500 };
    expect(score(ctrl, t, { success: true, actions: [] })).toBe(500);
  });

  it('composite: awards full score for near-instant completion', () => {
    const t = { scoringMethod: 'composite', timeLimit: 60, maxScore: 1000 };
    // completionTime=1ms → timeBonusRatio≈0.9999 → round(600+399.99)=1000
    expect(score(ctrl, t, { success: true, completionTime: 1, actions: [] })).toBe(1000);
  });

  it('default: returns maxScore for success, 0 for failure', () => {
    const t = { scoringMethod: 'unknown', timeLimit: 60, maxScore: 500 };
    expect(score(ctrl, t, { success: true, actions: [] })).toBe(500);
    expect(score(ctrl, t, { success: false, actions: [] })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// processEventResults (private — accessed via cast)
// ---------------------------------------------------------------------------

describe('processEventResults', () => {
  let ctrl: CompetitionController;

  beforeEach(() => {
    ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1, agent2], tasks: [task1] });
  });

  it('adds each result score to the agent leaderboard totalScore', () => {
    const event = ctrl.getCompetition()!.events[0];
    event.results = [
      { agentId: 'agent-1', taskId: 'task-1', status: 'completed', score: 800, actions: [] },
      { agentId: 'agent-2', taskId: 'task-1', status: 'completed', score: 500, actions: [] },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctrl as any).processEventResults(event);
    expect(ctrl.getLeaderboard().find(e => e.agentId === 'agent-1')?.totalScore).toBe(800);
    expect(ctrl.getLeaderboard().find(e => e.agentId === 'agent-2')?.totalScore).toBe(500);
  });

  it('increments eventsCompleted only for completed (not failed) results', () => {
    const event = ctrl.getCompetition()!.events[0];
    event.results = [
      { agentId: 'agent-1', taskId: 'task-1', status: 'completed', score: 800, actions: [] },
      { agentId: 'agent-2', taskId: 'task-1', status: 'failed', score: 0, actions: [] },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctrl as any).processEventResults(event);
    expect(ctrl.getLeaderboard().find(e => e.agentId === 'agent-1')?.eventsCompleted).toBe(1);
    expect(ctrl.getLeaderboard().find(e => e.agentId === 'agent-2')?.eventsCompleted).toBe(0);
  });

  it('marks the highest scorer as winner (eventsWon++)', () => {
    const event = ctrl.getCompetition()!.events[0];
    event.results = [
      { agentId: 'agent-1', taskId: 'task-1', status: 'completed', score: 800, actions: [] },
      { agentId: 'agent-2', taskId: 'task-1', status: 'completed', score: 500, actions: [] },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctrl as any).processEventResults(event);
    expect(ctrl.getLeaderboard().find(e => e.agentId === 'agent-1')?.eventsWon).toBe(1);
    expect(ctrl.getLeaderboard().find(e => e.agentId === 'agent-2')?.eventsWon).toBe(0);
  });

  it('re-ranks leaderboard by totalScore descending', () => {
    const event = ctrl.getCompetition()!.events[0];
    event.results = [
      { agentId: 'agent-1', taskId: 'task-1', status: 'completed', score: 500, actions: [] },
      { agentId: 'agent-2', taskId: 'task-1', status: 'completed', score: 800, actions: [] },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctrl as any).processEventResults(event);
    const lb = ctrl.getLeaderboard();
    expect(lb[0].agentId).toBe('agent-2'); // 800 > 500
    expect(lb[0].rank).toBe(1);
    expect(lb[1].rank).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// startCompetition
// ---------------------------------------------------------------------------

describe('startCompetition', () => {
  it('throws when no competition has been created', async () => {
    const ctrl = new CompetitionController();
    await expect(ctrl.startCompetition()).rejects.toThrow('No competition created');
  });

  it('creates a local sandbox for each agent', async () => {
    const ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1, agent2], tasks: [task1] });
    mockRunTask.mockResolvedValue(successResult);

    const p = ctrl.startCompetition();
    await vi.advanceTimersByTimeAsync(600); // past the 500ms inter-agent delay
    await p;

    expect(mockCreateLocalSandbox).toHaveBeenCalledTimes(2);
  });

  it('sets competition status to completed after all events run', async () => {
    const ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1, agent2], tasks: [task1] });
    mockRunTask.mockResolvedValue(successResult);

    const p = ctrl.startCompetition();
    await vi.advanceTimersByTimeAsync(600);
    await p;

    expect(ctrl.getCompetition()!.status).toBe('completed');
  });

  it('emits competition:start via eventBus', async () => {
    const ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1, agent2], tasks: [task1] });
    mockRunTask.mockResolvedValue(successResult);

    const p = ctrl.startCompetition();
    await vi.advanceTimersByTimeAsync(600);
    await p;

    expect(mockEventBusEmit).toHaveBeenCalled();
  });

  it('calls removeCompetitionSnapshot and deleteEventLog when done', async () => {
    const ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1, agent2], tasks: [task1] });
    mockRunTask.mockResolvedValue(successResult);

    const p = ctrl.startCompetition();
    await vi.advanceTimersByTimeAsync(600);
    await p;

    expect(mockRemoveSnapshot).toHaveBeenCalled();
    expect(mockDeleteEventLog).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// judged scoring path (single agent — no inter-agent delay)
// ---------------------------------------------------------------------------

describe('judged scoring', () => {
  const judgedTask = { ...task1, scoringMethod: 'judged' as const };

  it('uses judgingService score for tasks with scoringMethod=judged', async () => {
    const ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1], tasks: [judgedTask] });
    mockRunTask.mockResolvedValue({ success: true, result: 'creative output', completionTime: 30000, actions: [] });
    mockJudgeSubmission.mockResolvedValue({ score: 850, breakdown: {} });

    await ctrl.startCompetition();

    expect(mockJudgeSubmission).toHaveBeenCalledWith('task-1', 'creative output', 'claude');
    expect(ctrl.getLeaderboard()[0].totalScore).toBe(850);
  });

  it('falls back to calculateScore when judgeSubmission throws', async () => {
    const ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1], tasks: [judgedTask] });
    mockRunTask.mockResolvedValue({ success: true, result: 'output', completionTime: 30000, actions: [] });
    mockJudgeSubmission.mockRejectedValue(new Error('LLM unavailable'));

    await ctrl.startCompetition();

    // Falls back to default case: success ? maxScore : 0 = 1000
    expect(ctrl.getLeaderboard()[0].totalScore).toBe(task1.maxScore);
  });
});

// ---------------------------------------------------------------------------
// pauseCompetition / resumeCompetition
// ---------------------------------------------------------------------------

describe('pauseCompetition / resumeCompetition', () => {
  let ctrl: CompetitionController;

  beforeEach(() => {
    ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1], tasks: [task1] });
    ctrl.getCompetition()!.status = 'running';
  });

  it('pauseCompetition sets status to paused and pauses the timer', () => {
    ctrl.pauseCompetition();
    expect(ctrl.getCompetition()!.status).toBe('paused');
    expect(mockTimerPause).toHaveBeenCalled();
  });

  it('resumeCompetition sets status back to running and resumes the timer', () => {
    ctrl.pauseCompetition();
    ctrl.resumeCompetition();
    expect(ctrl.getCompetition()!.status).toBe('running');
    expect(mockTimerResume).toHaveBeenCalled();
  });

  it('resumeCompetition is a no-op when status is not paused', () => {
    // status is 'running', not 'paused'
    ctrl.resumeCompetition();
    expect(ctrl.getCompetition()!.status).toBe('running'); // unchanged
    expect(mockTimerResume).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cancelCompetition
// ---------------------------------------------------------------------------

describe('cancelCompetition', () => {
  let ctrl: CompetitionController;

  beforeEach(() => {
    ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1], tasks: [task1] });
    // Inject a pre-initialized agent so cleanup paths are exercised
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctrl as any).agents.set('agent-1', {
      runner: { initialize: mockRunnerInitialize, runTask: mockRunTask, cleanup: mockRunnerCleanup },
      config: agent1,
      sandboxId: 'sandbox-1',
    });
  });

  it('sets competition status to cancelled', async () => {
    await ctrl.cancelCompetition();
    expect(ctrl.getCompetition()!.status).toBe('cancelled');
  });

  it('cleans up runner and stops the sandbox for each agent', async () => {
    await ctrl.cancelCompetition();
    expect(mockRunnerCleanup).toHaveBeenCalled();
    expect(mockStopSandbox).toHaveBeenCalledWith('sandbox-1');
  });

  it('calls removeCompetitionSnapshot and deleteEventLog', async () => {
    await ctrl.cancelCompetition();
    expect(mockRemoveSnapshot).toHaveBeenCalled();
    expect(mockDeleteEventLog).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cleanup
// ---------------------------------------------------------------------------

describe('cleanup', () => {
  it('cleans up all agent runners and delegates to sandboxManager.cleanup', async () => {
    const ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1], tasks: [task1] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctrl as any).agents.set('agent-1', {
      runner: { initialize: mockRunnerInitialize, runTask: mockRunTask, cleanup: mockRunnerCleanup },
      config: agent1,
      sandboxId: 'sandbox-1',
    });

    await ctrl.cleanup();

    expect(mockRunnerCleanup).toHaveBeenCalled();
    expect(mockSandboxCleanup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCompetition / getLeaderboard
// ---------------------------------------------------------------------------

describe('getters', () => {
  it('getCompetition returns null before createCompetition is called', () => {
    expect(new CompetitionController().getCompetition()).toBeNull();
  });

  it('getLeaderboard returns empty array before createCompetition is called', () => {
    expect(new CompetitionController().getLeaderboard()).toEqual([]);
  });

  it('getLeaderboard returns one entry per agent after createCompetition', () => {
    const ctrl = new CompetitionController();
    ctrl.createCompetition({ name: 'T', description: '', agents: [agent1, agent2], tasks: [task1] });
    expect(ctrl.getLeaderboard()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// createQuickCompetition factory
// ---------------------------------------------------------------------------

describe('createQuickCompetition', () => {
  it('uses the agents provided in options', async () => {
    const ctrl = await createQuickCompetition({ agents: [agent1], tasks: [task1] });
    expect(ctrl.getCompetition()!.agents).toHaveLength(1);
    expect(ctrl.getCompetition()!.agents[0].id).toBe('agent-1');
  });

  it('falls back to AGENT_PRESETS when agents not provided', async () => {
    const ctrl = await createQuickCompetition({ tasks: [task1] });
    // AGENT_PRESETS has 3 agents (claude, gpt-4, gemini)
    expect(ctrl.getCompetition()!.agents.length).toBeGreaterThan(0);
  });
});
