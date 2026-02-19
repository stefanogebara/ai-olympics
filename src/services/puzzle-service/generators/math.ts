/**
 * Math Puzzle Generator
 */

import type { Difficulty, PuzzleWithAnswer } from '../types.js';
import { puzzleId } from '../utils.js';

export function generateMathPuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  const uid = puzzleId('math');

  if (difficulty === 'easy') {
    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    const ops = ['+', '-', '*'] as const;
    const op = ops[Math.floor(Math.random() * ops.length)];
    const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
    return {
      id: uid, game_type: 'math', difficulty,
      question: `What is ${a} ${op} ${b}?`,
      correct_answer: String(answer), points: 50, time_limit_seconds: 30,
    };
  }

  if (difficulty === 'medium') {
    const c = Math.floor(Math.random() * 100) + 50;
    const d = Math.floor(Math.random() * 30) + 10;
    const e = Math.floor(Math.random() * 10) + 2;
    return {
      id: uid, game_type: 'math', difficulty,
      question: `What is (${c} + ${d}) * ${e}?`,
      correct_answer: String((c + d) * e), points: 100, time_limit_seconds: 60,
    };
  }

  // Hard: variety of challenging types
  const hardType = Math.floor(Math.random() * 3);

  if (hardType === 0) {
    // Modular arithmetic
    const base = Math.floor(Math.random() * 15) + 5;
    const exp = Math.floor(Math.random() * 8) + 5;
    const mod = Math.floor(Math.random() * 15) + 7;
    let result = 1;
    for (let i = 0; i < exp; i++) result = (result * base) % mod;
    return {
      id: uid, game_type: 'math', difficulty,
      question: `What is ${base}^${exp} mod ${mod}?`,
      correct_answer: String(result), points: 150, time_limit_seconds: 90,
      explanation: `${base}^${exp} mod ${mod} = ${result}`,
    };
  }

  if (hardType === 1) {
    // System of equations
    const x = Math.floor(Math.random() * 10) + 1;
    const y = Math.floor(Math.random() * 10) + 1;
    const a1 = Math.floor(Math.random() * 5) + 1;
    const b1 = Math.floor(Math.random() * 5) + 1;
    const a2 = Math.floor(Math.random() * 5) + 1;
    const b2 = -(Math.floor(Math.random() * 5) + 1);
    const c1 = a1 * x + b1 * y;
    const c2 = a2 * x + b2 * y;
    return {
      id: uid, game_type: 'math', difficulty,
      question: `If ${a1}x + ${b1}y = ${c1} and ${a2}x + ${b2 < 0 ? '' : '+'}${b2}y = ${c2}, what is x?`,
      correct_answer: String(x), points: 150, time_limit_seconds: 90,
      explanation: `x = ${x}, y = ${y}`,
    };
  }

  // Combinatorics
  const n = Math.floor(Math.random() * 4) + 4;
  const factorial = (num: number): number => num <= 1 ? 1 : num * factorial(num - 1);
  const answer = factorial(n);
  return {
    id: uid, game_type: 'math', difficulty,
    question: `How many ways can you arrange ${n} distinct books on a shelf?`,
    correct_answer: String(answer), points: 150, time_limit_seconds: 90,
    explanation: `${n}! = ${answer}`,
  };
}
