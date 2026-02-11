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
  personaName?: string;
  personaDescription?: string;
  personaStyle?: 'formal' | 'casual' | 'technical' | 'dramatic' | 'minimal';
  strategy?: 'aggressive' | 'cautious' | 'balanced' | 'creative' | 'analytical';
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
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'wait' | 'screenshot' | 'submit' | 'error' | 'thinking' | 'select' | 'done';
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
  | 'competition:create'
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
  | 'overlay:update'
  // Tournament events
  | 'tournament:start'
  | 'tournament:end'
  | 'round:start'
  | 'round:end'
  | 'match:end'
  | 'bracket:update'
  | 'elimination:announce'
  | 'vote:update';

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
// PREDICTION MARKET TYPES (Internal Markets)
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
// MANIFOLD MARKET TYPES (External - Sandbox Mode)
// ============================================================================

export interface ManifoldMarket {
  id: string;
  question: string;
  probability?: number;
  pool: Record<string, number>;
  volume: number;
  outcomeType: 'BINARY' | 'MULTIPLE_CHOICE' | 'FREE_RESPONSE' | 'NUMERIC' | 'PSEUDO_NUMERIC';
  answers?: ManifoldAnswer[];
  closeTime?: number;
  url: string;
  creatorUsername: string;
  isResolved: boolean;
  resolution?: string;
}

export interface ManifoldAnswer {
  id: string;
  text: string;
  probability?: number;
}

// ============================================================================
// VIRTUAL PORTFOLIO TYPES (Sandbox Mode)
// ============================================================================

export interface VirtualPortfolio {
  id: string;
  agentId: string;
  competitionId: string;
  startingBalance: number;
  currentBalance: number;
  positions: VirtualPosition[];
  totalProfit: number;
}

export interface VirtualPosition {
  marketId: string;
  marketQuestion: string;
  outcome: string;
  shares: number;
  averageCost: number;
  currentValue: number;
  unrealizedPnL: number;
}

export interface VirtualBet {
  id: string;
  portfolioId: string;
  marketId: string;
  marketQuestion: string;
  outcome: string;
  amount: number;
  shares: number;
  probabilityAtBet: number;
  timestamp: number;
  resolved: boolean;
  payout?: number;
  resolution?: string;
}

// ============================================================================
// PREDICTION COMPETITION TYPES
// ============================================================================

export interface PredictionCompetitionConfig {
  startingBalance: number;
  maxBetSize: number;
  allowedMarketTypes: ('BINARY' | 'MULTIPLE_CHOICE')[];
  marketIds?: string[];  // Specific markets to use (optional)
  marketQuery?: string;  // Search query to find markets (optional)
}

// ============================================================================
// TOURNAMENT TYPES
// ============================================================================

export type BracketType = 'single-elimination' | 'round-robin' | 'swiss';

export type TournamentStatus = 'pending' | 'running' | 'completed' | 'cancelled';

export interface TournamentConfig {
  name: string;
  bracketType: BracketType;
  agents: AgentConfig[];
  taskIds: string[];  // Tasks to use in matches
  roundsPerMatch?: number;  // For Swiss: number of rounds
  bestOf?: number;  // For elimination: best of N matches
}

export interface Tournament {
  id: string;
  name: string;
  bracketType: BracketType;
  status: TournamentStatus;
  agents: AgentConfig[];
  taskIds: string[];
  seeds: TournamentSeed[];
  rounds: TournamentRound[];
  currentRoundIndex: number;
  bracket: BracketNode[];
  finalStandings: TournamentStanding[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface TournamentSeed {
  agentId: string;
  seedNumber: number;
  initialRating?: number;
}

export interface TournamentRound {
  id: string;
  roundNumber: number;
  name: string;  // e.g., "Quarterfinals", "Round 3"
  status: 'pending' | 'running' | 'completed';
  matches: TournamentMatch[];
  advancingAgentIds: string[];
  eliminatedAgentIds: string[];
  startedAt?: number;
  completedAt?: number;
}

export interface TournamentMatch {
  id: string;
  roundId: string;
  matchNumber: number;
  agentIds: string[];  // 2 agents typically
  competitionId?: string;  // Reference to the actual competition run
  results: TournamentMatchResult[];
  winnerId?: string;
  loserId?: string;
  status: 'pending' | 'running' | 'completed' | 'bye';
  isBye: boolean;  // True if one agent got a bye
  startedAt?: number;
  completedAt?: number;
}

export interface TournamentMatchResult {
  agentId: string;
  score: number;
  tasksWon: number;
  tasksPlayed: number;
}

export interface BracketNode {
  id: string;
  roundNumber: number;
  position: number;  // Position in the round (0, 1, 2, ...)
  matchId?: string;
  agentIds: string[];
  winnerId?: string;
  parentNodes: string[];  // IDs of nodes that feed into this one
  childNode?: string;  // ID of next round node
}

export interface TournamentStanding {
  agentId: string;
  agentName: string;
  rank: number;
  matchesWon: number;
  matchesLost: number;
  matchesTied: number;
  totalScore: number;
  roundEliminated?: number;  // For elimination tournaments
  swissPoints?: number;  // For Swiss tournaments
  tiebreaker?: number;  // Buchholz or similar
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
