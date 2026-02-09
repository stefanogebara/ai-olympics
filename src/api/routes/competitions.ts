import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('CompetitionsAPI');

const router = Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Middleware to verify JWT token from Supabase
async function requireAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    (req as any).user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// List competitions
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      domain,
      status,
      mode,
      limit = 50,
      offset = 0
    } = req.query;

    let query = supabase
      .from('aio_competitions')
      .select(`
        *,
        domain:aio_domains(*),
        participant_count:aio_competition_participants(count)
      `)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (domain) {
      const { data: domainData } = await supabase
        .from('aio_domains')
        .select('id')
        .eq('slug', domain)
        .single();

      if (domainData) {
        query = query.eq('domain_id', domainData.id);
      }
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (mode) {
      query = query.eq('stake_mode', mode);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Process participant count
    const competitions = data?.map((c: any) => ({
      ...c,
      participant_count: Array.isArray(c.participant_count)
        ? c.participant_count[0]?.count || 0
        : 0
    }));

    res.json(competitions);
  } catch (error) {
    log.error('Failed to list competitions', { error });
    res.status(500).json({ error: 'Failed to list competitions' });
  }
});

// Get single competition
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('aio_competitions')
      .select(`
        *,
        domain:aio_domains(*),
        participants:aio_competition_participants(
          *,
          agent:aio_agents(id, name, slug, color, elo_rating),
          user:aio_profiles(username)
        ),
        creator:aio_profiles(username)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    res.json(data);
  } catch (error) {
    log.error('Failed to get competition', { error });
    res.status(500).json({ error: 'Failed to get competition' });
  }
});

// Create competition (requires auth)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      name,
      domain_slug,
      stake_mode = 'sandbox',
      entry_fee = 0,
      max_participants = 8,
      scheduled_start
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Competition name is required' });
    }

    // Get domain ID if provided
    let domain_id = null;
    if (domain_slug) {
      const { data: domain } = await supabase
        .from('aio_domains')
        .select('id')
        .eq('slug', domain_slug)
        .single();
      domain_id = domain?.id;
    }

    const { data, error } = await supabase
      .from('aio_competitions')
      .insert({
        name,
        domain_id,
        stake_mode,
        status: 'lobby',
        entry_fee: stake_mode === 'sandbox' ? 0 : entry_fee,
        max_participants,
        created_by: user.id,
        scheduled_start: scheduled_start || null
      })
      .select(`
        *,
        domain:aio_domains(*)
      `)
      .single();

    if (error) throw error;

    log.info('Competition created', { competitionId: data.id, userId: user.id });
    res.status(201).json(data);
  } catch (error) {
    log.error('Failed to create competition', { error });
    res.status(500).json({ error: 'Failed to create competition' });
  }
});

// Join competition (requires auth)
router.post('/:id/join', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    // Verify competition is open
    const { data: competition } = await supabase
      .from('aio_competitions')
      .select('*, participant_count:aio_competition_participants(count)')
      .eq('id', id)
      .single();

    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    if (competition.status !== 'lobby') {
      return res.status(400).json({ error: 'Competition is not accepting participants' });
    }

    const currentCount = Array.isArray(competition.participant_count)
      ? competition.participant_count[0]?.count || 0
      : 0;

    if (currentCount >= competition.max_participants) {
      return res.status(400).json({ error: 'Competition is full' });
    }

    // Verify agent ownership
    const { data: agent } = await supabase
      .from('aio_agents')
      .select('id, owner_id, is_active, verification_status, last_verified_at')
      .eq('id', agent_id)
      .single();

    if (!agent || agent.owner_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to use this agent' });
    }

    if (!agent.is_active) {
      return res.status(400).json({ error: 'Agent is not active' });
    }

    // Check agent verification status (reverse CAPTCHA gate)
    if (
      agent.verification_status !== 'verified' ||
      !agent.last_verified_at ||
      Date.now() - new Date(agent.last_verified_at).getTime() > 24 * 60 * 60 * 1000
    ) {
      return res.status(403).json({
        error: 'Agent must pass verification before joining competitions',
        verification_required: true,
      });
    }

    // Join competition
    const { data, error } = await supabase
      .from('aio_competition_participants')
      .insert({
        competition_id: id,
        agent_id,
        user_id: user.id
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Already joined with this agent' });
      }
      throw error;
    }

    log.info('User joined competition', { competitionId: id, agentId: agent_id, userId: user.id });
    res.status(201).json(data);
  } catch (error) {
    log.error('Failed to join competition', { error });
    res.status(500).json({ error: 'Failed to join competition' });
  }
});

// Leave competition (requires auth)
router.delete('/:id/leave', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    // Verify competition is still in lobby
    const { data: competition } = await supabase
      .from('aio_competitions')
      .select('status')
      .eq('id', id)
      .single();

    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    if (competition.status !== 'lobby') {
      return res.status(400).json({ error: 'Cannot leave a competition that has started' });
    }

    const { error } = await supabase
      .from('aio_competition_participants')
      .delete()
      .eq('competition_id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    log.info('User left competition', { competitionId: id, userId: user.id });
    res.status(204).send();
  } catch (error) {
    log.error('Failed to leave competition', { error });
    res.status(500).json({ error: 'Failed to leave competition' });
  }
});

// Start competition (creator only)
router.post('/:id/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    // Verify ownership
    const { data: competition } = await supabase
      .from('aio_competitions')
      .select('*, participant_count:aio_competition_participants(count)')
      .eq('id', id)
      .single();

    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    if (competition.created_by !== user.id) {
      return res.status(403).json({ error: 'Only the creator can start the competition' });
    }

    if (competition.status !== 'lobby') {
      return res.status(400).json({ error: 'Competition has already started' });
    }

    const participantCount = Array.isArray(competition.participant_count)
      ? competition.participant_count[0]?.count || 0
      : 0;

    if (participantCount < 2) {
      return res.status(400).json({ error: 'Need at least 2 participants to start' });
    }

    // Update status
    const { data, error } = await supabase
      .from('aio_competitions')
      .update({
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    log.info('Competition started', { competitionId: id, userId: user.id });

    // In a real implementation, this would trigger the competition orchestrator
    // For now, just return the updated competition
    res.json(data);
  } catch (error) {
    log.error('Failed to start competition', { error });
    res.status(500).json({ error: 'Failed to start competition' });
  }
});

// Get domains
router.get('/domains/list', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('aio_domains')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    log.error('Failed to list domains', { error });
    res.status(500).json({ error: 'Failed to list domains' });
  }
});

export default router;
