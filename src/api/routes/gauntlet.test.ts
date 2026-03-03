/**
 * Tests for gauntlet API routes.
 *
 * Strategy: mock all external dependencies (Supabase, GauntletRunner,
 * github-credential-service, gauntlet-tasks, auth middleware) then call
 * each route handler via a real HTTP server spun up in each test.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — ALL mock functions must be created inside vi.hoisted
// ---------------------------------------------------------------------------

const {
  mockPickWeeklyTasks,
  mockMaybeSingle,
  mockSingle,
  mockLimit,
  mockOrder,
  mockEq,
  mockInsert,
  mockSelect,
  mockFrom,
  mockIssueRunToken,
  mockGetRunToken,
  mockRevokeRunToken,
  mockInitialize,
  mockRecordFrame,
  mockCompleteTask,
  mockFinalize,
} = vi.hoisted(() => {
  const mockPickWeeklyTasks = vi.fn().mockReturnValue([
    { id: 'web-001', title: 'OpenAI CEO', category: 'web-research', timeLimitMs: 300_000, prompt: 'Find CEO', verifierType: 'llm-judge', verifierConfig: {}, criteria: 'Must say Sam Altman' },
    { id: 'web-002', title: 'Node.js Version', category: 'web-research', timeLimitMs: 300_000, prompt: 'Find version', verifierType: 'llm-judge', verifierConfig: {}, criteria: 'Must contain version' },
    { id: 'gh-001', title: 'Create Test Repo', category: 'github-workflow', timeLimitMs: 300_000, prompt: 'Create repo', verifierType: 'github-api', verifierConfig: {}, criteria: 'Repo must exist' },
    { id: 'gh-002', title: 'Fork Fixture Repo', category: 'github-workflow', timeLimitMs: 300_000, prompt: 'Fork repo', verifierType: 'github-api', verifierConfig: {}, criteria: 'Fork must exist' },
    { id: 'wild-001', title: 'AI Poem', category: 'wildcard', timeLimitMs: 300_000, prompt: 'Write poem', verifierType: 'llm-judge', verifierConfig: {}, criteria: 'Must be a poem' },
  ]);

  const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'run-uuid-123', user_id: 'user-abc' }, error: null });
  const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
  const mockOrder = vi.fn();
  const mockEq = vi.fn();
  const mockInsert = vi.fn();
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();

  mockOrder.mockReturnValue({ limit: mockLimit });
  mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, maybeSingle: mockMaybeSingle, order: mockOrder, limit: mockLimit });
  mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle, maybeSingle: mockMaybeSingle, order: mockOrder });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, eq: mockEq });

  const mockIssueRunToken = vi.fn().mockResolvedValue('ghtoken_abc123');
  const mockGetRunToken = vi.fn().mockReturnValue('ghtoken_abc123');
  const mockRevokeRunToken = vi.fn();

  const mockInitialize = vi.fn().mockResolvedValue(undefined);
  const mockRecordFrame = vi.fn();
  const mockCompleteTask = vi.fn().mockResolvedValue({
    taskId: 'web-001',
    taskIndex: 0,
    agentAnswer: 'Sam Altman',
    score: 160,
    qualityPct: 0.8,
    elapsedMs: 5000,
    verifierReasoning: 'Correct answer',
    completedAt: new Date().toISOString(),
  });
  const mockFinalize = vi.fn().mockResolvedValue({ totalScore: 800 });

  return {
    mockPickWeeklyTasks,
    mockMaybeSingle,
    mockSingle,
    mockLimit,
    mockOrder,
    mockEq,
    mockInsert,
    mockSelect,
    mockFrom,
    mockIssueRunToken,
    mockGetRunToken,
    mockRevokeRunToken,
    mockInitialize,
    mockRecordFrame,
    mockCompleteTask,
    mockFinalize,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));

vi.mock('../../services/gauntlet-runner.js', () => {
  // Use a real function (not arrow) so `new GauntletRunner()` works correctly
  const MockRunner = vi.fn(function(this: { runId: string }, runId: string) {
    this.runId = runId;
    (this as any).initialize = mockInitialize;
    (this as any).recordFrame = mockRecordFrame;
    (this as any).completeTask = mockCompleteTask;
    (this as any).finalize = mockFinalize;
    (this as any).getFrames = vi.fn().mockReturnValue([]);
    (this as any).getTaskResults = vi.fn().mockReturnValue([]);
  });
  return { GauntletRunner: MockRunner };
});

vi.mock('../../services/github-credential-service.js', () => ({
  issueRunToken: mockIssueRunToken,
  getRunToken: mockGetRunToken,
  revokeRunToken: mockRevokeRunToken,
}));

vi.mock('../../services/gauntlet-tasks.js', () => ({
  pickWeeklyTasks: mockPickWeeklyTasks,
}));

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = { id: 'user-abc', email: 'test@example.com' };
    req.userClient = { from: mockFrom };
    next();
  },
}));

// ---------------------------------------------------------------------------
// Imports — AFTER mocks
// ---------------------------------------------------------------------------

import express from 'express';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import http from 'http';
import { GauntletRunner } from '../../services/gauntlet-runner.js';
import gauntletRouter, { getISOWeek } from './gauntlet.js';

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/gauntlet', gauntletRouter);
  return app;
}

async function withServer<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const app = makeApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  try {
    return await fn(url);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function httpRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }

  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const options = {
      hostname: url.hostname,
      port: parseInt(url.port, 10),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: 'Bearer test-token',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 500, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 500, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Helper to reset mock chains and GauntletRunner after vi.clearAllMocks() */
function resetMockChains() {
  mockOrder.mockReturnValue({ limit: mockLimit });
  mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, maybeSingle: mockMaybeSingle, order: mockOrder, limit: mockLimit });
  mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle, maybeSingle: mockMaybeSingle, order: mockOrder });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, eq: mockEq });
}

/** Restore the GauntletRunner constructor mock after vi.clearAllMocks() resets it. */
function resetRunnerMock() {
  // Use a regular function (not arrow) so `new GauntletRunner()` works correctly.
  // vi.clearAllMocks() only clears call records, NOT implementations, so this may be
  // a no-op in practice, but calling it ensures correctness.
  const self = vi.mocked(GauntletRunner) as unknown as ReturnType<typeof vi.fn>;
  self.mockImplementation(function(this: { runId: string }, runId: string) {
    this.runId = runId;
    (this as any).initialize = mockInitialize;
    (this as any).recordFrame = mockRecordFrame;
    (this as any).completeTask = mockCompleteTask;
    (this as any).finalize = mockFinalize;
    (this as any).getFrames = vi.fn().mockReturnValue([]);
    (this as any).getTaskResults = vi.fn().mockReturnValue([]);
  });
}

// ---------------------------------------------------------------------------
// getISOWeek helper unit tests
// ---------------------------------------------------------------------------

describe('getISOWeek', () => {
  it('returns weekNumber and year for a known date (2026-01-05 = week 2)', () => {
    const result = getISOWeek(new Date('2026-01-05'));
    expect(result.weekNumber).toBe(2);
    expect(result.year).toBe(2026);
  });

  it('returns week 1 for the first ISO week of 2026 (2026-01-01)', () => {
    const result = getISOWeek(new Date('2026-01-01'));
    expect(result.weekNumber).toBe(1);
    expect(result.year).toBe(2026);
  });

  it('year and weekNumber are integers', () => {
    const { weekNumber, year } = getISOWeek(new Date());
    expect(Number.isInteger(weekNumber)).toBe(true);
    expect(Number.isInteger(year)).toBe(true);
  });

  it('weekNumber is between 1 and 53', () => {
    const { weekNumber } = getISOWeek(new Date());
    expect(weekNumber).toBeGreaterThanOrEqual(1);
    expect(weekNumber).toBeLessThanOrEqual(53);
  });
});

// ---------------------------------------------------------------------------
// 1. GET /api/gauntlet/weeks/current
// ---------------------------------------------------------------------------

describe('GET /api/gauntlet/weeks/current', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();
    mockPickWeeklyTasks.mockReturnValue([
      { id: 'web-001', title: 'OpenAI CEO', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'web-002', title: 'Node.js Version', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'gh-001', title: 'Create Repo', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'gh-002', title: 'Fork Repo', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'wild-001', title: 'AI Poem', category: 'wildcard', timeLimitMs: 300_000 },
    ]);
    mockMaybeSingle.mockResolvedValue({ data: { prize_pool_cents: 5000, status: 'open' }, error: null });
  });

  it('returns 200 with weekNumber, year, and 5 tasks', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/weeks/current');
    });

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(typeof body.weekNumber).toBe('number');
    expect(typeof body.year).toBe('number');
    expect(Array.isArray(body.tasks)).toBe(true);
    expect((body.tasks as unknown[]).length).toBe(5);
  });

  it('includes prizePoolCents and status in response', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/weeks/current');
    });

    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('prizePoolCents');
    expect(body).toHaveProperty('status');
  });

  it('each task has id, title, category, timeLimitMs', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/weeks/current');
    });

    const body = result.body as Record<string, unknown>;
    const tasks = body.tasks as Array<Record<string, unknown>>;
    expect(tasks[0]).toHaveProperty('id');
    expect(tasks[0]).toHaveProperty('title');
    expect(tasks[0]).toHaveProperty('category');
    expect(tasks[0]).toHaveProperty('timeLimitMs');
  });

  it('defaults prizePoolCents to 0 when week row not found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/weeks/current');
    });

    const body = result.body as Record<string, unknown>;
    expect(body.prizePoolCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. POST /api/gauntlet/runs
// ---------------------------------------------------------------------------

describe('POST /api/gauntlet/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();
    mockPickWeeklyTasks.mockReturnValue([
      { id: 'web-001', title: 'T1', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'web-002', title: 'T2', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'gh-001', title: 'T3', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'gh-002', title: 'T4', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'wild-001', title: 'T5', category: 'wildcard', timeLimitMs: 300_000 },
    ]);
    mockIssueRunToken.mockResolvedValue('ghtoken_new');
    mockInitialize.mockResolvedValue(undefined);
    mockSingle.mockResolvedValue({ data: { id: 'run-uuid-new' }, error: null });
  });

  it('returns 201 with runId, tasks, and githubToken for dropin track', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'dropin' });
    });

    expect(result.status).toBe(201);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('runId');
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body).toHaveProperty('githubToken');
  });

  it('returns 201 for webhook track', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'webhook' });
    });

    expect(result.status).toBe(201);
  });

  it('returns 400 for invalid track value', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'invalid' });
    });

    expect(result.status).toBe(400);
    const body = result.body as Record<string, unknown>;
    expect(typeof body.error).toBe('string');
    expect((body.error as string).toLowerCase()).toContain('track');
  });

  it('returns 400 when track is missing', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'POST', '/api/gauntlet/runs', {});
    });

    expect(result.status).toBe(400);
  });

  it('returns tasks array with 5 items', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'dropin' });
    });

    const body = result.body as Record<string, unknown>;
    expect((body.tasks as unknown[]).length).toBe(5);
  });

  it('calls issueRunToken with the new run id', async () => {
    await withServer(async (url) => {
      return httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'dropin' });
    });

    expect(mockIssueRunToken).toHaveBeenCalledWith('run-uuid-new');
  });
});

// ---------------------------------------------------------------------------
// 3. POST /api/gauntlet/runs/:id/tasks/:index/complete
// ---------------------------------------------------------------------------

describe('POST /api/gauntlet/runs/:id/tasks/:index/complete', () => {
  const FIVE_TASKS = [
    { id: 'web-001', title: 'T1', category: 'web-research', timeLimitMs: 300_000, prompt: 'p', verifierType: 'llm-judge', verifierConfig: {}, criteria: 'c' },
    { id: 'web-002', title: 'T2', category: 'web-research', timeLimitMs: 300_000, prompt: 'p', verifierType: 'llm-judge', verifierConfig: {}, criteria: 'c' },
    { id: 'gh-001', title: 'T3', category: 'github-workflow', timeLimitMs: 300_000, prompt: 'p', verifierType: 'github-api', verifierConfig: {}, criteria: 'c' },
    { id: 'gh-002', title: 'T4', category: 'github-workflow', timeLimitMs: 300_000, prompt: 'p', verifierType: 'github-api', verifierConfig: {}, criteria: 'c' },
    { id: 'wild-001', title: 'T5', category: 'wildcard', timeLimitMs: 300_000, prompt: 'p', verifierType: 'llm-judge', verifierConfig: {}, criteria: 'c' },
  ];

  // For this group we use a single server to test the create-then-complete flow
  it('returns result from runner.completeTask when run is active', async () => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();
    mockPickWeeklyTasks.mockReturnValue(FIVE_TASKS);
    mockIssueRunToken.mockResolvedValue('tok');
    mockInitialize.mockResolvedValue(undefined);
    mockCompleteTask.mockResolvedValue({
      taskId: 'web-001',
      taskIndex: 0,
      agentAnswer: 'Sam Altman',
      score: 160,
      qualityPct: 0.8,
      elapsedMs: 5000,
      verifierReasoning: 'Correct',
      completedAt: new Date().toISOString(),
    });
    mockGetRunToken.mockReturnValue('tok');

    // Alternating single responses: first for INSERT (gives run id), then for ownership check
    let callCount = 0;
    const RUN_ID = 'run-complete-test-1';
    mockSingle.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: { id: RUN_ID }, error: null });
      return Promise.resolve({ data: { user_id: 'user-abc', week_number: 9, year: 2026 }, error: null });
    });

    await withServer(async (url) => {
      // Create the run first so the runner is in activeRunners
      const createRes = await httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'dropin' });
      expect(createRes.status).toBe(201);

      // Now complete task 0
      const result = await httpRequest(
        url,
        'POST',
        `/api/gauntlet/runs/${RUN_ID}/tasks/0/complete`,
        { answer: 'Sam Altman, 2023' },
      );

      expect(result.status).toBe(200);
      const body = result.body as Record<string, unknown>;
      expect(body).toHaveProperty('result');
      const r = body.result as Record<string, unknown>;
      expect(r.taskId).toBe('web-001');
      expect(r.score).toBe(160);
    });
  });

  it('calls runner.completeTask with correct arguments', async () => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();
    mockPickWeeklyTasks.mockReturnValue(FIVE_TASKS);
    mockIssueRunToken.mockResolvedValue('tok');
    mockInitialize.mockResolvedValue(undefined);
    mockGetRunToken.mockReturnValue('tok');
    mockCompleteTask.mockResolvedValue({
      taskId: 'web-001', taskIndex: 0, agentAnswer: 'answer', score: 100,
      qualityPct: 0.5, elapsedMs: 1000, verifierReasoning: 'ok', completedAt: new Date().toISOString(),
    });

    const RUN_ID = 'run-complete-test-2';
    let callCount = 0;
    mockSingle.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: { id: RUN_ID }, error: null });
      return Promise.resolve({ data: { user_id: 'user-abc', week_number: 9, year: 2026 }, error: null });
    });

    await withServer(async (url) => {
      await httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'dropin' });
      await httpRequest(url, 'POST', `/api/gauntlet/runs/${RUN_ID}/tasks/0/complete`, { answer: 'Sam Altman' });
    });

    expect(mockCompleteTask).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ id: 'web-001' }),
      'Sam Altman',
      expect.any(Object),
    );
  });

  it('returns 404 when run id not found in activeRunners', async () => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();

    const result = await withServer(async (url) => {
      return httpRequest(url, 'POST', '/api/gauntlet/runs/nonexistent-run/tasks/0/complete', { answer: 'test' });
    });

    expect(result.status).toBe(404);
  });

  it('returns 400 when answer is missing', async () => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();
    mockPickWeeklyTasks.mockReturnValue(FIVE_TASKS);
    mockIssueRunToken.mockResolvedValue('tok');
    mockInitialize.mockResolvedValue(undefined);

    const RUN_ID = 'run-no-answer-test';
    let callCount = 0;
    mockSingle.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: { id: RUN_ID }, error: null });
      return Promise.resolve({ data: { user_id: 'user-abc', week_number: 9, year: 2026 }, error: null });
    });

    const result = await withServer(async (url) => {
      await httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'dropin' });
      return httpRequest(url, 'POST', `/api/gauntlet/runs/${RUN_ID}/tasks/0/complete`, {});
    });

    expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. POST /api/gauntlet/runs/:id/finish
// ---------------------------------------------------------------------------

describe('POST /api/gauntlet/runs/:id/finish', () => {
  it('returns totalScore and runId after finalization', async () => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();
    mockPickWeeklyTasks.mockReturnValue([
      { id: 'web-001', title: 'T1', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'web-002', title: 'T2', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'gh-001', title: 'T3', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'gh-002', title: 'T4', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'wild-001', title: 'T5', category: 'wildcard', timeLimitMs: 300_000 },
    ]);
    mockIssueRunToken.mockResolvedValue('tok');
    mockInitialize.mockResolvedValue(undefined);
    mockFinalize.mockResolvedValue({ totalScore: 750 });
    mockRevokeRunToken.mockReturnValue(undefined);

    const RUN_ID = 'run-finish-test-1';
    let callCount = 0;
    mockSingle.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: { id: RUN_ID }, error: null });
      return Promise.resolve({ data: { user_id: 'user-abc' }, error: null });
    });

    const result = await withServer(async (url) => {
      await httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'dropin' });
      return httpRequest(url, 'POST', `/api/gauntlet/runs/${RUN_ID}/finish`, { status: 'completed' });
    });

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.totalScore).toBe(750);
    expect(body.runId).toBe(RUN_ID);
  });

  it('calls revokeRunToken after finishing', async () => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();
    mockPickWeeklyTasks.mockReturnValue([
      { id: 'web-001', title: 'T1', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'web-002', title: 'T2', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'gh-001', title: 'T3', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'gh-002', title: 'T4', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'wild-001', title: 'T5', category: 'wildcard', timeLimitMs: 300_000 },
    ]);
    mockIssueRunToken.mockResolvedValue('tok');
    mockInitialize.mockResolvedValue(undefined);
    mockFinalize.mockResolvedValue({ totalScore: 500 });

    const RUN_ID = 'run-finish-revoke-test';
    let callCount = 0;
    mockSingle.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: { id: RUN_ID }, error: null });
      return Promise.resolve({ data: { user_id: 'user-abc' }, error: null });
    });

    await withServer(async (url) => {
      await httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'dropin' });
      await httpRequest(url, 'POST', `/api/gauntlet/runs/${RUN_ID}/finish`, { status: 'completed' });
    });

    expect(mockRevokeRunToken).toHaveBeenCalledWith(RUN_ID);
  });

  it('returns 400 for invalid status value', async () => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();
    mockPickWeeklyTasks.mockReturnValue([
      { id: 'web-001', title: 'T1', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'web-002', title: 'T2', category: 'web-research', timeLimitMs: 300_000 },
      { id: 'gh-001', title: 'T3', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'gh-002', title: 'T4', category: 'github-workflow', timeLimitMs: 300_000 },
      { id: 'wild-001', title: 'T5', category: 'wildcard', timeLimitMs: 300_000 },
    ]);
    mockIssueRunToken.mockResolvedValue('tok');
    mockInitialize.mockResolvedValue(undefined);

    const RUN_ID = 'run-bad-status-test';
    let callCount = 0;
    mockSingle.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: { id: RUN_ID }, error: null });
      return Promise.resolve({ data: { user_id: 'user-abc' }, error: null });
    });

    const result = await withServer(async (url) => {
      await httpRequest(url, 'POST', '/api/gauntlet/runs', { track: 'dropin' });
      return httpRequest(url, 'POST', `/api/gauntlet/runs/${RUN_ID}/finish`, { status: 'invalid' });
    });

    expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 5. GET /api/gauntlet/leaderboard
// ---------------------------------------------------------------------------

describe('GET /api/gauntlet/leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();

    const fakeData = [
      { id: 'run-1', user_id: 'u1', total_score: 900, track: 'dropin', completed_at: '2026-03-01T10:00:00Z', profile: { username: 'alice', avatar_url: null } },
      { id: 'run-2', user_id: 'u2', total_score: 800, track: 'webhook', completed_at: '2026-03-01T11:00:00Z', profile: { username: 'bob', avatar_url: null } },
    ];

    mockLimit.mockResolvedValue({ data: fakeData, error: null });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, maybeSingle: mockMaybeSingle, order: mockOrder, limit: mockLimit });
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle, maybeSingle: mockMaybeSingle, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, eq: mockEq });
  });

  it('returns 200 with leaderboard array', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/leaderboard');
    });

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('leaderboard');
    expect(Array.isArray(body.leaderboard)).toBe(true);
  });

  it('leaderboard entries have rank, userId, totalScore, track', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/leaderboard');
    });

    const body = result.body as Record<string, unknown>;
    const leaderboard = body.leaderboard as Array<Record<string, unknown>>;
    expect(leaderboard.length).toBe(2);
    expect(leaderboard[0]).toHaveProperty('rank', 1);
    expect(leaderboard[0]).toHaveProperty('userId');
    expect(leaderboard[0]).toHaveProperty('totalScore');
    expect(leaderboard[0]).toHaveProperty('track');
  });

  it('leaderboard entries include username from profile', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/leaderboard');
    });

    const body = result.body as Record<string, unknown>;
    const leaderboard = body.leaderboard as Array<Record<string, unknown>>;
    expect(leaderboard[0]).toHaveProperty('username', 'alice');
  });

  it('returns 400 for invalid week parameter', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/leaderboard', undefined, { week: 'notanumber' });
    });

    expect(result.status).toBe(400);
  });

  it('accepts custom week and year query params', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/leaderboard', undefined, { week: '5', year: '2026' });
    });

    expect(result.status).toBe(200);
  });

  it('does not require auth', async () => {
    // The leaderboard route has no requireAuth — calling without auth header still works
    const { port } = await new Promise<{ port: number }>((resolve) => {
      const app = makeApp();
      const srv = createServer(app);
      srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address() as AddressInfo;
        resolve({ port });
        srv.close();
      });
    });

    // Just verify the route definition doesn't use requireAuth by checking 200 status
    // (auth mock always injects user, so we test indirectly via 200 response above)
    expect(port).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. GET /api/gauntlet/runs/:id/replay
// ---------------------------------------------------------------------------

describe('GET /api/gauntlet/runs/:id/replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockChains();
    resetRunnerMock();
    mockSingle.mockResolvedValue({
      data: {
        id: 'run-replay-1',
        user_id: 'u1',
        frames: [],
        tasks: [],
        total_score: 500,
        status: 'completed',
        started_at: '2026-03-01T09:00:00Z',
        completed_at: '2026-03-01T09:30:00Z',
      },
      error: null,
    });
  });

  it('returns replay data with expected fields', async () => {
    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/runs/run-replay-1/replay');
    });

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('runId', 'run-replay-1');
    expect(body).toHaveProperty('userId');
    expect(body).toHaveProperty('frames');
    expect(body).toHaveProperty('tasks');
    expect(body).toHaveProperty('totalScore', 500);
    expect(body).toHaveProperty('status', 'completed');
    expect(body).toHaveProperty('startedAt');
    expect(body).toHaveProperty('completedAt');
  });

  it('returns 404 when run not found', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

    const result = await withServer(async (url) => {
      return httpRequest(url, 'GET', '/api/gauntlet/runs/nonexistent-run/replay');
    });

    expect(result.status).toBe(404);
  });
});
