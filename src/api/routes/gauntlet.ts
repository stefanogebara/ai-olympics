import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { serviceClient } from '../../shared/utils/supabase.js';
import { GauntletRunner } from '../../services/gauntlet-runner.js';
import { issueRunToken, getRunToken, revokeRunToken } from '../../services/github-credential-service.js';
import { pickWeeklyTasks, hydrateTask } from '../../services/gauntlet-tasks.js';
import { createLogger } from '../../shared/utils/logger.js';
import { executeGauntletDropIn } from '../../services/gauntlet-execution.js';
import { executeGauntletWebhook } from '../../services/gauntlet-webhook-executor.js';

const log = createLogger('GauntletRoutes');
const router = Router();

// In-memory map of active runners: runId → GauntletRunner
const activeRunners = new Map<string, GauntletRunner>();

// ---------------------------------------------------------------------------
// Server-side timeout: finalize stale runs every 5 minutes (max 30 min age)
// ---------------------------------------------------------------------------
const STALE_RUN_CHECK_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes
const MAX_RUN_AGE_MS = 30 * 60 * 1000;               // 30 minutes

const staleRunCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [runId, runner] of activeRunners.entries()) {
    if (now - runner.getStartTime() > MAX_RUN_AGE_MS) {
      log.warn('Finalizing stale gauntlet run (exceeded 30 min)', { runId, userId: runner.userId });
      runner.finalize('timeout').catch((err: unknown) => {
        log.error('Failed to finalize stale run', { runId, error: err });
      });
      try { revokeRunToken(runId); } catch { /* best effort */ }
      activeRunners.delete(runId);
    }
  }
}, STALE_RUN_CHECK_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Rate limiting: max 3 runs per user per hour (in-memory, bounded)
// ---------------------------------------------------------------------------
const runCreationTimestamps = new Map<string, number[]>();
const MAX_RUNS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;
const MAX_RATE_LIMIT_ENTRIES = 10_000;

function isRunRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = runCreationTimestamps.get(userId) ?? [];
  const recent = timestamps.filter(ts => now - ts < HOUR_MS);
  if (recent.length === 0) {
    runCreationTimestamps.delete(userId);
  } else {
    runCreationTimestamps.set(userId, recent);
  }
  return recent.length >= MAX_RUNS_PER_HOUR;
}

function recordRunCreation(userId: string): void {
  // Evict oldest entries if map grows too large
  if (runCreationTimestamps.size >= MAX_RATE_LIMIT_ENTRIES) {
    const firstKey = runCreationTimestamps.keys().next().value as string;
    runCreationTimestamps.delete(firstKey);
  }
  const now = Date.now();
  const timestamps = runCreationTimestamps.get(userId) ?? [];
  const recent = timestamps.filter(ts => now - ts < HOUR_MS);
  recent.push(now);
  runCreationTimestamps.set(userId, recent);
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------
const VALID_TRACKS = ['dropin', 'webhook'] as const;
const VALID_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'deepseek', 'meta'] as const;

const MAX_API_KEY_LENGTH = 256;
const MAX_MODEL_LENGTH = 128;
const MAX_WEBHOOK_URL_LENGTH = 2048;
const MAX_AUTH_HEADER_LENGTH = 1024;
const MAX_ANSWER_LENGTH = 10000;
const MAX_ACTION_PAYLOAD_LENGTH = 50000;

const VALID_RUN_ACTIONS = new Set([
  'navigate', 'click', 'type', 'scroll', 'wait', 'done',
  'screenshot', 'extract', 'select', 'hover', 'press_key',
]);

function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

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

    // Rate limit: max 3 runs per user per hour
    if (isRunRateLimited(user.id)) {
      return res.status(429).json({ error: 'Too many runs. Maximum 3 per hour.' });
    }

    if (!track || !(VALID_TRACKS as readonly string[]).includes(track)) {
      return res.status(400).json({ error: "track must be 'dropin' or 'webhook'" });
    }

    if (track === 'dropin') {
      if (!api_key || !provider || !model) {
        return res.status(400).json({ error: 'api_key, provider, and model are required for drop-in track' });
      }
      if (typeof api_key !== 'string' || api_key.length > MAX_API_KEY_LENGTH) {
        return res.status(400).json({ error: `api_key must be a string of max ${MAX_API_KEY_LENGTH} characters` });
      }
      if (typeof provider !== 'string' || !(VALID_PROVIDERS as readonly string[]).includes(provider)) {
        return res.status(400).json({ error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
      }
      if (typeof model !== 'string' || model.length > MAX_MODEL_LENGTH || model.length < 1) {
        return res.status(400).json({ error: `model must be a string of 1–${MAX_MODEL_LENGTH} characters` });
      }
    }

    if (track === 'webhook') {
      if (!webhook_url) {
        return res.status(400).json({ error: 'webhook_url is required for webhook track' });
      }
      if (typeof webhook_url !== 'string' || webhook_url.length > MAX_WEBHOOK_URL_LENGTH) {
        return res.status(400).json({ error: `webhook_url must be a string of max ${MAX_WEBHOOK_URL_LENGTH} characters` });
      }
      if (!isValidHttpsUrl(webhook_url)) {
        return res.status(400).json({ error: 'webhook_url must be a valid HTTPS URL' });
      }
      if (auth_header && (typeof auth_header !== 'string' || auth_header.length > MAX_AUTH_HEADER_LENGTH)) {
        return res.status(400).json({ error: `auth_header must be a string of max ${MAX_AUTH_HEADER_LENGTH} characters` });
      }
    }

    const { weekNumber, year } = getISOWeek(new Date());

    // Check if user already has an active runner in memory — finalize it first
    for (const [existingRunId, existingRunner] of activeRunners.entries()) {
      if (existingRunner.userId === user.id) {
        log.info('Finalizing existing active run before starting new one', { existingRunId });
        try { await existingRunner.finalize('failed'); } catch { /* best effort */ }
        activeRunners.delete(existingRunId);
      }
    }

    // Delete any previous run for this user+week+track (re-runs allowed; we keep newest)
    await serviceClient
      .from('aio_gauntlet_runs')
      .delete()
      .eq('user_id', user.id)
      .eq('week_number', weekNumber)
      .eq('year', year)
      .eq('track', track);

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

    recordRunCreation(user.id);
    const runId: string = data.id;

    const githubToken = await issueRunToken(runId);

    const runner = new GauntletRunner(runId, user.id);
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

    if (!action || typeof action !== 'string' || !VALID_RUN_ACTIONS.has(action)) {
      return res.status(400).json({ error: `action must be one of: ${[...VALID_RUN_ACTIONS].join(', ')}` });
    }

    if (task_index === undefined || typeof task_index !== 'number' || !Number.isInteger(task_index) || task_index < 0 || task_index > 4) {
      return res.status(400).json({ error: 'task_index must be an integer between 0 and 4' });
    }

    if (payload !== undefined && (typeof payload !== 'string' || payload.length > MAX_ACTION_PAYLOAD_LENGTH)) {
      return res.status(400).json({ error: `payload must be a string of max ${MAX_ACTION_PAYLOAD_LENGTH} characters` });
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

    if (!answer || typeof answer !== 'string') {
      return res.status(400).json({ error: 'answer is required and must be a string' });
    }

    if (answer.length > MAX_ANSWER_LENGTH) {
      return res.status(400).json({ error: `answer must be at most ${MAX_ANSWER_LENGTH} characters` });
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
    const rawTask = tasks[taskIndex];
    if (!rawTask) {
      return res.status(400).json({ error: 'Invalid task index' });
    }
    const task = hydrateTask(rawTask, { runId });

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

    // Verify ownership and current status
    const { data: run } = await serviceClient
      .from('aio_gauntlet_runs')
      .select('user_id, status')
      .eq('id', runId)
      .single();

    if (!run || run.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to access this run' });
    }

    if (run.status !== 'running') {
      return res.status(409).json({ error: `Run is already in '${run.status}' status and cannot be finalized` });
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
      // Supabase may return profile as a single object or an array depending on FK cardinality
      const rawProfile = row.profile;
      const profile = (Array.isArray(rawProfile) ? rawProfile[0] : rawProfile) as
        | { username?: string; avatar_url?: string }
        | null
        | undefined;
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
      .select('id, user_id, track, frames, tasks, total_score, status, started_at, completed_at')
      .eq('id', runId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Run not found' });
    }

    // Strip sensitive fields from frames before sending publicly
    let sanitizedFrames = data.frames;
    try {
      const rawFrames = typeof data.frames === 'string' ? JSON.parse(data.frames) : (data.frames ?? []);
      sanitizedFrames = (rawFrames as Record<string, unknown>[]).map((f: Record<string, unknown>) => {
        const { screenshot_b64: _s, a11y_tree: _a, ...rest } = f;
        return rest;
      });
    } catch { /* leave as-is if parsing fails */ }

    // Parse tasks if stored as a JSON string
    let parsedTasks = data.tasks;
    try {
      parsedTasks = typeof data.tasks === 'string' ? JSON.parse(data.tasks) : (data.tasks ?? []);
    } catch { /* leave as-is if parsing fails */ }

    return res.json({
      runId: data.id,
      userId: data.user_id,
      track: data.track,
      frames: sanitizedFrames,
      tasks: parsedTasks,
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

// ---------------------------------------------------------------------------
// Graceful shutdown: finalize all active runners on SIGTERM (e.g. Fly.io deploy)
// ---------------------------------------------------------------------------
process.on('SIGTERM', () => {
  clearInterval(staleRunCleanupInterval);
  log.info('SIGTERM received — finalizing all active gauntlet runners', {
    activeCount: activeRunners.size,
  });

  const finalizePromises: Promise<void>[] = [];
  for (const [runId, runner] of activeRunners.entries()) {
    const p = runner
      .finalize('failed')
      .then(() => {
        try { revokeRunToken(runId); } catch { /* best effort */ }
        activeRunners.delete(runId);
        log.info('Runner finalized on SIGTERM', { runId });
      })
      .catch((err: unknown) => {
        log.error('Failed to finalize runner on SIGTERM', { runId, error: err });
      });
    finalizePromises.push(p);
  }

  Promise.allSettled(finalizePromises).then(() => {
    log.info('All gauntlet runners finalized on SIGTERM');
  });
});

export default router;
