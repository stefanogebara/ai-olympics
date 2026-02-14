import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface VerificationSession {
  sessionId: string;
  challenges: ChallengePayload[];
  expiresAt: string;
}

export type ChallengeType = 'speed_arithmetic' | 'speed_json_parse' | 'structured_output' | 'behavioral_timing';

export interface ChallengePayload {
  type: ChallengeType;
  timeLimit: number; // ms
  data: unknown;
}

export interface SpeedArithmeticChallenge {
  problems: Array<{ id: string; expression: string; }>;
}

export interface SpeedArithmeticAnswer {
  answers: Array<{ id: string; result: number; }>;
}

export interface SpeedJsonParseChallenge {
  objects: Array<{ id: string; json: string; path: string; }>;
}

export interface SpeedJsonParseAnswer {
  answers: Array<{ id: string; value: unknown; }>;
}

export interface StructuredOutputChallenge {
  seed: string;
  constraints: string[];
}

export interface StructuredOutputAnswer {
  output: Record<string, unknown>;
}

export interface BehavioralTimingChallenge {
  questions: Array<{ id: string; question: string; }>;
}

export interface BehavioralTimingAnswer {
  responses: Array<{ id: string; answer: string; timestamp: number; }>;
}

export interface ChallengeAnswers {
  speed_arithmetic?: SpeedArithmeticAnswer;
  speed_json_parse?: SpeedJsonParseAnswer;
  structured_output?: StructuredOutputAnswer;
  behavioral_timing?: BehavioralTimingAnswer;
}

// ============================================================================
// Challenge Generation
// ============================================================================

function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytes = crypto.randomBytes(4);
  return min + (bytes.readUInt32BE(0) % range);
}

function generateArithmeticProblems(): { problems: SpeedArithmeticChallenge['problems']; answers: Map<string, number> } {
  const ops = ['+', '-', '*'] as const;
  const problems: SpeedArithmeticChallenge['problems'] = [];
  const answers = new Map<string, number>();

  for (let i = 0; i < 20; i++) {
    const id = crypto.randomUUID();
    const op = ops[randomInt(0, 2)];
    let a: number, b: number, result: number, expression: string;

    if (op === '*') {
      a = randomInt(100, 999);
      b = randomInt(10, 999);
      result = a * b;
      expression = `${a} * ${b}`;
    } else if (op === '+') {
      a = randomInt(1000, 9999);
      b = randomInt(1000, 9999);
      result = a + b;
      expression = `${a} + ${b}`;
    } else {
      a = randomInt(5000, 9999);
      b = randomInt(1000, 4999);
      result = a - b;
      expression = `${a} - ${b}`;
    }

    problems.push({ id, expression });
    answers.set(id, result);
  }

  return { problems, answers };
}

function generateNestedJson(): { objects: SpeedJsonParseChallenge['objects']; answers: Map<string, unknown> } {
  const objects: SpeedJsonParseChallenge['objects'] = [];
  const answers = new Map<string, unknown>();

  for (let i = 0; i < 10; i++) {
    const id = crypto.randomUUID();
    const depth = randomInt(3, 6);

    // Build nested object with random keys
    let obj: Record<string, unknown> = {};
    let current: Record<string, unknown> = obj;
    const pathParts: string[] = [];

    for (let d = 0; d < depth - 1; d++) {
      const key = `key_${crypto.randomBytes(3).toString('hex')}`;
      pathParts.push(key);
      const child: Record<string, unknown> = {};
      current[key] = child;
      // Add some noise sibling keys
      current[`noise_${crypto.randomBytes(2).toString('hex')}`] = randomInt(1, 1000);
      current = child;
    }

    // Set the target value
    const finalKey = `target_${crypto.randomBytes(3).toString('hex')}`;
    pathParts.push(finalKey);
    const targetValue = randomInt(10000, 99999);
    current[finalKey] = targetValue;
    // Add noise at leaf level
    current[`noise_${crypto.randomBytes(2).toString('hex')}`] = 'decoy';

    const path = pathParts.join('.');
    objects.push({ id, json: JSON.stringify(obj), path });
    answers.set(id, targetValue);
  }

  return { objects, answers };
}

function generateStructuredOutputChallenge(): { challenge: StructuredOutputChallenge; expectedConstraints: Record<string, unknown> } {
  const seed = crypto.randomBytes(16).toString('hex');

  // Generate the SHA-256 of the seed (agents must compute this)
  const expectedHash = crypto.createHash('sha256').update(seed).digest('hex');

  // Generate 7 primes < 100, sorted ascending
  const primesUnder100 = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
  const selectedPrimes: number[] = [];
  const available = [...primesUnder100];
  for (let i = 0; i < 7; i++) {
    const idx = randomInt(0, available.length - 1);
    selectedPrimes.push(available[idx]);
    available.splice(idx, 1);
  }
  selectedPrimes.sort((a, b) => a - b);

  // Generate magic square target sum
  const magicSum = randomInt(30, 100);

  const constraints = [
    `Field "hash" must equal the SHA-256 hex digest of the seed "${seed}"`,
    `Field "primes" must be an array of exactly 7 prime numbers less than 100, sorted ascending. Use these specific primes: [${selectedPrimes.join(', ')}]`,
    `Field "matrix" must be a 3x3 array where each row sums to ${magicSum}`,
    `Field "name" must be a non-empty string`,
    `Field "timestamp" must be a number representing current Unix epoch in milliseconds`,
    `Field "fibonacci" must be an array of the first 10 Fibonacci numbers starting from 0`,
    `Field "reversed_seed" must be the seed string "${seed}" reversed character by character`,
  ];

  const expectedConstraints = {
    hash: expectedHash,
    primes: selectedPrimes,
    magicSum,
    seed,
    fibonacci: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34],
    reversedSeed: seed.split('').reverse().join(''),
  };

  return {
    challenge: { seed, constraints },
    expectedConstraints,
  };
}

function generateBehavioralQuestions(): BehavioralTimingChallenge {
  const questionBank = [
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

  // Pick 15 random questions
  const shuffled = [...questionBank].sort(() => Math.random() - 0.5);
  const questions = shuffled.slice(0, 15).map(q => ({
    id: crypto.randomUUID(),
    question: q,
  }));

  return { questions };
}

// ============================================================================
// Session Generation (main entry point)
// ============================================================================

export interface GeneratedSession {
  challenges: ChallengePayload[];
  expectedAnswers: {
    speed_arithmetic: Map<string, number>;
    speed_json_parse: Map<string, unknown>;
    structured_output: Record<string, unknown>;
    behavioral_timing: null; // analyzed post-hoc
  };
}

export function generateVerificationSession(): GeneratedSession {
  // 1. Speed Arithmetic
  const arithmetic = generateArithmeticProblems();
  const arithmeticChallenge: ChallengePayload = {
    type: 'speed_arithmetic',
    timeLimit: 5000,
    data: { problems: arithmetic.problems } as SpeedArithmeticChallenge,
  };

  // 2. Speed JSON Parse
  const jsonParse = generateNestedJson();
  const jsonParseChallenge: ChallengePayload = {
    type: 'speed_json_parse',
    timeLimit: 4000,
    data: { objects: jsonParse.objects } as SpeedJsonParseChallenge,
  };

  // 3. Structured Output
  const structured = generateStructuredOutputChallenge();
  const structuredChallenge: ChallengePayload = {
    type: 'structured_output',
    timeLimit: 15000,
    data: structured.challenge,
  };

  // 4. Behavioral Timing
  const behavioral = generateBehavioralQuestions();
  const behavioralChallenge: ChallengePayload = {
    type: 'behavioral_timing',
    timeLimit: 0, // no hard time limit, purely analytical
    data: behavioral,
  };

  return {
    challenges: [arithmeticChallenge, jsonParseChallenge, structuredChallenge, behavioralChallenge],
    expectedAnswers: {
      speed_arithmetic: arithmetic.answers,
      speed_json_parse: jsonParse.answers,
      structured_output: structured.expectedConstraints,
      behavioral_timing: null,
    },
  };
}
