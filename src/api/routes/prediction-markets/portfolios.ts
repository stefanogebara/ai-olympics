/**
 * Prediction Markets - Portfolio endpoints
 * GET/POST/DELETE portfolios + betting
 */

import { Router, Request, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth.js';
import { marketService } from '../../../services/market-service.js';
import { virtualPortfolioManager } from '../../../services/virtual-portfolio.js';
import { createLogger } from '../../../shared/utils/logger.js';
import { requireAuthOrAgent, type AgentAuthedRequest } from './types.js';

/**
 * Resolve the agentId the caller is allowed to act as, or return an error string.
 * - Agent-header path: can only act as its own verified agent, in its own competition.
 * - User-token path: must own the requested agent (RLS-scoped ownership check).
 */
async function resolveActingAgentId(
  req: Request,
  competitionId: string,
  requestedAgentId: string | undefined
): Promise<{ agentId: string } | { error: string; status: number }> {
  const agentAuth = (req as AgentAuthedRequest).agentAuth;
  if (agentAuth) {
    if (agentAuth.competitionId !== competitionId) {
      return { error: 'Agent is not authorized for this competition', status: 403 };
    }
    return { agentId: agentAuth.agentId };
  }

  const { user, userClient } = req as AuthenticatedRequest;
  if (!user || !requestedAgentId) {
    return { error: 'agentId is required', status: 400 };
  }
  const { data: owned } = await userClient
    .from('aio_agents')
    .select('id')
    .eq('id', requestedAgentId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!owned) {
    return { error: 'You do not own this agent', status: 403 };
  }
  return { agentId: requestedAgentId };
}

const router = Router();
const log = createLogger('PredictionMarketsAPI');

/**
 * GET /api/predictions/portfolios/:competitionId
 * Get portfolio for a competition (requires agentId query param)
 */
router.get('/:competitionId', async (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.competitionId);
    const agentId = (Array.isArray(req.query.agentId) ? req.query.agentId[0] : req.query.agentId) as string | undefined;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId query parameter is required' });
    }

    const portfolioId = await virtualPortfolioManager.getPortfolioId(agentId, competitionId);
    if (!portfolioId) {
      // Read-only endpoint: do NOT create a portfolio as a side effect (that let
      // any caller force-create arbitrary agents' portfolios). Portfolios are
      // created when the owning agent first places a bet.
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const portfolio = await virtualPortfolioManager.getPortfolio(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    res.json(portfolio);
  } catch (error) {
    log.error('Error fetching portfolio', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

/**
 * POST /api/predictions/portfolios/:competitionId/bets
 * Place a virtual bet (requires auth)
 */
router.post('/:competitionId/bets', requireAuthOrAgent, async (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.competitionId);
    const { marketId, outcome, amount } = req.body;

    // Bind the acting agent to the authenticated identity — the caller cannot
    // place bets on an agent it does not own / is not (closes the IDOR).
    const resolved = await resolveActingAgentId(req, competitionId, req.body.agentId);
    if ('error' in resolved) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }
    const agentId = resolved.agentId;

    // Validate required fields
    if (!marketId || !outcome || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: marketId, outcome, amount',
      });
    }

    // Validate amount
    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number',
      });
    }

    // Get or create portfolio
    const portfolio = await virtualPortfolioManager.getOrCreatePortfolio(agentId, competitionId);

    // Fetch market data from unified service
    const unifiedMarket = await marketService.getMarket(marketId);

    if (!unifiedMarket) {
      return res.status(404).json({
        success: false,
        error: 'Market not found',
      });
    }

    // Convert UnifiedMarket to format expected by virtual portfolio
    const selectedOutcome = unifiedMarket.outcomes.find(o => o.name === outcome);

    const marketForPortfolio = {
      id: unifiedMarket.id,
      question: unifiedMarket.question,
      probability: selectedOutcome?.probability || 0.5,
      pool: {
        YES: unifiedMarket.outcomes.find(o => o.name === 'YES')?.price || 50,
        NO: unifiedMarket.outcomes.find(o => o.name === 'NO')?.price || 50
      },
      url: unifiedMarket.url,
      volume: unifiedMarket.totalVolume,
      volume24Hours: unifiedMarket.volume24h,
      totalLiquidity: unifiedMarket.liquidity,
      closeTime: unifiedMarket.closeTime,
      isResolved: unifiedMarket.status === 'resolved',
      outcomeType: 'BINARY' as const,
      mechanism: 'cpmm-1' as const,
      creatorId: 'ai-olympics',
      creatorUsername: unifiedMarket.source,
      creatorName: unifiedMarket.source === 'polymarket' ? 'Polymarket' : 'Kalshi',
      createdTime: Date.now() - 86400000,
      slug: unifiedMarket.id
    };

    // Place the bet
    const result = await virtualPortfolioManager.placeBet(
      portfolio.id,
      marketForPortfolio,
      outcome,
      betAmount,
      1000 // maxBetSize
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    log.info(`Bet placed: ${agentId} bet M$${betAmount} on ${outcome} for market ${marketId} (${unifiedMarket.source})`);

    res.json({
      success: true,
      bet: result.bet,
      newBalance: result.newBalance,
      market: {
        id: unifiedMarket.id,
        source: unifiedMarket.source,
        question: unifiedMarket.question
      }
    });
  } catch (error) {
    log.error('Error placing bet', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Failed to place bet',
    });
  }
});

/**
 * GET /api/predictions/portfolios/:competitionId/summary
 * Get portfolio summary
 */
router.get('/:competitionId/summary', async (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.competitionId);
    const agentId = (Array.isArray(req.query.agentId) ? req.query.agentId[0] : req.query.agentId) as string | undefined;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId query parameter is required' });
    }

    const portfolioId = await virtualPortfolioManager.getPortfolioId(agentId, competitionId);
    if (!portfolioId) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const summary = await virtualPortfolioManager.getPortfolioSummary(portfolioId);
    res.json({ summary });
  } catch (error) {
    log.error('Error fetching portfolio summary', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch portfolio summary' });
  }
});

/**
 * DELETE /api/predictions/portfolios/:competitionId
 * Clear portfolio (requires auth)
 */
router.delete('/:competitionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.competitionId);
    const requestedAgentId = (Array.isArray(req.query.agentId) ? req.query.agentId[0] : req.query.agentId) as string | undefined;

    // Only the agent's owner may clear its portfolio (closes the IDOR where any
    // authenticated user could wipe a competitor's portfolio by passing its id).
    const resolved = await resolveActingAgentId(req, competitionId, requestedAgentId);
    if ('error' in resolved) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const agentId = resolved.agentId;

    const portfolioId = await virtualPortfolioManager.getPortfolioId(agentId, competitionId);
    if (portfolioId) {
      await virtualPortfolioManager.clearPortfolio(portfolioId);
      log.info(`Cleared portfolio for agent ${agentId} in competition ${competitionId}`);
    }

    res.json({ success: true });
  } catch (error) {
    log.error('Error clearing portfolio', { error: String(error) });
    res.status(500).json({ error: 'Failed to clear portfolio' });
  }
});

export default router;
