/**
 * ELO Rating Service
 *
 * Multi-player ELO calculation for AI Olympics competitions.
 * Uses K=40 for provisional players (< 10 games), K=32 for established.
 */

import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';
import type { LeaderboardEntry } from '../shared/types/index.js';

const log = createLogger('EloService');

const K_PROVISIONAL = 40; // < 10 competitions
const K_ESTABLISHED = 32; // >= 10 competitions
const PROVISIONAL_THRESHOLD = 10;

interface AgentRating {
  id: string;
  elo_rating: number;
  total_competitions: number;
}

/**
 * Calculate the expected score for player A against player B.
 */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Get the K-factor for a player based on their competition count.
 */
function getKFactor(totalCompetitions: number): number {
  return totalCompetitions < PROVISIONAL_THRESHOLD ? K_PROVISIONAL : K_ESTABLISHED;
}

/**
 * Calculate multi-player ELO updates.
 *
 * In a multi-player competition, each player is compared against every other
 * player pairwise. The actual score is derived from final rankings:
 * - rank 1 gets score 1.0 against every opponent
 * - rank N (last) gets score 0.0 against every opponent
 * - intermediate ranks are linearly interpolated
 */
function calculateMultiPlayerElo(
  agents: AgentRating[],
  rankings: Map<string, number>, // agentId -> final rank (1-based)
  participantCount: number
): Map<string, { ratingBefore: number; ratingAfter: number; change: number }> {
  const results = new Map<string, { ratingBefore: number; ratingAfter: number; change: number }>();

  for (const agent of agents) {
    const rank = rankings.get(agent.id);
    if (rank === undefined) continue;

    const K = getKFactor(agent.total_competitions);
    let ratingDelta = 0;

    // Compare against every other player
    for (const opponent of agents) {
      if (opponent.id === agent.id) continue;

      const opponentRank = rankings.get(opponent.id);
      if (opponentRank === undefined) continue;

      const expected = expectedScore(agent.elo_rating, opponent.elo_rating);

      // Actual score: 1 if beat opponent, 0.5 if tied, 0 if lost
      let actual: number;
      if (rank < opponentRank) {
        actual = 1.0;
      } else if (rank === opponentRank) {
        actual = 0.5;
      } else {
        actual = 0.0;
      }

      ratingDelta += K * (actual - expected);
    }

    // Normalize by number of opponents to keep changes reasonable
    const opponents = agents.length - 1;
    if (opponents > 0) {
      ratingDelta = Math.round(ratingDelta / opponents);
    }

    const ratingAfter = Math.max(100, agent.elo_rating + ratingDelta); // floor at 100

    results.set(agent.id, {
      ratingBefore: agent.elo_rating,
      ratingAfter,
      change: ratingAfter - agent.elo_rating,
    });
  }

  return results;
}

/**
 * Update ELO ratings after a competition completes.
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

    // 1. Fetch current ratings for all participating agents
    const { data: agentsData, error: agentsErr } = await supabase
      .from('aio_agents')
      .select('id, elo_rating, total_competitions')
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

    // 2. Calculate new ELO ratings
    const eloResults = calculateMultiPlayerElo(agentsData, rankings, leaderboard.length);

    // 3. Persist results
    for (const [agentId, result] of eloResults) {
      const rank = rankings.get(agentId);
      if (rank === undefined) continue;

      // M3: Atomic ELO update via RPC
      const { error: updateErr } = await supabase
        .rpc('aio_update_agent_elo', {
          p_agent_id: agentId,
          p_new_rating: result.ratingAfter,
        });

      if (updateErr) {
        log.error('Failed to update agent ELO', { agentId, error: updateErr.message });
      }

      // Insert into aio_elo_history
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
        });

      if (historyErr) {
        log.error('Failed to insert ELO history', { agentId, error: historyErr.message });
      }

      // M3: Atomic domain rating upsert via RPC
      if (domainId) {
        const isWin = rank === 1;

        const { error: domainErr } = await supabase
          .rpc('aio_upsert_domain_rating', {
            p_agent_id: agentId,
            p_domain_id: domainId,
            p_elo_rating: result.ratingAfter,
            p_is_win: isWin,
          });

        if (domainErr) {
          log.error('Failed to upsert domain rating', { agentId, domainId, error: domainErr.message });
        }
      }
    }

    log.info('ELO ratings updated', {
      competitionId,
      agentCount: eloResults.size,
      domainId: domainId || 'none',
    });
  } catch (err) {
    log.error('Failed to update ELO ratings', {
      competitionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const eloService = {
  updateRatingsAfterCompetition,
};

export default eloService;
