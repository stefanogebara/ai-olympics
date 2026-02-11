import { nanoid } from 'nanoid';
import type {
  Competition,
  CompetitionEvent,
  AgentConfig,
  TaskDefinition,
  TaskResult,
  LeaderboardEntry
} from '../shared/types/index.js';
import { AgentRunner } from '../agents/runner.js';
import { sandboxManager } from './sandbox-manager.js';
import { eventBus, createStreamEvent } from '../shared/utils/events.js';
import { PrecisionTimer, formatDuration } from '../shared/utils/timer.js';
import { createLogger } from '../shared/utils/logger.js';
import { AGENT_PRESETS } from '../shared/config.js';

const log = createLogger('CompetitionController');

interface RunningAgent {
  runner: AgentRunner;
  config: AgentConfig;
  sandboxId: string;
}

export class CompetitionController {
  private competition: Competition | null = null;
  private agents: Map<string, RunningAgent> = new Map();
  private globalTimer: PrecisionTimer = new PrecisionTimer();
  private headless: boolean;

  constructor(options?: { headless?: boolean }) {
    this.headless = options?.headless ?? false;
  }

  // Create a new competition
  createCompetition(config: {
    name: string;
    description: string;
    agents: AgentConfig[];
    tasks: TaskDefinition[];
  }): Competition {
    const competitionId = `comp-${nanoid(10)}`;

    log.info(`Creating competition: ${config.name}`, { id: competitionId });

    const events: CompetitionEvent[] = config.tasks.map((task, index) => ({
      id: `event-${index + 1}`,
      task,
      status: 'pending',
      results: []
    }));

    this.competition = {
      id: competitionId,
      name: config.name,
      description: config.description,
      status: 'scheduled',
      agents: config.agents,
      events,
      currentEventIndex: 0,
      leaderboard: this.initializeLeaderboard(config.agents)
    };

    return this.competition;
  }

  // Initialize leaderboard with all agents
  private initializeLeaderboard(agents: AgentConfig[]): LeaderboardEntry[] {
    return agents.map((agent, index) => ({
      agentId: agent.id,
      agentName: agent.name,
      totalScore: 0,
      eventsWon: 0,
      eventsCompleted: 0,
      rank: index + 1
    }));
  }

  // Start the competition
  async startCompetition(): Promise<void> {
    if (!this.competition) {
      throw new Error('No competition created');
    }

    log.info(`Starting competition: ${this.competition.name}`);

    // Initialize sandboxes for all agents
    this.competition.status = 'warmup';
    this.emit('competition:start', { competition: this.competition });

    for (let i = 0; i < this.competition.agents.length; i++) {
      const agentConfig = this.competition.agents[i];

      try {
        // Use local sandbox for development
        const sandbox = await sandboxManager.createLocalSandbox(agentConfig);

        const runner = new AgentRunner(agentConfig, {
          headless: this.headless,
          recordActions: true
        });

        await runner.initialize(this.competition.id, this.competition.events[0]?.id || '');

        this.agents.set(agentConfig.id, {
          runner,
          config: agentConfig,
          sandboxId: sandbox.id
        });

        log.info(`Agent initialized: ${agentConfig.name}`, { agentId: agentConfig.id });

        // Add delay between browser launches to avoid resource contention
        if (i < this.competition.agents.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        log.error(`Failed to initialize agent: ${agentConfig.name}`, { error });
        throw error;
      }
    }

    // Start the competition
    this.competition.status = 'running';
    this.competition.actualStart = new Date();
    this.globalTimer.start();

    // Run events sequentially
    for (let i = 0; i < this.competition.events.length; i++) {
      this.competition.currentEventIndex = i;
      await this.runEvent(this.competition.events[i]);
    }

    // Competition complete
    this.competition.status = 'completed';
    this.competition.endTime = new Date();
    this.globalTimer.stop();

    this.emit('competition:end', {
      competition: this.competition,
      duration: this.globalTimer.elapsed()
    });

    log.info(`Competition completed in ${formatDuration(this.globalTimer.elapsed())}`);
  }

  // Run a single event
  private async runEvent(event: CompetitionEvent): Promise<void> {
    if (!this.competition) return;

    log.info(`Starting event: ${event.task.name}`, { eventId: event.id });

    event.status = 'running';
    event.startTime = Date.now();

    this.emit('event:start', {
      eventId: event.id,
      task: event.task
    });

    // Run all agents concurrently
    const runPromises = Array.from(this.agents.values()).map(async (agent) => {
      return this.runAgentOnTask(agent, event);
    });

    const results = await Promise.all(runPromises);
    event.results = results;

    // Determine winner and update scores
    this.processEventResults(event);

    event.status = 'completed';
    event.endTime = Date.now();

    this.emit('event:end', {
      eventId: event.id,
      results: event.results,
      leaderboard: this.competition.leaderboard
    });

    log.info(`Event completed: ${event.task.name}`);
  }

  // Run a single agent on a task
  private async runAgentOnTask(agent: RunningAgent, event: CompetitionEvent): Promise<TaskResult> {
    const { runner, config } = agent;

    try {
      const result = await runner.runTask(event.task);

      const taskResult: TaskResult = {
        agentId: config.id,
        taskId: event.task.id,
        status: result.success ? 'completed' : 'failed',
        score: this.calculateScore(event.task, result),
        completionTime: result.completionTime,
        actions: result.actions,
        output: result.result
      };

      this.emit('agent:complete', {
        agentId: config.id,
        eventId: event.id,
        result: taskResult
      });

      return taskResult;

    } catch (error) {
      log.error(`Agent failed: ${config.name}`, { error });

      return {
        agentId: config.id,
        taskId: event.task.id,
        status: 'failed',
        score: 0,
        actions: [],
        verificationDetails: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // Calculate score for a task result
  private calculateScore(task: TaskDefinition, result: {
    success: boolean;
    completionTime?: number;
    actions: unknown[];
  }): number {
    if (!result.success) return 0;

    const maxTime = task.timeLimit * 1000;
    const timeTaken = result.completionTime || maxTime;

    switch (task.scoringMethod) {
      case 'time':
        // Faster = higher score (minimum 100 points for completion, up to maxScore)
        // Score = basePoints + timeBonus
        // Completing within time limit guarantees at least 100 points
        const basePoints = 100;
        const bonusPool = task.maxScore - basePoints;
        const timeRatio = Math.max(0, 1 - timeTaken / maxTime);
        return Math.round(basePoints + bonusPool * timeRatio);

      case 'accuracy':
        // Binary: full points or nothing
        return result.success ? task.maxScore : 0;

      case 'composite':
        // 60% for completion, 40% time bonus
        const completionScore = task.maxScore * 0.6;
        const timeBonusPool = task.maxScore * 0.4;
        const timeBonusRatio = Math.max(0, 1 - timeTaken / maxTime);
        return Math.round(completionScore + timeBonusPool * timeBonusRatio);

      default:
        return result.success ? task.maxScore : 0;
    }
  }

  // Process event results and update leaderboard
  private processEventResults(event: CompetitionEvent): void {
    if (!this.competition) return;

    // Sort results by score (descending), then by time (ascending)
    const sortedResults = [...event.results].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.completionTime || Infinity) - (b.completionTime || Infinity);
    });

    // Update leaderboard
    for (const result of sortedResults) {
      const entry = this.competition.leaderboard.find(e => e.agentId === result.agentId);
      if (entry) {
        entry.totalScore += result.score;
        if (result.status === 'completed') {
          entry.eventsCompleted++;
        }
      }
    }

    // Mark winner
    if (sortedResults[0]?.score > 0) {
      const winnerEntry = this.competition.leaderboard.find(e => e.agentId === sortedResults[0].agentId);
      if (winnerEntry) {
        winnerEntry.eventsWon++;
      }
    }

    // Re-rank leaderboard
    this.competition.leaderboard.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.eventsWon !== a.eventsWon) return b.eventsWon - a.eventsWon;
      return (a.averageTime || Infinity) - (b.averageTime || Infinity);
    });

    this.competition.leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    this.emit('leaderboard:update', {
      leaderboard: this.competition.leaderboard
    });
  }

  // Emit event to the event bus
  private emit(type: string, data: unknown): void {
    if (!this.competition) return;

    eventBus.emit(type as any, createStreamEvent(
      type as any,
      this.competition.id,
      data,
      this.competition.events[this.competition.currentEventIndex]?.id
    ));
  }

  // Get current competition state
  getCompetition(): Competition | null {
    return this.competition;
  }

  // Get current leaderboard
  getLeaderboard(): LeaderboardEntry[] {
    return this.competition?.leaderboard || [];
  }

  // Pause competition
  pauseCompetition(): void {
    if (this.competition) {
      this.competition.status = 'paused';
      this.globalTimer.pause();
      log.info('Competition paused');
    }
  }

  // Resume competition
  resumeCompetition(): void {
    if (this.competition && this.competition.status === 'paused') {
      this.competition.status = 'running';
      this.globalTimer.resume();
      log.info('Competition resumed');
    }
  }

  // Cancel competition
  async cancelCompetition(): Promise<void> {
    if (this.competition) {
      this.competition.status = 'cancelled';
      this.globalTimer.stop();

      // Cleanup agents
      for (const agent of this.agents.values()) {
        await agent.runner.cleanup();
        await sandboxManager.stopSandbox(agent.sandboxId);
      }

      this.agents.clear();
      log.info('Competition cancelled');
    }
  }

  // Cleanup
  async cleanup(): Promise<void> {
    log.info('Cleaning up competition controller');

    for (const agent of this.agents.values()) {
      await agent.runner.cleanup().catch(() => {});
    }

    this.agents.clear();
    await sandboxManager.cleanup();
  }
}

// Factory function to create a quick competition
export async function createQuickCompetition(options: {
  name?: string;
  agents?: AgentConfig[];
  tasks: TaskDefinition[];
  headless?: boolean;
}): Promise<CompetitionController> {
  const controller = new CompetitionController({ headless: options.headless });

  // Default agents if not provided
  const agents = options.agents || [
    AGENT_PRESETS.claude,
    AGENT_PRESETS['gpt-4'],
    AGENT_PRESETS.gemini
  ].filter(Boolean);

  controller.createCompetition({
    name: options.name || 'AI Olympics Quick Match',
    description: 'A quick competition between AI agents',
    agents,
    tasks: options.tasks
  });

  return controller;
}

export default CompetitionController;
