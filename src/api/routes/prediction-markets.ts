/**
 * Prediction Markets API Routes
 * Endpoints for browsing markets and managing virtual portfolios
 * Uses Polymarket + Kalshi APIs with mock data fallback
 *
 * Supports ALL market categories: politics, sports, crypto, ai-tech, entertainment, finance
 */

import { Router, Request, Response, NextFunction } from 'express';
import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { marketService, type UnifiedMarket, type MarketCategory, type CategoryInfo } from '../../services/market-service.js';
import { virtualPortfolioManager } from '../../services/virtual-portfolio.js';
import { createLogger } from '../../shared/utils/logger.js';

const router = Router();
const log = createLogger('PredictionMarketsAPI');

/** Shape of a row from the aio_markets table */
interface DbMarketRow {
  id: string;
  source: string;
  question: string;
  description?: string | null;
  category?: string | null;
  outcomes?: Array<{ id: string; name: string; probability: number; price: number; previousPrice?: number; priceChange24h?: number }> | null;
  volume_24h?: string | null;
  total_volume?: string | null;
  liquidity?: string | null;
  close_time?: string | number | null;
  status?: string | null;
  url?: string | null;
  image?: string | null;
}

/** Outcome shape used in event sub-markets */
interface DbOutcome {
  id?: string;
  name?: string;
  probability?: number;
}

/** Shape of a sub-market inside an event row */
interface DbEventSubMarket {
  id: string;
  question: string;
  outcomes?: DbOutcome[] | null;
  total_volume?: string | null;
  volume_24h?: string | null;
  liquidity?: string | null;
  close_time?: string | number | null;
}

/** Shape of an event row returned by get_market_events RPC */
interface DbEventRow {
  event_url: string;
  source: string;
  category: string;
  image?: string | null;
  total_volume?: string | null;
  volume_24h?: string | null;
  liquidity?: string | null;
  close_time?: string | number | null;
  market_count?: string | number | null;
  markets?: DbEventSubMarket[] | null;
}

interface EventMarketWithProb extends DbEventSubMarket {
  probability: number;
  yesOutcome?: DbOutcome;
  firstOutcome?: DbOutcome;
}

// Auth middleware that accepts either Supabase user auth OR agent competition headers
async function requireAuthOrAgent(req: Request, res: Response, next: NextFunction) {
  // Check for agent auth headers first (X-Agent-Id + X-Competition-Id)
  const agentId = req.headers['x-agent-id'] as string;
  const competitionId = req.headers['x-competition-id'] as string;
  if (agentId && competitionId) {
    (req as Request & { agentAuth: { agentId: string; competitionId: string } }).agentAuth = { agentId, competitionId };
    return next();
  }

  // Fall back to Supabase Bearer token auth (attaches user + userClient)
  return requireAuth(req, res, next);
}

// Valid categories
const VALID_CATEGORIES: MarketCategory[] = ['all', 'politics', 'sports', 'crypto', 'ai-tech', 'entertainment', 'finance'];

// Valid sort options
const VALID_SORTS = ['volume', 'newest', 'closing_soon'] as const;
type SortOption = typeof VALID_SORTS[number];

/**
 * Convert a Supabase DB row to a UnifiedMarket object
 */
function mapDbToUnified(row: DbMarketRow): UnifiedMarket {
  return {
    id: row.id,
    source: row.source as UnifiedMarket['source'],
    question: row.question,
    description: row.description || undefined,
    category: row.category || 'other',
    outcomes: row.outcomes || [],
    volume24h: parseFloat(row.volume_24h || '0') || 0,
    totalVolume: parseFloat(row.total_volume || '0') || 0,
    liquidity: parseFloat(row.liquidity || '0') || 0,
    closeTime: row.close_time ? Number(row.close_time) : 0,
    status: (row.status || 'open') as UnifiedMarket['status'],
    url: row.url || '',
    image: row.image || undefined,
  };
}

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
 * List markets from Supabase (synced from Polymarket + Kalshi)
 *
 * Query params:
 *   - category: 'all' | 'politics' | 'sports' | 'crypto' | 'ai-tech' | 'entertainment' | 'finance' (default: 'all')
 *   - limit: number (default: 50, max: 200)
 *   - offset: number (default: 0) - for pagination
 *   - sort: 'volume' | 'newest' | 'closing_soon' (default: 'volume')
 *   - source: 'polymarket' | 'kalshi' (optional, filter by exchange)
 */
router.get('/markets', async (req: Request, res: Response) => {
  try {
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 50, 200);
    const offsetStr = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
    const offset = parseInt(offsetStr as string) || 0;

    const categoryStr = (Array.isArray(req.query.category) ? req.query.category[0] : req.query.category) as string | undefined;
    const category: MarketCategory = (categoryStr && VALID_CATEGORIES.includes(categoryStr as MarketCategory))
      ? categoryStr as MarketCategory
      : 'all';

    const sortStr = (Array.isArray(req.query.sort) ? req.query.sort[0] : req.query.sort) as string | undefined;
    const sort: SortOption = (sortStr && VALID_SORTS.includes(sortStr as SortOption))
      ? sortStr as SortOption
      : 'volume';

    const sourceFilter = (Array.isArray(req.query.source) ? req.query.source[0] : req.query.source) as string | undefined;

    // Build Supabase query
    let query = supabase
      .from('aio_markets')
      .select('*', { count: 'exact' })
      .eq('status', 'open');

    if (category !== 'all') {
      query = query.eq('category', category);
    }

    if (sourceFilter === 'polymarket' || sourceFilter === 'kalshi') {
      query = query.eq('source', sourceFilter);
    }

    // Sort
    if (sort === 'volume') {
      query = query.order('total_volume', { ascending: false });
    } else if (sort === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else if (sort === 'closing_soon') {
      query = query.order('close_time', { ascending: true });
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    }

    const markets = (data || []).map(mapDbToUnified);
    const total = count || 0;

    res.json({
      markets,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
      category,
      sort,
      source: 'db',
      timestamp: Date.now(),
    });
  } catch (error) {
    log.error('Error fetching markets from DB, falling back to live API', { error: String(error) });

    // Fallback: try live API via market service
    try {
      const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const limit = Math.min(parseInt(limitStr as string) || 50, 100);
      const categoryStr = (Array.isArray(req.query.category) ? req.query.category[0] : req.query.category) as string | undefined;
      const category: MarketCategory = (categoryStr && VALID_CATEGORIES.includes(categoryStr as MarketCategory))
        ? categoryStr as MarketCategory
        : 'all';

      const markets = await marketService.getMarkets({ category, limit });

      res.json({
        markets,
        total: markets.length,
        offset: 0,
        limit,
        hasMore: false,
        category,
        source: 'live_fallback',
        timestamp: Date.now(),
      });
    } catch (fallbackError) {
      log.error('Live API fallback also failed, returning mock data', { error: String(fallbackError) });
      const mockMarkets = marketService.getMockMarkets();
      res.json({
        markets: mockMarkets.slice(0, 50),
        total: mockMarkets.length,
        offset: 0,
        limit: 50,
        hasMore: false,
        category: 'all',
        source: 'mock',
        timestamp: Date.now(),
      });
    }
  }
});

/**
 * GET /api/predictions/events
 * List markets grouped by event (same URL = same event)
 * Like Polymarket UI: one card per event with multiple outcome rows
 */
router.get('/events', async (req: Request, res: Response) => {
  try {
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 24, 50);
    const offsetStr = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
    const offset = parseInt(offsetStr as string) || 0;
    const categoryStr = (Array.isArray(req.query.category) ? req.query.category[0] : req.query.category) as string | undefined;
    const category = (categoryStr && VALID_CATEGORIES.includes(categoryStr as MarketCategory)) ? categoryStr : 'all';
    const sortStr = (Array.isArray(req.query.sort) ? req.query.sort[0] : req.query.sort) as string | undefined;
    const sort = (sortStr && VALID_SORTS.includes(sortStr as SortOption)) ? sortStr : 'volume';
    const sourceFilter = (Array.isArray(req.query.source) ? req.query.source[0] : req.query.source) as string | undefined;

    // Call the database function
    const { data, error } = await supabase.rpc('get_market_events', {
      p_category: category,
      p_sort: sort,
      p_limit: limit,
      p_offset: offset,
      p_source: sourceFilter || null,
    });

    if (error) throw new Error(`get_market_events failed: ${error.message}`);

    // Get total count
    const { data: countData, error: countError } = await supabase.rpc('get_market_events_count', {
      p_category: category,
      p_source: sourceFilter || null,
    });
    const total = countError ? 0 : (countData || 0);

    // Transform events for the frontend
    const events = (data || []).map((ev: DbEventRow) => {
      // Derive event title from URL slug
      const slug = ev.event_url
        ?.replace(/.*\/event\//, '')
        ?.replace(/.*\/markets\//, '')
        ?.replace(/-\d+$/, ''); // strip trailing number IDs
      const eventTitle = slug
        ? slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : '';

      // Sort sub-markets by Yes probability desc (most likely first)
      const markets: EventMarketWithProb[] = (ev.markets || []).map((m) => {
        const yesOutcome = m.outcomes?.find((o) => o.id === 'yes' || o.name?.toLowerCase() === 'yes');
        const firstOutcome = m.outcomes?.[0];
        const probability = yesOutcome
          ? yesOutcome.probability ?? 0.5
          : firstOutcome
            ? firstOutcome.probability ?? 0.5
            : 0.5;
        return { ...m, probability, yesOutcome, firstOutcome };
      });
      markets.sort((a, b) => b.probability - a.probability);

      return {
        eventUrl: ev.event_url,
        eventTitle,
        source: ev.source,
        category: ev.category,
        image: ev.image,
        totalVolume: parseFloat(ev.total_volume || '0') || 0,
        volume24h: parseFloat(ev.volume_24h || '0') || 0,
        liquidity: parseFloat(ev.liquidity || '0') || 0,
        closeTime: ev.close_time ? Number(ev.close_time) : 0,
        marketCount: Number(ev.market_count),
        markets,
      };
    });

    res.json({
      events,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
      category,
      sort,
      timestamp: Date.now(),
    });
  } catch (error) {
    log.error('Error fetching events', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/predictions/events/:slug
 * Get a single event by URL slug (e.g., "democratic-presidential-nominee-2028")
 * Returns all sub-markets grouped under that event
 */
router.get('/events/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);

    // Find markets whose URL contains the slug
    const { data, error } = await supabase
      .from('aio_markets')
      .select('*')
      .ilike('url', `%${slug}%`)
      .order('total_volume', { ascending: false });

    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Group by (url, source) - there should be one group for the slug
    const groups = new Map<string, DbMarketRow[]>();
    for (const row of data as DbMarketRow[]) {
      const key = `${row.url}|||${row.source}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    // Take the largest group (most markets = best match)
    let bestGroup: DbMarketRow[] = [];
    let bestUrl = '';
    let bestSource = '';
    for (const [key, rows] of groups) {
      if (rows.length > bestGroup.length) {
        bestGroup = rows;
        const [url, source] = key.split('|||');
        bestUrl = url;
        bestSource = source;
      }
    }

    // Derive event title from slug
    const eventTitle = slug
      .split('-')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Build sub-markets with probabilities
    const markets = bestGroup.map(row => {
      const outcomes = row.outcomes || [];
      const yesOutcome = outcomes.find((o) => o.id === 'yes' || o.name?.toLowerCase() === 'yes');
      const firstOutcome = outcomes[0];
      const probability = yesOutcome
        ? yesOutcome.probability
        : firstOutcome
          ? firstOutcome.probability
          : 0.5;
      return {
        id: row.id,
        question: row.question,
        description: row.description || '',
        outcomes,
        total_volume: parseFloat(row.total_volume || '0') || 0,
        volume_24h: parseFloat(row.volume_24h || '0') || 0,
        liquidity: parseFloat(row.liquidity || '0') || 0,
        close_time: row.close_time ? Number(row.close_time) : 0,
        probability,
      };
    });

    // Sort by probability descending
    markets.sort((a, b) => b.probability - a.probability);

    // Aggregate event-level stats
    const totalVolume = markets.reduce((s, m) => s + m.total_volume, 0);
    const volume24h = markets.reduce((s, m) => s + m.volume_24h, 0);
    const liquidity = Math.max(...markets.map(m => m.liquidity));
    const closeTime = Math.min(...markets.filter(m => m.close_time > 0).map(m => m.close_time));

    res.json({
      eventUrl: bestUrl,
      eventTitle,
      slug,
      source: bestSource,
      category: bestGroup[0]?.category || 'other',
      image: bestGroup[0]?.image || null,
      totalVolume,
      volume24h,
      liquidity,
      closeTime: closeTime === Infinity ? 0 : closeTime,
      marketCount: markets.length,
      markets,
      timestamp: Date.now(),
    });
  } catch (error) {
    log.error('Error fetching event by slug', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

/**
 * GET /api/predictions/categories
 * Get available market categories with counts from Supabase
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    // Query category counts from Supabase
    const { data, error } = await supabase
      .from('aio_markets')
      .select('category')
      .eq('status', 'open');

    if (error) throw error;

    // Count by category
    const counts = new Map<string, number>();
    let total = 0;
    for (const row of data || []) {
      const cat = row.category || 'other';
      counts.set(cat, (counts.get(cat) || 0) + 1);
      total++;
    }

    const categories: CategoryInfo[] = [
      { id: 'all', name: 'All Markets', count: total, icon: '🌐' },
      { id: 'politics', name: 'Politics', count: counts.get('politics') || 0, icon: '🏛️' },
      { id: 'sports', name: 'Sports', count: counts.get('sports') || 0, icon: '⚽' },
      { id: 'crypto', name: 'Crypto', count: counts.get('crypto') || 0, icon: '₿' },
      { id: 'ai-tech', name: 'AI & Tech', count: counts.get('ai-tech') || 0, icon: '🤖' },
      { id: 'entertainment', name: 'Entertainment', count: counts.get('entertainment') || 0, icon: '🎬' },
      { id: 'finance', name: 'Finance', count: counts.get('finance') || 0, icon: '📈' },
    ];

    res.json({
      categories: categories.filter(c => c.id === 'all' || c.count > 0),
      source: 'db',
      timestamp: Date.now(),
    });
  } catch (error) {
    log.error('Error fetching categories from DB', { error: String(error) });

    // Fallback to default
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
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/predictions/markets/:id
 * Get a single market by ID from Supabase (falls back to live API)
 */
router.get('/markets/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    // Try Supabase first
    const { data, error } = await supabase
      .from('aio_markets')
      .select('*')
      .eq('id', id)
      .limit(1)
      .single();

    if (!error && data) {
      return res.json(mapDbToUnified(data));
    }

    // Fallback to live API
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
 * Full-text search markets in Supabase using PostgreSQL GIN index
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = (Array.isArray(req.query.q) ? req.query.q[0] : req.query.q) as string | undefined;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 20, 100);

    // Use PostgreSQL full-text search
    const { data, error } = await supabase
      .from('aio_markets')
      .select('*')
      .textSearch('question', query, { type: 'websearch' })
      .eq('status', 'open')
      .order('total_volume', { ascending: false })
      .limit(limit);

    if (error) {
      // If full-text search fails, fall back to ILIKE
      log.warn('Full-text search failed, falling back to ILIKE', { error: error.message });
      const { data: ilikeData, error: ilikeError } = await supabase
        .from('aio_markets')
        .select('*')
        .ilike('question', `%${query}%`)
        .eq('status', 'open')
        .order('total_volume', { ascending: false })
        .limit(limit);

      if (ilikeError) throw ilikeError;

      return res.json({
        markets: (ilikeData || []).map(mapDbToUnified),
        query,
        source: 'db_ilike',
        timestamp: Date.now(),
      });
    }

    res.json({
      markets: (data || []).map(mapDbToUnified),
      query,
      source: 'db',
      timestamp: Date.now(),
    });
  } catch (error) {
    log.error('Error searching markets in DB, falling back to live API', { error: String(error) });

    // Fallback to live API search
    try {
      const query = (Array.isArray(req.query.q) ? req.query.q[0] : req.query.q) as string;
      const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const limit = Math.min(parseInt(limitStr as string) || 20, 100);
      const markets = await marketService.searchMarkets(query, limit);

      res.json({
        markets,
        query,
        source: 'live_fallback',
        timestamp: Date.now(),
      });
    } catch (fallbackError) {
      res.status(500).json({ error: 'Failed to search markets' });
    }
  }
});

/**
 * GET /api/predictions/stats
 * Get sync status and total market counts
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get sync status
    const { data: syncData, error: syncError } = await supabase
      .from('aio_sync_status')
      .select('*');

    // Get total counts
    const { count: totalCount } = await supabase
      .from('aio_markets')
      .select('*', { count: 'exact', head: true });

    const { count: openCount } = await supabase
      .from('aio_markets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');

    const { count: polyCount } = await supabase
      .from('aio_markets')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'polymarket');

    const { count: kalshiCount } = await supabase
      .from('aio_markets')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'kalshi');

    res.json({
      syncStatus: syncData || [],
      totals: {
        all: totalCount || 0,
        open: openCount || 0,
        polymarket: polyCount || 0,
        kalshi: kalshiCount || 0,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    log.error('Error fetching stats', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch stats' });
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
router.post('/portfolios/:competitionId/bets', requireAuthOrAgent, async (req: Request, res: Response) => {
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
