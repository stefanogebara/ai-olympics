/**
 * Chess Puzzle Generator (Lichess API + local fallback)
 */

import { z } from 'zod';
import { createLogger } from '../../../shared/utils/logger.js';
import { circuits, CircuitOpenError } from '../../../shared/utils/circuit-breaker.js';
import type { Difficulty, PuzzleWithAnswer } from '../types.js';
import { shuffle, puzzleId, difficultyPoints } from '../utils.js';

const log = createLogger('ChessGenerator');

/** Zod schema for Lichess daily puzzle response */
const lichessPuzzleSchema = z.object({
  game: z.object({
    pgn: z.string(),
  }),
  puzzle: z.object({
    id: z.string(),
    solution: z.array(z.string()).min(1),
    themes: z.array(z.string()),
    rating: z.number(),
  }),
});

const CLASSIC_CHESS_POSITIONS: Array<{ fen: string; bestMove: string; theme: string; difficulty: Difficulty }> = [
  { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', bestMove: 'Qxf7#', theme: 'Scholar\'s Mate', difficulty: 'easy' },
  { fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', bestMove: 'Qh4#', theme: 'Fool\'s Mate', difficulty: 'easy' },
  { fen: 'r1b1k2r/ppppqppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5', bestMove: 'Nxe5', theme: 'Fork', difficulty: 'easy' },
  { fen: '2r3k1/pp3ppp/2n5/3Np3/2B1P3/8/PPP2PPP/4K2R w K - 0 15', bestMove: 'Nf6+', theme: 'Fork', difficulty: 'medium' },
  { fen: 'r1bq1rk1/ppp2ppp/2np4/2b1p3/2B1P1n1/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7', bestMove: 'Bxf7+', theme: 'Sacrifice', difficulty: 'medium' },
  { fen: 'r2qkb1r/ppp1pppp/2n2n2/3p4/3P1Bb1/2N2N2/PPP1PPPP/R2QKB1R w KQkq - 4 4', bestMove: 'Ne5', theme: 'Pin', difficulty: 'medium' },
  { fen: '6k1/5ppp/8/8/8/8/6PP/4R1K1 w - - 0 1', bestMove: 'Re8#', theme: 'Back rank mate', difficulty: 'medium' },
  { fen: 'r1bqk2r/pppp1ppp/2n5/2b1p3/2B1n3/2N2N2/PPPP1PPP/R1BQR1K1 w kq - 0 6', bestMove: 'Nxe4', theme: 'Discovered attack', difficulty: 'hard' },
  { fen: '2rr2k1/pp3ppp/2n1b3/4N3/2B1P3/1P6/P4PPP/2RR2K1 w - - 0 20', bestMove: 'Nxf7', theme: 'Deflection', difficulty: 'hard' },
  { fen: 'r1b2rk1/2q1bppp/p2p1n2/np2p3/3PP3/2N1BN2/PPB1QPPP/R4RK1 w - - 0 12', bestMove: 'd5', theme: 'Central breakthrough', difficulty: 'hard' },
];

const WRONG_MOVE_POOL = ['Nf3', 'Bb5', 'e4', 'd4', 'Qd1', 'Rg1', 'Ke2', 'Bc4', 'a3', 'h3'];

export async function fetchLichessPuzzle(difficulty: Difficulty): Promise<PuzzleWithAnswer | null> {
  try {
    return await circuits.lichess.execute(async () => {
      const response = await fetch('https://lichess.org/api/puzzle/daily', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Lichess API returned ${response.status}`);

      const raw = await response.json();
      const data = lichessPuzzleSchema.parse(raw);

      const move = data.puzzle.solution[0];
      const wrongMoves = shuffle(WRONG_MOVE_POOL.filter(m => m !== move)).slice(0, 3);
      const allMoves = shuffle([move, ...wrongMoves]);
      return {
        id: `chess-lichess-${data.puzzle.id}`,
        game_type: 'chess' as const,
        difficulty,
        question: `What is the best move? (Rating: ${data.puzzle.rating})\nFEN: ${data.game.pgn.split('\n').pop() || 'See position'}`,
        options: allMoves.map((m, i) => ({ id: String.fromCharCode(65 + i), text: m })),
        correct_answer: String.fromCharCode(65 + allMoves.indexOf(move)),
        explanation: `Best move: ${move}. Themes: ${data.puzzle.themes.join(', ')}`,
        points: difficultyPoints(difficulty),
        time_limit_seconds: 120,
      };
    });
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      log.warn('Lichess circuit open, using local fallback', { error: error.message });
    } else {
      log.warn('Lichess API unavailable, using local chess puzzle', { error: String(error) });
    }
    return null;
  }
}

export function generateChessPuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  const matching = CLASSIC_CHESS_POSITIONS.filter(p => p.difficulty === difficulty);
  const fallback = matching.length > 0 ? matching : CLASSIC_CHESS_POSITIONS;
  const pos = fallback[Math.floor(Math.random() * fallback.length)];

  const wrongMoves = shuffle(WRONG_MOVE_POOL.filter(m => m !== pos.bestMove)).slice(0, 3);
  const allMoves = shuffle([pos.bestMove, ...wrongMoves]);

  return {
    id: puzzleId('chess'),
    game_type: 'chess',
    difficulty,
    question: `What is the best move for White? (Theme: ${pos.theme})\nFEN: ${pos.fen}`,
    options: allMoves.map((m, i) => ({ id: String.fromCharCode(65 + i), text: m })),
    correct_answer: String.fromCharCode(65 + allMoves.indexOf(pos.bestMove)),
    explanation: `Best move: ${pos.bestMove} (${pos.theme})`,
    points: difficultyPoints(difficulty),
    time_limit_seconds: 120,
  };
}
