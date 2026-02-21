import { Request, Response, NextFunction } from 'express';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient, createUserClient, extractToken } from '../../shared/utils/supabase.js';

/**
 * Express request with authenticated user and user-scoped Supabase client.
 * Use this instead of `(req as any).user` / `(req as any).userClient`.
 */
export interface AuthenticatedRequest extends Request {
  user: User;
  userClient: SupabaseClient;
}

/**
 * Middleware to verify JWT token from Supabase.
 * Attaches user object and user-scoped Supabase client (respects RLS) to request.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    const { data: { user }, error } = await serviceClient.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).userClient = createUserClient(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware that blocks betting when the user's self-exclusion period is active.
 * Must be used AFTER requireAuth.
 */
export async function requireNotExcluded(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { data: profile } = await serviceClient
      .from('aio_profiles')
      .select('betting_paused_until')
      .eq('id', user.id)
      .single();

    if (profile?.betting_paused_until && new Date(profile.betting_paused_until) > new Date()) {
      return res.status(403).json({
        success: false,
        error: 'Betting is paused on your account. Self-exclusion period is active.',
        pausedUntil: profile.betting_paused_until,
      });
    }

    next();
  } catch {
    // If profile check fails, allow through — don't block on infrastructure errors
    next();
  }
}

/**
 * Middleware that requires the user to be an admin.
 * Must be used AFTER requireAuth.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { data: profile } = await serviceClient
      .from('aio_profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch {
    return res.status(403).json({ error: 'Admin access required' });
  }
}
