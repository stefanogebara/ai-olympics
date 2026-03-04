/**
 * Gauntlet Drop-In Execution Service
 *
 * Orchestrates a full gauntlet run for a single agent:
 *  1. Maps external provider names (anthropic, openai, google, …) to AgentProvider values
 *  2. Builds an AgentConfig and creates an AgentRunner with headless mode + 30-turn cap
 *  3. Initializes the runner (launches browser)
 *  4. Loops over the week's 5 tasks, calling startTask / runTask / completeTask / recordFrame
 *  5. Finalizes the run with 'completed' or 'failed' status
 *  6. Always calls cleanup() in the finally block
 */

import { createLogger } from '../shared/utils/logger.js';
import type { AgentConfig, AgentProvider } from '../shared/types/index.js';
import type { TaskDefinition } from '../shared/types/index.js';
import { AgentRunner } from '../agents/runner.js';
import type { GauntletRunner } from './gauntlet-runner.js';
import type { GauntletTask } from './gauntlet-tasks.js';
import { pickWeeklyTasks } from './gauntlet-tasks.js';

const log = createLogger('GauntletExecution');

// ---------------------------------------------------------------------------
// Provider name mapping
// ---------------------------------------------------------------------------

/**
 * Maps provider names coming from external sources (user input, API params)
 * to the canonical AgentProvider values used internally.
 *
 * anthropic  → claude
 * google     → gemini
 * openai     → openai  (pass-through)
 * meta       → llama
 * mistral    → mistral (pass-through)
 */
const PROVIDER_MAP: Record<string, AgentProvider> = {
  anthropic: 'claude',
  claude: 'claude',
  google: 'gemini',
  gemini: 'gemini',
  openai: 'openai',
  meta: 'llama',
  llama: 'llama',
  mistral: 'mistral',
};

function mapProvider(raw: string): AgentProvider {
  const mapped = PROVIDER_MAP[raw.toLowerCase()];
  if (!mapped) {
    log.warn(`Unknown provider '${raw}', defaulting to 'claude'`);
    return 'claude';
  }
  return mapped;
}

// ---------------------------------------------------------------------------
// GauntletTask → TaskDefinition adapter
// ---------------------------------------------------------------------------

/**
 * Converts a GauntletTask (gauntlet-specific shape) to a TaskDefinition
 * so it can be consumed by AgentRunner.runTask().
 */
function adaptTask(task: GauntletTask): TaskDefinition {
  return {
    id: task.id,
    name: task.title,
    description: task.prompt,
    category: 'intelligence',
    difficulty: 'medium',
    timeLimit: Math.ceil(task.timeLimitMs / 1000),
    maxAgents: 1,
    config: task.verifierConfig,
    scoringMethod: 'judged',
    maxScore: 200,
    systemPrompt:
      'You are a highly capable AI agent competing in the AI Olympics Gauntlet. ' +
      'Your goal is to complete each task accurately and efficiently. ' +
      'Use the available browser tools to research, navigate, and retrieve information. ' +
      'When you have your final answer, call the done tool with your result.',
    taskPrompt: task.prompt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GauntletDropInOptions {
  /** Pre-created GauntletRunner instance (already persisted to DB) */
  runner: GauntletRunner;
  /** ID of the run row in aio_gauntlet_runs */
  runId: string;
  /** ISO week number (1-53) */
  weekNumber: number;
  /** Calendar year */
  year: number;
  /** Raw provider name from user input — will be mapped to AgentProvider */
  provider: string;
  /** Model identifier (e.g. 'claude-opus-4-6') */
  model: string;
  /** API key for the provider */
  apiKey: string;
  /** Optional GitHub token passed through to completeTask verifier context */
  githubToken?: string;
}

/**
 * Execute a full gauntlet drop-in run.
 *
 * This function is intentionally fire-and-forget safe: it never throws.
 * All errors are caught, the run is finalized as 'failed', and cleanup runs.
 */
export async function executeGauntletDropIn(opts: GauntletDropInOptions): Promise<void> {
  const { runner, runId, weekNumber, year, provider, model, apiKey, githubToken } = opts;

  const agentProvider = mapProvider(provider);

  const agentConfig: AgentConfig = {
    id: runId,
    name: `${provider}-${model}`,
    provider: agentProvider,
    model,
    color: '#00ffff',
    apiKey,
  };

  const agentRunner = new AgentRunner(agentConfig, { maxTurns: 30, headless: true, recordActions: false });

  const RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  const tasks = pickWeeklyTasks(weekNumber, year);

  const runWithTimeout = async (): Promise<void> => {
    log.info('Initializing agent browser', { runId, provider, model });
    await agentRunner.initialize(runId, 'gauntlet');
    log.info('Agent browser ready', { runId });

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i] as GauntletTask;
      log.info(`Starting task ${i + 1}/${tasks.length}`, { runId, taskId: task.id, title: task.title });
      runner.startTask(i);

      const taskDef: TaskDefinition = adaptTask(task);

      const taskRunResult = await agentRunner.runTask(taskDef);
      log.info(`Task ${i + 1} complete`, { runId, taskId: task.id, success: taskRunResult.success, error: taskRunResult.error });

      // Record any actions produced by the agent as frames
      for (const action of taskRunResult.actions ?? []) {
        runner.recordFrame({
          action: action.type,
          payload: action.target ?? undefined,
          task_index: i,
          reasoning: undefined,
        });
      }

      // Extract the string answer from the result
      let agentAnswer =
        typeof taskRunResult.result === 'string'
          ? taskRunResult.result
          : taskRunResult.result != null
            ? JSON.stringify(taskRunResult.result)
            : taskRunResult.error ?? '';
      if (!agentAnswer) {
        log.warn('Agent produced no answer for task', { taskId: task.id });
      }

      await runner.completeTask(i, task, agentAnswer, { githubToken });
    }
  };

  try {
    await Promise.race([
      runWithTimeout(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Gauntlet run wall-clock timeout (10min)')),
          RUN_TIMEOUT_MS,
        ),
      ),
    ]);
    await runner.finalize('completed');
    log.info('Gauntlet run completed', { runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Drop-in execution failed', { runId: runner.runId, error: message });
    await runner.finalize('failed');
  } finally {
    await agentRunner.cleanup();
  }
}
