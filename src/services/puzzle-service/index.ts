/**
 * Puzzle Service - Module entry point
 *
 * Re-exports all types, utilities, generators, and the PuzzleService singleton.
 * Import from this module: import { puzzleService, type GameType } from '../services/puzzle-service/index.js';
 */

// Types & constants
export { GAME_TYPES, DIFFICULTIES } from './types.js';
export type {
  GameType, Difficulty, GameTypeInfo,
  Puzzle, PuzzleWithAnswer, PuzzleAttempt,
  GameSession, LeaderboardEntry, SubmitResult,
  PuzzleGenerator, AsyncPuzzleGenerator,
} from './types.js';

// Utilities
export { shuffle, decodeHtml, puzzleId, difficultyPoints } from './utils.js';

// Generators
export {
  fetchTriviaQuestions,
  generateMathPuzzle,
  generateWordPuzzle,
  generateLogicPuzzle,
  fetchLichessPuzzle,
  generateChessPuzzle,
  generateCodePuzzle,
  caesarShift,
  generateCipherPuzzle,
  generateSpatialPuzzle,
} from './generators/index.js';

// Service class
export { PuzzleService } from './service.js';

// Singleton instance
import { PuzzleService } from './service.js';
export const puzzleService = new PuzzleService();
export default puzzleService;
