/**
 * Gauntlet Task Definitions — 20 real-world tasks for AI agents
 *
 * 3 categories:
 * - web-research: Read-only web tasks (8 tasks) — Tier 1, zero risk
 * - github-workflow: Test-account GitHub tasks (8 tasks) — Tier 2, sandbox isolated
 * - wildcard: Misc research/reasoning (4 tasks)
 *
 * Scoring: quality_pct × time_multiplier
 *   - time_multiplier: 2.0 at ≤60s, linear decay to 1.0 at 300s, 0.5 at 600s
 *   - max score per task: 200 pts (quality=1.0 at 60s)
 *   - max total: 1000 pts (5 tasks)
 */

export type TaskCategory = 'web-research' | 'github-workflow' | 'wildcard';

export interface GauntletTask {
  id: string;
  category: TaskCategory;
  title: string;
  prompt: string;
  timeLimitMs: number;
  verifierType: 'llm-judge' | 'github-api' | 'api-state';
  verifierConfig: Record<string, unknown>;
  /** Expected answer / success criteria for LLM judge */
  criteria: string;
}

const WEB_RESEARCH_TASKS: GauntletTask[] = [
  {
    id: 'web-001',
    category: 'web-research',
    title: 'OpenAI CEO',
    prompt: 'Find the current CEO of OpenAI and their year of appointment. Return: name, year.',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: "Answer must include 'Sam Altman' and '2023'",
  },
  {
    id: 'web-002',
    category: 'web-research',
    title: 'Node.js Latest Stable Version',
    prompt: 'What is the latest stable release version of Node.js? Go to nodejs.org and find it.',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: "Answer must contain a valid Node.js LTS version number like '20.x.x' or '22.x.x'",
  },
  {
    id: 'web-003',
    category: 'web-research',
    title: 'GitHub Trending Repos',
    prompt: 'Find the top 3 trending repositories on GitHub today (github.com/trending). Return names.',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: "Answer must contain 3 GitHub repository names in 'owner/repo' format",
  },
  {
    id: 'web-004',
    category: 'web-research',
    title: 'Bitcoin Price',
    prompt: "What is today's price of Bitcoin in USD? Use a public crypto data site.",
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: 'Answer must contain a dollar amount for Bitcoin (format: $XX,XXX or similar)',
  },
  {
    id: 'web-005',
    category: 'web-research',
    title: 'Python Latest Version',
    prompt: 'Find the current Python version (latest stable). Go to python.org.',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: "Answer must contain a Python version number like '3.x.x'",
  },
  {
    id: 'web-006',
    category: 'web-research',
    title: 'Stack Overflow Top Language 2024',
    prompt: 'What is the Stack Overflow Developer Survey top programming language for 2024?',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: 'Answer must mention a programming language and the 2024 Stack Overflow survey',
  },
  {
    id: 'web-007',
    category: 'web-research',
    title: 'Tokyo Population',
    prompt: 'Find the current population of Tokyo according to Wikipedia.',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: 'Answer must contain a population figure for Tokyo (in millions or full number)',
  },
  {
    id: 'web-008',
    category: 'web-research',
    title: 'React Latest Version',
    prompt: 'What is the latest version of React? Check npmjs.com.',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: "Answer must contain a React version number like '18.x.x' or '19.x.x'",
  },
];

const GITHUB_WORKFLOW_TASKS: GauntletTask[] = [
  {
    id: 'gh-001',
    category: 'github-workflow',
    title: 'Create Test Repo',
    prompt:
      "Create a new public repository named 'gauntlet-test-{runId}' in your account. Return the repo URL.",
    timeLimitMs: 300_000,
    verifierType: 'github-api',
    verifierConfig: { checkRepoExists: true, repoNamePattern: 'gauntlet-test-' },
    criteria: "A public GitHub repository matching the pattern 'gauntlet-test-{runId}' must exist",
  },
  {
    id: 'gh-002',
    category: 'github-workflow',
    title: 'Fork Fixture Repo',
    prompt:
      "Fork the repository 'stefanogebara/gauntlet-fixture-hello' to your account. Return the fork URL.",
    timeLimitMs: 300_000,
    verifierType: 'github-api',
    verifierConfig: { checkForkExists: true, upstreamRepo: 'stefanogebara/gauntlet-fixture-hello' },
    criteria:
      "A fork of stefanogebara/gauntlet-fixture-hello must exist in the agent's account",
  },
  {
    id: 'gh-003',
    category: 'github-workflow',
    title: 'Create README',
    prompt:
      "In repo 'gauntlet-test-{runId}', create a file named README.md with the content 'Hello from {agentName}'. Commit it.",
    timeLimitMs: 300_000,
    verifierType: 'github-api',
    verifierConfig: {
      checkFileExists: true,
      filePath: 'README.md',
      repo: 'gauntlet-test-{runId}',
    },
    criteria: "README.md must exist in the repo with content mentioning 'Hello from'",
  },
  {
    id: 'gh-004',
    category: 'github-workflow',
    title: 'Create Bug Issue',
    prompt:
      "Create a GitHub issue in 'stefanogebara/gauntlet-fixture-hello' titled 'Bug: missing error handling'. Add the label 'bug' if possible.",
    timeLimitMs: 300_000,
    verifierType: 'github-api',
    verifierConfig: {
      checkIssueExists: true,
      repo: 'stefanogebara/gauntlet-fixture-hello',
      titlePattern: 'missing error handling',
    },
    criteria:
      "An issue with 'missing error handling' in the title must exist in the repo",
  },
  {
    id: 'gh-005',
    category: 'github-workflow',
    title: 'Star Fixture Repo',
    prompt: "Star the repository 'stefanogebara/gauntlet-fixture-hello'.",
    timeLimitMs: 300_000,
    verifierType: 'github-api',
    verifierConfig: { checkStarred: true, repo: 'stefanogebara/gauntlet-fixture-hello' },
    criteria:
      "The repository 'stefanogebara/gauntlet-fixture-hello' must be starred by the agent's account",
  },
  {
    id: 'gh-006',
    category: 'github-workflow',
    title: 'Comment on Issue',
    prompt:
      "Find any open issue in 'stefanogebara/gauntlet-fixture-hello' and post a comment saying 'Working on a fix'.",
    timeLimitMs: 300_000,
    verifierType: 'github-api',
    verifierConfig: {
      checkComment: true,
      repo: 'stefanogebara/gauntlet-fixture-hello',
      commentPattern: 'Working on a fix',
    },
    criteria: "A comment containing 'Working on a fix' must exist on any open issue",
  },
  {
    id: 'gh-007',
    category: 'github-workflow',
    title: 'Create Feature Branch',
    prompt:
      "In 'gauntlet-test-{runId}', create a branch named 'feature/improve-readme' and push an empty commit.",
    timeLimitMs: 300_000,
    verifierType: 'github-api',
    verifierConfig: {
      checkBranchExists: true,
      branchName: 'feature/improve-readme',
      repo: 'gauntlet-test-{runId}',
    },
    criteria: "Branch 'feature/improve-readme' must exist in the repo",
  },
  {
    id: 'gh-008',
    category: 'github-workflow',
    title: 'Summarize Fixture README',
    prompt:
      "Read the README of 'stefanogebara/gauntlet-fixture-hello' and summarize what the project does in one sentence.",
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: 'Answer must be a coherent one-sentence summary of a software project',
  },
];

const WILDCARD_TASKS: GauntletTask[] = [
  {
    id: 'wild-001',
    category: 'wildcard',
    title: 'AI Poem',
    prompt:
      'You have 5 minutes. Write a short poem (4–8 lines) about artificial intelligence. Return the poem.',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: 'Response must be a poem about AI with 4-8 lines',
  },
  {
    id: 'wild-002',
    category: 'wildcard',
    title: 'Explain Backpropagation',
    prompt:
      "Find the definition of 'backpropagation' from a reputable source and explain it in 2 sentences.",
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: 'Answer must explain backpropagation accurately in approximately 2 sentences',
  },
  {
    id: 'wild-003',
    category: 'wildcard',
    title: "Asimov's 3 Laws",
    prompt: "What are the 3 laws of robotics according to Isaac Asimov? List them.",
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria: 'Answer must list all 3 Asimov laws of robotics correctly',
  },
  {
    id: 'wild-004',
    category: 'wildcard',
    title: 'AI Olympics Competition Types',
    prompt:
      'Navigate to https://ai-olympics.vercel.app and describe what competition types are available.',
    timeLimitMs: 300_000,
    verifierType: 'llm-judge',
    verifierConfig: {},
    criteria:
      'Answer must mention at least 2 of: browser-tasks, prediction-markets, trading, games, creative, coding',
  },
];

const ALL_TASKS: GauntletTask[] = [
  ...WEB_RESEARCH_TASKS,
  ...GITHUB_WORKFLOW_TASKS,
  ...WILDCARD_TASKS,
];

export function getAllGauntletTasks(): GauntletTask[] {
  return ALL_TASKS;
}

export function getTaskById(id: string): GauntletTask | undefined {
  return ALL_TASKS.find((task) => task.id === id);
}

/**
 * Deterministic weekly task picker.
 * Picks 2 web-research + 2 github-workflow + 1 wildcard = 5 tasks total.
 */
export function pickWeeklyTasks(weekNumber: number, year: number): GauntletTask[] {
  const seed = weekNumber * 1000 + year;

  const seededRandom = (n: number): number =>
    ((Math.sin(seed + n) * 10000) % 1 + 1) / 2;

  const shuffleWithSeed = <T>(arr: T[], offset: number): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom(offset + i) * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j] as T;
      copy[j] = tmp as T;
    }
    return copy;
  };

  const webShuffled = shuffleWithSeed(WEB_RESEARCH_TASKS, 0);
  const ghShuffled = shuffleWithSeed(GITHUB_WORKFLOW_TASKS, 100);
  const wildShuffled = shuffleWithSeed(WILDCARD_TASKS, 200);

  return [
    webShuffled[0] as GauntletTask,
    webShuffled[1] as GauntletTask,
    ghShuffled[0] as GauntletTask,
    ghShuffled[1] as GauntletTask,
    wildShuffled[0] as GauntletTask,
  ];
}

/**
 * Computes the time multiplier for scoring.
 *
 * - At <= 20% of timeLimitMs: multiplier = 2.0
 * - Linear decay from 2.0 at 20% to 1.0 at 100%
 * - Beyond timeLimitMs to 2x timeLimit: decay from 1.0 to 0.5
 * - Beyond 2x timeLimit: 0.0
 * - Clamped to [0, 2.0]
 */
export function computeTimeMultiplier(elapsedMs: number, timeLimitMs: number): number {
  const earlyThreshold = timeLimitMs * 0.2;
  const lateThreshold = timeLimitMs * 2;

  if (elapsedMs <= earlyThreshold) {
    return 2.0;
  }

  if (elapsedMs <= timeLimitMs) {
    // Linear decay from 2.0 at earlyThreshold to 1.0 at timeLimitMs
    const progress = (elapsedMs - earlyThreshold) / (timeLimitMs - earlyThreshold);
    return 2.0 - progress * 1.0;
  }

  if (elapsedMs <= lateThreshold) {
    // Linear decay from 1.0 at timeLimitMs to 0.5 at 2x timeLimitMs
    const progress = (elapsedMs - timeLimitMs) / (lateThreshold - timeLimitMs);
    return 1.0 - progress * 0.5;
  }

  return 0.0;
}

/**
 * Computes the final task score.
 * Max = 200 pts (quality=1.0, multiplier=2.0)
 */
export function computeTaskScore(
  qualityPct: number,
  elapsedMs: number,
  timeLimitMs: number,
): number {
  return Math.round(qualityPct * computeTimeMultiplier(elapsedMs, timeLimitMs) * 100);
}
