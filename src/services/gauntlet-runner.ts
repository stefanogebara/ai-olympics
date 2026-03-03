/**
 * GauntletRunner — manages the lifecycle of a single gauntlet run.
 *
 * Responsibilities:
 *  - Persists run state to `aio_gauntlet_runs` via the service client
 *  - Records frames (agent actions) in-memory and flushes to DB every 10 frames
 *  - Tracks per-task timing, invokes the verifier, and computes scores
 *  - Finalizes the run with total_score and completed_at
 */

import { serviceClient } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';
import type { GauntletTask } from './gauntlet-tasks.js';
import { computeTaskScore } from './gauntlet-tasks.js';
import { runVerifier } from './gauntlet-verifier.js';

const log = createLogger('GauntletRunner');

export interface Frame {
  timestamp_ms: number;
  screenshot_b64?: string;
  a11y_tree?: string;
  reasoning?: string;
  /** 'navigate' | 'click' | 'type' | 'extract' | 'complete' | 'error' | 'task_start' | 'task_complete' */
  action: string;
  /** URL for navigate, selector for click, text for type, task index as string for task_start, etc. */
  payload?: string;
  /** Which task (0-4) this frame belongs to */
  task_index: number;
}

export interface TaskResult {
  taskId: string;
  taskIndex: number;
  agentAnswer: string;
  score: number;           // 0–200 pts
  qualityPct: number;      // 0.0–1.0
  elapsedMs: number;
  verifierReasoning: string;
  completedAt: string;     // ISO timestamp
}

const FRAME_FLUSH_INTERVAL = 10;

export class GauntletRunner {
  readonly runId: string;
  private frames: Frame[] = [];
  private taskResults: TaskResult[] = [];
  private taskStartTimes: Map<number, number> = new Map();
  private startTime: number;
  private supabase: typeof serviceClient;

  constructor(runId: string) {
    this.runId = runId;
    this.startTime = Date.now();
    this.supabase = serviceClient;
  }

  /**
   * Mark the run as 'running' in the database.
   * Call this once before beginning task execution.
   */
  async initialize(): Promise<void> {
    const { error } = await this.supabase
      .from('aio_gauntlet_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', this.runId);

    if (error) {
      log.error('Failed to initialize gauntlet run', { runId: this.runId, error: error.message });
    } else {
      log.info('Gauntlet run initialized', { runId: this.runId });
    }
  }

  /**
   * Record an agent action frame.
   * Automatically flushes to DB every FRAME_FLUSH_INTERVAL frames.
   */
  recordFrame(frame: Omit<Frame, 'timestamp_ms'>): void {
    const newFrame: Frame = { ...frame, timestamp_ms: Date.now() };
    this.frames = [...this.frames, newFrame];

    if (this.frames.length % FRAME_FLUSH_INTERVAL === 0) {
      void this.flushFrames();
    }
  }

  /**
   * Record the start time for a task so elapsed time can be computed later.
   * Also records a task_start frame.
   */
  startTask(taskIndex: number): void {
    this.taskStartTimes = new Map(this.taskStartTimes).set(taskIndex, Date.now());
    this.recordFrame({
      action: 'task_start',
      payload: String(taskIndex),
      task_index: taskIndex,
    });
  }

  /**
   * Verify the agent's answer, compute score, persist task result, and return it.
   */
  async completeTask(
    taskIndex: number,
    task: GauntletTask,
    agentAnswer: string,
    context?: { githubToken?: string }
  ): Promise<TaskResult> {
    const elapsedMs = Date.now() - (this.taskStartTimes.get(taskIndex) ?? this.startTime);

    const verifierResult = await runVerifier(task, agentAnswer, {
      runId: this.runId,
      githubToken: context?.githubToken,
    });

    const qualityPct = verifierResult.score;
    const score = computeTaskScore(qualityPct, elapsedMs, task.timeLimitMs);

    const taskResult: TaskResult = {
      taskId: task.id,
      taskIndex,
      agentAnswer,
      score,
      qualityPct,
      elapsedMs,
      verifierReasoning: verifierResult.reasoning,
      completedAt: new Date().toISOString(),
    };

    this.taskResults = [...this.taskResults, taskResult];

    this.recordFrame({
      action: 'task_complete',
      payload: JSON.stringify({ score, qualityPct }),
      task_index: taskIndex,
    });

    const { error } = await this.supabase
      .from('aio_gauntlet_runs')
      .update({ tasks: JSON.stringify(this.taskResults) })
      .eq('id', this.runId);

    if (error) {
      log.error('Failed to persist task result', {
        runId: this.runId,
        taskIndex,
        error: error.message,
      });
    } else {
      log.info('Task completed', {
        runId: this.runId,
        taskId: task.id,
        score,
        qualityPct,
        elapsedMs,
      });
    }

    return taskResult;
  }

  /**
   * Finalize the run: compute total score and persist the final state.
   */
  async finalize(status: 'completed' | 'failed' | 'timeout'): Promise<{ totalScore: number }> {
    const totalScore = this.taskResults.reduce((sum, r) => sum + r.score, 0);

    const { error } = await this.supabase
      .from('aio_gauntlet_runs')
      .update({
        status,
        total_score: totalScore,
        completed_at: new Date().toISOString(),
        frames: JSON.stringify(this.frames),
        tasks: JSON.stringify(this.taskResults),
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.runId);

    if (error) {
      log.error('Failed to finalize gauntlet run', { runId: this.runId, error: error.message });
    } else {
      log.info('Gauntlet run finalized', { runId: this.runId, status, totalScore });
    }

    return { totalScore };
  }

  /** Return all recorded frames. */
  getFrames(): Frame[] {
    return this.frames;
  }

  /** Return all completed task results. */
  getTaskResults(): TaskResult[] {
    return this.taskResults;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async flushFrames(): Promise<void> {
    const { error } = await this.supabase
      .from('aio_gauntlet_runs')
      .update({ frames: JSON.stringify(this.frames) })
      .eq('id', this.runId);

    if (error) {
      log.warn('Failed to flush frames', { runId: this.runId, error: error.message });
    }
  }
}
