import type {
  OverlayState,
  LeaderboardEntry,
  AgentState,
  CommentaryEvent
} from '../shared/types/index.js';
import { eventBus } from '../shared/utils/events.js';
import { formatTimerDisplay } from '../shared/utils/timer.js';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('OverlayManager');

interface AgentOverlayData {
  id: string;
  name: string;
  color: string;
  avatar: string;
  status: string;
  progress: number;
  currentAction?: string;
  actionCount: number;
  elapsedTime: number;
}

// Manages all overlay data for the stream
export class OverlayManager {
  private state: OverlayState = {
    showScoreboard: true,
    showProgressBars: true,
    showAgentStatus: true,
    showTimer: true,
    showCommentary: true
  };

  private agentData: Map<string, AgentOverlayData> = new Map();
  private leaderboard: LeaderboardEntry[] = [];
  private eventTimer: number = 0;
  private eventName: string = '';
  private commentary: CommentaryEvent[] = [];
  private competitionId: string = '';

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Agent state updates
    eventBus.on('agent:state', (event) => {
      const state = event.data as AgentState;
      this.updateAgentState(state);
    });

    // Agent actions
    eventBus.on('agent:action', (event) => {
      const action = event.data as any;
      this.onAgentAction(action);
    });

    // Leaderboard updates
    eventBus.on('leaderboard:update', (event) => {
      this.leaderboard = (event.data as any).leaderboard;
    });

    // Event start/end
    eventBus.on('event:start', (event) => {
      this.eventName = (event.data as any).task?.name || 'Unknown Event';
      this.eventTimer = 0;
    });

    // Competition start
    eventBus.on('competition:start', (event) => {
      this.competitionId = event.competitionId;
    });
  }

  // Update agent state for overlay
  private updateAgentState(state: AgentState): void {
    const existing = this.agentData.get(state.id);
    if (existing) {
      existing.status = state.status;
      existing.progress = state.progress;
      existing.currentAction = state.currentAction;
      existing.actionCount = state.actionCount;
      if (state.startTime) {
        existing.elapsedTime = Date.now() - state.startTime;
      }
    }
  }

  // Handle agent action for potential commentary
  private onAgentAction(action: any): void {
    // Generate commentary for interesting actions
    if (action.type === 'error') {
      this.addCommentary({
        text: `${action.agentId} hits an error!`,
        emotion: 'tense',
        priority: 'high'
      });
    }
  }

  // Initialize agents for overlay
  initializeAgents(agents: Array<{
    id: string;
    name: string;
    color: string;
    avatar?: string;
  }>): void {
    this.agentData.clear();
    for (const agent of agents) {
      this.agentData.set(agent.id, {
        id: agent.id,
        name: agent.name,
        color: agent.color,
        avatar: agent.avatar || '🤖',
        status: 'idle',
        progress: 0,
        actionCount: 0,
        elapsedTime: 0
      });
    }
    log.info(`Overlay initialized for ${agents.length} agents`);
  }

  // Add commentary
  addCommentary(event: Omit<CommentaryEvent, 'timestamp'>): void {
    const commentary: CommentaryEvent = {
      ...event,
      timestamp: Date.now()
    };
    this.commentary.push(commentary);

    // Keep only recent commentary
    if (this.commentary.length > 10) {
      this.commentary.shift();
    }
  }

  // Get current overlay state for rendering
  getOverlayState(): {
    state: OverlayState;
    agents: AgentOverlayData[];
    leaderboard: LeaderboardEntry[];
    eventName: string;
    eventTimer: string;
    commentary: CommentaryEvent[];
  } {
    return {
      state: this.state,
      agents: Array.from(this.agentData.values()),
      leaderboard: this.leaderboard,
      eventName: this.eventName,
      eventTimer: formatTimerDisplay(this.eventTimer),
      commentary: this.commentary.slice(-5)
    };
  }

  // Toggle overlay elements
  toggleScoreboard(show?: boolean): void {
    this.state.showScoreboard = show ?? !this.state.showScoreboard;
  }

  toggleProgressBars(show?: boolean): void {
    this.state.showProgressBars = show ?? !this.state.showProgressBars;
  }

  toggleTimer(show?: boolean): void {
    this.state.showTimer = show ?? !this.state.showTimer;
  }

  toggleCommentary(show?: boolean): void {
    this.state.showCommentary = show ?? !this.state.showCommentary;
  }

  // Set announcement banner
  setAnnouncement(text: string | undefined): void {
    this.state.announcement = text;
  }

  // Highlight an agent
  highlightAgent(agentId: string | undefined): void {
    this.state.highlightedAgent = agentId;
  }

  // Update timer (call from main loop)
  updateTimer(elapsed: number): void {
    this.eventTimer = elapsed;
  }

  // Generate HTML overlay for OBS browser source
  generateOverlayHTML(): string {
    const data = this.getOverlayState();

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: transparent;
      color: white;
      overflow: hidden;
    }

    .overlay-container {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    /* Header */
    .header {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      padding: 15px 40px;
      border-radius: 10px;
      text-align: center;
    }

    .event-name {
      font-size: 24px;
      font-weight: bold;
      background: linear-gradient(90deg, #00d4ff, #7c3aed);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .timer {
      font-size: 48px;
      font-family: monospace;
      margin-top: 5px;
    }

    /* Leaderboard */
    .leaderboard {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      padding: 15px;
      border-radius: 10px;
      min-width: 250px;
    }

    .leaderboard h3 {
      font-size: 14px;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 10px;
    }

    .leaderboard-entry {
      display: flex;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .leaderboard-rank {
      width: 30px;
      font-weight: bold;
      color: #00d4ff;
    }

    .leaderboard-name {
      flex: 1;
    }

    .leaderboard-score {
      font-weight: bold;
      color: #7c3aed;
    }

    /* Agent status */
    .agent-panels {
      position: absolute;
      bottom: 20px;
      left: 20px;
      right: 20px;
      display: flex;
      gap: 20px;
      justify-content: center;
    }

    .agent-panel {
      background: rgba(0, 0, 0, 0.8);
      padding: 15px;
      border-radius: 10px;
      min-width: 200px;
      border-left: 4px solid var(--agent-color);
    }

    .agent-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .agent-avatar {
      font-size: 24px;
    }

    .agent-name {
      font-weight: bold;
    }

    .agent-status {
      font-size: 12px;
      color: #888;
    }

    .progress-bar {
      height: 6px;
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 10px;
    }

    .progress-fill {
      height: 100%;
      background: var(--agent-color);
      transition: width 0.3s ease;
    }

    .action-count {
      font-size: 12px;
      color: #888;
      margin-top: 5px;
    }

    /* Commentary */
    .commentary {
      position: absolute;
      bottom: 150px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.9);
      padding: 15px 30px;
      border-radius: 10px;
      max-width: 600px;
      text-align: center;
    }

    .commentary-text {
      font-size: 18px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="overlay-container">
    ${data.state.showTimer ? `
    <div class="header">
      <div class="event-name">${data.eventName}</div>
      <div class="timer">${data.eventTimer}</div>
    </div>
    ` : ''}

    ${data.state.showScoreboard ? `
    <div class="leaderboard">
      <h3>Leaderboard</h3>
      ${data.leaderboard.map(entry => `
        <div class="leaderboard-entry">
          <span class="leaderboard-rank">#${entry.rank}</span>
          <span class="leaderboard-name">${entry.agentName}</span>
          <span class="leaderboard-score">${entry.totalScore}</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${data.state.showAgentStatus ? `
    <div class="agent-panels">
      ${data.agents.map(agent => `
        <div class="agent-panel" style="--agent-color: ${agent.color}">
          <div class="agent-header">
            <span class="agent-avatar">${agent.avatar}</span>
            <span class="agent-name">${agent.name}</span>
          </div>
          <div class="agent-status">${agent.status} ${agent.currentAction ? `- ${agent.currentAction}` : ''}</div>
          ${data.state.showProgressBars ? `
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${agent.progress}%"></div>
          </div>
          ` : ''}
          <div class="action-count">${agent.actionCount} actions</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${data.state.showCommentary && data.commentary.length > 0 ? `
    <div class="commentary">
      <div class="commentary-text">${data.commentary[data.commentary.length - 1]?.text}</div>
    </div>
    ` : ''}
  </div>
</body>
</html>`;
  }
}

export const overlayManager = new OverlayManager();
export default OverlayManager;
