import Anthropic from '@anthropic-ai/sdk';
import type { AgentAction, AgentState, CommentaryEvent } from '../shared/types/index.js';
import { config } from '../shared/config.js';
import { eventBus } from '../shared/utils/events.js';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('Commentary');

interface CommentaryContext {
  eventName: string;
  agents: Array<{
    id: string;
    name: string;
    personaName?: string;
    personaStyle?: string;
    status: string;
    progress: number;
    actionCount: number;
  }>;
  recentActions: AgentAction[];
  elapsedTime: number;
}

export class AICommentator {
  private client: Anthropic | null = null;
  private context: CommentaryContext = {
    eventName: '',
    agents: [],
    recentActions: [],
    elapsedTime: 0
  };
  private lastCommentary = 0;
  private commentaryInterval = 5000;  // Generate commentary every 5 seconds
  private enabled = false;

  constructor() {
    if (config.anthropicApiKey) {
      this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    }
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    eventBus.on('event:start', (event) => {
      this.context.eventName = (event.data as any).task?.name || 'Unknown Event';
      this.context.agents = [];
      this.context.recentActions = [];
      this.generateOpeningCommentary();
    });

    eventBus.on('agent:state', (event) => {
      const state = event.data as AgentState;
      this.updateAgentContext(state);
    });

    eventBus.on('agent:action', (event) => {
      const action = event.data as AgentAction;
      this.context.recentActions.push(action);
      // Keep only last 10 actions
      if (this.context.recentActions.length > 10) {
        this.context.recentActions.shift();
      }
      this.maybeGenerateCommentary();
    });

    eventBus.on('agent:complete', (event) => {
      this.generateCompletionCommentary((event.data as any).agentId);
    });

    eventBus.on('event:end', () => {
      this.generateClosingCommentary();
    });
  }

  private updateAgentContext(state: AgentState): void {
    const index = this.context.agents.findIndex(a => a.id === state.id);
    const agentData = {
      id: state.id,
      name: state.id,  // Will be updated with proper name from config
      status: state.status,
      progress: state.progress,
      actionCount: state.actionCount
    };

    if (index >= 0) {
      this.context.agents[index] = agentData;
    } else {
      this.context.agents.push(agentData);
    }
  }

  // Enable/disable commentary
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.info(`AI Commentary ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Generate commentary if enough time has passed
  private maybeGenerateCommentary(): void {
    if (!this.enabled || !this.client) return;

    const now = Date.now();
    if (now - this.lastCommentary < this.commentaryInterval) return;

    // Check for interesting events
    const recentErrors = this.context.recentActions.filter(a =>
      !a.success && Date.now() - a.timestamp < 3000
    );

    const _recentCompletions = this.context.agents.filter(a =>
      a.status === 'completed'
    );

    // Generate commentary for interesting moments
    if (recentErrors.length > 0) {
      this.generateErrorCommentary(recentErrors[0]);
    } else if (this.hasCloseRace()) {
      this.generateRaceCommentary();
    }

    this.lastCommentary = now;
  }

  private hasCloseRace(): boolean {
    const runningAgents = this.context.agents.filter(a =>
      a.status === 'running' && a.progress > 30
    );

    if (runningAgents.length < 2) return false;

    const progresses = runningAgents.map(a => a.progress);
    const maxDiff = Math.max(...progresses) - Math.min(...progresses);

    return maxDiff < 15;  // Close race if within 15% progress
  }

  // Generate opening commentary
  private async generateOpeningCommentary(): Promise<void> {
    if (!this.enabled || !this.client) return;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `You are an enthusiastic AI Olympics commentator. Generate a SHORT (1-2 sentences) exciting opening line for the "${this.context.eventName}" event. Be energetic and build anticipation!`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      this.emitCommentary(text, 'excited', 'high');

    } catch (error) {
      log.error('Failed to generate opening commentary', { error });
    }
  }

  // Generate error commentary
  private async generateErrorCommentary(action: AgentAction): Promise<void> {
    if (!this.enabled || !this.client) return;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `You are an AI Olympics commentator. Agent "${action.agentId}" just hit an error while trying to "${action.type}". Generate a SHORT (1 sentence) dramatic reaction. Don't be mean, but acknowledge the setback.`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      this.emitCommentary(text, 'tense', 'high');

    } catch (error) {
      log.error('Failed to generate error commentary', { error });
    }
  }

  // Generate race commentary when agents are close
  private async generateRaceCommentary(): Promise<void> {
    if (!this.enabled || !this.client) return;

    const leaders = this.context.agents
      .filter(a => a.status === 'running')
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 2)
      .map(a => a.personaName || a.name);

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `You are an AI Olympics commentator. ${leaders.join(' and ')} are neck and neck in the "${this.context.eventName}"! Generate a SHORT (1 sentence) exciting race commentary.`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      this.emitCommentary(text, 'excited', 'medium');

    } catch (error) {
      log.error('Failed to generate race commentary', { error });
    }
  }

  // Generate completion commentary
  private async generateCompletionCommentary(agentId: string): Promise<void> {
    if (!this.enabled || !this.client) return;

    const agent = this.context.agents.find(a => a.id === agentId);
    const displayName = agent?.personaName || agent?.name || agentId;
    const isFirst = this.context.agents.filter(a => a.status === 'completed').length === 1;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `You are an AI Olympics commentator. ${displayName} just ${isFirst ? 'FINISHED FIRST' : 'completed'} the "${this.context.eventName}"! Generate a SHORT (1 sentence) ${isFirst ? 'celebratory' : 'acknowledging'} reaction.`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      this.emitCommentary(text, isFirst ? 'celebratory' : 'neutral', isFirst ? 'critical' : 'medium');

    } catch (error) {
      log.error('Failed to generate completion commentary', { error });
    }
  }

  // Generate closing commentary
  private async generateClosingCommentary(): Promise<void> {
    if (!this.enabled || !this.client) return;

    const winner = this.context.agents
      .filter(a => a.status === 'completed')
      .sort((a, b) => a.actionCount - b.actionCount)[0];
    const winnerName = winner ? (winner.personaName || winner.name) : null;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `You are an AI Olympics commentator. The "${this.context.eventName}" has concluded! ${winnerName ? `${winnerName} wins!` : 'What an event!'} Generate a SHORT (1-2 sentences) wrap-up commentary.`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      this.emitCommentary(text, 'celebratory', 'critical');

    } catch (error) {
      log.error('Failed to generate closing commentary', { error });
    }
  }

  private emitCommentary(
    text: string,
    emotion: CommentaryEvent['emotion'],
    priority: CommentaryEvent['priority']
  ): void {
    const event: CommentaryEvent = {
      timestamp: Date.now(),
      text: text.trim(),
      emotion,
      priority
    };

    eventBus.emit('commentary:update', {
      type: 'commentary:update',
      timestamp: Date.now(),
      competitionId: '',
      data: event
    });

    log.info(`Commentary: ${text.slice(0, 60)}...`);
  }
}

export const commentator = new AICommentator();
export default AICommentator;
