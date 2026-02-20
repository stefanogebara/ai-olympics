import { describe, it, expect, vi, beforeEach } from 'vitest';

// ================================================================
// Mock @supabase/supabase-js at the top level
// ================================================================

const mockCreateClient = vi.fn().mockReturnValue({ mock: 'client' });

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

// ================================================================
// extractToken — pure function, no side effects
// ================================================================

describe('extractToken', () => {
  let extractToken: typeof import('./supabase.js')['extractToken'];

  beforeEach(async () => {
    vi.resetModules();
    mockCreateClient.mockReturnValue({ mock: 'client' });
    const mod = await import('./supabase.js');
    extractToken = mod.extractToken;
  });

  it('returns null for undefined header', () => {
    expect(extractToken(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractToken('')).toBeNull();
  });

  it('returns null for non-Bearer header', () => {
    expect(extractToken('Basic abc123')).toBeNull();
  });

  it('returns null for "Token xyz" header', () => {
    expect(extractToken('Token xyz')).toBeNull();
  });

  it('returns token from "Bearer <token>"', () => {
    expect(extractToken('Bearer my-jwt-token')).toBe('my-jwt-token');
  });

  it('returns full token including spaces after Bearer prefix', () => {
    // authHeader.slice(7) preserves everything after "Bearer "
    expect(extractToken('Bearer token with spaces')).toBe('token with spaces');
  });

  it('returns null for "Bearer" without space and token', () => {
    // "Bearer" alone does not start with "Bearer " (with trailing space)
    expect(extractToken('Bearer')).toBeNull();
  });

  it('handles "bearer" (lowercase) - should return null', () => {
    // startsWith is case-sensitive, so lowercase "bearer" does not match "Bearer "
    expect(extractToken('bearer my-token')).toBeNull();
  });

  it('returns null for "BEARER token" (uppercase)', () => {
    expect(extractToken('BEARER my-token')).toBeNull();
  });

  it('returns token from a realistic JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(extractToken(`Bearer ${jwt}`)).toBe(jwt);
  });

  it('returns empty string for "Bearer " with trailing space but no token', () => {
    // "Bearer " is 7 chars, .slice(7) on "Bearer " gives ""
    // But "Bearer ".startsWith("Bearer ") is true, so it returns ""
    // Actually "" is falsy, but extractToken returns authHeader.slice(7)
    // which is "" — a string, not null
    expect(extractToken('Bearer ')).toBe('');
  });
});

// ================================================================
// createUserClient
// ================================================================

describe('createUserClient', () => {
  let createUserClient: typeof import('./supabase.js')['createUserClient'];

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'service-key-123');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key-456');
    vi.stubEnv('NODE_ENV', 'test');
    mockCreateClient.mockReturnValue({ mock: 'userClient' });
    const mod = await import('./supabase.js');
    createUserClient = mod.createUserClient;
  });

  it('calls createClient with correct URL and anon key', () => {
    // Clear calls from module-level serviceClient creation
    mockCreateClient.mockClear();
    const mockClient = { mock: 'newUserClient' };
    mockCreateClient.mockReturnValue(mockClient);

    createUserClient('user-jwt-token');

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'anon-key-456',
      expect.objectContaining({
        global: {
          headers: {
            Authorization: 'Bearer user-jwt-token',
          },
        },
      }),
    );
  });

  it('passes Authorization header with Bearer prefix', () => {
    mockCreateClient.mockClear();
    createUserClient('my-jwt');

    const callArgs = mockCreateClient.mock.calls[0];
    const options = callArgs[2];
    expect(options.global.headers.Authorization).toBe('Bearer my-jwt');
  });

  it('returns the created client', () => {
    mockCreateClient.mockClear();
    const mockClient = { mock: 'returnedClient' };
    mockCreateClient.mockReturnValue(mockClient);

    const result = createUserClient('some-token');

    expect(result).toBe(mockClient);
  });
});

// ================================================================
// serviceClient (module-level)
// ================================================================

describe('serviceClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockCreateClient.mockReturnValue({ mock: 'serviceClient' });
  });

  it('is created with URL and service key', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://my-project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'my-service-key');
    vi.stubEnv('SUPABASE_ANON_KEY', 'my-anon-key');
    vi.stubEnv('NODE_ENV', 'test');
    mockCreateClient.mockClear();

    const mod = await import('./supabase.js');

    // The first call to createClient is for serviceClient
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://my-project.supabase.co',
      'my-service-key',
    );
    expect(mod.serviceClient).toEqual({ mock: 'serviceClient' });
  });

  it('is exported and accessible', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'svc-key');
    vi.stubEnv('NODE_ENV', 'test');

    const mod = await import('./supabase.js');

    expect(mod.serviceClient).toBeDefined();
  });
});

// ================================================================
// Module-level validation behavior
// ================================================================

describe('module-level validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockCreateClient.mockReturnValue({ mock: 'client' });
  });

  it('skips validation in test environment (NODE_ENV=test)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');

    // Should NOT throw even though URL and service key are empty
    await expect(import('./supabase.js')).resolves.toBeDefined();
  });

  it('throws when SUPABASE_URL is missing in non-test environment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'some-key');

    await expect(import('./supabase.js')).rejects.toThrow(
      'Missing required environment variable: SUPABASE_URL',
    );
  });

  it('throws when SUPABASE_SERVICE_KEY is missing in non-test environment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');

    await expect(import('./supabase.js')).rejects.toThrow(
      'Missing required environment variable: SUPABASE_SERVICE_KEY',
    );
  });

  it('does not throw when both env vars are present in non-test environment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', 'https://prod.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'prod-service-key');

    await expect(import('./supabase.js')).resolves.toBeDefined();
  });

  it('does not throw when NODE_ENV is development and vars are set', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SUPABASE_URL', 'https://dev.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'dev-service-key');

    await expect(import('./supabase.js')).resolves.toBeDefined();
  });

  it('uses empty string defaults when env vars are not set at all', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    // Don't set SUPABASE_URL etc. — they default to '' in the source
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    mockCreateClient.mockClear();

    const mod = await import('./supabase.js');

    // serviceClient is created with empty strings when in test mode
    expect(mockCreateClient).toHaveBeenCalledWith('', '');
    expect(mod.serviceClient).toBeDefined();
  });
});

// ================================================================
// Edge cases for extractToken (additional)
// ================================================================

describe('extractToken edge cases', () => {
  let extractToken: typeof import('./supabase.js')['extractToken'];

  beforeEach(async () => {
    vi.resetModules();
    mockCreateClient.mockReturnValue({ mock: 'client' });
    const mod = await import('./supabase.js');
    extractToken = mod.extractToken;
  });

  it('returns null for header with only whitespace', () => {
    expect(extractToken('   ')).toBeNull();
  });

  it('returns null for "BearerToken" (no space)', () => {
    expect(extractToken('BearerToken')).toBeNull();
  });

  it('returns token with special characters', () => {
    expect(extractToken('Bearer abc!@#$%^&*()')).toBe('abc!@#$%^&*()');
  });

  it('returns token with dots (typical JWT format)', () => {
    expect(extractToken('Bearer aaa.bbb.ccc')).toBe('aaa.bbb.ccc');
  });
});
