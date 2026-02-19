/**
 * Spatial Puzzle Generator (Grid & Visual Reasoning)
 */

import type { Difficulty, PuzzleWithAnswer } from '../types.js';
import { puzzleId, difficultyPoints } from '../utils.js';

export function generateSpatialPuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  const uid = puzzleId('spatial');

  if (difficulty === 'easy') {
    const easyType = Math.floor(Math.random() * 3);
    if (easyType === 0) {
      // Count X's in grid
      const rows = Math.floor(Math.random() * 3) + 3;
      const cols = Math.floor(Math.random() * 3) + 4;
      let count = 0;
      const grid: string[][] = [];
      for (let r = 0; r < rows; r++) {
        const row: string[] = [];
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.55) {
            row.push('X');
            count++;
          } else {
            row.push('.');
          }
        }
        grid.push(row);
      }
      const gridStr = grid.map(r => r.join(' ')).join('\n');
      return {
        id: uid, game_type: 'spatial', difficulty,
        question: `Count the number of X's in this grid:\n${gridStr}`,
        correct_answer: String(count),
        explanation: `There are ${count} X's in the grid`,
        points: 50, time_limit_seconds: 45,
      };
    }
    if (easyType === 1) {
      // Count #'s
      const rows = 3;
      const cols = 4;
      let count = 0;
      const grid: string[][] = [];
      for (let r = 0; r < rows; r++) {
        const row: string[] = [];
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.5) {
            row.push('#');
            count++;
          } else {
            row.push('.');
          }
        }
        grid.push(row);
      }
      const gridStr = grid.map(r => r.join(' ')).join('\n');
      return {
        id: uid, game_type: 'spatial', difficulty,
        question: `Count the number of # symbols:\n${gridStr}`,
        correct_answer: String(count),
        explanation: `There are ${count} # symbols`,
        points: 50, time_limit_seconds: 45,
      };
    }
    // What value is at a specific position
    const grid = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 0, 1, 2],
    ];
    const row = Math.floor(Math.random() * 3);
    const col = Math.floor(Math.random() * 4);
    const gridStr = grid.map(r => r.join(' ')).join('\n');
    return {
      id: uid, game_type: 'spatial', difficulty,
      question: `What is at row ${row + 1}, column ${col + 1}?\n${gridStr}`,
      correct_answer: String(grid[row][col]),
      explanation: `Row ${row + 1}, column ${col + 1} contains ${grid[row][col]}`,
      points: 50, time_limit_seconds: 45,
    };
  }

  if (difficulty === 'medium') {
    const medType = Math.floor(Math.random() * 3);
    if (medType === 0) {
      // What letter does this grid form
      const letters: Array<{ grid: string; answer: string }> = [
        { grid: '# # #\n# . .\n# # #\n# . .\n# # #', answer: 'E' },
        { grid: '# # #\n. # .\n. # .\n. # .\n. # .', answer: 'T' },
        { grid: '# . #\n# . #\n# # #\n# . #\n# . #', answer: 'H' },
        { grid: '# # #\n# . .\n# . .\n# . .\n# # #', answer: 'C' },
        { grid: '# . .\n# . .\n# . .\n# . .\n# # #', answer: 'L' },
      ];
      const letter = letters[Math.floor(Math.random() * letters.length)];
      return {
        id: uid, game_type: 'spatial', difficulty,
        question: `What letter does this grid form?\n${letter.grid}`,
        correct_answer: letter.answer,
        explanation: `The pattern forms the letter ${letter.answer}`,
        points: difficultyPoints('medium'), time_limit_seconds: 60,
      };
    }
    if (medType === 1) {
      // Count enclosed regions
      const grids: Array<{ grid: string; answer: number }> = [
        { grid: '# # # # #\n# . # . #\n# # # # #', answer: 2 },
        { grid: '# # # #\n# . . #\n# # # #', answer: 1 },
        { grid: '# # # # # #\n# . # . # .\n# # # # # #', answer: 2 },
      ];
      const g = grids[Math.floor(Math.random() * grids.length)];
      return {
        id: uid, game_type: 'spatial', difficulty,
        question: `How many enclosed regions (surrounded by #) are there?\n${g.grid}`,
        correct_answer: String(g.answer),
        explanation: `There are ${g.answer} enclosed region(s)`,
        points: difficultyPoints('medium'), time_limit_seconds: 60,
      };
    }
    // Mirror question
    const grids: Array<{ grid: string; pos: string; answer: string }> = [
      { grid: 'A B C\nD E F\nG H I', pos: '(1,1)', answer: 'C' },
      { grid: '1 2 3\n4 5 6\n7 8 9', pos: '(2,2)', answer: '5' },
    ];
    const g = grids[Math.floor(Math.random() * grids.length)];
    return {
      id: uid, game_type: 'spatial', difficulty,
      question: `Mirror this grid horizontally. What character is at position ${g.pos}?\n${g.grid}`,
      correct_answer: g.answer,
      explanation: `After horizontal mirroring, position ${g.pos} contains ${g.answer}`,
      points: difficultyPoints('medium'), time_limit_seconds: 60,
    };
  }

  // Hard
  const hardType = Math.floor(Math.random() * 3);
  if (hardType === 0) {
    // Rotation question
    const shapes: Array<{ grid: string; answer: string }> = [
      {
        grid: '# #\n# .\n# .',
        answer: '# # #',
      },
      {
        grid: '# .\n# .\n# #',
        answer: '# # #',
      },
    ];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    return {
      id: uid, game_type: 'spatial', difficulty,
      question: `If you rotate this shape 90 degrees clockwise, what does the top row look like?\n${shape.grid}`,
      correct_answer: shape.answer,
      explanation: `Rotating 90 degrees clockwise gives top row: ${shape.answer}`,
      points: difficultyPoints('hard'), time_limit_seconds: 90,
    };
  }
  if (hardType === 1) {
    // Count adjacent X pairs
    const grid = [
      ['X', 'X', '.', '.'],
      ['.', '.', 'X', '.'],
      ['.', 'X', 'X', '.'],
    ];
    let adjacent = 0;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === 'X') {
          const hasNeighbor =
            (r > 0 && grid[r - 1][c] === 'X') ||
            (r < grid.length - 1 && grid[r + 1][c] === 'X') ||
            (c > 0 && grid[r][c - 1] === 'X') ||
            (c < grid[r].length - 1 && grid[r][c + 1] === 'X');
          if (hasNeighbor) adjacent++;
        }
      }
    }
    const gridStr = grid.map(r => r.join(' ')).join('\n');
    return {
      id: uid, game_type: 'spatial', difficulty,
      question: `How many X's are adjacent (horizontally or vertically) to at least one other X?\n${gridStr}`,
      correct_answer: String(adjacent),
      explanation: `${adjacent} X's have at least one adjacent X neighbor`,
      points: difficultyPoints('hard'), time_limit_seconds: 90,
    };
  }
  // Symmetry check
  const grids: Array<{ grid: string; answer: string }> = [
    { grid: '# . #\n. # .\n# . #', answer: 'YES' },
    { grid: '# . .\n. # .\n# . #', answer: 'NO' },
    { grid: '# # #\n# . #\n# # #', answer: 'YES' },
  ];
  const g = grids[Math.floor(Math.random() * grids.length)];
  return {
    id: uid, game_type: 'spatial', difficulty,
    question: `Is this grid horizontally symmetric? (YES or NO)\n${g.grid}`,
    correct_answer: g.answer,
    explanation: `The grid is ${g.answer === 'YES' ? '' : 'not '}horizontally symmetric`,
    points: difficultyPoints('hard'), time_limit_seconds: 90,
  };
}
