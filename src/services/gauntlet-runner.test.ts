/**
 * Tests for GauntletRunner
 *
 * Mocks: Supabase serviceClient, gauntlet-verifier, logger
 * Covers: constructor, initialize, recordFrame, startTask, completeTask, finalize,
 *         getFrames, getTaskResults
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories — created before module imports
// ---------------------------------------------------------------------------

const { mockEq, mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
  return { mockEq, mockUpdate, mockFrom };
});

// Mock the Supabase service client
vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));

// Mock the verifier
vi.mock('./gauntlet-verifier.js', () => ({
  runVerifier: vi.fn().mockResolvedValue({
    score: 0.8,
    reasoning: 'Good answer',
    passed: true,
  }),
}));

// Mock the logger
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import { GauntletRunner } from './gauntlet-runner.js';
import { runVerifier } from './gauntlet-verifier.js';
import type { GauntletTask } from './gauntlet-tasks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<GauntletTask> = {}): GauntletTask {
  return {
    id: 'web-001',
    category: 'web-research',
    title: 'Test Task',
    prompt: 'Find something',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: 'Must contain correct answer',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply default mock implementations after clearAllMocks
  mockEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate });
  vi.mocked(runVerifier).mockResolvedValue({ score: 0.8, reasoning: 'Good answer', passed: true });
});

// ---------------------------------------------------------------------------
// 1. Constructor
// ---------------------------------------------------------------------------

describe('GauntletRunner — constructor', () => {
  it('sets runId correctly', () => {
    const runner = new GauntletRunner('run-abc-123');
    expect(runner.runId).toBe('run-abc-123');
  });

  it('starts with empty frames and taskResults', () => {
    const runner = new GauntletRunner('run-xyz');
    expect(runner.getFrames()).toHaveLength(0);
    expect(runner.getTaskResults()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. initialize()
// ---------------------------------------------------------------------------

describe('GauntletRunner — initialize()', () => {
  it('calls supabase update with status=running', async () => {
    const runner = new GauntletRunner('run-init-test');
    await runner.initialize();

    expect(mockFrom).toHaveBeenCalledWith('aio_gauntlet_runs');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running' })
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'run-init-test');
  });

  it('includes started_at in update payload', async () => {
    const runner = new GauntletRunner('run-init-2');
    await runner.initialize();

    const updateArg = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg).toHaveProperty('started_at');
    expect(typeof updateArg['started_at']).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 3. recordFrame()
// ---------------------------------------------------------------------------

describe('GauntletRunner — recordFrame()', () => {
  it('adds a frame with timestamp_ms to the frames array', () => {
    const runner = new GauntletRunner('run-frame-test');
    runner.recordFrame({ action: 'navigate', payload: 'https://example.com', task_index: 0 });

    const frames = runner.getFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      action: 'navigate',
      payload: 'https://example.com',
      task_index: 0,
    });
    expect(typeof frames[0]?.timestamp_ms).toBe('number');
  });

  it('accumulates multiple frames in order', () => {
    const runner = new GauntletRunner('run-multi-frame');
    runner.recordFrame({ action: 'navigate', payload: 'https://a.com', task_index: 0 });
    runner.recordFrame({ action: 'click', payload: '#btn', task_index: 0 });
    runner.recordFrame({ action: 'type', payload: 'hello', task_index: 0 });

    expect(runner.getFrames()).toHaveLength(3);
    expect(runner.getFrames()[1]).toMatchObject({ action: 'click' });
  });

  it('flushes to DB after every 10 frames', async () => {
    const runner = new GauntletRunner('run-flush-test');

    for (let i = 0; i < 10; i++) {
      runner.recordFrame({ action: 'navigate', payload: `https://p${i}.com`, task_index: 0 });
    }

    // Wait for async flush to complete
    await new Promise(r => setTimeout(r, 0));

    // After 10 frames a flush is triggered: from → update → eq
    expect(mockFrom).toHaveBeenCalledWith('aio_gauntlet_runs');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ frames: expect.any(String) })
    );
  });
});

// ---------------------------------------------------------------------------
// 4. startTask()
// ---------------------------------------------------------------------------

describe('GauntletRunner — startTask()', () => {
  it('records a task_start frame with the correct task_index', () => {
    const runner = new GauntletRunner('run-start-task');
    runner.startTask(0);

    const frames = runner.getFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      action: 'task_start',
      payload: '0',
      task_index: 0,
    });
  });

  it('stores a start timestamp for the task', () => {
    const runner = new GauntletRunner('run-start-ts');
    const before = Date.now();
    runner.startTask(2);
    const after = Date.now();

    // We can only verify this indirectly via completeTask using the elapsed time
    // Here we just confirm no errors are thrown
    expect(runner.getFrames()).toHaveLength(1);
    expect(before).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// 5. completeTask() — calls verifier and builds TaskResult
// ---------------------------------------------------------------------------

describe('GauntletRunner — completeTask() — verifier call', () => {
  it('calls runVerifier with the task and agent answer', async () => {
    const runner = new GauntletRunner('run-complete-1');
    runner.startTask(0);
    const task = makeTask();

    await runner.completeTask(0, task, 'Sam Altman, 2023');

    expect(runVerifier).toHaveBeenCalledOnce();
    expect(runVerifier).toHaveBeenCalledWith(
      task,
      'Sam Altman, 2023',
      expect.objectContaining({ runId: 'run-complete-1' })
    );
  });
});

// ---------------------------------------------------------------------------
// 6. completeTask() — returns TaskResult with correct shape
// ---------------------------------------------------------------------------

describe('GauntletRunner — completeTask() — TaskResult shape', () => {
  it('returns a TaskResult with score computed from quality and elapsed time', async () => {
    const runner = new GauntletRunner('run-complete-2');
    runner.startTask(0);
    const task = makeTask({ id: 'web-001', timeLimitMs: 300_000 });

    const result = await runner.completeTask(0, task, 'some answer');

    expect(result.taskId).toBe('web-001');
    expect(result.taskIndex).toBe(0);
    expect(result.agentAnswer).toBe('some answer');
    expect(result.qualityPct).toBe(0.8);  // from mock verifier
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(200);
    expect(result.verifierReasoning).toBe('Good answer');
    expect(typeof result.completedAt).toBe('string');
    expect(typeof result.elapsedMs).toBe('number');
  });

  it('adds the TaskResult to taskResults array', async () => {
    const runner = new GauntletRunner('run-complete-3');
    runner.startTask(0);

    await runner.completeTask(0, makeTask(), 'answer 1');

    expect(runner.getTaskResults()).toHaveLength(1);
  });

  it('updates the DB tasks column after completion', async () => {
    const runner = new GauntletRunner('run-complete-4');
    runner.startTask(0);

    await runner.completeTask(0, makeTask(), 'answer here');

    const calls = mockUpdate.mock.calls;
    const taskUpdateCall = calls.find(
      (call) => (call[0] as Record<string, unknown>)['tasks'] !== undefined
    );
    expect(taskUpdateCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 7. finalize() — sets total_score, calls supabase update
// ---------------------------------------------------------------------------

describe('GauntletRunner — finalize()', () => {
  it('computes totalScore as sum of all task scores', async () => {
    const runner = new GauntletRunner('run-finalize-1');
    runner.startTask(0);
    runner.startTask(1);
    await runner.completeTask(0, makeTask({ id: 'web-001' }), 'answer 0');
    await runner.completeTask(1, makeTask({ id: 'web-002' }), 'answer 1');

    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const { totalScore } = await runner.finalize('completed');
    const expectedTotal = runner.getTaskResults().reduce((s, r) => s + r.score, 0);
    expect(totalScore).toBe(expectedTotal);
  });

  it('calls supabase update with status, total_score, completed_at, frames, tasks', async () => {
    const runner = new GauntletRunner('run-finalize-2');
    runner.startTask(0);
    await runner.completeTask(0, makeTask(), 'answer');

    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    await runner.finalize('completed');

    expect(mockFrom).toHaveBeenCalledWith('aio_gauntlet_runs');
    const updateArg = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg).toMatchObject({
      status: 'completed',
      total_score: expect.any(Number),
      completed_at: expect.any(String),
      frames: expect.any(String),
      tasks: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'run-finalize-2');
  });

  it('returns totalScore=0 when no tasks have been completed', async () => {
    const runner = new GauntletRunner('run-finalize-empty');
    const { totalScore } = await runner.finalize('failed');
    expect(totalScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. getFrames()
// ---------------------------------------------------------------------------

describe('GauntletRunner — getFrames()', () => {
  it('returns all frames recorded across multiple tasks', () => {
    const runner = new GauntletRunner('run-get-frames');
    runner.startTask(0);
    runner.recordFrame({ action: 'navigate', payload: 'https://x.com', task_index: 0 });
    runner.startTask(1);
    runner.recordFrame({ action: 'click', payload: '#link', task_index: 1 });

    // 2 task_start frames + 2 explicit frames = 4
    expect(runner.getFrames()).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// 9. getTaskResults()
// ---------------------------------------------------------------------------

describe('GauntletRunner — getTaskResults()', () => {
  it('returns all completed task results', async () => {
    const runner = new GauntletRunner('run-get-results');
    runner.startTask(0);
    runner.startTask(1);
    await runner.completeTask(0, makeTask({ id: 'web-001' }), 'answer A');
    await runner.completeTask(1, makeTask({ id: 'web-002' }), 'answer B');

    const results = runner.getTaskResults();
    expect(results).toHaveLength(2);
    expect(results[0]?.taskId).toBe('web-001');
    expect(results[1]?.taskId).toBe('web-002');
  });
});
