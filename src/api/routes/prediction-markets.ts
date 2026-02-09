/**
 * Prediction Markets API Routes
 * Endpoints for browsing markets and managing virtual portfolios
 * Uses Polymarket + Kalshi APIs with mock data fallback
 *
 * Supports ALL market categories: politics, sports, crypto, ai-tech, entertainment, finance
 */

import { Router, Request, Response } from 'express';
import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { marketService, type UnifiedMarket, type MarketCategory, type CategoryInfo } from '../../services/market-service.js';
import { virtualPortfolioManager } from '../../services/virtual-portfolio.js';
import { createLogger } from '../../shared/utils/logger.js';

const router = Router();
const log = createLogger('PredictionMarketsAPI');

// Auth middleware for admin endpoints
async function requireAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    (req as any).user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Cache for markets (2 minute TTL for more real-time data)
interface MarketCache {
  markets: UnifiedMarket[];
  category: MarketCategory;
  timestamp: number;
}
const marketCaches: Map<MarketCategory, MarketCache> = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Category cache
let categoryCache: { categories: CategoryInfo[]; timestamp: number } | null = null;
const CATEGORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Valid categories
const VALID_CATEGORIES: MarketCategory[] = ['all', 'politics', 'sports', 'crypto', 'ai-tech', 'entertainment', 'finance'];

// ============================================================================
// META-MARKETS ENDPOINTS (AI Competition Betting)
// ============================================================================

/**
 * GET /api/predictions/meta-markets
 * Get AI agent matchup betting markets
 */
router.get('/meta-markets', async (req: Request, res: Response) => {
  try {
    // Generate matchups based on active/upcoming competitions
    // For now, return well-structured mock data
    const matchups = [
      {
        id: 'mm-1',
        title: 'Trivia Showdown',
        description: 'Which AI will score highest on the trivia challenge?',
        taskType: 'trivia',
        agents: [
          { id: 'claude-1', name: 'Claude 3.5', provider: 'claude', odds: 0.45, betsCount: 24, totalBets: 2400 },
          { id: 'gpt4-1', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.35, betsCount: 18, totalBets: 1800 },
          { id: 'gemini-1', name: 'Gemini Pro', provider: 'gemini', odds: 0.20, betsCount: 8, totalBets: 800 }
        ],
        status: 'live',
        totalPool: 5000
      },
      {
        id: 'mm-2',
        title: 'Math Championship',
        description: 'Speed and accuracy in mathematical computation',
        taskType: 'math',
        agents: [
          { id: 'claude-2', name: 'Claude 3.5', provider: 'claude', odds: 0.40, betsCount: 15, totalBets: 1500 },
          { id: 'gpt4-2', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.40, betsCount: 16, totalBets: 1600 },
          { id: 'gemini-2', name: 'Gemini Pro', provider: 'gemini', odds: 0.20, betsCount: 9, totalBets: 900 }
        ],
        status: 'upcoming',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        totalPool: 4000
      },
      {
        id: 'mm-3',
        title: 'Logic Master',
        description: 'Pattern recognition and logical reasoning',
        taskType: 'logic',
        agents: [
          { id: 'claude-3', name: 'Claude 3.5', provider: 'claude', odds: 0.55, betsCount: 30, totalBets: 3300 },
          { id: 'gpt4-3', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.30, betsCount: 12, totalBets: 1200 },
          { id: 'gemini-3', name: 'Gemini Pro', provider: 'gemini', odds: 0.15, betsCount: 5, totalBets: 500 }
        ],
        status: 'completed',
        winner: 'claude-3',
        totalPool: 5000
      },
      {
        id: 'mm-4',
        title: 'Word Scramble Battle',
        description: 'Unscramble words faster than your AI opponents',
        taskType: 'word',
        agents: [
          { id: 'claude-4', name: 'Claude 3.5', provider: 'claude', odds: 0.50, betsCount: 20, totalBets: 2000 },
          { id: 'gpt4-4', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.35, betsCount: 14, totalBets: 1400 },
          { id: 'gemini-4', name: 'Gemini Pro', provider: 'gemini', odds: 0.15, betsCount: 6, totalBets: 600 }
        ],
        status: 'upcoming',
        startsAt: new Date(Date.now() + 7200000).toISOString(),
        totalPool: 4000
      },
      {
        id: 'mm-5',
        title: 'Chess Puzzle Championship',
        description: 'Find the best moves in tactical positions',
        taskType: 'chess',
        agents: [
          { id: 'claude-5', name: 'Claude 3.5', provider: 'claude', odds: 0.35, betsCount: 22, totalBets: 2200 },
          { id: 'gpt4-5', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.45, betsCount: 28, totalBets: 2800 },
          { id: 'gemini-5', name: 'Gemini Pro', provider: 'gemini', odds: 0.20, betsCount: 10, totalBets: 1000 }
        ],
        status: 'live',
        totalPool: 6000
      }
    ];

    res.json({
      matchups,
      count: matchups.length,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('Error fetching meta-markets', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch meta-markets' });
  }
});

// ============================================================================
// MARKET ENDPOINTS
// ============================================================================

/**
 * GET /api/predictions/markets
 * List markets from Polymarket + Kalshi with optional category filter
 *
 * Query params:
 *   - category: 'all' | 'politics' | 'sports' | 'crypto' | 'ai-tech' | 'entertainment' | 'finance' (default: 'all')
 *   - limit: number (default: 50, max: 100)
 */
router.get('/markets', async (req: Request, res: Response) => {
  try {
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);

    // Get category from query param
    const categoryStr = (Array.isArray(req.query.category) ? req.query.category[0] : req.query.category) as string | undefined;
    const category: MarketCategory = (categoryStr && VALID_CATEGORIES.includes(categoryStr as MarketCategory))
      ? categoryStr as MarketCategory
      : 'all';

    // Check cache for this category
    const cached = marketCaches.get(category);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      log.debug(`Returning cached ${category} markets`);
      return res.json({
        markets: cached.markets.slice(0, limit),
        category,
        source: 'cache',
        timestamp: cached.timestamp
      });
    }

    // Fetch from market service with category filter
    const markets = await marketService.getMarkets({ category, limit });

    // Update cache for this category
    marketCaches.set(category, {
      markets,
      category,
      timestamp: Date.now(),
    });

    res.json({
      markets,
      category,
      source: 'live',
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('Error fetching markets, returning mock data', { error: String(error) });
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);
    const categoryStr = (Array.isArray(req.query.category) ? req.query.category[0] : req.query.category) as string | undefined;
    const category: MarketCategory = categoryStr as MarketCategory || 'all';

    // Filter mock markets by category
    let mockMarkets = marketService.getMockMarkets();
    if (category !== 'all') {
      mockMarkets = mockMarkets.filter(m => m.category === category);
    }

    res.json({
      markets: mockMarkets.slice(0, limit),
      category,
      source: 'mock',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/predictions/categories
 * Get available market categories with counts
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    // Check cache
    if (categoryCache && Date.now() - categoryCache.timestamp < CATEGORY_CACHE_TTL) {
      log.debug('Returning cached categories');
      return res.json({
        categories: categoryCache.categories,
        source: 'cache',
        timestamp: categoryCache.timestamp
      });
    }

    // Fetch categories from market service
    const categories = await marketService.getCategories();

    // Update cache
    categoryCache = {
      categories,
      timestamp: Date.now(),
    };

    res.json({
      categories,
      source: 'live',
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('Error fetching categories', { error: String(error) });

    // Return default categories on error
    const defaultCategories: CategoryInfo[] = [
      { id: 'all', name: 'All Markets', count: 0, icon: '🌐' },
      { id: 'politics', name: 'Politics', count: 0, icon: '🏛️' },
      { id: 'sports', name: 'Sports', count: 0, icon: '⚽' },
      { id: 'crypto', name: 'Crypto', count: 0, icon: '₿' },
      { id: 'ai-tech', name: 'AI & Tech', count: 0, icon: '🤖' },
      { id: 'entertainment', name: 'Entertainment', count: 0, icon: '🎬' },
      { id: 'finance', name: 'Finance', count: 0, icon: '📈' },
    ];

    res.json({
      categories: defaultCategories,
      source: 'default',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/predictions/markets/:id
 * Get a single market by ID (supports Polymarket, Kalshi, and mock IDs)
 */
router.get('/markets/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const market = await marketService.getMarket(id);

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
 * GET /api/predictions/search
 * Search markets across Polymarket and Kalshi
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = (Array.isArray(req.query.q) ? req.query.q[0] : req.query.q) as string | undefined;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 20, 100);
    const markets = await marketService.searchMarkets(query, limit);

    res.json({
      markets,
      query,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('Error searching markets', { error: String(error) });
    res.status(500).json({ error: 'Failed to search markets' });
  }
});

// ============================================================================
// PORTFOLIO ENDPOINTS
// ============================================================================

/**
 * GET /api/predictions/portfolios/:competitionId
 * Get portfolio for a competition (requires agentId query param)
 */
router.get('/portfolios/:competitionId', (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.competitionId);
    const agentId = (Array.isArray(req.query.agentId) ? req.query.agentId[0] : req.query.agentId) as string | undefined;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId query parameter is required' });
    }

    const portfolioId = virtualPortfolioManager.getPortfolioId(agentId, competitionId);
    if (!portfolioId) {
      // Create new portfolio if it doesn't exist
      const portfolio = virtualPortfolioManager.createPortfolio(agentId, competitionId);
      return res.json(portfolio);
    }

    const portfolio = virtualPortfolioManager.getPortfolio(portfolioId);
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
router.post('/portfolios/:competitionId/bets', requireAuth, async (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.competitionId);
    const { agentId, marketId, outcome, amount } = req.body;

    // Validate required fields
    if (!agentId || !marketId || !outcome || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: agentId, marketId, outcome, amount',
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
    const portfolio = virtualPortfolioManager.getOrCreatePortfolio(agentId, competitionId);

    // Fetch market data from unified service
    const unifiedMarket = await marketService.getMarket(marketId);

    if (!unifiedMarket) {
      return res.status(404).json({
        success: false,
        error: 'Market not found',
      });
    }

    // Convert UnifiedMarket to format expected by virtual portfolio
    // The portfolio system expects probability and pool fields
    const selectedOutcome = unifiedMarket.outcomes.find(o => o.name === outcome);
    const otherOutcome = unifiedMarket.outcomes.find(o => o.name !== outcome);

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
    const result = virtualPortfolioManager.placeBet(
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
router.get('/portfolios/:competitionId/summary', (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.competitionId);
    const agentId = (Array.isArray(req.query.agentId) ? req.query.agentId[0] : req.query.agentId) as string | undefined;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId query parameter is required' });
    }

    const portfolioId = virtualPortfolioManager.getPortfolioId(agentId, competitionId);
    if (!portfolioId) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const summary = virtualPortfolioManager.getPortfolioSummary(portfolioId);
    res.json({ summary });
  } catch (error) {
    log.error('Error fetching portfolio summary', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch portfolio summary' });
  }
});

// ============================================================================
// COMPETITION ENDPOINTS
// ============================================================================

/**
 * GET /api/predictions/competitions/:id/results
 * Get competition results and scores
 */
router.get('/competitions/:id/results', (req: Request, res: Response) => {
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
router.get('/competitions/:id/portfolios', (req: Request, res: Response) => {
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

// ============================================================================
// UTILITY ENDPOINTS
// ============================================================================

/**
 * POST /api/predictions/resolve-market
 * Manually resolve a market (admin only, requires auth)
 */
router.post('/resolve-market', requireAuth, (req: Request, res: Response) => {
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

/**
 * DELETE /api/predictions/portfolios/:competitionId
 * Clear portfolio (requires auth)
 */
router.delete('/portfolios/:competitionId', requireAuth, (req: Request, res: Response) => {
  try {
    const competitionId = String(req.params.competitionId);
    const agentId = (Array.isArray(req.query.agentId) ? req.query.agentId[0] : req.query.agentId) as string | undefined;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId query parameter is required' });
    }

    const portfolioId = virtualPortfolioManager.getPortfolioId(agentId, competitionId);
    if (portfolioId) {
      virtualPortfolioManager.clearPortfolio(portfolioId);
      log.info(`Cleared portfolio for agent ${agentId} in competition ${competitionId}`);
    }

    res.json({ success: true });
  } catch (error) {
    log.error('Error clearing portfolio', { error: String(error) });
    res.status(500).json({ error: 'Failed to clear portfolio' });
  }
});

export default router;
