import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import type { AgentConfig, AgentState, AgentAction, TaskDefinition } from '../shared/types/index.js';
import { BaseAgentAdapter, createAgentAdapter, type PageState, type ToolCall } from './adapters/index.js';
import { PrecisionTimer, formatDuration } from '../shared/utils/timer.js';
import { eventBus, createStreamEvent } from '../shared/utils/events.js';
import { createLogger } from '../shared/utils/logger.js';
import { config } from '../shared/config.js';

const log = createLogger('AgentRunner');

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

        // Emit thinking event
        if (turnResult.thinking) {
          this.emitAction('thinking', turnResult.thinking, true);
        }

        // Execute tool calls and collect results
        const toolResults: Array<{ toolCallId: string; toolName: string; result: string; error?: string }> = [];

        for (const toolCall of turnResult.toolCalls) {
          // Check page validity before each tool call
          if (!this.isPageValid()) {
            throw new Error('Browser page was closed during tool execution');
          }

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

  // Execute an API call (no browser needed)
  private async executeApiCall(args: Record<string, unknown>): Promise<string> {
    const method = (args.method as string) || 'GET';
    const url = args.url as string;
    const body = args.body as string | undefined;

    if (!url) return 'Error: url is required';

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

  // Execute a tool call
  private async executeToolCall(toolCall: ToolCall): Promise<string> {
    const { name, arguments: args } = toolCall;
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
        case 'navigate':
          await this.page.goto(args.url as string);
          result = `Navigated to ${args.url}`;
          break;

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
          result = `Unknown tool: ${name}`;
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
    this.state = this.createInitialState();
  }
}

export default AgentRunner;
