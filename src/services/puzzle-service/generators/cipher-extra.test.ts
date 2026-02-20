/**
 * Cipher Puzzle Generator - Extra Coverage Tests
 *
 * Covers uncovered lines 40-52 (medium: ROT13 and reversed text sub-types).
 * Also validates caesarShift utility, easy difficulty, and hard sub-types.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { caesarShift, generateCipherPuzzle } from './cipher.js';

// ===========================================================================
//  caesarShift utility
// ===========================================================================

describe('caesarShift', () => {
  it('shifts uppercase letters by given amount', () => {
    expect(caesarShift('ABC', 1)).toBe('BCD');
  });

  it('wraps around Z to A', () => {
    expect(caesarShift('XYZ', 3)).toBe('ABC');
  });

  it('shift by 13 (ROT13)', () => {
    expect(caesarShift('HELLO', 13)).toBe('URYYB');
  });

  it('shift by 26 is identity', () => {
    expect(caesarShift('HELLO', 26)).toBe('HELLO');
  });

  it('shift by 0 is identity', () => {
    expect(caesarShift('WORLD', 0)).toBe('WORLD');
  });

  it('handles negative shift via +26 modular arithmetic', () => {
    // caesarShift uses (shift + 26) % 26, so shift=-1 => 25
    expect(caesarShift('B', -1)).toBe('A');
    expect(caesarShift('A', -1)).toBe('Z');
  });

  it('preserves non-alpha characters (spaces, punctuation)', () => {
    expect(caesarShift('HELLO WORLD!', 1)).toBe('IFMMP XPSME!');
  });

  it('preserves lowercase letters unchanged', () => {
    expect(caesarShift('Hello', 1)).toBe('Iello');
  });

  it('handles empty string', () => {
    expect(caesarShift('', 5)).toBe('');
  });

  it('ROT13 applied twice returns original', () => {
    const original = 'SECRET MESSAGE';
    const encrypted = caesarShift(original, 13);
    const decrypted = caesarShift(encrypted, 13);
    expect(decrypted).toBe(original);
  });
});

// ===========================================================================
//  generateCipherPuzzle
// ===========================================================================

describe('generateCipherPuzzle', () => {
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
    it('generates Caesar cipher with known shift', () => {
      randomSpy
        .mockReturnValueOnce(0.0)  // phrase index = 0 => 'HELLO WORLD'
        .mockReturnValueOnce(0.0); // shift = Math.floor(0*10)+1 = 1

      const puzzle = generateCipherPuzzle('easy');
      expect(puzzle.question).toContain('Decode this Caesar cipher');
      expect(puzzle.question).toContain('shift +1');
      expect(puzzle.correct_answer).toBe('HELLO WORLD');
    });

    it('encrypted text matches caesarShift of phrase', () => {
      randomSpy
        .mockReturnValueOnce(0.0)  // phrase = 'HELLO WORLD'
        .mockReturnValueOnce(0.4); // shift = Math.floor(0.4*10)+1 = 5

      const puzzle = generateCipherPuzzle('easy');
      const expected = caesarShift('HELLO WORLD', 5);
      expect(puzzle.question).toContain(expected);
      expect(puzzle.correct_answer).toBe('HELLO WORLD');
    });

    it('easy puzzles have 50 points and 60s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);

      const puzzle = generateCipherPuzzle('easy');
      expect(puzzle.points).toBe(50);
      expect(puzzle.time_limit_seconds).toBe(60);
    });

    it('easy puzzles have a hint with first letter', () => {
      randomSpy
        .mockReturnValueOnce(0.0) // HELLO WORLD
        .mockReturnValueOnce(0.0);

      const puzzle = generateCipherPuzzle('easy');
      expect(puzzle.hint).toContain('H');
    });

    it('selects different phrases based on random', () => {
      // phrase index = Math.floor(0.4 * 5) = 2 => 'OPEN SESAME'
      randomSpy
        .mockReturnValueOnce(0.4)
        .mockReturnValueOnce(0.0);

      const puzzle = generateCipherPuzzle('easy');
      expect(puzzle.correct_answer).toBe('OPEN SESAME');
    });
  });

  // -------------------------------------------------------------------------
  // Medium difficulty - TARGETING UNCOVERED LINES 40-52
  // -------------------------------------------------------------------------

  describe('medium difficulty', () => {
    it('mediumType=0: Caesar cipher with unknown shift', () => {
      // mediumType = Math.floor(0.1 * 3) = 0
      randomSpy
        .mockReturnValueOnce(0.1)  // mediumType = 0
        .mockReturnValueOnce(0.0)  // phrase index = 0 => 'ATTACK AT DAWN'
        .mockReturnValueOnce(0.0); // shift = Math.floor(0*20)+3 = 3

      const puzzle = generateCipherPuzzle('medium');
      expect(puzzle.question).toContain('unknown shift');
      expect(puzzle.correct_answer).toBe('ATTACK AT DAWN');
      expect(puzzle.explanation).toContain('The shift was 3');
      expect(puzzle.hint).toContain('Try different shifts');
    });

    it('mediumType=1: ROT13 cipher (UNCOVERED LINE 53-64)', () => {
      // mediumType = Math.floor(0.4 * 3) = 1
      randomSpy
        .mockReturnValueOnce(0.4)  // mediumType = 1
        .mockReturnValueOnce(0.0); // phrase index = 0 => 'HELLO WORLD'

      const puzzle = generateCipherPuzzle('medium');
      expect(puzzle.question).toContain('Decode this ROT13 cipher');
      const encrypted = caesarShift('HELLO WORLD', 13);
      expect(puzzle.question).toContain(encrypted);
      expect(puzzle.correct_answer).toBe('HELLO WORLD');
      expect(puzzle.explanation).toContain('ROT13 shifts each letter by 13');
    });

    it('mediumType=1: ROT13 second phrase', () => {
      randomSpy
        .mockReturnValueOnce(0.4)  // mediumType = 1
        .mockReturnValueOnce(0.4); // phrase index = Math.floor(0.4*3) = 1 => 'PUZZLE SOLVED'

      const puzzle = generateCipherPuzzle('medium');
      expect(puzzle.correct_answer).toBe('PUZZLE SOLVED');
    });

    it('mediumType=1: ROT13 third phrase', () => {
      randomSpy
        .mockReturnValueOnce(0.4)  // mediumType = 1
        .mockReturnValueOnce(0.8); // phrase index = Math.floor(0.8*3) = 2 => 'NICE WORK'

      const puzzle = generateCipherPuzzle('medium');
      expect(puzzle.correct_answer).toBe('NICE WORK');
    });

    it('mediumType=2: reversed text (UNCOVERED LINE 66-76)', () => {
      // mediumType = Math.floor(0.8 * 3) = 2
      randomSpy
        .mockReturnValueOnce(0.8)  // mediumType = 2
        .mockReturnValueOnce(0.0); // phrase index = 0 => 'HELLO WORLD'

      const puzzle = generateCipherPuzzle('medium');
      expect(puzzle.question).toContain('Decode this reversed text');
      const reversed = 'HELLO WORLD'.split('').reverse().join('');
      expect(puzzle.question).toContain(reversed);
      expect(puzzle.correct_answer).toBe('HELLO WORLD');
      expect(puzzle.explanation).toContain('simply reversed');
    });

    it('mediumType=2: reversed text second phrase', () => {
      randomSpy
        .mockReturnValueOnce(0.8)  // mediumType = 2
        .mockReturnValueOnce(0.4); // phrase index = Math.floor(0.4*3) = 1 => 'MIRROR IMAGE'

      const puzzle = generateCipherPuzzle('medium');
      expect(puzzle.correct_answer).toBe('MIRROR IMAGE');
      const reversed = 'MIRROR IMAGE'.split('').reverse().join('');
      expect(puzzle.question).toContain(reversed);
    });

    it('medium puzzles have difficultyPoints(medium) = 150 points', () => {
      randomSpy
        .mockReturnValueOnce(0.4)  // ROT13
        .mockReturnValueOnce(0.0);

      const puzzle = generateCipherPuzzle('medium');
      expect(puzzle.points).toBe(150);
    });

    it('medium puzzles have 90s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.8)  // reversed
        .mockReturnValueOnce(0.0);

      const puzzle = generateCipherPuzzle('medium');
      expect(puzzle.time_limit_seconds).toBe(90);
    });

    it('medium puzzles have game_type cipher', () => {
      randomSpy
        .mockReturnValueOnce(0.4)
        .mockReturnValueOnce(0.0);

      const puzzle = generateCipherPuzzle('medium');
      expect(puzzle.game_type).toBe('cipher');
      expect(puzzle.difficulty).toBe('medium');
    });
  });

  // -------------------------------------------------------------------------
  // Hard difficulty
  // -------------------------------------------------------------------------

  describe('hard difficulty', () => {
    it('hardType=0: number-to-letter encoding', () => {
      // hardType = Math.floor(0.1 * 3) = 0
      randomSpy
        .mockReturnValueOnce(0.1)  // hardType = 0
        .mockReturnValueOnce(0.0); // word index = 0 => 'HELLO'

      const puzzle = generateCipherPuzzle('hard');
      expect(puzzle.question).toContain('A=1, B=2');
      // H=8, E=5, L=12, L=12, O=15 => '8-5-12-12-15'
      expect(puzzle.question).toContain('8-5-12-12-15');
      expect(puzzle.correct_answer).toBe('HELLO');
    });

    it('hardType=0: different word', () => {
      randomSpy
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.2); // index = Math.floor(0.2*5) = 1 => 'CIPHER'

      const puzzle = generateCipherPuzzle('hard');
      expect(puzzle.correct_answer).toBe('CIPHER');
      // C=3, I=9, P=16, H=8, E=5, R=18 => '3-9-16-8-5-18'
      expect(puzzle.question).toContain('3-9-16-8-5-18');
    });

    it('hardType=1: Atbash cipher', () => {
      // hardType = Math.floor(0.4 * 3) = 1
      randomSpy
        .mockReturnValueOnce(0.4)  // hardType = 1
        .mockReturnValueOnce(0.0); // word index = 0 => 'HELLO'

      const puzzle = generateCipherPuzzle('hard');
      expect(puzzle.question).toContain('Atbash cipher');
      // H(72)->155-72=83(S), E(69)->155-69=86(V), L(76)->155-76=79(O),
      // L(76)->O, O(79)->155-79=76(L) => 'SVOOL'
      expect(puzzle.question).toContain('SVOOL');
      expect(puzzle.correct_answer).toBe('HELLO');
      expect(puzzle.explanation).toContain('Atbash replaces each letter');
    });

    it('hardType=2: partial key cipher', () => {
      // hardType = Math.floor(0.8 * 3) = 2
      randomSpy
        .mockReturnValueOnce(0.8)  // hardType = 2
        .mockReturnValueOnce(0.0)  // word index = 0 => 'DECODE'
        .mockReturnValueOnce(0.0); // shift = Math.floor(0*15)+5 = 5

      const puzzle = generateCipherPuzzle('hard');
      expect(puzzle.question).toContain('partial key');
      expect(puzzle.correct_answer).toBe('DECODE');
      expect(puzzle.explanation).toContain('The shift is 5');
    });

    it('hard puzzles have difficultyPoints(hard) = 400 points', () => {
      randomSpy
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.0);

      const puzzle = generateCipherPuzzle('hard');
      expect(puzzle.points).toBe(400);
    });

    it('hard puzzles have 120s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.4)
        .mockReturnValueOnce(0.0);

      const puzzle = generateCipherPuzzle('hard');
      expect(puzzle.time_limit_seconds).toBe(120);
    });

    it('hard puzzles have game_type cipher and difficulty hard', () => {
      randomSpy
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.0);

      const puzzle = generateCipherPuzzle('hard');
      expect(puzzle.game_type).toBe('cipher');
      expect(puzzle.difficulty).toBe('hard');
    });
  });

  // -------------------------------------------------------------------------
  // Common properties
  // -------------------------------------------------------------------------

  describe('common properties', () => {
    it('all puzzles have required fields', () => {
      randomSpy.mockRestore();
      for (const diff of ['easy', 'medium', 'hard'] as const) {
        const puzzle = generateCipherPuzzle(diff);
        expect(puzzle.id).toBeTruthy();
        expect(puzzle.game_type).toBe('cipher');
        expect(puzzle.difficulty).toBe(diff);
        expect(puzzle.question).toBeTruthy();
        expect(puzzle.correct_answer).toBeTruthy();
        expect(puzzle.points).toBeGreaterThan(0);
        expect(puzzle.time_limit_seconds).toBeGreaterThan(0);
      }
    });

    it('puzzle id starts with cipher-', () => {
      randomSpy.mockRestore();
      const puzzle = generateCipherPuzzle('easy');
      expect(puzzle.id).toMatch(/^cipher-/);
    });

    it('generates unique IDs on repeated calls', () => {
      randomSpy.mockRestore();
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        ids.add(generateCipherPuzzle('easy').id);
      }
      expect(ids.size).toBe(10);
    });
  });
});
