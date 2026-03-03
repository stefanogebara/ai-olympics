import { vi, describe, it, expect, beforeEach } from 'vitest';

// Shared mock create function — mutated per-test
const mockCreate = vi.fn();

// Mock config
vi.mock('../shared/config.js', () => ({
  config: {
    anthropicApiKey: 'test-anthropic-key',
  },
}));

// Mock Anthropic SDK — constructor returns an object with messages.create pointing to mockCreate
vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    return {
      messages: {
        create: mockCreate,
      },
    };
  }
  MockAnthropic.prototype = {};
  return { default: MockAnthropic };
});

// Stub global fetch for GitHub API tests
vi.stubGlobal('fetch', vi.fn());

import { runVerifier } from './gauntlet-verifier.js';
import type { GauntletTask } from './gauntlet-tasks.js';

// Helper to build a minimal GauntletTask
function makeTask(overrides: Partial<GauntletTask> = {}): GauntletTask {
  return {
    id: 'test-001',
    category: 'web-research',
    title: 'Test Task',
    prompt: 'Do something',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: 'Answer must contain "hello"',
    ...overrides,
  };
}

beforeEach(() => {
  mockCreate.mockReset();
  vi.mocked(fetch).mockReset();
});

// ---------------------------------------------------------------------------
// 1. runVerifier dispatches to LLM judge
// ---------------------------------------------------------------------------
describe('runVerifier — llm-judge dispatch', () => {
  it('calls Anthropic and returns parsed score', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"score": 0.9, "reasoning": "great answer"}' }],
    });

    const task = makeTask({ verifierType: 'llm-judge' });
    const result = await runVerifier(task, 'hello world');

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.score).toBe(0.9);
    expect(result.reasoning).toBe('great answer');
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. runVerifier dispatches to GitHub API verifier
// ---------------------------------------------------------------------------
describe('runVerifier — github-api dispatch', () => {
  it('calls GitHub API when token is provided', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

    const task = makeTask({
      verifierType: 'github-api',
      verifierConfig: { checkRepoExists: true },
    });

    const result = await runVerifier(
      task,
      'Repo created at https://github.com/testuser/my-repo',
      { githubToken: 'ghp_test' }
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
  });

  it('returns score 0 with "No GitHub token" when token is missing', async () => {
    const task = makeTask({
      verifierType: 'github-api',
      verifierConfig: { checkRepoExists: true },
    });

    const result = await runVerifier(task, 'some result', {});

    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('No GitHub token');
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. LLM judge: valid JSON → correct score / passed flag
// ---------------------------------------------------------------------------
describe('LLM judge — valid JSON response', () => {
  it('parses score 0.8 and sets passed=true', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"score": 0.8, "reasoning": "good"}' }],
    });

    const task = makeTask({ verifierType: 'llm-judge' });
    const result = await runVerifier(task, 'agent answer here');

    expect(result.score).toBe(0.8);
    expect(result.reasoning).toBe('good');
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. LLM judge: invalid JSON → score=0, passed=false
// ---------------------------------------------------------------------------
describe('LLM judge — invalid JSON response', () => {
  it('returns score=0 and passed=false when JSON is unparseable', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });

    const task = makeTask({ verifierType: 'llm-judge' });
    const result = await runVerifier(task, 'some agent result');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('Failed to parse');
  });
});

// ---------------------------------------------------------------------------
// 5. LLM judge: score > 1.0 is capped to 1.0
// ---------------------------------------------------------------------------
describe('LLM judge — score capping', () => {
  it('caps score above 1.0 to 1.0', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"score": 1.5, "reasoning": "perfect"}' }],
    });

    const task = makeTask({ verifierType: 'llm-judge' });
    const result = await runVerifier(task, 'agent result');

    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. GitHub verifier: checkRepoExists — 200 and 404 branches
// ---------------------------------------------------------------------------
describe('GitHub verifier — checkRepoExists', () => {
  it('returns score=1.0 when API returns 200', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

    const task = makeTask({
      verifierType: 'github-api',
      verifierConfig: { checkRepoExists: true },
    });

    const result = await runVerifier(
      task,
      'Check https://github.com/alice/my-repo for details',
      { githubToken: 'ghp_abc' }
    );

    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/alice/my-repo',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer ghp_abc' }) })
    );
  });

  it('returns score=0.0 when API returns 404', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

    const task = makeTask({
      verifierType: 'github-api',
      verifierConfig: { checkRepoExists: true },
    });

    const result = await runVerifier(
      task,
      'Repo at https://github.com/alice/nonexistent-repo',
      { githubToken: 'ghp_abc' }
    );

    expect(result.score).toBe(0.0);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('checkRepoExists');
    expect(result.reasoning).toContain('404');
  });
});

// ---------------------------------------------------------------------------
// 7. api-state verifier → score=0.5, passed=true
// ---------------------------------------------------------------------------
describe('runApiStateVerifier', () => {
  it('returns score=0.5 and passed=true', async () => {
    const task = makeTask({ verifierType: 'api-state' });
    const result = await runVerifier(task, 'some result');

    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('not yet implemented');
  });
});
