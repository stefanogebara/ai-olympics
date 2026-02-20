import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import {
  generateVerificationSession,
  type ChallengePayload,
  type SpeedArithmeticChallenge,
  type SpeedJsonParseChallenge,
  type StructuredOutputChallenge,
  type BehavioralTimingChallenge,
  type GeneratedSession,
} from './verification-challenge-service.js';

// ============================================================================
// Helpers
// ============================================================================

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

const QUESTION_BANK = [
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
];

// ============================================================================
// Tests
// ============================================================================

describe('VerificationChallengeService', () => {
  // --------------------------------------------------------------------------
  // generateVerificationSession - Top-level structure
  // --------------------------------------------------------------------------
  describe('generateVerificationSession()', () => {
    it('returns 4 challenges', () => {
      const session = generateVerificationSession();
      expect(session.challenges).toHaveLength(4);
    });

    it('returns one challenge of each type', () => {
      const session = generateVerificationSession();
      const types = session.challenges.map(c => c.type);
      expect(types).toContain('speed_arithmetic');
      expect(types).toContain('speed_json_parse');
      expect(types).toContain('structured_output');
      expect(types).toContain('behavioral_timing');
    });

    it('returns challenges in the correct order', () => {
      const session = generateVerificationSession();
      expect(session.challenges[0].type).toBe('speed_arithmetic');
      expect(session.challenges[1].type).toBe('speed_json_parse');
      expect(session.challenges[2].type).toBe('structured_output');
      expect(session.challenges[3].type).toBe('behavioral_timing');
    });

    it('sets correct time limits for each challenge', () => {
      const session = generateVerificationSession();
      expect(session.challenges[0].timeLimit).toBe(5000);
      expect(session.challenges[1].timeLimit).toBe(4000);
      expect(session.challenges[2].timeLimit).toBe(15000);
      expect(session.challenges[3].timeLimit).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Speed Arithmetic challenge
  // --------------------------------------------------------------------------
  describe('Speed Arithmetic challenge', () => {
    let session: GeneratedSession;
    let challenge: ChallengePayload;
    let data: SpeedArithmeticChallenge;

    beforeAll(() => {
      session = generateVerificationSession();
      challenge = session.challenges[0];
      data = challenge.data as SpeedArithmeticChallenge;
    });

    it('has exactly 20 problems', () => {
      expect(data.problems).toHaveLength(20);
    });

    it('each problem has id and expression', () => {
      for (const problem of data.problems) {
        expect(problem.id).toBeDefined();
        expect(typeof problem.id).toBe('string');
        expect(problem.id.length).toBeGreaterThan(0);
        expect(problem.expression).toBeDefined();
        expect(typeof problem.expression).toBe('string');
      }
    });

    it('expressions use +, -, or * operators', () => {
      for (const problem of data.problems) {
        expect(problem.expression).toMatch(/^\d+\s*[+\-*]\s*\d+$/);
      }
    });

    it('expected answers map has 20 entries', () => {
      const answers = session.expectedAnswers.speed_arithmetic;
      expect(answers.size).toBe(20);
    });

    it('each problem id maps to a correct arithmetic result', () => {
      const answers = session.expectedAnswers.speed_arithmetic;
      for (const problem of data.problems) {
        const expected = answers.get(problem.id);
        expect(expected).toBeDefined();
        // Evaluate the expression manually
        const parts = problem.expression.split(/\s+/);
        const a = parseInt(parts[0], 10);
        const op = parts[1];
        const b = parseInt(parts[2], 10);
        let result: number;
        if (op === '+') result = a + b;
        else if (op === '-') result = a - b;
        else result = a * b;
        expect(expected).toBe(result);
      }
    });

    it('all problem ids are unique', () => {
      const ids = data.problems.map(p => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // --------------------------------------------------------------------------
  // Speed JSON Parse challenge
  // --------------------------------------------------------------------------
  describe('Speed JSON Parse challenge', () => {
    let session: GeneratedSession;
    let challenge: ChallengePayload;
    let data: SpeedJsonParseChallenge;

    beforeAll(() => {
      session = generateVerificationSession();
      challenge = session.challenges[1];
      data = challenge.data as SpeedJsonParseChallenge;
    });

    it('has exactly 10 objects', () => {
      expect(data.objects).toHaveLength(10);
    });

    it('each object has id, json, and path fields', () => {
      for (const obj of data.objects) {
        expect(obj.id).toBeDefined();
        expect(typeof obj.id).toBe('string');
        expect(obj.json).toBeDefined();
        expect(typeof obj.json).toBe('string');
        expect(obj.path).toBeDefined();
        expect(typeof obj.path).toBe('string');
      }
    });

    it('each json field contains valid JSON', () => {
      for (const obj of data.objects) {
        expect(() => JSON.parse(obj.json)).not.toThrow();
      }
    });

    it('paths are dot-separated key paths', () => {
      for (const obj of data.objects) {
        const parts = obj.path.split('.');
        expect(parts.length).toBeGreaterThanOrEqual(3);
        for (const part of parts) {
          expect(part.length).toBeGreaterThan(0);
        }
      }
    });

    it('traversing the path yields the expected answer', () => {
      const answers = session.expectedAnswers.speed_json_parse;
      for (const obj of data.objects) {
        const parsed = JSON.parse(obj.json);
        const pathParts = obj.path.split('.');
        let current: unknown = parsed;
        for (const part of pathParts) {
          expect(current).toBeDefined();
          current = (current as Record<string, unknown>)[part];
        }
        expect(current).toBe(answers.get(obj.id));
      }
    });

    it('expected answers map has 10 entries', () => {
      expect(session.expectedAnswers.speed_json_parse.size).toBe(10);
    });

    it('all object ids are unique', () => {
      const ids = data.objects.map(o => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // --------------------------------------------------------------------------
  // Structured Output challenge
  // --------------------------------------------------------------------------
  describe('Structured Output challenge', () => {
    let session: GeneratedSession;
    let challenge: ChallengePayload;
    let data: StructuredOutputChallenge;
    let expected: Record<string, unknown>;

    beforeAll(() => {
      session = generateVerificationSession();
      challenge = session.challenges[2];
      data = challenge.data as StructuredOutputChallenge;
      expected = session.expectedAnswers.structured_output;
    });

    it('has a seed string', () => {
      expect(data.seed).toBeDefined();
      expect(typeof data.seed).toBe('string');
      expect(data.seed.length).toBe(32); // 16 bytes hex = 32 chars
    });

    it('has exactly 7 constraints', () => {
      expect(data.constraints).toHaveLength(7);
    });

    it('expected hash matches SHA-256 of the seed', () => {
      const computedHash = crypto.createHash('sha256').update(data.seed).digest('hex');
      expect(expected.hash).toBe(computedHash);
    });

    it('expected primes are all prime numbers', () => {
      const primes = expected.primes as number[];
      for (const p of primes) {
        expect(isPrime(p)).toBe(true);
      }
    });

    it('expected primes are all under 100', () => {
      const primes = expected.primes as number[];
      for (const p of primes) {
        expect(p).toBeLessThan(100);
      }
    });

    it('expected primes has exactly 7 entries', () => {
      const primes = expected.primes as number[];
      expect(primes).toHaveLength(7);
    });

    it('expected primes are sorted ascending', () => {
      const primes = expected.primes as number[];
      for (let i = 1; i < primes.length; i++) {
        expect(primes[i]).toBeGreaterThan(primes[i - 1]);
      }
    });

    it('expected fibonacci is correct first 10 numbers', () => {
      expect(expected.fibonacci).toEqual([0, 1, 1, 2, 3, 5, 8, 13, 21, 34]);
    });

    it('expected reversedSeed is the seed reversed', () => {
      const reversed = data.seed.split('').reverse().join('');
      expect(expected.reversedSeed).toBe(reversed);
    });

    it('expected magicSum is a number between 30 and 100', () => {
      const magicSum = expected.magicSum as number;
      expect(typeof magicSum).toBe('number');
      expect(magicSum).toBeGreaterThanOrEqual(30);
      expect(magicSum).toBeLessThanOrEqual(100);
    });
  });

  // --------------------------------------------------------------------------
  // Behavioral Timing challenge
  // --------------------------------------------------------------------------
  describe('Behavioral Timing challenge', () => {
    let session: GeneratedSession;
    let challenge: ChallengePayload;
    let data: BehavioralTimingChallenge;

    beforeAll(() => {
      session = generateVerificationSession();
      challenge = session.challenges[3];
      data = challenge.data as BehavioralTimingChallenge;
    });

    it('has exactly 15 questions', () => {
      expect(data.questions).toHaveLength(15);
    });

    it('each question has id and question string', () => {
      for (const q of data.questions) {
        expect(q.id).toBeDefined();
        expect(typeof q.id).toBe('string');
        expect(q.id.length).toBeGreaterThan(0);
        expect(q.question).toBeDefined();
        expect(typeof q.question).toBe('string');
        expect(q.question.length).toBeGreaterThan(0);
      }
    });

    it('all questions come from the known question bank', () => {
      for (const q of data.questions) {
        expect(QUESTION_BANK).toContain(q.question);
      }
    });

    it('all question ids are unique', () => {
      const ids = data.questions.map(q => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('questions are a subset of the 20-question bank', () => {
      const questionTexts = data.questions.map(q => q.question);
      const uniqueQuestions = new Set(questionTexts);
      // 15 picked from 20, should be at most 20
      expect(uniqueQuestions.size).toBeLessThanOrEqual(20);
      expect(uniqueQuestions.size).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Randomness
  // --------------------------------------------------------------------------
  describe('Randomness', () => {
    it('two calls produce different sessions', () => {
      const session1 = generateVerificationSession();
      const session2 = generateVerificationSession();

      // Seeds should differ
      const data1 = session1.challenges[2].data as StructuredOutputChallenge;
      const data2 = session2.challenges[2].data as StructuredOutputChallenge;
      expect(data1.seed).not.toBe(data2.seed);
    });

    it('two calls produce different arithmetic problems', () => {
      const session1 = generateVerificationSession();
      const session2 = generateVerificationSession();

      const data1 = session1.challenges[0].data as SpeedArithmeticChallenge;
      const data2 = session2.challenges[0].data as SpeedArithmeticChallenge;

      // Problem IDs should differ (UUIDs)
      expect(data1.problems[0].id).not.toBe(data2.problems[0].id);
    });

    it('two calls produce different JSON parse objects', () => {
      const session1 = generateVerificationSession();
      const session2 = generateVerificationSession();

      const data1 = session1.challenges[1].data as SpeedJsonParseChallenge;
      const data2 = session2.challenges[1].data as SpeedJsonParseChallenge;

      // Object IDs should differ
      expect(data1.objects[0].id).not.toBe(data2.objects[0].id);
    });
  });

  // --------------------------------------------------------------------------
  // Expected answers structure
  // --------------------------------------------------------------------------
  describe('Expected answers structure', () => {
    it('speed_arithmetic answers is a Map', () => {
      const session = generateVerificationSession();
      expect(session.expectedAnswers.speed_arithmetic).toBeInstanceOf(Map);
    });

    it('speed_json_parse answers is a Map', () => {
      const session = generateVerificationSession();
      expect(session.expectedAnswers.speed_json_parse).toBeInstanceOf(Map);
    });

    it('structured_output answers is a plain object with required fields', () => {
      const session = generateVerificationSession();
      const structured = session.expectedAnswers.structured_output;
      expect(typeof structured).toBe('object');
      expect(structured).not.toBeInstanceOf(Map);
      expect(structured).toHaveProperty('hash');
      expect(structured).toHaveProperty('primes');
      expect(structured).toHaveProperty('magicSum');
      expect(structured).toHaveProperty('seed');
      expect(structured).toHaveProperty('fibonacci');
      expect(structured).toHaveProperty('reversedSeed');
    });

    it('behavioral_timing answers is null', () => {
      const session = generateVerificationSession();
      expect(session.expectedAnswers.behavioral_timing).toBeNull();
    });
  });
});
