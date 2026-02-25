import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import type { AgentConfig, AgentState, AgentAction, TaskDefinition } from '../shared/types/index.js';
import { BaseAgentAdapter, createAgentAdapter, type PageState, type ToolCall } from './adapters/index.js';
import { PrecisionTimer, formatDuration } from '../shared/utils/timer.js';
import { eventBus, createStreamEvent } from '../shared/utils/events.js';
import { createLogger } from '../shared/utils/logger.js';
import { config } from '../shared/config.js';

const log = createLogger('AgentRunner');

// ============================================================================
// SECURITY: Action allowlist & URL validation
// ============================================================================

/** Explicit set of allowed tool names. Any tool not in this set is rejected. */
const ALLOWED_TOOLS = new Set([
  'navigate', 'click', 'type', 'select', 'scroll',
  'wait', 'submit', 'done', 'api_call',
]);

/** Max tool calls per single turn to prevent runaway loops */
const MAX_TOOL_CALLS_PER_TURN = 10;

/** Max actions per second per agent to prevent rapid-fire abuse */
const MAX_ACTIONS_PER_SECOND = 3;

/** Max API cost budget per agent per competition (in USD) */
const MAX_API_COST_PER_COMPETITION = 5.0;

// Approximate cost per 1K tokens by model family (USD)
const TOKEN_COST_PER_1K: Record<string, { input: number; output: number }> = {
  'claude-opus':    { input: 0.015, output: 0.075 },
  'claude-sonnet':  { input: 0.003, output: 0.015 },
  'claude-haiku':   { input: 0.0008, output: 0.004 },
  'gpt-4':          { input: 0.01, output: 0.03 },
  'gpt-4o':         { input: 0.005, output: 0.015 },
  'gemini-pro':     { input: 0.00125, output: 0.005 },
  'gemini-flash':   { input: 0.0001, output: 0.0004 },
  'default':        { input: 0.005, output: 0.015 },
};

/**
 * Validate a URL for the api_call tool to prevent SSRF attacks.
 * Blocks: private IPs, loopback, link-local, metadata endpoints, non-http schemes.
 */
export function isUrlAllowed(rawUrl: string): { allowed: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'Invalid URL' };
  }

  // Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback variants
  // Normalize IPv6 brackets: new URL('http://[::1]') gives hostname '[::1]'
  const normalizedHost = hostname.replace(/^\[|\]$/g, '');

  if (normalizedHost === 'localhost' || normalizedHost === '127.0.0.1' || normalizedHost === '::1' || normalizedHost === '0.0.0.0') {
    // Only allow calls to our own API server on the exact configured port
    const apiPort = String(config.port || 3003);
    if (parsed.port === apiPort) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Blocked: localhost/loopback (only API port allowed)' };
  }

  // Block cloud metadata endpoints (AWS, GCP, Azure)
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return { allowed: false, reason: 'Blocked: cloud metadata endpoint' };
  }

  // Block private IP ranges
  const privateRanges = [
    /^10\./,                              // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./,         // 172.16.0.0/12
    /^192\.168\./,                         // 192.168.0.0/16
    /^169\.254\./,                         // link-local
    /^fc[0-9a-f]{2}:/i,                   // IPv6 unique-local
    /^fe80:/i,                            // IPv6 link-local
  ];

  for (const range of privateRanges) {
    if (range.test(hostname)) {
      return { allowed: false, reason: 'Blocked: private IP range' };
    }
  }

  return { allowed: true };
}

/**
 * Validate a URL for the navigate tool to prevent SSRF and dangerous protocol attacks.
 * Similar to isUrlAllowed but allows localhost (tasks are served locally).
 * Blocks: private IPs (non-localhost), cloud metadata, non-http schemes.
 */
export function isNavigateUrlAllowed(rawUrl: string): { allowed: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'Invalid URL' };
  }

  // Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return { allowed: false, reason: 'Blocked: cloud metadata endpoint' };
  }

  // Block private IP ranges
  const privateRanges = [
    /^10\./,                              // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./,         // 172.16.0.0/12
    /^192\.168\./,                         // 192.168.0.0/16
    /^169\.254\./,                         // link-local
    /^fc[0-9a-f]{2}:/i,                   // IPv6 unique-local
    /^fe80:/i,                            // IPv6 link-local
  ];
  for (const range of privateRanges) {
    if (range.test(hostname)) {
      return { allowed: false, reason: 'Blocked: private IP range' };
    }
  }

  // Allow localhost (tasks are served locally)
  return { allowed: true };
}

// ============================================================================
// SECURITY: Tool argument validation
// ============================================================================

/** Max argument string length to prevent memory abuse */
const MAX_ARG_LENGTH = 10000;

/**
 * Validate tool call arguments match expected types.
 * Returns an error string if invalid, or null if valid.
 */
export function validateToolArgs(name: string, args: Record<string, unknown>): string | null {
  // Ensure args is an object (not null, array, or primitive)
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return 'Arguments must be an object';
  }

  switch (name) {
    case 'navigate':
      if (typeof args.url !== 'string') return 'navigate requires a string "url"';
      if (args.url.length > MAX_ARG_LENGTH) return 'URL too long';
      break;
    case 'click':
      if (typeof args.element !== 'string') return 'click requires a string "element"';
      if ((args.element as string).length > MAX_ARG_LENGTH) return 'Element selector too long';
      break;
    case 'type':
      if (typeof args.element !== 'string') return 'type requires a string "element"';
      if (typeof args.text !== 'string') return 'type requires a string "text"';
      if ((args.text as string).length > MAX_ARG_LENGTH) return 'Text too long';
      break;
    case 'select':
      if (typeof args.element !== 'string') return 'select requires a string "element"';
      if (typeof args.option !== 'string') return 'select requires a string "option"';
      break;
    case 'scroll':
      if (typeof args.direction !== 'string') return 'scroll requires a string "direction"';
      if (!['up', 'down', 'left', 'right'].includes(args.direction as string)) return 'Invalid scroll direction';
      if (args.amount !== undefined && typeof args.amount !== 'number') return 'scroll amount must be a number';
      break;
    case 'wait':
      if (typeof args.condition !== 'string') return 'wait requires a string "condition"';
      break;
    case 'api_call':
      if (typeof args.url !== 'string') return 'api_call requires a string "url"';
      if (args.url.length > MAX_ARG_LENGTH) return 'URL too long';
      if (args.method !== undefined && typeof args.method !== 'string') return 'method must be a string';
      if (args.body !== undefined && typeof args.body !== 'string') return 'body must be a string';
      if (args.body && (args.body as string).length > MAX_ARG_LENGTH) return 'Request body too long';
      break;
    case 'done':
      // done is always valid - result data is logged but not executed
      break;
    case 'submit':
      // form is optional
      if (args.form !== undefined && typeof args.form !== 'string') return 'form must be a string';
      break;
  }

  return null;
}

// ============================================================================
// SECURITY: Agent response validation
// ============================================================================

/** Suspicious patterns that may indicate prompt injection or data exfiltration */
const SUSPICIOUS_PATTERNS = [
  /\beval\s*\(/i,                          // JavaScript eval
  /\bnew\s+Function\b/i,                   // Function constructor
  /\bimport\s*\(/i,                        // Dynamic imports
  /\brequire\s*\(/i,                       // Node.js require
  /\bprocess\.(env|exit|kill)\b/i,         // Process manipulation
  /\b(child_process|exec|spawn)\b/i,       // Shell execution
  /\bfs\.(read|write|unlink|rmdir)/i,       // Filesystem access
  /<script[\s>]/i,                         // Script injection in type text
  /\bon(error|load|click)\s*=/i,           // Event handler injection
];

/** Max length for any single tool argument value (strings) */
const MAX_RESPONSE_TOOL_CALLS = 20;

/**
 * Validate the overall structure of an agent's turn response.
 * Returns an array of warning strings (empty = valid).
 */
export function validateAgentResponse(response: {
  toolCalls?: unknown;
  thinking?: unknown;
  done?: unknown;
  result?: unknown;
}): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // toolCalls must be an array if present
  if (response.toolCalls !== undefined) {
    if (!Array.isArray(response.toolCalls)) {
      return { valid: false, warnings: ['toolCalls must be an array'] };
    }
    if (response.toolCalls.length > MAX_RESPONSE_TOOL_CALLS) {
      warnings.push(`Excessive tool calls: ${response.toolCalls.length} (max ${MAX_RESPONSE_TOOL_CALLS})`);
    }
    for (let i = 0; i < response.toolCalls.length; i++) {
      const tc = response.toolCalls[i];
      if (!tc || typeof tc !== 'object') {
        return { valid: false, warnings: [`toolCalls[${i}] is not an object`] };
      }
      if (typeof tc.name !== 'string' || tc.name.length === 0) {
        return { valid: false, warnings: [`toolCalls[${i}].name must be a non-empty string`] };
      }
      if (tc.arguments !== undefined && (typeof tc.arguments !== 'object' || tc.arguments === null)) {
        return { valid: false, warnings: [`toolCalls[${i}].arguments must be an object`] };
      }
    }
  }

  // thinking must be a string if present
  if (response.thinking !== undefined && typeof response.thinking !== 'string') {
    warnings.push('thinking should be a string');
  }

  // done must be a boolean if present
  if (response.done !== undefined && typeof response.done !== 'boolean') {
    warnings.push('done should be a boolean');
  }

  return { valid: true, warnings };
}

/**
 * Scan tool call arguments for suspicious patterns that may indicate
 * prompt injection, code execution, or data exfiltration attempts.
 * Returns a list of findings (empty = clean).
 */
export function detectSuspiciousArgs(toolName: string, args: Record<string, unknown>): string[] {
  const findings: string[] = [];

  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string') continue;

    // Check for suspicious patterns in string values
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(value)) {
        findings.push(`Suspicious pattern in ${toolName}.${key}: ${pattern.source}`);
        break; // One finding per field is enough
      }
    }

    // Detect large base64-encoded payloads (potential data exfil)
    if (value.length > 500) {
      const base64Ratio = (value.match(/[A-Za-z0-9+/=]/g)?.length || 0) / value.length;
      if (base64Ratio > 0.9 && value.length > 1000) {
        findings.push(`Possible base64 payload in ${toolName}.${key} (${value.length} chars, ${(base64Ratio * 100).toFixed(0)}% b64)`);
      }
    }
  }

  return findings;
}

export interface AgentRunnerConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  recordActions: boolean;
  maxTurns: number;
  turnTimeout: number;  // ms
}

const DEFAULT_CONFIG: AgentRunnerConfig = {
  headless: false,  // Show browser for entertainment
  viewport: { width: 1920, height: 1080 },
  recordActions: true,
  maxTurns: 100,
  turnTimeout: 30000
};

export class AgentRunner {
  private adapter: BaseAgentAdapter;
  private agentConfig: AgentConfig;
  private runnerConfig: AgentRunnerConfig;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private timer: PrecisionTimer;
  private actions: AgentAction[] = [];
  private state: AgentState;
  private competitionId: string = '';
  private eventId: string = '';

  // Rate limiting: track action timestamps for per-second throttling
  private actionTimestamps: number[] = [];

  // Cost tracking: accumulated API cost in USD
  private totalApiCost: number = 0;
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;

  constructor(agentConfig: AgentConfig, runnerConfig: Partial<AgentRunnerConfig> = {}) {
    this.agentConfig = agentConfig;
    this.runnerConfig = { ...DEFAULT_CONFIG, ...runnerConfig };
    this.adapter = createAgentAdapter(agentConfig);
    this.timer = new PrecisionTimer();
    this.state = this.createInitialState();
  }

  private createInitialState(): AgentState {
    return {
      id: this.agentConfig.id,
      status: 'idle',
      progress: 0,
      actionCount: 0
    };
  }

  get id(): string {
    return this.agentConfig.id;
  }

  get currentState(): AgentState {
    return { ...this.state };
  }

  get actionHistory(): AgentAction[] {
    return [...this.actions];
  }

  // Initialize browser and prepare for task
  async initialize(competitionId: string, eventId: string): Promise<void> {
    this.competitionId = competitionId;
    this.eventId = eventId;
    this.state.status = 'initializing';
    this.emitStateUpdate();

    log.agent(this.id, 'Initializing browser');

    try {
      this.browser = await chromium.launch({
        headless: this.runnerConfig.headless,
        args: [
          '--start-maximized',
          '--disable-gpu',  // More stable on Windows
          '--no-sandbox',
          '--disable-dev-shm-usage'  // Prevent shared memory issues
        ]
      });

      // Listen for browser disconnection
      this.browser.on('disconnected', () => {
        log.agent(this.id, 'Browser disconnected');
        this.page = null;
        this.browser = null;
      });

      const context = await this.browser.newContext({
        viewport: this.runnerConfig.viewport,
        recordVideo: this.runnerConfig.recordActions ? {
          dir: `./recordings/${this.competitionId}/${this.eventId}`,
          size: this.runnerConfig.viewport
        } : undefined
      });

      this.page = await context.newPage();

      // Listen for page crashes
      this.page.on('crash', () => {
        log.agent(this.id, 'Page crashed');
        this.page = null;
      });

      log.agent(this.id, 'Browser initialized');

    } catch (error) {
      log.error(`Failed to initialize browser for ${this.id}`, { error });
      throw error;
    }
  }

  // Run the agent on a task
  async runTask(task: TaskDefinition): Promise<{
    success: boolean;
    completionTime?: number;
    actions: AgentAction[];
    error?: string;
    result?: unknown;
  }> {
    if (!this.page) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }

    log.agent(this.id, `Starting task: ${task.name}`);

    // Initialize the adapter with task prompts (inject dynamic context)
    const apiBase = process.env.API_BASE_URL || `http://localhost:${config.port}`;
    const taskPrompt = task.taskPrompt
      .replace(/\{AGENT_ID\}/g, this.agentConfig.id)
      .replace(/\{COMPETITION_ID\}/g, this.competitionId)
      .replace(/\{API_BASE\}/g, apiBase);
    this.adapter.initialize(task.systemPrompt, taskPrompt);

    // Navigate to start URL if provided
    if (task.startUrl) {
      await this.page.goto(task.startUrl);
      this.recordAction('navigate', task.startUrl, true);
    }

    this.state.status = 'running';
    this.state.startTime = Date.now();
    this.timer.start();
    this.emitStateUpdate();

    let turnCount = 0;
    let taskComplete = false;
    let taskResult: unknown;
    let error: string | undefined;

    try {
      while (turnCount < this.runnerConfig.maxTurns && !taskComplete) {
        turnCount++;
        log.agent(this.id, `Turn ${turnCount}`);

        // Check if page is still valid
        if (!this.isPageValid()) {
          throw new Error('Browser page was closed unexpectedly');
        }

        // Get current page state
        const pageState = await this.getPageState();

        // Let the agent decide what to do
        const turnResult = await Promise.race([
          this.adapter.processTurn(pageState),
          this.timeout(this.runnerConfig.turnTimeout)
        ]);

        if (!turnResult) {
          throw new Error('Turn timeout');
        }

        // SECURITY: Validate response structure
        const responseCheck = validateAgentResponse(turnResult);
        if (!responseCheck.valid) {
          log.warn(`Agent ${this.id} sent invalid response: ${responseCheck.warnings.join('; ')}`);
          this.recordAction('invalid_response', responseCheck.warnings.join('; '), false, 'Invalid agent response');
          continue; // Skip this turn
        }
        if (responseCheck.warnings.length > 0) {
          log.warn(`Agent ${this.id} response warnings: ${responseCheck.warnings.join('; ')}`);
        }

        // SECURITY: Track token usage if the adapter reports it
        if (turnResult.usage) {
          this.trackTokenUsage(turnResult.usage.inputTokens || 0, turnResult.usage.outputTokens || 0);
        }

        // SECURITY: Check API cost budget
        if (this.isBudgetExceeded()) {
          const stats = this.getCostStats();
          log.warn(`Agent ${this.id} exceeded API budget: $${stats.totalCost} (limit: $${MAX_API_COST_PER_COMPETITION})`);
          error = `API cost budget exceeded ($${stats.totalCost})`;
          this.state.status = 'failed';
          break;
        }

        // Emit thinking event
        if (turnResult.thinking) {
          this.emitAction('thinking', turnResult.thinking, true);
        }

        // Execute tool calls and collect results (with per-turn rate limit)
        const toolResults: Array<{ toolCallId: string; toolName: string; result: string; error?: string }> = [];
        const toolCalls = turnResult.toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN);

        if (turnResult.toolCalls.length > MAX_TOOL_CALLS_PER_TURN) {
          log.warn(`Agent ${this.id} sent ${turnResult.toolCalls.length} tool calls in one turn, capping at ${MAX_TOOL_CALLS_PER_TURN}`);
        }

        for (const toolCall of toolCalls) {
          // Check page validity before each tool call
          if (!this.isPageValid()) {
            throw new Error('Browser page was closed during tool execution');
          }

          // SECURITY: Enforce per-second rate limit
          await this.enforceRateLimit();

          const result = await this.executeToolCall(toolCall);

          // Collect tool result for the adapter
          if (toolCall.id) {
            toolResults.push({
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              result: result,
              error: result.startsWith('Error:') ? result : undefined
            });
          }

          // Check for task timeout
          if (this.timer.elapsedSeconds() > task.timeLimit) {
            this.state.status = 'timeout';
            error = 'Task time limit exceeded';
            break;
          }
        }

        // Pass tool results back to the adapter for conversation continuity
        if (toolResults.length > 0 && 'addToolResults' in this.adapter) {
          (this.adapter as any).addToolResults(toolResults);
        }

        // Check if agent signaled completion
        if (turnResult.done) {
          taskComplete = true;
          taskResult = turnResult.result;
        }

        // Update progress estimate
        this.state.progress = Math.min(95, (turnCount / this.runnerConfig.maxTurns) * 100);
        this.emitStateUpdate();
      }

      // Final status
      const completionTime = this.timer.stop();

      if (taskComplete) {
        this.state.status = 'completed';
        this.state.progress = 100;
        log.agent(this.id, `Task completed in ${formatDuration(completionTime)}`);
      } else if (!error) {
        this.state.status = 'failed';
        error = 'Max turns exceeded';
        log.agent(this.id, 'Task failed: max turns exceeded');
      }

      this.state.endTime = Date.now();
      this.emitStateUpdate();

      return {
        success: taskComplete,
        completionTime,
        actions: this.actions,
        error,
        result: taskResult
      };

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.state.status = 'failed';
      this.state.error = errorMsg;
      this.state.endTime = Date.now();
      this.timer.stop();
      this.emitStateUpdate();

      log.error(`Task failed: ${errorMsg}`, { agentId: this.id });

      return {
        success: false,
        completionTime: this.timer.elapsed(),
        actions: this.actions,
        error: errorMsg
      };
    }
  }

  // Check if page is still valid
  private isPageValid(): boolean {
    try {
      return this.page !== null && !this.page.isClosed();
    } catch {
      return false;
    }
  }

  // Get the current page state for the agent
  private async getPageState(): Promise<PageState> {
    if (!this.page || !this.isPageValid()) {
      throw new Error('Page is closed or unavailable');
    }

    const url = this.page.url();
    const title = await this.page.title().catch(() => 'Unknown');

    // Get simplified accessibility tree
    const accessibilityTree = await this.getAccessibilityTree();

    return {
      url,
      title,
      accessibilityTree
    };
  }

  // Get a simplified accessibility tree for the agent
  private async getAccessibilityTree(): Promise<string> {
    if (!this.page) return '';

    try {
      // Use ariaSnapshot for modern Playwright
      const snapshot = await this.page.locator('body').ariaSnapshot();
      return snapshot || 'No accessibility information available';
    } catch {
      // Fallback: Extract interactive elements manually
      const elements = await this.page.evaluate((): string => {
        const interactiveElements: string[] = [];

        // Get all form elements and interactive items
        const selectors = [
          'input', 'button', 'select', 'textarea', 'a[href]',
          '[role="button"]', '[role="link"]', '[role="textbox"]',
          '[role="combobox"]', '[role="checkbox"]', '[role="radio"]'
        ];

        const els = document.querySelectorAll(selectors.join(', '));
        els.forEach((el: Element, index: number) => {
          const tag = el.tagName.toLowerCase();
          const type = el.getAttribute('type') || '';
          const name = el.getAttribute('name') || '';
          const id = el.getAttribute('id') || '';
          const label = el.getAttribute('aria-label') ||
                       el.getAttribute('placeholder') ||
                       (el as unknown as { innerText?: string }).innerText?.slice(0, 50) || '';
          const value = (el as unknown as { value?: string }).value || '';

          let desc = `[${index}] <${tag}`;
          if (type) desc += ` type="${type}"`;
          if (name) desc += ` name="${name}"`;
          if (id) desc += ` id="${id}"`;
          if (label) desc += ` label="${label}"`;
          if (value) desc += ` value="${value}"`;
          desc += '>';

          interactiveElements.push(desc);
        });

        return interactiveElements.join('\n');
      });

      return elements || 'No interactive elements found';
    }
  }

  // Execute an API call (no browser needed) with SSRF protection
  private async executeApiCall(args: Record<string, unknown>): Promise<string> {
    const method = (args.method as string) || 'GET';
    const url = args.url as string;
    const body = args.body as string | undefined;

    if (!url) return 'Error: url is required';

    // SECURITY: Validate URL against SSRF
    const urlCheck = isUrlAllowed(url);
    if (!urlCheck.allowed) {
      log.warn(`Agent ${this.id} SSRF blocked: ${urlCheck.reason}`, { url });
      return `Error: URL not allowed - ${urlCheck.reason}`;
    }

    // Only allow GET and POST methods
    if (method !== 'GET' && method !== 'POST') {
      return `Error: HTTP method "${method}" is not allowed. Only GET and POST are permitted.`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Agent-Id': this.agentConfig.id,
      'X-Competition-Id': this.competitionId,
    };

    const options: RequestInit = { method, headers };
    if (body && method === 'POST') {
      options.body = body;
    }

    const response = await fetch(url, options);
    const text = await response.text();

    // Truncate large responses to keep context manageable
    const maxLen = 4000;
    const truncated = text.length > maxLen
      ? text.slice(0, maxLen) + '\n... (truncated)'
      : text;

    return `HTTP ${response.status}: ${truncated}`;
  }

  /** Resolve approximate token cost rates for this agent's model */
  private getTokenCostRate(): { input: number; output: number } {
    const model = (this.agentConfig.model || '').toLowerCase();
    if (model.includes('opus'))   return TOKEN_COST_PER_1K['claude-opus'];
    if (model.includes('sonnet')) return TOKEN_COST_PER_1K['claude-sonnet'];
    if (model.includes('haiku'))  return TOKEN_COST_PER_1K['claude-haiku'];
    if (model.includes('gpt-4o')) return TOKEN_COST_PER_1K['gpt-4o'];
    if (model.includes('gpt-4'))  return TOKEN_COST_PER_1K['gpt-4'];
    if (model.includes('gemini') && model.includes('flash')) return TOKEN_COST_PER_1K['gemini-flash'];
    if (model.includes('gemini')) return TOKEN_COST_PER_1K['gemini-pro'];
    return TOKEN_COST_PER_1K['default'];
  }

  /** Track token usage from an adapter turn and accumulate cost */
  trackTokenUsage(inputTokens: number, outputTokens: number): void {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    const rate = this.getTokenCostRate();
    this.totalApiCost += (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  }

  /** Check if the agent has exceeded its cost budget */
  isBudgetExceeded(): boolean {
    return this.totalApiCost >= MAX_API_COST_PER_COMPETITION;
  }

  /** Get current cost tracking stats */
  getCostStats(): { totalCost: number; inputTokens: number; outputTokens: number; budgetRemaining: number } {
    return {
      totalCost: Math.round(this.totalApiCost * 10000) / 10000,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      budgetRemaining: Math.round((MAX_API_COST_PER_COMPETITION - this.totalApiCost) * 10000) / 10000,
    };
  }

  /** Enforce per-second action rate limit. Waits if necessary. */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    // Remove timestamps older than 1 second
    this.actionTimestamps = this.actionTimestamps.filter(t => now - t < 1000);

    if (this.actionTimestamps.length >= MAX_ACTIONS_PER_SECOND) {
      // Wait until the oldest action in the window expires
      const waitMs = 1000 - (now - this.actionTimestamps[0]);
      if (waitMs > 0) {
        log.agent(this.id, `Rate limited: waiting ${waitMs}ms`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
      // Clean up again after waiting
      const afterWait = Date.now();
      this.actionTimestamps = this.actionTimestamps.filter(t => afterWait - t < 1000);
    }

    this.actionTimestamps.push(Date.now());
  }

  // Execute a tool call (includes argument validation)
  private validateToolArgs(name: string, args: Record<string, unknown>): string | null {
    return validateToolArgs(name, args);
  }

  // Execute a tool call
  private async executeToolCall(toolCall: ToolCall): Promise<string> {
    const { name, arguments: args } = toolCall;

    // SECURITY: Reject tools not in the allowlist
    if (!ALLOWED_TOOLS.has(name)) {
      log.warn(`Agent ${this.id} attempted disallowed tool: ${name}`);
      this.recordAction(name, JSON.stringify(args), false, 'Tool not allowed');
      return `Error: Tool "${name}" is not allowed`;
    }

    // SECURITY: Validate tool arguments
    const argError = this.validateToolArgs(name, args);
    if (argError) {
      log.warn(`Agent ${this.id} invalid args for ${name}: ${argError}`);
      this.recordAction(name, JSON.stringify(args), false, argError);
      return `Error: Invalid arguments - ${argError}`;
    }

    // SECURITY: Scan for suspicious patterns in arguments
    const suspiciousFindings = detectSuspiciousArgs(name, args);
    if (suspiciousFindings.length > 0) {
      log.warn(`Agent ${this.id} suspicious args detected`, { tool: name, findings: suspiciousFindings });
      this.recordAction(name, JSON.stringify(args), false, `Suspicious: ${suspiciousFindings[0]}`);
      return `Error: Action blocked - suspicious content detected`;
    }

    log.agent(this.id, `Executing: ${name}`, args);

    // API calls don't need a browser page
    if (name === 'api_call') {
      try {
        const result = await this.executeApiCall(args);
        this.recordAction(name, JSON.stringify(args), true);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.recordAction(name, JSON.stringify(args), false, errorMsg);
        return `Error: ${errorMsg}`;
      }
    }

    if (!this.page) throw new Error('No page available');

    try {
      let result: string;

      switch (name) {
        case 'navigate': {
          const navCheck = isNavigateUrlAllowed(args.url as string);
          if (!navCheck.allowed) {
            log.warn('Navigate URL blocked', { url: args.url, reason: navCheck.reason, agentId: this.id });
            result = `Navigation blocked: ${navCheck.reason}`;
            break;
          }
          await this.page.goto(args.url as string);
          result = `Navigated to ${args.url}`;
          break;
        }

        case 'click':
          await this.page.getByRole('button', { name: args.element as string })
            .or(this.page.getByRole('link', { name: args.element as string }))
            .or(this.page.getByText(args.element as string))
            .first()
            .click();
          result = `Clicked on "${args.element}"`;
          break;

        case 'type':
          const locator = this.page.getByRole('textbox', { name: args.element as string })
            .or(this.page.getByLabel(args.element as string))
            .or(this.page.locator(`input[placeholder*="${args.element}"]`))
            .first();

          if (args.clear) {
            await locator.clear();
          }
          await locator.fill(args.text as string);
          result = `Typed "${args.text}" into "${args.element}"`;
          break;

        case 'select':
          await this.page.getByRole('combobox', { name: args.element as string })
            .or(this.page.getByLabel(args.element as string))
            .first()
            .selectOption({ label: args.option as string });
          result = `Selected "${args.option}" in "${args.element}"`;
          break;

        case 'scroll':
          const amount = (args.amount as number) || 500;
          const direction = args.direction as string;
          if (direction === 'down') {
            await this.page.mouse.wheel(0, amount);
          } else if (direction === 'up') {
            await this.page.mouse.wheel(0, -amount);
          }
          result = `Scrolled ${direction} by ${amount}px`;
          break;

        case 'wait':
          if (args.condition === 'load') {
            await this.page.waitForLoadState('load');
          } else if (args.condition === 'network') {
            await this.page.waitForLoadState('networkidle');
          } else {
            await this.page.waitForSelector(args.condition as string, {
              timeout: (args.timeout as number) || 5000
            });
          }
          result = `Waited for ${args.condition}`;
          break;

        case 'submit':
          if (args.form) {
            await this.page.getByRole('button', { name: args.form as string })
              .or(this.page.locator(`button[type="submit"]`))
              .first()
              .click();
          } else {
            await this.page.locator('form').first().evaluate((form) => (form as unknown as { submit: () => void }).submit());
          }
          result = 'Form submitted';
          break;

        case 'done':
          result = 'Task marked as complete';
          break;

        default:
          // Should never reach here due to allowlist check above
          result = `Error: Unhandled tool "${name}"`;
      }

      this.recordAction(name, JSON.stringify(args), true);
      return result;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.recordAction(name, JSON.stringify(args), false, errorMsg);
      return `Error: ${errorMsg}`;
    }
  }

  // Record an action
  private recordAction(type: string, target: string, success: boolean, error?: string): void {
    const action: AgentAction = {
      timestamp: Date.now(),
      agentId: this.id,
      type: type as AgentAction['type'],
      target,
      success,
      metadata: error ? { error } : undefined
    };

    this.actions.push(action);
    this.state.actionCount = this.actions.length;
    this.state.currentAction = `${type}: ${target.slice(0, 50)}`;
    this.state.browserUrl = this.page?.url();

    this.emitAction(type, target, success, error);
  }

  // Emit state update event
  private emitStateUpdate(): void {
    eventBus.emit('agent:state', createStreamEvent(
      'agent:state',
      this.competitionId,
      this.state,
      this.eventId
    ));
  }

  // Emit action event
  private emitAction(type: string, target: string, success: boolean, error?: string): void {
    eventBus.emit('agent:action', createStreamEvent(
      'agent:action',
      this.competitionId,
      {
        agentId: this.id,
        type,
        target,
        success,
        error,
        timestamp: Date.now()
      },
      this.eventId
    ));
  }

  // Timeout helper
  private timeout(ms: number): Promise<null> {
    return new Promise(resolve => setTimeout(() => resolve(null), ms));
  }

  // Cleanup
  async cleanup(): Promise<void> {
    log.agent(this.id, 'Cleaning up');

    if (this.page) {
      await this.page.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }

    this.page = null;
    this.browser = null;
    this.actions = [];
    this.actionTimestamps = [];
    this.totalApiCost = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.state = this.createInitialState();
  }
}

export default AgentRunner;
