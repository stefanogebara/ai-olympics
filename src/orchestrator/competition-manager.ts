/**
 * CompetitionManager — singleton bridging API routes to CompetitionController.
 *
 * Responsibilities:
 *  1. Fetch competition + participants from DB
 *  2. Map DB agents → AgentConfig (decrypt API keys, resolve webhook configs)
 *  3. Resolve tasks from task_ids or domain defaults
 *  4. Create CompetitionController, run competition
 *  5. Persist results to DB on completion
 *  6. Revert status to 'lobby' on failure
 */

import { CompetitionController } from './competition-controller.js';
import { getTask } from './task-registry.js';
import { decrypt } from '../shared/utils/crypto.js';
import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';
import { eloService } from '../services/elo-service.js';
import type { AgentConfig, AgentProvider, TaskDefinition } from '../shared/types/index.js';
import type { ExtendedAgentConfig } from '../agents/adapters/index.js';

const log = createLogger('CompetitionManager');

// Domain slug → default task IDs
const DOMAIN_TASK_DEFAULTS: Record<string, string[]> = {
  'browser-tasks': ['form-blitz', 'shopping-cart', 'navigation-maze', 'data-extraction', 'captcha-gauntlet'],
  'prediction-markets': ['prediction-market'],
  'games': ['trivia', 'math', 'word', 'logic', 'chess'],
  'trading': ['prediction-market'],
  'creative': ['design-challenge', 'writing-challenge', 'pitch-deck'],
  'coding': ['code-debug', 'code-golf', 'api-integration'],
};

const FALLBACK_TASKS = ['form-blitz'];

class CompetitionManager {
  private activeCompetitions = new Map<string, CompetitionController>();

  /**
   * Start a competition: fetch data from DB, build configs, run controller,
   * persist results on completion.
   */
  async startCompetition(
    competitionId: string,
    opts?: { taskIds?: string[] | null }
  ): Promise<void> {
    log.info('Starting competition', { competitionId });

    // ---------------------------------------------------------------
    // 1. Fetch competition + domain
    // ---------------------------------------------------------------
    const { data: competition, error: compErr } = await supabase
      .from('aio_competitions')
      .select('*, domain:aio_domains(slug)')
      .eq('id', competitionId)
      .single();

    if (compErr || !competition) {
      throw new Error(`Competition not found: ${competitionId}`);
    }

    // ---------------------------------------------------------------
    // 2. Fetch participants → agents
    // ---------------------------------------------------------------
    const { data: participants, error: partErr } = await supabase
      .from('aio_competition_participants')
      .select('*, agent:aio_agents(*)')
      .eq('competition_id', competitionId);

    if (partErr || !participants || participants.length < 2) {
      throw new Error(`Not enough participants for competition ${competitionId}`);
    }

    // ---------------------------------------------------------------
    // 3. Map DB agents → AgentConfig / ExtendedAgentConfig
    // ---------------------------------------------------------------
    const agentConfigs: ExtendedAgentConfig[] = [];

    for (const p of participants) {
      const dbAgent = p.agent;
      if (!dbAgent) {
        log.warn('Participant has no agent record, skipping', { participantId: p.id });
        continue;
      }

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

    // ---------------------------------------------------------------
    // 4. Resolve tasks
    // ---------------------------------------------------------------
    const taskIds = this.resolveTaskIds(
      opts?.taskIds ?? competition.task_ids,
      competition.domain?.slug
    );

    const tasks: TaskDefinition[] = [];
    for (const tid of taskIds) {
      const task = getTask(tid);
      if (task) {
        tasks.push(task);
      } else {
        log.warn('Task not found in registry, skipping', { taskId: tid });
      }
    }

    if (tasks.length === 0) {
      throw new Error('No valid tasks resolved for competition');
    }

    // ---------------------------------------------------------------
    // 5. Create and run CompetitionController
    // ---------------------------------------------------------------
    const controller = new CompetitionController({ headless: true });

    controller.createCompetition({
      name: competition.name,
      description: competition.description || '',
      agents: agentConfigs,
      tasks,
    });

    this.activeCompetitions.set(competitionId, controller);

    try {
      await controller.startCompetition();

      // 6. Persist results
      await this.persistResults(competitionId, controller, participants, competition.domain_id);

      log.info('Competition completed successfully', { competitionId });
    } catch (err) {
      log.error('Competition failed during execution', {
        competitionId,
        error: err instanceof Error ? err.message : String(err),
      });

      // Revert status to lobby
      await supabase
        .from('aio_competitions')
        .update({ status: 'lobby', started_at: null })
        .eq('id', competitionId);

      throw err;
    } finally {
      // Always clean up
      await controller.cleanup().catch(() => {});
      this.activeCompetitions.delete(competitionId);
    }
  }

  /**
   * Persist results back to Supabase after a completed competition.
   *
   * - Sets final_rank + final_score on aio_competition_participants
   * - Updates aio_competitions status to 'completed' with ended_at
   * - The existing DB trigger `on_aio_participant_result` auto-increments
   *   aio_agents.total_competitions and total_wins
   */
  private async persistResults(
    competitionId: string,
    controller: CompetitionController,
    participants: Array<{ id: string; agent_id: string }>,
    domainId?: string | null
  ): Promise<void> {
    const leaderboard = controller.getLeaderboard();

    // Build a map from agentId → leaderboard entry
    const leaderboardMap = new Map(leaderboard.map(e => [e.agentId, e]));

    // Update each participant's final_rank and final_score
    for (const p of participants) {
      const entry = leaderboardMap.get(p.agent_id);
      if (!entry) continue;

      const { error } = await supabase
        .from('aio_competition_participants')
        .update({
          final_rank: entry.rank,
          final_score: entry.totalScore,
        })
        .eq('id', p.id);

      if (error) {
        log.error('Failed to update participant result', {
          participantId: p.id,
          error: error.message,
        });
      }
    }

    // Mark competition as completed
    const { error: compErr } = await supabase
      .from('aio_competitions')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      })
      .eq('id', competitionId);

    if (compErr) {
      log.error('Failed to update competition status to completed', {
        competitionId,
        error: compErr.message,
      });
    }

    // Persist replay action logs
    const competition = controller.getCompetition();
    if (competition) {
      const replayRows = competition.events.flatMap(event =>
        event.results.map(result => ({
          competition_id: competitionId,
          event_id: result.taskId,
          agent_id: result.agentId,
          action_log: result.actions ?? [],
        }))
      );

      if (replayRows.length > 0) {
        const { error: replayErr } = await supabase
          .from('aio_competition_replays')
          .insert(replayRows);

        if (replayErr) {
          log.error('Failed to persist replay data', {
            competitionId,
            error: replayErr.message,
          });
        }
      }
    }

    // Update ELO ratings based on final standings
    await eloService.updateRatingsAfterCompetition(
      competitionId,
      participants,
      leaderboard,
      domainId
    );
  }

  /**
   * Resolve which task IDs to use:
   *  1. Explicit task_ids from the competition row (or API override)
   *  2. Domain defaults
   *  3. Global fallback
   */
  private resolveTaskIds(
    explicitIds: string[] | null | undefined,
    domainSlug: string | null | undefined
  ): string[] {
    if (explicitIds && explicitIds.length > 0) {
      return explicitIds;
    }

    if (domainSlug && DOMAIN_TASK_DEFAULTS[domainSlug]) {
      return DOMAIN_TASK_DEFAULTS[domainSlug];
    }

    return FALLBACK_TASKS;
  }

  /**
   * Get the active CompetitionController for a running competition.
   * Returns null if the competition isn't currently active in memory.
   */
  getActiveCompetition(competitionId: string): CompetitionController | null {
    return this.activeCompetitions.get(competitionId) ?? null;
  }

  /**
   * Cancel a running competition. Cleans up the controller and reverts DB status.
   */
  async cancelCompetition(competitionId: string): Promise<boolean> {
    const controller = this.activeCompetitions.get(competitionId);
    if (!controller) {
      return false;
    }

    await controller.cancelCompetition();
    this.activeCompetitions.delete(competitionId);

    // Revert DB status
    await supabase
      .from('aio_competitions')
      .update({ status: 'cancelled', ended_at: new Date().toISOString() })
      .eq('id', competitionId);

    log.info('Competition cancelled', { competitionId });
    return true;
  }

  /**
   * Cancel all active competitions. Called during server shutdown.
   */
  async cancelAll(): Promise<void> {
    const ids = Array.from(this.activeCompetitions.keys());
    for (const id of ids) {
      await this.cancelCompetition(id).catch((err) => {
        log.error('Failed to cancel competition during shutdown', {
          competitionId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  /**
   * Number of currently running competitions.
   */
  get activeCount(): number {
    return this.activeCompetitions.size;
  }
}

export const competitionManager = new CompetitionManager();
export default competitionManager;
