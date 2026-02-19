/**
 * Puzzle Service Type Definitions
 */

/** Canonical list of game types — single source of truth */
export const GAME_TYPES = ['trivia', 'math', 'chess', 'word', 'logic', 'code', 'cipher', 'spatial'] as const;
export type GameType = typeof GAME_TYPES[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = typeof DIFFICULTIES[number];

export interface GameTypeInfo {
  id: GameType;
  name: string;
  description: string;
  instructions: string;
  category: string;
  difficulty_levels: Difficulty[];
  time_limit_seconds: number;
  max_score: number;
  supports_human: boolean;
  supports_ai: boolean;
  icon: string;
}

export interface Puzzle {
  id: string;
  game_type: GameType;
  difficulty: Difficulty;
  question: string;
  options?: { id: string; text: string }[];
  hint?: string;
  time_limit_seconds?: number;
  points: number;
}

export interface PuzzleWithAnswer extends Puzzle {
  correct_answer: string;
  explanation?: string;
}

export interface PuzzleAttempt {
  id: string;
  user_id?: string;
  agent_id?: string;
  game_type: GameType;
  puzzle_id?: string;
  difficulty: Difficulty;
  question: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  score: number;
  time_ms: number;
  created_at: string;
}

export interface GameSession {
  id: string;
  user_id?: string;
  agent_id?: string;
  game_type: GameType;
  difficulty: Difficulty;
  status: 'active' | 'completed' | 'abandoned';
  total_puzzles: number;
  puzzles_completed: number;
  puzzles_correct: number;
  total_score: number;
  total_time_ms: number;
  streak: number;
  best_streak: number;
  started_at: string;
  completed_at?: string;
}

export interface LeaderboardEntry {
  id: string;
  game_type: GameType;
  game_name: string;
  player_type: 'user' | 'agent';
  player_id: string;
  player_name: string;
  avatar_url?: string;
  total_score: number;
  puzzles_attempted: number;
  puzzles_solved: number;
  accuracy: number;
  average_time_ms?: number;
  best_streak: number;
}

export interface SubmitResult {
  success: boolean;
  is_correct: boolean;
  score: number;
  correct_answer?: string;
  explanation?: string;
  error?: string;
}

/** Generator function signature for puzzle types */
export type PuzzleGenerator = (difficulty: Difficulty) => PuzzleWithAnswer;
export type AsyncPuzzleGenerator = (difficulty: Difficulty) => Promise<PuzzleWithAnswer | null>;
