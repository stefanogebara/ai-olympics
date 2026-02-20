/**
 * Supplementary Generator Tests
 *
 * Covers branches and utility functions not reached by puzzle-service.test.ts:
 *
 * logic.ts  - All difficulty levels and pattern types (arithmetic, alternating,
 *             fibonacci, prime, triangular, power, look-and-say, square)
 * trivia.ts - fetchTriviaQuestions success/failure/circuit-open paths
 * word.ts   - Anagram, analogy, hidden-word puzzle types across difficulties
 * utils.ts  - shuffle(), decodeHtml(), puzzleId(), difficultyPoints()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks -- declared before dynamic imports
// ---------------------------------------------------------------------------

vi.mock('../../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockCircuitExecute = vi.fn(async (fn: () => Promise<unknown>) => fn());

vi.mock('../../../shared/utils/circuit-breaker.js', () => ({
  circuits: {
    opentdb: { execute: (fn: () => Promise<unknown>) => mockCircuitExecute(fn) },
  },
  CircuitOpenError: class CircuitOpenError extends Error {
    constructor(msg?: string) {
      super(msg);
      this.name = 'CircuitOpenError';
    }
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { generateLogicPuzzle } from './logic.js';
import { fetchTriviaQuestions } from './trivia.js';
import { generateWordPuzzle } from './word.js';
import { shuffle, decodeHtml, puzzleId, difficultyPoints } from '../utils.js';

// ===========================================================================
//  generateLogicPuzzle
// ===========================================================================

describe('generateLogicPuzzle', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Easy difficulty
  // -------------------------------------------------------------------------

  describe('easy difficulty', () => {
    it('returns arithmetic sequence puzzle when patternType=0', () => {
      // patternType = Math.floor(random * 2) => need random < 0.5 => 0
      randomSpy
        .mockReturnValueOnce(0.1) // patternType = Math.floor(0.1*2) = 0
        .mockReturnValueOnce(0.5) // start = Math.floor(0.5*10) = 5
        .mockReturnValueOnce(0.4); // step = Math.floor(0.4*5)+2 = 4

      const puzzle = generateLogicPuzzle('easy');
      expect(puzzle.question).toContain('What comes next in this sequence?');
      expect(puzzle.question).toContain('5, 9, 13, 17');
    });

    it('arithmetic: correct_answer equals start + 4*step', () => {
      randomSpy
        .mockReturnValueOnce(0.0) // patternType = 0
        .mockReturnValueOnce(0.3) // start = Math.floor(0.3*10) = 3
        .mockReturnValueOnce(0.6); // step = Math.floor(0.6*5)+2 = 5

      const puzzle = generateLogicPuzzle('easy');
      // start=3, step=5 => 3,8,13,18 => next=23
      expect(puzzle.correct_answer).toBe('23');
    });

    it('returns alternating pattern puzzle when patternType=1', () => {
      // patternType = Math.floor(random * 2) => need random >= 0.5 => 1
      randomSpy
        .mockReturnValueOnce(0.9) // patternType = Math.floor(0.9*2) = 1
        .mockReturnValueOnce(0.0); // a = Math.floor(0.0*5)+1 = 1

      const puzzle = generateLogicPuzzle('easy');
      // a=1, b=10, seq = [1,10,2,20,3,30]
      expect(puzzle.question).toContain('What comes next?');
      expect(puzzle.question).toContain('1, 10, 2, 20, 3, 30');
    });

    it('alternating: correct_answer equals a+3', () => {
      randomSpy
        .mockReturnValueOnce(0.7) // patternType = 1
        .mockReturnValueOnce(0.6); // a = Math.floor(0.6*5)+1 = 4

      const puzzle = generateLogicPuzzle('easy');
      // a=4, a+3=7
      expect(puzzle.correct_answer).toBe('7');
    });

    it('easy puzzles have 50 points and 45s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.5);

      const puzzle = generateLogicPuzzle('easy');
      expect(puzzle.points).toBe(50);
      expect(puzzle.time_limit_seconds).toBe(45);
    });

    it('returns puzzle with game_type logic', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.5);

      const puzzle = generateLogicPuzzle('easy');
      expect(puzzle.game_type).toBe('logic');
    });

    it('arithmetic puzzle has explanation mentioning the step', () => {
      randomSpy
        .mockReturnValueOnce(0.0) // patternType=0
        .mockReturnValueOnce(0.0) // start=0
        .mockReturnValueOnce(0.0); // step=Math.floor(0)+2=2

      const puzzle = generateLogicPuzzle('easy');
      expect(puzzle.explanation).toContain('increases by 2');
    });

    it('alternating puzzle has explanation mentioning interleaved sequences', () => {
      randomSpy
        .mockReturnValueOnce(0.5) // patternType=1
        .mockReturnValueOnce(0.0); // a=1

      const puzzle = generateLogicPuzzle('easy');
      expect(puzzle.explanation).toContain('interleaved');
    });

    it('easy puzzle difficulty field is easy', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);
      const puzzle = generateLogicPuzzle('easy');
      expect(puzzle.difficulty).toBe('easy');
    });
  });

  // -------------------------------------------------------------------------
  // Medium difficulty
  // -------------------------------------------------------------------------

  describe('medium difficulty', () => {
    it('returns fibonacci-like puzzle when patternType=0', () => {
      // patternType = Math.floor(random * 3) => need random < 1/3 => 0
      randomSpy
        .mockReturnValueOnce(0.1) // patternType = 0
        .mockReturnValueOnce(0.0) // a = Math.floor(0*5)+1 = 1
        .mockReturnValueOnce(0.0); // b = Math.floor(0*5)+1 = 1

      const puzzle = generateLogicPuzzle('medium');
      expect(puzzle.question).toContain('What comes next?');
      // a=1,b=1 => seq=[1,1,2,3,5]
      expect(puzzle.question).toContain('1, 1, 2, 3, 5');
    });

    it('fibonacci: correct_answer is sum of last two', () => {
      randomSpy
        .mockReturnValueOnce(0.1) // patternType=0
        .mockReturnValueOnce(0.0) // a=1
        .mockReturnValueOnce(0.0); // b=1

      const puzzle = generateLogicPuzzle('medium');
      // seq=[1,1,2,3,5], answer = 3+5 = 8
      expect(puzzle.correct_answer).toBe('8');
    });

    it('returns prime number puzzle when patternType=1', () => {
      // patternType = Math.floor(random * 3) => need 1/3 <= random < 2/3
      randomSpy
        .mockReturnValueOnce(0.4) // patternType = Math.floor(0.4*3) = 1
        .mockReturnValueOnce(0.0); // startIdx = Math.floor(0*5) = 0

      const puzzle = generateLogicPuzzle('medium');
      // primes from idx 0: [2,3,5,7,11]
      expect(puzzle.question).toContain('2, 3, 5, 7, 11');
    });

    it('prime: correct_answer is next prime in sequence', () => {
      randomSpy
        .mockReturnValueOnce(0.4) // patternType=1
        .mockReturnValueOnce(0.0); // startIdx=0

      const puzzle = generateLogicPuzzle('medium');
      // primes[5] = 13
      expect(puzzle.correct_answer).toBe('13');
    });

    it('prime puzzle with startIdx=2 shows correct primes', () => {
      randomSpy
        .mockReturnValueOnce(0.4) // patternType=1
        .mockReturnValueOnce(0.4); // startIdx = Math.floor(0.4*5) = 2

      const puzzle = generateLogicPuzzle('medium');
      // primes from idx 2: [5,7,11,13,17], answer=primes[7]=19
      expect(puzzle.question).toContain('5, 7, 11, 13, 17');
      expect(puzzle.correct_answer).toBe('19');
    });

    it('returns triangular number puzzle when patternType=2', () => {
      // patternType = Math.floor(random * 3) => need random >= 2/3
      randomSpy
        .mockReturnValueOnce(0.8) // patternType = Math.floor(0.8*3) = 2
        .mockReturnValueOnce(0.0); // startIdx=0

      const puzzle = generateLogicPuzzle('medium');
      // triangular from idx 0: [1,3,6,10]
      expect(puzzle.question).toContain('1, 3, 6, 10');
    });

    it('triangular: correct_answer is next triangular number', () => {
      randomSpy
        .mockReturnValueOnce(0.7) // patternType = Math.floor(0.7*3) = 2
        .mockReturnValueOnce(0.0); // startIdx=0

      const puzzle = generateLogicPuzzle('medium');
      // triangular[4] = 15
      expect(puzzle.correct_answer).toBe('15');
    });

    it('triangular puzzle with startIdx=3 shows correct numbers', () => {
      randomSpy
        .mockReturnValueOnce(0.9) // patternType=2
        .mockReturnValueOnce(0.6); // startIdx = Math.floor(0.6*5) = 3

      const puzzle = generateLogicPuzzle('medium');
      // triangular from idx 3: [10,15,21,28], answer=triangular[7]=36
      expect(puzzle.question).toContain('10, 15, 21, 28');
      expect(puzzle.correct_answer).toBe('36');
    });

    it('medium puzzles have 100 points and 60s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);

      const puzzle = generateLogicPuzzle('medium');
      expect(puzzle.points).toBe(100);
      expect(puzzle.time_limit_seconds).toBe(60);
    });

    it('fibonacci explanation mentions sum of previous two', () => {
      randomSpy
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);
      const puzzle = generateLogicPuzzle('medium');
      expect(puzzle.explanation).toContain('sum of the previous two');
    });

    it('prime explanation mentions consecutive prime numbers', () => {
      randomSpy
        .mockReturnValueOnce(0.4)
        .mockReturnValueOnce(0.0);
      const puzzle = generateLogicPuzzle('medium');
      expect(puzzle.explanation).toContain('prime numbers');
    });

    it('triangular explanation mentions differences', () => {
      randomSpy
        .mockReturnValueOnce(0.7)
        .mockReturnValueOnce(0.0);
      const puzzle = generateLogicPuzzle('medium');
      expect(puzzle.explanation).toContain('each difference increases by 1');
    });
  });

  // -------------------------------------------------------------------------
  // Hard difficulty
  // -------------------------------------------------------------------------

  describe('hard difficulty', () => {
    it('returns power sequence puzzle when patternType=0', () => {
      // patternType = Math.floor(random * 3) => need < 1/3
      randomSpy
        .mockReturnValueOnce(0.1) // patternType=0
        .mockReturnValueOnce(0.0); // base = Math.floor(0*5)+2 = 2

      const puzzle = generateLogicPuzzle('hard');
      // base=2: [1,2,4,8]
      expect(puzzle.question).toContain('1, 2, 4, 8');
    });

    it('power: correct_answer is base^4', () => {
      randomSpy
        .mockReturnValueOnce(0.0) // patternType=0
        .mockReturnValueOnce(0.2); // base = Math.floor(0.2*5)+2 = 3

      const puzzle = generateLogicPuzzle('hard');
      // base=3: [1,3,9,27], answer=81
      expect(puzzle.correct_answer).toBe('81');
    });

    it('power sequence with base=5', () => {
      randomSpy
        .mockReturnValueOnce(0.0) // patternType=0
        .mockReturnValueOnce(0.6); // base = Math.floor(0.6*5)+2 = 5

      const puzzle = generateLogicPuzzle('hard');
      // base=5: [1,5,25,125], answer=625
      expect(puzzle.question).toContain('1, 5, 25, 125');
      expect(puzzle.correct_answer).toBe('625');
    });

    it('returns look-and-say puzzle when patternType=1', () => {
      randomSpy.mockReturnValueOnce(0.4); // patternType = Math.floor(0.4*3) = 1

      const puzzle = generateLogicPuzzle('hard');
      expect(puzzle.question).toContain('look-and-say');
      expect(puzzle.question).toContain('1, 11, 21, 1211');
    });

    it('look-and-say: correct_answer is 111221', () => {
      randomSpy.mockReturnValueOnce(0.5); // patternType=1

      const puzzle = generateLogicPuzzle('hard');
      expect(puzzle.correct_answer).toBe('111221');
    });

    it('look-and-say explanation describes the pattern', () => {
      randomSpy.mockReturnValueOnce(0.4);
      const puzzle = generateLogicPuzzle('hard');
      expect(puzzle.explanation).toContain('describes the previous');
    });

    it('returns square number puzzle when patternType=2', () => {
      randomSpy
        .mockReturnValueOnce(0.8) // patternType = Math.floor(0.8*3) = 2
        .mockReturnValueOnce(0.0); // startIdx=0

      const puzzle = generateLogicPuzzle('hard');
      // squares from idx 0: [1,4,9,16]
      expect(puzzle.question).toContain('1, 4, 9, 16');
    });

    it('square: correct_answer is next perfect square', () => {
      randomSpy
        .mockReturnValueOnce(0.7) // patternType=2
        .mockReturnValueOnce(0.0); // startIdx=0

      const puzzle = generateLogicPuzzle('hard');
      // squares[4] = 25
      expect(puzzle.correct_answer).toBe('25');
    });

    it('square puzzle with startIdx=2', () => {
      randomSpy
        .mockReturnValueOnce(0.9) // patternType=2
        .mockReturnValueOnce(0.8); // startIdx = Math.floor(0.8*3) = 2

      const puzzle = generateLogicPuzzle('hard');
      // squares from idx 2: [9,16,25,36], answer=squares[6]=49
      expect(puzzle.question).toContain('9, 16, 25, 36');
      expect(puzzle.correct_answer).toBe('49');
    });

    it('hard puzzles have 150 points and 90s time limit', () => {
      randomSpy.mockReturnValueOnce(0.4);
      const puzzle = generateLogicPuzzle('hard');
      expect(puzzle.points).toBe(150);
      expect(puzzle.time_limit_seconds).toBe(90);
    });

    it('power explanation mentions powers of base', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);
      const puzzle = generateLogicPuzzle('hard');
      expect(puzzle.explanation).toContain('Powers of');
    });

    it('square explanation mentions perfect squares', () => {
      randomSpy
        .mockReturnValueOnce(0.7)
        .mockReturnValueOnce(0.0);
      const puzzle = generateLogicPuzzle('hard');
      expect(puzzle.explanation).toContain('Perfect squares');
    });

    it('hard puzzle has game_type logic and difficulty hard', () => {
      randomSpy.mockReturnValueOnce(0.4);
      const puzzle = generateLogicPuzzle('hard');
      expect(puzzle.game_type).toBe('logic');
      expect(puzzle.difficulty).toBe('hard');
    });
  });

  // -------------------------------------------------------------------------
  // Common
  // -------------------------------------------------------------------------

  describe('common properties', () => {
    it('puzzle id starts with logic-', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);

      const puzzle = generateLogicPuzzle('easy');
      expect(puzzle.id).toMatch(/^logic-/);
    });

    it('generates unique IDs on repeated calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        randomSpy
          .mockReturnValueOnce(0.0)
          .mockReturnValueOnce(0.0)
          .mockReturnValueOnce(0.0);
        ids.add(generateLogicPuzzle('easy').id);
      }
      expect(ids.size).toBe(10);
    });
  });
});

// ===========================================================================
//  fetchTriviaQuestions
// ===========================================================================

describe('fetchTriviaQuestions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const TRIVIA_RESPONSE = {
    response_code: 0,
    results: [
      {
        category: 'Science',
        type: 'multiple',
        difficulty: 'easy',
        question: 'What is H2O?',
        correct_answer: 'Water',
        incorrect_answers: ['Fire', 'Earth', 'Air'],
      },
    ],
  };

  const makeFetchResponse = (data: unknown, ok = true) =>
    ({
      ok,
      json: () => Promise.resolve(data),
    }) as unknown as Response;

  beforeEach(() => {
    mockCircuitExecute.mockImplementation(async (fn) => fn());
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse(TRIVIA_RESPONSE),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------

  it('calls fetch with correct URL and easy difficulty', async () => {
    await fetchTriviaQuestions('easy');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://opentdb.com/api.php?amount=10&difficulty=easy&type=multiple',
    );
  });

  it('maps medium difficulty correctly in the URL', async () => {
    await fetchTriviaQuestions('medium');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://opentdb.com/api.php?amount=10&difficulty=medium&type=multiple',
    );
  });

  it('maps hard difficulty correctly in the URL', async () => {
    await fetchTriviaQuestions('hard');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://opentdb.com/api.php?amount=10&difficulty=hard&type=multiple',
    );
  });

  it('returns PuzzleWithAnswer array on success', async () => {
    const puzzles = await fetchTriviaQuestions('easy');
    expect(Array.isArray(puzzles)).toBe(true);
    expect(puzzles.length).toBe(1);
  });

  it('each puzzle has 4 options labelled A, B, C, D', async () => {
    const puzzles = await fetchTriviaQuestions('easy');
    const puzzle = puzzles[0];
    expect(puzzle.options).toHaveLength(4);
    const ids = puzzle.options!.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']));
  });

  it('correct_answer is the letter matching the correct option', async () => {
    const puzzles = await fetchTriviaQuestions('easy');
    const puzzle = puzzles[0];
    const correctLetter = puzzle.correct_answer;
    expect(['A', 'B', 'C', 'D']).toContain(correctLetter);
    // The option with that letter should have text 'Water'
    const correctOption = puzzle.options!.find((o) => o.id === correctLetter);
    expect(correctOption!.text).toBe('Water');
  });

  it('decodes HTML entities in question and answers', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({
        response_code: 0,
        results: [
          {
            category: 'Science',
            type: 'multiple',
            difficulty: 'easy',
            question: 'What &amp; where is &quot;H2O&quot;?',
            correct_answer: 'It&#039;s Water',
            incorrect_answers: ['Fire &amp; Ice', 'Earth', 'Air'],
          },
        ],
      }),
    );

    const puzzles = await fetchTriviaQuestions('easy');
    const puzzle = puzzles[0];
    expect(puzzle.question).toBe('What & where is "H2O"?');
    const correctOption = puzzle.options!.find(
      (o) => o.id === puzzle.correct_answer,
    );
    expect(correctOption!.text).toBe("It's Water");
  });

  it('uses difficultyPoints for points value', async () => {
    const easyPuzzles = await fetchTriviaQuestions('easy');
    expect(easyPuzzles[0].points).toBe(difficultyPoints('easy'));
  });

  it('puzzles have game_type trivia', async () => {
    const puzzles = await fetchTriviaQuestions('easy');
    expect(puzzles[0].game_type).toBe('trivia');
  });

  it('puzzles have time_limit_seconds of 30', async () => {
    const puzzles = await fetchTriviaQuestions('easy');
    expect(puzzles[0].time_limit_seconds).toBe(30);
  });

  it('uses default amount=10', async () => {
    await fetchTriviaQuestions('easy');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('amount=10'),
    );
  });

  it('passes custom amount parameter', async () => {
    await fetchTriviaQuestions('medium', 5);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://opentdb.com/api.php?amount=5&difficulty=medium&type=multiple',
    );
  });

  it('maps multiple results correctly', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({
        response_code: 0,
        results: [
          {
            category: 'Science',
            type: 'multiple',
            difficulty: 'easy',
            question: 'Q1',
            correct_answer: 'A1',
            incorrect_answers: ['B1', 'C1', 'D1'],
          },
          {
            category: 'History',
            type: 'multiple',
            difficulty: 'easy',
            question: 'Q2',
            correct_answer: 'A2',
            incorrect_answers: ['B2', 'C2', 'D2'],
          },
        ],
      }),
    );

    const puzzles = await fetchTriviaQuestions('easy', 2);
    expect(puzzles).toHaveLength(2);
    expect(puzzles[0].question).toBe('Q1');
    expect(puzzles[1].question).toBe('Q2');
  });

  // -------------------------------------------------------------------------
  // Error paths
  // -------------------------------------------------------------------------

  it('returns empty array on CircuitOpenError', async () => {
    const { CircuitOpenError } = await import(
      '../../../shared/utils/circuit-breaker.js'
    );
    mockCircuitExecute.mockRejectedValueOnce(
      new CircuitOpenError('opentdb circuit open'),
    );
    const puzzles = await fetchTriviaQuestions('easy');
    expect(puzzles).toEqual([]);
  });

  it('returns empty array on other errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));
    const puzzles = await fetchTriviaQuestions('easy');
    expect(puzzles).toEqual([]);
  });

  it('throws internally when response is not ok (caught by outer try)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({}, false),
    );
    // The throw is caught by the outer catch, resulting in empty array
    const puzzles = await fetchTriviaQuestions('hard');
    expect(puzzles).toEqual([]);
  });

  it('throws internally when response_code !== 0 (caught by outer try)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({ response_code: 1, results: [] }),
    );
    const puzzles = await fetchTriviaQuestions('medium');
    expect(puzzles).toEqual([]);
  });
});

// ===========================================================================
//  generateWordPuzzle
// ===========================================================================

describe('generateWordPuzzle', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Anagram (puzzleType < 0.6)
  // -------------------------------------------------------------------------

  describe('anagram puzzles', () => {
    it('returns anagram puzzle when puzzleType < 0.6', () => {
      randomSpy
        .mockReturnValueOnce(0.3) // puzzleType = 0.3 < 0.6 => anagram
        .mockReturnValueOnce(0.0); // word index = 0 => first word
      // Remaining random calls for shuffle use the default mock (returns 0)

      const puzzle = generateWordPuzzle('easy');
      expect(puzzle.question).toContain('Unscramble this word:');
    });

    it('uses EASY_WORDS for easy difficulty', () => {
      // EASY_WORDS[0] = 'APPLE'
      randomSpy
        .mockReturnValueOnce(0.0) // puzzleType=0 => anagram
        .mockReturnValueOnce(0.0); // word index=0 => APPLE

      const puzzle = generateWordPuzzle('easy');
      expect(puzzle.correct_answer).toBe('APPLE');
    });

    it('uses MEDIUM_WORDS for medium difficulty', () => {
      // MEDIUM_WORDS[0] = 'CRYSTAL'
      randomSpy
        .mockReturnValueOnce(0.0) // puzzleType=0 => anagram
        .mockReturnValueOnce(0.0); // word index=0

      const puzzle = generateWordPuzzle('medium');
      expect(puzzle.correct_answer).toBe('CRYSTAL');
    });

    it('uses HARD_WORDS for hard difficulty', () => {
      // HARD_WORDS[0] = 'SYMPHONY'
      randomSpy
        .mockReturnValueOnce(0.0) // puzzleType=0 => anagram
        .mockReturnValueOnce(0.0); // word index=0

      const puzzle = generateWordPuzzle('hard');
      expect(puzzle.correct_answer).toBe('SYMPHONY');
    });

    it('scrambled word differs from the original word', () => {
      // Use a real random to test the do-while scramble loop
      randomSpy.mockRestore();

      const puzzle = generateWordPuzzle('easy');
      if (puzzle.question.includes('Unscramble')) {
        const scrambled = puzzle.question.replace('Unscramble this word: ', '');
        // For multi-character words, scrambled should differ
        if (puzzle.correct_answer.length > 1) {
          expect(scrambled).not.toBe(puzzle.correct_answer);
        }
      }
    });

    it('correct_answer is the original unscrambled word', () => {
      randomSpy
        .mockReturnValueOnce(0.1) // anagram
        .mockReturnValueOnce(0.0); // first word

      const puzzle = generateWordPuzzle('easy');
      // EASY_WORDS[0] = 'APPLE'
      expect(puzzle.correct_answer).toBe('APPLE');
    });

    it('includes hint with letter count and first letter', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);

      const puzzle = generateWordPuzzle('easy');
      // APPLE has 5 letters and starts with A
      expect(puzzle.hint).toContain('5 letters');
      expect(puzzle.hint).toContain('starts with A');
    });

    it('points match difficultyPoints', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);
      const easyPuzzle = generateWordPuzzle('easy');
      expect(easyPuzzle.points).toBe(difficultyPoints('easy'));

      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);
      const medPuzzle = generateWordPuzzle('medium');
      expect(medPuzzle.points).toBe(difficultyPoints('medium'));

      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);
      const hardPuzzle = generateWordPuzzle('hard');
      expect(hardPuzzle.points).toBe(difficultyPoints('hard'));
    });
  });

  // -------------------------------------------------------------------------
  // Analogy (0.6 <= puzzleType < 0.8)
  // -------------------------------------------------------------------------

  describe('analogy puzzles', () => {
    it('returns analogy puzzle when 0.6 <= puzzleType < 0.8', () => {
      randomSpy
        .mockReturnValueOnce(0.7) // puzzleType=0.7 => analogy
        .mockReturnValueOnce(0.0); // analogy index=0

      const puzzle = generateWordPuzzle('easy');
      // ANALOGIES[0] = { q: 'Hot is to Cold as Light is to ___', a: 'DARK' }
      expect(puzzle.question).toContain('Hot is to Cold as Light is to ___');
    });

    it('question matches an ANALOGIES entry', () => {
      randomSpy
        .mockReturnValueOnce(0.6) // puzzleType=0.6 => analogy
        .mockReturnValueOnce(0.0); // index=0

      const puzzle = generateWordPuzzle('medium');
      expect(puzzle.question).toBe('Hot is to Cold as Light is to ___');
    });

    it('correct_answer matches analogy answer', () => {
      randomSpy
        .mockReturnValueOnce(0.65) // analogy
        .mockReturnValueOnce(0.0); // first analogy

      const puzzle = generateWordPuzzle('easy');
      expect(puzzle.correct_answer).toBe('DARK');
    });

    it('includes hint with letter count', () => {
      randomSpy
        .mockReturnValueOnce(0.7)
        .mockReturnValueOnce(0.0);

      const puzzle = generateWordPuzzle('easy');
      // DARK has 4 letters
      expect(puzzle.hint).toContain('4 letters');
    });

    it('second analogy entry works correctly', () => {
      // ANALOGIES[1] = { q: 'Bird is to Nest as Bee is to ___', a: 'HIVE' }
      randomSpy
        .mockReturnValueOnce(0.7) // analogy
        .mockReturnValueOnce(1 / 12); // index = Math.floor((1/12)*12) = 1

      const puzzle = generateWordPuzzle('medium');
      expect(puzzle.question).toContain('Bird is to Nest as Bee is to ___');
      expect(puzzle.correct_answer).toBe('HIVE');
    });
  });

  // -------------------------------------------------------------------------
  // Hidden word (puzzleType >= 0.8)
  // -------------------------------------------------------------------------

  describe('hidden word puzzles', () => {
    it('returns hidden word puzzle when puzzleType >= 0.8', () => {
      randomSpy
        .mockReturnValueOnce(0.85) // puzzleType=0.85 => hidden word
        .mockReturnValueOnce(0.0); // hw index=0

      const puzzle = generateWordPuzzle('easy');
      expect(puzzle.question).toContain('Find the hidden word:');
    });

    it('question includes sentence from HIDDEN_WORDS', () => {
      // HIDDEN_WORDS[0] = { sentence: 'The **cat**astrophe was terrible', answer: 'CAT' }
      randomSpy
        .mockReturnValueOnce(0.9) // hidden word
        .mockReturnValueOnce(0.0); // index=0

      const puzzle = generateWordPuzzle('easy');
      expect(puzzle.question).toContain('The **cat**astrophe was terrible');
    });

    it('correct_answer matches hidden word answer', () => {
      randomSpy
        .mockReturnValueOnce(0.95) // hidden word
        .mockReturnValueOnce(0.0); // index=0

      const puzzle = generateWordPuzzle('easy');
      expect(puzzle.correct_answer).toBe('CAT');
    });

    it('includes hint with letter count', () => {
      randomSpy
        .mockReturnValueOnce(0.8) // hidden word
        .mockReturnValueOnce(0.0); // index=0

      const puzzle = generateWordPuzzle('easy');
      // CAT has 3 letters
      expect(puzzle.hint).toContain('3 letters');
    });

    it('another hidden word entry works', () => {
      // HIDDEN_WORDS[1] = { sentence: 'She could **hear**t the music', answer: 'HEAR' }
      randomSpy
        .mockReturnValueOnce(0.85)
        .mockReturnValueOnce(0.1); // index = Math.floor(0.1*10) = 1

      const puzzle = generateWordPuzzle('medium');
      expect(puzzle.question).toContain('She could **hear**t the music');
      expect(puzzle.correct_answer).toBe('HEAR');
    });
  });

  // -------------------------------------------------------------------------
  // Time limits
  // -------------------------------------------------------------------------

  describe('time limits', () => {
    it('easy: 30s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.0) // anagram
        .mockReturnValueOnce(0.0);

      const puzzle = generateWordPuzzle('easy');
      expect(puzzle.time_limit_seconds).toBe(30);
    });

    it('medium: 45s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.0) // anagram
        .mockReturnValueOnce(0.0);

      const puzzle = generateWordPuzzle('medium');
      expect(puzzle.time_limit_seconds).toBe(45);
    });

    it('hard: 60s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.0) // anagram
        .mockReturnValueOnce(0.0);

      const puzzle = generateWordPuzzle('hard');
      expect(puzzle.time_limit_seconds).toBe(60);
    });
  });

  // -------------------------------------------------------------------------
  // Common properties
  // -------------------------------------------------------------------------

  describe('common properties', () => {
    it('all return game_type word', () => {
      // Anagram
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);
      expect(generateWordPuzzle('easy').game_type).toBe('word');

      // Analogy
      randomSpy
        .mockReturnValueOnce(0.7)
        .mockReturnValueOnce(0.0);
      expect(generateWordPuzzle('easy').game_type).toBe('word');

      // Hidden word
      randomSpy
        .mockReturnValueOnce(0.9)
        .mockReturnValueOnce(0.0);
      expect(generateWordPuzzle('easy').game_type).toBe('word');
    });

    it('puzzle id starts with word-', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);

      const puzzle = generateWordPuzzle('easy');
      expect(puzzle.id).toMatch(/^word-/);
    });

    it('difficulty field matches input', () => {
      for (const diff of ['easy', 'medium', 'hard'] as const) {
        randomSpy
          .mockReturnValueOnce(0.7) // analogy (simple, no extra randoms needed)
          .mockReturnValueOnce(0.0);
        expect(generateWordPuzzle(diff).difficulty).toBe(diff);
      }
    });
  });
});

// ===========================================================================
//  utils.ts
// ===========================================================================

describe('shuffle()', () => {
  it('returns an array of the same length', () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffle(input)).toHaveLength(5);
  });

  it('contains the same elements as the input', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = shuffle(input);
    expect(result.sort()).toEqual([...input].sort());
  });

  it('does not mutate the original array', () => {
    const input = [1, 2, 3];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it('handles an empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('handles a single-element array', () => {
    expect(shuffle([42])).toEqual([42]);
  });

  it('produces different orderings over many calls (not always identity)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const results = new Set(
      Array.from({ length: 50 }, () => shuffle(input).join(',')),
    );
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('decodeHtml()', () => {
  it('decodes &quot; to double quote', () => {
    expect(decodeHtml('say &quot;hello&quot;')).toBe('say "hello"');
  });

  it("decodes &#039; to single quote", () => {
    expect(decodeHtml("it&#039;s fine")).toBe("it's fine");
  });

  it('decodes &amp; to ampersand', () => {
    expect(decodeHtml('rock &amp; roll')).toBe('rock & roll');
  });

  it('decodes &lt; and &gt; to angle brackets', () => {
    expect(decodeHtml('&lt;tag&gt;')).toBe('<tag>');
  });

  it('leaves plain text unchanged', () => {
    expect(decodeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(decodeHtml('')).toBe('');
  });

  it('handles multiple entities in one string', () => {
    expect(decodeHtml('&amp;&lt;&gt;&quot;&#039;')).toBe('&<>"\'');
  });
});

describe('puzzleId()', () => {
  it('starts with the given prefix followed by a hyphen', () => {
    const id = puzzleId('code');
    expect(id.startsWith('code-')).toBe(true);
  });

  it('contains a UUID segment after prefix', () => {
    const id = puzzleId('cipher');
    const uuidPart = id.replace('cipher-', '');
    expect(uuidPart).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('generates unique IDs on repeated calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => puzzleId('test')));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('works with any string prefix', () => {
    const id = puzzleId('my-complex-prefix');
    expect(id.startsWith('my-complex-prefix-')).toBe(true);
  });

  it('ID matches prefix-uuid format', () => {
    const id = puzzleId('x');
    expect(id).toMatch(
      /^x-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('difficultyPoints()', () => {
  it('returns 50 for easy', () => {
    expect(difficultyPoints('easy')).toBe(50);
  });

  it('returns 150 for medium', () => {
    expect(difficultyPoints('medium')).toBe(150);
  });

  it('returns 400 for hard', () => {
    expect(difficultyPoints('hard')).toBe(400);
  });

  it('hard > medium > easy (ascending difficulty)', () => {
    expect(difficultyPoints('hard')).toBeGreaterThan(difficultyPoints('medium'));
    expect(difficultyPoints('medium')).toBeGreaterThan(
      difficultyPoints('easy'),
    );
  });
});
