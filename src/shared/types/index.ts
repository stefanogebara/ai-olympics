// AI Olympics - Core Type Definitions

// ============================================================================
// AGENT TYPES
// ============================================================================

export type AgentProvider = 'claude' | 'openai' | 'gemini' | 'llama' | 'mistral';

export interface AgentConfig {
  id: string;
  name: string;
  provider: AgentProvider;
  model: string;
  color: string;  // For UI display
  avatar?: string;
  apiKey?: string;  // Optional override
}

export interface AgentState {
  id: string;
  status: 'idle' | 'initializing' | 'running' | 'completed' | 'failed' | 'timeout';
  currentAction?: string;
  progress: number;  // 0-100
  startTime?: number;
  endTime?: number;
  score?: number;
  error?: string;
  actionCount: number;
  browserUrl?: string;
}

export interface AgentAction {
  timestamp: number;
  agentId: string;
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'wait' | 'screenshot' | 'submit' | 'error' | 'thinking';
  target?: string;
  value?: string;
  duration?: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// TASK/EVENT TYPES
// ============================================================================

export type TaskCategory = 'speed' | 'intelligence' | 'creative';

export interface TaskDefinition {
  id: string;
  name: string;
  description: string;
  category: TaskCategory;
  difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  timeLimit: number;  // seconds
  maxAgents: number;

  // Task-specific configuration
  config: Record<string, unknown>;

  // Scoring
  scoringMethod: 'time' | 'accuracy' | 'composite' | 'judged';
  maxScore: number;

  // URLs and resources
  startUrl?: string;
  targetUrl?: string;

  // Instructions shown to agents
  systemPrompt: string;
  taskPrompt: string;
}

export interface TaskResult {
  agentId: string;
  taskId: string;
  status: 'completed' | 'failed' | 'timeout' | 'disqualified';
  score: number;
  completionTime?: number;  // milliseconds
  accuracy?: number;  // 0-1
  actions: AgentAction[];
  output?: unknown;
  verificationDetails?: Record<string, unknown>;
}

// ============================================================================
// COMPETITION TYPES
// ============================================================================

export type CompetitionStatus = 'scheduled' | 'warmup' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface Competition {
  id: string;
  name: string;
  description: string;
  status: CompetitionStatus;

  // Participants
  agents: AgentConfig[];

  // Events
  events: CompetitionEvent[];
  currentEventIndex: number;

  // Timing
  scheduledStart?: Date;
  actualStart?: Date;
  endTime?: Date;

  // Results
  leaderboard: LeaderboardEntry[];
}

export interface CompetitionEvent {
  id: string;
  task: TaskDefinition;
  status: 'pending' | 'running' | 'completed';
  results: TaskResult[];
  startTime?: number;
  endTime?: number;
}

export interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  totalScore: number;
  eventsWon: number;
  eventsCompleted: number;
  averageTime?: number;
  rank: number;
}

// ============================================================================
// STREAMING/BROADCAST TYPES
// ============================================================================

export type StreamEventType =
  | 'competition:start'
  | 'competition:end'
  | 'event:start'
  | 'event:end'
  | 'agent:action'
  | 'agent:state'
  | 'agent:progress'
  | 'agent:complete'
  | 'agent:error'
  | 'leaderboard:update'
  | 'commentary:update'
  | 'overlay:update';

export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  competitionId: string;
  eventId?: string;
  data: unknown;
}

export interface CommentaryEvent {
  timestamp: number;
  text: string;
  audioUrl?: string;
  emotion: 'neutral' | 'excited' | 'tense' | 'celebratory' | 'disappointed';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface OverlayState {
  showScoreboard: boolean;
  showProgressBars: boolean;
  showAgentStatus: boolean;
  showTimer: boolean;
  showCommentary: boolean;
  highlightedAgent?: string;
  announcement?: string;
}

// ============================================================================
// SANDBOX TYPES
// ============================================================================

export interface SandboxConfig {
  id: string;
  agentId: string;

  // Resource limits
  cpuLimit: number;  // cores
  memoryLimit: number;  // MB
  timeLimit: number;  // seconds

  // Network
  allowedDomains: string[];
  blockedDomains: string[];

  // Browser
  headless: boolean;
  viewport: { width: number; height: number };

  // Recording
  recordScreen: boolean;
  recordActions: boolean;
}

export interface SandboxState {
  id: string;
  status: 'creating' | 'ready' | 'running' | 'stopping' | 'stopped' | 'error';
  containerId?: string;
  browserEndpoint?: string;
  createdAt: number;
  error?: string;
}

// ============================================================================
// PREDICTION MARKET TYPES
// ============================================================================

export interface MarketContract {
  id: string;
  competitionId: string;
  eventId?: string;
  question: string;
  outcomes: MarketOutcome[];
  status: 'open' | 'closed' | 'resolved';
  resolvedOutcome?: string;
  totalVolume: number;
  createdAt: Date;
  closesAt: Date;
}

export interface MarketOutcome {
  id: string;
  label: string;
  probability: number;  // 0-1
  volume: number;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
