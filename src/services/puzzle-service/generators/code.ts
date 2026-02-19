/**
 * Code Debug Puzzle Generator
 */

import type { Difficulty, PuzzleWithAnswer } from '../types.js';
import { puzzleId, difficultyPoints } from '../utils.js';

const EASY_PROBLEMS = [
  {
    question: 'Find the bug:\nfunction sum(arr) {\n  let s = 0;\n  for (let i = 0; i <= arr.length; i++)\n    s += arr[i];\n  return s;\n}',
    answer: 'i < arr.length',
    explanation: 'Off-by-one error: i <= arr.length accesses arr[arr.length] which is undefined',
  },
  {
    question: 'Find the bug:\nfunction isEven(n) {\n  return n % 2 === 1;\n}',
    answer: 'n % 2 === 0',
    explanation: 'n % 2 === 1 checks for odd, not even',
  },
  {
    question: 'Find the bug:\nfunction greet(name) {\n  return "Hello, " + Name;\n}',
    answer: 'name',
    explanation: 'JavaScript is case-sensitive: Name !== name',
  },
  {
    question: 'Find the bug:\nfunction max(a, b) {\n  if (a > b) return b;\n  return a;\n}',
    answer: 'return a',
    explanation: 'When a > b, should return a (the larger value), not b',
  },
  {
    question: 'Find the bug:\nfunction double(arr) {\n  for (let i = 0; i < arr.length; i++)\n    arr[i] * 2;\n  return arr;\n}',
    answer: 'arr[i] = arr[i] * 2',
    explanation: 'The multiplication result is not assigned back to the array element',
  },
];

const MEDIUM_PROBLEMS = [
  {
    question: 'What does this return for [3,1,4,1,5]?\nfunction f(a) {\n  return a.reduce((p,c,i) =>\n    i % 2 ? p + c : p - c, 0);\n}',
    answer: '-10',
    explanation: '0-3+1-4+1-5 = -10 (subtract at even indices, add at odd)',
  },
  {
    question: 'Find the bug:\nfunction fib(n) {\n  if (n <= 1) return n;\n  return fib(n-1) + fib(n-3);\n}',
    answer: 'fib(n-2)',
    explanation: 'Fibonacci needs fib(n-2), not fib(n-3)',
  },
  {
    question: 'Find the bug:\nfunction reverse(s) {\n  return s.split("")\n    .reverse().join();\n}',
    answer: 'join("")',
    explanation: 'join() without args uses commas as separator; need join("")',
  },
  {
    question: 'What does x.length return?\nlet x = [1,2,3];\nlet y = x;\ny.push(4);',
    answer: '4',
    explanation: 'y is a reference to x, not a copy. push(4) modifies the same array.',
  },
  {
    question: 'Find the bug:\nfunction clamp(val, min, max) {\n  return Math.max(max,\n    Math.min(min, val));\n}',
    answer: 'Math.max(min, Math.min(max, val))',
    explanation: 'min and max are swapped. Should be Math.max(min, Math.min(max, val))',
  },
];

const HARD_PROBLEMS = [
  {
    question: 'Find the bug:\nasync function getData() {\n  const data = await fetch("/api").json();\n  return data;\n}',
    answer: '(await fetch("/api")).json()',
    explanation: 'Need to await fetch() first, then call .json(). Currently calls .json() on the Promise.',
  },
  {
    question: 'What is wrong with this sort?\nfunction sortNums(arr) {\n  return [...arr].sort();\n}',
    answer: 'sort() uses lexicographic order',
    explanation: 'sort() converts elements to strings. [10,2,1] sorts to [1,10,2]. Need sort((a,b) => a-b).',
  },
  {
    question: 'What is the output?\nfor (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 100);\n}',
    answer: '3 3 3',
    explanation: 'var has function scope, not block scope. The closure captures the same i, which is 3 after the loop.',
  },
  {
    question: 'Find the bug:\nfunction deepCopy(obj) {\n  return JSON.parse(\n    JSON.stringify(obj)\n  );\n}',
    answer: 'loses functions and undefined values',
    explanation: 'JSON.stringify drops functions, undefined, Symbols, and converts Dates to strings',
  },
  {
    question: 'Find the bug:\nif (x == null || x == undefined) {\n  return "empty";\n}',
    answer: 'redundant check',
    explanation: 'x == null already covers both null and undefined in JavaScript (loose equality)',
  },
];

export function generateCodePuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  const uid = puzzleId('code');
  const problems = difficulty === 'easy' ? EASY_PROBLEMS : difficulty === 'medium' ? MEDIUM_PROBLEMS : HARD_PROBLEMS;
  const problem = problems[Math.floor(Math.random() * problems.length)];

  return {
    id: uid,
    game_type: 'code',
    difficulty,
    question: problem.question,
    correct_answer: problem.answer,
    explanation: problem.explanation,
    points: difficultyPoints(difficulty),
    time_limit_seconds: 90,
  };
}
