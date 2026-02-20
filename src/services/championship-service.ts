/**
 * Championship Service
 *
 * Manages the full lifecycle of multi-round championships:
 * create, join, startNextRound, processRoundResults, getStandings, elimination.
 *
 * Each championship round creates a real aio_competition record so existing
 * ELO updates, stats tracking, and live streaming all work automatically.
 */

import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';
import { competitionManager } from '../orchestrator/competition-manager.js';

const log = createLogger('ChampionshipService');

// F1-style default points config (keyed by rank string)
const DEFAULT_POINTS: Record<string, number> = {
  '1st': 25, '2nd': 18, '3rd': 15, '4th': 12,
  '5th': 10, '6th': 8, '7th': 6, '8th': 4,
};

function pointsForRank(rank: number, config: Record<string, number>): number {
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
  const key = ordinals[rank - 1];
  return key ? (config[key] ?? 0) : 0;
}

interface CreateChampionshipData {
  name: string;
  domain_id?: string | null;
  total_rounds?: number;
  format?: 'points' | 'elimination' | 'hybrid';
  points_config?: Record<string, number>;
  elimination_after_round?: number | null;
  max_participants?: number;
  entry_requirements?: Record<string, unknown>;
  created_by: string;
  registration_deadline?: string | null;
  task_ids?: string[] | null;
}

class ChampionshipService {
  /**
   * Create a new championship.
   */
  async createChampionship(data: CreateChampionshipData) {
    const { data: championship, error } = await supabase
      .from('aio_championships')
      .insert({
        name: data.name,
        domain_id: data.domain_id || null,
        total_rounds: data.total_rounds || 3,
        format: data.format || 'points',
        points_config: data.points_config || DEFAULT_POINTS,
        elimination_after_round: data.elimination_after_round || null,
        max_participants: data.max_participants || 32,
        entry_requirements: data.entry_requirements || {},
        created_by: data.created_by,
        registration_deadline: data.registration_deadline || null,
        round_schedule: data.task_ids
          ? Array.from({ length: data.total_rounds || 3 }, () => ({ task_ids: data.task_ids }))
          : [],
      })
      .select()
      .single();

    if (error) throw error;
    log.info('Championship created', { championshipId: championship.id });
    return championship;
  }

  /**
   * Join a championship with an agent.
   * Checks ELO entry requirements if set.
   */
  async joinChampionship(championshipId: string, agentId: string, userId: string) {
    // Fetch championship
    const { data: championship, error: champErr } = await supabase
      .from('aio_championships')
      .select('*, participant_count:aio_championship_participants(count)')
      .eq('id', championshipId)
      .single();

    if (champErr || !championship) {
      throw new Error('Championship not found');
    }

    if (championship.status !== 'registration') {
      throw new Error('Championship is not accepting registrations');
    }

    const currentCount = Array.isArray(championship.participant_count)
      ? championship.participant_count[0]?.count || 0
      : 0;

    if (currentCount >= championship.max_participants) {
      throw new Error('Championship is full');
    }

    // Verify agent ownership
    const { data: agent } = await supabase
      .from('aio_agents')
      .select('id, owner_id, is_active, elo_rating, verification_status, last_verified_at')
      .eq('id', agentId)
      .single();

    if (!agent || agent.owner_id !== userId) {
      throw new Error('Not authorized to use this agent');
    }

    if (!agent.is_active) {
      throw new Error('Agent is not active');
    }

    // H2: Verification gate - same as competitions
    if (
      agent.verification_status !== 'verified' ||
      !agent.last_verified_at ||
      Date.now() - new Date(agent.last_verified_at).getTime() > 24 * 60 * 60 * 1000
    ) {
      throw new Error('Agent must pass verification before joining championships');
    }

    // Check ELO entry requirements
    const requirements = (championship.entry_requirements || {}) as Record<string, number>;
    if (requirements.min_elo && (agent.elo_rating || 1200) < requirements.min_elo) {
      throw new Error(`Agent ELO (${agent.elo_rating || 1200}) is below minimum requirement (${requirements.min_elo})`);
    }
    if (requirements.max_elo && (agent.elo_rating || 1200) > requirements.max_elo) {
      throw new Error(`Agent ELO (${agent.elo_rating || 1200}) exceeds maximum requirement (${requirements.max_elo})`);
    }

    // H3: Use atomic join function to prevent race condition on participant count
    const { data: joinId, error: joinErr } = await supabase
      .rpc('aio_join_championship', {
        p_championship_id: championshipId,
        p_agent_id: agentId,
        p_user_id: userId,
      });

    if (joinErr) {
      if (joinErr.code === '23505') {
        throw new Error('Already joined with this agent');
      }
      if (joinErr.message?.includes('full')) {
        throw new Error('Championship is full');
      }
      throw joinErr;
    }

    // Fetch the created participant row
    const { data: participant } = await supabase
      .from('aio_championship_participants')
      .select('*')
      .eq('id', joinId)
      .single();

    log.info('Participant joined championship', { championshipId, agentId, userId });
    return participant;
  }

  /**
   * Start the next round of a championship.
   * Creates a real aio_competition, links it to the round, then fires it off.
   */
  async startNextRound(championshipId: string): Promise<{ roundNumber: number; competitionId: string }> {
    log.info('Starting next championship round', { championshipId });

    // 1. Fetch championship
    const { data: championship, error: cErr } = await supabase
      .from('aio_championships')
      .select('*, domain:aio_domains(id, slug)')
      .eq('id', championshipId)
      .single();

    if (cErr || !championship) {
      throw new Error(`Championship not found: ${championshipId}`);
    }

    if (championship.status !== 'active' && championship.status !== 'between_rounds' && championship.status !== 'registration') {
      throw new Error(`Championship is not in a startable state: ${championship.status}`);
    }

    const nextRound = championship.current_round + 1;
    if (nextRound > championship.total_rounds) {
      throw new Error('All rounds have been completed');
    }

    // 2. Fetch non-eliminated participants
    const { data: participants, error: pErr } = await supabase
      .from('aio_championship_participants')
      .select('*, agent:aio_agents(id, name)')
      .eq('championship_id', championshipId)
      .eq('is_eliminated', false);

    if (pErr || !participants || participants.length < 2) {
      throw new Error('Not enough non-eliminated participants');
    }

    // 3. Resolve task_ids for this round
    const roundSchedule = Array.isArray(championship.round_schedule) ? championship.round_schedule : [];
    const roundConfig = roundSchedule[nextRound - 1] as { task_ids?: string[] } | undefined;
    const taskIds = roundConfig?.task_ids ?? null;

    // 4. Create a real aio_competition for this round
    const { data: competition, error: compErr } = await supabase
      .from('aio_competitions')
      .insert({
        name: `${championship.name} - Round ${nextRound}`,
        domain_id: championship.domain_id,
        stake_mode: 'sandbox',
        status: 'lobby',
        entry_fee: 0,
        max_participants: participants.length,
        created_by: championship.created_by,
        task_ids: taskIds,
      })
      .select()
      .single();

    if (compErr || !competition) {
      throw new Error(`Failed to create round competition: ${compErr?.message}`);
    }

    // 5. Add all non-eliminated participants to the competition
    const participantInserts = participants.map(p => ({
      competition_id: competition.id,
      agent_id: p.agent_id,
      user_id: p.user_id,
    }));

    const { error: insertErr } = await supabase
      .from('aio_competition_participants')
      .insert(participantInserts);

    if (insertErr) {
      log.error('Failed to insert competition participants', { error: insertErr.message });
    }

    // 6. Create/update the championship round record
    const { error: roundErr } = await supabase
      .from('aio_championship_rounds')
      .upsert({
        championship_id: championshipId,
        round_number: nextRound,
        competition_id: competition.id,
        task_ids: taskIds,
        status: 'running',
        scheduled_at: new Date().toISOString(),
      }, { onConflict: 'championship_id,round_number' });

    if (roundErr) {
      log.error('Failed to upsert championship round', { error: roundErr.message });
    }

    // 7. Update championship status
    await supabase
      .from('aio_championships')
      .update({
        status: 'active',
        current_round: nextRound,
        started_at: championship.started_at || new Date().toISOString(),
      })
      .eq('id', championshipId);

    // 8. Start the competition (update to running, fire-and-forget orchestrator)
    await supabase
      .from('aio_competitions')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', competition.id);

    const competitionId = competition.id;
    competitionManager.startCompetition(competitionId, { taskIds }).catch(async (err) => {
      log.error('Championship round competition failed', {
        championshipId,
        roundNumber: nextRound,
        competitionId,
        error: err instanceof Error ? err.message : String(err),
      });

      // Mark round as failed, revert championship to between_rounds
      await supabase
        .from('aio_championship_rounds')
        .update({ status: 'failed' })
        .eq('championship_id', championshipId)
        .eq('round_number', nextRound);

      await supabase
        .from('aio_championships')
        .update({ status: 'between_rounds' })
        .eq('id', championshipId);
    });

    log.info('Championship round started', { championshipId, roundNumber: nextRound, competitionId });
    return { roundNumber: nextRound, competitionId };
  }

  /**
   * Process results for a completed championship round.
   * Awards points, updates standings, handles elimination.
   */
  async processRoundResults(championshipId: string, roundNumber: number): Promise<void> {
    log.info('Processing championship round results', { championshipId, roundNumber });

    // 1. Fetch championship + round
    const { data: championship } = await supabase
      .from('aio_championships')
      .select('*')
      .eq('id', championshipId)
      .single();

    if (!championship) throw new Error('Championship not found');

    const { data: round } = await supabase
      .from('aio_championship_rounds')
      .select('*')
      .eq('championship_id', championshipId)
      .eq('round_number', roundNumber)
      .single();

    if (!round || !round.competition_id) {
      throw new Error(`Round ${roundNumber} not found or has no competition`);
    }

    // 2. Fetch competition results (final_rank, final_score)
    const { data: compParticipants } = await supabase
      .from('aio_competition_participants')
      .select('agent_id, final_rank, final_score')
      .eq('competition_id', round.competition_id)
      .order('final_rank', { ascending: true });

    if (!compParticipants || compParticipants.length === 0) {
      log.warn('No competition results found for round', { roundNumber });
      return;
    }

    // 3. Fetch championship participants
    const { data: champParticipants } = await supabase
      .from('aio_championship_participants')
      .select('*')
      .eq('championship_id', championshipId);

    if (!champParticipants) return;

    const pointsConfig = (championship.points_config as Record<string, number>) || DEFAULT_POINTS;
    const champParticipantMap = new Map(champParticipants.map(p => [p.agent_id, p]));

    // 4. Award points and record round results (batched to avoid N+1)
    const roundId = round.id;
    const roundResults: { round_id: string; participant_id: string; round_rank: number; points_awarded: number }[] = [];
    const pointsIncrements: { participantId: string; points: number }[] = [];

    for (const cp of compParticipants) {
      const champP = champParticipantMap.get(cp.agent_id);
      if (!champP) continue;

      const rank = cp.final_rank || compParticipants.length;
      const pointsAwarded = pointsForRank(rank, pointsConfig);

      roundResults.push({
        round_id: roundId,
        participant_id: champP.id,
        round_rank: rank,
        points_awarded: pointsAwarded,
      });

      pointsIncrements.push({ participantId: champP.id, points: pointsAwarded });
    }

    // Batch upsert all round results in one query
    if (roundResults.length > 0) {
      await supabase
        .from('aio_championship_round_results')
        .upsert(roundResults, { onConflict: 'round_id,participant_id' });
    }

    // Parallelize all points increments
    await Promise.all(
      pointsIncrements.map(({ participantId, points }) =>
        supabase.rpc('aio_increment_championship_points', {
          p_participant_id: participantId,
          p_points: points,
          p_increment_rounds: true,
        })
      )
    );

    // 5. Update rankings
    await this.updateStandings(championshipId);

    // 6. Handle elimination if configured
    if (
      championship.format === 'elimination' || championship.format === 'hybrid'
    ) {
      const eliminationRound = championship.elimination_after_round;
      if (eliminationRound && roundNumber >= eliminationRound) {
        await this.eliminateBottomParticipants(championshipId);
      }
    }

    // 7. Mark round as completed
    await supabase
      .from('aio_championship_rounds')
      .update({ status: 'completed' })
      .eq('id', roundId);

    // 8. Check if championship is complete
    if (roundNumber >= championship.total_rounds) {
      await supabase
        .from('aio_championships')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', championshipId);

      log.info('Championship completed', { championshipId });
    } else {
      await supabase
        .from('aio_championships')
        .update({ status: 'between_rounds' })
        .eq('id', championshipId);
    }

    log.info('Round results processed', { championshipId, roundNumber });
  }

  /**
   * Update current_rank for all participants based on total_points.
   */
  private async updateStandings(championshipId: string): Promise<void> {
    const { error } = await supabase.rpc('batch_update_championship_ranks', {
      p_championship_id: championshipId,
    });

    if (error) {
      log.error('Failed to batch update standings', { championshipId, error: error.message });
    }
  }

  /**
   * Eliminate the bottom half of remaining participants.
   */
  private async eliminateBottomParticipants(championshipId: string): Promise<void> {
    const { data: eliminatedCount, error } = await supabase.rpc('batch_eliminate_championship_bottom', {
      p_championship_id: championshipId,
    });

    if (error) {
      log.error('Failed to batch eliminate participants', { championshipId, error: error.message });
      return;
    }

    if (eliminatedCount > 0) {
      log.info('Eliminated participants', { championshipId, eliminatedCount });
    }
  }

  /**
   * Get full standings for a championship.
   */
  async getStandings(championshipId: string) {
    const { data } = await supabase
      .from('aio_championship_participants')
      .select(`
        *,
        agent:aio_agents(id, name, slug, color, elo_rating),
        user:aio_profiles(username)
      `)
      .eq('championship_id', championshipId)
      .order('total_points', { ascending: false });

    return data || [];
  }

  /**
   * Check if an agent meets entry requirements for a championship.
   */
  async checkEntryRequirements(
    agentId: string,
    requirements: Record<string, unknown>
  ): Promise<{ eligible: boolean; reason?: string }> {
    if (!requirements || Object.keys(requirements).length === 0) {
      return { eligible: true };
    }

    const minElo = requirements.min_elo as number | undefined;
    if (minElo) {
      const { data: agent } = await supabase
        .from('aio_agents')
        .select('elo_rating')
        .eq('id', agentId)
        .single();

      if (!agent || (agent.elo_rating || 1500) < minElo) {
        return {
          eligible: false,
          reason: `Agent ELO rating (${agent?.elo_rating || 1500}) is below the minimum requirement (${minElo})`,
        };
      }
    }

    return { eligible: true };
  }
}

export const championshipService = new ChampionshipService();
export default championshipService;
