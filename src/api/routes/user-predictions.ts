/**
 * User Predictions API Routes
 * Endpoints for human user prediction market participation
 * Persistent portfolios, bets, positions, social features
 */

import { Router, Request, Response } from 'express';
import { requireAuth as authMiddleware, requireNotExcluded, type AuthenticatedRequest } from '../middleware/auth.js';
import { userPortfolioService } from '../../services/user-portfolio-service.js';
import { serviceClient } from '../../shared/utils/supabase.js';
import { createLogger } from '../../shared/utils/logger.js';

const router = Router();
const log = createLogger('UserPredictionsAPI');

// ============================================================================
// PORTFOLIO ENDPOINTS
// ============================================================================

/**
 * GET /api/user/portfolio
 * Get the authenticated user's portfolio
 */
router.get('/portfolio', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const portfolio = await userPortfolioService.getOrCreatePortfolio(user.id, userClient);

    if (!portfolio) {
      return res.status(500).json({ error: 'Failed to get portfolio' });
    }

    res.json(portfolio);
  } catch (error) {
    log.error('Error fetching portfolio', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

/**
 * GET /api/user/stats
 * Get the authenticated user's trading stats
 */
router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const stats = await userPortfolioService.getStats(user.id, userClient);

    if (!stats) {
      return res.status(500).json({ error: 'Failed to get stats' });
    }

    res.json(stats);
  } catch (error) {
    log.error('Error fetching stats', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================================================
// LIMITS ENDPOINT
// ============================================================================

/**
 * GET /api/user/limits
 * Get the authenticated user's betting limits and usage
 */
router.get('/limits', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const limits = await userPortfolioService.getLimits(user.id, userClient);

    if (!limits) {
      return res.status(500).json({ error: 'Failed to get limits' });
    }

    res.json(limits);
  } catch (error) {
    log.error('Error fetching limits', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch limits' });
  }
});

// ============================================================================
// BET ENDPOINTS
// ============================================================================

/**
 * POST /api/user/bets
 * Place a bet
 */
router.post('/bets', authMiddleware, requireNotExcluded, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const { marketId, outcome, amount } = req.body;

    // Validate required fields
    if (!marketId || !outcome || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: marketId, outcome, amount'
      });
    }

    // Validate amount
    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number'
      });
    }

    // Place the bet (user-scoped client enforces RLS)
    const result = await userPortfolioService.placeBet(user.id, marketId, outcome, betAmount, userClient);

    if (!result.success) {
      return res.status(400).json(result);
    }

    log.info(`User ${user.id} placed bet: M$${betAmount} on ${outcome} for market ${marketId}`);

    res.json(result);
  } catch (error) {
    log.error('Error placing bet', { error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to place bet' });
  }
});

/**
 * GET /api/user/bets
 * Get user's bet history
 */
router.get('/bets', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const offsetStr = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;

    const limit = Math.min(parseInt(limitStr as string) || 50, 100);
    const offset = parseInt(offsetStr as string) || 0;

    const bets = await userPortfolioService.getBets(user.id, limit, offset, userClient);

    res.json({
      bets,
      limit,
      offset,
      hasMore: bets.length === limit
    });
  } catch (error) {
    log.error('Error fetching bets', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch bets' });
  }
});

// ============================================================================
// POSITION ENDPOINTS
// ============================================================================

/**
 * GET /api/user/positions
 * Get user's open positions
 */
router.get('/positions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const positions = await userPortfolioService.getPositions(user.id, userClient);

    res.json({
      positions,
      count: positions.length
    });
  } catch (error) {
    log.error('Error fetching positions', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// ============================================================================
// LEADERBOARD ENDPOINTS
// ============================================================================

/**
 * GET /api/user/leaderboard
 * Get prediction market leaderboard
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const offsetStr = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;

    const limit = Math.min(parseInt(limitStr as string) || 50, 100);
    const offset = parseInt(offsetStr as string) || 0;

    const leaderboard = await userPortfolioService.getLeaderboard(limit, offset);

    res.json({
      leaderboard,
      limit,
      offset,
      hasMore: leaderboard.length === limit
    });
  } catch (error) {
    log.error('Error fetching leaderboard', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ============================================================================
// SOCIAL ENDPOINTS
// ============================================================================

/**
 * POST /api/user/follow/:userId
 * Follow a trader
 */
router.post('/follow/:followedId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const followedId = String(req.params.followedId);

    if (user.id === followedId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const success = await userPortfolioService.followTrader(user.id, followedId, userClient);

    if (!success) {
      return res.status(500).json({ error: 'Failed to follow trader' });
    }

    res.json({ success: true, following: true });
  } catch (error) {
    log.error('Error following trader', { error: String(error) });
    res.status(500).json({ error: 'Failed to follow trader' });
  }
});

/**
 * DELETE /api/user/follow/:userId
 * Unfollow a trader
 */
router.delete('/follow/:followedId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const followedId = String(req.params.followedId);

    const success = await userPortfolioService.unfollowTrader(user.id, followedId, userClient);

    if (!success) {
      return res.status(500).json({ error: 'Failed to unfollow trader' });
    }

    res.json({ success: true, following: false });
  } catch (error) {
    log.error('Error unfollowing trader', { error: String(error) });
    res.status(500).json({ error: 'Failed to unfollow trader' });
  }
});

/**
 * GET /api/user/following
 * Get list of traders user is following
 */
router.get('/following', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const following = await userPortfolioService.getFollowing(user.id, userClient);

    res.json({
      following,
      count: following.length
    });
  } catch (error) {
    log.error('Error fetching following', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch following' });
  }
});

/**
 * GET /api/user/followers
 * Get list of user's followers
 */
router.get('/followers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const followers = await userPortfolioService.getFollowers(user.id, userClient);

    res.json({
      followers,
      count: followers.length
    });
  } catch (error) {
    log.error('Error fetching followers', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

/**
 * GET /api/user/is-following/:userId
 * Check if user is following another
 */
router.get('/is-following/:checkId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const checkId = String(req.params.checkId);

    const isFollowing = await userPortfolioService.isFollowing(user.id, checkId, userClient);

    res.json({ isFollowing });
  } catch (error) {
    log.error('Error checking follow status', { error: String(error) });
    res.status(500).json({ error: 'Failed to check follow status' });
  }
});

/**
 * GET /api/user/feed
 * Get trades from followed traders
 */
router.get('/feed', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 20, 50);

    const feed = await userPortfolioService.getFollowedTradesFeed(user.id, limit, userClient);

    res.json({
      trades: feed,
      count: feed.length
    });
  } catch (error) {
    log.error('Error fetching feed', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// ============================================================================
// SELF-EXCLUSION ENDPOINT
// ============================================================================

const SELF_EXCLUSION_DAYS = new Set([30, 90, 180]);

/**
 * POST /api/user/self-exclude
 * Activate a self-exclusion period (pause betting for 30/90/180 days).
 * Once set, cannot be shortened — only extended.
 */
router.post('/self-exclude', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const days = parseInt(req.body?.days);

    if (!SELF_EXCLUSION_DAYS.has(days)) {
      return res.status(400).json({
        error: 'Invalid exclusion period. Must be 30, 90, or 180 days.',
      });
    }

    const pausedUntil = new Date();
    pausedUntil.setDate(pausedUntil.getDate() + days);

    // Only allow extending an existing pause, not shortening it
    const { data: current } = await serviceClient
      .from('aio_profiles')
      .select('betting_paused_until')
      .eq('id', user.id)
      .single();

    if (
      current?.betting_paused_until &&
      new Date(current.betting_paused_until) > pausedUntil
    ) {
      return res.status(400).json({
        error: 'Cannot shorten an active self-exclusion period.',
        pausedUntil: current.betting_paused_until,
      });
    }

    const { error } = await serviceClient
      .from('aio_profiles')
      .update({ betting_paused_until: pausedUntil.toISOString() })
      .eq('id', user.id);

    if (error) throw error;

    log.info(`User ${user.id} activated self-exclusion for ${days} days`);

    res.json({ success: true, pausedUntil: pausedUntil.toISOString(), days });
  } catch (error) {
    log.error('Error setting self-exclusion', { error: String(error) });
    res.status(500).json({ error: 'Failed to set self-exclusion' });
  }
});

// ============================================================================
// GDPR DATA EXPORT ENDPOINT
// ============================================================================

/**
 * GET /api/user/export-data
 * Export all user data (GDPR Article 20 — right to data portability).
 * Returns profile, bets, positions, portfolio in a single JSON response.
 */
router.get('/export-data', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;

    const [profileResult, betsResult, positionsResult, portfolioResult] = await Promise.all([
      userClient.from('aio_profiles').select('*').eq('id', user.id).single(),
      userClient.from('aio_user_bets').select('*').eq('user_id', user.id).limit(1000),
      userClient.from('aio_user_positions').select('*').eq('user_id', user.id).limit(1000),
      userClient.from('aio_user_portfolios').select('*').eq('user_id', user.id).single(),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      userId: user.id,
      email: user.email,
      profile: profileResult.data,
      portfolio: portfolioResult.data,
      bets: betsResult.data ?? [],
      positions: positionsResult.data ?? [],
    };

    res.setHeader('Content-Disposition', 'attachment; filename="ai-olympics-data-export.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (error) {
    log.error('Error exporting user data', { error: String(error) });
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;
