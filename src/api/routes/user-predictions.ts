/**
 * User Predictions API Routes
 * Endpoints for human user prediction market participation
 * Persistent portfolios, bets, positions, social features
 */

import { Router, Request, Response } from 'express';
import { requireAuth as authMiddleware } from '../middleware/auth.js';
import { userPortfolioService } from '../../services/user-portfolio-service.js';
import { createLogger } from '../../shared/utils/logger.js';

const router = Router();
const log = createLogger('UserPredictionsAPI');

// ============================================================================
// AUTH: Uses shared requireAuth middleware (imported as authMiddleware)
// The middleware attaches (req as any).user and (req as any).userClient
// ============================================================================

interface AuthenticatedRequest extends Request {
  userId?: string;
}

// ============================================================================
// PORTFOLIO ENDPOINTS
// ============================================================================

/**
 * GET /api/user/portfolio
 * Get the authenticated user's portfolio
 */
router.get('/portfolio', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const portfolio = await userPortfolioService.getOrCreatePortfolio(userId);

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
router.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const stats = await userPortfolioService.getStats(userId);

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
router.get('/limits', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const limits = await userPortfolioService.getLimits(userId);

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
router.post('/bets', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
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

    // Place the bet
    const result = await userPortfolioService.placeBet(userId, marketId, outcome, betAmount);

    if (!result.success) {
      return res.status(400).json(result);
    }

    log.info(`User ${userId} placed bet: M$${betAmount} on ${outcome} for market ${marketId}`);

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
router.get('/bets', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const offsetStr = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;

    const limit = Math.min(parseInt(limitStr as string) || 50, 100);
    const offset = parseInt(offsetStr as string) || 0;

    const bets = await userPortfolioService.getBets(userId, limit, offset);

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
router.get('/positions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const positions = await userPortfolioService.getPositions(userId);

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
router.post('/follow/:followedId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const followedId = String(req.params.followedId);

    if (userId === followedId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const success = await userPortfolioService.followTrader(userId, followedId);

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
router.delete('/follow/:followedId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const followedId = String(req.params.followedId);

    const success = await userPortfolioService.unfollowTrader(userId, followedId);

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
router.get('/following', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const following = await userPortfolioService.getFollowing(userId);

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
router.get('/followers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const followers = await userPortfolioService.getFollowers(userId);

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
router.get('/is-following/:checkId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const checkId = String(req.params.checkId);

    const isFollowing = await userPortfolioService.isFollowing(userId, checkId);

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
router.get('/feed', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 20, 50);

    const feed = await userPortfolioService.getFollowedTradesFeed(userId, limit);

    res.json({
      trades: feed,
      count: feed.length
    });
  } catch (error) {
    log.error('Error fetching feed', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

export default router;
