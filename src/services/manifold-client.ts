/**
 * Manifold Markets API Client
 * Public API - no authentication required
 * Rate limit: 500 requests/minute
 */

import { createLogger } from '../shared/utils/logger.js';
import { circuits } from '../shared/utils/circuit-breaker.js';

const log = createLogger('ManifoldClient');
const MANIFOLD_API_BASE = 'https://api.manifold.markets';

// Rate limiting
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 500;
let requestTimestamps: number[] = [];

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();

  // Remove timestamps older than the window
  requestTimestamps = requestTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);

  // Check if we're at the rate limit
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestTimestamp = requestTimestamps[0];
    const waitTime = RATE_LIMIT_WINDOW - (now - oldestTimestamp);
    log.warn(`Rate limit reached, waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  requestTimestamps.push(Date.now());
  return circuits.manifold.execute(() => fetch(url));
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ManifoldMarket {
  id: string;
  creatorId: string;
  creatorUsername: string;
  creatorName: string;
  creatorAvatarUrl?: string;
  closeTime?: number;
  createdTime: number;
  question: string;
  slug: string;
  url: string;
  pool: Record<string, number>;
  probability?: number;
  p?: number;
  totalLiquidity: number;
  outcomeType: 'BINARY' | 'MULTIPLE_CHOICE' | 'FREE_RESPONSE' | 'NUMERIC' | 'PSEUDO_NUMERIC';
  mechanism: 'cpmm-1' | 'cpmm-multi-1' | 'dpm-2';
  volume: number;
  volume24Hours: number;
  isResolved: boolean;
  resolution?: string;
  resolutionTime?: number;
  resolutionProbability?: number;
  lastBetTime?: number;
  lastCommentTime?: number;
  lastUpdatedTime?: number;
  description?: string | object;
  textDescription?: string;
  coverImageUrl?: string;
  groupSlugs?: string[];
  answers?: ManifoldAnswer[];
  uniqueBettorCount?: number;
}

export interface ManifoldAnswer {
  id: string;
  index: number;
  contractId: string;
  userId: string;
  text: string;
  createdTime: number;
  probability?: number;
  pool?: Record<string, number>;
  isOther?: boolean;
  resolution?: string;
  resolutionTime?: number;
}

export interface ManifoldBet {
  id: string;
  userId: string;
  contractId: string;
  amount: number;
  shares: number;
  outcome: string;
  probBefore: number;
  probAfter: number;
  createdTime: number;
  isRedemption?: boolean;
  isAnte?: boolean;
  answerId?: string;
}

export interface GetMarketsOptions {
  limit?: number;
  sort?: 'newest' | 'score' | 'liquidity' | 'close-date' | 'resolve-date' | 'last-updated' | '24-hour-vol';
  filter?: 'open' | 'closed' | 'resolved' | 'all';
  contractType?: 'BINARY' | 'MULTIPLE_CHOICE' | 'FREE_RESPONSE' | 'NUMERIC' | 'PSEUDO_NUMERIC';
  before?: string;
}

export interface SearchMarketsOptions {
  limit?: number;
  filter?: 'open' | 'closed' | 'resolved' | 'all';
  sort?: 'relevance' | 'score' | 'newest' | 'liquidity' | 'close-date' | '24-hour-vol';
  contractType?: 'BINARY' | 'MULTIPLE_CHOICE';
}

// ============================================================================
// MANIFOLD API CLIENT
// ============================================================================

export class ManifoldClient {
  /**
   * Get a list of markets
   * GET /v0/markets
   */
  async getMarkets(options: GetMarketsOptions = {}): Promise<ManifoldMarket[]> {
    const params = new URLSearchParams();

    if (options.limit) params.set('limit', String(options.limit));
    if (options.sort) params.set('sort', options.sort);
    if (options.filter) params.set('filter', options.filter);
    if (options.contractType) params.set('contractType', options.contractType);
    if (options.before) params.set('before', options.before);

    const url = `${MANIFOLD_API_BASE}/v0/markets?${params.toString()}`;
    log.debug(`Fetching markets: ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch markets: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get a single market by ID
   * GET /v0/market/:id
   */
  async getMarket(marketId: string): Promise<ManifoldMarket> {
    const url = `${MANIFOLD_API_BASE}/v0/market/${marketId}`;
    log.debug(`Fetching market: ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch market ${marketId}: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get a market by slug
   * GET /v0/slug/:slug
   */
  async getMarketBySlug(slug: string): Promise<ManifoldMarket> {
    const url = `${MANIFOLD_API_BASE}/v0/slug/${slug}`;
    log.debug(`Fetching market by slug: ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch market with slug ${slug}: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search markets by query
   * GET /v0/search-markets
   */
  async searchMarkets(query: string, options: SearchMarketsOptions = {}): Promise<ManifoldMarket[]> {
    const params = new URLSearchParams();
    params.set('term', query);

    if (options.limit) params.set('limit', String(options.limit));
    if (options.filter) params.set('filter', options.filter);
    if (options.sort) params.set('sort', options.sort);
    if (options.contractType) params.set('contractType', options.contractType);

    const url = `${MANIFOLD_API_BASE}/v0/search-markets?${params.toString()}`;
    log.debug(`Searching markets: ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to search markets: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get bets for a market
   * GET /v0/bets
   */
  async getMarketBets(marketId: string, limit: number = 100): Promise<ManifoldBet[]> {
    const params = new URLSearchParams();
    params.set('contractId', marketId);
    params.set('limit', String(limit));

    const url = `${MANIFOLD_API_BASE}/v0/bets?${params.toString()}`;
    log.debug(`Fetching bets: ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch bets for market ${marketId}: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate number of shares for a bet amount using CPMM
 * Based on Manifold's constant product market maker
 */
export function calculateShares(
  pool: Record<string, number>,
  amount: number,
  outcome: 'YES' | 'NO'
): number {
  const y = pool['YES'] || 0;
  const n = pool['NO'] || 0;

  if (y === 0 || n === 0) {
    return amount; // Fallback for empty pool
  }

  // Constant product: y * n = k
  // After buying YES shares: (y - shares) * (n + amount) = k
  // Solving for shares: shares = y - k / (n + amount)

  const k = y * n;

  if (outcome === 'YES') {
    const shares = y - k / (n + amount);
    return Math.max(0, shares);
  } else {
    const shares = n - k / (y + amount);
    return Math.max(0, shares);
  }
}

/**
 * Convert pool balances to probability
 */
export function poolToProbability(pool: Record<string, number>): number {
  const y = pool['YES'] || 0;
  const n = pool['NO'] || 0;

  if (y + n === 0) return 0.5;

  // For CPMM-1: probability = n / (y + n)
  // This is counterintuitive but correct - more YES shares = higher YES price = higher NO pool
  return n / (y + n);
}

/**
 * Calculate expected value for a bet
 */
export function calculateExpectedValue(
  pool: Record<string, number>,
  amount: number,
  outcome: 'YES' | 'NO',
  trueProbability: number
): number {
  const shares = calculateShares(pool, amount, outcome);

  // If outcome matches, we get shares worth $1 each
  // If outcome doesn't match, we lose our bet
  const winProbability = outcome === 'YES' ? trueProbability : 1 - trueProbability;

  const expectedWin = winProbability * shares;
  const expectedLoss = (1 - winProbability) * amount;

  return expectedWin - expectedLoss;
}

/**
 * Calculate implied probability from market odds
 */
export function getImpliedProbability(market: ManifoldMarket): number {
  // Use direct probability if available
  if (market.probability !== undefined) {
    return market.probability;
  }

  // Fall back to pool calculation
  if (market.pool) {
    return poolToProbability(market.pool);
  }

  // Default to 50%
  return 0.5;
}

/**
 * Format market for display
 */
export function formatMarketSummary(market: ManifoldMarket): string {
  const prob = getImpliedProbability(market);
  const probPercent = (prob * 100).toFixed(1);
  const volume = market.volume.toLocaleString();
  const closeDate = market.closeTime
    ? new Date(market.closeTime).toLocaleDateString()
    : 'No close date';

  return `${market.question}\n  Probability: ${probPercent}% | Volume: M$${volume} | Closes: ${closeDate}`;
}

// Export singleton instance
export const manifoldClient = new ManifoldClient();
export default manifoldClient;
