/**
 * PuzzleService Class
 * Manages puzzles, scoring, leaderboards, and game sessions
 */

import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { createLogger } from '../../shared/utils/logger.js';
import type {
  GameType, Difficulty, GameTypeInfo,
  Puzzle, PuzzleWithAnswer, PuzzleAttempt,
  LeaderboardEntry, SubmitResult,
} from './types.js';
import {
  fetchTriviaQuestions,
  generateMathPuzzle,
  generateWordPuzzle,
  generateLogicPuzzle,
  fetchLichessPuzzle,
  generateChessPuzzle,
  generateCodePuzzle,
  generateCipherPuzzle,
  generateSpatialPuzzle,
} from './generators/index.js';

const log = createLogger('PuzzleService');

export class PuzzleService {
  private initialized = false;
  /** Track anonymous attempts per puzzle to prevent brute-force oracle attacks */
  private readonly anonymousAttempts = new Map<string, number>();
  private static readonly MAX_ANONYMOUS_ATTEMPTS = 2;

  /** In-memory cache for game types (rarely changes, only via migrations) */
  private gameTypesCache: GameTypeInfo[] | null = null;
  private gameTypesCacheExpiry = 0;
  private static readonly GAME_TYPES_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.initialized = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
    if (!this.initialized) {
      log.warn('Supabase not configured, puzzle service will use in-memory fallback');
    }
  }

  /** Get available game types */
  async getGameTypes(): Promise<GameTypeInfo[]> {
    if (this.initialized) {
      // Return cached data if still valid
      if (this.gameTypesCache && Date.now() < this.gameTypesCacheExpiry) {
        return this.gameTypesCache;
      }

      try {
        const { data, error } = await supabase
          .from('aio_game_types')
          .select('*')
          .order('name');

        if (!error && data) {
          this.gameTypesCache = data as GameTypeInfo[];
          this.gameTypesCacheExpiry = Date.now() + PuzzleService.GAME_TYPES_CACHE_TTL_MS;
          return this.gameTypesCache;
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
      { id: 'logic', name: 'Logic Puzzles', description: 'Pattern recognition', instructions: 'Find the pattern', category: 'puzzle', difficulty_levels: ['easy', 'medium', 'hard'], time_limit_seconds: 90, max_score: 100, supports_human: true, supports_ai: true, icon: '!' },
      { id: 'code', name: 'Code Debug', description: 'Find bugs in code snippets', instructions: 'Identify what is wrong with the code', category: 'puzzle', difficulty_levels: ['easy', 'medium', 'hard'], time_limit_seconds: 90, max_score: 150, supports_human: true, supports_ai: true, icon: '</>' },
      { id: 'cipher', name: 'Cipher Break', description: 'Decode encrypted messages', instructions: 'Figure out the encryption and decode', category: 'puzzle', difficulty_levels: ['easy', 'medium', 'hard'], time_limit_seconds: 120, max_score: 150, supports_human: true, supports_ai: true, icon: 'key' },
      { id: 'spatial', name: 'Spatial Logic', description: 'Grid and spatial reasoning puzzles', instructions: 'Analyze the grid and find the answer', category: 'puzzle', difficulty_levels: ['easy', 'medium', 'hard'], time_limit_seconds: 90, max_score: 150, supports_human: true, supports_ai: true, icon: '#' },
      { id: 'chess', name: 'Chess Puzzles', description: 'Find the best chess move', instructions: 'Select the best move in the position', category: 'puzzle', difficulty_levels: ['easy', 'medium', 'hard'], time_limit_seconds: 120, max_score: 150, supports_human: true, supports_ai: true, icon: 'N' },
    ];
  }

  /** Get a puzzle by game type and difficulty */
  async getPuzzle(gameType: GameType, difficulty: Difficulty): Promise<Puzzle | null> {
    let puzzle: PuzzleWithAnswer | null = null;

    switch (gameType) {
      case 'trivia': {
        const triviaQuestions = await fetchTriviaQuestions(difficulty, 1);
        if (triviaQuestions.length > 0) {
          puzzle = triviaQuestions[0];
        }
        break;
      }

      case 'math':
        puzzle = generateMathPuzzle(difficulty);
        break;

      case 'word':
        puzzle = generateWordPuzzle(difficulty);
        break;

      case 'logic':
        puzzle = generateLogicPuzzle(difficulty);
        break;

      case 'chess': {
        const lichessPuzzle = await fetchLichessPuzzle(difficulty);
        puzzle = lichessPuzzle ?? generateChessPuzzle(difficulty);
        break;
      }

      case 'code':
        puzzle = generateCodePuzzle(difficulty);
        break;

      case 'cipher':
        puzzle = generateCipherPuzzle(difficulty);
        break;

      case 'spatial':
        puzzle = generateSpatialPuzzle(difficulty);
        break;

      default:
        log.error(`Unknown game type: ${gameType}`);
        return null;
    }

    if (!puzzle) return null;

    // Store puzzle in database if configured.
    // If storage fails, the puzzle is unscoreable (fetchPuzzle won't find it),
    // so we must not return it to the client.
    if (this.initialized) {
      try {
        const { error: insertError } = await supabase.from('aio_puzzles').insert({
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

        if (insertError) {
          log.error('Failed to store puzzle — puzzle would be unscoreable', {
            puzzleId: puzzle.id,
            error: insertError.message,
          });
          return null;
        }
      } catch (error) {
        log.error('Error storing puzzle', { error: String(error) });
        return null;
      }
    }

    // Return puzzle without answer
    const { correct_answer, explanation, ...safePuzzle } = puzzle;
    return safePuzzle;
  }

  /** Fetch a stored puzzle by ID (includes created_at for server-side time validation) */
  private async fetchPuzzle(puzzleId: string): Promise<(PuzzleWithAnswer & { created_at?: string }) | null> {
    if (!this.initialized) return null;
    try {
      const { data } = await supabase
        .from('aio_puzzles')
        .select('*')
        .eq('puzzle_id', puzzleId)
        .single();
      return data ? (data as PuzzleWithAnswer & { created_at?: string }) : null;
    } catch (error) {
      log.error('Error fetching puzzle', { error: String(error) });
      return null;
    }
  }

  /** Score an answer against a puzzle (pure logic, no side effects) */
  private scoreAnswer(
    puzzle: PuzzleWithAnswer,
    answer: string,
    timeMs: number,
    puzzleCreatedAt?: string
  ): { isCorrect: boolean; score: number } {
    const normalizedAnswer = answer.trim().toUpperCase();
    const normalizedCorrect = puzzle.correct_answer.trim().toUpperCase();
    const isCorrect = normalizedAnswer === normalizedCorrect
      || normalizedAnswer.replace(/\s/g, '') === normalizedCorrect.replace(/\s/g, '');

    // Use server-side time when available to prevent cheating.
    // Take the greater of server and client time: prevents claiming 0ms
    // while being fair to users with slow connections (client measured longer).
    let effectiveTimeMs = timeMs;
    if (puzzleCreatedAt) {
      const serverTimeMs = Date.now() - new Date(puzzleCreatedAt).getTime();
      effectiveTimeMs = Math.max(serverTimeMs, timeMs);
    }

    const baseScore = puzzle.points;
    const timeLimit = puzzle.time_limit_seconds ? puzzle.time_limit_seconds * 1000 : 60000;
    const clampedTimeMs = Math.max(0, Math.min(effectiveTimeMs, timeLimit));
    let score = 0;
    if (isCorrect) {
      const timeBonus = Math.max(0, 1 - (clampedTimeMs / timeLimit)) * 0.5;
      score = Math.round(baseScore * (1 + timeBonus));
    } else {
      score = -Math.round(baseScore * 0.25);
    }

    return { isCorrect, score };
  }

  /** Check answer for a puzzle without recording (anonymous/task page use) */
  async checkAnswer(
    puzzleId: string,
    answer: string,
    timeMs: number
  ): Promise<SubmitResult> {
    // Enforce per-puzzle attempt limit to prevent brute-force oracle attacks
    const attempts = this.anonymousAttempts.get(puzzleId) ?? 0;
    if (attempts >= PuzzleService.MAX_ANONYMOUS_ATTEMPTS) {
      return { success: false, is_correct: false, score: 0, error: 'Maximum attempts reached for this puzzle' };
    }
    this.anonymousAttempts.set(puzzleId, attempts + 1);

    const puzzle = await this.fetchPuzzle(puzzleId);
    if (!puzzle) {
      return { success: false, is_correct: false, score: 0, error: 'Puzzle not found' };
    }

    const { isCorrect, score } = this.scoreAnswer(puzzle, answer, timeMs, puzzle.created_at);

    // Only reveal explanation on correct submissions
    // to prevent answer harvesting by anonymous callers
    return {
      success: true,
      is_correct: isCorrect,
      score,
      ...(isCorrect && {
        explanation: puzzle.explanation,
      }),
    };
  }

  /** Submit answer for a puzzle (authenticated, records attempt) */
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

    const puzzle = await this.fetchPuzzle(puzzleId);
    if (!puzzle) {
      return { success: false, is_correct: false, score: 0, error: 'Puzzle not found' };
    }

    const { isCorrect, score } = this.scoreAnswer(puzzle, answer, timeMs, puzzle.created_at);

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
      ...(isCorrect && {
        correct_answer: puzzle.correct_answer,
        explanation: puzzle.explanation,
      }),
    };
  }

  /** Submit a game session result and update leaderboard (server-side validated) */
  async submitSession(
    gameType: GameType,
    userId: string,
    sessionData: {
      score: number;
      correctCount: number;
      totalQuestions: number;
      timeSpentMs: number;
    }
  ): Promise<{ success: boolean; bestScore: number; error?: string }> {
    if (!this.initialized) {
      return { success: false, bestScore: 0, error: 'Service not initialized' };
    }

    try {
      // Cross-reference submitted session data against actual recorded attempts
      // to prevent clients from submitting inflated scores
      let validatedScore = sessionData.score;
      let validatedCorrect = sessionData.correctCount;

      try {
        const { data: attempts } = await supabase
          .from('aio_puzzle_attempts')
          .select('is_correct, score, time_ms, created_at')
          .eq('user_id', userId)
          .eq('game_type', gameType)
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(sessionData.totalQuestions);

        if (attempts && attempts.length > 0) {
          const serverCorrectCount = attempts.filter(a => a.is_correct).length;
          const serverScore = attempts.reduce((sum, a) => sum + (a.score ?? 0), 0);

          // Use the minimum of client-reported and server-verified values
          validatedScore = Math.min(sessionData.score, serverScore);
          validatedCorrect = Math.min(sessionData.correctCount, serverCorrectCount);

          // Log large discrepancies for cheating detection
          if (sessionData.score > serverScore * 10 && serverScore > 0) {
            log.warn('Large score discrepancy detected — possible cheating attempt', {
              userId, gameType,
              clientScore: sessionData.score, serverScore,
              clientCorrect: sessionData.correctCount, serverCorrect: serverCorrectCount,
            });
          }
        } else {
          // No attempts found (e.g., DB lag) — trust client data but log warning
          log.warn('No recorded attempts found for session validation, trusting client data', {
            userId, gameType, totalQuestions: sessionData.totalQuestions,
          });
        }
      } catch (validationError) {
        // Don't block legitimate users because of validation query failure
        log.warn('Session validation query failed, trusting client data', {
          error: String(validationError), userId, gameType,
        });
      }

      const accuracy = sessionData.totalQuestions > 0
        ? (validatedCorrect / sessionData.totalQuestions) * 100
        : 0;

      // Use atomic database function (INSERT ... ON CONFLICT with GREATEST)
      // to prevent race conditions from concurrent session submissions
      const { data, error } = await supabase.rpc('aio_upsert_game_leaderboard', {
        p_game_type: gameType,
        p_user_id: userId,
        p_score: validatedScore,
        p_puzzles_attempted: sessionData.totalQuestions,
        p_puzzles_solved: validatedCorrect,
        p_accuracy: accuracy,
        p_average_time_ms: Math.round(sessionData.timeSpentMs),
      });

      if (error) {
        log.warn('Atomic upsert failed, falling back to read-then-write', { error: error.message });
        return this.submitSessionFallback(gameType, userId, {
          ...sessionData,
          score: validatedScore,
          correctCount: validatedCorrect,
        }, accuracy);
      }

      const bestScore = Array.isArray(data) && data.length > 0
        ? (data[0] as { best_score: number }).best_score
        : validatedScore;

      return { success: true, bestScore };
    } catch (error) {
      log.error('Error in submitSession', { error: String(error) });
      return { success: false, bestScore: 0, error: 'Internal error' };
    }
  }

  /** Fallback for submitSession when the atomic RPC function is not available */
  private async submitSessionFallback(
    gameType: GameType,
    userId: string,
    sessionData: {
      score: number;
      correctCount: number;
      totalQuestions: number;
      timeSpentMs: number;
    },
    accuracy: number
  ): Promise<{ success: boolean; bestScore: number; error?: string }> {
    try {
      const { data: existing } = await supabase
        .from('aio_game_leaderboards')
        .select('total_score, sessions_completed, puzzles_attempted, puzzles_solved')
        .eq('game_type', gameType)
        .eq('user_id', userId)
        .single();

      const existingScore = existing?.total_score ?? 0;
      const bestScore = Math.max(existingScore, sessionData.score);

      const { error } = await supabase
        .from('aio_game_leaderboards')
        .upsert({
          game_type: gameType,
          user_id: userId,
          total_score: bestScore,
          puzzles_attempted: (existing?.puzzles_attempted ?? 0) + sessionData.totalQuestions,
          puzzles_solved: (existing?.puzzles_solved ?? 0) + sessionData.correctCount,
          accuracy,
          average_time_ms: Math.round(sessionData.timeSpentMs),
          sessions_completed: (existing?.sessions_completed ?? 0) + 1,
          last_played_at: new Date().toISOString(),
        }, {
          onConflict: 'game_type,user_id',
        });

      if (error) {
        log.error('Error upserting leaderboard (fallback)', { error: error.message });
        return { success: false, bestScore: existingScore, error: 'Failed to update leaderboard' };
      }

      return { success: true, bestScore };
    } catch (error) {
      log.error('Error in submitSessionFallback', { error: String(error) });
      return { success: false, bestScore: 0, error: 'Internal error' };
    }
  }

  /** Get leaderboard for a game type */
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

  /** Get global leaderboard across all games */
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

  /** Get user's stats for a specific game type */
  async getUserStats(userId: string, gameType?: GameType): Promise<LeaderboardEntry | LeaderboardEntry[] | null> {
    if (!this.initialized) return null;

    try {
      let query = supabase
        .from('aio_game_leaderboards')
        .select('*')
        .eq('user_id', userId);

      if (gameType) {
        // Single game type → use .single()
        query = query.eq('game_type', gameType);
        const { data, error } = await query.single();
        if (error) return null;
        return data as LeaderboardEntry;
      }

      // No game type filter → return all game stats for the user
      const { data, error } = await query;
      if (error) return null;
      return (data as LeaderboardEntry[]) ?? [];
    } catch (error) {
      log.error('Error in getUserStats', { error: String(error) });
      return null;
    }
  }

  /** Get recent attempts for a user */
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
