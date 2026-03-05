/**
 * Gauntlet Webhook Execution Service
 *
 * Drives a headless browser on behalf of a user's webhook agent.
 * At each turn it: captures page state → POSTs to webhook URL → executes returned action.
 * Mirrors the drop-in executor's fire-and-forget pattern.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { createLogger } from '../shared/utils/logger.js';
import type { GauntletRunner } from './gauntlet-runner.js';
import type { GauntletTask } from './gauntlet-tasks.js';
import { pickWeeklyTasks, hydrateTask } from './gauntlet-tasks.js';

const log = createLogger('GauntletWebhook');

const MAX_TURNS_PER_TASK = 30;
const TURN_TIMEOUT_MS = 15_000;    // 15s for webhook to respond
const RUN_TIMEOUT_MS  = 10 * 60 * 1000; // 10 min wall-clock

// ---------------------------------------------------------------------------
// SSRF protection — block private / loopback ranges
// ---------------------------------------------------------------------------

/**
 * Validate a webhook URL for SSRF safety.
 * Requirements:
 *   - Must be HTTPS (no HTTP)
 *   - Must not point to localhost, loopback, or private/internal IP ranges
 *   - Must not point to cloud metadata endpoints (169.254.169.254)
 *
 * Throws on invalid URLs so callers get a descriptive error.
 */
export function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost variants
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]' || hostname === '0.0.0.0') {
    throw new Error('Webhook URL must not point to localhost');
  }

  // Block private/internal IP ranges by parsing the hostname as an IP
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 127.0.0.0/8 (loopback)
    if (a === 127) throw new Error('Webhook URL must not point to loopback addresses (127.0.0.0/8)');
    // 10.0.0.0/8 (private)
    if (a === 10) throw new Error('Webhook URL must not point to private IP ranges (10.0.0.0/8)');
    // 172.16.0.0/12 (private)
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) throw new Error('Webhook URL must not point to private IP ranges (172.16.0.0/12)');
    // 192.168.0.0/16 (private)
    if (a === 192 && b === 168) throw new Error('Webhook URL must not point to private IP ranges (192.168.0.0/16)');
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (a === 169 && b === 254) throw new Error('Webhook URL must not point to link-local or metadata endpoints (169.254.0.0/16)');
    // 0.0.0.0/8
    if (a === 0) throw new Error('Webhook URL must not point to 0.0.0.0/8');
  }
}

function isSsrfSafe(url: string): boolean {
  try {
    validateWebhookUrl(url);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Page state capture
// ---------------------------------------------------------------------------

interface PageState {
  url: string;
  accessibility_tree: string;
  screenshot_b64: null; // omitted for now — can be enabled later
}

async function capturePageState(page: Page): Promise<PageState> {
  const url = page.url();
  let accessibility_tree = '';
  try {
    // ariaSnapshot is the modern Playwright API (1.46+); page.accessibility was removed
    accessibility_tree = await page.locator('body').ariaSnapshot();
  } catch {
    accessibility_tree = '';
  }
  return { url, accessibility_tree, screenshot_b64: null };
}

// ---------------------------------------------------------------------------
// Webhook request + response types
// ---------------------------------------------------------------------------

interface WebhookRequest {
  run_id: string;
  task_index: number;
  task: { id: string; title: string; prompt: string };
  turn: number;
  url: string;
  accessibility_tree: string;
  screenshot_b64: null;
}

interface WebhookAction {
  action: 'navigate' | 'click' | 'type' | 'scroll' | 'wait' | 'done';
  payload?: string;
  reasoning?: string;
}

const ALLOWED_ACTIONS = new Set(['navigate', 'click', 'type', 'scroll', 'wait', 'done']);

async function callWebhook(
  webhookUrl: string,
  authHeader: string | undefined,
  body: WebhookRequest,
): Promise<WebhookAction> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const data = await res.json() as unknown;
  if (!data || typeof data !== 'object') throw new Error('Webhook returned non-object response');

  const action = (data as Record<string, unknown>).action as string | undefined;
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    throw new Error(`Webhook returned invalid action: '${action ?? 'undefined'}'`);
  }

  // Validate payload size to prevent memory exhaustion
  const payload = (data as Record<string, unknown>).payload;
  if (typeof payload === 'string' && payload.length > 50_000) {
    throw new Error(`Webhook payload too large: ${payload.length} chars (max 50000)`);
  }

  return data as WebhookAction;
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

async function executeAction(page: Page, action: WebhookAction): Promise<void> {
  const payload = action.payload ?? '';

  switch (action.action) {
    case 'navigate': {
      const url = payload.startsWith('http') ? payload : `https://${payload}`;
      await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
      break;
    }
    case 'click': {
      await page.locator(payload).first().click({ timeout: 10_000 }).catch(async () => {
        // Fallback: try as text
        await page.getByText(payload).first().click({ timeout: 5_000 });
      });
      break;
    }
    case 'type': {
      // payload format: "selector|||text"
      const sep = payload.indexOf('|||');
      if (sep !== -1) {
        const selector = payload.slice(0, sep);
        const text = payload.slice(sep + 3);
        await page.locator(selector).first().fill(text, { timeout: 10_000 });
      } else {
        // No selector — type at current focus
        await page.keyboard.type(payload);
      }
      break;
    }
    case 'scroll': {
      const dir = payload === 'up' ? -400 : 400;
      await page.mouse.wheel(0, dir);
      break;
    }
    case 'wait':
      await page.waitForTimeout(1_000);
      break;
    case 'done':
      // No browser action for done — handled by the caller
      break;
  }
}

// ---------------------------------------------------------------------------
// Per-task execution loop
// ---------------------------------------------------------------------------

async function executeWebhookTask(
  page: Page,
  taskIndex: number,
  task: GauntletTask,
  webhookUrl: string,
  authHeader: string | undefined,
  runner: GauntletRunner,
  githubToken: string | undefined,
): Promise<void> {
  runner.startTask(taskIndex);

  let answer = '';

  for (let turn = 0; turn < MAX_TURNS_PER_TASK; turn++) {
    const pageState = await capturePageState(page);

    const request: WebhookRequest = {
      run_id: runner.runId,
      task_index: taskIndex,
      task: { id: task.id, title: task.title, prompt: task.prompt },
      turn,
      ...pageState,
    };

    const webhookAction = await callWebhook(webhookUrl, authHeader, request);

    runner.recordFrame({
      action: webhookAction.action,
      payload: webhookAction.payload,
      reasoning: webhookAction.reasoning,
      task_index: taskIndex,
    });

    if (webhookAction.action === 'done') {
      answer = webhookAction.payload ?? '';
      break;
    }

    await executeAction(page, webhookAction);
  }

  if (!answer) {
    log.warn('Webhook task produced no answer', { runId: runner.runId, taskId: task.id });
  }

  await runner.completeTask(taskIndex, task, answer, { githubToken });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GauntletWebhookOptions {
  runner: GauntletRunner;
  runId: string;
  weekNumber: number;
  year: number;
  webhookUrl: string;
  authHeader?: string;
  githubToken?: string;
}

/**
 * Execute a full gauntlet webhook run.
 * Fire-and-forget safe: never throws, always finalizes the run.
 */
export async function executeGauntletWebhook(opts: GauntletWebhookOptions): Promise<void> {
  const { runner, weekNumber, year, webhookUrl, authHeader, githubToken } = opts;

  // SSRF guard — fail fast before allocating a browser
  if (!isSsrfSafe(webhookUrl)) {
    log.error('Webhook URL failed SSRF check', { runId: runner.runId, webhookUrl });
    await runner.finalize('failed');
    return;
  }

  // Substitute template variables ({runId}, {agentName}) in task prompts
  const rawTasks = pickWeeklyTasks(weekNumber, year);
  const tasks = rawTasks.map(t => hydrateTask(t, { runId: runner.runId }));

  let browser: Browser | null = null;

  const runWithTimeout = async (): Promise<void> => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i] as GauntletTask;
      const page = await browser.newPage();
      try {
        await executeWebhookTask(page, i, task, webhookUrl, authHeader, runner, githubToken);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  };

  try {
    await Promise.race([
      runWithTimeout(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gauntlet webhook run timeout (10min)')), RUN_TIMEOUT_MS),
      ),
    ]);
    await runner.finalize('completed');
    log.info('Gauntlet webhook run completed', { runId: runner.runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Webhook execution failed', { runId: runner.runId, error: message });
    await runner.finalize('failed');
  } finally {
    await (browser as Browser | null)?.close().catch(() => undefined);
  }
}
