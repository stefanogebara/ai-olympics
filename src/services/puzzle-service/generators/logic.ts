/**
 * Logic Puzzle Generator (Sequences & Patterns)
 */

import type { Difficulty, PuzzleWithAnswer } from '../types.js';
import { puzzleId } from '../utils.js';

export function generateLogicPuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  const uid = puzzleId('logic');

  if (difficulty === 'easy') {
    const patternType = Math.floor(Math.random() * 2);
    if (patternType === 0) {
      // Arithmetic sequence
      const start = Math.floor(Math.random() * 10);
      const step = Math.floor(Math.random() * 5) + 2;
      const seq = [start, start + step, start + 2 * step, start + 3 * step];
      return {
        id: uid, game_type: 'logic', difficulty,
        question: `What comes next in this sequence? ${seq.join(', ')}, ?`,
        correct_answer: String(start + 4 * step),
        explanation: `Each number increases by ${step}`,
        points: 50, time_limit_seconds: 45,
      };
    }
    // Alternating pattern
    const a = Math.floor(Math.random() * 5) + 1;
    const b = a * 10;
    const seq = [a, b, a + 1, b + 10, a + 2, b + 20];
    return {
      id: uid, game_type: 'logic', difficulty,
      question: `What comes next? ${seq.join(', ')}, ?`,
      correct_answer: String(a + 3),
      explanation: `Two interleaved sequences: ${a},${a + 1},${a + 2},${a + 3}... and ${b},${b + 10},${b + 20}...`,
      points: 50, time_limit_seconds: 45,
    };
  }

  if (difficulty === 'medium') {
    const patternType = Math.floor(Math.random() * 3);
    if (patternType === 0) {
      // Fibonacci-like
      const a = Math.floor(Math.random() * 5) + 1;
      const b = Math.floor(Math.random() * 5) + 1;
      const seq = [a, b, a + b, b + (a + b), (a + b) + (b + (a + b))];
      return {
        id: uid, game_type: 'logic', difficulty,
        question: `What comes next? ${seq.join(', ')}, ?`,
        correct_answer: String(seq[3] + seq[4]),
        explanation: 'Each number is the sum of the previous two',
        points: 100, time_limit_seconds: 60,
      };
    }
    if (patternType === 1) {
      // Prime numbers
      const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
      const startIdx = Math.floor(Math.random() * 5);
      const shown = primes.slice(startIdx, startIdx + 5);
      return {
        id: uid, game_type: 'logic', difficulty,
        question: `What comes next? ${shown.join(', ')}, ?`,
        correct_answer: String(primes[startIdx + 5]),
        explanation: 'These are consecutive prime numbers',
        points: 100, time_limit_seconds: 60,
      };
    }
    // Triangular numbers
    const triangular = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55];
    const startIdx = Math.floor(Math.random() * 5);
    const shown = triangular.slice(startIdx, startIdx + 4);
    return {
      id: uid, game_type: 'logic', difficulty,
      question: `What comes next? ${shown.join(', ')}, ?`,
      correct_answer: String(triangular[startIdx + 4]),
      explanation: 'Triangular numbers: each difference increases by 1',
      points: 100, time_limit_seconds: 60,
    };
  }

  // Hard
  const patternType = Math.floor(Math.random() * 3);
  if (patternType === 0) {
    // Power sequence
    const base = Math.floor(Math.random() * 5) + 2;
    const seq = [1, base, base * base, base * base * base];
    return {
      id: uid, game_type: 'logic', difficulty,
      question: `What comes next? ${seq.join(', ')}, ?`,
      correct_answer: String(base * base * base * base),
      explanation: `Powers of ${base}: ${base}^0, ${base}^1, ${base}^2, ${base}^3, ${base}^4`,
      points: 150, time_limit_seconds: 90,
    };
  }
  if (patternType === 1) {
    // Look-and-say sequence
    const lookAndSay = ['1', '11', '21', '1211', '111221', '312211'];
    const shown = lookAndSay.slice(0, 4);
    return {
      id: uid, game_type: 'logic', difficulty,
      question: `What comes next in the look-and-say sequence? ${shown.join(', ')}, ?`,
      correct_answer: '111221',
      explanation: 'Each term describes the previous: 1211 has "one 1, one 2, two 1s" = 111221',
      points: 150, time_limit_seconds: 90,
    };
  }
  // Square numbers with twist
  const squares = [1, 4, 9, 16, 25, 36, 49, 64];
  const startIdx = Math.floor(Math.random() * 3);
  const shown = squares.slice(startIdx, startIdx + 4);
  return {
    id: uid, game_type: 'logic', difficulty,
    question: `What comes next? ${shown.join(', ')}, ?`,
    correct_answer: String(squares[startIdx + 4]),
    explanation: `Perfect squares: ${startIdx + 1}^2, ${startIdx + 2}^2, ${startIdx + 3}^2, ...`,
    points: 150, time_limit_seconds: 90,
  };
}
