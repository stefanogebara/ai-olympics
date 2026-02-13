import { describe, it, expect } from 'vitest';
import {
  scoreSpeedArithmetic,
  scoreSpeedJsonParse,
  scoreStructuredOutput,
  scoreBehavioralTiming,
  computeVerificationResult,
} from './verification-scoring.js';
import type { ChallengeResult } from './verification-scoring.js';

describe('scoreSpeedArithmetic', () => {
  const expected = new Map<string, number>([
    ['q1', 10], ['q2', 20], ['q3', 30], ['q4', 40], ['q5', 50],
    ['q6', 60], ['q7', 70], ['q8', 80], ['q9', 90], ['q10', 100],
    ['q11', 110], ['q12', 120], ['q13', 130], ['q14', 140], ['q15', 150],
    ['q16', 160], ['q17', 170], ['q18', 180], ['q19', 190], ['q20', 200],
  ]);

  it('gives full score for perfect accuracy with fast response', () => {
    const answers = Array.from(expected).map(([id, result]) => ({ id, result }));
    const result = scoreSpeedArithmetic({ answers }, expected, 1000, 10000);
    expect(result.type).toBe('speed_arithmetic');
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('fails when fewer than 18 correct', () => {
    const answers = Array.from(expected).slice(0, 17).map(([id, result]) => ({ id, result }));
    const result = scoreSpeedArithmetic({ answers }, expected, 5000, 10000);
    expect(result.passed).toBe(false);
  });

  it('passes with exactly 18 correct within time', () => {
    const answers = Array.from(expected).slice(0, 18).map(([id, result]) => ({ id, result }));
    const result = scoreSpeedArithmetic({ answers }, expected, 5000, 10000);
    expect(result.passed).toBe(true);
  });

  it('fails when response time exceeds limit', () => {
    const answers = Array.from(expected).map(([id, result]) => ({ id, result }));
    const result = scoreSpeedArithmetic({ answers }, expected, 15000, 10000);
    expect(result.passed).toBe(false);
  });

  it('returns 0 accuracy for no answers', () => {
    const result = scoreSpeedArithmetic({ answers: [] }, expected, 5000, 10000);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('handles empty expected answers', () => {
    const result = scoreSpeedArithmetic({ answers: [] }, new Map(), 5000, 10000);
    expect(result.score).toBe(0);
  });

  it('time bonus decreases with slower response', () => {
    const answers = Array.from(expected).map(([id, result]) => ({ id, result }));
    const fast = scoreSpeedArithmetic({ answers }, expected, 1000, 10000);
    const slow = scoreSpeedArithmetic({ answers }, expected, 9000, 10000);
    expect(fast.score).toBeGreaterThan(slow.score);
  });
});

describe('scoreSpeedJsonParse', () => {
  const expected = new Map<string, unknown>([
    ['j1', 'hello'], ['j2', 42], ['j3', { key: 'value' }],
    ['j4', [1, 2, 3]], ['j5', true], ['j6', null],
    ['j7', 'world'], ['j8', 99], ['j9', 'test'], ['j10', false],
  ]);

  it('gives full score for all correct', () => {
    const answers = Array.from(expected).map(([id, value]) => ({ id, value }));
    const result = scoreSpeedJsonParse({ answers }, expected, 1000, 10000);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('fails with fewer than 9 correct', () => {
    const answers = Array.from(expected).slice(0, 8).map(([id, value]) => ({ id, value }));
    const result = scoreSpeedJsonParse({ answers }, expected, 5000, 10000);
    expect(result.passed).toBe(false);
  });

  it('passes with exactly 9 correct', () => {
    const answers = Array.from(expected).slice(0, 9).map(([id, value]) => ({ id, value }));
    const result = scoreSpeedJsonParse({ answers }, expected, 5000, 10000);
    expect(result.passed).toBe(true);
  });

  it('uses deep equality for objects', () => {
    const answers = [{ id: 'j3', value: { key: 'wrong' } }];
    const result = scoreSpeedJsonParse({ answers }, expected, 5000, 10000);
    expect((result.details as any).correct).toBe(0);
  });
});

describe('scoreStructuredOutput', () => {
  const expectedData = {
    hash: 'abc123hash',
    primes: [2, 3, 5, 7, 11, 13, 17],
    magicSum: 15,
    fibonacci: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34],
    reversedSeed: 'dees',
  };

  it('gives full score for perfect output', () => {
    const answer = {
      output: {
        hash: 'abc123hash',
        primes: [2, 3, 5, 7, 11, 13, 17],
        matrix: [[5, 5, 5], [5, 5, 5], [5, 5, 5]],
        name: 'TestAgent',
        timestamp: Date.now(),
        fibonacci: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34],
        reversed_seed: 'dees',
      },
    };
    const result = scoreStructuredOutput(answer, expectedData, 5000, 10000);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
  });

  it('fails when less than 80% constraints satisfied', () => {
    const answer = {
      output: {
        hash: 'wrong',
        primes: [1, 2, 3],
        matrix: [[1, 2, 3]],
        name: '',
        timestamp: 0,
        fibonacci: [],
        reversed_seed: 'wrong',
      },
    };
    const result = scoreStructuredOutput(answer, expectedData, 5000, 10000);
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(80);
  });

  it('validates matrix row sums', () => {
    const answer = {
      output: {
        hash: 'abc123hash',
        primes: [2, 3, 5, 7, 11, 13, 17],
        matrix: [[5, 5, 5], [10, 3, 2], [1, 1, 1]], // last row sums to 3, not 15
        name: 'Test',
        timestamp: Date.now(),
        fibonacci: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34],
        reversed_seed: 'dees',
      },
    };
    const result = scoreStructuredOutput(answer, expectedData, 5000, 10000);
    expect((result.details as any).constraintResults.matrix).toBe(false);
  });

  it('handles empty output', () => {
    const result = scoreStructuredOutput({ output: {} }, expectedData, 5000, 10000);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('fails when response time exceeds limit', () => {
    const answer = {
      output: {
        hash: 'abc123hash',
        primes: [2, 3, 5, 7, 11, 13, 17],
        matrix: [[5, 5, 5], [5, 5, 5], [5, 5, 5]],
        name: 'Test',
        timestamp: Date.now(),
        fibonacci: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34],
        reversed_seed: 'dees',
      },
    };
    const result = scoreStructuredOutput(answer, expectedData, 15000, 10000);
    expect(result.passed).toBe(false);
  });
});

describe('scoreBehavioralTiming', () => {
  it('gives high score for consistent AI-like timing', () => {
    // AI agent: very consistent intervals
    const responses = Array.from({ length: 10 }, (_, i) => ({
      id: `q${i}`,
      answer: 'yes',
      timestamp: 1000 + i * 500, // exactly 500ms apart
    }));
    const result = scoreBehavioralTiming({ responses });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.passed).toBe(true);
  });

  it('gives lower score for inconsistent human-like timing', () => {
    // Human: highly variable intervals
    const responses = [
      { id: 'q0', answer: 'a', timestamp: 1000 },
      { id: 'q1', answer: 'b', timestamp: 1200 },
      { id: 'q2', answer: 'c', timestamp: 3500 },
      { id: 'q3', answer: 'd', timestamp: 4000 },
      { id: 'q4', answer: 'e', timestamp: 8000 },
      { id: 'q5', answer: 'f', timestamp: 8100 },
      { id: 'q6', answer: 'g', timestamp: 12000 },
    ];
    const result = scoreBehavioralTiming({ responses });
    expect(result.score).toBeLessThan(80);
  });

  it('fails with fewer than 5 responses', () => {
    const responses = [
      { id: 'q0', answer: 'a', timestamp: 1000 },
      { id: 'q1', answer: 'b', timestamp: 2000 },
    ];
    const result = scoreBehavioralTiming({ responses });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('handles empty responses', () => {
    const result = scoreBehavioralTiming({ responses: [] });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('detects fatigue (slower second half)', () => {
    // Second half intervals are 3x longer -> fatigue
    const responses = [
      { id: 'q0', answer: 'a', timestamp: 0 },
      { id: 'q1', answer: 'b', timestamp: 500 },
      { id: 'q2', answer: 'c', timestamp: 1000 },
      { id: 'q3', answer: 'd', timestamp: 1500 },
      { id: 'q4', answer: 'e', timestamp: 3000 },
      { id: 'q5', answer: 'f', timestamp: 4500 },
      { id: 'q6', answer: 'g', timestamp: 6000 },
      { id: 'q7', answer: 'h', timestamp: 7500 },
    ];
    const result = scoreBehavioralTiming({ responses });
    expect((result.details as any).fatigueRatio).toBeGreaterThan(1.0);
  });

  it('returns responseTimeMs as total time span', () => {
    const responses = [
      { id: 'q0', answer: 'a', timestamp: 1000 },
      { id: 'q1', answer: 'b', timestamp: 1500 },
      { id: 'q2', answer: 'c', timestamp: 2000 },
      { id: 'q3', answer: 'd', timestamp: 2500 },
      { id: 'q4', answer: 'e', timestamp: 3000 },
    ];
    const result = scoreBehavioralTiming({ responses });
    expect(result.responseTimeMs).toBe(2000);
  });
});

describe('computeVerificationResult', () => {
  function makeResult(type: string, score: number, passed: boolean): ChallengeResult {
    return {
      type: type as any,
      passed,
      score,
      responseTimeMs: 5000,
      details: {},
    };
  }

  it('computes weighted average score', () => {
    const results = [
      makeResult('speed_arithmetic', 100, true),
      makeResult('speed_json_parse', 100, true),
      makeResult('structured_output', 100, true),
      makeResult('behavioral_timing', 100, true),
    ];
    const verdict = computeVerificationResult(results);
    expect(verdict.totalScore).toBe(100);
    expect(verdict.passed).toBe(true);
  });

  it('fails when total score is below 70', () => {
    const results = [
      makeResult('speed_arithmetic', 50, false),
      makeResult('speed_json_parse', 50, false),
      makeResult('structured_output', 50, false),
      makeResult('behavioral_timing', 50, false),
    ];
    const verdict = computeVerificationResult(results);
    expect(verdict.totalScore).toBe(50);
    expect(verdict.passed).toBe(false);
  });

  it('computes speedScore as average of speed challenges', () => {
    const results = [
      makeResult('speed_arithmetic', 80, true),
      makeResult('speed_json_parse', 60, true),
      makeResult('structured_output', 90, true),
      makeResult('behavioral_timing', 70, true),
    ];
    const verdict = computeVerificationResult(results);
    expect(verdict.speedScore).toBe(70); // (80+60)/2
    expect(verdict.structuredScore).toBe(90);
    expect(verdict.behavioralScore).toBe(70);
  });

  it('handles missing challenge types', () => {
    const results = [
      makeResult('speed_arithmetic', 100, true),
    ];
    const verdict = computeVerificationResult(results);
    expect(verdict.totalScore).toBe(100); // only one weight counts
    expect(verdict.structuredScore).toBe(0);
    expect(verdict.behavioralScore).toBe(0);
  });

  it('returns 0 for empty results', () => {
    const verdict = computeVerificationResult([]);
    expect(verdict.totalScore).toBe(0);
    expect(verdict.passed).toBe(false);
  });
});
