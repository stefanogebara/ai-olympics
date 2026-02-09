import { create } from 'zustand';

// Types
interface AgentState {
  id: string;
  name: string;
  status: 'idle' | 'initializing' | 'running' | 'completed' | 'failed' | 'timeout';
  progress: number;
  score: number;
  actionCount: number;
  currentAction?: string;
  color: string;
}

interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  totalScore: number;
  eventsWon: number;
  eventsCompleted: number;
  rank: number;
}

interface ActionEvent {
  id: string;
  timestamp: number;
  agentId: string;
  type: string;
  target?: string;
  success: boolean;
}

interface CommentaryEvent {
  id: string;
  timestamp: number;
  text: string;
  emotion: 'neutral' | 'excited' | 'tense' | 'celebratory' | 'disappointed';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface CompetitionState {
  // Competition info
  competitionId: string | null;
  competitionName: string;
  status: 'idle' | 'warmup' | 'running' | 'paused' | 'completed';
  currentEventName: string;
  elapsedTime: number;

  // Agents
  agents: Record<string, AgentState>;

  // Leaderboard
  leaderboard: LeaderboardEntry[];

  // Action feed
  actions: ActionEvent[];

  // Commentary
  commentary: CommentaryEvent[];

  // UI state
  isConnected: boolean;

  // Actions
  setCompetition: (id: string, name: string) => void;
  setStatus: (status: CompetitionState['status']) => void;
  setCurrentEvent: (name: string) => void;
  setElapsedTime: (time: number) => void;
  updateAgent: (agentId: string, update: Partial<AgentState>) => void;
  setLeaderboard: (entries: LeaderboardEntry[]) => void;
  addAction: (action: Omit<ActionEvent, 'id'>) => void;
  addCommentary: (commentary: Omit<CommentaryEvent, 'id'>) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

const initialState = {
  competitionId: null,
  competitionName: '',
  status: 'idle' as const,
  currentEventName: '',
  elapsedTime: 0,
  agents: {},
  leaderboard: [],
  actions: [],
  commentary: [],
  isConnected: false,
};

export const useStore = create<CompetitionState>((set) => ({
  ...initialState,

  setCompetition: (id, name) => set({ competitionId: id, competitionName: name }),

  setStatus: (status) => set({ status }),

  setCurrentEvent: (name) => set({ currentEventName: name }),

  setElapsedTime: (time) => set({ elapsedTime: time }),

  updateAgent: (agentId, update) =>
    set((state) => ({
      agents: {
        ...state.agents,
        [agentId]: {
          ...state.agents[agentId],
          ...update,
        },
      },
    })),

  setLeaderboard: (entries) => set({ leaderboard: entries }),

  addAction: (action) =>
    set((state) => ({
      actions: [
        { ...action, id: `action-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        ...state.actions,
      ].slice(0, 50), // Keep last 50 actions
    })),

  addCommentary: (commentary) =>
    set((state) => ({
      commentary: [
        { ...commentary, id: `comment-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        ...state.commentary,
      ].slice(0, 20), // Keep last 20 comments
    })),

  setConnected: (connected) => set({ isConnected: connected }),

  reset: () => set(initialState),
}));
