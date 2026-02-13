import { Router, Request, Response } from 'express';
import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { createLogger } from '../../shared/utils/logger.js';
import { championshipService } from '../../services/championship-service.js';

const log = createLogger('ChampionshipsAPI');

const router = Router();

// List championships
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    // M1: Clamp pagination limits
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
    const safeOffset = Math.max(0, Number(offset) || 0);

    let query = supabase
      .from('aio_championships')
      .select(`
        *,
        domain:aio_domains(*),
        participant_count:aio_championship_participants(count)
      `)
      .order('created_at', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    const championships = data?.map((c: any) => ({
      ...c,
      participant_count: Array.isArray(c.participant_count)
        ? c.participant_count[0]?.count || 0
        : 0,
    }));

    res.json(championships);
  } catch (error) {
    log.error('Failed to list championships', { error });
    res.status(500).json({ error: 'Failed to list championships' });
  }
});

// Get single championship with participants, rounds, and standings
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('aio_championships')
      .select(`
        *,
        domain:aio_domains(*),
        participants:aio_championship_participants(
          *,
          agent:aio_agents(id, name, slug, color, elo_rating),
          user:aio_profiles(username)
        ),
        rounds:aio_championship_rounds(
          *,
          results:aio_championship_round_results(*)
        ),
        creator:aio_profiles(username)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Championship not found' });
    }

    res.json(data);
  } catch (error) {
    log.error('Failed to get championship', { error });
    res.status(500).json({ error: 'Failed to get championship' });
  }
});

// Get championship standings
router.get('/:id/standings', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const standings = await championshipService.getStandings(id);
    res.json(standings);
  } catch (error) {
    log.error('Failed to get standings', { error });
    res.status(500).json({ error: 'Failed to get standings' });
  }
});

// Create championship (requires auth)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const {
      name,
      domain_id,
      total_rounds = 3,
      format = 'points',
      points_config,
      elimination_after_round,
      max_participants = 32,
      entry_requirements,
      registration_deadline,
      task_ids,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Championship name is required' });
    }

    if (!['points', 'elimination', 'hybrid'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Must be points, elimination, or hybrid' });
    }

    const championship = await championshipService.createChampionship({
      name,
      domain_id,
      total_rounds,
      format,
      points_config,
      elimination_after_round,
      max_participants,
      entry_requirements,
      created_by: user.id,
      registration_deadline,
      task_ids,
    });

    log.info('Championship created', { championshipId: championship.id, userId: user.id });
    res.status(201).json(championship);
  } catch (error) {
    log.error('Failed to create championship', { error });
    res.status(500).json({ error: 'Failed to create championship' });
  }
});

// Join championship (requires auth)
router.post('/:id/join', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const id = String(req.params.id);
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    const participant = await championshipService.joinChampionship(id, agent_id, user.id);

    log.info('User joined championship', { championshipId: id, agentId: agent_id, userId: user.id });
    res.status(201).json(participant);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to join championship';
    const statusCode = message.includes('not found') ? 404
      : message.includes('Not authorized') ? 403
      : message.includes('Already joined') ? 400
      : message.includes('not accepting') || message.includes('full') || message.includes('ELO') ? 400
      : 500;
    res.status(statusCode).json({ error: message });
  }
});

// Leave championship (requires auth)
router.delete('/:id/leave', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userDb = (req as AuthenticatedRequest).userClient;
    const id = String(req.params.id);

    // Verify championship is still in registration (public read)
    const { data: championship } = await supabase
      .from('aio_championships')
      .select('status')
      .eq('id', id)
      .single();

    if (!championship) {
      return res.status(404).json({ error: 'Championship not found' });
    }

    if (championship.status !== 'registration') {
      return res.status(400).json({ error: 'Cannot leave a championship that has already started' });
    }

    const { error: deleteErr } = await userDb
      .from('aio_championship_participants')
      .delete()
      .eq('championship_id', id)
      .eq('user_id', user.id);

    if (deleteErr) throw deleteErr;

    log.info('User left championship', { championshipId: id, userId: user.id });
    res.json({ message: 'Left championship' });
  } catch (error) {
    log.error('Failed to leave championship', { error });
    res.status(500).json({ error: 'Failed to leave championship' });
  }
});

// Start next round (creator only)
router.post('/:id/start-round', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userDb = (req as AuthenticatedRequest).userClient;
    const id = String(req.params.id);

    // Verify creator (user-scoped query)
    const { data: championship } = await userDb
      .from('aio_championships')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!championship) {
      return res.status(404).json({ error: 'Championship not found' });
    }

    if (championship.created_by !== user.id) {
      return res.status(403).json({ error: 'Only the creator can start rounds' });
    }

    const result = await championshipService.startNextRound(id);

    log.info('Championship round starting', { championshipId: id, ...result });
    res.json({ message: 'Round starting', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start round';
    res.status(400).json({ error: message });
  }
});

// Process round results (creator only)
router.post('/:id/process-round/:roundNumber', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userDb = (req as AuthenticatedRequest).userClient;
    const id = String(req.params.id);
    const roundNumber = parseInt(String(req.params.roundNumber), 10);

    if (isNaN(roundNumber) || roundNumber < 1) {
      return res.status(400).json({ error: 'Invalid round number' });
    }

    // Verify creator (user-scoped query)
    const { data: championship } = await userDb
      .from('aio_championships')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!championship) {
      return res.status(404).json({ error: 'Championship not found' });
    }

    if (championship.created_by !== user.id) {
      return res.status(403).json({ error: 'Only the creator can process round results' });
    }

    await championshipService.processRoundResults(id, roundNumber);

    log.info('Championship round processed', { championshipId: id, roundNumber });
    res.json({ message: 'Round results processed', roundNumber });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process round';
    res.status(400).json({ error: message });
  }
});

// Get round results
router.get('/:id/rounds/:roundNumber/results', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const roundNumber = parseInt(String(req.params.roundNumber), 10);

    const { data: round } = await supabase
      .from('aio_championship_rounds')
      .select(`
        *,
        results:aio_championship_round_results(
          *,
          participant:aio_championship_participants(
            *,
            agent:aio_agents(id, name, slug, color, elo_rating)
          )
        )
      `)
      .eq('championship_id', id)
      .eq('round_number', roundNumber)
      .single();

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    res.json(round);
  } catch (error) {
    log.error('Failed to get round results', { error });
    res.status(500).json({ error: 'Failed to get round results' });
  }
});

export default router;
