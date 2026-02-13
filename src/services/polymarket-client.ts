/**
 * Polymarket API Client
 * Uses the Gamma API for market data and CLOB API for order books
 * Docs: https://docs.polymarket.com/
 */

import { createLogger } from '../shared/utils/logger.js';
import { circuits } from '../shared/utils/circuit-breaker.js';

const log = createLogger('PolymarketClient');
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';
const POLYMARKET_WS = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

// Rate limiting
const RATE_LIMIT_WINDOW = 60000;
const MAX_REQUESTS_PER_WINDOW = 100;
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
  return circuits.polymarket.execute(() => fetch(url, options));
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description: string;
  outcomes: string; // JSON string like '["Yes", "No"]'
  outcomePrices: string; // JSON string like '["0.65", "0.35"]'
  volume: string;
  volume24hr: number;
  liquidity: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  endDate: string;
  image?: string;
  icon?: string;
  clobTokenIds?: string; // JSON string of token IDs
  acceptingOrders: boolean;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  oneDayPriceChange?: number;
  events?: Array<{
    id: string;
    title: string;
    slug: string;
    volume: number;
    liquidity: number;
  }>;
}

export interface OrderBook {
  market: string;
  asset_id: string;
  hash: string;
  timestamp: number;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

export interface PriceUpdate {
  marketId: string;
  tokenId: string;
  outcome: string;
  price: number;
  timestamp: number;
}

export interface UnifiedMarket {
  id: string;
  source: 'polymarket' | 'kalshi';
  question: string;
  description?: string;
  category: string;
  outcomes: {
    id: string;
    name: string;
    probability: number;
    price: number;
    previousPrice?: number;
    priceChange24h?: number;
  }[];
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  closeTime: number;
  status: 'open' | 'closed' | 'resolved';
  url: string;
  image?: string;
}

// ============================================================================
// POLYMARKET API CLIENT
// ============================================================================

export class PolymarketClient {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Set<string>> = new Map(); // marketId -> Set of tokenIds
  private onPriceUpdateCallback: ((update: PriceUpdate) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pingInterval: NodeJS.Timeout | null = null;

  /**
   * Get markets from Gamma API
   */
  async getMarkets(options?: {
    closed?: boolean;
    limit?: number;
    active?: boolean;
    offset?: number;
  }): Promise<GammaMarket[]> {
    const params = new URLSearchParams();
    if (options?.closed !== undefined) {
      params.set('closed', String(options.closed));
    }
    if (options?.active !== undefined) {
      params.set('active', String(options.active));
    }
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    if (options?.offset !== undefined) {
      params.set('offset', String(options.offset));
    }

    const url = `${GAMMA_API}/markets?${params.toString()}`;
    log.debug(`Fetching markets: ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch markets: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get a single market by slug or condition ID
   */
  async getMarket(idOrSlug: string): Promise<GammaMarket | null> {
    // Try by slug first
    const url = `${GAMMA_API}/markets?slug=${encodeURIComponent(idOrSlug)}`;
    log.debug(`Fetching market: ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch market: ${response.status} ${response.statusText}`);
    }

    const markets = await response.json();
    if (markets.length > 0) {
      return markets[0];
    }

    // Try by condition ID
    const conditionUrl = `${GAMMA_API}/markets?conditionId=${encodeURIComponent(idOrSlug)}`;
    const conditionResponse = await rateLimitedFetch(conditionUrl);

    if (conditionResponse.ok) {
      const conditionMarkets = await conditionResponse.json();
      if (conditionMarkets.length > 0) {
        return conditionMarkets[0];
      }
    }

    return null;
  }

  /**
   * Search markets by term
   */
  async searchMarkets(term: string, limit: number = 20): Promise<GammaMarket[]> {
    // Gamma API doesn't have search, so we fetch and filter
    const markets = await this.getMarkets({ closed: false, active: true, limit: 100 });
    const lowerTerm = term.toLowerCase();

    return markets
      .filter(m =>
        m.question.toLowerCase().includes(lowerTerm) ||
        m.description?.toLowerCase().includes(lowerTerm)
      )
      .slice(0, limit);
  }

  /**
   * Get order book for a token
   */
  async getOrderBook(tokenId: string): Promise<OrderBook | null> {
    try {
      const url = `${CLOB_API}/book?token_id=${tokenId}`;
      log.debug(`Fetching order book: ${url}`);

      const response = await rateLimitedFetch(url);

      if (!response.ok) {
        return null;
      }

      return response.json();
    } catch (error) {
      log.error('Error fetching order book', { error: String(error) });
      return null;
    }
  }

  /**
   * Get midpoint price from order book
   */
  async getMidpointPrice(tokenId: string): Promise<number | null> {
    const book = await this.getOrderBook(tokenId);
    if (!book) return null;

    const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;

    return (bestBid + bestAsk) / 2;
  }

  /**
   * Connect to WebSocket for real-time price updates
   */
  connectWebSocket(onPriceUpdate: (update: PriceUpdate) => void): void {
    if (typeof WebSocket === 'undefined') {
      log.warn('WebSocket not available in this environment');
      return;
    }

    this.onPriceUpdateCallback = onPriceUpdate;

    try {
      // Connect to CLOB WebSocket
      this.ws = new WebSocket(POLYMARKET_WS);

      this.ws.onopen = () => {
        log.info('WebSocket connected to Polymarket');
        this.reconnectAttempts = 0;

        // Start ping interval to keep connection alive
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);

        // Resubscribe to any existing subscriptions
        this.subscriptions.forEach((tokenIds, marketId) => {
          tokenIds.forEach(tokenId => {
            this.sendSubscription(tokenId, marketId);
          });
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle different message types
          if (data.type === 'price_change' || data.event_type === 'price_change') {
            const marketId = data.market || data.asset_id || '';
            const tokenId = data.asset_id || data.token_id || '';

            if (this.onPriceUpdateCallback) {
              this.onPriceUpdateCallback({
                marketId,
                tokenId,
                outcome: data.outcome || 'YES',
                price: parseFloat(data.price || data.last_price || '0'),
                timestamp: Date.now()
              });
            }
          } else if (data.type === 'book' || data.event_type === 'book') {
            // Order book update - extract mid price
            const bids = data.bids || [];
            const asks = data.asks || [];

            if (bids.length > 0 || asks.length > 0) {
              const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
              const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 1;
              const midPrice = (bestBid + bestAsk) / 2;

              if (this.onPriceUpdateCallback) {
                this.onPriceUpdateCallback({
                  marketId: data.market || data.asset_id || '',
                  tokenId: data.asset_id || '',
                  outcome: 'YES',
                  price: midPrice,
                  timestamp: Date.now()
                });
              }
            }
          }
        } catch (error) {
          // Ignore parse errors for pong messages etc
        }
      };

      this.ws.onerror = (error) => {
        log.error('WebSocket error', { error: String(error) });
      };

      this.ws.onclose = () => {
        log.warn('WebSocket disconnected');
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.handleReconnect();
      };

    } catch (error) {
      log.error('Failed to connect WebSocket', { error: String(error) });
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.onPriceUpdateCallback) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      log.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

      setTimeout(() => {
        if (this.onPriceUpdateCallback) {
          this.connectWebSocket(this.onPriceUpdateCallback);
        }
      }, delay);
    }
  }

  private sendSubscription(tokenId: string, marketId: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Subscribe to order book updates for this token
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'book',
        assets_id: tokenId,
        market: marketId
      }));
      log.debug(`Subscribed to token ${tokenId}`);
    }
  }

  /**
   * Subscribe to price updates for a market
   */
  subscribeToMarket(marketId: string, tokenIds?: string[]): void {
    if (!this.subscriptions.has(marketId)) {
      this.subscriptions.set(marketId, new Set());
    }

    const subs = this.subscriptions.get(marketId)!;

    if (tokenIds) {
      tokenIds.forEach(tokenId => {
        subs.add(tokenId);
        this.sendSubscription(tokenId, marketId);
      });
    }
  }

  /**
   * Unsubscribe from market updates
   */
  unsubscribeFromMarket(marketId: string): void {
    this.subscriptions.delete(marketId);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        market: marketId
      }));
    }
  }

  /**
   * Disconnect WebSocket
   */
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

  /**
   * Normalize Gamma market to unified format
   */
  normalizeMarket(market: GammaMarket): UnifiedMarket {
    // Parse outcomes and prices from JSON strings
    let outcomeNames: string[] = ['Yes', 'No'];
    let outcomePrices: number[] = [0.5, 0.5];
    let tokenIds: string[] = [];

    try {
      outcomeNames = JSON.parse(market.outcomes);
    } catch {}

    try {
      outcomePrices = JSON.parse(market.outcomePrices).map((p: string) => parseFloat(p));
    } catch {}

    try {
      if (market.clobTokenIds) {
        tokenIds = JSON.parse(market.clobTokenIds);
      }
    } catch {}

    const outcomes = outcomeNames.map((name, idx) => ({
      id: tokenIds[idx] || `${market.conditionId}-${idx}`,
      name: name.toUpperCase() === 'YES' ? 'YES' : name.toUpperCase() === 'NO' ? 'NO' : name,
      probability: outcomePrices[idx] || 0.5,
      price: Math.round((outcomePrices[idx] || 0.5) * 100),
      priceChange24h: market.oneDayPriceChange ? market.oneDayPriceChange * 100 : undefined
    }));

    // Determine status
    let status: 'open' | 'closed' | 'resolved' = 'open';
    if (market.archived) {
      status = 'resolved';
    } else if (market.closed || !market.acceptingOrders) {
      status = 'closed';
    }

    // Determine category using word boundaries to avoid false matches
    const text = `${market.question} ${market.description || ''}`;

    let category = 'other';
    if (/\bai\b|artificial intelligence|\bgpt[-\s]?[34o]|\bclaude\b|\bopenai\b|\banthropic\b|\bllm\b|machine learning|\bdeepseek\b|\bgemini\b/i.test(text)) {
      category = 'ai-tech';
    } else if (/\btrump\b|\bbiden\b|\belection\b|\bpresident\b|\bcongress\b|\bsenate\b/i.test(text)) {
      category = 'politics';
    } else if (/\bbitcoin\b|\bcrypto\b|\bethereum\b|\bbtc\b|\beth\b/i.test(text)) {
      category = 'crypto';
    } else if (/\bnba\b|\bnfl\b|\bsuper bowl\b|\bworld cup\b|\bsoccer\b|\bfootball\b/i.test(text)) {
      category = 'sports';
    }

    return {
      id: market.conditionId,
      source: 'polymarket',
      question: market.question,
      description: market.description,
      category,
      outcomes,
      volume24h: market.volume24hr || 0,
      totalVolume: parseFloat(market.volume) || 0,
      liquidity: parseFloat(market.liquidity) || 0,
      closeTime: new Date(market.endDate).getTime(),
      status,
      url: market.events?.[0]?.slug
        ? `https://polymarket.com/event/${market.events[0].slug}`
        : `https://polymarket.com/event/${market.slug}`,
      image: market.image || market.icon
    };
  }

  /**
   * Get token IDs for a market (needed for WebSocket subscriptions)
   */
  getTokenIds(market: GammaMarket): string[] {
    try {
      if (market.clobTokenIds) {
        return JSON.parse(market.clobTokenIds);
      }
    } catch {}
    return [];
  }
}

// Export singleton instance
export const polymarketClient = new PolymarketClient();
export default polymarketClient;
