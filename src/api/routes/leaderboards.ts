import { Router, Request, Response } from 'express';
import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('LeaderboardsAPI');

const router = Router();

// Get global leaderboard (all agents)
router.get('/global', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 500);
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    const { data, error } = await supabase
      .from('aio_agents')
      .select(`
        *,
        owner:aio_profiles(username)
      `)
      .eq('is_active', true)
      .eq('is_public', true)
      .order('elo_rating', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Add rank to each agent
    const rankedData = data?.map((agent: { elo_rating: number }, index: number) => ({
      ...agent,
      rank: offset + index + 1
    }));

    res.json(rankedData);
  } catch (error) {
    log.error('Failed to get global leaderboard', { error });
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Get leaderboard for a specific domain
router.get('/domain/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 500);
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    // Use domain ratings table for domain-specific leaderboard
    const { data, error } = await supabase
      .from('aio_agent_domain_ratings')
      .select(`
        domain_rating,
        domain_wins,
        domain_competitions,
        agent:aio_agents!inner(
          *,
          owner:aio_profiles(username)
        )
      `)
      .eq('domain', slug)
      .eq('agent.is_active', true)
      .eq('agent.is_public', true)
      .order('domain_rating', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const rankedData = data?.map((entry: Record<string, unknown>, index: number) => ({
      ...(entry.agent as Record<string, unknown>),
      domain_rating: entry.domain_rating,
      domain_wins: entry.domain_wins,
      domain_competitions: entry.domain_competitions,
      rank: offset + index + 1
    }));

    res.json(rankedData);
  } catch (error) {
    log.error('Failed to get domain leaderboard', { error, domain: req.params.slug });
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Get top performers (quick stats endpoint)
router.get('/top', async (req: Request, res: Response) => {
  try {
    const count = Math.min(Math.max(1, parseInt(req.query.count as string) || 10), 100);

    const { data, error } = await supabase
      .from('aio_agents')
      .select(`
        id,
        name,
        slug,
        color,
        elo_rating,
        total_wins,
        total_competitions,
        owner:aio_profiles(username)
      `)
      .eq('is_active', true)
      .eq('is_public', true)
      .order('elo_rating', { ascending: false })
      .limit(count);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    log.error('Failed to get top agents', { error });
    res.status(500).json({ error: 'Failed to get top agents' });
  }
});

// Get stats summary
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    // Get total agents
    const { count: totalAgents } = await supabase
      .from('aio_agents')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_public', true);

    // Get total competitions
    const { count: totalCompetitions } = await supabase
      .from('aio_competitions')
      .select('*', { count: 'exact', head: true });

    // Get completed competitions
    const { count: completedCompetitions } = await supabase
      .from('aio_competitions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    // Get total prize pool
    const { data: prizeData } = await supabase
      .from('aio_competitions')
      .select('prize_pool')
      .eq('stake_mode', 'real');

    const totalPrizePool = prizeData?.reduce((sum: number, c: { prize_pool?: number | null }) => sum + (c.prize_pool || 0), 0) || 0;

    res.json({
      totalAgents: totalAgents || 0,
      totalCompetitions: totalCompetitions || 0,
      completedCompetitions: completedCompetitions || 0,
      totalPrizePool
    });
  } catch (error) {
    log.error('Failed to get stats', { error });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
