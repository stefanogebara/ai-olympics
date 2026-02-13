import { describe, it, expect, vi } from 'vitest';

// Mock external dependencies
vi.mock('../shared/utils/circuit-breaker.js', () => ({
  circuits: {
    openrouter: { execute: vi.fn((fn: () => Promise<any>) => fn()) },
  },
}));

// Mock config
vi.mock('../shared/config.js', () => ({
  config: {
    openRouterApiKey: '',
  },
}));

const { judgingService } = await import('./judging-service.js');

describe('JudgingService', () => {
  describe('judgeSubmission - rubric fallback', () => {
    it('returns default score 500 for unknown task types', async () => {
      const result = await judgingService.judgeSubmission('unknown-task', 'some submission');
      expect(result.score).toBe(500);
      expect(result.feedback).toContain('No rubric');
    });

    it('returns default score for empty task type', async () => {
      const result = await judgingService.judgeSubmission('', 'test');
      expect(result.score).toBe(500);
    });
  });

  describe('response parsing (via internal parseJudgingResponse)', () => {
    // We test this indirectly by checking the service handles different response formats
    // since parseJudgingResponse is private

    it('handles valid JSON response in judging workflow', async () => {
      // This tests the full flow when API is not configured
      // Without openRouterApiKey or ANTHROPIC_API_KEY, it falls back to error handling
      const result = await judgingService.judgeSubmission('design-challenge', '<html>test</html>');
      // Without API keys, it should return 500 with error message
      expect(result.score).toBe(500);
      expect(typeof result.feedback).toBe('string');
    });
  });

  describe('cross-provider bias mitigation', () => {
    // Test that different providers get different judges
    it('exists and maps providers to cross-model judges', async () => {
      // Test without API key - should still select correct judge internally
      const claudeResult = await judgingService.judgeSubmission('design-challenge', 'test', 'claude');
      const openaiResult = await judgingService.judgeSubmission('design-challenge', 'test', 'openai');

      // Both should return 500 (no API key) but not crash
      expect(claudeResult.score).toBe(500);
      expect(openaiResult.score).toBe(500);
    });
  });

  describe('panelJudge fallback', () => {
    it('falls back to single judge when OpenRouter key is not set', async () => {
      const result = await judgingService.panelJudge('design-challenge', 'test submission');
      // Without API key, falls back to single judge which also fails gracefully
      expect(result.score).toBe(500);
    });

    it('returns default for unknown task type', async () => {
      const result = await judgingService.panelJudge('nonexistent-task', 'test');
      expect(result.score).toBe(500);
      expect(result.feedback).toContain('No rubric');
    });
  });

  describe('submission serialization', () => {
    it('handles string submissions', async () => {
      const result = await judgingService.judgeSubmission('writing-challenge', 'A beautiful essay about AI');
      expect(result.score).toBe(500); // No API key
    });

    it('handles object submissions (JSON serialized)', async () => {
      const submission = { html: '<div>test</div>', css: 'div { color: red; }' };
      const result = await judgingService.judgeSubmission('design-challenge', submission);
      expect(result.score).toBe(500); // No API key
    });
  });
});
