import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { serviceClient } from '../../shared/utils/supabase.js';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { createLogger } from '../../shared/utils/logger.js';
import { validateBody } from '../middleware/validate.js';
import { updateUserSchema, reviewAgentSchema, updateCompetitionStatusSchema } from '../schemas.js';
import { encrypt } from '../../shared/utils/crypto.js';

const log = createLogger('AdminAPI');
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
  } catch (err: unknown) {
    log.error('Failed to fetch admin stats', { error: err });
    res.status(500).json({ error: 'Failed to fetch stats' });
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
      const sanitized = search.replace(/[%_,().]/g, '');
      query = query.or(`username.ilike.%${sanitized}%,display_name.ilike.%${sanitized}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ users: data || [], total: count || 0, page, limit });
  } catch (err: unknown) {
    log.error('Failed to fetch users', { error: err });
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.patch('/users/:id', validateBody(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_admin, is_verified } = req.body;

    const updates: Record<string, boolean> = {};
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
  } catch (err: unknown) {
    log.error('Failed to update user', { error: err });
    res.status(500).json({ error: 'Failed to update user' });
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
  } catch (err: unknown) {
    log.error('Failed to fetch agents', { error: err });
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

router.post('/agents/:id/review', validateBody(reviewAgentSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved, note } = req.body;
    const adminUser = (req as AuthenticatedRequest).user;

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
  } catch (err: unknown) {
    log.error('Failed to review agent', { error: err });
    res.status(500).json({ error: 'Failed to review agent' });
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
  } catch (err: unknown) {
    log.error('Failed to fetch competitions', { error: err });
    res.status(500).json({ error: 'Failed to fetch competitions' });
  }
});

router.patch('/competitions/:id', validateBody(updateCompetitionStatusSchema), async (req: Request, res: Response) => {
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
  } catch (err: unknown) {
    log.error('Failed to update competition', { error: err });
    res.status(500).json({ error: 'Failed to update competition' });
  }
});

// ============================================================================
// DEMO SEED
// ============================================================================

const SEED_DOMAIN_CONFIGS = [
  {
    slug: 'browser-tasks',
    name: 'Browser Tasks Daily',
    description: 'Claude models race through real web tasks — forms, navigation, data extraction.',
    recurrence: 'daily',
    taskIds: ['form-blitz', 'shopping-cart', 'navigation-maze'],
  },
  {
    slug: 'games',
    name: 'Games Gauntlet',
    description: 'Trivia, math, word puzzles, and logic challenges — who thinks fastest?',
    recurrence: 'every_6h',
    taskIds: ['trivia', 'math', 'word', 'logic'],
  },
  {
    slug: 'games',
    name: 'Lightning Round ⚡',
    description: 'Quick-fire trivia and math — fastest AI wins in under 10 minutes.',
    recurrence: 'hourly',
    taskIds: ['trivia', 'math'],
  },
  {
    slug: 'coding',
    name: 'Coding Arena',
    description: 'Debug code, play code golf, and ace API challenges.',
    recurrence: 'daily',
    taskIds: ['code-debug', 'code-golf'],
  },
  {
    slug: 'creative',
    name: 'Creative Showdown',
    description: 'Writing challenges, design prompts, and pitch deck battles.',
    recurrence: 'daily',
    taskIds: ['writing-challenge', 'pitch-deck'],
  },
];

const SEED_HOUSE_AGENTS = [
  { name: 'Claude Sonnet (House)', slug: 'house-claude-sonnet', model: 'claude-sonnet-4-5-20250929', color: '#D97706', personaStyle: 'balanced', strategy: 'balanced' },
  { name: 'Claude Haiku (House)', slug: 'house-claude-haiku', model: 'claude-haiku-4-5-20251001', color: '#00F5FF', personaStyle: 'technical', strategy: 'aggressive' },
  { name: 'Claude Opus (House)', slug: 'house-claude-opus', model: 'claude-opus-4-6', color: '#FF00FF', personaStyle: 'analytical', strategy: 'cautious' },
];

router.post('/seed-competitions', async (_req: Request, res: Response) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });
  }

  const result = {
    systemUserId: '',
    agentsCreated: 0,
    agentsSkipped: 0,
    competitionsCreated: 0,
    competitionsSkipped: 0,
    errors: [] as string[],
  };

  try {
    // 1. Get or create system user
    const { data: existingProfile } = await serviceClient
      .from('aio_profiles')
      .select('id')
      .eq('username', 'ai-olympics-system')
      .single();

    if (existingProfile) {
      result.systemUserId = existingProfile.id;
    } else {
      const { data: authUser, error: authErr } = await serviceClient.auth.admin.createUser({
        email: 'system@ai-olympics.internal',
        password: randomUUID(),
        email_confirm: true,
        user_metadata: { username: 'ai-olympics-system' },
      });
      if (authErr || !authUser.user) {
        return res.status(500).json({ error: `Failed to create system user: ${authErr?.message}` });
      }
      await serviceClient.from('aio_profiles').upsert({
        id: authUser.user.id,
        username: 'ai-olympics-system',
        display_name: 'AI Olympics',
      });
      result.systemUserId = authUser.user.id;
    }

    // 2. Get or create house agents
    const encryptedKey = encrypt(anthropicKey);
    const agentIds = new Map<string, string>();

    for (const agent of SEED_HOUSE_AGENTS) {
      const { data: existing } = await serviceClient
        .from('aio_agents')
        .select('id')
        .eq('slug', agent.slug)
        .single();

      if (existing) {
        agentIds.set(agent.slug, existing.id);
        result.agentsSkipped++;
        continue;
      }

      const { data: created, error: agentErr } = await serviceClient
        .from('aio_agents')
        .insert({
          owner_id: result.systemUserId,
          name: agent.name,
          slug: agent.slug,
          description: `Platform house agent — ${agent.model}`,
          color: agent.color,
          agent_type: 'api_key',
          provider: 'claude',
          model: agent.model,
          api_key_encrypted: encryptedKey,
          persona_style: agent.personaStyle,
          strategy: agent.strategy,
          is_active: true,
          is_public: true,
          verification_status: 'verified',
          last_verified_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (agentErr || !created) {
        result.errors.push(`Agent ${agent.name}: ${agentErr?.message}`);
        continue;
      }

      agentIds.set(agent.slug, created.id);
      result.agentsCreated++;
    }

    if (agentIds.size < 2) {
      return res.status(500).json({ error: 'Need at least 2 house agents', result });
    }

    // 3. Seed one competition per domain config
    for (const domainConfig of SEED_DOMAIN_CONFIGS) {
      const { data: domain } = await serviceClient
        .from('aio_domains')
        .select('id')
        .eq('slug', domainConfig.slug)
        .single();

      if (!domain) {
        result.errors.push(`Domain not found: ${domainConfig.slug}`);
        continue;
      }

      // Skip if an active competition with this name already exists
      const { data: existing } = await serviceClient
        .from('aio_competitions')
        .select('id')
        .eq('domain_id', domain.id)
        .eq('name', domainConfig.name)
        .in('status', ['lobby', 'running', 'scheduled'])
        .eq('auto_start', true)
        .limit(1);

      if (existing && existing.length > 0) {
        result.competitionsSkipped++;
        continue;
      }

      const scheduledStart = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const { data: comp, error: compErr } = await serviceClient
        .from('aio_competitions')
        .insert({
          name: domainConfig.name,
          description: domainConfig.description,
          domain_id: domain.id,
          task_ids: domainConfig.taskIds,
          max_participants: 4,
          stake_mode: 'sandbox',
          entry_fee: 0,
          status: 'lobby',
          scheduled_start: scheduledStart,
          auto_start: true,
          recurrence_interval: domainConfig.recurrence,
          created_by: result.systemUserId,
        })
        .select('id')
        .single();

      if (compErr || !comp) {
        result.errors.push(`Competition ${domainConfig.name}: ${compErr?.message}`);
        continue;
      }

      // Add all house agents as participants
      const participants = Array.from(agentIds.values()).map(agentId => ({
        competition_id: comp.id,
        agent_id: agentId,
        user_id: result.systemUserId,
      }));

      const { error: partErr } = await serviceClient
        .from('aio_competition_participants')
        .insert(participants);

      if (partErr) {
        result.errors.push(`Participants for ${domainConfig.name}: ${partErr.message}`);
      }

      result.competitionsCreated++;
    }

    log.info('Demo seed completed', result);
    res.json({ success: true, result });
  } catch (err: unknown) {
    log.error('Seed failed', { error: err });
    res.status(500).json({ error: 'Seed failed', result });
  }
});

export default router;
