import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { serviceClient } from '../../shared/utils/supabase.js';
import { GauntletRunner } from '../../services/gauntlet-runner.js';
import { issueRunToken, getRunToken, revokeRunToken } from '../../services/github-credential-service.js';
import { pickWeeklyTasks } from '../../services/gauntlet-tasks.js';
import { createLogger } from '../../shared/utils/logger.js';
import { executeGauntletDropIn } from '../../services/gauntlet-execution.js';
import { executeGauntletWebhook } from '../../services/gauntlet-webhook-executor.js';

const log = createLogger('GauntletRoutes');
const router = Router();

// In-memory map of active runners: runId → GauntletRunner
const activeRunners = new Map<string, GauntletRunner>();

// ---------------------------------------------------------------------------
// Helper: compute ISO week number and year for a given date
// ---------------------------------------------------------------------------
export function getISOWeek(date: Date): { weekNumber: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO weeks start on Monday; day 0 = Sunday
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return { weekNumber, year: d.getUTCFullYear() };
}

// ---------------------------------------------------------------------------
// GET /api/gauntlet/weeks/current
// Returns this week's tasks + prize pool metadata
// ---------------------------------------------------------------------------
router.get('/weeks/current', requireAuth, async (_req: Request, res: Response) => {
  try {
    const { weekNumber, year } = getISOWeek(new Date());
    const tasks = pickWeeklyTasks(weekNumber, year);

    const { data: weekData } = await serviceClient
      .from('aio_gauntlet_weeks')
      .select('prize_pool_cents, status')
      .eq('week_number', weekNumber)
      .eq('year', year)
      .maybeSingle();

    return res.json({
      weekNumber,
      year,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        timeLimitMs: t.timeLimitMs,
      })),
      prizePoolCents: weekData?.prize_pool_cents ?? 0,
      status: weekData?.status ?? 'open',
    });
  } catch (error) {
    log.error('Failed to get current week', { error });
    return res.status(500).json({ error: 'Failed to get current week' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gauntlet/runs
// Start a new gauntlet run
// ---------------------------------------------------------------------------
router.post('/runs', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { agent_id, track, api_key, provider, model, webhook_url, auth_header } = req.body as {
      agent_id?: string;
      track: string;
      api_key?: string;
      provider?: string;
      model?: string;
      webhook_url?: string;
      auth_header?: string;
    };

    if (!track || !['dropin', 'webhook'].includes(track)) {
      return res.status(400).json({ error: "track must be 'dropin' or 'webhook'" });
    }

    if (track === 'dropin' && (!api_key || !provider || !model)) {
      return res.status(400).json({ error: 'api_key, provider, and model are required for drop-in track' });
    }

    if (track === 'webhook' && !webhook_url) {
      return res.status(400).json({ error: 'webhook_url is required for webhook track' });
    }

    const { weekNumber, year } = getISOWeek(new Date());

    const { data, error } = await serviceClient
      .from('aio_gauntlet_runs')
      .insert({
        user_id: user.id,
        agent_id: agent_id ?? null,
        week_number: weekNumber,
        year,
        track,
        status: 'running',
        tasks: [],
        frames: [],
      })
      .select('id')
      .single();

    if (error || !data) {
      log.error('Failed to insert gauntlet run', { error });
      return res.status(500).json({ error: 'Failed to create run' });
    }

    const runId: string = data.id;

    const githubToken = await issueRunToken(runId);

    const runner = new GauntletRunner(runId);
    await runner.initialize();
    activeRunners.set(runId, runner);

    if (track === 'dropin' && api_key && provider && model) {
      executeGauntletDropIn({
        runner,
        runId,
        weekNumber,
        year,
        provider,
        model,
        apiKey: api_key,
        githubToken,
      }).catch((err: unknown) => {
        log.error('Drop-in execution failed (unhandled)', { runId, err });
      });
    }

    if (track === 'webhook' && webhook_url) {
      executeGauntletWebhook({
        runner,
        runId,
        weekNumber,
        year,
        webhookUrl: webhook_url,
        authHeader: auth_header,
        githubToken: githubToken,
      }).catch((err: unknown) => {
        log.error('Webhook execution failed (unhandled)', { runId, err });
      });
    }

    const tasks = pickWeeklyTasks(weekNumber, year);

    log.info('Gauntlet run started', { runId, userId: user.id, track });

    return res.status(201).json({
      runId,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        timeLimitMs: t.timeLimitMs,
      })),
      githubToken,
    });
  } catch (error) {
    log.error('Failed to create gauntlet run', { error });
    return res.status(500).json({ error: 'Failed to create run' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gauntlet/runs/:id/action
// Record an agent action frame
// ---------------------------------------------------------------------------
router.post('/runs/:id/action', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const runId = req.params.id as string;
    const { action, payload, a11y_tree, reasoning, screenshot_b64, task_index } = req.body as {
      action: string;
      payload?: string;
      a11y_tree?: string;
      reasoning?: string;
      screenshot_b64?: string;
      task_index: number;
    };

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    const runner = activeRunners.get(runId);
    if (!runner) {
      return res.status(404).json({ error: 'Run not found or already completed' });
    }

    // Verify ownership
    const { data: run } = await serviceClient
      .from('aio_gauntlet_runs')
      .select('user_id')
      .eq('id', runId)
      .single();

    if (!run || run.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to access this run' });
    }

    runner.recordFrame({ action, payload, a11y_tree, reasoning, screenshot_b64, task_index });

    return res.json({ ok: true });
  } catch (error) {
    log.error('Failed to record action', { error });
    return res.status(500).json({ error: 'Failed to record action' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gauntlet/runs/:id/tasks/:index/complete
// Complete a task and get the result
// ---------------------------------------------------------------------------
router.post('/runs/:id/tasks/:index/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const runId = req.params.id as string;
    const index = req.params.index as string;
    const { answer } = req.body as { answer: string };
    const taskIndex = parseInt(index, 10);

    if (!answer) {
      return res.status(400).json({ error: 'answer is required' });
    }

    if (isNaN(taskIndex) || taskIndex < 0 || taskIndex > 4) {
      return res.status(400).json({ error: 'task index must be 0–4' });
    }

    const runner = activeRunners.get(runId);
    if (!runner) {
      return res.status(404).json({ error: 'Run not found or already completed' });
    }

    // Verify ownership
    const { data: run } = await serviceClient
      .from('aio_gauntlet_runs')
      .select('user_id, week_number, year')
      .eq('id', runId)
      .single();

    if (!run || run.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to access this run' });
    }

    const tasks = pickWeeklyTasks(run.week_number, run.year);
    const task = tasks[taskIndex];
    if (!task) {
      return res.status(400).json({ error: 'Invalid task index' });
    }

    let githubToken = '';
    try {
      githubToken = getRunToken(runId);
    } catch {
      // Token not found or expired — verifier handles gracefully
    }

    const result = await runner.completeTask(taskIndex, task, answer, { githubToken });

    return res.json({ result });
  } catch (error) {
    log.error('Failed to complete task', { error });
    return res.status(500).json({ error: 'Failed to complete task' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gauntlet/runs/:id/finish
// Finalize a run
// ---------------------------------------------------------------------------
router.post('/runs/:id/finish', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const runId = req.params.id as string;
    const { status } = req.body as { status: 'completed' | 'failed' | 'timeout' };

    if (!status || !['completed', 'failed', 'timeout'].includes(status)) {
      return res.status(400).json({ error: "status must be 'completed', 'failed', or 'timeout'" });
    }

    const runner = activeRunners.get(runId);
    if (!runner) {
      return res.status(404).json({ error: 'Run not found or already completed' });
    }

    // Verify ownership
    const { data: run } = await serviceClient
      .from('aio_gauntlet_runs')
      .select('user_id')
      .eq('id', runId)
      .single();

    if (!run || run.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to access this run' });
    }

    const { totalScore } = await runner.finalize(status);

    revokeRunToken(runId);
    activeRunners.delete(runId);

    log.info('Gauntlet run finished', { runId, status, totalScore });

    return res.json({ totalScore, runId });
  } catch (error) {
    log.error('Failed to finish run', { error });
    return res.status(500).json({ error: 'Failed to finish run' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/gauntlet/leaderboard
// Public leaderboard for a given week
// ---------------------------------------------------------------------------
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const { weekNumber: currentWeek, year: currentYear } = getISOWeek(new Date());
    const weekNum = req.query.week ? parseInt(req.query.week as string, 10) : currentWeek;
    const yr = req.query.year ? parseInt(req.query.year as string, 10) : currentYear;

    if (isNaN(weekNum) || isNaN(yr)) {
      return res.status(400).json({ error: 'Invalid week or year parameter' });
    }

    const { data, error } = await serviceClient
      .from('aio_gauntlet_runs')
      .select(`
        id,
        user_id,
        total_score,
        track,
        completed_at,
        profile:aio_profiles!user_id(username, avatar_url)
      `)
      .eq('week_number', weekNum)
      .eq('year', yr)
      .eq('status', 'completed')
      .order('total_score', { ascending: false })
      .limit(50);

    if (error) {
      log.error('Failed to query leaderboard', { error });
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    const leaderboard = (data ?? []).map((row: Record<string, unknown>, idx: number) => {
      const profile = row.profile as { username?: string; avatar_url?: string } | null;
      return {
        rank: idx + 1,
        userId: row.user_id,
        username: profile?.username ?? null,
        avatar: profile?.avatar_url ?? null,
        totalScore: row.total_score,
        track: row.track,
        completedAt: row.completed_at,
      };
    });

    return res.json({ leaderboard });
  } catch (error) {
    log.error('Failed to get leaderboard', { error });
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/gauntlet/runs/:id/replay
// Public replay data for a single run
// ---------------------------------------------------------------------------
router.get('/runs/:id/replay', async (req: Request, res: Response) => {
  try {
    const { id: runId } = req.params;

    const { data, error } = await serviceClient
      .from('aio_gauntlet_runs')
      .select('id, user_id, frames, tasks, total_score, status, started_at, completed_at')
      .eq('id', runId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Run not found' });
    }

    return res.json({
      runId: data.id,
      userId: data.user_id,
      frames: data.frames,
      tasks: data.tasks,
      totalScore: data.total_score,
      status: data.status,
      startedAt: data.started_at,
      completedAt: data.completed_at,
    });
  } catch (error) {
    log.error('Failed to get replay', { error });
    return res.status(500).json({ error: 'Failed to get replay' });
  }
});

export default router;
