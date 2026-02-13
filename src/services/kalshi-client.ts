/**
 * Kalshi Trading API Client
 * Requires authentication - tokens expire every 30 minutes
 * Docs: https://trading-api.readme.io/reference/overview
 */

import { createLogger } from '../shared/utils/logger.js';
import { circuits } from '../shared/utils/circuit-breaker.js';
import type { UnifiedMarket } from './polymarket-client.js';

const log = createLogger('KalshiClient');
const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  open_time: string;
  close_time: string;
  expiration_time: string;
  expected_expiration_time?: string;
  status: 'open' | 'active' | 'closed' | 'settled';
  response_price_units: string;
  notional_value: number;
  tick_size: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  previous_price?: number;
  previous_yes_bid?: number;
  previous_yes_ask?: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  result?: 'yes' | 'no';
  can_close_early: boolean;
  expiration_value?: string;
  category?: string;
  series_ticker?: string;
  rules_primary?: string;
  rules_secondary?: string;
  strike_type?: string;
  floor_strike?: number;
  cap_strike?: number;
}

export interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  sub_title: string;
  title: string;
  category: string;
  markets: KalshiMarket[];
  status: string;
}

interface AuthResponse {
  token: string;
  member_id: string;
}

// ============================================================================
// KALSHI API CLIENT
// ============================================================================

export class KalshiClient {
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private memberId: string | null = null;
  private email: string | null = null;
  private password: string | null = null;

  constructor() {
    // Load credentials from environment
    this.email = process.env.KALSHI_EMAIL || null;
    this.password = process.env.KALSHI_PASSWORD || null;
  }

  /**
   * Check if client is configured with credentials (for authenticated trading ops)
   */
  isConfigured(): boolean {
    // Public read endpoints work without auth, so always return true
    return true;
  }

  /**
   * Check if authenticated trading operations are available
   */
  hasCredentials(): boolean {
    return !!(this.email && this.password);
  }

  /**
   * Authenticate with Kalshi (required only for trading, not for reading markets)
   * POST /login
   */
  async authenticate(): Promise<string> {
    if (!this.email || !this.password) {
      throw new Error('Kalshi credentials not configured. Set KALSHI_EMAIL and KALSHI_PASSWORD env vars.');
    }

    log.info('Authenticating with Kalshi...');

    const response = await fetch(`${KALSHI_API}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: this.email,
        password: this.password
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kalshi authentication failed: ${response.status} - ${error}`);
    }

    const data: AuthResponse = await response.json();
    this.token = data.token;
    this.memberId = data.member_id;
    // Tokens expire after 30 minutes, refresh at 25 minutes
    this.tokenExpiry = Date.now() + 25 * 60 * 1000;

    log.info('Kalshi authentication successful');
    return this.token;
  }

  /**
   * Ensure we have a valid auth token (for authenticated endpoints)
   */
  async ensureAuth(): Promise<void> {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  /**
   * Make a public (unauthenticated) request - works for market reads
   */
  private async publicFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    return circuits.kalshi.execute(() => fetch(url, { ...options, headers }));
  }

  /**
   * Make an authenticated request (for trading operations)
   */
  private async authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    await this.ensureAuth();

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return circuits.kalshi.execute(() => fetch(url, {
      ...options,
      headers
    }));
  }

  /**
   * Get a list of markets
   * GET /markets
   */
  async getMarkets(options?: {
    status?: 'open' | 'closed' | 'settled';
    cursor?: string;
    limit?: number;
    event_ticker?: string;
    series_ticker?: string;
    tickers?: string;
  }): Promise<{ markets: KalshiMarket[]; cursor?: string }> {
    const params = new URLSearchParams();

    if (options?.status) params.set('status', options.status);
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.event_ticker) params.set('event_ticker', options.event_ticker);
    if (options?.series_ticker) params.set('series_ticker', options.series_ticker);
    if (options?.tickers) params.set('tickers', options.tickers);

    const url = `${KALSHI_API}/markets?${params.toString()}`;
    log.debug(`Fetching Kalshi markets: ${url}`);

    const response = await this.publicFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch Kalshi markets: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get a single market by ticker
   * GET /markets/:ticker
   */
  async getMarket(ticker: string): Promise<KalshiMarket> {
    const url = `${KALSHI_API}/markets/${ticker}`;
    log.debug(`Fetching Kalshi market: ${url}`);

    const response = await this.publicFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch Kalshi market ${ticker}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.market;
  }

  /**
   * Get events (groups of related markets)
   * GET /events
   */
  async getEvents(options?: {
    status?: string;
    cursor?: string;
    limit?: number;
    series_ticker?: string;
    with_nested_markets?: boolean;
  }): Promise<{ events: KalshiEvent[]; cursor?: string }> {
    const params = new URLSearchParams();

    if (options?.status) params.set('status', options.status);
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.series_ticker) params.set('series_ticker', options.series_ticker);
    if (options?.with_nested_markets !== undefined) {
      params.set('with_nested_markets', String(options.with_nested_markets));
    }

    const url = `${KALSHI_API}/events?${params.toString()}`;
    log.debug(`Fetching Kalshi events: ${url}`);

    const response = await this.publicFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch Kalshi events: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search markets by term
   */
  async searchMarkets(term: string, limit: number = 20): Promise<KalshiMarket[]> {
    const { markets } = await this.getMarkets({ status: 'open', limit: 100 });
    const lowerTerm = term.toLowerCase();

    return markets
      .filter(m =>
        m.title.toLowerCase().includes(lowerTerm) ||
        m.subtitle?.toLowerCase().includes(lowerTerm) ||
        m.category?.toLowerCase().includes(lowerTerm)
      )
      .slice(0, limit);
  }

  /**
   * Normalize Kalshi market to unified format
   */
  normalizeMarket(market: KalshiMarket): UnifiedMarket {
    // Calculate mid price from bid/ask
    const yesPrice = (market.yes_bid + market.yes_ask) / 2;
    const noPrice = (market.no_bid + market.no_ask) / 2;

    // Calculate price changes
    let yesPriceChange: number | undefined;
    let noPriceChange: number | undefined;

    if (market.previous_yes_bid !== undefined && market.previous_yes_ask !== undefined) {
      const prevYes = (market.previous_yes_bid + market.previous_yes_ask) / 2;
      yesPriceChange = yesPrice - prevYes;
      const prevNo = 100 - prevYes;
      noPriceChange = noPrice - prevNo;
    }

    const outcomes = [
      {
        id: `${market.ticker}-yes`,
        name: 'YES',
        probability: yesPrice / 100,
        price: Math.round(yesPrice),
        previousPrice: market.previous_price,
        priceChange24h: yesPriceChange
      },
      {
        id: `${market.ticker}-no`,
        name: 'NO',
        probability: noPrice / 100,
        price: Math.round(noPrice),
        previousPrice: market.previous_price ? 100 - market.previous_price : undefined,
        priceChange24h: noPriceChange
      }
    ];

    // Map status (new API uses 'active' instead of 'open')
    let status: 'open' | 'closed' | 'resolved' = 'open';
    if (market.status === 'settled') {
      status = 'resolved';
    } else if (market.status === 'closed') {
      status = 'closed';
    } else if (market.status === 'active' || market.status === 'open') {
      status = 'open';
    }

    // Map category
    let category = market.category || 'general';
    if (category.toLowerCase().includes('tech') || market.title.toLowerCase().includes('ai')) {
      category = 'ai-tech';
    }

    return {
      id: market.ticker,
      source: 'kalshi',
      question: market.title,
      description: market.subtitle,
      category,
      outcomes,
      volume24h: market.volume_24h || 0,
      totalVolume: market.volume || 0,
      liquidity: market.liquidity || market.open_interest || 0,
      closeTime: new Date(market.close_time).getTime(),
      status,
      url: `https://kalshi.com/markets/${market.ticker}`
    };
  }
}

// Export singleton instance (will be null if not configured)
export const kalshiClient = new KalshiClient();
export default kalshiClient;
