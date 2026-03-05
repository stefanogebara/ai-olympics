import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGauntletDropIn } from './gauntlet-execution.js';
import { AgentRunner } from '../agents/runner.js';
import { GauntletRunner } from './gauntlet-runner.js';
import { pickWeeklyTasks } from './gauntlet-tasks.js';

vi.mock('../agents/runner.js');
vi.mock('./gauntlet-runner.js');
vi.mock('./gauntlet-tasks.js', () => ({
  pickWeeklyTasks: vi.fn(),
  hydrateTask: vi.fn((task: unknown) => task),
}));

const MockAgentRunner = vi.mocked(AgentRunner);
const mockPickWeeklyTasks = vi.mocked(pickWeeklyTasks);

describe('executeGauntletDropIn', () => {
  const mockRunner = {
    runId: 'run-123',
    startTask: vi.fn(),
    recordFrame: vi.fn(),
    completeTask: vi.fn().mockResolvedValue({ score: 100, qualityPct: 1.0 }),
    finalize: vi.fn().mockResolvedValue({ totalScore: 500 }),
  };

  const mockAgentRunnerInstance = {
    initialize: vi.fn().mockResolvedValue(undefined),
    runTask: vi.fn().mockResolvedValue({ success: true, result: 'Sam Altman, 2023', actions: [] }),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };

  const mockTasks = [
    {
      id: 'web-001',
      title: 'OpenAI CEO',
      prompt: 'Find the CEO of OpenAI',
      timeLimitMs: 300_000,
      category: 'web-research' as const,
      verifierType: 'llm-judge' as const,
      verifierConfig: {},
      criteria: 'Sam Altman',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    MockAgentRunner.mockImplementation(function () {
      return mockAgentRunnerInstance as unknown as AgentRunner;
    });
    mockPickWeeklyTasks.mockReturnValue(mockTasks as ReturnType<typeof pickWeeklyTasks>);
  });

  it('runs all tasks and finalises the run with completed status', async () => {
    await executeGauntletDropIn({
      runner: mockRunner as unknown as GauntletRunner,
      runId: 'run-123',
      weekNumber: 10,
      year: 2026,
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      apiKey: 'sk-test',
    });

    expect(mockAgentRunnerInstance.initialize).toHaveBeenCalledWith('run-123', 'gauntlet');
    expect(mockRunner.startTask).toHaveBeenCalledWith(0);
    expect(mockAgentRunnerInstance.runTask).toHaveBeenCalledTimes(1);
    expect(mockRunner.completeTask).toHaveBeenCalledWith(
      0,
      mockTasks[0],
      'Sam Altman, 2023',
      expect.anything()
    );
    expect(mockRunner.finalize).toHaveBeenCalledWith('completed');
    expect(mockAgentRunnerInstance.cleanup).toHaveBeenCalled();
  });

  it('finalises with failed status if AgentRunner.initialize throws', async () => {
    mockAgentRunnerInstance.initialize.mockRejectedValueOnce(new Error('Browser launch failed'));

    await executeGauntletDropIn({
      runner: mockRunner as unknown as GauntletRunner,
      runId: 'run-123',
      weekNumber: 10,
      year: 2026,
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      apiKey: 'sk-test',
    });

    expect(mockRunner.finalize).toHaveBeenCalledWith('failed');
    expect(mockAgentRunnerInstance.cleanup).toHaveBeenCalled();
  });
});
