import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ─── Async SHA-256 ─────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(hash));
}

// ─── AES-256-GCM Encryption (Deno Web Crypto) ─────────────────────────────────
// Format: iv_hex:authTag_hex:ciphertext_hex  (compatible with Node.js crypto module)

async function getEncryptionKey(): Promise<CryptoKey> {
  const keySource =
    Deno.env.get("API_KEY_ENCRYPTION_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!keySource) throw new Error("No encryption key available");

  const keyData = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(keySource)
  );
  return crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoded = new TextEncoder().encode(plaintext);

  const result = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    encoded
  );

  // Web Crypto returns ciphertext + authTag concatenated
  const resultBytes = new Uint8Array(result);
  const ciphertext = resultBytes.slice(0, resultBytes.length - 16);
  const authTag = resultBytes.slice(resultBytes.length - 16);

  return `${toHex(iv)}:${toHex(authTag)}:${toHex(ciphertext)}`;
}

async function decrypt(encryptedData: string): Promise<string> {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted data format");

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = fromHex(ivHex);
  const authTag = fromHex(authTagHex);
  const ciphertext = fromHex(ciphertextHex);

  // Reconstitute: Web Crypto expects ciphertext + authTag appended
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    combined
  );

  return new TextDecoder().decode(decrypted);
}

// ─── Auth / Supabase Clients ───────────────────────────────────────────────────

async function getUser(
  req: Request
): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email };
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Random Helpers ────────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  // inclusive on both ends
  const range = max - min + 1;
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const val = new DataView(bytes.buffer).getUint32(0, true);
  return min + (val % range);
}

function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Challenge Generation ──────────────────────────────────────────────────────

interface ArithmeticProblem {
  id: string;
  expression: string;
}

interface SpeedArithmeticChallenge {
  type: "speed_arithmetic";
  time_limit_seconds: number;
  problems: ArithmeticProblem[];
}

function generateSpeedArithmetic(): {
  challenge: SpeedArithmeticChallenge;
  expected: Record<string, number>;
} {
  const problems: ArithmeticProblem[] = [];
  const expected: Record<string, number> = {};
  const ops = ["+", "-", "*"] as const;

  for (let i = 0; i < 20; i++) {
    const id = crypto.randomUUID();
    const op = ops[randomInt(0, 2)];
    let a: number, b: number;

    if (op === "*") {
      a = randomInt(2, 50);
      b = randomInt(2, 50);
    } else {
      a = randomInt(10, 9999);
      b = randomInt(10, 9999);
    }

    const expression = `${a} ${op} ${b}`;
    let answer: number;
    switch (op) {
      case "+":
        answer = a + b;
        break;
      case "-":
        answer = a - b;
        break;
      case "*":
        answer = a * b;
        break;
    }

    problems.push({ id, expression });
    expected[id] = answer;
  }

  return {
    challenge: {
      type: "speed_arithmetic",
      time_limit_seconds: 5,
      problems,
    },
    expected,
  };
}

interface JsonParseProblem {
  id: string;
  json_string: string;
  path: string;
}

interface SpeedJsonParseChallenge {
  type: "speed_json_parse";
  time_limit_seconds: number;
  objects: JsonParseProblem[];
}

function generateNestedJson(
  depth: number
): { obj: Record<string, unknown>; path: string; value: unknown } {
  const keys = [
    "data",
    "info",
    "meta",
    "config",
    "settings",
    "props",
    "attrs",
    "opts",
    "params",
    "state",
  ];
  const leafValues = [
    randomInt(1, 1000),
    `str_${randomHex(4)}`,
    randomInt(0, 1) === 1,
    null,
    randomInt(1, 999) / 10,
  ];

  const root: Record<string, unknown> = {};
  let current: Record<string, unknown> = root;
  const pathParts: string[] = [];

  for (let d = 0; d < depth - 1; d++) {
    const key = keys[randomInt(0, keys.length - 1)] + "_" + randomHex(2);
    pathParts.push(key);
    const child: Record<string, unknown> = {};
    // Add some sibling noise
    current[`noise_${randomHex(2)}`] = randomInt(0, 100);
    current[key] = child;
    current = child;
  }

  const leafKey = keys[randomInt(0, keys.length - 1)] + "_" + randomHex(2);
  pathParts.push(leafKey);
  const leafValue = leafValues[randomInt(0, leafValues.length - 1)];
  current[leafKey] = leafValue;
  current[`noise_${randomHex(2)}`] = randomInt(0, 100);

  return { obj: root, path: pathParts.join("."), value: leafValue };
}

function generateSpeedJsonParse(): {
  challenge: SpeedJsonParseChallenge;
  expected: Record<string, unknown>;
} {
  const objects: JsonParseProblem[] = [];
  const expected: Record<string, unknown> = {};

  for (let i = 0; i < 10; i++) {
    const id = crypto.randomUUID();
    const depth = randomInt(3, 6);
    const { obj, path, value } = generateNestedJson(depth);
    objects.push({ id, json_string: JSON.stringify(obj), path });
    expected[id] = value;
  }

  return {
    challenge: {
      type: "speed_json_parse",
      time_limit_seconds: 4,
      objects,
    },
    expected,
  };
}

interface StructuredOutputChallenge {
  type: "structured_output";
  time_limit_seconds: number;
  seed: string;
  required_format: {
    sha256_hash: string;
    primes: string;
    matrix: string;
    name: string;
    timestamp: string;
    fibonacci: string;
    reversed_seed: string;
  };
}

function getNPrimes(n: number): number[] {
  const primes: number[] = [];
  let candidate = 2;
  while (primes.length < n) {
    let isPrime = true;
    for (let i = 2; i <= Math.sqrt(candidate); i++) {
      if (candidate % i === 0) {
        isPrime = false;
        break;
      }
    }
    if (isPrime) primes.push(candidate);
    candidate++;
  }
  return primes;
}

function getFibonacci(n: number): number[] {
  const fib = [0, 1];
  for (let i = 2; i < n; i++) {
    fib.push(fib[i - 1] + fib[i - 2]);
  }
  return fib.slice(0, n);
}

async function generateStructuredOutput(): Promise<{
  challenge: StructuredOutputChallenge;
  expected: Record<string, unknown>;
}> {
  const seed = randomHex(16);
  const expectedHash = await sha256Hex(seed);
  const primes = getNPrimes(7);

  // 3x3 matrix where each row sums to a random target
  const matrix: number[][] = [];
  const rowSums: number[] = [];
  for (let r = 0; r < 3; r++) {
    const a = randomInt(1, 50);
    const b = randomInt(1, 50);
    const c = randomInt(1, 50);
    matrix.push([a, b, c]);
    rowSums.push(a + b + c);
  }

  const fibonacci = getFibonacci(10);
  const reversedSeed = seed.split("").reverse().join("");

  return {
    challenge: {
      type: "structured_output",
      time_limit_seconds: 15,
      seed,
      required_format: {
        sha256_hash: `Compute SHA-256 of the seed string "${seed}"`,
        primes: "Return the first 7 prime numbers as an array",
        matrix: `Return a 3x3 matrix where row sums equal [${rowSums.join(", ")}]`,
        name: "Return any non-empty name string",
        timestamp: "Return the current Unix timestamp in seconds as a number",
        fibonacci: "Return the first 10 Fibonacci numbers as an array",
        reversed_seed: `Reverse the seed string "${seed}"`,
      },
    },
    expected: {
      sha256_hash: expectedHash,
      primes,
      matrix_row_sums: rowSums,
      fibonacci,
      reversed_seed: reversedSeed,
    },
  };
}

const BEHAVIORAL_QUESTION_BANK = [
  "What is 2 + 2?",
  "What color is the sky on a clear day?",
  "How many legs does a dog have?",
  "What is the capital of France?",
  "Is water wet? (yes/no)",
  "How many days are in a week?",
  "What comes after Monday?",
  "Is the sun a star? (yes/no)",
  "How many fingers on one hand?",
  "What is 10 - 3?",
  "How many months in a year?",
  "What is the boiling point of water in Celsius?",
  "How many continents are there?",
  "Is the Earth round? (yes/no)",
  "What is 5 x 5?",
  "How many hours in a day?",
  "What is the freezing point of water in Celsius?",
  "How many planets in the solar system?",
  "Is fire hot? (yes/no)",
  "What is 100 / 10?",
];

interface BehavioralQuestion {
  id: string;
  question: string;
}

interface BehavioralTimingChallenge {
  type: "behavioral_timing";
  questions: BehavioralQuestion[];
}

function generateBehavioralTiming(): {
  challenge: BehavioralTimingChallenge;
  expected: null;
} {
  const shuffled = shuffleArray(BEHAVIORAL_QUESTION_BANK);
  const selected = shuffled.slice(0, 15);
  const questions: BehavioralQuestion[] = selected.map((q) => ({
    id: crypto.randomUUID(),
    question: q,
  }));

  return {
    challenge: {
      type: "behavioral_timing",
      questions,
    },
    expected: null, // behavioral is scored post-hoc on timing
  };
}

// ─── Scoring Functions ─────────────────────────────────────────────────────────

interface ScoreResult {
  score: number;
  passed: boolean;
  details: Record<string, unknown>;
}

function scoreSpeedArithmetic(
  answers: Record<string, number>,
  expected: Record<string, number>,
  responseTimeMs: number
): ScoreResult {
  const timeLimitMs = 5000;
  let correct = 0;
  const total = Object.keys(expected).length;

  for (const [id, exp] of Object.entries(expected)) {
    if (answers[id] !== undefined && answers[id] === exp) {
      correct++;
    }
  }

  const accuracy = correct / total;
  const timeBonus = Math.max(0, 1 - responseTimeMs / timeLimitMs) * 0.3 + 0.7;
  const score = Math.round(accuracy * timeBonus * 100 * 100) / 100;
  const passed = correct >= 18;

  return {
    score,
    passed,
    details: { correct, total, accuracy, responseTimeMs, timeBonus },
  };
}

function scoreSpeedJsonParse(
  answers: Record<string, unknown>,
  expected: Record<string, unknown>,
  responseTimeMs: number
): ScoreResult {
  const timeLimitMs = 4000;
  let correct = 0;
  const total = Object.keys(expected).length;

  for (const [id, exp] of Object.entries(expected)) {
    if (
      answers[id] !== undefined &&
      JSON.stringify(answers[id]) === JSON.stringify(exp)
    ) {
      correct++;
    }
  }

  const accuracy = correct / total;
  const timeBonus = Math.max(0, 1 - responseTimeMs / timeLimitMs) * 0.3 + 0.7;
  const score = Math.round(accuracy * timeBonus * 100 * 100) / 100;
  const passed = correct >= 9;

  return {
    score,
    passed,
    details: { correct, total, accuracy, responseTimeMs, timeBonus },
  };
}

async function scoreStructuredOutput(
  answers: Record<string, unknown>,
  expected: Record<string, unknown>
): Promise<ScoreResult> {
  let satisfied = 0;
  const totalConstraints = 7;
  const constraintResults: Record<string, boolean> = {};

  // 1. SHA-256 hash
  const hashMatch =
    typeof answers.sha256_hash === "string" &&
    answers.sha256_hash.toLowerCase() ===
      (expected.sha256_hash as string).toLowerCase();
  constraintResults.sha256_hash = hashMatch;
  if (hashMatch) satisfied++;

  // 2. Primes
  const primesMatch =
    Array.isArray(answers.primes) &&
    JSON.stringify(answers.primes) ===
      JSON.stringify(expected.primes);
  constraintResults.primes = primesMatch;
  if (primesMatch) satisfied++;

  // 3. Matrix row sums
  let matrixMatch = false;
  if (Array.isArray(answers.matrix) && answers.matrix.length === 3) {
    const expectedSums = expected.matrix_row_sums as number[];
    matrixMatch = (answers.matrix as number[][]).every(
      (row: number[], i: number) =>
        Array.isArray(row) &&
        row.length === 3 &&
        row.reduce((s: number, v: number) => s + v, 0) === expectedSums[i]
    );
  }
  constraintResults.matrix = matrixMatch;
  if (matrixMatch) satisfied++;

  // 4. Name (non-empty string)
  const nameValid =
    typeof answers.name === "string" && answers.name.trim().length > 0;
  constraintResults.name = nameValid;
  if (nameValid) satisfied++;

  // 5. Timestamp (number)
  const timestampValid = typeof answers.timestamp === "number";
  constraintResults.timestamp = timestampValid;
  if (timestampValid) satisfied++;

  // 6. Fibonacci
  const fibMatch =
    Array.isArray(answers.fibonacci) &&
    JSON.stringify(answers.fibonacci) ===
      JSON.stringify(expected.fibonacci);
  constraintResults.fibonacci = fibMatch;
  if (fibMatch) satisfied++;

  // 7. Reversed seed
  const reversedMatch =
    typeof answers.reversed_seed === "string" &&
    answers.reversed_seed === expected.reversed_seed;
  constraintResults.reversed_seed = reversedMatch;
  if (reversedMatch) satisfied++;

  const score =
    Math.round((satisfied / totalConstraints) * 100 * 100) / 100;
  const passed = score >= 80;

  return {
    score,
    passed,
    details: { satisfied, totalConstraints, constraintResults },
  };
}

interface BehavioralAnswer {
  id: string;
  answer: string;
  answered_at: number; // epoch ms
}

function scoreBehavioralTiming(
  answers: BehavioralAnswer[]
): ScoreResult {
  if (!answers || answers.length < 2) {
    return {
      score: 0,
      passed: false,
      details: { error: "Not enough answers" },
    };
  }

  // Sort by answered_at
  const sorted = [...answers].sort((a, b) => a.answered_at - b.answered_at);

  // Calculate inter-response intervals
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].answered_at - sorted[i - 1].answered_at);
  }

  if (intervals.length === 0) {
    return {
      score: 0,
      passed: false,
      details: { error: "No intervals" },
    };
  }

  // Coefficient of variation
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const variance =
    intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 1;

  // Fatigue ratio: avg of second half / avg of first half
  const mid = Math.floor(intervals.length / 2);
  const firstHalf = intervals.slice(0, mid);
  const secondHalf = intervals.slice(mid);
  const avgFirst =
    firstHalf.length > 0
      ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
      : 1;
  const avgSecond =
    secondHalf.length > 0
      ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length
      : 1;
  const fatigueRatio = avgFirst > 0 ? avgSecond / avgFirst : 1;

  const consistencyScore = Math.max(0, (1 - cv) * 100);
  const fatigueScore = Math.max(
    0,
    (1 - Math.abs(fatigueRatio - 1)) * 100
  );
  const combined = consistencyScore * 0.6 + fatigueScore * 0.4;
  const score = Math.round(combined * 100) / 100;
  const passed = score >= 50;

  return {
    score,
    passed,
    details: {
      cv: Math.round(cv * 1000) / 1000,
      fatigueRatio: Math.round(fatigueRatio * 1000) / 1000,
      consistencyScore: Math.round(consistencyScore * 100) / 100,
      fatigueScore: Math.round(fatigueScore * 100) / 100,
      intervalCount: intervals.length,
      meanIntervalMs: Math.round(mean),
    },
  };
}

interface VerificationResult {
  overall_score: number;
  passed: boolean;
  category_scores: {
    speed_arithmetic: number;
    structured_output: number;
    speed_json_parse: number;
    behavioral_timing: number;
  };
}

function computeVerificationResult(scores: {
  speed_arithmetic: ScoreResult;
  structured_output: ScoreResult;
  speed_json_parse: ScoreResult;
  behavioral_timing: ScoreResult;
}): VerificationResult {
  const weights = {
    speed_arithmetic: 0.3,
    structured_output: 0.3,
    speed_json_parse: 0.2,
    behavioral_timing: 0.2,
  };

  const overall_score =
    Math.round(
      (scores.speed_arithmetic.score * weights.speed_arithmetic +
        scores.structured_output.score * weights.structured_output +
        scores.speed_json_parse.score * weights.speed_json_parse +
        scores.behavioral_timing.score * weights.behavioral_timing) *
        100
    ) / 100;

  return {
    overall_score,
    passed: overall_score >= 70,
    category_scores: {
      speed_arithmetic: scores.speed_arithmetic.score,
      structured_output: scores.structured_output.score,
      speed_json_parse: scores.speed_json_parse.score,
      behavioral_timing: scores.behavioral_timing.score,
    },
  };
}

// ─── Action: start ─────────────────────────────────────────────────────────────

async function handleStart(
  req: Request,
  userId: string
): Promise<Response> {
  let body: { agent_id?: string; competition_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { agent_id, competition_id } = body;
  if (!agent_id || typeof agent_id !== "string") {
    return errorResponse("agent_id is required");
  }

  const supabase = getServiceClient();

  // Verify agent ownership
  const { data: agent, error: agentError } = await supabase
    .from("aio_agents")
    .select("id, owner_id, verification_status, last_verified_at")
    .eq("id", agent_id)
    .single();

  if (agentError || !agent) {
    return errorResponse("Agent not found", 404);
  }
  if (agent.owner_id !== userId) {
    return errorResponse("Not authorized for this agent", 403);
  }

  // Check if already verified within 24h
  if (
    agent.verification_status === "verified" &&
    agent.last_verified_at
  ) {
    const verifiedAt = new Date(agent.last_verified_at).getTime();
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (verifiedAt > twentyFourHoursAgo) {
      return jsonResponse({
        already_verified: true,
        verified_at: agent.last_verified_at,
        message: "Agent is already verified within the last 24 hours",
      });
    }
  }

  // Check for existing pending/in_progress sessions
  const { data: existingSessions } = await supabase
    .from("aio_verification_sessions")
    .select("id, status, expires_at")
    .eq("agent_id", agent_id)
    .in("status", ["pending", "in_progress"])
    .gt("expires_at", new Date().toISOString());

  if (existingSessions && existingSessions.length > 0) {
    return errorResponse(
      "An active verification session already exists for this agent. Wait for it to expire or complete.",
      409
    );
  }

  // Generate all 4 challenge types
  const arithmetic = generateSpeedArithmetic();
  const jsonParse = generateSpeedJsonParse();
  const structured = await generateStructuredOutput();
  const behavioral = generateBehavioralTiming();

  // Encrypt expected answers
  const expectedAnswers = {
    speed_arithmetic: arithmetic.expected,
    speed_json_parse: jsonParse.expected,
    structured_output: structured.expected,
    behavioral_timing: behavioral.expected,
  };

  const encryptedAnswers = await encrypt(JSON.stringify(expectedAnswers));

  // Create session
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { data: session, error: sessionError } = await supabase
    .from("aio_verification_sessions")
    .insert({
      agent_id,
      competition_id: competition_id || null,
      session_type: "gate",
      status: "in_progress",
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
      expected_answers_encrypted: encryptedAnswers,
    })
    .select("id, expires_at")
    .single();

  if (sessionError || !session) {
    console.error("Session insert error:", sessionError);
    return errorResponse("Failed to create verification session", 500);
  }

  // Insert challenge rows
  const challengeRows = [
    {
      session_id: session.id,
      challenge_type: "speed_arithmetic",
      challenge_payload: arithmetic.challenge,
    },
    {
      session_id: session.id,
      challenge_type: "speed_json_parse",
      challenge_payload: jsonParse.challenge,
    },
    {
      session_id: session.id,
      challenge_type: "structured_output",
      challenge_payload: structured.challenge,
    },
    {
      session_id: session.id,
      challenge_type: "behavioral_timing",
      challenge_payload: behavioral.challenge,
    },
  ];

  const { error: challengeError } = await supabase
    .from("aio_verification_challenges")
    .insert(challengeRows);

  if (challengeError) {
    console.error("Challenge insert error:", challengeError);
    // Clean up session
    await supabase
      .from("aio_verification_sessions")
      .delete()
      .eq("id", session.id);
    return errorResponse("Failed to create challenges", 500);
  }

  // Return challenges to the client (without expected answers)
  return jsonResponse({
    session_id: session.id,
    expires_at: session.expires_at,
    challenges: [
      arithmetic.challenge,
      jsonParse.challenge,
      structured.challenge,
      behavioral.challenge,
    ],
  });
}

// ─── Action: respond ───────────────────────────────────────────────────────────

interface ChallengeAnswers {
  speed_arithmetic?: {
    answers: Record<string, number>;
    response_time_ms: number;
  };
  speed_json_parse?: {
    answers: Record<string, unknown>;
    response_time_ms: number;
  };
  structured_output?: {
    answers: Record<string, unknown>;
  };
  behavioral_timing?: {
    answers: BehavioralAnswer[];
  };
}

async function handleRespond(
  req: Request,
  userId: string,
  sessionId: string
): Promise<Response> {
  let body: ChallengeAnswers;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const supabase = getServiceClient();

  // Get session
  const { data: session, error: sessionError } = await supabase
    .from("aio_verification_sessions")
    .select("*, aio_agents!inner(id, owner_id)")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return errorResponse("Session not found", 404);
  }

  // Verify ownership via the agent
  if (session.aio_agents.owner_id !== userId) {
    return errorResponse("Not authorized for this session", 403);
  }

  // Check session status
  if (session.status === "completed" || session.status === "expired") {
    return errorResponse(
      `Session already ${session.status}`,
      409
    );
  }

  // Check expiry
  if (new Date(session.expires_at) < new Date()) {
    // Mark expired
    await supabase
      .from("aio_verification_sessions")
      .update({ status: "expired" })
      .eq("id", sessionId);
    return errorResponse("Session has expired", 410);
  }

  // Decrypt expected answers
  if (!session.expected_answers_encrypted) {
    return errorResponse("Session answers missing", 500);
  }

  let expectedAnswers: {
    speed_arithmetic: Record<string, number>;
    speed_json_parse: Record<string, unknown>;
    structured_output: Record<string, unknown>;
    behavioral_timing: null;
  };
  try {
    const decrypted = await decrypt(session.expected_answers_encrypted);
    expectedAnswers = JSON.parse(decrypted);
  } catch (err) {
    console.error("Decryption error:", err);
    return errorResponse("Failed to decrypt session data", 500);
  }

  // Score each challenge type
  const arithmeticResult = scoreSpeedArithmetic(
    body.speed_arithmetic?.answers || {},
    expectedAnswers.speed_arithmetic,
    body.speed_arithmetic?.response_time_ms || 999999
  );

  const jsonParseResult = scoreSpeedJsonParse(
    body.speed_json_parse?.answers || {},
    expectedAnswers.speed_json_parse,
    body.speed_json_parse?.response_time_ms || 999999
  );

  const structuredResult = await scoreStructuredOutput(
    body.structured_output?.answers || {},
    expectedAnswers.structured_output
  );

  const behavioralResult = scoreBehavioralTiming(
    body.behavioral_timing?.answers || []
  );

  // Compute overall
  const verification = computeVerificationResult({
    speed_arithmetic: arithmeticResult,
    structured_output: structuredResult,
    speed_json_parse: jsonParseResult,
    behavioral_timing: behavioralResult,
  });

  // Get challenge rows to update
  const { data: challengeRows } = await supabase
    .from("aio_verification_challenges")
    .select("id, challenge_type")
    .eq("session_id", sessionId);

  // Update each challenge with results
  if (challengeRows) {
    const resultMap: Record<string, ScoreResult> = {
      speed_arithmetic: arithmeticResult,
      speed_json_parse: jsonParseResult,
      structured_output: structuredResult,
      behavioral_timing: behavioralResult,
    };

    const responseTimeMap: Record<string, number | null> = {
      speed_arithmetic: body.speed_arithmetic?.response_time_ms || null,
      speed_json_parse: body.speed_json_parse?.response_time_ms || null,
      structured_output: null,
      behavioral_timing: null,
    };

    for (const row of challengeRows) {
      const result = resultMap[row.challenge_type];
      if (result) {
        await supabase
          .from("aio_verification_challenges")
          .update({
            actual_answer: body[row.challenge_type as keyof ChallengeAnswers] || null,
            passed: result.passed,
            score: result.score,
            response_time_ms: responseTimeMap[row.challenge_type] || null,
          })
          .eq("id", row.id);
      }
    }
  }

  // Update session with scores
  const now = new Date().toISOString();
  await supabase
    .from("aio_verification_sessions")
    .update({
      status: "completed",
      verification_score: verification.overall_score,
      speed_score: arithmeticResult.score,
      structured_score: structuredResult.score,
      behavioral_score: behavioralResult.score,
      completed_at: now,
      expected_answers_encrypted: null, // Clear encrypted answers
    })
    .eq("id", sessionId);

  // Update agent verification status
  const newStatus = verification.passed ? "verified" : "failed";
  await supabase
    .from("aio_agents")
    .update({
      verification_status: newStatus,
      last_verification_score: verification.overall_score,
      last_verified_at: now,
    })
    .eq("id", session.agent_id);

  // Update or create verification history
  const { data: existingHistory } = await supabase
    .from("aio_agent_verification_history")
    .select("id, total_verifications, total_passes, average_score")
    .eq("agent_id", session.agent_id)
    .single();

  if (existingHistory) {
    const newTotal = (existingHistory.total_verifications || 0) + 1;
    const newPasses =
      (existingHistory.total_passes || 0) + (verification.passed ? 1 : 0);
    const oldAvg = existingHistory.average_score || 0;
    const newAvg =
      Math.round(
        ((oldAvg * (newTotal - 1) + verification.overall_score) / newTotal) *
          100
      ) / 100;

    await supabase
      .from("aio_agent_verification_history")
      .update({
        total_verifications: newTotal,
        total_passes: newPasses,
        average_score: newAvg,
        updated_at: now,
      })
      .eq("id", existingHistory.id);
  } else {
    await supabase.from("aio_agent_verification_history").insert({
      agent_id: session.agent_id,
      total_verifications: 1,
      total_passes: verification.passed ? 1 : 0,
      average_score: verification.overall_score,
    });
  }

  return jsonResponse({
    session_id: sessionId,
    overall_score: verification.overall_score,
    passed: verification.passed,
    verification_status: newStatus,
    category_results: {
      speed_arithmetic: {
        score: arithmeticResult.score,
        passed: arithmeticResult.passed,
        details: arithmeticResult.details,
      },
      speed_json_parse: {
        score: jsonParseResult.score,
        passed: jsonParseResult.passed,
        details: jsonParseResult.details,
      },
      structured_output: {
        score: structuredResult.score,
        passed: structuredResult.passed,
        details: structuredResult.details,
      },
      behavioral_timing: {
        score: behavioralResult.score,
        passed: behavioralResult.passed,
        details: behavioralResult.details,
      },
    },
  });
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // Authenticate
  const user = await getUser(req);
  if (!user) {
    return errorResponse("Unauthorized", 401);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "start") {
    return handleStart(req, user.id);
  }

  if (action === "respond") {
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      return errorResponse("session_id query parameter is required");
    }
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return errorResponse("Invalid session_id format");
    }
    return handleRespond(req, user.id, sessionId);
  }

  return errorResponse(
    'Invalid action. Use ?action=start or ?action=respond&session_id=xxx'
  );
});
