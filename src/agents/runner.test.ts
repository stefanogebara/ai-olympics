import { describe, it, expect, vi } from 'vitest';
import { isUrlAllowed, isNavigateUrlAllowed, AgentRunner, validateToolArgs } from './runner.js';

describe('isUrlAllowed - SSRF Protection', () => {
  describe('allowed URLs', () => {
    it('allows regular HTTPS URLs', () => {
      expect(isUrlAllowed('https://api.polymarket.com/markets')).toEqual({ allowed: true });
    });

    it('allows regular HTTP URLs', () => {
      expect(isUrlAllowed('http://example.com/api')).toEqual({ allowed: true });
    });

    it('allows URLs with paths and query params', () => {
      expect(isUrlAllowed('https://kalshi.com/api/v2/markets?limit=50')).toEqual({ allowed: true });
    });

    it('allows localhost on API port (agents need their own API)', () => {
      // Default config.port is 3003
      const result = isUrlAllowed('http://localhost:3003/api/predictions/events');
      expect(result.allowed).toBe(true);
    });
  });

  describe('blocked protocols', () => {
    it('blocks file:// protocol', () => {
      const result = isUrlAllowed('file:///etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('protocol');
    });

    it('blocks ftp:// protocol', () => {
      const result = isUrlAllowed('ftp://internal-server/data');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('protocol');
    });

    it('blocks javascript: protocol', () => {
      const result = isUrlAllowed('javascript:alert(1)');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('protocol');
    });

    it('blocks data: protocol', () => {
      const result = isUrlAllowed('data:text/html,<h1>hi</h1>');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('protocol');
    });
  });

  describe('blocked hosts', () => {
    it('blocks localhost without API port', () => {
      const result = isUrlAllowed('http://localhost:8080/admin');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('localhost');
    });

    it('blocks 127.0.0.1 on non-API ports', () => {
      const result = isUrlAllowed('http://127.0.0.1:22/ssh');
      expect(result.allowed).toBe(false);
    });

    it('blocks IPv6 loopback', () => {
      const result = isUrlAllowed('http://[::1]:8080/');
      expect(result.allowed).toBe(false);
    });

    it('blocks 0.0.0.0', () => {
      const result = isUrlAllowed('http://0.0.0.0:9090/metrics');
      expect(result.allowed).toBe(false);
    });
  });

  describe('blocked cloud metadata endpoints', () => {
    it('blocks AWS metadata endpoint (169.254.169.254)', () => {
      const result = isUrlAllowed('http://169.254.169.254/latest/meta-data/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('metadata');
    });

    it('blocks GCP metadata endpoint', () => {
      const result = isUrlAllowed('http://metadata.google.internal/computeMetadata/v1/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('metadata');
    });
  });

  describe('blocked private IP ranges', () => {
    it('blocks 10.x.x.x (Class A private)', () => {
      const result = isUrlAllowed('http://10.0.0.1/internal');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private');
    });

    it('blocks 172.16-31.x.x (Class B private)', () => {
      expect(isUrlAllowed('http://172.16.0.1/api').allowed).toBe(false);
      expect(isUrlAllowed('http://172.31.255.255/api').allowed).toBe(false);
    });

    it('does not block 172.32.x.x (not private)', () => {
      // 172.32.0.0 is NOT in the private range
      expect(isUrlAllowed('http://172.32.0.1/api').allowed).toBe(true);
    });

    it('blocks 192.168.x.x (Class C private)', () => {
      const result = isUrlAllowed('http://192.168.1.1/router');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private');
    });

    it('blocks 169.254.x.x (link-local)', () => {
      const result = isUrlAllowed('http://169.254.1.1/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private');
    });
  });

  describe('invalid URLs', () => {
    it('rejects completely invalid URLs', () => {
      const result = isUrlAllowed('not-a-url');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid');
    });

    it('rejects empty string', () => {
      const result = isUrlAllowed('');
      expect(result.allowed).toBe(false);
    });
  });
});

describe('isNavigateUrlAllowed - Navigate URL Validation', () => {
  describe('allowed URLs', () => {
    it('allows regular HTTPS URLs', () => {
      expect(isNavigateUrlAllowed('https://example.com/page')).toEqual({ allowed: true });
    });

    it('allows regular HTTP URLs', () => {
      expect(isNavigateUrlAllowed('http://example.com/page')).toEqual({ allowed: true });
    });

    it('allows localhost (tasks are served locally)', () => {
      expect(isNavigateUrlAllowed('http://localhost:3002/tasks/my-task')).toEqual({ allowed: true });
    });

    it('allows localhost on any port', () => {
      expect(isNavigateUrlAllowed('http://localhost:8080/app')).toEqual({ allowed: true });
    });

    it('allows 127.0.0.1 (loopback for local tasks)', () => {
      expect(isNavigateUrlAllowed('http://127.0.0.1:3002/tasks')).toEqual({ allowed: true });
    });
  });

  describe('blocked protocols', () => {
    it('blocks file:// protocol', () => {
      const result = isNavigateUrlAllowed('file:///etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('protocol');
    });

    it('blocks javascript: protocol', () => {
      const result = isNavigateUrlAllowed('javascript:alert(1)');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('protocol');
    });

    it('blocks data: protocol', () => {
      const result = isNavigateUrlAllowed('data:text/html,<h1>hi</h1>');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('protocol');
    });

    it('blocks ftp:// protocol', () => {
      const result = isNavigateUrlAllowed('ftp://internal-server/data');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('protocol');
    });
  });

  describe('blocked private IPs', () => {
    it('blocks 10.x.x.x (Class A private)', () => {
      const result = isNavigateUrlAllowed('http://10.0.0.1/internal');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private');
    });

    it('blocks 172.16-31.x.x (Class B private)', () => {
      expect(isNavigateUrlAllowed('http://172.16.0.1/api').allowed).toBe(false);
      expect(isNavigateUrlAllowed('http://172.31.255.255/api').allowed).toBe(false);
    });

    it('blocks 192.168.x.x (Class C private)', () => {
      const result = isNavigateUrlAllowed('http://192.168.1.1/router');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private');
    });

    it('blocks 169.254.x.x (link-local)', () => {
      const result = isNavigateUrlAllowed('http://169.254.1.1/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private');
    });
  });

  describe('blocked cloud metadata endpoints', () => {
    it('blocks AWS metadata endpoint (169.254.169.254)', () => {
      const result = isNavigateUrlAllowed('http://169.254.169.254/latest/meta-data/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('metadata');
    });

    it('blocks GCP metadata endpoint', () => {
      const result = isNavigateUrlAllowed('http://metadata.google.internal/computeMetadata/v1/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('metadata');
    });
  });

  describe('invalid URLs', () => {
    it('rejects completely invalid URLs', () => {
      const result = isNavigateUrlAllowed('not-a-url');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid');
    });

    it('rejects empty string', () => {
      const result = isNavigateUrlAllowed('');
      expect(result.allowed).toBe(false);
    });
  });
});

describe('AgentRunner - Cost Tracking', () => {
  function createRunner() {
    return new AgentRunner({
      id: 'test-agent',
      name: 'Test Agent',
      model: 'claude-opus-4-6',
      provider: 'claude',
    } as any);
  }

  it('starts with zero cost', () => {
    const runner = createRunner();
    const stats = runner.getCostStats();
    expect(stats.totalCost).toBe(0);
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
  });

  it('accumulates token usage', () => {
    const runner = createRunner();
    runner.trackTokenUsage(1000, 500);
    const stats = runner.getCostStats();
    expect(stats.inputTokens).toBe(1000);
    expect(stats.outputTokens).toBe(500);
    expect(stats.totalCost).toBeGreaterThan(0);
  });

  it('accumulates across multiple calls', () => {
    const runner = createRunner();
    runner.trackTokenUsage(1000, 500);
    runner.trackTokenUsage(2000, 1000);
    const stats = runner.getCostStats();
    expect(stats.inputTokens).toBe(3000);
    expect(stats.outputTokens).toBe(1500);
  });

  it('detects budget exceeded', () => {
    const runner = createRunner();
    expect(runner.isBudgetExceeded()).toBe(false);
    // Opus rate: input=$0.015/1K, output=$0.075/1K
    // $5 budget => ~66K output tokens at $0.075/1K
    runner.trackTokenUsage(0, 70000);
    expect(runner.isBudgetExceeded()).toBe(true);
  });

  it('shows correct budget remaining', () => {
    const runner = createRunner();
    runner.trackTokenUsage(1000, 0);
    // 1K input tokens at $0.015/1K = $0.015
    const stats = runner.getCostStats();
    expect(stats.budgetRemaining).toBeLessThan(5.0);
    expect(stats.budgetRemaining).toBeGreaterThan(4.9);
  });
});

describe('validateToolArgs - Argument Validation', () => {
  describe('navigate', () => {
    it('accepts valid URL string', () => {
      expect(validateToolArgs('navigate', { url: 'https://example.com' })).toBeNull();
    });

    it('rejects missing url', () => {
      expect(validateToolArgs('navigate', {})).toContain('url');
    });

    it('rejects non-string url', () => {
      expect(validateToolArgs('navigate', { url: 123 })).toContain('string');
    });

    it('rejects extremely long url', () => {
      expect(validateToolArgs('navigate', { url: 'x'.repeat(20000) })).toContain('too long');
    });
  });

  describe('click', () => {
    it('accepts valid element', () => {
      expect(validateToolArgs('click', { element: 'Submit' })).toBeNull();
    });

    it('rejects missing element', () => {
      expect(validateToolArgs('click', {})).toContain('element');
    });
  });

  describe('type', () => {
    it('accepts valid element and text', () => {
      expect(validateToolArgs('type', { element: 'Username', text: 'hello' })).toBeNull();
    });

    it('rejects missing text', () => {
      expect(validateToolArgs('type', { element: 'Username' })).toContain('text');
    });

    it('rejects non-string text', () => {
      expect(validateToolArgs('type', { element: 'Username', text: 42 })).toContain('string');
    });
  });

  describe('scroll', () => {
    it('accepts valid direction', () => {
      expect(validateToolArgs('scroll', { direction: 'down' })).toBeNull();
    });

    it('rejects invalid direction', () => {
      expect(validateToolArgs('scroll', { direction: 'diagonal' })).toContain('Invalid');
    });

    it('rejects non-number amount', () => {
      expect(validateToolArgs('scroll', { direction: 'down', amount: 'fast' })).toContain('number');
    });
  });

  describe('api_call', () => {
    it('accepts valid GET call', () => {
      expect(validateToolArgs('api_call', { url: 'https://api.example.com', method: 'GET' })).toBeNull();
    });

    it('accepts valid POST call with body', () => {
      expect(validateToolArgs('api_call', { url: 'https://api.example.com', method: 'POST', body: '{}' })).toBeNull();
    });

    it('rejects missing url', () => {
      expect(validateToolArgs('api_call', { method: 'GET' })).toContain('url');
    });

    it('rejects non-string body', () => {
      expect(validateToolArgs('api_call', { url: 'https://x.com', body: { key: 'val' } })).toContain('string');
    });
  });

  describe('done', () => {
    it('always accepts', () => {
      expect(validateToolArgs('done', { success: true })).toBeNull();
      expect(validateToolArgs('done', {})).toBeNull();
    });
  });

  describe('general', () => {
    it('rejects null args', () => {
      expect(validateToolArgs('click', null as any)).toContain('object');
    });

    it('rejects array args', () => {
      expect(validateToolArgs('click', [] as any)).toContain('object');
    });
  });
});
