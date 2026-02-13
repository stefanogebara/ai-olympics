/**
 * Meta Markets API Routes
 * Endpoints for betting on AI competition outcomes
 */

import { Router, Request, Response } from 'express';
import { requireAuth as authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { metaMarketService } from '../../services/meta-market-service.js';
import { createLogger } from '../../shared/utils/logger.js';

const router = Router();
const log = createLogger('MetaMarketsAPI');

// ============================================================================
// MARKET ENDPOINTS
// ============================================================================

/**
 * GET /api/meta-markets
 * List active meta markets
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const markets = await metaMarketService.getActiveMarkets();

    res.json({
      markets,
      count: markets.length
    });
  } catch (error) {
    log.error('Error fetching markets', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch markets' });
  }
});

/**
 * GET /api/meta-markets/:id
 * Get a specific market
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const marketId = String(req.params.id);
    const market = await metaMarketService.getMarket(marketId);

    if (!market) {
      return res.status(404).json({ error: 'Market not found' });
    }

    res.json(market);
  } catch (error) {
    log.error('Error fetching market', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch market' });
  }
});

/**
 * GET /api/meta-markets/competition/:competitionId
 * Get market for a specific competition
 */
router.get('/competition/:competitionId', async (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.competitionId);
    const market = await metaMarketService.getMarketByCompetition(competitionId);

    if (!market) {
      return res.status(404).json({ error: 'No market found for this competition' });
    }

    res.json(market);
  } catch (error) {
    log.error('Error fetching competition market', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch market' });
  }
});

/**
 * GET /api/meta-markets/:id/bets
 * Get all bets for a market
 */
router.get('/:id/bets', async (req: Request, res: Response) => {
  try {
    const marketId = String(req.params.id);
    const bets = await metaMarketService.getMarketBets(marketId);

    res.json({
      bets,
      count: bets.length
    });
  } catch (error) {
    log.error('Error fetching market bets', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch bets' });
  }
});

// ============================================================================
// BET ENDPOINTS
// ============================================================================

/**
 * POST /api/meta-markets/:id/bet
 * Place a bet on a market
 */
router.post('/:id/bet', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const marketId = String(req.params.id);
    const outcomeId = String(req.body.outcomeId);
    const amount = req.body.amount;

    if (!outcomeId || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: outcomeId, amount'
      });
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number'
      });
    }

    const result = await metaMarketService.placeBet(userId, marketId, outcomeId, betAmount);

    if (!result.success) {
      return res.status(400).json(result);
    }

    log.info(`User ${userId} placed bet on market ${marketId}`);
    res.json(result);
  } catch (error) {
    log.error('Error placing bet', { error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to place bet' });
  }
});

/**
 * GET /api/meta-markets/user/bets
 * Get authenticated user's meta market bets
 */
router.get('/user/bets', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);

    const bets = await metaMarketService.getUserBets(userId, limit);

    res.json({
      bets,
      count: bets.length
    });
  } catch (error) {
    log.error('Error fetching user bets', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch bets' });
  }
});

export default router;
