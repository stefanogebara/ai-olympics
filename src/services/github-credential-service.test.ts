/**
 * Tests for github-credential-service.ts
 *
 * Covers: issueRunToken (dev mode + App mode), getRunToken, revokeRunToken,
 * isGitHubAppConfigured.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn().mockReturnValue(
    vi.fn().mockResolvedValue({
      token: 'ghs_mock_token_123',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  ),
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks are set up
import {
  issueRunToken,
  getRunToken,
  revokeRunToken,
  isGitHubAppConfigured,
} from './github-credential-service.js';
import { createAppAuth } from '@octokit/auth-app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_ENV_VARS = {
  GITHUB_APP_ID: '12345',
  GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
  GITHUB_APP_INSTALLATION_ID: '67890',
};

function setAppEnvVars(): void {
  for (const [key, value] of Object.entries(APP_ENV_VARS)) {
    process.env[key] = value;
  }
}

function clearAppEnvVars(): void {
  for (const key of Object.keys(APP_ENV_VARS)) {
    delete process.env[key];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isGitHubAppConfigured', () => {
  afterEach(() => {
    clearAppEnvVars();
  });

  it('returns false when env vars are missing', () => {
    clearAppEnvVars();
    expect(isGitHubAppConfigured()).toBe(false);
  });

  it('returns true when all three env vars are set', () => {
    setAppEnvVars();
    expect(isGitHubAppConfigured()).toBe(true);
  });

  it('returns false when only some env vars are set', () => {
    process.env.GITHUB_APP_ID = '12345';
    // Missing GITHUB_APP_PRIVATE_KEY and GITHUB_APP_INSTALLATION_ID
    expect(isGitHubAppConfigured()).toBe(false);
    delete process.env.GITHUB_APP_ID;
  });
});

describe('issueRunToken — dev mode (no App env vars)', () => {
  beforeEach(() => {
    clearAppEnvVars();
  });

  afterEach(() => {
    clearAppEnvVars();
    delete process.env.GITHUB_TEST_TOKEN;
  });

  it('returns GITHUB_TEST_TOKEN value when set', async () => {
    process.env.GITHUB_TEST_TOKEN = 'ghp_test_static_token';
    const token = await issueRunToken('run-dev-1');
    expect(token).toBe('ghp_test_static_token');
  });

  it('returns empty string when GITHUB_TEST_TOKEN is not set', async () => {
    delete process.env.GITHUB_TEST_TOKEN;
    const token = await issueRunToken('run-dev-2');
    expect(token).toBe('');
  });
});

describe('issueRunToken — GitHub App mode', () => {
  beforeEach(() => {
    setAppEnvVars();
    vi.clearAllMocks();
    // Re-establish the mock after clearAllMocks resets call counts
    (createAppAuth as ReturnType<typeof vi.fn>).mockReturnValue(
      vi.fn().mockResolvedValue({
        token: 'ghs_mock_token_123',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
  });

  afterEach(() => {
    clearAppEnvVars();
  });

  it('calls createAppAuth and returns the installation token', async () => {
    const token = await issueRunToken('run-app-1');
    expect(token).toBe('ghs_mock_token_123');
    expect(createAppAuth).toHaveBeenCalledWith({
      appId: '12345',
      privateKey: APP_ENV_VARS.GITHUB_APP_PRIVATE_KEY,
      installationId: 67890,
    });
  });
});

describe('getRunToken', () => {
  afterEach(() => {
    clearAppEnvVars();
    delete process.env.GITHUB_TEST_TOKEN;
  });

  it('returns the token after issueRunToken', async () => {
    clearAppEnvVars();
    process.env.GITHUB_TEST_TOKEN = 'ghp_stored_token';

    await issueRunToken('run-get-1');
    expect(getRunToken('run-get-1')).toBe('ghp_stored_token');
  });

  it('throws "No token for run X" for an unknown runId', () => {
    expect(() => getRunToken('run-unknown-xyz')).toThrow(
      'No token for run run-unknown-xyz',
    );
  });

  it('throws "Token for run X has expired" for an expired token', async () => {
    clearAppEnvVars();
    process.env.GITHUB_TEST_TOKEN = 'ghp_expired_token';

    await issueRunToken('run-expired-1');

    // Manually set the expiresAt to the past by manipulating the module's internal map
    // We do this by issuing the token then updating via a fresh import reference.
    // Since we can't access activeTokens directly, we use Date manipulation via vi.useFakeTimers.
    vi.useFakeTimers();
    // Advance time by 2 hours so the 1-hour token expires
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    expect(() => getRunToken('run-expired-1')).toThrow(
      'Token for run run-expired-1 has expired',
    );

    vi.useRealTimers();
  });
});

describe('revokeRunToken', () => {
  afterEach(() => {
    clearAppEnvVars();
    delete process.env.GITHUB_TEST_TOKEN;
  });

  it('removes token so subsequent getRunToken throws', async () => {
    clearAppEnvVars();
    process.env.GITHUB_TEST_TOKEN = 'ghp_revoke_test';

    await issueRunToken('run-revoke-1');
    // Verify token is accessible before revoke
    expect(getRunToken('run-revoke-1')).toBe('ghp_revoke_test');

    revokeRunToken('run-revoke-1');

    expect(() => getRunToken('run-revoke-1')).toThrow(
      'No token for run run-revoke-1',
    );
  });
});
