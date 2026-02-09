/**
 * Supabase client utilities
 *
 * Service client: bypasses RLS, use only for admin operations
 * User client: respects RLS policies, use for user-facing queries
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

// Validate required configuration (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  if (!supabaseUrl) {
    throw new Error('Missing required environment variable: SUPABASE_URL');
  }
  if (!supabaseServiceKey) {
    throw new Error('Missing required environment variable: SUPABASE_SERVICE_KEY');
  }
}

/**
 * Service-level client (bypasses RLS)
 * Use ONLY for:
 * - Admin operations (resolve markets, update leaderboards)
 * - Cross-user queries (global leaderboard aggregation)
 * - System operations (verification scoring updates)
 */
export const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Create a Supabase client scoped to a user's JWT token.
 * This client respects RLS policies, so users can only access their own data.
 *
 * Use for all user-facing queries where the user is authenticated:
 * - Reading/writing their own agents
 * - Reading/writing their own predictions
 * - Reading/writing their own portfolio
 */
export function createUserClient(userJwt: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`,
      },
    },
  });
}

/**
 * Extract JWT from authorization header
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
