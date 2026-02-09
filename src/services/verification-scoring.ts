import crypto from 'crypto';
import type {
  ChallengeType,
  ChallengeAnswers,
  SpeedArithmeticAnswer,
  SpeedJsonParseAnswer,
  StructuredOutputAnswer,
  BehavioralTimingAnswer,
} from './verification-challenge-service.js';

// ============================================================================
// Types
// ============================================================================

export interface ChallengeResult {
  type: ChallengeType;
  passed: boolean;
  score: number;       // 0-100
  responseTimeMs: number;
  details: Record<string, unknown>;
}

export interface VerificationResult {
  passed: boolean;
  totalScore: number;  // 0-100 weighted aggregate
  challengeResults: ChallengeResult[];
  speedScore: number;
  structuredScore: number;
  behavioralScore: number;
}

// Challenge weights
const WEIGHTS: Record<ChallengeType, number> = {
  speed_arithmetic: 0.30,
  structured_output: 0.30,
  speed_json_parse: 0.20,
  behavioral_timing: 0.20,
};

// ============================================================================
// Per-Challenge Scoring
// ============================================================================

export function scoreSpeedArithmetic(
  answer: SpeedArithmeticAnswer,
  expectedAnswers: Map<string, number>,
  responseTimeMs: number,
  timeLimit: number,
): ChallengeResult {
  let correct = 0;
  const total = expectedAnswers.size;

  for (const [id, expected] of expectedAnswers) {
    const submitted = answer.answers?.find(a => a.id === id);
    if (submitted && submitted.result === expected) {
      correct++;
    }
  }

  const accuracy = total > 0 ? correct / total : 0;
  const timeBonus = Math.max(0, 1 - responseTimeMs / timeLimit) * 0.3 + 0.7;
  const score = Math.round(accuracy * timeBonus * 100);
  const passed = correct >= 18 && responseTimeMs <= timeLimit;

  return {
    type: 'speed_arithmetic',
    passed,
    score,
    responseTimeMs,
    details: { correct, total, accuracy, timeBonus, timeLimitMs: timeLimit },
  };
}

export function scoreSpeedJsonParse(
  answer: SpeedJsonParseAnswer,
  expectedAnswers: Map<string, unknown>,
  responseTimeMs: number,
  timeLimit: number,
): ChallengeResult {
  let correct = 0;
  const total = expectedAnswers.size;

  for (const [id, expected] of expectedAnswers) {
    const submitted = answer.answers?.find(a => a.id === id);
    if (submitted && JSON.stringify(submitted.value) === JSON.stringify(expected)) {
      correct++;
    }
  }

  const accuracy = total > 0 ? correct / total : 0;
  const timeBonus = Math.max(0, 1 - responseTimeMs / timeLimit) * 0.3 + 0.7;
  const score = Math.round(accuracy * timeBonus * 100);
  const passed = correct >= 9 && responseTimeMs <= timeLimit;

  return {
    type: 'speed_json_parse',
    passed,
    score,
    responseTimeMs,
    details: { correct, total, accuracy, timeBonus, timeLimitMs: timeLimit },
  };
}

export function scoreStructuredOutput(
  answer: StructuredOutputAnswer,
  expected: Record<string, unknown>,
  responseTimeMs: number,
  timeLimit: number,
): ChallengeResult {
  const output = answer.output || {};
  let satisfied = 0;
  const totalConstraints = 7;
  const constraintResults: Record<string, boolean> = {};

  // 1. Hash = SHA-256 of seed
  const expectedHash = expected.hash as string;
  constraintResults.hash = output.hash === expectedHash;
  if (constraintResults.hash) satisfied++;

  // 2. Primes array
  const expectedPrimes = expected.primes as number[];
  const submittedPrimes = output.primes;
  constraintResults.primes =
    Array.isArray(submittedPrimes) &&
    submittedPrimes.length === 7 &&
    JSON.stringify(submittedPrimes) === JSON.stringify(expectedPrimes);
  if (constraintResults.primes) satisfied++;

  // 3. Matrix rows sum to magicSum
  const magicSum = expected.magicSum as number;
  const matrix = output.matrix;
  let matrixValid = false;
  if (Array.isArray(matrix) && matrix.length === 3) {
    matrixValid = matrix.every(
      (row: unknown) =>
        Array.isArray(row) &&
        row.length === 3 &&
        row.every((n: unknown) => typeof n === 'number') &&
        (row as number[]).reduce((a: number, b: number) => a + b, 0) === magicSum
    );
  }
  constraintResults.matrix = matrixValid;
  if (constraintResults.matrix) satisfied++;

  // 4. Name is non-empty string
  constraintResults.name = typeof output.name === 'string' && output.name.length > 0;
  if (constraintResults.name) satisfied++;

  // 5. Timestamp is a number (epoch ms)
  constraintResults.timestamp = typeof output.timestamp === 'number' && output.timestamp > 1000000000000;
  if (constraintResults.timestamp) satisfied++;

  // 6. Fibonacci first 10
  const expectedFib = expected.fibonacci as number[];
  constraintResults.fibonacci =
    Array.isArray(output.fibonacci) &&
    output.fibonacci.length === 10 &&
    JSON.stringify(output.fibonacci) === JSON.stringify(expectedFib);
  if (constraintResults.fibonacci) satisfied++;

  // 7. Reversed seed
  constraintResults.reversed_seed = output.reversed_seed === expected.reversedSeed;
  if (constraintResults.reversed_seed) satisfied++;

  const ratio = satisfied / totalConstraints;
  const score = Math.round(ratio * 100);
  const passed = ratio >= 0.80 && responseTimeMs <= timeLimit;

  return {
    type: 'structured_output',
    passed,
    score,
    responseTimeMs,
    details: { satisfied, totalConstraints, constraintResults, timeLimitMs: timeLimit },
  };
}

export function scoreBehavioralTiming(
  answer: BehavioralTimingAnswer,
): ChallengeResult {
  const responses = answer.responses || [];
  if (responses.length < 5) {
    return {
      type: 'behavioral_timing',
      passed: false,
      score: 0,
      responseTimeMs: 0,
      details: { error: 'Too few responses', count: responses.length },
    };
  }

  // Calculate inter-response intervals
  const sorted = [...responses].sort((a, b) => a.timestamp - b.timestamp);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].timestamp - sorted[i - 1].timestamp);
  }

  const totalTime = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
  const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  // Standard deviation of intervals
  const variance = intervals.reduce((sum, val) => sum + Math.pow(val - meanInterval, 2), 0) / intervals.length;
  const stddev = Math.sqrt(variance);

  // Coefficient of variation (lower = more consistent = more AI-like)
  const cv = meanInterval > 0 ? stddev / meanInterval : 1;

  // Fatigue detection: compare first half vs second half average intervals
  const midpoint = Math.floor(intervals.length / 2);
  const firstHalfAvg = intervals.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const secondHalfAvg = intervals.slice(midpoint).reduce((a, b) => a + b, 0) / (intervals.length - midpoint);
  const fatigueRatio = secondHalfAvg / firstHalfAvg;
  // AI: fatigueRatio ~ 1.0; Human: fatigueRatio > 1.3 (slowing down)

  // Consistency score (0-100): lower CV = higher score
  // AI typically has CV < 0.3, humans > 0.5
  const consistencyScore = Math.max(0, Math.min(100, (1 - cv) * 100));

  // Fatigue score (0-100): closer to 1.0 = higher score
  const fatiguePenalty = Math.abs(fatigueRatio - 1.0);
  const fatigueScore = Math.max(0, Math.min(100, (1 - fatiguePenalty) * 100));

  // Combined: consistency 60%, fatigue 40%
  const score = Math.round(consistencyScore * 0.6 + fatigueScore * 0.4);
  const passed = score >= 50;

  return {
    type: 'behavioral_timing',
    passed,
    score,
    responseTimeMs: totalTime,
    details: {
      responseCount: responses.length,
      meanIntervalMs: Math.round(meanInterval),
      stddevMs: Math.round(stddev),
      cv: Math.round(cv * 100) / 100,
      fatigueRatio: Math.round(fatigueRatio * 100) / 100,
      consistencyScore: Math.round(consistencyScore),
      fatigueScore: Math.round(fatigueScore),
    },
  };
}

// ============================================================================
// Aggregate Scoring
// ============================================================================

export function computeVerificationResult(challengeResults: ChallengeResult[]): VerificationResult {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const result of challengeResults) {
    const weight = WEIGHTS[result.type] || 0;
    weightedSum += result.score * weight;
    totalWeight += weight;
  }

  const totalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  // Category sub-scores
  const speedResults = challengeResults.filter(r =>
    r.type === 'speed_arithmetic' || r.type === 'speed_json_parse'
  );
  const speedScore = speedResults.length > 0
    ? Math.round(speedResults.reduce((s, r) => s + r.score, 0) / speedResults.length)
    : 0;

  const structuredResult = challengeResults.find(r => r.type === 'structured_output');
  const structuredScore = structuredResult?.score || 0;

  const behavioralResult = challengeResults.find(r => r.type === 'behavioral_timing');
  const behavioralScore = behavioralResult?.score || 0;

  // Pass/fail thresholds
  const passed = totalScore >= 70;

  return {
    passed,
    totalScore,
    challengeResults,
    speedScore,
    structuredScore,
    behavioralScore,
  };
}
