import { Router, Request, Response } from 'express';
import { serviceClient } from '../../shared/utils/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// All admin routes require auth + admin
router.use(requireAuth, requireAdmin);

// ============================================================================
// DASHBOARD STATS
// ============================================================================

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [users, agents, competitions, pendingAgents] = await Promise.all([
      serviceClient.from('aio_profiles').select('id', { count: 'exact', head: true }),
      serviceClient.from('aio_agents').select('id', { count: 'exact', head: true }),
      serviceClient.from('aio_competitions').select('id', { count: 'exact', head: true }),
      serviceClient.from('aio_agents').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending_review'),
    ]);

    res.json({
      totalUsers: users.count || 0,
      totalAgents: agents.count || 0,
      totalCompetitions: competitions.count || 0,
      pendingAgents: pendingAgents.count || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// USER MANAGEMENT
// ============================================================================

router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const search = (req.query.search as string || '').trim();
    const offset = (page - 1) * limit;

    let query = serviceClient
      .from('aio_profiles')
      .select('id, username, display_name, avatar_url, is_verified, is_admin, wallet_balance, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ users: data || [], total: count || 0, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_admin, is_verified } = req.body;

    const updates: Record<string, any> = {};
    if (typeof is_admin === 'boolean') updates.is_admin = is_admin;
    if (typeof is_verified === 'boolean') updates.is_verified = is_verified;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { error } = await serviceClient
      .from('aio_profiles')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// AGENT MODERATION
// ============================================================================

router.get('/agents', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const status = req.query.status as string || 'pending_review';
    const offset = (page - 1) * limit;

    let query = serviceClient
      .from('aio_agents')
      .select(`
        id, name, slug, description, agent_type, provider, model,
        webhook_url, color, is_public, approval_status, approval_note,
        reviewed_at, created_at,
        owner:aio_profiles!owner_id(id, username, display_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') {
      query = query.eq('approval_status', status);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ agents: data || [], total: count || 0, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/agents/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved, note } = req.body;
    const adminUser = (req as any).user;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved field (boolean) is required' });
    }

    const { error } = await serviceClient
      .from('aio_agents')
      .update({
        approval_status: approved ? 'approved' : 'rejected',
        approval_note: note || null,
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, status: approved ? 'approved' : 'rejected' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// COMPETITION MANAGEMENT
// ============================================================================

router.get('/competitions', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    let query = serviceClient
      .from('aio_competitions')
      .select(`
        id, name, status, stake_mode, entry_fee, max_participants,
        scheduled_start, created_at,
        domain:aio_domains(name, slug),
        creator:aio_profiles!created_by(username, display_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ competitions: data || [], total: count || 0, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/competitions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['lobby', 'starting', 'running', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const { error } = await serviceClient
      .from('aio_competitions')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
