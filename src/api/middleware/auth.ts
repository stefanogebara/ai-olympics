import { Request, Response, NextFunction } from 'express';
import { serviceClient, createUserClient, extractToken } from '../../shared/utils/supabase.js';

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
    (req as any).user = user;
    (req as any).userClient = createUserClient(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware that requires the user to be an admin.
 * Must be used AFTER requireAuth.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
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
