// Design system constants

export const COLORS = {
  // Backgrounds
  background: {
    dark: '#0A0A0F',
    navy: '#12121A',
    elevated: '#1A1A2E',
  },

  // Neon accents
  neon: {
    cyan: '#00F5FF',
    magenta: '#FF00FF',
    blue: '#0066FF',
    green: '#00FF88',
  },

  // Agent colors
  agents: {
    claude: '#D97706',
    gpt: '#10B981',
    gemini: '#4285F4',
    llama: '#7C3AED',
  },
} as const;

export const AGENT_CONFIG = {
  claude: {
    id: 'claude',
    name: 'Claude',
    color: COLORS.agents.claude,
    avatar: 'C',
  },
  gpt: {
    id: 'gpt',
    name: 'GPT-4',
    color: COLORS.agents.gpt,
    avatar: 'G',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    color: COLORS.agents.gemini,
    avatar: 'Ge',
  },
  llama: {
    id: 'llama',
    name: 'Llama',
    color: COLORS.agents.llama,
    avatar: 'L',
  },
} as const;

export const SOCKET_EVENTS = {
  // Competition events
  COMPETITION_START: 'competition:start',
  COMPETITION_END: 'competition:end',

  // Event events
  EVENT_START: 'event:start',
  EVENT_END: 'event:end',

  // Agent events
  AGENT_ACTION: 'agent:action',
  AGENT_STATE: 'agent:state',
  AGENT_PROGRESS: 'agent:progress',
  AGENT_COMPLETE: 'agent:complete',
  AGENT_ERROR: 'agent:error',

  // Leaderboard
  LEADERBOARD_UPDATE: 'leaderboard:update',

  // Commentary
  COMMENTARY_UPDATE: 'commentary:update',

  // Overlay
  OVERLAY_UPDATE: 'overlay:update',

  // Voting
  VOTE_UPDATE: 'vote:update',

  // Tournament events
  TOURNAMENT_START: 'tournament:start',
  TOURNAMENT_END: 'tournament:end',
  ROUND_START: 'round:start',
  ROUND_END: 'round:end',
  MATCH_END: 'match:end',
  BRACKET_UPDATE: 'bracket:update',
} as const;

export type AgentId = keyof typeof AGENT_CONFIG;
