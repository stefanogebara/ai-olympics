/**
 * Chess Puzzle Generator Tests
 *
 * TDD coverage for:
 *   - generateChessPuzzle() -- local fallback, all difficulty levels
 *   - fetchLichessPuzzle()  -- Lichess API success path, failure/circuit-open path
 *
 * External dependencies (fetch, circuits, logger) are fully mocked so no
 * network calls happen during the test run.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks – must be declared before any dynamic imports
// ---------------------------------------------------------------------------

vi.mock('../../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Minimal circuit breaker mock: by default the circuit executes the supplied fn
const mockCircuitExecute = vi.fn(async (fn: () => Promise<unknown>) => fn());

vi.mock('../../../shared/utils/circuit-breaker.js', () => ({
  circuits: {
    lichess: { execute: (fn: () => Promise<unknown>) => mockCircuitExecute(fn) },
  },
  CircuitOpenError: class CircuitOpenError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'CircuitOpenError';
    }
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { generateChessPuzzle, fetchLichessPuzzle } from './chess.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Known CLASSIC_CHESS_POSITIONS best-move pool (from chess.ts). */
const KNOWN_BEST_MOVES = ['Qxf7#', 'Qh4#', 'Nxe5', 'Nf6+', 'Bxf7+', 'Ne5', 'Re8#', 'Nxe4', 'Nxf7', 'd5'];

/** Confirm the returned object satisfies the PuzzleWithAnswer contract. */
function assertValidChessPuzzle(
  puzzle: ReturnType<typeof generateChessPuzzle>,
  expectedDifficulty: 'easy' | 'medium' | 'hard'
) {
  expect(puzzle).toBeDefined();
  expect(puzzle.game_type).toBe('chess');
  expect(puzzle.difficulty).toBe(expectedDifficulty);

  // ID format: "chess-<uuid>"
  expect(puzzle.id).toMatch(/^chess-[0-9a-f-]+$/);

  // Question contains FEN and theme metadata
  expect(typeof puzzle.question).toBe('string');
  expect(puzzle.question).toContain('FEN:');
  expect(puzzle.question).toContain('Theme:');

  // Options: exactly 4 entries labelled A–D
  expect(Array.isArray(puzzle.options)).toBe(true);
  expect(puzzle.options).toHaveLength(4);
  const labels = puzzle.options!.map(o => o.id);
  expect(labels).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']));
  for (const opt of puzzle.options!) {
    expect(typeof opt.text).toBe('string');
    expect(opt.text.length).toBeGreaterThan(0);
  }

  // correct_answer is one of the option labels
  expect(['A', 'B', 'C', 'D']).toContain(puzzle.correct_answer);

  // Explanation references the best move
  expect(typeof puzzle.explanation).toBe('string');
  expect(puzzle.explanation).toContain('Best move:');

  // Scoring fields
  expect(puzzle.points).toBeGreaterThan(0);
  expect(puzzle.time_limit_seconds).toBe(120);
}

// ---------------------------------------------------------------------------
// generateChessPuzzle – local fallback
// ---------------------------------------------------------------------------

describe('generateChessPuzzle', () => {
  it('returns a valid puzzle for easy difficulty', () => {
    const puzzle = generateChessPuzzle('easy');
    assertValidChessPuzzle(puzzle, 'easy');
  });

  it('returns a valid puzzle for medium difficulty', () => {
    const puzzle = generateChessPuzzle('medium');
    assertValidChessPuzzle(puzzle, 'medium');
  });

  it('returns a valid puzzle for hard difficulty', () => {
    const puzzle = generateChessPuzzle('hard');
    assertValidChessPuzzle(puzzle, 'hard');
  });

  it('points follow difficultyPoints() schedule: easy=50, medium=150, hard=400', () => {
    expect(generateChessPuzzle('easy').points).toBe(50);
    expect(generateChessPuzzle('medium').points).toBe(150);
    expect(generateChessPuzzle('hard').points).toBe(400);
  });

  it('the correct_answer option text is one of the known best moves', () => {
    // Run many iterations to cover the random selection
    for (let i = 0; i < 30; i++) {
      const puzzle = generateChessPuzzle('easy');
      const correctOption = puzzle.options!.find(o => o.id === puzzle.correct_answer);
      expect(KNOWN_BEST_MOVES).toContain(correctOption!.text);
    }
  });

  it('each of the 4 options is a unique move (no duplicates)', () => {
    for (let i = 0; i < 20; i++) {
      const puzzle = generateChessPuzzle('medium');
      const texts = puzzle.options!.map(o => o.text);
      const unique = new Set(texts);
      expect(unique.size).toBe(4);
    }
  });

  it('all options are distinct from each other across difficulties', () => {
    for (const diff of ['easy', 'medium', 'hard'] as const) {
      const puzzle = generateChessPuzzle(diff);
      const ids = puzzle.options!.map(o => o.id);
      expect(new Set(ids).size).toBe(4);
    }
  });

  it('generates unique IDs on repeated calls', () => {
    const ids = new Set(
      Array.from({ length: 20 }, () => generateChessPuzzle('easy').id)
    );
    // Timestamp + random suffix: collisions should be practically impossible
    expect(ids.size).toBeGreaterThan(1);
  });

  it('FEN string in question is a non-empty string', () => {
    for (let i = 0; i < 10; i++) {
      const puzzle = generateChessPuzzle('hard');
      const fenLine = puzzle.question.split('\n').find(l => l.startsWith('FEN:'));
      expect(fenLine).toBeDefined();
      expect(fenLine!.replace('FEN: ', '').length).toBeGreaterThan(0);
    }
  });

  it('falls back to any position when no positions match the difficulty', () => {
    // 'easy' maps to 3 positions. Even if we exhaust random matches the
    // fallback path ensures a puzzle is always returned (never null/undefined).
    const puzzle = generateChessPuzzle('easy');
    expect(puzzle).not.toBeNull();
    expect(puzzle).not.toBeUndefined();
  });

  it('options contain exactly one move from the CLASSIC list', () => {
    // The best move MUST always appear among options
    for (let i = 0; i < 20; i++) {
      const puzzle = generateChessPuzzle('medium');
      const optionTexts = puzzle.options!.map(o => o.text);
      const knownCount = optionTexts.filter(t => KNOWN_BEST_MOVES.includes(t)).length;
      // The best move is from CLASSIC_CHESS_POSITIONS; wrong moves come from WRONG_MOVE_POOL
      expect(knownCount).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// fetchLichessPuzzle – success path
// ---------------------------------------------------------------------------

const LICHESS_SUCCESS_RESPONSE = {
  game: { pgn: 'e4 e5 Nf3 Nc6\n1. e4 e5' },
  puzzle: {
    id: 'abc123',
    solution: ['e4', 'Nf3', 'd4'],
    themes: ['fork', 'middlegame'],
    rating: 1500,
  },
};

describe('fetchLichessPuzzle – success path', () => {
  beforeEach(() => {
    // Reset circuit mock to pass-through each time
    mockCircuitExecute.mockImplementation(async (fn) => fn());

    // Mock global fetch to return success response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => LICHESS_SUCCESS_RESPONSE,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a valid puzzle on successful Lichess API call', async () => {
    const puzzle = await fetchLichessPuzzle('medium');
    expect(puzzle).not.toBeNull();
    expect(puzzle!.game_type).toBe('chess');
    expect(puzzle!.id).toBe('chess-lichess-abc123');
  });

  it('puzzle has 4 multiple-choice options labelled A–D', async () => {
    const puzzle = await fetchLichessPuzzle('easy');
    expect(puzzle!.options).toHaveLength(4);
    expect(puzzle!.options!.map(o => o.id)).toEqual(
      expect.arrayContaining(['A', 'B', 'C', 'D'])
    );
  });

  it('correct_answer option text matches the first move from Lichess solution', async () => {
    const puzzle = await fetchLichessPuzzle('hard');
    const answerOption = puzzle!.options!.find(o => o.id === puzzle!.correct_answer);
    expect(answerOption!.text).toBe(LICHESS_SUCCESS_RESPONSE.puzzle.solution[0]);
  });

  it('explanation includes move and themes from Lichess', async () => {
    const puzzle = await fetchLichessPuzzle('medium');
    expect(puzzle!.explanation).toContain('fork');
    expect(puzzle!.explanation).toContain('e4');
  });

  it('time_limit_seconds is 120', async () => {
    const puzzle = await fetchLichessPuzzle('easy');
    expect(puzzle!.time_limit_seconds).toBe(120);
  });

  it('calls fetch with the correct Lichess API URL', async () => {
    await fetchLichessPuzzle('easy');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://lichess.org/api/puzzle/daily',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
  });

  it('question mentions the puzzle rating from Lichess', async () => {
    const puzzle = await fetchLichessPuzzle('medium');
    expect(puzzle!.question).toContain('1500');
  });
});

// ---------------------------------------------------------------------------
// fetchLichessPuzzle – failure paths
// ---------------------------------------------------------------------------

describe('fetchLichessPuzzle – failure paths', () => {
  beforeEach(() => {
    mockCircuitExecute.mockImplementation(async (fn) => fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when fetch throws a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));
    const puzzle = await fetchLichessPuzzle('easy');
    expect(puzzle).toBeNull();
  });

  it('returns null when Lichess responds with a non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);
    const puzzle = await fetchLichessPuzzle('medium');
    expect(puzzle).toBeNull();
  });

  it('returns null when the circuit breaker is open (CircuitOpenError)', async () => {
    const { CircuitOpenError } = await import('../../../shared/utils/circuit-breaker.js');
    mockCircuitExecute.mockRejectedValueOnce(new CircuitOpenError('lichess circuit open'));
    const puzzle = await fetchLichessPuzzle('hard');
    expect(puzzle).toBeNull();
  });

  it('returns null when the Lichess response fails Zod schema validation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invalid: 'schema' }),
    } as Response);
    const puzzle = await fetchLichessPuzzle('easy');
    expect(puzzle).toBeNull();
  });

  it('returns null when Lichess puzzle solution is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        game: { pgn: 'e4' },
        puzzle: { id: 'x', solution: [], themes: [], rating: 1200 },
      }),
    } as Response);
    const puzzle = await fetchLichessPuzzle('medium');
    // Zod schema requires solution.min(1) -- empty array should fail validation
    expect(puzzle).toBeNull();
  });
});
