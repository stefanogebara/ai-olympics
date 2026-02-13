import { Router, Request, Response } from 'express';
import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '../../shared/utils/logger.js';
import { competitionManager } from '../../orchestrator/competition-manager.js';

const log = createLogger('CompetitionsAPI');

// Concurrency limit: max simultaneous running competitions
const MAX_CONCURRENT_COMPETITIONS = parseInt(process.env.MAX_CONCURRENT_COMPETITIONS || '10', 10);

const router = Router();

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

    // M1: Clamp pagination limits
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
    const safeOffset = Math.max(0, Number(offset) || 0);

    let query = supabase
      .from('aio_competitions')
      .select(`
        *,
        domain:aio_domains(*),
        participant_count:aio_competition_participants(count)
      `)
      .order('created_at', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

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
    const userDb = (req as any).userClient;
    const {
      name,
      domain_slug,
      stake_mode = 'sandbox',
      entry_fee = 0,
      max_participants = 8,
      scheduled_start,
      task_ids
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Competition name is required' });
    }

    // Abuse detection: max 3 competitions per hour per user (RLS-scoped via userDb above)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await userDb
      .from('aio_competitions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .gte('created_at', oneHourAgo);

    if ((recentCount || 0) >= 3) {
      return res.status(429).json({ error: 'Rate limit: maximum 3 competitions per hour. Please wait and try again.' });
    }

    // Feature flag: real-money competitions disabled until legal review
    const REAL_MONEY_ENABLED = process.env.ENABLE_REAL_MONEY_TRADING === 'true';

    // M6: Validate stake_mode, entry_fee, max_participants
    const ALLOWED_STAKE_MODES = REAL_MONEY_ENABLED
      ? ['sandbox', 'real', 'spectator']
      : ['sandbox', 'spectator'];
    if (!ALLOWED_STAKE_MODES.includes(stake_mode)) {
      const msg = REAL_MONEY_ENABLED
        ? `Invalid stake_mode. Must be one of: ${ALLOWED_STAKE_MODES.join(', ')}`
        : 'Real-money competitions are currently disabled. Use sandbox mode.';
      return res.status(400).json({ error: msg });
    }
    if (typeof entry_fee !== 'number' || entry_fee < 0 || entry_fee > 10000) {
      return res.status(400).json({ error: 'entry_fee must be a number between 0 and 10000' });
    }
    const parsedMax = Number(max_participants);
    if (!Number.isInteger(parsedMax) || parsedMax < 2 || parsedMax > 64) {
      return res.status(400).json({ error: 'max_participants must be an integer between 2 and 64' });
    }

    // Get domain ID if provided (public data, service client ok)
    let domain_id = null;
    if (domain_slug) {
      const { data: domain } = await supabase
        .from('aio_domains')
        .select('id')
        .eq('slug', domain_slug)
        .single();
      domain_id = domain?.id;
    }

    // Validate task_ids if provided
    const validTaskIds = Array.isArray(task_ids) && task_ids.every((t: unknown) => typeof t === 'string')
      ? task_ids
      : null;

    // Use user-scoped client for insert (respects RLS)
    const { data, error } = await userDb
      .from('aio_competitions')
      .insert({
        name,
        domain_id,
        stake_mode,
        status: 'lobby',
        entry_fee: stake_mode === 'sandbox' ? 0 : entry_fee,
        max_participants,
        created_by: user.id,
        scheduled_start: scheduled_start || null,
        task_ids: validTaskIds
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
    const userDb = (req as any).userClient;
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

    // Verify agent ownership (user-scoped query enforces RLS)
    const { data: agent } = await userDb
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

    // Join competition (user-scoped insert)
    const { data, error } = await userDb
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
    const userDb = (req as any).userClient;
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

    const { error } = await userDb
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

    // Verify ownership (RLS-scoped - user can only see their competitions)
    const userDb = (req as any).userClient;
    const { data: competition } = await userDb
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

    // Check concurrency limit
    const activeCount = competitionManager.activeCount;
    if (activeCount >= MAX_CONCURRENT_COMPETITIONS) {
      log.warn('Competition start blocked by concurrency limit', {
        activeCount,
        limit: MAX_CONCURRENT_COMPETITIONS,
        competitionId: id,
      });
      return res.status(429).json({
        error: `Server is at capacity (${activeCount}/${MAX_CONCURRENT_COMPETITIONS} competitions running). Please try again later.`,
      });
    }

    // Update status (RLS-scoped - user can only update their competitions)
    const { data, error } = await userDb
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

    // Fire-and-forget: trigger the competition orchestrator in the background
    const competitionId = String(id);
    competitionManager.startCompetition(competitionId, { taskIds: data.task_ids }).catch(async (err) => {
      log.error('Competition orchestrator failed', {
        competitionId: id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Revert is handled inside competitionManager.startCompetition, but
      // guard against edge cases where it didn't revert
      await supabase
        .from('aio_competitions')
        .update({ status: 'lobby', started_at: null })
        .eq('id', competitionId)
        .eq('status', 'running'); // Only revert if still running
    });

    res.json(data);
  } catch (error) {
    log.error('Failed to start competition', { error });
    res.status(500).json({ error: 'Failed to start competition' });
  }
});

// Get live competition state (in-memory, no auth required)
router.get('/:id/live', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const controller = competitionManager.getActiveCompetition(String(id));
    if (!controller) {
      return res.status(404).json({ error: 'No active competition with this ID' });
    }

    const competition = controller.getCompetition();
    res.json({
      id: competition?.id,
      name: competition?.name,
      status: competition?.status,
      currentEventIndex: competition?.currentEventIndex,
      leaderboard: controller.getLeaderboard(),
      events: competition?.events.map(e => ({
        id: e.id,
        taskName: e.task.name,
        status: e.status,
        resultCount: e.results.length,
      })),
    });
  } catch (error) {
    log.error('Failed to get live competition state', { error });
    res.status(500).json({ error: 'Failed to get live state' });
  }
});

// ============================================================================
// SPECTATOR VOTING
// ============================================================================

// Cast a vote (requires auth)
router.post('/:id/vote', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userDb = (req as any).userClient;
    const { id } = req.params;
    const { agent_id, vote_type } = req.body;

    if (!agent_id || !vote_type) {
      return res.status(400).json({ error: 'agent_id and vote_type are required' });
    }

    if (!['cheer', 'predict_win', 'mvp'].includes(vote_type)) {
      return res.status(400).json({ error: 'vote_type must be cheer, predict_win, or mvp' });
    }

    // Use user-scoped client for vote insert
    const { data, error } = await userDb
      .from('aio_spectator_votes')
      .insert({
        competition_id: id,
        agent_id,
        user_id: user.id,
        vote_type,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'You have already cast this vote type in this competition' });
      }
      throw error;
    }

    log.info('Vote cast', { competitionId: id, agentId: agent_id, voteType: vote_type, userId: user.id });
    res.status(201).json(data);
  } catch (error) {
    log.error('Failed to cast vote', { error });
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// Get vote counts for a competition (public)
router.get('/:id/votes', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('aio_spectator_votes')
      .select('agent_id, vote_type')
      .eq('competition_id', id);

    if (error) throw error;

    // Aggregate votes per agent
    const voteCounts: Record<string, { cheers: number; predict_win: number; mvp: number }> = {};
    for (const vote of data || []) {
      if (!voteCounts[vote.agent_id]) {
        voteCounts[vote.agent_id] = { cheers: 0, predict_win: 0, mvp: 0 };
      }
      if (vote.vote_type === 'cheer') voteCounts[vote.agent_id].cheers++;
      else if (vote.vote_type === 'predict_win') voteCounts[vote.agent_id].predict_win++;
      else if (vote.vote_type === 'mvp') voteCounts[vote.agent_id].mvp++;
    }

    res.json(voteCounts);
  } catch (error) {
    log.error('Failed to get votes', { error });
    res.status(500).json({ error: 'Failed to get votes' });
  }
});

// Remove a vote (requires auth)
router.delete('/:id/vote', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userDb = (req as any).userClient;
    const { id } = req.params;
    const { vote_type } = req.query;

    if (!vote_type) {
      return res.status(400).json({ error: 'vote_type query parameter is required' });
    }

    const { error } = await userDb
      .from('aio_spectator_votes')
      .delete()
      .eq('competition_id', id)
      .eq('user_id', user.id)
      .eq('vote_type', vote_type as string);

    if (error) throw error;

    log.info('Vote removed', { competitionId: id, voteType: vote_type, userId: user.id });
    res.status(204).send();
  } catch (error) {
    log.error('Failed to remove vote', { error });
    res.status(500).json({ error: 'Failed to remove vote' });
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
