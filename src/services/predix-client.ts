/**
 * Predix API Client
 * Brazilian prediction market on Base blockchain (chain ID 8453)
 * Docs: https://api.predixbr.com
 * Web app: https://predixbr.com
 */

import { createLogger } from '../shared/utils/logger.js';
import { circuits } from '../shared/utils/circuit-breaker.js';

const log = createLogger('PredixClient');
const PREDIX_API = 'https://predixbr.com/api';
const PREDIX_WS = 'wss://predixbr.com/ws/market';

// Rate limiting — conservative to avoid bans (30 req/min)
const RATE_LIMIT_WINDOW = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
let requestTimestamps: number[] = [];

async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);

  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestTimestamp = requestTimestamps[0];
    const waitTime = RATE_LIMIT_WINDOW - (now - oldestTimestamp);
    log.warn(`Rate limit reached, waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  requestTimestamps.push(Date.now());
  return circuits.predix.execute(() => fetch(url, options));
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Raw market from Predix /markets endpoint */
export interface PredixMarket {
  id: string;
  conditionId: string;
  type: 'binary' | 'multi';
  question: string;
  description?: string;
  status: 'open' | 'resolved' | 'paused';
  /** Total volume in USDC */
  volume: number;
  /** Options/outcomes with their token IDs */
  options: Array<{ id: string; label: string }>;
  negRisk?: boolean;
  /** ISO date string for market close */
  endDate?: string;
  closingDate?: string;
  category?: string;
  image?: string;
}

/** Bulk midpoint response: tokenId → midpoint price (0.01–0.99) */
export type PredixMidpoints = Record<string, number>;

export interface PriceUpdate {
  marketId: string;
  tokenId: string;
  outcome: string;
  price: number;
  timestamp: number;
}

// Re-export UnifiedMarket from polymarket-client to keep one source of truth
export type { UnifiedMarket } from './polymarket-client.js';
import type { UnifiedMarket } from './polymarket-client.js';

// ============================================================================
// PREDIX API CLIENT
// ============================================================================

export class PredixClient {
  private ws: WebSocket | null = null;
  private subscriptions: Set<string> = new Set(); // token IDs
  private onPriceUpdateCallback: ((update: PriceUpdate) => void) | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private pingInterval: NodeJS.Timeout | null = null;

  /**
   * Fetch all open markets from Predix.
   * The API may not support pagination — we fetch in one shot and limit client-side.
   */
  async getMarkets(options?: { limit?: number; status?: string }): Promise<PredixMarket[]> {
    const params = new URLSearchParams();
    params.set('status', options?.status ?? 'open');
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }

    const url = `${PREDIX_API}/markets?${params.toString()}`;
    log.debug(`Fetching Predix markets: ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Predix /markets error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    // API may return an array directly or { markets: [...] }
    return Array.isArray(data) ? data : (data.markets ?? []);
  }

  /**
   * Fetch a single market by conditionId.
   */
  async getMarket(conditionId: string): Promise<PredixMarket | null> {
    try {
      const url = `${PREDIX_API}/market/${encodeURIComponent(conditionId)}`;
      const response = await rateLimitedFetch(url);
      if (!response.ok) return null;
      return response.json();
    } catch (error) {
      log.error('Error fetching Predix market', { conditionId, error: String(error) });
      return null;
    }
  }

  /**
   * Bulk-fetch midpoint prices for a list of token IDs.
   * POST /midpoints with { token_ids: [...] } or similar payload.
   * Returns { tokenId: midpointPrice } mapping.
   */
  async getMidpoints(tokenIds: string[]): Promise<PredixMidpoints> {
    if (tokenIds.length === 0) return {};

    try {
      const url = `${PREDIX_API}/midpoints`;
      const response = await rateLimitedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_ids: tokenIds }),
      });

      if (!response.ok) {
        log.warn(`Predix /midpoints returned ${response.status}`);
        return {};
      }

      const data = await response.json();
      // API may return { [tokenId]: mid } or { data: { [tokenId]: mid } }
      return (data?.data ?? data) as PredixMidpoints;
    } catch (error) {
      log.warn('Failed to fetch Predix midpoints', { error: String(error) });
      return {};
    }
  }

  /**
   * Get midpoint for a single token (fallback for non-bulk use).
   */
  async getMidpoint(tokenId: string): Promise<number | null> {
    try {
      const url = `${PREDIX_API}/midpoint?token_id=${encodeURIComponent(tokenId)}`;
      const response = await rateLimitedFetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data?.mid === 'number' ? data.mid : null;
    } catch {
      return null;
    }
  }

  /**
   * Search markets by term (client-side filter since Predix has no search endpoint).
   */
  async searchMarkets(term: string, limit = 20): Promise<PredixMarket[]> {
    const markets = await this.getMarkets({ status: 'open', limit: 200 });
    const lowerTerm = term.toLowerCase();
    return markets
      .filter(m =>
        m.question.toLowerCase().includes(lowerTerm) ||
        m.description?.toLowerCase().includes(lowerTerm)
      )
      .slice(0, limit);
  }

  /**
   * Normalize a Predix market to UnifiedMarket format, optionally with midpoint prices.
   */
  normalizeMarket(market: PredixMarket, midpoints: PredixMidpoints = {}): UnifiedMarket {
    const outcomes = market.options.map(opt => {
      const mid = midpoints[opt.id] ?? 0.5;
      return {
        id: opt.id,
        name: opt.label,
        probability: mid,
        price: Math.round(mid * 100),
      };
    });

    // Normalize probabilities to sum to 1
    const total = outcomes.reduce((s, o) => s + o.probability, 0);
    if (total > 0 && Math.abs(total - 1) > 0.01) {
      for (const o of outcomes) {
        o.probability = o.probability / total;
        o.price = Math.round(o.probability * 100);
      }
    }

    let status: 'open' | 'closed' | 'resolved' = 'open';
    if (market.status === 'resolved') {
      status = 'resolved';
    } else if (market.status === 'paused') {
      status = 'closed';
    }

    const closeDate = (market as any).closeDate || market.endDate || market.closingDate;
    const closeTime = closeDate ? new Date(closeDate).getTime() : 0;

    return {
      id: market.conditionId || market.id,
      source: 'predix',
      question: market.question,
      description: market.description,
      category: this.detectCategory(market),
      outcomes,
      volume24h: 0, // Predix doesn't expose 24h volume separately
      totalVolume: market.volume ?? 0,
      liquidity: 0,
      closeTime,
      status,
      url: `https://predixbr.com/market/${market.conditionId || market.id}`,
      image: market.image,
    };
  }

  /**
   * Detect market category from question text.
   */
  private detectCategory(market: PredixMarket): string {
    const text = `${market.question} ${market.description ?? ''} ${market.category ?? ''}`;

    if (/\bcrypto\b|\bbitcoin\b|\bethereum\b|\bsolana\b|\bbase\b|\bdefi\b|\bnft\b|\btoken\b/i.test(text)) {
      return 'crypto';
    }
    if (/\bfutebol\b|\bsoccer\b|\bnfl\b|\bnba\b|\bchampion|\bcopa\b|\btaça\b|\bvôlei\b|\btênis\b/i.test(text)) {
      return 'sports';
    }
    if (/\belei[çc]ão\b|\bpresidente\b|\bpolítica\b|\bcongresso\b|\bsenado\b|\bvoto\b|\bpartido\b/i.test(text)) {
      return 'politics';
    }
    if (/\bai\b|\bartificial intelligence\b|\bclaude\b|\bgpt\b|\bentretenimento\b/i.test(text)) {
      return 'ai-tech';
    }
    if (/\bfilme\b|\bmúsica\b|\bsérie\b|\bartista\b|\bshow\b|\bmusic\b|\bfilm\b/i.test(text)) {
      return 'entertainment';
    }
    if (/\bação\b|\bbolsa\b|\bmercado\b|\beconomia\b|\binflação\b|\bfinance\b|\bstock\b/i.test(text)) {
      return 'finance';
    }

    return 'other';
  }

  // ============================================================================
  // WEBSOCKET — REAL-TIME PRICE UPDATES
  // ============================================================================

  connectWebSocket(onPriceUpdate: (update: PriceUpdate) => void): void {
    if (typeof WebSocket === 'undefined') {
      log.warn('WebSocket not available in this environment');
      return;
    }

    this.onPriceUpdateCallback = onPriceUpdate;

    try {
      this.ws = new WebSocket(PREDIX_WS);

      this.ws.onopen = () => {
        log.info('WebSocket connected to Predix');
        this.reconnectAttempts = 0;

        // Keep-alive ping every 30s
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30_000);

        // Re-subscribe to any existing subscriptions
        if (this.subscriptions.size > 0 && this.ws) {
          this.ws.send(JSON.stringify({
            type: 'market',
            assets_ids: Array.from(this.subscriptions),
          }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);

          if (data.type === 'price_change') {
            if (this.onPriceUpdateCallback) {
              this.onPriceUpdateCallback({
                marketId: data.market || data.condition_id || '',
                tokenId: data.asset_id || data.token_id || '',
                outcome: data.outcome || '',
                price: parseFloat(data.price || '0'),
                timestamp: Date.now(),
              });
            }
          } else if (data.type === 'last_trade_price') {
            if (this.onPriceUpdateCallback) {
              this.onPriceUpdateCallback({
                marketId: data.market || '',
                tokenId: data.asset_id || '',
                outcome: '',
                price: parseFloat(data.price || '0'),
                timestamp: Date.now(),
              });
            }
          }
        } catch {
          // Ignore parse errors (pong, etc.)
        }
      };

      this.ws.onerror = (error) => {
        log.error('Predix WebSocket error', { error: String(error) });
      };

      this.ws.onclose = () => {
        log.warn('Predix WebSocket disconnected');
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.handleReconnect();
      };
    } catch (error) {
      log.error('Failed to connect Predix WebSocket', { error: String(error) });
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.onPriceUpdateCallback) {
      this.reconnectAttempts++;
      const delay = Math.min(1_000 * Math.pow(2, this.reconnectAttempts), 30_000);
      log.info(`Reconnecting to Predix WS in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => {
        if (this.onPriceUpdateCallback) {
          this.connectWebSocket(this.onPriceUpdateCallback);
        }
      }, delay);
    }
  }

  subscribeToMarket(tokenIds: string[]): void {
    for (const id of tokenIds) {
      this.subscriptions.add(id);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'market',
        assets_ids: tokenIds,
      }));
      log.debug(`Subscribed to ${tokenIds.length} Predix tokens`);
    }
  }

  disconnectWebSocket(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.onPriceUpdateCallback = null;
  }
}

export const predixClient = new PredixClient();
export default predixClient;
