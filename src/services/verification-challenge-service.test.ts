/**
 * Tests for verification-challenge-service.ts
 *
 * Covers: generateVerificationSession() — shape, counts, time limits,
 * arithmetic correctness, JSON path correctness, structured-output
 * invariants (hash, primes, fibonacci, reversed seed), behavioral
 * question selection.
 */

import crypto from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { generateVerificationSession } from './verification-challenge-service.js';
import type {
  SpeedArithmeticChallenge,
  SpeedJsonParseChallenge,
  StructuredOutputChallenge,
  BehavioralTimingChallenge,
  ChallengePayload,
} from './verification-challenge-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a dot-separated path on an object (e.g. "a.b.c"). */
function resolvePath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur !== null && typeof cur === 'object') {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Safely evaluate a simple arithmetic expression of the form "a OP b"
 * where OP is one of +, -, *.  No arbitrary code execution.
 */
function safeArithmetic(expression: string): number {
  const match = expression.match(/^(\d+)\s*([+\-*])\s*(\d+)$/);
  if (!match) throw new Error(`Unexpected expression format: ${expression}`);
  const a = parseInt(match[1], 10);
  const op = match[2];
  const b = parseInt(match[3], 10);
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  throw new Error(`Unknown operator: ${op}`);
}

/** Known primes under 100 (same set as the implementation). */
const PRIMES_UNDER_100 = new Set([
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
  53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
]);

// ---------------------------------------------------------------------------
// Overall structure
// ---------------------------------------------------------------------------

describe('generateVerificationSession — overall structure', () => {
  it('returns exactly 4 challenges', () => {
    const session = generateVerificationSession();
    expect(session.challenges).toHaveLength(4);
  });

  it('returns challenges in canonical order', () => {
    const session = generateVerificationSession();
    const types = session.challenges.map(c => c.type);
    expect(types).toEqual([
      'speed_arithmetic',
      'speed_json_parse',
      'structured_output',
      'behavioral_timing',
    ]);
  });

  it('has correct time limits for each challenge type', () => {
    const session = generateVerificationSession();
    const byType = Object.fromEntries(session.challenges.map(c => [c.type, c.timeLimit]));
    expect(byType['speed_arithmetic']).toBe(5000);
    expect(byType['speed_json_parse']).toBe(4000);
    expect(byType['structured_output']).toBe(15000);
    expect(byType['behavioral_timing']).toBe(0);
  });

  it('returns expectedAnswers with all four keys', () => {
    const session = generateVerificationSession();
    expect(session.expectedAnswers).toHaveProperty('speed_arithmetic');
    expect(session.expectedAnswers).toHaveProperty('speed_json_parse');
    expect(session.expectedAnswers).toHaveProperty('structured_output');
    expect(session.expectedAnswers).toHaveProperty('behavioral_timing');
  });

  it('behavioral_timing expected answers is null (post-hoc analysis)', () => {
    const session = generateVerificationSession();
    expect(session.expectedAnswers.behavioral_timing).toBeNull();
  });

  it('each call generates a distinct session (different problem IDs)', () => {
    const s1 = generateVerificationSession();
    const s2 = generateVerificationSession();
    const ids1 = (s1.challenges[0].data as SpeedArithmeticChallenge).problems.map(p => p.id);
    const ids2 = (s2.challenges[0].data as SpeedArithmeticChallenge).problems.map(p => p.id);
    // UUIDs are random — at least the first IDs should differ
    expect(ids1[0]).not.toBe(ids2[0]);
  });
});

// ---------------------------------------------------------------------------
// Speed Arithmetic challenge
// ---------------------------------------------------------------------------

describe('generateVerificationSession — speed_arithmetic', () => {
  let challenge: ChallengePayload;
  let data: SpeedArithmeticChallenge;
  let answers: Map<string, number>;

  beforeEach(() => {
    const session = generateVerificationSession();
    challenge = session.challenges.find(c => c.type === 'speed_arithmetic')!;
    data = challenge.data as SpeedArithmeticChallenge;
    answers = session.expectedAnswers.speed_arithmetic;
  });

  it('produces exactly 20 arithmetic problems', () => {
    expect(data.problems).toHaveLength(20);
  });

  it('each problem has an id and expression', () => {
    for (const p of data.problems) {
      expect(typeof p.id).toBe('string');
      expect(p.id).toHaveLength(36); // UUID format
      expect(typeof p.expression).toBe('string');
      expect(p.expression.length).toBeGreaterThan(0);
    }
  });

  it('expressions match one of the three operator patterns', () => {
    for (const p of data.problems) {
      expect(p.expression).toMatch(/^\d+ [+\-*] \d+$/);
    }
  });

  it('expectedAnswers map has 20 entries keyed by problem id', () => {
    expect(answers.size).toBe(20);
    for (const p of data.problems) {
      expect(answers.has(p.id)).toBe(true);
    }
  });

  it('every answer is a finite integer', () => {
    for (const [, v] of answers) {
      expect(Number.isInteger(v)).toBe(true);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('answers are mathematically correct for each expression', () => {
    for (const p of data.problems) {
      const expected = answers.get(p.id)!;
      const computed = safeArithmetic(p.expression);
      expect(computed).toBe(expected);
    }
  });

  it('all problem ids are unique', () => {
    const ids = data.problems.map(p => p.id);
    expect(new Set(ids).size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Speed JSON Parse challenge
// ---------------------------------------------------------------------------

describe('generateVerificationSession — speed_json_parse', () => {
  let data: SpeedJsonParseChallenge;
  let answers: Map<string, unknown>;

  beforeEach(() => {
    const session = generateVerificationSession();
    const challenge = session.challenges.find(c => c.type === 'speed_json_parse')!;
    data = challenge.data as SpeedJsonParseChallenge;
    answers = session.expectedAnswers.speed_json_parse;
  });

  it('produces exactly 10 JSON objects', () => {
    expect(data.objects).toHaveLength(10);
  });

  it('each object has an id, json string, and path', () => {
    for (const obj of data.objects) {
      expect(typeof obj.id).toBe('string');
      expect(typeof obj.json).toBe('string');
      expect(typeof obj.path).toBe('string');
      expect(obj.path.length).toBeGreaterThan(0);
    }
  });

  it('json field is valid JSON', () => {
    for (const obj of data.objects) {
      expect(() => JSON.parse(obj.json)).not.toThrow();
    }
  });

  it('expectedAnswers map has 10 entries', () => {
    expect(answers.size).toBe(10);
  });

  it('resolving each path on the parsed json gives the expected answer', () => {
    for (const obj of data.objects) {
      const parsed = JSON.parse(obj.json);
      const resolved = resolvePath(parsed, obj.path);
      const expected = answers.get(obj.id);
      expect(resolved).toEqual(expected);
    }
  });

  it('all object ids are unique', () => {
    const ids = data.objects.map(o => o.id);
    expect(new Set(ids).size).toBe(10);
  });

  it('paths have multiple segments (nested objects)', () => {
    for (const obj of data.objects) {
      const parts = obj.path.split('.');
      expect(parts.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Structured Output challenge
// ---------------------------------------------------------------------------

describe('generateVerificationSession — structured_output', () => {
  let data: StructuredOutputChallenge;
  let expected: Record<string, unknown>;

  beforeEach(() => {
    const session = generateVerificationSession();
    const challenge = session.challenges.find(c => c.type === 'structured_output')!;
    data = challenge.data as StructuredOutputChallenge;
    expected = session.expectedAnswers.structured_output;
  });

  it('challenge has a seed (hex string) and 7 constraint strings', () => {
    expect(typeof data.seed).toBe('string');
    expect(data.seed).toMatch(/^[0-9a-f]+$/);
    expect(data.constraints).toHaveLength(7);
  });

  it('expected hash is the SHA-256 of the seed', () => {
    const computedHash = crypto.createHash('sha256').update(data.seed).digest('hex');
    expect(expected['hash']).toBe(computedHash);
  });

  it('expected primes is an array of exactly 7 primes < 100', () => {
    const primes = expected['primes'] as number[];
    expect(primes).toHaveLength(7);
    for (const p of primes) {
      expect(PRIMES_UNDER_100.has(p)).toBe(true);
    }
  });

  it('primes are sorted ascending', () => {
    const primes = expected['primes'] as number[];
    for (let i = 1; i < primes.length; i++) {
      expect(primes[i]).toBeGreaterThan(primes[i - 1]);
    }
  });

  it('all selected primes are distinct', () => {
    const primes = expected['primes'] as number[];
    expect(new Set(primes).size).toBe(7);
  });

  it('fibonacci sequence is [0,1,1,2,3,5,8,13,21,34]', () => {
    expect(expected['fibonacci']).toEqual([0, 1, 1, 2, 3, 5, 8, 13, 21, 34]);
  });

  it('reversedSeed is the seed reversed character by character', () => {
    const reversed = data.seed.split('').reverse().join('');
    expect(expected['reversedSeed']).toBe(reversed);
  });

  it('magicSum is a number between 30 and 100 inclusive', () => {
    const sum = expected['magicSum'] as number;
    expect(sum).toBeGreaterThanOrEqual(30);
    expect(sum).toBeLessThanOrEqual(100);
  });

  it('expected constraints object carries the seed', () => {
    expect(expected['seed']).toBe(data.seed);
  });

  it('each constraint string is non-empty', () => {
    for (const c of data.constraints) {
      expect(typeof c).toBe('string');
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it('constraint strings reference the seed', () => {
    const seedConstraints = data.constraints.filter(c => c.includes(data.seed));
    // At least 2 constraints mention the seed (hash and reversed_seed)
    expect(seedConstraints.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Behavioral Timing challenge
// ---------------------------------------------------------------------------

describe('generateVerificationSession — behavioral_timing', () => {
  const KNOWN_QUESTIONS = new Set([
    'What is the capital of France?',
    'What is 2 + 2?',
    'Name a primary color.',
    'What planet is closest to the Sun?',
    'How many sides does a triangle have?',
    'What is the chemical symbol for water?',
    'Name a day of the week.',
    'What is the square root of 144?',
    'Name a continent.',
    'What color is the sky on a clear day?',
    'How many months have 30 days?',
    'What is 10 * 10?',
    'Name a season of the year.',
    'What is the opposite of hot?',
    'How many letters in the English alphabet?',
    'What is 100 divided by 4?',
    'Name a musical instrument.',
    'What gas do humans breathe in?',
    'How many legs does a spider have?',
    'What is the freezing point of water in Celsius?',
  ]);

  let data: BehavioralTimingChallenge;

  beforeEach(() => {
    const session = generateVerificationSession();
    const challenge = session.challenges.find(c => c.type === 'behavioral_timing')!;
    data = challenge.data as BehavioralTimingChallenge;
  });

  it('picks exactly 15 questions', () => {
    expect(data.questions).toHaveLength(15);
  });

  it('every question has an id (UUID) and question string', () => {
    for (const q of data.questions) {
      expect(typeof q.id).toBe('string');
      expect(q.id).toHaveLength(36);
      expect(typeof q.question).toBe('string');
      expect(q.question.length).toBeGreaterThan(0);
    }
  });

  it('all questions come from the known question bank', () => {
    for (const q of data.questions) {
      expect(KNOWN_QUESTIONS.has(q.question)).toBe(true);
    }
  });

  it('no duplicate question text is selected', () => {
    const texts = data.questions.map(q => q.question);
    expect(new Set(texts).size).toBe(15);
  });

  it('all question ids are unique', () => {
    const ids = data.questions.map(q => q.id);
    expect(new Set(ids).size).toBe(15);
  });
});
