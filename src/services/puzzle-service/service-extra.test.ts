/**
 * PuzzleService Additional Tests – getPuzzle(), submitSession(),
 * getLeaderboard(), getGlobalLeaderboard(), getUserStats(), getRecentAttempts()
 *
 * These tests cover the branches of service.ts that are not exercised by
 * puzzle-service.test.ts.  All external dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Supabase mock: aio_puzzles insert, aio_game_types, aio_game_leaderboards,
// aio_combined_game_leaderboard, aio_puzzle_attempts must all be wired up.
vi.mock('../../shared/utils/supabase.js', () => {
  const buildSelectChain = (result: { data: unknown; error: unknown }) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  });

  const MOCK_PUZZLE_ROW = {
    id: 'test-puzzle-123',
    puzzle_id: 'test-puzzle-123',
    game_type: 'math',
    difficulty: 'easy',
    question: 'What is 2 + 2?',
    correct_answer: '4',
    explanation: 'Basic addition',
    points: 50,
    time_limit_seconds: 30,
  };

  return {
    serviceClient: {
      // RPC mock — returns error by default to trigger fallback path
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'function not found' } }),
      from: vi.fn((table: string) => {
        if (table === 'aio_puzzles') {
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: MOCK_PUZZLE_ROW, error: null }),
          };
        }
        if (table === 'aio_puzzle_attempts') {
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'aio_game_types') {
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'aio_game_leaderboards') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'aio_combined_game_leaderboard') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return buildSelectChain({ data: null, error: null });
      }),
    },
    createUserClient: vi.fn(),
    extractToken: vi.fn(),
  };
});

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock all generator functions so getPuzzle does not need real generation logic
vi.mock('./generators/index.js', () => ({
  fetchTriviaQuestions: vi.fn().mockResolvedValue([
    {
      id: 'trivia-1', game_type: 'trivia', difficulty: 'easy',
      question: 'Capital of France?', correct_answer: 'Paris',
      explanation: 'Paris is the capital', points: 50, time_limit_seconds: 30,
      options: [{ id: 'A', text: 'Paris' }],
    },
  ]),
  generateMathPuzzle: vi.fn().mockReturnValue({
    id: 'math-1', game_type: 'math', difficulty: 'easy',
    question: 'What is 1+1?', correct_answer: '2',
    explanation: 'basic', points: 50, time_limit_seconds: 30,
  }),
  generateWordPuzzle: vi.fn().mockReturnValue({
    id: 'word-1', game_type: 'word', difficulty: 'easy',
    question: 'Unscramble: TAC', correct_answer: 'CAT',
    explanation: 'rearrange', points: 50, time_limit_seconds: 45,
  }),
  generateLogicPuzzle: vi.fn().mockReturnValue({
    id: 'logic-1', game_type: 'logic', difficulty: 'easy',
    question: 'Next in 1,2,3?', correct_answer: '4',
    explanation: 'sequence', points: 50, time_limit_seconds: 60,
  }),
  fetchLichessPuzzle: vi.fn().mockResolvedValue(null),
  generateChessPuzzle: vi.fn().mockReturnValue({
    id: 'chess-1', game_type: 'chess', difficulty: 'easy',
    question: 'Best move? FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR Theme: Opening',
    correct_answer: 'A',
    options: [{ id: 'A', text: 'e4' }, { id: 'B', text: 'd4' }, { id: 'C', text: 'Nf3' }, { id: 'D', text: 'c4' }],
    explanation: 'Best move: e4 (Opening)', points: 50, time_limit_seconds: 120,
  }),
  generateCodePuzzle: vi.fn().mockReturnValue({
    id: 'code-1', game_type: 'code', difficulty: 'easy',
    question: 'Find the bug:\nfunction x() {}', correct_answer: 'return value',
    explanation: 'missing return', points: 50, time_limit_seconds: 90,
  }),
  generateCipherPuzzle: vi.fn().mockReturnValue({
    id: 'cipher-1', game_type: 'cipher', difficulty: 'easy',
    question: 'Decode (shift +3): KHOOR', correct_answer: 'HELLO',
    explanation: 'shift back by 3', hint: 'The first letter is H',
    points: 50, time_limit_seconds: 60,
  }),
  generateSpatialPuzzle: vi.fn().mockReturnValue({
    id: 'spatial-1', game_type: 'spatial', difficulty: 'easy',
    question: 'Count X\'s:\nX . X\n. X .', correct_answer: '3',
    explanation: '3 X symbols', points: 50, time_limit_seconds: 45,
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { PuzzleService } = await import('./service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInitializedService() {
  const svc = new PuzzleService();
  (svc as unknown as { initialized: boolean }).initialized = true;
  return svc;
}

// ---------------------------------------------------------------------------
// getPuzzle() – all game types
// ---------------------------------------------------------------------------

describe('PuzzleService.getPuzzle()', () => {
  let service: InstanceType<typeof PuzzleService>;

  beforeEach(() => {
    service = makeInitializedService();
    vi.clearAllMocks();
  });

  it('returns a puzzle (without correct_answer) for math/easy', async () => {
    const puzzle = await service.getPuzzle('math', 'easy');
    expect(puzzle).not.toBeNull();
    expect(puzzle!.game_type).toBe('math');
    // correct_answer must be stripped from the returned object
    expect((puzzle as unknown as Record<string, unknown>).correct_answer).toBeUndefined();
    expect((puzzle as unknown as Record<string, unknown>).explanation).toBeUndefined();
  });

  it('returns a puzzle for trivia/easy', async () => {
    const puzzle = await service.getPuzzle('trivia', 'easy');
    expect(puzzle).not.toBeNull();
    expect(puzzle!.game_type).toBe('trivia');
    expect((puzzle as unknown as Record<string, unknown>).correct_answer).toBeUndefined();
  });

  it('returns null when trivia fetch returns no questions', async () => {
    const { fetchTriviaQuestions } = await import('./generators/index.js');
    vi.mocked(fetchTriviaQuestions).mockResolvedValueOnce([]);
    const puzzle = await service.getPuzzle('trivia', 'hard');
    expect(puzzle).toBeNull();
  });

  it('returns a puzzle for word/medium', async () => {
    const puzzle = await service.getPuzzle('word', 'medium');
    expect(puzzle).not.toBeNull();
    expect(puzzle!.game_type).toBe('word');
  });

  it('returns a puzzle for logic/hard', async () => {
    const puzzle = await service.getPuzzle('logic', 'hard');
    expect(puzzle).not.toBeNull();
    expect(puzzle!.game_type).toBe('logic');
  });

  it('returns a puzzle for chess/easy (falls back to local generator when Lichess returns null)', async () => {
    const puzzle = await service.getPuzzle('chess', 'easy');
    expect(puzzle).not.toBeNull();
    expect(puzzle!.game_type).toBe('chess');
  });

  it('returns a puzzle for code/medium', async () => {
    const puzzle = await service.getPuzzle('code', 'medium');
    expect(puzzle).not.toBeNull();
    expect(puzzle!.game_type).toBe('code');
  });

  it('returns a puzzle for cipher/hard', async () => {
    const puzzle = await service.getPuzzle('cipher', 'hard');
    expect(puzzle).not.toBeNull();
    expect(puzzle!.game_type).toBe('cipher');
  });

  it('returns a puzzle for spatial/easy', async () => {
    const puzzle = await service.getPuzzle('spatial', 'easy');
    expect(puzzle).not.toBeNull();
    expect(puzzle!.game_type).toBe('spatial');
  });

  it('returned puzzle always has required Puzzle fields (id, question, points, time_limit)', async () => {
    const puzzle = await service.getPuzzle('code', 'easy');
    expect(typeof puzzle!.id).toBe('string');
    expect(typeof puzzle!.question).toBe('string');
    expect(typeof puzzle!.points).toBe('number');
    expect(typeof puzzle!.time_limit_seconds).toBe('number');
  });

  it('returns null for an unknown game type', async () => {
    const puzzle = await service.getPuzzle(
      'nonexistent' as unknown as import('./types.js').GameType,
      'easy'
    );
    expect(puzzle).toBeNull();
  });

  it('returns null when DB insert fails (puzzle would be unscoreable)', async () => {
    // Override aio_puzzles insert to throw
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockRejectedValue(new Error('DB write error')),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as unknown as ReturnType<typeof serviceClient.from>));

    // Should return null — an unstored puzzle cannot be scored later
    const puzzle = await service.getPuzzle('math', 'easy');
    expect(puzzle).toBeNull();
  });

  it('getPuzzle on uninitialized service skips DB store and still returns puzzle', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const puzzle = await uninitialized.getPuzzle('code', 'easy');
    expect(puzzle).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getGameTypes() – fallback when not initialized
// ---------------------------------------------------------------------------

describe('PuzzleService.getGameTypes()', () => {
  it('returns fallback game types when not initialized', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const types = await uninitialized.getGameTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    // All entries should have required fields
    for (const t of types) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(Array.isArray(t.difficulty_levels)).toBe(true);
    }
  });

  it('fallback includes trivia, math, word, logic types', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const types = await uninitialized.getGameTypes();
    const ids = types.map(t => t.id);
    expect(ids).toContain('trivia');
    expect(ids).toContain('math');
    expect(ids).toContain('word');
    expect(ids).toContain('logic');
  });
});

// ---------------------------------------------------------------------------
// getLeaderboard() – uninitialized returns empty array
// ---------------------------------------------------------------------------

describe('PuzzleService.getLeaderboard()', () => {
  it('returns empty array when not initialized', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const result = await uninitialized.getLeaderboard('math');
    expect(result).toEqual([]);
  });

  it('returns array (possibly empty) when initialized and DB returns data', async () => {
    const service = makeInitializedService();
    const result = await service.getLeaderboard('math', 10);
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array when DB query returns an error', async () => {
    const service = makeInitializedService();
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    } as unknown as ReturnType<typeof serviceClient.from>));

    const result = await service.getLeaderboard('chess');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getGlobalLeaderboard() – uninitialized returns empty array
// ---------------------------------------------------------------------------

describe('PuzzleService.getGlobalLeaderboard()', () => {
  it('returns empty array when not initialized', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const result = await uninitialized.getGlobalLeaderboard();
    expect(result).toEqual([]);
  });

  it('returns array when initialized and DB returns data', async () => {
    const service = makeInitializedService();
    const result = await service.getGlobalLeaderboard(5);
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array when DB query errors', async () => {
    const service = makeInitializedService();
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'query failed' } }),
    } as unknown as ReturnType<typeof serviceClient.from>));

    const result = await service.getGlobalLeaderboard();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getUserStats() – uninitialized returns null
// ---------------------------------------------------------------------------

describe('PuzzleService.getUserStats()', () => {
  it('returns null when not initialized', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const result = await uninitialized.getUserStats('user-123');
    expect(result).toBeNull();
  });

  it('returns null when DB query returns an error (with gameType)', async () => {
    const service = makeInitializedService();
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    } as unknown as ReturnType<typeof serviceClient.from>));

    const result = await service.getUserStats('user-123', 'math');
    expect(result).toBeNull();
  });

  it('returns empty array when no gameType and DB returns error', async () => {
    const service = makeInitializedService();
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'query failed' } }),
    } as unknown as ReturnType<typeof serviceClient.from>));

    const result = await service.getUserStats('user-123');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getRecentAttempts() – uninitialized returns empty array
// ---------------------------------------------------------------------------

describe('PuzzleService.getRecentAttempts()', () => {
  it('returns empty array when not initialized', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const result = await uninitialized.getRecentAttempts('user-123');
    expect(result).toEqual([]);
  });

  it('returns array when initialized', async () => {
    const service = makeInitializedService();
    const result = await service.getRecentAttempts('user-123', 5);
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array when DB query returns an error', async () => {
    const service = makeInitializedService();
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'query failed' } }),
    } as unknown as ReturnType<typeof serviceClient.from>));

    const result = await service.getRecentAttempts('user-123');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// submitSession() – uninitialized returns error; DB paths exercised
// ---------------------------------------------------------------------------

describe('PuzzleService.submitSession()', () => {
  it('returns error when not initialized', async () => {
    const uninitialized = new PuzzleService();
    (uninitialized as unknown as { initialized: boolean }).initialized = false;
    const result = await uninitialized.submitSession('math', 'user-123', {
      score: 100, correctCount: 3, totalQuestions: 5, timeSpentMs: 30000,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not initialized');
  });

  it('returns success when initialized and upsert succeeds', async () => {
    const service = makeInitializedService();

    // Wire aio_game_leaderboards select (existing score lookup) then upsert
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementation((table: string) => {
      if (table === 'aio_game_leaderboards') {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { total_score: 200, sessions_completed: 2 }, error: null }),
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        return chain as unknown as ReturnType<typeof serviceClient.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof serviceClient.from>;
    });

    const result = await service.submitSession('math', 'user-123', {
      score: 500, correctCount: 5, totalQuestions: 5, timeSpentMs: 20000,
    });
    expect(result.success).toBe(true);
    expect(result.bestScore).toBe(500); // New score (500) beats existing (200)
  });

  it('keeps existing best score when new score is lower', async () => {
    const service = makeInitializedService();
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementation((table: string) => {
      if (table === 'aio_game_leaderboards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { total_score: 1000, sessions_completed: 5 }, error: null }),
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as unknown as ReturnType<typeof serviceClient.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof serviceClient.from>;
    });

    const result = await service.submitSession('math', 'user-123', {
      score: 100, correctCount: 2, totalQuestions: 5, timeSpentMs: 60000,
    });
    expect(result.success).toBe(true);
    expect(result.bestScore).toBe(1000); // Existing score wins
  });

  it('returns failure when upsert returns a database error', async () => {
    const service = makeInitializedService();
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    vi.mocked(serviceClient.from).mockImplementation((table: string) => {
      if (table === 'aio_game_leaderboards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ data: null, error: { message: 'constraint violation' } }),
        } as unknown as ReturnType<typeof serviceClient.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof serviceClient.from>;
    });

    const result = await service.submitSession('chess', 'user-123', {
      score: 300, correctCount: 3, totalQuestions: 3, timeSpentMs: 45000,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to update leaderboard');
  });

  it('calculates accuracy as 100% when all answers are correct', async () => {
    const service = makeInitializedService();
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    let capturedUpsertData: Record<string, unknown> | null = null;

    vi.mocked(serviceClient.from).mockImplementation((table: string) => {
      if (table === 'aio_game_leaderboards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            capturedUpsertData = data;
            return Promise.resolve({ data: null, error: null });
          }),
        } as unknown as ReturnType<typeof serviceClient.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof serviceClient.from>;
    });

    await service.submitSession('code', 'user-abc', {
      score: 200, correctCount: 4, totalQuestions: 4, timeSpentMs: 10000,
    });

    expect(capturedUpsertData).not.toBeNull();
    expect((capturedUpsertData as unknown as Record<string, unknown>).accuracy).toBe(100);
  });

  it('calculates accuracy as 0% when totalQuestions is 0', async () => {
    const service = makeInitializedService();
    const { serviceClient } = await import('../../shared/utils/supabase.js');
    let capturedData: Record<string, unknown> | null = null;

    vi.mocked(serviceClient.from).mockImplementation((table: string) => {
      if (table === 'aio_game_leaderboards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            capturedData = data;
            return Promise.resolve({ data: null, error: null });
          }),
        } as unknown as ReturnType<typeof serviceClient.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof serviceClient.from>;
    });

    await service.submitSession('cipher', 'user-abc', {
      score: 0, correctCount: 0, totalQuestions: 0, timeSpentMs: 0,
    });

    expect(capturedData).not.toBeNull();
    expect((capturedData as unknown as Record<string, unknown>).accuracy).toBe(0);
  });
});
