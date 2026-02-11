/**
 * TournamentManager — singleton bridging API routes to TournamentController.
 *
 * Responsibilities:
 *  1. Fetch tournament + participants from DB
 *  2. Map DB agents → AgentConfig (decrypt API keys, resolve configs)
 *  3. Seed participants by ELO rating
 *  4. Create TournamentController, run tournament
 *  5. Persist results (matches, standings) to DB
 *  6. Revert status on failure
 */

import { TournamentController } from './tournament-controller.js';
import { getTask } from './task-registry.js';
import { decrypt } from '../shared/utils/crypto.js';
import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';
import { eloService } from '../services/elo-service.js';
import type { AgentConfig, AgentProvider, BracketType, TaskDefinition } from '../shared/types/index.js';
import type { ExtendedAgentConfig } from '../agents/adapters/index.js';

const log = createLogger('TournamentManager');

const FALLBACK_TASKS = ['form-blitz'];

class TournamentManager {
  private activeTournaments = new Map<string, TournamentController>();

  /**
   * Start a tournament: fetch data from DB, seed by ELO, run controller,
   * persist results on completion.
   */
  async startTournament(tournamentId: string): Promise<void> {
    log.info('Starting tournament', { tournamentId });

    // 1. Fetch tournament
    const { data: tournament, error: tErr } = await supabase
      .from('aio_tournaments')
      .select('*, domain:aio_domains(slug)')
      .eq('id', tournamentId)
      .single();

    if (tErr || !tournament) {
      throw new Error(`Tournament not found: ${tournamentId}`);
    }

    // 2. Fetch participants with agents
    const { data: participants, error: pErr } = await supabase
      .from('aio_tournament_participants')
      .select('*, agent:aio_agents(*)')
      .eq('tournament_id', tournamentId);

    if (pErr || !participants || participants.length < 2) {
      throw new Error(`Not enough participants for tournament ${tournamentId}`);
    }

    // 3. Map DB agents → AgentConfig, sorted by ELO (descending) for seeding
    const agentConfigs: ExtendedAgentConfig[] = [];

    for (const p of participants) {
      const dbAgent = p.agent;
      if (!dbAgent) continue;

      const base: ExtendedAgentConfig = {
        id: dbAgent.id,
        name: dbAgent.name,
        provider: (dbAgent.provider || 'claude') as AgentProvider,
        model: dbAgent.model || 'claude-sonnet-4-5-20250929',
        color: dbAgent.color || '#6B7280',
        agentType: dbAgent.agent_type || 'api_key',
        personaName: dbAgent.persona_name || undefined,
        personaDescription: dbAgent.persona_description || undefined,
        personaStyle: dbAgent.persona_style || undefined,
        strategy: dbAgent.strategy || undefined,
      };

      if (dbAgent.agent_type === 'webhook') {
        base.webhookUrl = dbAgent.webhook_url;
        base.webhookSecret = dbAgent.webhook_secret;
      } else if (dbAgent.api_key_encrypted) {
        try {
          base.apiKey = decrypt(dbAgent.api_key_encrypted);
        } catch (err) {
          log.error('Failed to decrypt API key for agent', {
            agentId: dbAgent.id,
            error: err instanceof Error ? err.message : String(err),
          });
          throw new Error(`Cannot decrypt API key for agent ${dbAgent.name}`);
        }
      }

      agentConfigs.push(base);
    }

    if (agentConfigs.length < 2) {
      throw new Error('Not enough valid agent configs after mapping');
    }

    // Sort by ELO rating descending for seeding
    const agentEloMap = new Map<string, number>();
    for (const p of participants) {
      if (p.agent) {
        agentEloMap.set(p.agent.id, p.agent.elo_rating || 1200);
      }
    }
    agentConfigs.sort((a, b) => (agentEloMap.get(b.id) || 1200) - (agentEloMap.get(a.id) || 1200));

    // 4. Resolve tasks
    const taskIds = tournament.task_ids && tournament.task_ids.length > 0
      ? tournament.task_ids
      : FALLBACK_TASKS;

    const tasks: TaskDefinition[] = [];
    for (const tid of taskIds) {
      const task = getTask(tid);
      if (task) tasks.push(task);
      else log.warn('Task not found in registry, skipping', { taskId: tid });
    }

    if (tasks.length === 0) {
      throw new Error('No valid tasks resolved for tournament');
    }

    // 5. Update seeds in DB
    const seeds = agentConfigs.map((agent, index) => ({
      agentId: agent.id,
      seedNumber: index + 1,
      eloRating: agentEloMap.get(agent.id) || 1200,
    }));

    await supabase
      .from('aio_tournaments')
      .update({
        status: 'seeding',
        seeds: JSON.stringify(seeds),
      })
      .eq('id', tournamentId);

    // Update seed numbers on participants
    for (const seed of seeds) {
      await supabase
        .from('aio_tournament_participants')
        .update({ seed_number: seed.seedNumber })
        .eq('tournament_id', tournamentId)
        .eq('agent_id', seed.agentId);
    }

    // 6. Create TournamentController and run
    const controller = new TournamentController();

    controller.createTournament({
      name: tournament.name,
      bracketType: tournament.bracket_type as BracketType,
      agents: agentConfigs,
      taskIds: taskIds,
      bestOf: tournament.best_of || 1,
    });

    this.activeTournaments.set(tournamentId, controller);

    // Update status to running
    await supabase
      .from('aio_tournaments')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        current_round: 0,
      })
      .eq('id', tournamentId);

    try {
      await controller.startTournament();

      // 7. Persist results
      await this.persistResults(tournamentId, controller, participants, tournament.domain_id);

      log.info('Tournament completed successfully', { tournamentId });
    } catch (err) {
      log.error('Tournament failed during execution', {
        tournamentId,
        error: err instanceof Error ? err.message : String(err),
      });

      await supabase
        .from('aio_tournaments')
        .update({ status: 'lobby', started_at: null })
        .eq('id', tournamentId);

      throw err;
    } finally {
      this.activeTournaments.delete(tournamentId);
    }
  }

  /**
   * Persist tournament results to the database.
   */
  private async persistResults(
    tournamentId: string,
    controller: TournamentController,
    participants: Array<{ id: string; agent_id: string }>,
    domainId?: string | null
  ): Promise<void> {
    const tournament = controller.getTournament();
    if (!tournament) return;

    // Persist match results
    for (const round of tournament.rounds) {
      for (const match of round.matches) {
        const agent1Id = match.agentIds[0] || null;
        const agent2Id = match.agentIds[1] || null;

        const result1 = match.results.find(r => r.agentId === agent1Id);
        const result2 = match.results.find(r => r.agentId === agent2Id);

        await supabase
          .from('aio_tournament_matches')
          .insert({
            tournament_id: tournamentId,
            round_number: round.roundNumber,
            match_number: match.matchNumber,
            agent_1_id: agent1Id,
            agent_2_id: agent2Id,
            competition_id: match.competitionId || null,
            winner_id: match.winnerId || null,
            agent_1_score: result1?.score ?? null,
            agent_2_score: result2?.score ?? null,
            is_bye: match.isBye,
            status: match.status === 'bye' ? 'bye' : 'completed',
          });
      }
    }

    // Update participant stats from standings
    const standings = controller.getStandings();
    for (const standing of standings) {
      const participant = participants.find(p => p.agent_id === standing.agentId);
      if (!participant) continue;

      await supabase
        .from('aio_tournament_participants')
        .update({
          final_placement: standing.rank,
          matches_won: standing.matchesWon,
          matches_lost: standing.matchesLost,
          total_score: standing.totalScore,
        })
        .eq('id', participant.id);
    }

    // Update tournament to completed
    const bracketData = {
      bracket: tournament.bracket,
      rounds: tournament.rounds.map(r => ({
        id: r.id,
        roundNumber: r.roundNumber,
        name: r.name,
        status: r.status,
        matchCount: r.matches.length,
      })),
      standings: standings,
    };

    await supabase
      .from('aio_tournaments')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        current_round: tournament.currentRoundIndex,
        total_rounds: tournament.rounds.length,
        bracket_data: JSON.stringify(bracketData),
      })
      .eq('id', tournamentId);
  }

  /**
   * Get the active TournamentController for a running tournament.
   */
  getActiveTournament(tournamentId: string): TournamentController | null {
    return this.activeTournaments.get(tournamentId) ?? null;
  }

  /**
   * Cancel a running tournament.
   */
  async cancelTournament(tournamentId: string): Promise<boolean> {
    const controller = this.activeTournaments.get(tournamentId);
    if (!controller) return false;

    await controller.cancelTournament();
    this.activeTournaments.delete(tournamentId);

    await supabase
      .from('aio_tournaments')
      .update({ status: 'cancelled', ended_at: new Date().toISOString() })
      .eq('id', tournamentId);

    log.info('Tournament cancelled', { tournamentId });
    return true;
  }

  /**
   * Cancel all active tournaments. Called during server shutdown.
   */
  async cancelAll(): Promise<void> {
    const ids = Array.from(this.activeTournaments.keys());
    for (const id of ids) {
      await this.cancelTournament(id).catch((err) => {
        log.error('Failed to cancel tournament during shutdown', {
          tournamentId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  get activeCount(): number {
    return this.activeTournaments.size;
  }
}

export const tournamentManager = new TournamentManager();
export default tournamentManager;
