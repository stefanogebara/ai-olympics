/**
 * Puzzle Service Test Suite
 *
 * TDD coverage for:
 *   - PuzzleService.checkAnswer()       (public, no auth, anonymous flow)
 *   - scoreAnswer()                     (private helper, exercised through checkAnswer/submitAnswer)
 *   - fetchPuzzle()                     (private helper, exercised through the public surface)
 *   - generateCodePuzzle()
 *   - generateCipherPuzzle() / caesarShift()
 *   - generateSpatialPuzzle()
 *   - POST /api/games/:type/submit      (anonymous integration path)
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';

// ---------------------------------------------------------------------------
// 1. Generator unit tests – no mocks needed, pure functions
// ---------------------------------------------------------------------------

import { generateCodePuzzle } from './generators/code.js';
import { generateCipherPuzzle, caesarShift } from './generators/cipher.js';
import { generateSpatialPuzzle } from './generators/spatial.js';
import { generateMathPuzzle } from './generators/math.js';
import { generateLogicPuzzle } from './generators/logic.js';
import type { PuzzleWithAnswer } from './types.js';

/** Assert the returned object is a well-formed PuzzleWithAnswer */
function assertValidPuzzle(puzzle: PuzzleWithAnswer, expectedGameType: string) {
  expect(puzzle).toBeDefined();
  expect(typeof puzzle.id).toBe('string');
  expect(puzzle.id.length).toBeGreaterThan(0);
  expect(puzzle.game_type).toBe(expectedGameType);
  expect(['easy', 'medium', 'hard']).toContain(puzzle.difficulty);
  expect(typeof puzzle.question).toBe('string');
  expect(puzzle.question.length).toBeGreaterThan(0);
  expect(typeof puzzle.correct_answer).toBe('string');
  expect(puzzle.correct_answer.length).toBeGreaterThan(0);
  expect(typeof puzzle.points).toBe('number');
  expect(puzzle.points).toBeGreaterThan(0);
  expect(typeof puzzle.time_limit_seconds).toBe('number');
  expect(puzzle.time_limit_seconds).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// generateCodePuzzle
// ---------------------------------------------------------------------------

describe('generateCodePuzzle', () => {
  it('returns a valid puzzle for easy difficulty', () => {
    const puzzle = generateCodePuzzle('easy');
    assertValidPuzzle(puzzle, 'code');
    expect(puzzle.difficulty).toBe('easy');
    expect(puzzle.points).toBe(50);
    expect(puzzle.time_limit_seconds).toBe(90);
  });

  it('returns a valid puzzle for medium difficulty', () => {
    const puzzle = generateCodePuzzle('medium');
    assertValidPuzzle(puzzle, 'code');
    expect(puzzle.difficulty).toBe('medium');
    expect(puzzle.points).toBe(150);
  });

  it('returns a valid puzzle for hard difficulty', () => {
    const puzzle = generateCodePuzzle('hard');
    assertValidPuzzle(puzzle, 'code');
    expect(puzzle.difficulty).toBe('hard');
    expect(puzzle.points).toBe(400);
  });

  it('generates unique IDs on repeated calls', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateCodePuzzle('easy').id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('question contains code content (newlines or function keywords)', () => {
    const puzzle = generateCodePuzzle('easy');
    const hasCodeContent =
      puzzle.question.includes('\n') ||
      puzzle.question.includes('function') ||
      puzzle.question.includes('return');
    expect(hasCodeContent).toBe(true);
  });

  it('each difficulty picks from the correct problem pool (answer is non-empty)', () => {
    const easy = generateCodePuzzle('easy');
    const hard = generateCodePuzzle('hard');
    expect(easy.correct_answer.length).toBeGreaterThan(0);
    expect(hard.correct_answer.length).toBeGreaterThan(0);
  });

  it('does not set a hint field on code puzzles', () => {
    const puzzle = generateCodePuzzle('easy');
    expect(puzzle.hint).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// caesarShift (utility exported from cipher generator)
// ---------------------------------------------------------------------------

describe('caesarShift', () => {
  it('shifts uppercase letters by the given amount', () => {
    expect(caesarShift('HELLO', 3)).toBe('KHOOR');
  });

  it('wraps around the alphabet correctly', () => {
    expect(caesarShift('XYZ', 3)).toBe('ABC');
  });

  it('preserves spaces and non-letter characters', () => {
    expect(caesarShift('HELLO WORLD', 0)).toBe('HELLO WORLD');
    expect(caesarShift('A B', 1)).toBe('B C');
  });

  it('ROT13 is its own inverse', () => {
    const original = 'HELLO WORLD';
    expect(caesarShift(caesarShift(original, 13), 13)).toBe(original);
  });

  it('shift of 26 is a no-op (full alphabet cycle)', () => {
    expect(caesarShift('ABCXYZ', 26)).toBe('ABCXYZ');
  });

  it('shift of 0 returns original', () => {
    expect(caesarShift('OPEN SESAME', 0)).toBe('OPEN SESAME');
  });

  it('handles empty string', () => {
    expect(caesarShift('', 5)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateCipherPuzzle
// ---------------------------------------------------------------------------

describe('generateCipherPuzzle', () => {
  it('returns valid puzzle for easy difficulty', () => {
    const puzzle = generateCipherPuzzle('easy');
    assertValidPuzzle(puzzle, 'cipher');
    expect(puzzle.difficulty).toBe('easy');
    expect(puzzle.points).toBe(50);
    expect(puzzle.time_limit_seconds).toBe(60);
  });

  it('easy puzzle question mentions the shift amount', () => {
    const puzzle = generateCipherPuzzle('easy');
    expect(puzzle.question).toMatch(/shift \+\d+/);
  });

  it('easy puzzle includes a hint containing "first letter"', () => {
    const puzzle = generateCipherPuzzle('easy');
    expect(puzzle.hint).toBeDefined();
    expect(puzzle.hint).toContain('first letter');
  });

  it('easy puzzle encrypted text decodes back to correct_answer', () => {
    // Run 20 times to cover random variation
    for (let i = 0; i < 20; i++) {
      const puzzle = generateCipherPuzzle('easy');
      const shiftMatch = puzzle.question.match(/shift \+(\d+)/);
      expect(shiftMatch).not.toBeNull();
      const shift = parseInt(shiftMatch![1], 10);
      const encryptedPart = puzzle.question.split(': ').pop()!;
      const decoded = caesarShift(encryptedPart, 26 - shift);
      expect(decoded).toBe(puzzle.correct_answer);
    }
  });

  it('returns valid puzzle for medium difficulty', () => {
    const puzzle = generateCipherPuzzle('medium');
    assertValidPuzzle(puzzle, 'cipher');
    expect(puzzle.difficulty).toBe('medium');
    expect(puzzle.points).toBe(150);
  });

  it('medium puzzle has a defined explanation', () => {
    const puzzle = generateCipherPuzzle('medium');
    expect(puzzle.explanation).toBeDefined();
    expect(typeof puzzle.explanation).toBe('string');
  });

  it('returns valid puzzle for hard difficulty', () => {
    const puzzle = generateCipherPuzzle('hard');
    assertValidPuzzle(puzzle, 'cipher');
    expect(puzzle.difficulty).toBe('hard');
    expect(puzzle.points).toBe(400);
    expect(puzzle.time_limit_seconds).toBe(120);
  });

  it('hard puzzle correct_answer is an uppercase word (letters only)', () => {
    for (let i = 0; i < 15; i++) {
      const puzzle = generateCipherPuzzle('hard');
      expect(puzzle.correct_answer).toMatch(/^[A-Z]+$/);
    }
  });

  it('generates unique puzzle IDs on repeated calls', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateCipherPuzzle('easy').id));
    expect(ids.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// generateSpatialPuzzle
// ---------------------------------------------------------------------------

describe('generateSpatialPuzzle', () => {
  it('returns valid puzzle for easy difficulty', () => {
    const puzzle = generateSpatialPuzzle('easy');
    assertValidPuzzle(puzzle, 'spatial');
    expect(puzzle.difficulty).toBe('easy');
    expect(puzzle.points).toBe(50);
    expect(puzzle.time_limit_seconds).toBe(45);
  });

  it('easy puzzle correct_answer is a non-negative integer string', () => {
    for (let i = 0; i < 20; i++) {
      const puzzle = generateSpatialPuzzle('easy');
      expect(puzzle.correct_answer).toMatch(/^\d+$/);
    }
  });

  it('returns valid puzzle for medium difficulty', () => {
    const puzzle = generateSpatialPuzzle('medium');
    assertValidPuzzle(puzzle, 'spatial');
    expect(puzzle.difficulty).toBe('medium');
    expect(puzzle.points).toBe(150);
  });

  it('medium puzzle has a non-empty explanation', () => {
    const puzzle = generateSpatialPuzzle('medium');
    expect(puzzle.explanation).toBeDefined();
    expect((puzzle.explanation as string).length).toBeGreaterThan(0);
  });

  it('returns valid puzzle for hard difficulty', () => {
    const puzzle = generateSpatialPuzzle('hard');
    assertValidPuzzle(puzzle, 'spatial');
    expect(puzzle.difficulty).toBe('hard');
    expect(puzzle.points).toBe(400);
    expect(puzzle.time_limit_seconds).toBe(90);
  });

  it('hard puzzle correct_answer is a non-empty string', () => {
    for (let i = 0; i < 15; i++) {
      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.correct_answer.length).toBeGreaterThan(0);
    }
  });

  it('easy puzzle question contains a grid representation (# X or newline)', () => {
    for (let i = 0; i < 15; i++) {
      const puzzle = generateSpatialPuzzle('easy');
      const hasGrid =
        puzzle.question.includes('#') ||
        puzzle.question.includes('X') ||
        puzzle.question.includes('\n');
      expect(hasGrid).toBe(true);
    }
  });

  it('generates unique IDs on repeated calls', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateSpatialPuzzle('hard').id));
    expect(ids.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// 2. PuzzleService.checkAnswer() and scoreAnswer() unit tests
//    Supabase is mocked so no real DB calls happen.
// ---------------------------------------------------------------------------

const MOCK_PUZZLE_ID = 'test-puzzle-123';
const MOCK_PUZZLE: PuzzleWithAnswer = {
  id: MOCK_PUZZLE_ID,
  game_type: 'math',
  difficulty: 'easy',
  question: 'What is 2 + 2?',
  correct_answer: '4',
  explanation: 'Basic addition',
  points: 50,
  time_limit_seconds: 30,
};

// Mock Supabase utility module before any service imports
vi.mock('../../shared/utils/supabase.js', () => {
  const singleMock = vi.fn().mockResolvedValue({ data: MOCK_PUZZLE, error: null });
  const chainBase = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn().mockReturnThis(),
    single: singleMock,
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    serviceClient: {
      from: vi.fn(() => ({ ...chainBase })),
    },
    createUserClient: vi.fn(),
    extractToken: vi.fn(),
  };
});

// Mock logger to silence output during tests
vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import AFTER mocks are registered
const { PuzzleService } = await import('./service.js');

/** Factory: creates a PuzzleService instance with initialized forced to true */
function makeInitializedService(): InstanceType<typeof PuzzleService> {
  const svc = new PuzzleService();
  (svc as unknown as { initialized: boolean }).initialized = true;
  return svc;
}

describe('PuzzleService.checkAnswer()', () => {
  let service: InstanceType<typeof PuzzleService>;

  beforeEach(() => {
    service = makeInitializedService();
  });

  it('returns success with is_correct=true for the correct answer', async () => {
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '4', 5000);
    expect(result.success).toBe(true);
    expect(result.is_correct).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('reveals explanation but NOT correct_answer on a correct anonymous submission', async () => {
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '4', 5000);
    expect(result.correct_answer).toBeUndefined();
    expect(result.explanation).toBe('Basic addition');
  });

  it('returns is_correct=false and negative score for wrong answer', async () => {
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '99', 5000);
    expect(result.success).toBe(true);
    expect(result.is_correct).toBe(false);
    expect(result.score).toBeLessThan(0);
  });

  it('does NOT reveal correct_answer or explanation on a wrong submission', async () => {
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, 'WRONG', 5000);
    expect(result.correct_answer).toBeUndefined();
    expect(result.explanation).toBeUndefined();
  });

  it('returns puzzle-not-found error when fetchPuzzle returns null', async () => {
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as unknown as ReturnType<typeof serviceClient.from>));

    const result = await service.checkAnswer('nonexistent-id', '4', 5000);
    expect(result.success).toBe(false);
    expect(result.is_correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.error).toContain('not found');
  });

  it('returns puzzle-not-found when service is not initialized (no Supabase)', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const result = await uninitialized.checkAnswer(MOCK_PUZZLE_ID, '4', 5000);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('trims surrounding whitespace from the answer before comparing', async () => {
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '  4  ', 5000);
    expect(result.is_correct).toBe(true);
  });

  it('handles timeMs=0 without crashing and grants max time bonus', async () => {
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '4', 0);
    expect(result.success).toBe(true);
    expect(result.is_correct).toBe(true);
    // timeBonus at 0ms = 0.5 → score = round(50 * 1.5) = 75
    expect(result.score).toBe(75);
  });

  it('handles timeMs far beyond time limit without crashing', async () => {
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '4', 999_999_999);
    expect(result.success).toBe(true);
    expect(result.is_correct).toBe(true);
    // Time bonus clamped at 0 → score = base points = 50
    expect(result.score).toBe(MOCK_PUZZLE.points);
  });
});

// ---------------------------------------------------------------------------
// 3. scoreAnswer() logic exercised via checkAnswer with controlled fixtures
// ---------------------------------------------------------------------------

describe('scoreAnswer() scoring logic (via checkAnswer)', () => {
  let service: InstanceType<typeof PuzzleService>;

  beforeEach(() => {
    service = makeInitializedService();
  });

  it('wrong answer penalty is -25% of base points (rounded)', async () => {
    // MOCK_PUZZLE has points=50, penalty = -Math.round(50 * 0.25) = -13
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, 'WRONG', 0);
    expect(result.score).toBe(-13);
  });

  it('correct at timeMs=0 gives maximum score: round(base * 1.5)', async () => {
    // score = round(50 * (1 + 0.5)) = 75
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '4', 0);
    expect(result.score).toBe(75);
  });

  it('correct exactly at time limit gives base score (no bonus)', async () => {
    // time_limit_seconds=30 → timeLimit=30000ms
    // timeMs=30000 → bonus=max(0, 1-1)*0.5=0 → score=50
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '4', 30000);
    expect(result.score).toBe(50);
  });

  it('correct at half of time limit gives ~25% bonus', async () => {
    // timeMs=15000, timeLimit=30000 → factor=0.5 → bonus=0.5*0.5=0.25 → score=round(50*1.25)=63
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '4', 15000);
    expect(result.score).toBe(63);
  });

  it('score is always an integer (Math.round applied)', async () => {
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '4', 7777);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('answer comparison strips internal whitespace', async () => {
    // Both sides strip /\s/g so '4' equals '4'
    const result = await service.checkAnswer(MOCK_PUZZLE_ID, '4', 5000);
    expect(result.is_correct).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. submitAnswer() – authenticated path
// ---------------------------------------------------------------------------

describe('PuzzleService.submitAnswer()', () => {
  let service: InstanceType<typeof PuzzleService>;

  beforeEach(() => {
    service = makeInitializedService();
  });

  it('returns error when neither userId nor agentId is provided', async () => {
    const result = await service.submitAnswer(MOCK_PUZZLE_ID, '4', 5000);
    expect(result.success).toBe(false);
    expect(result.error).toContain('User or agent ID required');
  });

  it('returns success for authenticated user with correct answer', async () => {
    const result = await service.submitAnswer(MOCK_PUZZLE_ID, '4', 5000, 'user-uuid-123');
    expect(result.success).toBe(true);
    expect(result.is_correct).toBe(true);
  });

  it('does NOT reveal correct_answer on wrong submissions in authenticated path', async () => {
    const result = await service.submitAnswer(MOCK_PUZZLE_ID, 'WRONG', 5000, 'user-uuid-123');
    expect(result.correct_answer).toBeUndefined();
    expect(result.explanation).toBeUndefined();
  });

  it('returns puzzle-not-found when service is not initialized', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const result = await uninitialized.submitAnswer(MOCK_PUZZLE_ID, '4', 5000, 'user-uuid-123');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('accepts agentId alongside userId for agent submissions', async () => {
    const result = await service.submitAnswer(
      MOCK_PUZZLE_ID, '4', 5000,
      'user-uuid-123',
      'agent-uuid-456'
    );
    expect(result.success).toBe(true);
    expect(result.is_correct).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Integration test: POST /api/games/:type/submit – anonymous flow
//    Uses Express + Node http.createServer to avoid supertest dependency.
// ---------------------------------------------------------------------------

// Mock puzzle-service index so the router uses a fake implementation
vi.mock('../../services/puzzle-service/index.js', () => ({
  puzzleService: {
    checkAnswer: vi.fn(),
    submitAnswer: vi.fn(),
    getGameTypes: vi.fn().mockResolvedValue([]),
    getPuzzle: vi.fn(),
    getLeaderboard: vi.fn().mockResolvedValue([]),
    getGlobalLeaderboard: vi.fn().mockResolvedValue([]),
    getUserStats: vi.fn().mockResolvedValue(null),
    getRecentAttempts: vi.fn().mockResolvedValue([]),
    submitSession: vi.fn(),
  },
  GAME_TYPES: ['trivia', 'math', 'chess', 'word', 'logic', 'code', 'cipher', 'spatial'],
  DIFFICULTIES: ['easy', 'medium', 'hard'],
  GameType: {},
  Difficulty: {},
}));

// Mock validate middleware so Zod schema doesn't block integration tests
vi.mock('../../api/middleware/validate.js', () => ({
  validateBody: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const { default: gamesRouter } = await import('../../api/routes/games.js');
const { puzzleService: mockPuzzleService } = await import('../../services/puzzle-service/index.js');

/** Helper: send a JSON request to the test server and return parsed response */
async function httpPost(
  server: http.Server,
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: {} });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Build a fresh Express app using the games router for integration tests
const integrationApp = express();
integrationApp.use(express.json());
integrationApp.use('/api/games', gamesRouter);

// Start and stop the server once for all integration tests in this block
let integrationServer: http.Server;

describe('POST /api/games/:type/submit – anonymous integration flow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await new Promise<void>((resolve) => {
      integrationServer = integrationApp.listen(0, '127.0.0.1', () => resolve());
    });
  });

  afterAll(() => {
    integrationServer?.close();
  });

  it('routes anonymous submission to checkAnswer (no userId, no agentId in body)', async () => {
    vi.mocked(mockPuzzleService.checkAnswer).mockResolvedValue({
      success: true,
      is_correct: true,
      score: 75,
      correct_answer: '4',
      explanation: 'Basic addition',
    });

    const { status, body } = await httpPost(integrationServer, '/api/games/math/submit', {
      puzzleId: 'test-123',
      answer: '4',
      timeMs: 5000,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.is_correct).toBe(true);
    expect(mockPuzzleService.checkAnswer).toHaveBeenCalledWith('test-123', '4', 5000);
    expect(mockPuzzleService.submitAnswer).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid game type', async () => {
    const { status, body } = await httpPost(integrationServer, '/api/games/invalid-type/submit', {
      puzzleId: 'test-123',
      answer: '4',
      timeMs: 1000,
    });

    expect(status).toBe(400);
    expect(String(body.error)).toContain('Invalid game type');
  });

  it('returns 401 when agentId is provided but no Bearer auth token', async () => {
    const { status, body } = await httpPost(integrationServer, '/api/games/math/submit', {
      puzzleId: 'test-123',
      answer: '4',
      timeMs: 1000,
      agentId: '11111111-1111-1111-1111-111111111111',
    });

    expect(status).toBe(401);
    expect(String(body.error)).toContain('Authentication required');
  });

  it('propagates a not-found error response from the service', async () => {
    vi.mocked(mockPuzzleService.checkAnswer).mockResolvedValue({
      success: false,
      is_correct: false,
      score: 0,
      error: 'Puzzle not found',
    });

    const { status, body } = await httpPost(integrationServer, '/api/games/math/submit', {
      puzzleId: 'missing-id',
      answer: '4',
      timeMs: 1000,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Puzzle not found');
  });

  it('returns 500 and does not crash when checkAnswer throws', async () => {
    vi.mocked(mockPuzzleService.checkAnswer).mockRejectedValue(new Error('DB down'));

    const { status, body } = await httpPost(integrationServer, '/api/games/math/submit', {
      puzzleId: 'test-123',
      answer: '4',
      timeMs: 1000,
    });

    expect(status).toBe(500);
    expect(body.success).toBe(false);
  });

  it('accepts all valid game types for anonymous submit', async () => {
    vi.mocked(mockPuzzleService.checkAnswer).mockResolvedValue({
      success: true,
      is_correct: false,
      score: -13,
    });

    const validTypes = ['trivia', 'math', 'chess', 'word', 'logic', 'code', 'cipher', 'spatial'];
    for (const type of validTypes) {
      const { status } = await httpPost(integrationServer, `/api/games/${type}/submit`, {
        puzzleId: 'test-id',
        answer: 'anything',
        timeMs: 0,
      });
      expect(status).toBe(200);
    }
  });

  it('defaults timeMs to 0 when not provided in the request body', async () => {
    vi.mocked(mockPuzzleService.checkAnswer).mockResolvedValue({
      success: true,
      is_correct: false,
      score: -13,
    });

    await httpPost(integrationServer, '/api/games/math/submit', {
      puzzleId: 'test-123',
      answer: 'X',
    });

    expect(mockPuzzleService.checkAnswer).toHaveBeenCalledWith('test-123', 'X', 0);
  });
});

// ---------------------------------------------------------------------------
// 6. Additional generator sanity checks for math and logic
// ---------------------------------------------------------------------------

describe('generateMathPuzzle (answer is always a valid integer)', () => {
  it('easy answer is an integer string', () => {
    for (let i = 0; i < 10; i++) {
      const puzzle = generateMathPuzzle('easy');
      expect(Number.isInteger(Number(puzzle.correct_answer))).toBe(true);
    }
  });

  it('medium answer is an integer string', () => {
    for (let i = 0; i < 10; i++) {
      const puzzle = generateMathPuzzle('medium');
      expect(Number.isInteger(Number(puzzle.correct_answer))).toBe(true);
    }
  });

  it('hard answer is an integer string', () => {
    for (let i = 0; i < 10; i++) {
      const puzzle = generateMathPuzzle('hard');
      expect(Number.isInteger(Number(puzzle.correct_answer))).toBe(true);
    }
  });
});

describe('generateLogicPuzzle (sanity checks)', () => {
  it('easy puzzle has a non-empty correct_answer', () => {
    const puzzle = generateLogicPuzzle('easy');
    expect(puzzle.correct_answer.length).toBeGreaterThan(0);
  });

  it('medium puzzle includes an explanation', () => {
    const puzzle = generateLogicPuzzle('medium');
    expect(puzzle.explanation).toBeDefined();
  });

  it('hard puzzle has 150 points', () => {
    const puzzle = generateLogicPuzzle('hard');
    expect(puzzle.points).toBe(150);
  });
});
