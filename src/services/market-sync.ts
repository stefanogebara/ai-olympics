/**
 * Market Sync Service
 * Background service that paginates through ALL markets via PolyRouter
 * (unified API aggregating Polymarket, Kalshi, Manifold, Limitless, etc.)
 * and upserts them into Supabase aio_markets table.
 *
 * - Full sync: Every 10 minutes, pages through all open markets
 * - Incremental sync: Every 2 minutes, fetches first page of recent markets
 * - Rate limiting: PolyRouter allows 100 req/min
 */

import { serviceClient } from '../shared/utils/supabase.js';
import { marketService } from './market-service.js';
import { createLogger } from '../shared/utils/logger.js';
import type { UnifiedMarket } from './polymarket-client.js';

const log = createLogger('MarketSync');

const FULL_SYNC_INTERVAL = 10 * 60 * 1000;       // 10 minutes
const INCREMENTAL_SYNC_INTERVAL = 2 * 60 * 1000;  // 2 minutes
const PAGE_SIZE = 100;                             // PolyRouter max per request
const REQUEST_DELAY_MS = 650;                      // Stay under 100 req/min
const MAX_CONSECUTIVE_ERRORS = 3;

const POLYROUTER_BASE = 'https://api-v2.polyrouter.io';
const POLYROUTER_API_KEY = process.env.POLYROUTER_API_KEY || '';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// PolyRouter response types
interface PolyRouterMarket {
  id: string;
  platform: string;
  platform_id: string;
  title: string;
  description?: string;
  status: string;
  market_type: string;
  category?: string;
  outcomes: Array<{ id: string; name: string }>;
  current_prices: Record<string, { price: number; bid?: number; ask?: number }>;
  volume_24h: number | null;
  volume_7d: number | null;
  volume_total: number | null;
  liquidity: number | null;
  liquidity_score?: number;
  open_interest: number | null;
  source_url: string;
  image_url?: string;
  created_at: string;
  trading_end_at?: string;
  resolution_date?: string;
  last_synced_at: string;
  event_name?: string;
  tags?: string[];
  subcategory?: string;
}

interface PolyRouterResponse {
  pagination: {
    total: number;
    limit: number;
    has_more: boolean;
    next_cursor: string | null;
  };
  markets: PolyRouterMarket[];
  meta: {
    platforms_queried?: string[];
    request_time?: number;
    cache_hit?: boolean;
    data_freshness?: string;
  };
}

// Convert PolyRouter market to our UnifiedMarket format
function polyRouterToUnified(m: PolyRouterMarket): UnifiedMarket {
  const outcomes = m.outcomes.map(o => {
    const priceData = m.current_prices?.[o.id] || m.current_prices?.[o.name.toLowerCase()] || {};
    const price = priceData.price ?? 0.5;
    return {
      id: o.id,
      name: o.name,
      probability: price,
      price: Math.round(price * 100),
      previousPrice: Math.round(price * 100),
      priceChange24h: 0,
    };
  });

  // If outcomes are empty but we have current_prices, build from prices
  if (outcomes.length === 0 && m.current_prices) {
    for (const [key, val] of Object.entries(m.current_prices)) {
      outcomes.push({
        id: key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        probability: val.price ?? 0.5,
        price: Math.round((val.price ?? 0.5) * 100),
        previousPrice: Math.round((val.price ?? 0.5) * 100),
        priceChange24h: 0,
      });
    }
  }

  const closeTime = m.resolution_date
    ? new Date(m.resolution_date).getTime()
    : m.trading_end_at
      ? new Date(m.trading_end_at).getTime()
      : null;

  // Map platform name to our source format
  const source = m.platform === 'polymarket' ? 'polymarket' : 'kalshi';

  return {
    id: m.platform_id || m.id,
    source,
    question: m.title,
    description: m.description || undefined,
    category: m.category || 'other',
    outcomes,
    volume24h: m.volume_24h ?? 0,
    totalVolume: m.volume_total ?? 0,
    liquidity: m.liquidity ?? 0,
    closeTime: closeTime ?? 0,
    status: m.status === 'open' ? 'open' : m.status === 'resolved' ? 'resolved' : 'closed',
    url: m.source_url || '',
    image: m.image_url,
  };
}

class MarketSyncService {
  private fullSyncTimer: NodeJS.Timeout | null = null;
  private incrementalSyncTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  // =========================================================================
  // POLYROUTER API FETCH
  // =========================================================================

  private async fetchPolyRouter(params: Record<string, string>): Promise<PolyRouterResponse> {
    const url = new URL(`${POLYROUTER_BASE}/markets`);
    for (const [key, val] of Object.entries(params)) {
      url.searchParams.set(key, val);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'X-API-Key': POLYROUTER_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`PolyRouter API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<PolyRouterResponse>;
  }

  // =========================================================================
  // SYNC BY PLATFORM (paginate through all markets for a platform)
  // =========================================================================

  async syncPlatform(platform: 'polymarket' | 'kalshi'): Promise<number> {
    let cursor: string | undefined;
    let total = 0;
    let consecutiveErrors = 0;

    while (true) {
      try {
        const params: Record<string, string> = {
          platform,
          status: 'open',
          limit: String(PAGE_SIZE),
        };
        if (cursor) {
          params.cursor = cursor;
        }

        const result = await this.fetchPolyRouter(params);

        if (!result.markets || result.markets.length === 0) break;

        const normalized = result.markets.map(m => {
          const n = polyRouterToUnified(m);
          // Override source for non-polymarket/kalshi platforms
          if (m.platform !== 'polymarket' && m.platform !== 'kalshi') {
            (n as any).source = m.platform;
          }
          if (!n.category || n.category === 'other' || n.category === 'general') {
            n.category = marketService.detectCategory(n);
          }
          return n;
        });

        await this.upsertMarkets(normalized, platform);
        total += normalized.length;
        consecutiveErrors = 0;

        log.debug(`${platform}: fetched ${normalized.length} markets (total so far: ${total})`);

        if (!result.pagination.has_more || !result.pagination.next_cursor) break;
        cursor = result.pagination.next_cursor;

        await delay(REQUEST_DELAY_MS);
      } catch (error) {
        consecutiveErrors++;
        log.error(`${platform} sync error (consecutive=${consecutiveErrors})`, {
          error: error instanceof Error ? error.message : String(error),
        });
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log.warn(`Stopping ${platform} sync after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
          break;
        }
        await delay(REQUEST_DELAY_MS * 2);
      }
    }

    return total;
  }

  // =========================================================================
  // SYNC ALL PLATFORMS (no platform filter - gets everything)
  // =========================================================================

  async syncAllPlatforms(): Promise<number> {
    let cursor: string | undefined;
    let total = 0;
    let consecutiveErrors = 0;

    while (true) {
      try {
        const params: Record<string, string> = {
          status: 'open',
          limit: String(PAGE_SIZE),
        };
        if (cursor) {
          params.cursor = cursor;
        }

        const result = await this.fetchPolyRouter(params);

        if (!result.markets || result.markets.length === 0) break;

        // Group by platform for upsert (since our DB has source constraint)
        const byPlatform = new Map<string, UnifiedMarket[]>();
        for (const m of result.markets) {
          const n = polyRouterToUnified(m);
          const src = m.platform === 'polymarket' || m.platform === 'kalshi'
            ? m.platform
            : m.platform; // keep original platform name
          n.source = src as any;

          if (!n.category || n.category === 'other' || n.category === 'general') {
            n.category = marketService.detectCategory(n);
          }

          const list = byPlatform.get(src) || [];
          list.push(n);
          byPlatform.set(src, list);
        }

        // Upsert each platform batch
        for (const [platform, markets] of byPlatform) {
          await this.upsertMarkets(markets, platform);
        }

        total += result.markets.length;
        consecutiveErrors = 0;

        log.debug(`All platforms: fetched ${result.markets.length} markets (total so far: ${total})`);

        if (!result.pagination.has_more || !result.pagination.next_cursor) break;
        cursor = result.pagination.next_cursor;

        await delay(REQUEST_DELAY_MS);
      } catch (error) {
        consecutiveErrors++;
        log.error(`All-platform sync error (consecutive=${consecutiveErrors})`, {
          error: error instanceof Error ? error.message : String(error),
        });
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log.warn(`Stopping all-platform sync after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
          break;
        }
        await delay(REQUEST_DELAY_MS * 2);
      }
    }

    return total;
  }

  // =========================================================================
  // BATCH UPSERT TO SUPABASE
  // =========================================================================

  async upsertMarkets(markets: UnifiedMarket[], _platform?: string): Promise<void> {
    if (markets.length === 0) return;

    const rows = markets.map(m => ({
      id: m.id,
      source: m.source,
      question: m.question,
      description: m.description || null,
      category: m.category || 'other',
      outcomes: m.outcomes,
      volume_24h: m.volume24h,
      total_volume: m.totalVolume,
      liquidity: m.liquidity,
      close_time: m.closeTime,
      status: m.status,
      url: m.url,
      image: m.image || null,
      synced_at: new Date().toISOString(),
    }));

    const { error } = await serviceClient
      .from('aio_markets')
      .upsert(rows, { onConflict: 'id,source' });

    if (error) {
      log.error('Upsert failed', { error: error.message, count: rows.length });
      throw error;
    }
  }

  // =========================================================================
  // SYNC ORCHESTRATION
  // =========================================================================

  async runFullSync(): Promise<void> {
    if (this.isSyncing) {
      log.warn('Sync already in progress, skipping');
      return;
    }

    if (!POLYROUTER_API_KEY) {
      log.warn('POLYROUTER_API_KEY not set, skipping sync');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      log.info('Starting full market sync via PolyRouter...');

      // Sync each platform separately for better tracking
      const polyCount = await this.syncPlatform('polymarket');
      const kalshiCount = await this.syncPlatform('kalshi');

      const duration = Date.now() - startTime;
      const totalCount = polyCount + kalshiCount;

      log.info(`Full sync complete: ${polyCount} Polymarket + ${kalshiCount} Kalshi = ${totalCount} total (${duration}ms)`);

      // Update sync status
      await this.updateSyncStatus('polymarket', polyCount, duration, null);
      await this.updateSyncStatus('kalshi', kalshiCount, duration, null);
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error('Full sync failed', { error: String(error), duration });
      await this.updateSyncStatus('polymarket', 0, duration, String(error));
      await this.updateSyncStatus('kalshi', 0, duration, String(error));
    } finally {
      this.isSyncing = false;
    }
  }

  async runIncrementalSync(): Promise<void> {
    if (this.isSyncing) return;
    if (!POLYROUTER_API_KEY) return;

    try {
      // Fetch first page from each platform (most recent markets)
      const [polyResult, kalshiResult] = await Promise.all([
        this.fetchPolyRouter({ platform: 'polymarket', status: 'open', limit: String(PAGE_SIZE) }).catch(() => null),
        this.fetchPolyRouter({ platform: 'kalshi', status: 'open', limit: String(PAGE_SIZE) }).catch(() => null),
      ]);

      let polyCount = 0;
      let kalshiCount = 0;

      if (polyResult?.markets) {
        const normalized = polyResult.markets.map(m => {
          const n = polyRouterToUnified(m);
          if (!n.category || n.category === 'other' || n.category === 'general') {
            n.category = marketService.detectCategory(n);
          }
          return n;
        });
        await this.upsertMarkets(normalized, 'polymarket');
        polyCount = normalized.length;
      }

      if (kalshiResult?.markets) {
        const normalized = kalshiResult.markets.map(m => {
          const n = polyRouterToUnified(m);
          if (!n.category || n.category === 'other' || n.category === 'general') {
            n.category = marketService.detectCategory(n);
          }
          return n;
        });
        await this.upsertMarkets(normalized, 'kalshi');
        kalshiCount = normalized.length;
      }

      // Update incremental sync timestamps
      const now = new Date().toISOString();
      await serviceClient
        .from('aio_sync_status')
        .upsert([
          { id: 'polymarket', last_incremental_sync: now, updated_at: now },
          { id: 'kalshi', last_incremental_sync: now, updated_at: now },
        ], { onConflict: 'id' });

      log.debug(`Incremental sync: ${polyCount} Polymarket + ${kalshiCount} Kalshi`);
    } catch (error) {
      log.error('Incremental sync failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async updateSyncStatus(
    source: string,
    totalMarkets: number,
    durationMs: number,
    error: string | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await serviceClient
      .from('aio_sync_status')
      .upsert({
        id: source,
        last_full_sync: now,
        total_markets: totalMarkets,
        sync_duration_ms: durationMs,
        error,
        updated_at: now,
      }, { onConflict: 'id' })
      .then(({ error: err }) => {
        if (err) log.error(`Failed to update sync status for ${source}`, { error: err.message });
      });
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  start(): void {
    if (!POLYROUTER_API_KEY) {
      log.warn('POLYROUTER_API_KEY not set — market sync disabled');
      return;
    }

    log.info('Market sync service starting (via PolyRouter)...');

    // Run full sync immediately
    this.runFullSync();

    // Schedule recurring syncs
    this.fullSyncTimer = setInterval(() => this.runFullSync(), FULL_SYNC_INTERVAL);
    this.incrementalSyncTimer = setInterval(() => this.runIncrementalSync(), INCREMENTAL_SYNC_INTERVAL);

    log.info(`Scheduled: full sync every ${FULL_SYNC_INTERVAL / 1000}s, incremental every ${INCREMENTAL_SYNC_INTERVAL / 1000}s`);
  }

  stop(): void {
    if (this.fullSyncTimer) {
      clearInterval(this.fullSyncTimer);
      this.fullSyncTimer = null;
    }
    if (this.incrementalSyncTimer) {
      clearInterval(this.incrementalSyncTimer);
      this.incrementalSyncTimer = null;
    }
    log.info('Market sync service stopped');
  }
}

export const marketSyncService = new MarketSyncService();
export default marketSyncService;
