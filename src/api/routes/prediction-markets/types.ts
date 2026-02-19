/**
 * Prediction Markets - Shared types, middleware, and helpers
 */

import { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import type { UnifiedMarket, MarketCategory, CategoryInfo } from '../../../services/market-service.js';

// ============================================================================
// DB Row interfaces
// ============================================================================

/** Shape of a row from the aio_markets table */
export interface DbMarketRow {
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
export interface DbOutcome {
  id?: string;
  name?: string;
  probability?: number;
}

/** Shape of a sub-market inside an event row */
export interface DbEventSubMarket {
  id: string;
  question: string;
  outcomes?: DbOutcome[] | null;
  total_volume?: string | null;
  volume_24h?: string | null;
  liquidity?: string | null;
  close_time?: string | number | null;
}

/** Shape of an event row returned by get_market_events RPC */
export interface DbEventRow {
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

export interface EventMarketWithProb extends DbEventSubMarket {
  probability: number;
  yesOutcome?: DbOutcome;
  firstOutcome?: DbOutcome;
}

// ============================================================================
// Constants
// ============================================================================

export const VALID_CATEGORIES: MarketCategory[] = ['all', 'politics', 'sports', 'crypto', 'ai-tech', 'entertainment', 'finance'];

export const VALID_SORTS = ['volume', 'newest', 'closing_soon'] as const;
export type SortOption = typeof VALID_SORTS[number];

// ============================================================================
// Middleware
// ============================================================================

/** Auth middleware that accepts either Supabase user auth OR agent competition headers */
export async function requireAuthOrAgent(req: Request, res: Response, next: NextFunction) {
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

// ============================================================================
// Helpers
// ============================================================================

/** Convert a Supabase DB row to a UnifiedMarket object */
export function mapDbToUnified(row: DbMarketRow): UnifiedMarket {
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

// Re-export types needed by sub-routers
export type { UnifiedMarket, MarketCategory, CategoryInfo };
