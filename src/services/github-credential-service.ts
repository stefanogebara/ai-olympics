import { createAppAuth } from '@octokit/auth-app';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('GithubCredService');

interface TokenRecord {
  token: string;
  expiresAt: Date;
}

// In-memory store: runId → token record
const activeTokens = new Map<string, TokenRecord>();

/**
 * Check if GitHub App is configured via environment variables.
 */
export function isGitHubAppConfigured(): boolean {
  return !!(
    process.env.GITHUB_APP_ID &&
    process.env.GITHUB_APP_PRIVATE_KEY &&
    process.env.GITHUB_APP_INSTALLATION_ID
  );
}

/**
 * Issue a GitHub token for a run.
 * If GitHub App env vars are set, issue an installation token (expires ~1hr).
 * Otherwise fall back to GITHUB_TEST_TOKEN (dev mode).
 */
export async function issueRunToken(runId: string): Promise<string> {
  let token: string;
  let expiresAt: Date;

  if (isGitHubAppConfigured()) {
    log.info('Issuing GitHub App installation token', { runId });

    const auth = createAppAuth({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
      installationId: Number(process.env.GITHUB_APP_INSTALLATION_ID),
    });

    const result = await auth({ type: 'installation' });
    token = result.token;
    expiresAt = result.expiresAt
      ? new Date(result.expiresAt)
      : new Date(Date.now() + 3_600_000);
  } else {
    log.info('Dev mode: using GITHUB_TEST_TOKEN fallback', { runId });

    token = process.env.GITHUB_TEST_TOKEN ?? '';

    if (!token) {
      log.warn(
        'GITHUB_TEST_TOKEN not set — returning empty token (verifier will handle gracefully)',
        { runId },
      );
    }

    expiresAt = new Date(Date.now() + 3_600_000);
  }

  activeTokens.set(runId, { token, expiresAt });

  return token;
}

/**
 * Get the active token for a run.
 * Throws if not found or if the token has expired.
 */
export function getRunToken(runId: string): string {
  const record = activeTokens.get(runId);

  if (!record) {
    throw new Error(`No token for run ${runId}`);
  }

  if (record.expiresAt <= new Date()) {
    revokeRunToken(runId);
    throw new Error(`Token for run ${runId} has expired`);
  }

  return record.token;
}

/**
 * Revoke / remove the token for a run (cleanup after completion).
 */
export function revokeRunToken(runId: string): void {
  activeTokens.delete(runId);
  log.info('Revoked GitHub token', { runId });
}
