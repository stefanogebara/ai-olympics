/**
 * Centralized, environment-sourced configuration for the Playwright e2e suite.
 *
 * SECURITY: no credentials are hardcoded here. Supabase keys, the test account
 * password, and the seeded user id all come from environment variables (loaded
 * from a local, git-ignored `.env` by playwright.config.ts, or injected as CI
 * secrets). See `.env.example` for the variable names.
 *
 * A previous version of the suite committed a live `service_role` JWT and real
 * account passwords directly in the spec files — never do that again.
 */

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

/** Read a required secret; throws a clear error if a test that needs it runs without it. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[e2e] Missing required env var ${name}. ` +
        `Set it in a local .env (git-ignored) or as a CI secret. See .env.example.`
    );
  }
  return v;
}

export const SUPABASE_URL = optional('E2E_SUPABASE_URL', optional('VITE_SUPABASE_URL'));
export const SUPABASE_ANON_KEY = optional('E2E_SUPABASE_ANON_KEY', optional('VITE_SUPABASE_ANON_KEY'));

/**
 * service_role key — only needed by specs that seed/admin data. Read as an
 * optional constant (empty when absent) so importing a spec never throws at
 * collection time; use `serviceKey()` at a call site to fail loudly when a test
 * genuinely requires it.
 */
export const SUPABASE_SERVICE_KEY = optional('SUPABASE_SERVICE_KEY');
export const serviceKey = (): string => requireEnv('SUPABASE_SERVICE_KEY');

export const API_URL = optional('E2E_API_URL', 'http://localhost:3003');

/** Pre-provisioned test account (created out-of-band with email_confirm=true). */
export const TEST_EMAIL = optional('E2E_TEST_EMAIL', 'e2e-agent-test@example.com');
export const TEST_PASSWORD = optional('E2E_TEST_PASSWORD');
export const TEST_USER_ID = optional('E2E_TEST_USER_ID');

/** Supabase project ref parsed from the URL (used by a couple of specs). */
export const PROJECT_REF = (() => {
  const m = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : '';
})();
