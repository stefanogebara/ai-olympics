/**
 * Prediction Markets - Market browsing endpoints
 * /markets, /events, /events/:slug, /categories, /markets/:id, /search, /stats
 */

import { Router, Request, Response } from 'express';
import { serviceClient as supabase } from '../../../shared/utils/supabase.js';
import { marketService } from '../../../services/market-service.js';
import { createLogger } from '../../../shared/utils/logger.js';
import {
  type DbMarketRow, type DbEventRow, type EventMarketWithProb,
  type MarketCategory, type CategoryInfo, type SortOption,
  VALID_CATEGORIES, VALID_SORTS,
  mapDbToUnified,
} from './types.js';

const router = Router();
const log = createLogger('PredictionMarketsAPI');

/**
 * GET /api/predictions/markets
 * List markets from Supabase (synced from Polymarket + Kalshi)
 */
router.get('/', async (req: Request, res: Response) => {
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

    if (sourceFilter === 'polymarket' || sourceFilter === 'kalshi' || sourceFilter === 'predix') {
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
      // Derive event title from URL slug (handles Polymarket /event/, Kalshi /markets/, Predix /market/)
      const rawSlug = ev.event_url
        ?.replace(/.*\/event\//, '')
        ?.replace(/.*\/markets\//, '')
        ?.replace(/.*\/market\//, '')
        ?.replace(/-\d+$/, ''); // strip trailing number IDs
      // Predix slugs are hex conditionIds (0x...) — fall back to first market question
      const isHex = /^0x[0-9a-f]+$/i.test(rawSlug || '');
      const eventTitle = isHex || !rawSlug
        ? (ev.markets?.[0]?.question || '')
        : rawSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

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
    log.warn('Error fetching events, returning empty fallback', { error: String(error) });
    res.json({
      events: [],
      total: 0,
      offset: 0,
      limit: 24,
      hasMore: false,
      category: 'all',
      sort: 'volume',
      timestamp: Date.now(),
      source: 'fallback_empty',
    });
  }
});

/**
 * GET /api/predictions/events/:slug
 * Get a single event by URL slug
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
 * Full-text search markets in Supabase
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
    const { data: syncData } = await supabase
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

    const { count: predixCount } = await supabase
      .from('aio_markets')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'predix');

    res.json({
      syncStatus: syncData || [],
      totals: {
        all: totalCount || 0,
        open: openCount || 0,
        polymarket: polyCount || 0,
        kalshi: kalshiCount || 0,
        predix: predixCount || 0,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    log.error('Error fetching stats', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
