/**
 * Glicko-2 Rating Service
 *
 * Full Glicko-2 implementation for AI Olympics competitions.
 * Reference: http://www.glicko.net/glicko/glicko2.pdf (Glickman, 2013)
 *
 * Replaces the basic ELO system with proper rating deviation and volatility tracking.
 */

import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';
import type { LeaderboardEntry } from '../shared/types/index.js';

const log = createLogger('RatingService');

// ============================================================================
// CONSTANTS
// ============================================================================

export const GLICKO2_SCALE = 173.7178; // Scaling factor between Glicko and Glicko-2
export const TAU = 0.5;                // System volatility constant (constrains volatility change)
export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOL = 0.06;
export const MIN_RATING = 100;
const CONVERGENCE_TOLERANCE = 0.000001;
const MAX_ITERATIONS = 100;

// ============================================================================
// INTERFACES
// ============================================================================

export interface Glicko2Rating {
  id: string;
  rating: number;
  rd: number;
  volatility: number;
  totalCompetitions: number;
}

interface Glicko2Result {
  rating: number;
  rd: number;
  volatility: number;
}

interface RatingChange {
  ratingBefore: number;
  ratingAfter: number;
  change: number;
  rdBefore: number;
  rdAfter: number;
  volatilityBefore: number;
  volatilityAfter: number;
}

// ============================================================================
// GLICKO-2 SCALE CONVERSIONS
// ============================================================================

/**
 * Convert Glicko-1 scale rating and RD to Glicko-2 internal scale.
 * mu = (r - 1500) / 173.7178
 * phi = RD / 173.7178
 */
export function toGlicko2Scale(rating: number, rd: number): { mu: number; phi: number } {
  return {
    mu: (rating - DEFAULT_RATING) / GLICKO2_SCALE,
    phi: rd / GLICKO2_SCALE,
  };
}

/**
 * Convert Glicko-2 internal scale back to Glicko-1 scale.
 * r = 173.7178 * mu + 1500
 * RD = 173.7178 * phi
 */
export function fromGlicko2Scale(mu: number, phi: number): { rating: number; rd: number } {
  return {
    rating: GLICKO2_SCALE * mu + DEFAULT_RATING,
    rd: GLICKO2_SCALE * phi,
  };
}

// ============================================================================
// CORE GLICKO-2 FUNCTIONS
// ============================================================================

/**
 * The g function reduces the impact of opponents with high RD.
 * g(phi) = 1 / sqrt(1 + 3*phi^2 / pi^2)
 */
export function g(phi: number): number {
  return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
}

/**
 * The E function computes expected score against an opponent.
 * E(mu, mu_j, phi_j) = 1 / (1 + exp(-g(phi_j) * (mu - mu_j)))
 */
export function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Calculate new volatility using the Illinois algorithm (a variation of
 * the regula falsi / false position method) to solve f(x) = 0.
 *
 * f(x) = (e^x * (delta^2 - phi^2 - v - e^x)) / (2*(phi^2 + v + e^x)^2)
 *        - (x - ln(sigma^2)) / tau^2
 */
export function calculateNewVolatility(
  sigma: number,
  delta: number,
  phi: number,
  v: number
): number {
  const a = Math.log(sigma * sigma);
  const tau2 = TAU * TAU;
  const phi2 = phi * phi;

  // f(x) as defined in the Glicko-2 paper (Step 5.2)
  function f(x: number): number {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi2 - v - ex);
    const den = 2 * (phi2 + v + ex) * (phi2 + v + ex);
    return num / den - (x - a) / tau2;
  }

  // Step 5.3: Set initial values A and B
  let A = a;
  let B: number;

  if (delta * delta > phi2 + v) {
    B = Math.log(delta * delta - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) {
      k++;
      if (k > MAX_ITERATIONS) break; // Safety guard
    }
    B = a - k * TAU;
  }

  // Step 5.4: Illinois algorithm
  let fA = f(A);
  let fB = f(B);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (Math.abs(B - A) <= CONVERGENCE_TOLERANCE) break;

    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);

    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2; // Illinois step: halve f(A) instead of keeping it
    }

    B = C;
    fB = fC;
  }

  return Math.exp(A / 2);
}

/**
 * Calculate new Glicko-2 rating for a player after a rating period.
 *
 * @param player - The player's current rating info
 * @param opponents - Array of opponents' rating info
 * @param scores - Array of actual scores (1=win, 0.5=draw, 0=loss) matching opponents order
 * @returns New rating, RD, and volatility
 */
export function calculateGlicko2(
  player: { rating: number; rd: number; volatility: number },
  opponents: Array<{ rating: number; rd: number }>,
  scores: number[]
): Glicko2Result {
  // Step 1: No opponents → RD increases (rating period with no games)
  if (opponents.length === 0) {
    const { phi } = toGlicko2Scale(player.rating, player.rd);
    const phiStar = Math.sqrt(phi * phi + player.volatility * player.volatility);
    const newRd = Math.min(fromGlicko2Scale(0, phiStar).rd, DEFAULT_RD);
    return { rating: player.rating, rd: newRd, volatility: player.volatility };
  }

  // Step 2: Convert to Glicko-2 scale
  const { mu, phi } = toGlicko2Scale(player.rating, player.rd);

  const opponentsMu: number[] = [];
  const opponentsPhi: number[] = [];
  for (const opp of opponents) {
    const { mu: mj, phi: pj } = toGlicko2Scale(opp.rating, opp.rd);
    opponentsMu.push(mj);
    opponentsPhi.push(pj);
  }

  // Step 3: Compute v (estimated variance)
  let vInv = 0;
  for (let j = 0; j < opponents.length; j++) {
    const gj = g(opponentsPhi[j]);
    const ej = E(mu, opponentsMu[j], opponentsPhi[j]);
    vInv += gj * gj * ej * (1 - ej);
  }
  const v = 1 / vInv;

  // Step 4: Compute delta (estimated improvement)
  let deltaSum = 0;
  for (let j = 0; j < opponents.length; j++) {
    const gj = g(opponentsPhi[j]);
    const ej = E(mu, opponentsMu[j], opponentsPhi[j]);
    deltaSum += gj * (scores[j] - ej);
  }
  const delta = v * deltaSum;

  // Step 5: Determine new volatility
  const sigmaNew = calculateNewVolatility(player.volatility, delta, phi, v);

  // Step 6: Update rating deviation (phi*)
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);

  // Step 7: New phi and mu
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;

  // Convert back to Glicko-1 scale
  const { rating: newRating, rd: newRd } = fromGlicko2Scale(muNew, phiNew);

  return {
    rating: Math.max(MIN_RATING, Math.round(newRating)),
    rd: Math.round(newRd * 100) / 100,
    volatility: Math.round(sigmaNew * 1000000) / 1000000, // 6 decimal places
  };
}

// ============================================================================
// MULTI-PLAYER ADAPTER
// ============================================================================

/**
 * Calculate Glicko-2 rating updates for a multi-player competition.
 *
 * Each player is paired against every other player. Rankings determine scores:
 * - Better rank → score 1.0 against that opponent
 * - Same rank → score 0.5
 * - Worse rank → score 0.0
 */
export function calculateMultiPlayerGlicko2(
  agents: Glicko2Rating[],
  rankings: Map<string, number>
): Map<string, RatingChange> {
  const results = new Map<string, RatingChange>();

  for (const agent of agents) {
    const rank = rankings.get(agent.id);
    if (rank === undefined) continue;

    const opponents: Array<{ rating: number; rd: number }> = [];
    const scores: number[] = [];

    for (const opponent of agents) {
      if (opponent.id === agent.id) continue;
      const oppRank = rankings.get(opponent.id);
      if (oppRank === undefined) continue;

      opponents.push({ rating: opponent.rating, rd: opponent.rd });

      if (rank < oppRank) {
        scores.push(1.0);
      } else if (rank === oppRank) {
        scores.push(0.5);
      } else {
        scores.push(0.0);
      }
    }

    const result = calculateGlicko2(
      { rating: agent.rating, rd: agent.rd, volatility: agent.volatility },
      opponents,
      scores
    );

    results.set(agent.id, {
      ratingBefore: agent.rating,
      ratingAfter: result.rating,
      change: result.rating - agent.rating,
      rdBefore: agent.rd,
      rdAfter: result.rd,
      volatilityBefore: agent.volatility,
      volatilityAfter: result.volatility,
    });
  }

  return results;
}

// ============================================================================
// DATABASE PERSISTENCE
// ============================================================================

/**
 * Update ratings after a competition completes.
 *
 * @param competitionId - The DB competition id
 * @param participants - Array of { agent_id } from aio_competition_participants
 * @param leaderboard - The final leaderboard from CompetitionController
 * @param domainId - Optional domain id for domain-specific ratings
 */
export async function updateRatingsAfterCompetition(
  competitionId: string,
  participants: Array<{ agent_id: string }>,
  leaderboard: LeaderboardEntry[],
  domainId?: string | null
): Promise<void> {
  try {
    const agentIds = participants.map(p => p.agent_id);

    // 1. Fetch current ratings including Glicko-2 columns
    const { data: agentsData, error: agentsErr } = await supabase
      .from('aio_agents')
      .select('id, elo_rating, total_competitions, rating_deviation, volatility')
      .in('id', agentIds);

    if (agentsErr || !agentsData) {
      log.error('Failed to fetch agent ratings', { error: agentsErr?.message });
      return;
    }

    // Build rankings map from leaderboard
    const rankings = new Map<string, number>();
    for (const entry of leaderboard) {
      rankings.set(entry.agentId, entry.rank);
    }

    // Build Glicko2Rating array
    const glicko2Agents: Glicko2Rating[] = agentsData.map((a: Record<string, unknown>) => ({
      id: a.id as string,
      rating: (a.elo_rating as number) || DEFAULT_RATING,
      rd: (a.rating_deviation as number) || DEFAULT_RD,
      volatility: (a.volatility as number) || DEFAULT_VOL,
      totalCompetitions: (a.total_competitions as number) || 0,
    }));

    // 2. Calculate new Glicko-2 ratings
    const ratingResults = calculateMultiPlayerGlicko2(glicko2Agents, rankings);

    // 3. Persist results
    for (const [agentId, result] of ratingResults) {
      const rank = rankings.get(agentId);
      if (rank === undefined) continue;

      // Atomic rating update via RPC (now with Glicko-2 params)
      const { error: updateErr } = await supabase
        .rpc('aio_update_agent_elo', {
          p_agent_id: agentId,
          p_new_rating: result.ratingAfter,
          p_new_rd: result.rdAfter,
          p_new_volatility: result.volatilityAfter,
        });

      if (updateErr) {
        log.error('Failed to update agent rating', { agentId, error: updateErr.message });
      }

      // Insert into aio_elo_history with Glicko-2 columns
      const { error: historyErr } = await supabase
        .from('aio_elo_history')
        .insert({
          agent_id: agentId,
          competition_id: competitionId,
          rating_before: result.ratingBefore,
          rating_after: result.ratingAfter,
          rating_change: result.change,
          domain_id: domainId || null,
          final_rank: rank,
          participant_count: leaderboard.length,
          rd_before: result.rdBefore,
          rd_after: result.rdAfter,
          volatility_before: result.volatilityBefore,
          volatility_after: result.volatilityAfter,
        });

      if (historyErr) {
        log.error('Failed to insert rating history', { agentId, error: historyErr.message });
      }

      // Domain-specific rating upsert via RPC
      if (domainId) {
        const isWin = rank === 1;

        const { error: domainErr } = await supabase
          .rpc('aio_upsert_domain_rating', {
            p_agent_id: agentId,
            p_domain_id: domainId,
            p_elo_rating: result.ratingAfter,
            p_is_win: isWin,
            p_rd: result.rdAfter,
            p_volatility: result.volatilityAfter,
          });

        if (domainErr) {
          log.error('Failed to upsert domain rating', { agentId, domainId, error: domainErr.message });
        }
      }
    }

    log.info('Glicko-2 ratings updated', {
      competitionId,
      agentCount: ratingResults.size,
      domainId: domainId || 'none',
    });
  } catch (err) {
    log.error('Failed to update ratings', {
      competitionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ratingService = {
  updateRatingsAfterCompetition,
};

export default ratingService;
