/**
 * Prediction Markets - Competition results endpoints
 */

import { Router, Request, Response } from 'express';
import { virtualPortfolioManager } from '../../../services/virtual-portfolio.js';
import { createLogger } from '../../../shared/utils/logger.js';

const router = Router();
const log = createLogger('PredictionMarketsAPI');

/**
 * GET /api/predictions/competitions/:id/results
 * Get competition results and scores
 */
router.get('/:id/results', (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.id);
    const scores = virtualPortfolioManager.calculateFinalScores(competitionId);

    res.json({
      competitionId,
      results: scores,
      timestamp: Date.now(),
    });
  } catch (error) {
    log.error('Error calculating competition results', { error: String(error) });
    res.status(500).json({ error: 'Failed to calculate results' });
  }
});

/**
 * GET /api/predictions/competitions/:id/portfolios
 * Get all portfolios for a competition
 */
router.get('/:id/portfolios', (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.id);
    const portfolios = virtualPortfolioManager.getCompetitionPortfolios(competitionId);

    res.json({
      competitionId,
      portfolios,
      count: portfolios.length,
    });
  } catch (error) {
    log.error('Error fetching competition portfolios', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch portfolios' });
  }
});

export default router;
