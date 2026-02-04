import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import type { AgentConfig, AgentState, AgentAction, TaskDefinition } from '../shared/types/index.js';
import { BaseAgentAdapter, createAgentAdapter, type PageState, type ToolCall } from './adapters/index.js';
import { PrecisionTimer, formatDuration } from '../shared/utils/timer.js';
import { eventBus, createStreamEvent } from '../shared/utils/events.js';
import { createLogger } from '../shared/utils/logger.js';

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

    this.browser = await chromium.launch({
      headless: this.runnerConfig.headless,
      args: ['--start-maximized']
    });

    const context = await this.browser.newContext({
      viewport: this.runnerConfig.viewport,
      recordVideo: this.runnerConfig.recordActions ? {
        dir: `./recordings/${this.competitionId}/${this.eventId}`,
        size: this.runnerConfig.viewport
      } : undefined
    });

    this.page = await context.newPage();

    log.agent(this.id, 'Browser initialized');
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

    // Initialize the adapter with task prompts
    this.adapter.initialize(task.systemPrompt, task.taskPrompt);

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

        // Execute tool calls
        for (const toolCall of turnResult.toolCalls) {
          const result = await this.executeToolCall(toolCall);

          // Check for task timeout
          if (this.timer.elapsedSeconds() > task.timeLimit) {
            this.state.status = 'timeout';
            error = 'Task time limit exceeded';
            break;
          }
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

  // Get the current page state for the agent
  private async getPageState(): Promise<PageState> {
    if (!this.page) throw new Error('No page available');

    const url = this.page.url();
    const title = await this.page.title();

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

    // Get interactive elements using accessibility snapshot
    const snapshot = await this.page.accessibility.snapshot();
    if (!snapshot) return 'No accessibility information available';

    // Format the tree for the agent
    const formatNode = (node: any, depth: number = 0): string => {
      const indent = '  '.repeat(depth);
      let result = '';

      if (node.role && node.role !== 'none') {
        const name = node.name ? ` "${node.name}"` : '';
        const value = node.value ? ` value="${node.value}"` : '';
        const checked = node.checked !== undefined ? ` checked=${node.checked}` : '';
        const selected = node.selected !== undefined ? ` selected=${node.selected}` : '';
        const disabled = node.disabled ? ' disabled' : '';
        const focused = node.focused ? ' (focused)' : '';

        result += `${indent}[${node.role}]${name}${value}${checked}${selected}${disabled}${focused}\n`;
      }

      if (node.children) {
        for (const child of node.children) {
          result += formatNode(child, depth + 1);
        }
      }

      return result;
    };

    return formatNode(snapshot);
  }

  // Execute a tool call
  private async executeToolCall(toolCall: ToolCall): Promise<string> {
    if (!this.page) throw new Error('No page available');

    const { name, arguments: args } = toolCall;
    log.agent(this.id, `Executing: ${name}`, args);

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
            await this.page.locator('form').first().evaluate((form: HTMLFormElement) => form.submit());
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
