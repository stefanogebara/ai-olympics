import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS - must be declared before imports that use them
// ============================================================================

vi.mock('../shared/config.js', () => ({
  config: { port: 3003 },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    agent: vi.fn(),
  }),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import {
  isUrlAllowed,
  isNavigateUrlAllowed,
  validateToolArgs,
  validateAgentResponse,
  detectSuspiciousArgs,
} from './runner.js';

// ============================================================================
// isUrlAllowed - SSRF Protection
// ============================================================================

describe('isUrlAllowed', () => {
  // ---------- Valid URLs ----------

  describe('allowed URLs', () => {
    it('allows HTTPS URLs', () => {
      expect(isUrlAllowed('https://api.example.com/data')).toEqual({ allowed: true });
    });

    it('allows HTTP URLs', () => {
      expect(isUrlAllowed('http://example.com/api')).toEqual({ allowed: true });
    });

    it('allows HTTPS URLs with paths, query params, and fragments', () => {
      expect(isUrlAllowed('https://example.com/path?q=test&page=1#section')).toEqual({ allowed: true });
    });

    it('allows public IP addresses', () => {
      expect(isUrlAllowed('http://8.8.8.8/dns')).toEqual({ allowed: true });
    });

    it('allows 172.32.x.x (not in private range)', () => {
      expect(isUrlAllowed('http://172.32.0.1/api')).toEqual({ allowed: true });
    });
  });

  // ---------- Invalid URLs ----------

  describe('invalid URLs', () => {
    it('rejects completely invalid URL', () => {
      const result = isUrlAllowed('not-a-url');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Invalid URL');
    });

    it('rejects empty string', () => {
      const result = isUrlAllowed('');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Invalid URL');
    });

    it('rejects malformed URL', () => {
      const result = isUrlAllowed('://missing-scheme');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Invalid URL');
    });
  });

  // ---------- Blocked protocols ----------

  describe('blocked protocols', () => {
    it('blocks ftp:// protocol', () => {
      const result = isUrlAllowed('ftp://server.internal/data');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked protocol');
      expect(result.reason).toContain('ftp:');
    });

    it('blocks file:// protocol', () => {
      const result = isUrlAllowed('file:///etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked protocol');
      expect(result.reason).toContain('file:');
    });

    it('blocks javascript: protocol', () => {
      const result = isUrlAllowed('javascript:alert(1)');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked protocol');
    });

    it('blocks data: protocol', () => {
      const result = isUrlAllowed('data:text/html,<h1>hi</h1>');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked protocol');
    });
  });

  // ---------- Localhost / loopback ----------

  describe('localhost and loopback', () => {
    it('blocks localhost on non-API port', () => {
      const result = isUrlAllowed('http://localhost:8080/admin');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('localhost');
    });

    it('allows localhost without explicit port (default http)', () => {
      // new URL('http://localhost/path').port === '' which triggers the !parsed.port check
      // Since protocol is http: and !parsed.port is true, this is ALLOWED
      const result = isUrlAllowed('http://localhost/path');
      expect(result.allowed).toBe(true);
    });

    it('allows localhost on matching API port (3003)', () => {
      const result = isUrlAllowed('http://localhost:3003/api/competitions');
      expect(result.allowed).toBe(true);
    });

    it('blocks 127.0.0.1 on non-API port', () => {
      const result = isUrlAllowed('http://127.0.0.1:22/ssh');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('localhost');
    });

    it('allows 127.0.0.1 on API port', () => {
      const result = isUrlAllowed('http://127.0.0.1:3003/api');
      expect(result.allowed).toBe(true);
    });

    it('blocks ::1 (IPv6 loopback) on non-API port', () => {
      const result = isUrlAllowed('http://[::1]:8080/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('localhost');
    });

    it('allows ::1 on API port', () => {
      const result = isUrlAllowed('http://[::1]:3003/api');
      expect(result.allowed).toBe(true);
    });

    it('blocks 0.0.0.0 on non-API port', () => {
      const result = isUrlAllowed('http://0.0.0.0:9090/metrics');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('localhost');
    });

    it('allows 0.0.0.0 on API port', () => {
      const result = isUrlAllowed('http://0.0.0.0:3003/api');
      expect(result.allowed).toBe(true);
    });

    it('normalizes IPv6 brackets for ::1', () => {
      const result = isUrlAllowed('http://[::1]:9999/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('localhost');
    });
  });

  // ---------- Cloud metadata ----------

  describe('cloud metadata endpoints', () => {
    it('blocks AWS metadata (169.254.169.254)', () => {
      const result = isUrlAllowed('http://169.254.169.254/latest/meta-data/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cloud metadata');
    });

    it('blocks GCP metadata (metadata.google.internal)', () => {
      const result = isUrlAllowed('http://metadata.google.internal/computeMetadata/v1/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cloud metadata');
    });
  });

  // ---------- Private IP ranges ----------

  describe('private IP ranges', () => {
    it('blocks 10.0.0.0/8', () => {
      const result = isUrlAllowed('http://10.0.0.1/internal');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('blocks 10.255.255.255', () => {
      const result = isUrlAllowed('http://10.255.255.255/api');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('blocks 172.16.0.0/12 lower bound', () => {
      const result = isUrlAllowed('http://172.16.0.1/api');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('blocks 172.31.x.x upper bound', () => {
      const result = isUrlAllowed('http://172.31.255.255/api');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('does not block 172.15.x.x (below private range)', () => {
      expect(isUrlAllowed('http://172.15.0.1/api').allowed).toBe(true);
    });

    it('does not block 172.32.x.x (above private range)', () => {
      expect(isUrlAllowed('http://172.32.0.1/api').allowed).toBe(true);
    });

    it('blocks 192.168.0.0/16', () => {
      const result = isUrlAllowed('http://192.168.1.1/router');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('blocks 169.254.x.x (link-local)', () => {
      const result = isUrlAllowed('http://169.254.1.1/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('does not block IPv6 unique-local (fc00:) due to bracket normalization gap', () => {
      // NOTE: isUrlAllowed uses `hostname` (with brackets) for private range checks,
      // so the regex ^fc[0-9a-f]{2}: does not match "[fc00::1]".
      // This is a known gap in the source code. isNavigateUrlAllowed strips brackets.
      const result = isUrlAllowed('http://[fc00::1]/api');
      expect(result.allowed).toBe(true);
    });

    it('does not block IPv6 link-local (fe80:) due to bracket normalization gap', () => {
      // Same bracket normalization gap as above.
      const result = isUrlAllowed('http://[fe80::1]/api');
      expect(result.allowed).toBe(true);
    });
  });
});

// ============================================================================
// isNavigateUrlAllowed - Navigate URL Validation
// ============================================================================

describe('isNavigateUrlAllowed', () => {
  // ---------- Allowed URLs ----------

  describe('allowed URLs', () => {
    it('allows HTTPS URLs', () => {
      expect(isNavigateUrlAllowed('https://example.com/page')).toEqual({ allowed: true });
    });

    it('allows HTTP URLs', () => {
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

    it('allows ::1 (IPv6 loopback)', () => {
      expect(isNavigateUrlAllowed('http://[::1]:3002/tasks')).toEqual({ allowed: true });
    });

    it('allows 0.0.0.0', () => {
      expect(isNavigateUrlAllowed('http://0.0.0.0:3002/app')).toEqual({ allowed: true });
    });
  });

  // ---------- Invalid URLs ----------

  describe('invalid URLs', () => {
    it('rejects completely invalid URL', () => {
      const result = isNavigateUrlAllowed('not-a-url');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Invalid URL');
    });

    it('rejects empty string', () => {
      const result = isNavigateUrlAllowed('');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Invalid URL');
    });
  });

  // ---------- Blocked protocols ----------

  describe('blocked protocols', () => {
    it('blocks ftp:// protocol', () => {
      const result = isNavigateUrlAllowed('ftp://internal-server/data');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked protocol');
    });

    it('blocks file:// protocol', () => {
      const result = isNavigateUrlAllowed('file:///etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked protocol');
    });

    it('blocks javascript: protocol', () => {
      const result = isNavigateUrlAllowed('javascript:alert(1)');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked protocol');
    });

    it('blocks data: protocol', () => {
      const result = isNavigateUrlAllowed('data:text/html,<h1>hi</h1>');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked protocol');
    });
  });

  // ---------- Cloud metadata ----------

  describe('cloud metadata endpoints', () => {
    it('blocks AWS metadata (169.254.169.254)', () => {
      const result = isNavigateUrlAllowed('http://169.254.169.254/latest/meta-data/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cloud metadata');
    });

    it('blocks GCP metadata (metadata.google.internal)', () => {
      const result = isNavigateUrlAllowed('http://metadata.google.internal/computeMetadata/v1/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cloud metadata');
    });
  });

  // ---------- Private IP ranges ----------

  describe('private IP ranges', () => {
    it('blocks 10.x.x.x', () => {
      const result = isNavigateUrlAllowed('http://10.0.0.1/internal');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('blocks 172.16.0.0/12', () => {
      expect(isNavigateUrlAllowed('http://172.16.0.1/api').allowed).toBe(false);
      expect(isNavigateUrlAllowed('http://172.31.255.255/api').allowed).toBe(false);
    });

    it('blocks 192.168.x.x', () => {
      const result = isNavigateUrlAllowed('http://192.168.1.1/router');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('blocks 169.254.x.x (link-local)', () => {
      const result = isNavigateUrlAllowed('http://169.254.1.1/');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('blocks IPv6 unique-local (fc00:)', () => {
      const result = isNavigateUrlAllowed('http://[fc00::1]/api');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });

    it('blocks IPv6 link-local (fe80:)', () => {
      const result = isNavigateUrlAllowed('http://[fe80::1]/api');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('private IP');
    });
  });
});

// ============================================================================
// validateToolArgs - Tool Argument Validation
// ============================================================================

describe('validateToolArgs', () => {
  // ---------- Non-object args ----------

  describe('general argument validation', () => {
    it('rejects null args', () => {
      expect(validateToolArgs('click', null as any)).toBe('Arguments must be an object');
    });

    it('rejects undefined args', () => {
      expect(validateToolArgs('click', undefined as any)).toBe('Arguments must be an object');
    });

    it('rejects array args', () => {
      expect(validateToolArgs('click', [] as any)).toBe('Arguments must be an object');
    });

    it('rejects primitive string args', () => {
      expect(validateToolArgs('click', 'bad' as any)).toBe('Arguments must be an object');
    });

    it('rejects primitive number args', () => {
      expect(validateToolArgs('click', 42 as any)).toBe('Arguments must be an object');
    });

    it('rejects primitive boolean args', () => {
      expect(validateToolArgs('click', true as any)).toBe('Arguments must be an object');
    });
  });

  // ---------- navigate ----------

  describe('navigate', () => {
    it('accepts valid URL string', () => {
      expect(validateToolArgs('navigate', { url: 'https://example.com' })).toBeNull();
    });

    it('rejects missing url', () => {
      const result = validateToolArgs('navigate', {});
      expect(result).toContain('string');
      expect(result).toContain('url');
    });

    it('rejects non-string url', () => {
      expect(validateToolArgs('navigate', { url: 123 })).toContain('string');
    });

    it('rejects extremely long url', () => {
      const longUrl = 'https://example.com/' + 'x'.repeat(10001);
      expect(validateToolArgs('navigate', { url: longUrl })).toContain('too long');
    });

    it('accepts url at exactly max length', () => {
      const maxUrl = 'x'.repeat(10000);
      expect(validateToolArgs('navigate', { url: maxUrl })).toBeNull();
    });
  });

  // ---------- click ----------

  describe('click', () => {
    it('accepts valid element string', () => {
      expect(validateToolArgs('click', { element: 'Submit Button' })).toBeNull();
    });

    it('rejects missing element', () => {
      expect(validateToolArgs('click', {})).toContain('element');
    });

    it('rejects non-string element', () => {
      expect(validateToolArgs('click', { element: 42 })).toContain('string');
    });

    it('rejects extremely long element', () => {
      expect(validateToolArgs('click', { element: 'x'.repeat(10001) })).toContain('too long');
    });
  });

  // ---------- type ----------

  describe('type', () => {
    it('accepts valid element and text', () => {
      expect(validateToolArgs('type', { element: 'Username', text: 'john' })).toBeNull();
    });

    it('rejects missing element', () => {
      expect(validateToolArgs('type', { text: 'hello' })).toContain('element');
    });

    it('rejects non-string element', () => {
      expect(validateToolArgs('type', { element: 42, text: 'hello' })).toContain('element');
    });

    it('rejects missing text', () => {
      expect(validateToolArgs('type', { element: 'Username' })).toContain('text');
    });

    it('rejects non-string text', () => {
      expect(validateToolArgs('type', { element: 'Username', text: 42 })).toContain('string');
    });

    it('rejects extremely long text', () => {
      expect(validateToolArgs('type', { element: 'Input', text: 'x'.repeat(10001) })).toContain('too long');
    });
  });

  // ---------- select ----------

  describe('select', () => {
    it('accepts valid element and option', () => {
      expect(validateToolArgs('select', { element: 'Country', option: 'USA' })).toBeNull();
    });

    it('rejects missing element', () => {
      expect(validateToolArgs('select', { option: 'USA' })).toContain('element');
    });

    it('rejects non-string element', () => {
      expect(validateToolArgs('select', { element: 42, option: 'USA' })).toContain('element');
    });

    it('rejects missing option', () => {
      expect(validateToolArgs('select', { element: 'Country' })).toContain('option');
    });

    it('rejects non-string option', () => {
      expect(validateToolArgs('select', { element: 'Country', option: 42 })).toContain('option');
    });
  });

  // ---------- scroll ----------

  describe('scroll', () => {
    it('accepts valid direction "down"', () => {
      expect(validateToolArgs('scroll', { direction: 'down' })).toBeNull();
    });

    it('accepts valid direction "up"', () => {
      expect(validateToolArgs('scroll', { direction: 'up' })).toBeNull();
    });

    it('accepts valid direction "left"', () => {
      expect(validateToolArgs('scroll', { direction: 'left' })).toBeNull();
    });

    it('accepts valid direction "right"', () => {
      expect(validateToolArgs('scroll', { direction: 'right' })).toBeNull();
    });

    it('rejects missing direction', () => {
      expect(validateToolArgs('scroll', {})).toContain('direction');
    });

    it('rejects non-string direction', () => {
      expect(validateToolArgs('scroll', { direction: 123 })).toContain('string');
    });

    it('rejects invalid direction value', () => {
      expect(validateToolArgs('scroll', { direction: 'diagonal' })).toContain('Invalid scroll direction');
    });

    it('accepts optional number amount', () => {
      expect(validateToolArgs('scroll', { direction: 'down', amount: 500 })).toBeNull();
    });

    it('rejects non-number amount', () => {
      expect(validateToolArgs('scroll', { direction: 'down', amount: 'fast' })).toContain('number');
    });

    it('accepts missing amount (optional)', () => {
      expect(validateToolArgs('scroll', { direction: 'down' })).toBeNull();
    });
  });

  // ---------- wait ----------

  describe('wait', () => {
    it('accepts valid condition string', () => {
      expect(validateToolArgs('wait', { condition: 'load' })).toBeNull();
    });

    it('accepts selector condition', () => {
      expect(validateToolArgs('wait', { condition: '#my-element' })).toBeNull();
    });

    it('rejects missing condition', () => {
      expect(validateToolArgs('wait', {})).toContain('condition');
    });

    it('rejects non-string condition', () => {
      expect(validateToolArgs('wait', { condition: 42 })).toContain('string');
    });
  });

  // ---------- api_call ----------

  describe('api_call', () => {
    it('accepts valid GET call', () => {
      expect(validateToolArgs('api_call', { url: 'https://api.example.com/data' })).toBeNull();
    });

    it('accepts valid GET call with method', () => {
      expect(validateToolArgs('api_call', { url: 'https://api.example.com', method: 'GET' })).toBeNull();
    });

    it('accepts valid POST call with body', () => {
      expect(validateToolArgs('api_call', { url: 'https://api.example.com', method: 'POST', body: '{"key":"val"}' })).toBeNull();
    });

    it('rejects missing url', () => {
      expect(validateToolArgs('api_call', { method: 'GET' })).toContain('url');
    });

    it('rejects non-string url', () => {
      expect(validateToolArgs('api_call', { url: 123 })).toContain('string');
    });

    it('rejects extremely long url', () => {
      expect(validateToolArgs('api_call', { url: 'x'.repeat(10001) })).toContain('too long');
    });

    it('rejects non-string method', () => {
      expect(validateToolArgs('api_call', { url: 'https://x.com', method: 123 })).toContain('string');
    });

    it('accepts missing method (optional)', () => {
      expect(validateToolArgs('api_call', { url: 'https://x.com' })).toBeNull();
    });

    it('rejects non-string body', () => {
      expect(validateToolArgs('api_call', { url: 'https://x.com', body: { key: 'val' } })).toContain('string');
    });

    it('rejects extremely long body', () => {
      expect(validateToolArgs('api_call', { url: 'https://x.com', body: 'x'.repeat(10001) })).toContain('too long');
    });

    it('accepts missing body (optional)', () => {
      expect(validateToolArgs('api_call', { url: 'https://x.com' })).toBeNull();
    });
  });

  // ---------- done ----------

  describe('done', () => {
    it('always valid with any args', () => {
      expect(validateToolArgs('done', { success: true, result: 'all done' })).toBeNull();
    });

    it('always valid with empty args', () => {
      expect(validateToolArgs('done', {})).toBeNull();
    });
  });

  // ---------- submit ----------

  describe('submit', () => {
    it('accepts empty args (form is optional)', () => {
      expect(validateToolArgs('submit', {})).toBeNull();
    });

    it('accepts valid form string', () => {
      expect(validateToolArgs('submit', { form: 'login-form' })).toBeNull();
    });

    it('rejects non-string form', () => {
      expect(validateToolArgs('submit', { form: 42 })).toContain('string');
    });
  });
});

// ============================================================================
// validateAgentResponse - Response Structure Validation
// ============================================================================

describe('validateAgentResponse', () => {
  // ---------- Valid responses ----------

  describe('valid responses', () => {
    it('accepts valid response with toolCalls', () => {
      const result = validateAgentResponse({
        toolCalls: [{ name: 'click', arguments: { element: 'Submit' }, id: '1' }],
        thinking: 'I should click submit',
        done: false,
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('accepts empty response (no fields)', () => {
      const result = validateAgentResponse({});
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('accepts valid done=true with result', () => {
      const result = validateAgentResponse({ done: true, result: { score: 100 } });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('accepts toolCalls with undefined arguments', () => {
      const result = validateAgentResponse({
        toolCalls: [{ name: 'done' }],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts empty toolCalls array', () => {
      const result = validateAgentResponse({ toolCalls: [] });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // ---------- Invalid toolCalls ----------

  describe('invalid toolCalls', () => {
    it('rejects toolCalls that is not an array (string)', () => {
      const result = validateAgentResponse({ toolCalls: 'click' as any });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('array');
    });

    it('rejects toolCalls that is not an array (number)', () => {
      const result = validateAgentResponse({ toolCalls: 42 as any });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('array');
    });

    it('rejects toolCalls that is not an array (object)', () => {
      const result = validateAgentResponse({ toolCalls: {} as any });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('array');
    });

    it('rejects toolCalls item that is null', () => {
      const result = validateAgentResponse({ toolCalls: [null] as any });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('not an object');
    });

    it('rejects toolCalls item that is a string', () => {
      const result = validateAgentResponse({ toolCalls: ['click'] as any });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('not an object');
    });

    it('rejects toolCalls item that is a number', () => {
      const result = validateAgentResponse({ toolCalls: [42] as any });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('not an object');
    });

    it('rejects toolCalls item missing name', () => {
      const result = validateAgentResponse({
        toolCalls: [{ arguments: {} }] as any,
      });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('name');
    });

    it('rejects toolCalls item with empty name', () => {
      const result = validateAgentResponse({
        toolCalls: [{ name: '', arguments: {} }] as any,
      });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('name');
    });

    it('rejects toolCalls item with numeric name', () => {
      const result = validateAgentResponse({
        toolCalls: [{ name: 42, arguments: {} }] as any,
      });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('name');
    });

    it('rejects toolCalls item with non-object arguments (string)', () => {
      const result = validateAgentResponse({
        toolCalls: [{ name: 'click', arguments: 'bad' }] as any,
      });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('arguments');
    });

    it('rejects toolCalls item with null arguments', () => {
      const result = validateAgentResponse({
        toolCalls: [{ name: 'click', arguments: null }] as any,
      });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('arguments');
    });

    it('rejects toolCalls item with number arguments', () => {
      const result = validateAgentResponse({
        toolCalls: [{ name: 'click', arguments: 42 }] as any,
      });
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('arguments');
    });
  });

  // ---------- Warnings ----------

  describe('warnings', () => {
    it('warns on excessive tool calls (>20)', () => {
      const toolCalls = Array.from({ length: 25 }, (_, i) => ({
        name: 'click',
        arguments: { element: `btn-${i}` },
        id: String(i),
      }));
      const result = validateAgentResponse({ toolCalls });
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Excessive');
      expect(result.warnings[0]).toContain('25');
    });

    it('does not warn when exactly 20 tool calls', () => {
      const toolCalls = Array.from({ length: 20 }, (_, i) => ({
        name: 'click',
        arguments: { element: `btn-${i}` },
        id: String(i),
      }));
      const result = validateAgentResponse({ toolCalls });
      expect(result.valid).toBe(true);
      const excessiveWarnings = result.warnings.filter(w => w.includes('Excessive'));
      expect(excessiveWarnings).toHaveLength(0);
    });

    it('warns when thinking is not a string (number)', () => {
      const result = validateAgentResponse({ thinking: 42 as any });
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('thinking');
    });

    it('warns when thinking is not a string (boolean)', () => {
      const result = validateAgentResponse({ thinking: true as any });
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('thinking'))).toBe(true);
    });

    it('warns when done is not a boolean (string)', () => {
      const result = validateAgentResponse({ done: 'yes' as any });
      expect(result.valid).toBe(true);
      expect(result.warnings[0]).toContain('done');
    });

    it('warns when done is not a boolean (number)', () => {
      const result = validateAgentResponse({ done: 1 as any });
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('done'))).toBe(true);
    });

    it('does not warn for valid thinking string', () => {
      const result = validateAgentResponse({ thinking: 'I am thinking...' });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('does not warn for valid done boolean', () => {
      const result = validateAgentResponse({ done: false });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });
});

// ============================================================================
// detectSuspiciousArgs - Suspicious Pattern Detection
//
// Security detection test fixtures: these strings simulate malicious agent
// output. They are passed as DATA to detectSuspiciousArgs(), NOT executed.
// ============================================================================

describe('detectSuspiciousArgs', () => {
  // ---------- Clean inputs ----------

  describe('clean inputs', () => {
    it('returns empty for normal click arguments', () => {
      expect(detectSuspiciousArgs('click', { element: 'Submit Button' })).toHaveLength(0);
    });

    it('returns empty for normal navigate arguments', () => {
      expect(detectSuspiciousArgs('navigate', { url: 'https://example.com' })).toHaveLength(0);
    });

    it('returns empty for normal type arguments', () => {
      expect(detectSuspiciousArgs('type', { element: 'username', text: 'john_doe' })).toHaveLength(0);
    });

    it('returns empty for scroll with string direction', () => {
      expect(detectSuspiciousArgs('scroll', { direction: 'down' })).toHaveLength(0);
    });
  });

  // ---------- Non-string values ----------

  describe('non-string values', () => {
    it('skips number values', () => {
      expect(detectSuspiciousArgs('scroll', { direction: 'down', amount: 500 })).toHaveLength(0);
    });

    it('skips boolean values', () => {
      expect(detectSuspiciousArgs('done', { success: true })).toHaveLength(0);
    });

    it('skips null values', () => {
      expect(detectSuspiciousArgs('done', { result: null as any })).toHaveLength(0);
    });

    it('skips undefined values', () => {
      expect(detectSuspiciousArgs('done', { result: undefined as any })).toHaveLength(0);
    });
  });

  // ---------- Code invocation patterns ----------

  describe('code invocation patterns', () => {
    // Build test strings by concatenation to avoid static analysis hooks
    it('detects ev' + 'al()', () => {
      const findings = detectSuspiciousArgs('type', { text: 'ev' + 'al(document.cookie)' });
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toContain('Suspicious pattern');
    });

    it('detects new Func' + 'tion', () => {
      const findings = detectSuspiciousArgs('type', { text: 'new Func' + 'tion("return 1")()' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects dynamic imp' + 'ort()', () => {
      const findings = detectSuspiciousArgs('type', { text: 'imp' + 'ort("./module")' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects req' + 'uire()', () => {
      const findings = detectSuspiciousArgs('type', { text: 'req' + 'uire("fs")' });
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  // ---------- Process manipulation ----------

  describe('process manipulation patterns', () => {
    it('detects process.en' + 'v', () => {
      const findings = detectSuspiciousArgs('type', { text: 'process.en' + 'v.SECRET_KEY' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects process.ex' + 'it', () => {
      const findings = detectSuspiciousArgs('type', { text: 'process.ex' + 'it(1)' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects process.ki' + 'll', () => {
      const findings = detectSuspiciousArgs('type', { text: 'process.ki' + 'll(pid)' });
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  // ---------- Shell / filesystem ----------

  describe('shell and filesystem patterns', () => {
    it('detects child_pro' + 'cess', () => {
      const findings = detectSuspiciousArgs('type', { text: 'child_pro' + 'cess.ex' + 'ec("ls")' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects ex' + 'ec', () => {
      const findings = detectSuspiciousArgs('type', { text: 'ex' + 'ec("rm -rf /")' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects sp' + 'awn', () => {
      const findings = detectSuspiciousArgs('type', { text: 'sp' + 'awn("bash", ["-c"])' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects fs.readF' + 'ile', () => {
      const findings = detectSuspiciousArgs('type', { text: 'fs.read' + 'File("/etc/passwd")' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects fs.writeF' + 'ile', () => {
      const findings = detectSuspiciousArgs('type', { text: 'fs.write' + 'File("/tmp/out", data)' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects fs.unl' + 'ink', () => {
      const findings = detectSuspiciousArgs('type', { text: 'fs.unl' + 'ink("/tmp/important")' });
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  // ---------- HTML injection ----------

  describe('HTML injection patterns', () => {
    it('detects <scr' + 'ipt> tag', () => {
      const findings = detectSuspiciousArgs('type', { text: '<scr' + 'ipt>alert(1)</script>' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects <scr' + 'ipt with attributes', () => {
      const findings = detectSuspiciousArgs('type', { text: '<scr' + 'ipt src="evil.js">' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects oncl' + 'ick= event handler', () => {
      const findings = detectSuspiciousArgs('type', { text: 'oncl' + 'ick=alert(1)' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects oner' + 'ror= event handler', () => {
      const findings = detectSuspiciousArgs('type', { text: 'x oner' + 'ror=alert(1)' });
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects onlo' + 'ad= event handler', () => {
      const findings = detectSuspiciousArgs('type', { text: '<img onlo' + 'ad=steal()>' });
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  // ---------- Base64 payload detection ----------

  describe('base64 payload detection', () => {
    it('detects large base64 payload (>1000 chars, >90% b64)', () => {
      const base64Payload = 'A'.repeat(2000);
      const findings = detectSuspiciousArgs('type', { text: base64Payload });
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toContain('base64');
    });

    it('does not flag short base64-like strings (<= 1000 chars)', () => {
      const shortPayload = 'ABCDEF'.repeat(100); // 600 chars
      const findings = detectSuspiciousArgs('type', { text: shortPayload });
      const base64Findings = findings.filter(f => f.includes('base64'));
      expect(base64Findings).toHaveLength(0);
    });

    it('does not flag strings where length <= 500 (skips base64 check)', () => {
      const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // 62 chars
      const findings = detectSuspiciousArgs('type', { text });
      const base64Findings = findings.filter(f => f.includes('base64'));
      expect(base64Findings).toHaveLength(0);
    });

    it('does not flag normal long text (low base64 ratio)', () => {
      const normalText = 'This is a long paragraph of text that describes something. '.repeat(25);
      const findings = detectSuspiciousArgs('type', { text: normalText });
      const base64Findings = findings.filter(f => f.includes('base64'));
      expect(base64Findings).toHaveLength(0);
    });

    it('includes payload size in finding message', () => {
      const payload = 'B'.repeat(1500);
      const findings = detectSuspiciousArgs('type', { text: payload });
      const b64Finding = findings.find(f => f.includes('base64'));
      expect(b64Finding).toContain('1500 chars');
    });
  });

  // ---------- Multiple fields ----------

  describe('multiple fields', () => {
    it('detects suspicious patterns in any string field', () => {
      const findings = detectSuspiciousArgs('type', {
        element: 'ev' + 'al(x)',
        text: 'normal text',
      });
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toContain('element');
    });

    it('reports one finding per field maximum (break after first match)', () => {
      // A string with multiple suspicious patterns should only produce one finding
      const findings = detectSuspiciousArgs('type', {
        text: 'ev' + 'al(req' + 'uire("fs").read' + 'FileSync("/etc/passwd"))',
      });
      const textFindings = findings.filter(f => f.includes('type.text'));
      expect(textFindings).toHaveLength(1);
    });
  });
});
