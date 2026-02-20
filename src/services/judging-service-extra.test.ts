/**
 * Extra coverage tests for JudgingService.
 *
 * Targets uncovered lines 248-350, 361-391 (parseJudgingResponse,
 * judgeSubmission branches, panelJudge).
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock variables – vi.mock factories are hoisted above all other code,
// so any variables they reference must also be hoisted via vi.hoisted().
// ---------------------------------------------------------------------------

const { mockAnthropicCreate, mockConfig, mockCircuitExecute } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn(),
  mockConfig: { openRouterApiKey: 'test-or-key' },
  mockCircuitExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}));

vi.mock('../shared/config.js', () => ({
  config: mockConfig,
}));

vi.mock('../shared/utils/circuit-breaker.js', () => ({
  circuits: {
    openrouter: {
      execute: mockCircuitExecute,
    },
  },
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import the singleton AFTER mocks are in place
// ---------------------------------------------------------------------------

import { judgingService } from './judging-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Response for global.fetch */
function mockFetchResponse(
  body: Record<string, unknown>,
  ok = true,
  status = 200,
): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

/** Convenience: a valid OpenRouter response carrying the given text */
function openRouterOk(text: string): Response {
  return mockFetchResponse({
    choices: [{ message: { content: text } }],
  });
}

/** A well-formed judge JSON string */
const VALID_JUDGE_JSON = JSON.stringify({
  score: 750,
  breakdown: { visual_quality: 300, code_quality: 200, completeness: 150, responsiveness: 100 },
  feedback: 'Solid submission with good visual appeal.',
});

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('JudgingService', () => {
  let fetchSpy: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: OpenRouter key is present
    mockConfig.openRouterApiKey = 'test-or-key';

    // Default fetch mock returning a valid judging response
    fetchSpy = vi.fn().mockResolvedValue(openRouterOk(VALID_JUDGE_JSON));
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchSpy);
  });

  // =========================================================================
  // getJudgeForCompetitor (tested indirectly through judgeSubmission)
  // =========================================================================
  describe('getJudgeForCompetitor (via judgeSubmission)', () => {
    it('routes claude submissions to openai/gpt-4.1', async () => {
      await judgingService.judgeSubmission('design-challenge', '<div>test</div>', 'claude');

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('openai/gpt-4.1');
    });

    it('routes openai submissions to anthropic/claude-sonnet', async () => {
      await judgingService.judgeSubmission('design-challenge', '<div>test</div>', 'openai');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.model).toBe('anthropic/claude-sonnet-4-5-20250929');
    });

    it('routes gemini submissions to anthropic/claude-sonnet', async () => {
      await judgingService.judgeSubmission('design-challenge', '<div>test</div>', 'gemini');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.model).toBe('anthropic/claude-sonnet-4-5-20250929');
    });

    it('routes llama submissions to openai/gpt-4.1', async () => {
      await judgingService.judgeSubmission('design-challenge', '<div>test</div>', 'llama');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.model).toBe('openai/gpt-4.1');
    });

    it('routes mistral submissions to anthropic/claude-sonnet', async () => {
      await judgingService.judgeSubmission('design-challenge', '<div>test</div>', 'mistral');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.model).toBe('anthropic/claude-sonnet-4-5-20250929');
    });

    it('uses DEFAULT_JUDGE for unknown provider', async () => {
      // Cast to any to pass an unlisted provider string
      await judgingService.judgeSubmission('design-challenge', '<div>test</div>', 'deepseek' as any);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.model).toBe('anthropic/claude-sonnet-4-5-20250929');
    });

    it('uses DEFAULT_JUDGE when provider is undefined', async () => {
      await judgingService.judgeSubmission('design-challenge', '<div>test</div>');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.model).toBe('anthropic/claude-sonnet-4-5-20250929');
    });
  });

  // =========================================================================
  // parseJudgingResponse (tested indirectly through judgeSubmission)
  // =========================================================================
  describe('parseJudgingResponse (via judgeSubmission)', () => {
    it('parses valid JSON embedded in text', async () => {
      const wrappedJson = `Here is my evaluation:\n${VALID_JUDGE_JSON}\nThat is my assessment.`;
      fetchSpy.mockResolvedValueOnce(openRouterOk(wrappedJson));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(750);
      expect(result.feedback).toBe('Solid submission with good visual appeal.');
    });

    it('clamps score above 1000 to 1000', async () => {
      const json = JSON.stringify({ score: 1500, breakdown: {}, feedback: 'Perfect' });
      fetchSpy.mockResolvedValueOnce(openRouterOk(json));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(1000);
    });

    it('clamps score below 0 to 0', async () => {
      const json = JSON.stringify({ score: -50, breakdown: {}, feedback: 'Terrible' });
      fetchSpy.mockResolvedValueOnce(openRouterOk(json));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(0);
    });

    it('rounds fractional scores', async () => {
      const json = JSON.stringify({ score: 749.7, breakdown: {}, feedback: 'Good' });
      fetchSpy.mockResolvedValueOnce(openRouterOk(json));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(750);
    });

    it('returns default score 500 for non-JSON response text', async () => {
      fetchSpy.mockResolvedValueOnce(openRouterOk('I cannot evaluate this submission.'));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(500);
      expect(result.feedback).toBe('Failed to parse judge response.');
    });

    it('returns default score 500 for malformed JSON', async () => {
      fetchSpy.mockResolvedValueOnce(openRouterOk('{ broken json: }'));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(500);
    });
  });

  // =========================================================================
  // judgeSubmission
  // =========================================================================
  describe('judgeSubmission', () => {
    it('returns default score 500 for unknown task type', async () => {
      const result = await judgingService.judgeSubmission('nonexistent-task', 'test');

      expect(result.score).toBe(500);
      expect(result.breakdown).toEqual({});
      expect(result.feedback).toBe('No rubric available for this task type.');
      // Should NOT have called fetch at all
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('includes rubric in the prompt sent to judge', async () => {
      await judgingService.judgeSubmission('design-challenge', 'my html submission');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const prompt = body.messages[0].content;
      expect(prompt).toContain('VISUAL QUALITY');
      expect(prompt).toContain('my html submission');
    });

    it('stringifies non-string submissions', async () => {
      const objectSubmission = { html: '<div>Hello</div>', css: 'body { color: red; }' };
      await judgingService.judgeSubmission('design-challenge', objectSubmission);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const prompt = body.messages[0].content;
      expect(prompt).toContain('"html": "<div>Hello</div>"');
    });

    it('passes string submissions directly', async () => {
      await judgingService.judgeSubmission('design-challenge', '<div>raw html</div>');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const prompt = body.messages[0].content;
      expect(prompt).toContain('<div>raw html</div>');
    });

    it('routes through OpenRouter when openRouterApiKey exists', async () => {
      mockConfig.openRouterApiKey = 'test-or-key';

      await judgingService.judgeSubmission('design-challenge', 'test');

      expect(fetchSpy).toHaveBeenCalled();
      const url = fetchSpy.mock.calls[0][0];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    });

    it('returns parsed score on success', async () => {
      const result = await judgingService.judgeSubmission('design-challenge', 'test');

      expect(result.score).toBe(750);
      expect(result.breakdown).toEqual({
        visual_quality: 300,
        code_quality: 200,
        completeness: 150,
        responsiveness: 100,
      });
      expect(result.feedback).toBe('Solid submission with good visual appeal.');
    });

    it('sets judgeModel on successful result', async () => {
      const result = await judgingService.judgeSubmission('design-challenge', 'test');

      expect(result.judgeModel).toBe('anthropic/claude-sonnet-4-5-20250929');
    });

    it('sets judgeModel based on competitor provider', async () => {
      const result = await judgingService.judgeSubmission('design-challenge', 'test', 'claude');

      expect(result.judgeModel).toBe('openai/gpt-4.1');
    });

    it('returns default score 500 when parsing fails', async () => {
      fetchSpy.mockResolvedValueOnce(openRouterOk('no json here'));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(500);
      expect(result.feedback).toBe('Failed to parse judge response.');
    });

    it('returns default score 500 on API error (fetch throws)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(500);
      expect(result.feedback).toBe('Judging service encountered an error.');
    });

    it('returns default score 500 on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ error: 'rate limited' }, false, 429),
      );

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(500);
      expect(result.feedback).toBe('Judging service encountered an error.');
    });

    it('works with writing-challenge rubric', async () => {
      const json = JSON.stringify({
        score: 820,
        breakdown: { creativity: 250, persuasiveness: 270, grammar_style: 160, relevance: 140 },
        feedback: 'Well-written and persuasive.',
      });
      fetchSpy.mockResolvedValueOnce(openRouterOk(json));

      const result = await judgingService.judgeSubmission('writing-challenge', 'Product description text');
      expect(result.score).toBe(820);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain('CREATIVITY');
    });

    it('works with pitch-deck rubric', async () => {
      const json = JSON.stringify({
        score: 680,
        breakdown: { clarity: 200, persuasiveness: 200, completeness: 150, creativity: 130 },
        feedback: 'Clear pitch with room for improvement.',
      });
      fetchSpy.mockResolvedValueOnce(openRouterOk(json));

      const result = await judgingService.judgeSubmission('pitch-deck', 'Pitch content');
      expect(result.score).toBe(680);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain('CLARITY');
    });

    it('sends correct headers to OpenRouter', async () => {
      await judgingService.judgeSubmission('design-challenge', 'test');

      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer test-or-key');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['HTTP-Referer']).toBe('https://ai-olympics.vercel.app');
      expect(headers['X-Title']).toBe('AI Olympics Judging');
    });

    it('sends temperature 0.3 and max_tokens 1024', async () => {
      await judgingService.judgeSubmission('design-challenge', 'test');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(1024);
    });

    it('prompt includes submission delimiters', async () => {
      await judgingService.judgeSubmission('design-challenge', 'my content');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const prompt = body.messages[0].content;
      expect(prompt).toContain('--- SUBMISSION ---');
      expect(prompt).toContain('--- END SUBMISSION ---');
      expect(prompt).toContain('Return ONLY the JSON object');
    });

    it('handles empty choices array from OpenRouter', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ choices: [] }));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      // Empty content -> parse fails -> default
      expect(result.score).toBe(500);
    });

    it('handles circuit breaker execution', async () => {
      await judgingService.judgeSubmission('design-challenge', 'test');

      // Verify the circuit breaker was called
      expect(mockCircuitExecute).toHaveBeenCalled();
    });

    it('handles non-Error thrown objects in catch block', async () => {
      // Covers the String(error) branch on line 320
      fetchSpy.mockRejectedValueOnce('raw string error');

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(500);
      expect(result.feedback).toBe('Judging service encountered an error.');
    });
  });

  // =========================================================================
  // callAnthropicJudge (tested via judgeSubmission with no openRouterApiKey)
  // =========================================================================
  describe('callAnthropicJudge (via judgeSubmission without openRouterApiKey)', () => {
    beforeEach(() => {
      mockConfig.openRouterApiKey = '';
    });

    it('uses Anthropic client when no openRouterApiKey', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: VALID_JUDGE_JSON }],
      });

      const result = await judgingService.judgeSubmission('design-challenge', 'test');

      expect(mockAnthropicCreate).toHaveBeenCalled();
      expect(result.score).toBe(750);
      // Should NOT call fetch (OpenRouter)
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('passes correct parameters to Anthropic client', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: VALID_JUDGE_JSON }],
      });

      await judgingService.judgeSubmission('design-challenge', 'test');

      const createCall = mockAnthropicCreate.mock.calls[0][0];
      expect(createCall.model).toBe('claude-sonnet-4-5-20250929');
      expect(createCall.max_tokens).toBe(1024);
      expect(createCall.messages[0].role).toBe('user');
    });

    it('returns empty string when Anthropic response has no text block', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'image', source: {} }],
      });

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      // Empty string -> parse fails -> default 500
      expect(result.score).toBe(500);
    });

    it('sets judgeModel to model name (not orModel) when using Anthropic', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: VALID_JUDGE_JSON }],
      });

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.judgeModel).toBe('claude-sonnet-4-5-20250929');
    });

    it('returns default on Anthropic error', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('Anthropic API error'));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(500);
      expect(result.feedback).toBe('Judging service encountered an error.');
    });

    it('uses different judge model for claude provider via Anthropic fallback', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: VALID_JUDGE_JSON }],
      });

      await judgingService.judgeSubmission('design-challenge', 'test', 'claude');

      const createCall = mockAnthropicCreate.mock.calls[0][0];
      // claude -> gpt-4.1 model name (though Anthropic can only call Claude models)
      expect(createCall.model).toBe('gpt-4.1');
    });
  });

  // =========================================================================
  // callOpenRouterJudge error paths
  // =========================================================================
  describe('callOpenRouterJudge error handling', () => {
    it('throws on non-ok response with error text', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      } as unknown as Response);

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      // Error is caught by judgeSubmission -> returns default
      expect(result.score).toBe(500);
      expect(result.feedback).toBe('Judging service encountered an error.');
    });

    it('handles fetch rejection', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('DNS failure'));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(500);
    });

    it('returns empty string when choices are missing', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ choices: null }));

      const result = await judgingService.judgeSubmission('design-challenge', 'test');
      expect(result.score).toBe(500);
    });
  });

  // =========================================================================
  // panelJudge
  // =========================================================================
  describe('panelJudge', () => {
    it('returns default for unknown task type', async () => {
      const result = await judgingService.panelJudge('nonexistent-task', 'test');

      expect(result.score).toBe(500);
      expect(result.feedback).toBe('No rubric available for this task type.');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falls back to judgeSubmission when no openRouterApiKey', async () => {
      mockConfig.openRouterApiKey = '';
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: VALID_JUDGE_JSON }],
      });

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // Should have gone through Anthropic (single judge fallback)
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
      expect(result.score).toBe(750);
    });

    it('runs 3 judges in parallel via fetch', async () => {
      const json1 = JSON.stringify({ score: 700, breakdown: {}, feedback: 'Good' });
      const json2 = JSON.stringify({ score: 750, breakdown: {}, feedback: 'Very good' });
      const json3 = JSON.stringify({ score: 800, breakdown: {}, feedback: 'Excellent' });

      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json1))
        .mockResolvedValueOnce(openRouterOk(json2))
        .mockResolvedValueOnce(openRouterOk(json3));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // 3 judges = 3 fetch calls
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      // Median of [700, 750, 800] = 750
      expect(result.score).toBe(750);
    });

    it('uses median score from 3 results', async () => {
      const json1 = JSON.stringify({ score: 600, breakdown: {}, feedback: 'Low' });
      const json2 = JSON.stringify({ score: 900, breakdown: {}, feedback: 'High' });
      const json3 = JSON.stringify({ score: 750, breakdown: {}, feedback: 'Mid' });

      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json1))
        .mockResolvedValueOnce(openRouterOk(json2))
        .mockResolvedValueOnce(openRouterOk(json3));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // Sorted: [600, 750, 900], median index = floor(3/2) = 1 -> 750
      expect(result.score).toBe(750);
    });

    it('returns default when all 3 judges fail', async () => {
      fetchSpy
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockRejectedValueOnce(new Error('fail3'));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      expect(result.score).toBe(500);
      expect(result.feedback).toBe('All panel judges failed.');
    });

    it('handles non-Error rejection reasons in panel judge failures', async () => {
      // Covers the String(r.reason) branch on line 379
      fetchSpy
        .mockRejectedValueOnce('string rejection')
        .mockRejectedValueOnce(42)
        .mockRejectedValueOnce(new Error('real error'));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      expect(result.score).toBe(500);
      expect(result.feedback).toBe('All panel judges failed.');
    });

    it('handles partial failure (1 judge fails, 2 succeed)', async () => {
      const json1 = JSON.stringify({ score: 700, breakdown: {}, feedback: 'Good' });
      const json2 = JSON.stringify({ score: 800, breakdown: {}, feedback: 'Great' });

      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json1))
        .mockRejectedValueOnce(new Error('judge 2 failed'))
        .mockResolvedValueOnce(openRouterOk(json2));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // Sorted: [700, 800], median index = floor(2/2) = 1 -> 800
      expect(result.score).toBe(800);
      expect(result.feedback).toContain('2/3 judges');
    });

    it('handles partial failure (2 judges fail, 1 succeeds)', async () => {
      const json = JSON.stringify({ score: 650, breakdown: { a: 1 }, feedback: 'Okay' });

      fetchSpy
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValueOnce(openRouterOk(json));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // Only 1 score: [650], median = 650
      expect(result.score).toBe(650);
      expect(result.feedback).toContain('1/3 judges');
    });

    it('includes panel info in feedback', async () => {
      const json1 = JSON.stringify({ score: 700, breakdown: {}, feedback: 'Good' });
      const json2 = JSON.stringify({ score: 750, breakdown: {}, feedback: 'Very good' });
      const json3 = JSON.stringify({ score: 800, breakdown: {}, feedback: 'Excellent' });

      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json1))
        .mockResolvedValueOnce(openRouterOk(json2))
        .mockResolvedValueOnce(openRouterOk(json3));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      expect(result.feedback).toContain('Panel judged');
      expect(result.feedback).toContain('3/3 judges');
      expect(result.feedback).toContain('Scores:');
      expect(result.judgeModel).toBe('panel (3 judges)');
    });

    it('sorts scores before picking median', async () => {
      // Provide scores in descending order to verify sorting
      const json1 = JSON.stringify({ score: 900, breakdown: {}, feedback: 'High' });
      const json2 = JSON.stringify({ score: 500, breakdown: {}, feedback: 'Low' });
      const json3 = JSON.stringify({ score: 700, breakdown: {}, feedback: 'Mid' });

      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json1))
        .mockResolvedValueOnce(openRouterOk(json2))
        .mockResolvedValueOnce(openRouterOk(json3));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // Sorted: [500, 700, 900], median at index 1 = 700
      expect(result.score).toBe(700);
    });

    it('uses correct panel judge models', async () => {
      const json = JSON.stringify({ score: 700, breakdown: {}, feedback: 'OK' });
      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json));

      await judgingService.panelJudge('design-challenge', 'test');

      const models = fetchSpy.mock.calls.map(
        (call: [string, RequestInit]) => JSON.parse(call[1].body as string).model,
      );
      expect(models).toContain('anthropic/claude-sonnet-4-5-20250929');
      expect(models).toContain('openai/gpt-4.1');
      expect(models).toContain('google/gemini-2.5-flash');
    });

    it('stringifies non-string submission in panel judging', async () => {
      const json = JSON.stringify({ score: 700, breakdown: {}, feedback: 'OK' });
      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json));

      await judgingService.panelJudge('design-challenge', { key: 'value' });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const prompt = body.messages[0].content;
      expect(prompt).toContain('"key": "value"');
    });

    it('handles judges returning unparseable responses', async () => {
      // Judge 1: valid, Judge 2: invalid JSON, Judge 3: valid
      const validJson = JSON.stringify({ score: 700, breakdown: {}, feedback: 'OK' });

      fetchSpy
        .mockResolvedValueOnce(openRouterOk(validJson))
        .mockResolvedValueOnce(openRouterOk('Not a JSON response at all'))
        .mockResolvedValueOnce(openRouterOk(validJson));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // 2 parseable results, both 700
      expect(result.score).toBe(700);
      expect(result.feedback).toContain('2/3 judges');
    });

    it('returns default when all judges return unparseable responses', async () => {
      fetchSpy
        .mockResolvedValueOnce(openRouterOk('bad response 1'))
        .mockResolvedValueOnce(openRouterOk('bad response 2'))
        .mockResolvedValueOnce(openRouterOk('bad response 3'));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      expect(result.score).toBe(500);
      expect(result.feedback).toBe('All panel judges failed.');
    });

    it('returns breakdown from median result', async () => {
      const json1 = JSON.stringify({ score: 600, breakdown: { a: 100 }, feedback: 'Low' });
      const json2 = JSON.stringify({ score: 750, breakdown: { a: 200 }, feedback: 'Mid' });
      const json3 = JSON.stringify({ score: 900, breakdown: { a: 300 }, feedback: 'High' });

      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json1))
        .mockResolvedValueOnce(openRouterOk(json2))
        .mockResolvedValueOnce(openRouterOk(json3));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // Median score 750 -> breakdown from that result
      expect(result.breakdown).toEqual({ a: 200 });
    });

    it('works with writing-challenge rubric', async () => {
      const json = JSON.stringify({
        score: 800,
        breakdown: { creativity: 250 },
        feedback: 'Creative writing',
      });
      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json));

      const result = await judgingService.panelJudge('writing-challenge', 'My product description');

      expect(result.score).toBe(800);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain('CREATIVITY');
    });

    it('works with pitch-deck rubric', async () => {
      const json = JSON.stringify({
        score: 680,
        breakdown: { clarity: 200 },
        feedback: 'Clear pitch',
      });
      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json));

      const result = await judgingService.panelJudge('pitch-deck', 'Startup pitch content');

      expect(result.score).toBe(680);
    });

    it('uses first parsedResult as fallback when median score has no exact match', async () => {
      // This scenario: median score doesn't exactly match any parsed result
      // It happens when scores are duplicated and the find doesn't locate exact median
      // In practice this is hard to trigger because median IS from the sorted scores
      // But test the general path: when 2 identical medians exist, uses the first
      const json1 = JSON.stringify({ score: 700, breakdown: { x: 1 }, feedback: 'A' });
      const json2 = JSON.stringify({ score: 700, breakdown: { x: 2 }, feedback: 'B' });
      const json3 = JSON.stringify({ score: 800, breakdown: { x: 3 }, feedback: 'C' });

      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json1))
        .mockResolvedValueOnce(openRouterOk(json2))
        .mockResolvedValueOnce(openRouterOk(json3));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // Sorted: [700, 700, 800], median = 700, finds first match
      expect(result.score).toBe(700);
    });

    it('panel prompt includes submission delimiters', async () => {
      const json = JSON.stringify({ score: 700, breakdown: {}, feedback: 'OK' });
      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json))
        .mockResolvedValueOnce(openRouterOk(json));

      await judgingService.panelJudge('design-challenge', 'my submission text');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const prompt = body.messages[0].content;
      expect(prompt).toContain('--- SUBMISSION ---');
      expect(prompt).toContain('my submission text');
      expect(prompt).toContain('--- END SUBMISSION ---');
    });

    it('includes sorted scores in feedback string', async () => {
      const json1 = JSON.stringify({ score: 800, breakdown: {}, feedback: 'H' });
      const json2 = JSON.stringify({ score: 600, breakdown: {}, feedback: 'L' });
      const json3 = JSON.stringify({ score: 700, breakdown: {}, feedback: 'M' });

      fetchSpy
        .mockResolvedValueOnce(openRouterOk(json1))
        .mockResolvedValueOnce(openRouterOk(json2))
        .mockResolvedValueOnce(openRouterOk(json3));

      const result = await judgingService.panelJudge('design-challenge', 'test');

      // After sorting: [600, 700, 800]
      expect(result.feedback).toContain('600, 700, 800');
    });
  });
});
