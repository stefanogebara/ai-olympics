/**
 * Spatial Puzzle Generator - Extra Coverage Tests
 *
 * Covers uncovered lines 105-134 (medium: enclosed regions, mirror questions)
 * and all hard difficulty sub-types (rotation, adjacent X, symmetry).
 * Also validates easy sub-types and common properties.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSpatialPuzzle } from './spatial.js';

describe('generateSpatialPuzzle', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  // =========================================================================
  //  Easy difficulty
  // =========================================================================

  describe('easy difficulty', () => {
    it('easyType=0: count X puzzle', () => {
      // easyType = Math.floor(0.1 * 3) = 0
      randomSpy
        .mockReturnValueOnce(0.1)  // easyType = 0
        .mockReturnValueOnce(0.0)  // rows = 3
        .mockReturnValueOnce(0.0); // cols = 4
      // Grid cell values (3 rows * 4 cols = 12 cells)
      for (let i = 0; i < 12; i++) {
        randomSpy.mockReturnValueOnce(0.6); // > 0.55, so 'X'
      }

      const puzzle = generateSpatialPuzzle('easy');
      expect(puzzle.question).toContain("Count the number of X's");
      expect(puzzle.correct_answer).toBe('12');
      expect(puzzle.game_type).toBe('spatial');
      expect(puzzle.difficulty).toBe('easy');
    });

    it('easyType=0: mix of X and . in grid', () => {
      randomSpy
        .mockReturnValueOnce(0.1)  // easyType = 0
        .mockReturnValueOnce(0.0)  // rows = 3
        .mockReturnValueOnce(0.0); // cols = 4
      // Alternate: X, ., X, ., ...
      for (let i = 0; i < 12; i++) {
        randomSpy.mockReturnValueOnce(i % 2 === 0 ? 0.6 : 0.3);
      }

      const puzzle = generateSpatialPuzzle('easy');
      expect(puzzle.correct_answer).toBe('6');
    });

    it('easyType=1: count # symbols puzzle', () => {
      // easyType = Math.floor(0.4 * 3) = 1
      randomSpy.mockReturnValueOnce(0.4); // easyType = 1
      // 3 rows * 4 cols = 12 cells
      for (let i = 0; i < 12; i++) {
        randomSpy.mockReturnValueOnce(0.6); // > 0.5 => '#'
      }

      const puzzle = generateSpatialPuzzle('easy');
      expect(puzzle.question).toContain('Count the number of # symbols');
      expect(puzzle.correct_answer).toBe('12');
    });

    it('easyType=1: mixed # and . grid', () => {
      randomSpy.mockReturnValueOnce(0.4); // easyType = 1
      for (let i = 0; i < 12; i++) {
        randomSpy.mockReturnValueOnce(i < 5 ? 0.6 : 0.3);
      }

      const puzzle = generateSpatialPuzzle('easy');
      expect(puzzle.correct_answer).toBe('5');
    });

    it('easyType=2: grid position lookup puzzle', () => {
      // easyType = Math.floor(0.8 * 3) = 2
      randomSpy
        .mockReturnValueOnce(0.8)  // easyType = 2
        .mockReturnValueOnce(0.0)  // row = 0
        .mockReturnValueOnce(0.0); // col = 0

      const puzzle = generateSpatialPuzzle('easy');
      expect(puzzle.question).toContain('What is at row 1, column 1?');
      // grid[0][0] = 1
      expect(puzzle.correct_answer).toBe('1');
    });

    it('easyType=2: different row/col position', () => {
      randomSpy
        .mockReturnValueOnce(0.8)  // easyType = 2
        .mockReturnValueOnce(0.7)  // row = Math.floor(0.7*3) = 2
        .mockReturnValueOnce(0.5); // col = Math.floor(0.5*4) = 2

      const puzzle = generateSpatialPuzzle('easy');
      expect(puzzle.question).toContain('What is at row 3, column 3?');
      // grid[2][2] = 1
      expect(puzzle.correct_answer).toBe('1');
    });

    it('easy puzzles have 50 points and 45s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.8)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);

      const puzzle = generateSpatialPuzzle('easy');
      expect(puzzle.points).toBe(50);
      expect(puzzle.time_limit_seconds).toBe(45);
    });

    it('easy puzzles have id starting with spatial-', () => {
      randomSpy
        .mockReturnValueOnce(0.8)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);

      const puzzle = generateSpatialPuzzle('easy');
      expect(puzzle.id).toMatch(/^spatial-/);
    });
  });

  // =========================================================================
  //  Medium difficulty - TARGETING UNCOVERED LINES 105-134
  // =========================================================================

  describe('medium difficulty', () => {
    it('medType=0: letter grid recognition puzzle', () => {
      // medType = Math.floor(0.1 * 3) = 0
      randomSpy
        .mockReturnValueOnce(0.1) // medType = 0
        .mockReturnValueOnce(0.0); // letter index = 0 => 'E'

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.question).toContain('What letter does this grid form?');
      expect(puzzle.correct_answer).toBe('E');
      expect(puzzle.explanation).toContain('the letter E');
    });

    it('medType=0: letter T grid', () => {
      randomSpy
        .mockReturnValueOnce(0.1) // medType = 0
        .mockReturnValueOnce(0.2); // letter index = Math.floor(0.2*5) = 1 => 'T'

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.correct_answer).toBe('T');
    });

    it('medType=0: letter H grid', () => {
      randomSpy
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.5); // index = Math.floor(0.5*5) = 2 => 'H'

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.correct_answer).toBe('H');
    });

    it('medType=1: enclosed regions puzzle (UNCOVERED LINE 105-119)', () => {
      // medType = Math.floor(0.4 * 3) = 1
      randomSpy
        .mockReturnValueOnce(0.4) // medType = 1
        .mockReturnValueOnce(0.0); // grid index = 0 => answer: 2

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.question).toContain('How many enclosed regions');
      expect(puzzle.correct_answer).toBe('2');
      expect(puzzle.explanation).toContain('2 enclosed region(s)');
    });

    it('medType=1: enclosed regions with 1 region', () => {
      randomSpy
        .mockReturnValueOnce(0.4)  // medType = 1
        .mockReturnValueOnce(0.4); // grid index = Math.floor(0.4*3) = 1 => answer: 1

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.correct_answer).toBe('1');
      expect(puzzle.explanation).toContain('1 enclosed region(s)');
    });

    it('medType=1: enclosed regions third grid', () => {
      randomSpy
        .mockReturnValueOnce(0.4)  // medType = 1
        .mockReturnValueOnce(0.8); // grid index = Math.floor(0.8*3) = 2 => answer: 2

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.correct_answer).toBe('2');
    });

    it('medType=2: mirror question puzzle (UNCOVERED LINE 121-133)', () => {
      // medType = Math.floor(0.8 * 3) = 2
      randomSpy
        .mockReturnValueOnce(0.8) // medType = 2
        .mockReturnValueOnce(0.0); // grid index = 0 => answer: 'C'

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.question).toContain('Mirror this grid horizontally');
      expect(puzzle.question).toContain('(1,1)');
      expect(puzzle.correct_answer).toBe('C');
      expect(puzzle.explanation).toContain('After horizontal mirroring');
    });

    it('medType=2: mirror question second grid', () => {
      randomSpy
        .mockReturnValueOnce(0.8)  // medType = 2
        .mockReturnValueOnce(0.6); // grid index = Math.floor(0.6*2) = 1 => answer: '5'

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.question).toContain('(2,2)');
      expect(puzzle.correct_answer).toBe('5');
    });

    it('medium puzzles have difficultyPoints(medium) = 150 points', () => {
      randomSpy
        .mockReturnValueOnce(0.4)  // medType = 1
        .mockReturnValueOnce(0.0);

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.points).toBe(150);
    });

    it('medium puzzles have 60s time limit', () => {
      randomSpy
        .mockReturnValueOnce(0.8) // medType = 2
        .mockReturnValueOnce(0.0);

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.time_limit_seconds).toBe(60);
    });

    it('medium puzzles have game_type spatial and difficulty medium', () => {
      randomSpy
        .mockReturnValueOnce(0.4)
        .mockReturnValueOnce(0.0);

      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.game_type).toBe('spatial');
      expect(puzzle.difficulty).toBe('medium');
    });
  });

  // =========================================================================
  //  Hard difficulty
  // =========================================================================

  describe('hard difficulty', () => {
    it('hardType=0: rotation puzzle first shape', () => {
      // hardType = Math.floor(0.1 * 3) = 0
      randomSpy
        .mockReturnValueOnce(0.1) // hardType = 0
        .mockReturnValueOnce(0.0); // shape index = 0

      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.question).toContain('rotate this shape 90 degrees clockwise');
      expect(puzzle.question).toContain('what does the top row look like');
      expect(puzzle.correct_answer).toBe('# # #');
    });

    it('hardType=0: rotation puzzle second shape', () => {
      randomSpy
        .mockReturnValueOnce(0.1)  // hardType = 0
        .mockReturnValueOnce(0.6); // shape index = Math.floor(0.6*2) = 1

      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.correct_answer).toBe('# # #');
      expect(puzzle.explanation).toContain('Rotating 90 degrees clockwise');
    });

    it('hardType=1: adjacent X counting puzzle', () => {
      // hardType = Math.floor(0.4 * 3) = 1
      randomSpy.mockReturnValueOnce(0.4); // hardType = 1

      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.question).toContain("How many X's are adjacent");
      // Grid: X X . .
      //       . . X .
      //       . X X .
      // X at (0,0): neighbor at (0,1) is X => YES
      // X at (0,1): neighbor at (0,0) is X => YES
      // X at (1,2): neighbor at (2,2) is X => YES
      // X at (2,1): neighbor at (2,2) is X => YES
      // X at (2,2): neighbors at (1,2) and (2,1) are X => YES
      // Total: 5
      expect(puzzle.correct_answer).toBe('5');
      expect(puzzle.explanation).toContain('5');
    });

    it('hardType=2: symmetry check YES', () => {
      // hardType = Math.floor(0.8 * 3) = 2
      randomSpy
        .mockReturnValueOnce(0.8) // hardType = 2
        .mockReturnValueOnce(0.0); // grid index = 0 => answer: 'YES'

      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.question).toContain('horizontally symmetric');
      expect(puzzle.correct_answer).toBe('YES');
      expect(puzzle.explanation).toContain('horizontally symmetric');
    });

    it('hardType=2: symmetry check NO', () => {
      randomSpy
        .mockReturnValueOnce(0.8)  // hardType = 2
        .mockReturnValueOnce(0.4); // grid index = Math.floor(0.4*3) = 1 => answer: 'NO'

      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.correct_answer).toBe('NO');
      expect(puzzle.explanation).toContain('not ');
    });

    it('hardType=2: symmetry check third grid (YES)', () => {
      randomSpy
        .mockReturnValueOnce(0.8)  // hardType = 2
        .mockReturnValueOnce(0.8); // grid index = Math.floor(0.8*3) = 2 => answer: 'YES'

      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.correct_answer).toBe('YES');
    });

    it('hard puzzles have difficultyPoints(hard) = 400 points', () => {
      randomSpy.mockReturnValueOnce(0.4); // hardType = 1

      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.points).toBe(400);
    });

    it('hard puzzles have 90s time limit', () => {
      randomSpy.mockReturnValueOnce(0.4);

      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.time_limit_seconds).toBe(90);
    });

    it('hard puzzles have game_type spatial and difficulty hard', () => {
      randomSpy.mockReturnValueOnce(0.4);

      const puzzle = generateSpatialPuzzle('hard');
      expect(puzzle.game_type).toBe('spatial');
      expect(puzzle.difficulty).toBe('hard');
    });
  });

  // =========================================================================
  //  Common properties
  // =========================================================================

  describe('common properties', () => {
    it('all puzzles have required fields', () => {
      randomSpy.mockRestore();
      for (const diff of ['easy', 'medium', 'hard'] as const) {
        const puzzle = generateSpatialPuzzle(diff);
        expect(puzzle.id).toBeTruthy();
        expect(puzzle.game_type).toBe('spatial');
        expect(puzzle.difficulty).toBe(diff);
        expect(puzzle.question).toBeTruthy();
        expect(puzzle.correct_answer).toBeTruthy();
        expect(puzzle.points).toBeGreaterThan(0);
        expect(puzzle.time_limit_seconds).toBeGreaterThan(0);
      }
    });

    it('generates unique IDs on repeated calls', () => {
      randomSpy.mockRestore();
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        ids.add(generateSpatialPuzzle('easy').id);
      }
      expect(ids.size).toBe(10);
    });

    it('puzzle id starts with spatial-', () => {
      randomSpy.mockRestore();
      const puzzle = generateSpatialPuzzle('medium');
      expect(puzzle.id).toMatch(/^spatial-/);
    });

    it('explanation is present for all sub-types', () => {
      // Easy type 0
      randomSpy
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.0);
      for (let i = 0; i < 12; i++) randomSpy.mockReturnValueOnce(0.6);
      expect(generateSpatialPuzzle('easy').explanation).toBeTruthy();

      // Medium type 1 (enclosed)
      randomSpy
        .mockReturnValueOnce(0.4)
        .mockReturnValueOnce(0.0);
      expect(generateSpatialPuzzle('medium').explanation).toBeTruthy();

      // Medium type 2 (mirror)
      randomSpy
        .mockReturnValueOnce(0.8)
        .mockReturnValueOnce(0.0);
      expect(generateSpatialPuzzle('medium').explanation).toBeTruthy();

      // Hard type 0 (rotation)
      randomSpy
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.0);
      expect(generateSpatialPuzzle('hard').explanation).toBeTruthy();
    });
  });
});
