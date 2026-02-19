/**
 * Prediction Markets - Admin/utility endpoints
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { virtualPortfolioManager } from '../../../services/virtual-portfolio.js';
import { createLogger } from '../../../shared/utils/logger.js';

const router = Router();
const log = createLogger('PredictionMarketsAPI');

/**
 * POST /api/predictions/resolve-market
 * Manually resolve a market (admin only, requires auth)
 */
router.post('/resolve-market', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const { competitionId, marketId, resolvedOutcome } = req.body;

    if (!competitionId || !marketId || !resolvedOutcome) {
      return res.status(400).json({
        error: 'Missing required fields: competitionId, marketId, resolvedOutcome',
      });
    }

    // Get all portfolios for the competition and resolve the market
    const portfolios = virtualPortfolioManager.getCompetitionPortfolios(competitionId);

    for (const portfolio of portfolios) {
      virtualPortfolioManager.resolveMarket(portfolio.id, marketId, resolvedOutcome);
    }

    log.info(`Market ${marketId} resolved to ${resolvedOutcome} for competition ${competitionId}`);

    res.json({
      success: true,
      marketId,
      resolvedOutcome,
      portfoliosUpdated: portfolios.length,
    });
  } catch (error) {
    log.error('Error resolving market', { error: String(error) });
    res.status(500).json({ error: 'Failed to resolve market' });
  }
});

export default router;
