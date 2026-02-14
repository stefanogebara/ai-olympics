import { Router, Request, Response } from 'express';
import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { createLogger } from '../../shared/utils/logger.js';
import { tournamentManager } from '../../orchestrator/tournament-manager.js';

const log = createLogger('TournamentsAPI');

const router = Router();

// List tournaments
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    // M1: Clamp pagination limits
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
    const safeOffset = Math.max(0, Number(offset) || 0);

    let query = supabase
      .from('aio_tournaments')
      .select(`
        *,
        domain:aio_domains(*),
        participant_count:aio_tournament_participants(count)
      `)
      .order('created_at', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    const tournaments = data?.map((t: { participant_count: Array<{ count: number }> | number }) => ({
      ...t,
      participant_count: Array.isArray(t.participant_count)
        ? t.participant_count[0]?.count || 0
        : 0
    }));

    res.json(tournaments);
  } catch (error) {
    log.error('Failed to list tournaments', { error });
    res.status(500).json({ error: 'Failed to list tournaments' });
  }
});

// Get single tournament with participants and matches
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('aio_tournaments')
      .select(`
        *,
        domain:aio_domains(*),
        participants:aio_tournament_participants(
          *,
          agent:aio_agents(id, name, slug, color, elo_rating),
          user:aio_profiles(username)
        ),
        matches:aio_tournament_matches(
          *,
          agent_1:aio_agents!aio_tournament_matches_agent_1_id_fkey(id, name, slug, color),
          agent_2:aio_agents!aio_tournament_matches_agent_2_id_fkey(id, name, slug, color)
        ),
        creator:aio_profiles(username)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    res.json(data);
  } catch (error) {
    log.error('Failed to get tournament', { error });
    res.status(500).json({ error: 'Failed to get tournament' });
  }
});

// Create tournament (requires auth)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userDb = (req as AuthenticatedRequest).userClient;
    const {
      name,
      domain_id,
      bracket_type = 'single-elimination',
      max_participants = 16,
      task_ids,
      best_of = 1,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Tournament name is required' });
    }

    if (!['single-elimination', 'double-elimination', 'round-robin', 'swiss'].includes(bracket_type)) {
      return res.status(400).json({ error: 'Invalid bracket type' });
    }

    const validTaskIds = Array.isArray(task_ids) && task_ids.every((t: unknown) => typeof t === 'string')
      ? task_ids
      : null;

    const { data, error } = await userDb
      .from('aio_tournaments')
      .insert({
        name,
        domain_id: domain_id || null,
        bracket_type,
        status: 'lobby',
        max_participants,
        task_ids: validTaskIds,
        best_of,
        created_by: user.id,
      })
      .select(`
        *,
        domain:aio_domains(*)
      `)
      .single();

    if (error) throw error;

    log.info('Tournament created', { tournamentId: data.id, userId: user.id });
    res.status(201).json(data);
  } catch (error) {
    log.error('Failed to create tournament', { error });
    res.status(500).json({ error: 'Failed to create tournament' });
  }
});

// Join tournament (requires auth)
router.post('/:id/join', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userDb = (req as AuthenticatedRequest).userClient;
    const { id } = req.params;
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    // Verify tournament is open (public read)
    const { data: tournament } = await supabase
      .from('aio_tournaments')
      .select('*, participant_count:aio_tournament_participants(count)')
      .eq('id', id)
      .single();

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== 'lobby') {
      return res.status(400).json({ error: 'Tournament is not accepting participants' });
    }

    const currentCount = Array.isArray(tournament.participant_count)
      ? tournament.participant_count[0]?.count || 0
      : 0;

    if (currentCount >= tournament.max_participants) {
      return res.status(400).json({ error: 'Tournament is full' });
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

    // H2: Verification gate - same as competitions
    if (
      agent.verification_status !== 'verified' ||
      !agent.last_verified_at ||
      Date.now() - new Date(agent.last_verified_at).getTime() > 24 * 60 * 60 * 1000
    ) {
      return res.status(403).json({
        error: 'Agent must pass verification before joining tournaments',
        verification_required: true,
      });
    }

    // H3: Use atomic join function to prevent race condition on participant count
    const { data: joinId, error } = await userDb
      .rpc('aio_join_tournament', {
        p_tournament_id: id,
        p_agent_id: agent_id,
        p_user_id: user.id,
      });

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Already joined with this agent' });
      }
      if (error.message?.includes('full')) {
        return res.status(400).json({ error: 'Tournament is full' });
      }
      throw error;
    }

    // Fetch the created participant (public read of newly created record)
    const { data: participant } = await supabase
      .from('aio_tournament_participants')
      .select('*')
      .eq('id', joinId)
      .single();

    log.info('User joined tournament', { tournamentId: id, agentId: agent_id, userId: user.id });
    res.status(201).json(participant);
  } catch (error) {
    log.error('Failed to join tournament', { error });
    res.status(500).json({ error: 'Failed to join tournament' });
  }
});

// Leave tournament (requires auth)
router.delete('/:id/leave', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userDb = (req as AuthenticatedRequest).userClient;
    const { id } = req.params;

    // Public read to check tournament status
    const { data: tournament } = await supabase
      .from('aio_tournaments')
      .select('status')
      .eq('id', id)
      .single();

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== 'lobby') {
      return res.status(400).json({ error: 'Cannot leave a tournament that has started' });
    }

    const { error } = await userDb
      .from('aio_tournament_participants')
      .delete()
      .eq('tournament_id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    log.info('User left tournament', { tournamentId: id, userId: user.id });
    res.status(204).send();
  } catch (error) {
    log.error('Failed to leave tournament', { error });
    res.status(500).json({ error: 'Failed to leave tournament' });
  }
});

// Start tournament (creator only)
router.post('/:id/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userDb = (req as AuthenticatedRequest).userClient;
    const { id } = req.params;

    // Use user-scoped client to verify ownership
    const { data: tournament } = await userDb
      .from('aio_tournaments')
      .select('*, participant_count:aio_tournament_participants(count)')
      .eq('id', id)
      .single();

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.created_by !== user.id) {
      return res.status(403).json({ error: 'Only the creator can start the tournament' });
    }

    if (tournament.status !== 'lobby') {
      return res.status(400).json({ error: 'Tournament has already started' });
    }

    const participantCount = Array.isArray(tournament.participant_count)
      ? tournament.participant_count[0]?.count || 0
      : 0;

    if (participantCount < 2) {
      return res.status(400).json({ error: 'Need at least 2 participants to start' });
    }

    log.info('Tournament starting', { tournamentId: id, userId: user.id });

    // Fire-and-forget (uses serviceClient internally for system operations)
    const tournamentId = String(id);
    tournamentManager.startTournament(tournamentId).catch(async (err) => {
      log.error('Tournament orchestrator failed', {
        tournamentId: id,
        error: err instanceof Error ? err.message : String(err),
      });
      await supabase
        .from('aio_tournaments')
        .update({ status: 'lobby', started_at: null })
        .eq('id', tournamentId)
        .eq('status', 'running');
    });

    res.json({ message: 'Tournament starting', tournamentId: id });
  } catch (error) {
    log.error('Failed to start tournament', { error });
    res.status(500).json({ error: 'Failed to start tournament' });
  }
});

// Get bracket data
router.get('/:id/bracket', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if tournament is active in memory
    const controller = tournamentManager.getActiveTournament(String(id));
    if (controller) {
      const tournament = controller.getTournament();
      return res.json({
        bracket: controller.getBracket(),
        standings: controller.getStandings(),
        rounds: tournament?.rounds.map(r => ({
          id: r.id,
          roundNumber: r.roundNumber,
          name: r.name,
          status: r.status,
          matches: r.matches,
        })),
        status: tournament?.status,
      });
    }

    // Fall back to DB
    const { data: tournament, error } = await supabase
      .from('aio_tournaments')
      .select('bracket_data, status')
      .eq('id', id)
      .single();

    if (error || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Also fetch matches from DB for completed tournaments
    const { data: matches } = await supabase
      .from('aio_tournament_matches')
      .select(`
        *,
        agent_1:aio_agents!aio_tournament_matches_agent_1_id_fkey(id, name, slug, color),
        agent_2:aio_agents!aio_tournament_matches_agent_2_id_fkey(id, name, slug, color)
      `)
      .eq('tournament_id', id)
      .order('round_number')
      .order('match_number');

    res.json({
      bracket_data: tournament.bracket_data,
      matches: matches || [],
      status: tournament.status,
    });
  } catch (error) {
    log.error('Failed to get bracket', { error });
    res.status(500).json({ error: 'Failed to get bracket data' });
  }
});

export default router;
