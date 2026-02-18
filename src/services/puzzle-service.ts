/**
 * Puzzle Service
 * Manages puzzles from external APIs (Open Trivia DB, Lichess) and local generation
 * Handles game sessions and scoring
 */

import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('PuzzleService');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type GameType = 'trivia' | 'math' | 'chess' | 'word' | 'logic';
export type Difficulty = 'easy' | 'medium' | 'hard';

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

// ============================================================================
// EXTERNAL API CLIENTS
// ============================================================================

// Open Trivia DB API
interface OpenTriviaQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

async function fetchTriviaQuestions(difficulty: Difficulty, amount: number = 10): Promise<PuzzleWithAnswer[]> {
  try {
    const difficultyMap: Record<Difficulty, string> = {
      easy: 'easy',
      medium: 'medium',
      hard: 'hard'
    };

    const response = await fetch(
      `https://opentdb.com/api.php?amount=${amount}&difficulty=${difficultyMap[difficulty]}&type=multiple`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch trivia questions');
    }

    const data = await response.json();

    if (data.response_code !== 0) {
      throw new Error('Open Trivia DB returned error');
    }

    return data.results.map((q: OpenTriviaQuestion, index: number) => {
      // Shuffle answers
      const allAnswers = [q.correct_answer, ...q.incorrect_answers];
      const shuffled = allAnswers.sort(() => Math.random() - 0.5);

      return {
        id: `trivia-${Date.now()}-${index}`,
        game_type: 'trivia' as GameType,
        difficulty,
        question: decodeHtml(q.question),
        options: shuffled.map((ans, i) => ({
          id: String.fromCharCode(65 + i), // A, B, C, D
          text: decodeHtml(ans)
        })),
        correct_answer: String.fromCharCode(65 + shuffled.indexOf(q.correct_answer)),
        points: difficulty === 'easy' ? 50 : difficulty === 'medium' ? 100 : 150,
        time_limit_seconds: 30
      };
    });
  } catch (error) {
    log.error('Error fetching trivia questions', { error: String(error) });
    return [];
  }
}

// Decode HTML entities from Open Trivia DB
function decodeHtml(html: string): string {
  const txt = html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return txt;
}

// ============================================================================
// LOCAL PUZZLE GENERATORS
// ============================================================================

function generateMathPuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  let question: string;
  let answer: number;
  let points: number;

  switch (difficulty) {
    case 'easy':
      // Simple arithmetic
      const a = Math.floor(Math.random() * 50) + 1;
      const b = Math.floor(Math.random() * 50) + 1;
      const ops = ['+', '-', '*'];
      const op = ops[Math.floor(Math.random() * ops.length)];
      question = `What is ${a} ${op} ${b}?`;
      answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
      points = 50;
      break;

    case 'medium':
      // Multi-step or larger numbers
      const c = Math.floor(Math.random() * 100) + 50;
      const d = Math.floor(Math.random() * 30) + 10;
      const e = Math.floor(Math.random() * 10) + 2;
      question = `What is (${c} + ${d}) * ${e}?`;
      answer = (c + d) * e;
      points = 100;
      break;

    case 'hard':
      // Exponents, fractions, or word problems
      const base = Math.floor(Math.random() * 10) + 2;
      const exp = Math.floor(Math.random() * 3) + 2;
      const sub = Math.floor(Math.random() * 50);
      question = `What is ${base}^${exp} - ${sub}?`;
      answer = Math.pow(base, exp) - sub;
      points = 150;
      break;
  }

  return {
    id: `math-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    game_type: 'math',
    difficulty,
    question: question!,
    correct_answer: String(answer!),
    points: points!,
    time_limit_seconds: difficulty === 'easy' ? 30 : difficulty === 'medium' ? 60 : 90
  };
}

function generateWordPuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  // Word lists by difficulty
  const easyWords = ['APPLE', 'HOUSE', 'WATER', 'MUSIC', 'PAPER', 'LIGHT', 'HAPPY', 'BEACH'];
  const mediumWords = ['CRYSTAL', 'THUNDER', 'MYSTERY', 'FANTASY', 'BALANCE', 'HARMONY', 'JOURNEY'];
  const hardWords = ['SYMPHONY', 'ELOQUENT', 'PARADIGM', 'ALGORITHM', 'CRYPTOGRAPHY', 'DICHOTOMY'];

  const wordList = difficulty === 'easy' ? easyWords : difficulty === 'medium' ? mediumWords : hardWords;
  const word = wordList[Math.floor(Math.random() * wordList.length)];

  // Scramble the word
  const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');

  return {
    id: `word-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    game_type: 'word',
    difficulty,
    question: `Unscramble this word: ${scrambled}`,
    correct_answer: word,
    hint: `The word has ${word.length} letters and starts with ${word[0]}`,
    points: difficulty === 'easy' ? 50 : difficulty === 'medium' ? 100 : 150,
    time_limit_seconds: difficulty === 'easy' ? 30 : difficulty === 'medium' ? 45 : 60
  };
}

function generateLogicPuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  // Pattern-based logic puzzles
  const puzzles: PuzzleWithAnswer[] = [];

  if (difficulty === 'easy') {
    // Number sequence
    const start = Math.floor(Math.random() * 10);
    const step = Math.floor(Math.random() * 5) + 2;
    const seq = [start, start + step, start + 2 * step, start + 3 * step];
    puzzles.push({
      id: `logic-${Date.now()}`,
      game_type: 'logic',
      difficulty,
      question: `What comes next in this sequence? ${seq.join(', ')}, ?`,
      correct_answer: String(start + 4 * step),
      explanation: `Each number increases by ${step}`,
      points: 50,
      time_limit_seconds: 45
    });
  } else if (difficulty === 'medium') {
    // Fibonacci-like or alternating patterns
    const a = Math.floor(Math.random() * 5) + 1;
    const b = Math.floor(Math.random() * 5) + 1;
    const seq = [a, b, a + b, b + a + b, a + b + b + a + b];
    puzzles.push({
      id: `logic-${Date.now()}`,
      game_type: 'logic',
      difficulty,
      question: `What comes next? ${seq.join(', ')}, ?`,
      correct_answer: String(seq[3] + seq[4]),
      explanation: 'Each number is the sum of the previous two',
      points: 100,
      time_limit_seconds: 60
    });
  } else {
    // More complex pattern
    const base = Math.floor(Math.random() * 5) + 2;
    const seq = [1, base, base * base, base * base * base];
    puzzles.push({
      id: `logic-${Date.now()}`,
      game_type: 'logic',
      difficulty,
      question: `What comes next? ${seq.join(', ')}, ?`,
      correct_answer: String(base * base * base * base),
      explanation: `Each number is a power of ${base}: ${base}^0, ${base}^1, ${base}^2, ${base}^3, ${base}^4`,
      points: 150,
      time_limit_seconds: 90
    });
  }

  return puzzles[Math.floor(Math.random() * puzzles.length)];
}

// ============================================================================
// PUZZLE SERVICE CLASS
// ============================================================================

export class PuzzleService {
  private initialized = false;

  constructor() {
    this.initialized = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
    if (!this.initialized) {
      log.warn('Supabase not configured, puzzle service will use in-memory fallback');
    }
  }

  /**
   * Get available game types
   */
  async getGameTypes(): Promise<GameTypeInfo[]> {
    if (this.initialized) {
      try {
        const { data, error } = await supabase
          .from('aio_game_types')
          .select('*')
          .order('name');

        if (!error && data) {
          return data as GameTypeInfo[];
        }
      } catch (error) {
        log.error('Error fetching game types', { error: String(error) });
      }
    }

    // Fallback
    return [
      { id: 'trivia', name: 'Trivia Challenge', description: 'Multiple choice trivia', instructions: 'Select the correct answer', category: 'trivia', difficulty_levels: ['easy', 'medium', 'hard'], time_limit_seconds: 30, max_score: 100, supports_human: true, supports_ai: true, icon: '?' },
      { id: 'math', name: 'Math Challenge', description: 'Solve math problems', instructions: 'Enter the numerical answer', category: 'puzzle', difficulty_levels: ['easy', 'medium', 'hard'], time_limit_seconds: 60, max_score: 100, supports_human: true, supports_ai: true, icon: '+' },
      { id: 'word', name: 'Word Logic', description: 'Anagrams and word puzzles', instructions: 'Unscramble the word', category: 'puzzle', difficulty_levels: ['easy', 'medium', 'hard'], time_limit_seconds: 45, max_score: 100, supports_human: true, supports_ai: true, icon: 'A' },
      { id: 'logic', name: 'Logic Puzzles', description: 'Pattern recognition', instructions: 'Find the pattern', category: 'puzzle', difficulty_levels: ['easy', 'medium', 'hard'], time_limit_seconds: 90, max_score: 100, supports_human: true, supports_ai: true, icon: '!' }
    ];
  }

  /**
   * Get a puzzle by game type and difficulty
   */
  async getPuzzle(gameType: GameType, difficulty: Difficulty): Promise<Puzzle | null> {
    let puzzle: PuzzleWithAnswer | null = null;

    switch (gameType) {
      case 'trivia':
        const triviaQuestions = await fetchTriviaQuestions(difficulty, 1);
        if (triviaQuestions.length > 0) {
          const full = triviaQuestions[0];
          // Return without answer for client
          puzzle = full;
        }
        break;

      case 'math':
        puzzle = generateMathPuzzle(difficulty);
        break;

      case 'word':
        puzzle = generateWordPuzzle(difficulty);
        break;

      case 'logic':
        puzzle = generateLogicPuzzle(difficulty);
        break;

      default:
        log.error(`Unknown game type: ${gameType}`);
        return null;
    }

    if (!puzzle) return null;

    // Store puzzle in database if configured
    if (this.initialized) {
      try {
        await supabase.from('aio_puzzles').insert({
          puzzle_id: puzzle.id,
          game_type: puzzle.game_type,
          difficulty: puzzle.difficulty,
          question: puzzle.question,
          options: puzzle.options,
          correct_answer: puzzle.correct_answer,
          explanation: puzzle.explanation,
          hint: puzzle.hint,
          points: puzzle.points,
          time_limit_seconds: puzzle.time_limit_seconds
        });
      } catch (error) {
        log.error('Error storing puzzle', { error: String(error) });
      }
    }

    // Return puzzle without answer
    const { correct_answer, explanation, ...safePuzzle } = puzzle;
    return safePuzzle;
  }

  /**
   * Submit answer for a puzzle
   */
  async submitAnswer(
    puzzleId: string,
    answer: string,
    timeMs: number,
    userId?: string,
    agentId?: string
  ): Promise<SubmitResult> {
    if (!userId && !agentId) {
      return { success: false, is_correct: false, score: 0, error: 'User or agent ID required' };
    }

    // Get puzzle with answer
    let puzzle: PuzzleWithAnswer | null = null;

    if (this.initialized) {
      try {
        const { data } = await supabase
          .from('aio_puzzles')
          .select('*')
          .eq('puzzle_id', puzzleId)
          .single();

        if (data) {
          puzzle = data as PuzzleWithAnswer;
        }
      } catch (error) {
        log.error('Error fetching puzzle', { error: String(error) });
      }
    }

    if (!puzzle) {
      return { success: false, is_correct: false, score: 0, error: 'Puzzle not found' };
    }

    // Check answer (case-insensitive for text answers)
    const normalizedAnswer = answer.trim().toUpperCase();
    const normalizedCorrect = puzzle.correct_answer.trim().toUpperCase();
    const isCorrect = normalizedAnswer === normalizedCorrect;

    // Calculate score (time bonus for faster answers)
    let score = 0;
    if (isCorrect) {
      const baseScore = puzzle.points;
      const timeLimit = puzzle.time_limit_seconds ? puzzle.time_limit_seconds * 1000 : 60000;
      const timeBonus = Math.max(0, 1 - (timeMs / timeLimit)) * 0.5; // Up to 50% bonus
      score = Math.round(baseScore * (1 + timeBonus));
    }

    // Record attempt
    if (this.initialized) {
      try {
        await supabase.from('aio_puzzle_attempts').insert({
          user_id: userId,
          agent_id: agentId,
          game_type: puzzle.game_type,
          puzzle_id: puzzleId,
          difficulty: puzzle.difficulty,
          question: puzzle.question,
          user_answer: answer,
          correct_answer: puzzle.correct_answer,
          is_correct: isCorrect,
          score,
          time_ms: timeMs
        });
      } catch (error) {
        log.error('Error recording attempt', { error: String(error) });
      }
    }

    return {
      success: true,
      is_correct: isCorrect,
      score,
      correct_answer: puzzle.correct_answer,
      explanation: puzzle.explanation
    };
  }

  /**
   * Get leaderboard for a game type
   */
  async getLeaderboard(gameType: GameType, limit: number = 50): Promise<LeaderboardEntry[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_combined_game_leaderboard')
        .select('*')
        .eq('game_type', gameType)
        .order('total_score', { ascending: false })
        .limit(limit);

      if (error) {
        log.error('Error fetching leaderboard', { error: error.message });
        return [];
      }

      return data as LeaderboardEntry[];
    } catch (error) {
      log.error('Error in getLeaderboard', { error: String(error) });
      return [];
    }
  }

  /**
   * Get global leaderboard across all games
   */
  async getGlobalLeaderboard(limit: number = 50): Promise<LeaderboardEntry[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_combined_game_leaderboard')
        .select('*')
        .order('total_score', { ascending: false })
        .limit(limit);

      if (error) {
        log.error('Error fetching global leaderboard', { error: error.message });
        return [];
      }

      return data as LeaderboardEntry[];
    } catch (error) {
      log.error('Error in getGlobalLeaderboard', { error: String(error) });
      return [];
    }
  }

  /**
   * Get user's stats for a game type
   */
  async getUserStats(userId: string, gameType?: GameType): Promise<LeaderboardEntry | null> {
    if (!this.initialized) return null;

    try {
      let query = supabase
        .from('aio_game_leaderboards')
        .select('*')
        .eq('user_id', userId);

      if (gameType) {
        query = query.eq('game_type', gameType);
      }

      const { data, error } = await query.single();

      if (error) {
        return null;
      }

      return data as LeaderboardEntry;
    } catch (error) {
      log.error('Error in getUserStats', { error: String(error) });
      return null;
    }
  }

  /**
   * Get recent attempts for a user
   */
  async getRecentAttempts(userId: string, limit: number = 20): Promise<PuzzleAttempt[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_puzzle_attempts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        log.error('Error fetching attempts', { error: error.message });
        return [];
      }

      return data as PuzzleAttempt[];
    } catch (error) {
      log.error('Error in getRecentAttempts', { error: String(error) });
      return [];
    }
  }
}

// Export singleton instance
export const puzzleService = new PuzzleService();
export default puzzleService;
