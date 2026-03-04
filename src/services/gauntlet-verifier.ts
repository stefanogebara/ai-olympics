import Anthropic from '@anthropic-ai/sdk';
import { config } from '../shared/config.js';
import type { GauntletTask } from './gauntlet-tasks.js';

export interface VerifierResult {
  score: number;      // 0.0 to 1.0
  reasoning: string;
  passed: boolean;    // score >= 0.5
}

/**
 * Main entry point — dispatches to the correct verifier based on task.verifierType
 */
export async function runVerifier(
  task: GauntletTask,
  agentResult: string,
  context?: { runId?: string; githubToken?: string }
): Promise<VerifierResult> {
  switch (task.verifierType) {
    case 'llm-judge':
      return runLlmJudge(task, agentResult);

    case 'github-api': {
      const token = context?.githubToken;
      if (!token) {
        return { score: 0, reasoning: 'No GitHub token provided', passed: false };
      }
      return runGitHubVerifier(task, agentResult, token);
    }

    case 'api-state':
      return runApiStateVerifier(task, agentResult);

    default:
      return { score: 0, reasoning: `Unknown verifier type: ${(task as GauntletTask).verifierType}`, passed: false };
  }
}

/**
 * LLM judge: uses Claude Haiku to score the agent's result against criteria
 */
async function runLlmJudge(task: GauntletTask, agentResult: string): Promise<VerifierResult> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: 'You are a strict but fair judge evaluating AI agent task completions. Score the agent\'s response 0.0 to 1.0. Return ONLY valid JSON: {"score": 0.0-1.0, "reasoning": "explanation"}',
      messages: [
        {
          role: 'user',
          content: `Task: ${task.title}\nCriteria: ${task.criteria}\n\nAgent response:\n${agentResult}\n\nScore the response.`,
        },
      ],
    });

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    // Strip markdown code fences if the LLM wrapped the JSON
    const text = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    try {
      const parsed = JSON.parse(text) as { score: unknown; reasoning: unknown };
      const rawScore = typeof parsed.score === 'number' ? parsed.score : 0;
      const score = Math.max(0.0, Math.min(1.0, rawScore));
      const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : String(parsed.reasoning ?? '');
      return { score, reasoning, passed: score >= 0.5 };
    } catch {
      return { score: 0, reasoning: 'Failed to parse judge response', passed: false };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { score: 0, reasoning: `Verification failed: ${message}`, passed: false };
  }
}

/**
 * GitHub API verifier: checks actual GitHub state
 */
async function runGitHubVerifier(
  task: GauntletTask,
  agentResult: string,
  githubToken: string
): Promise<VerifierResult> {
  const cfg = task.verifierConfig;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github.v3+json',
  };

  const success: VerifierResult = { score: 1.0, reasoning: 'GitHub API confirmed action completed', passed: true };
  const failure = (check: string, status: number): VerifierResult => ({
    score: 0.0,
    reasoning: `GitHub check failed: ${check} - ${status}`,
    passed: false,
  });

  // Helper to extract owner/repo from a GitHub URL in the agent result
  const extractGitHubOwnerRepo = (): { owner: string; repo: string } | null => {
    const match = agentResult.match(/github\.com\/([^/]+)\/([^/\s]+)/);
    if (!match) return null;
    return { owner: match[1] as string, repo: (match[2] as string).replace(/\.git$/, '') };
  };

  if (cfg['checkRepoExists']) {
    const extracted = extractGitHubOwnerRepo();
    if (!extracted) {
      return { score: 0.0, reasoning: 'GitHub check failed: checkRepoExists - no GitHub URL found in result', passed: false };
    }
    const res = await fetch(`https://api.github.com/repos/${extracted.owner}/${extracted.repo}`, { headers });
    return res.ok ? success : failure('checkRepoExists', res.status);
  }

  if (cfg['checkForkExists']) {
    const extracted = extractGitHubOwnerRepo();
    if (!extracted) {
      return { score: 0.0, reasoning: 'GitHub check failed: checkForkExists - no GitHub URL found in result', passed: false };
    }
    const res = await fetch(`https://api.github.com/repos/${extracted.owner}/${extracted.repo}`, { headers });
    if (!res.ok) return failure('checkForkExists', res.status);
    const data = await res.json() as { fork?: boolean };
    return data.fork === true ? success : failure('checkForkExists', 422);
  }

  if (cfg['checkFileExists']) {
    const repo = String(cfg['repo'] ?? '');
    const filePath = String(cfg['filePath'] ?? '');
    const [owner, repoName] = repo.split('/');
    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`, { headers });
    return res.ok ? success : failure('checkFileExists', res.status);
  }

  if (cfg['checkIssueExists']) {
    const repo = String(cfg['repo'] ?? '');
    const titlePattern = String(cfg['titlePattern'] ?? '');
    const [owner, repoName] = repo.split('/');
    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues?state=open`, { headers });
    if (!res.ok) return failure('checkIssueExists', res.status);
    const issues = await res.json() as { title: string }[];
    const found = issues.some((issue) => issue.title.includes(titlePattern));
    return found ? success : failure('checkIssueExists', 404);
  }

  if (cfg['checkStarred']) {
    const repo = String(cfg['repo'] ?? '');
    const [owner, repoName] = repo.split('/');
    const res = await fetch(`https://api.github.com/user/starred/${owner}/${repoName}`, { headers });
    return res.status === 204 ? success : failure('checkStarred', res.status);
  }

  if (cfg['checkComment']) {
    const repo = String(cfg['repo'] ?? '');
    const commentPattern = String(cfg['commentPattern'] ?? '');
    const [owner, repoName] = repo.split('/');
    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues/comments?per_page=50`, { headers });
    if (!res.ok) return failure('checkComment', res.status);
    const comments = await res.json() as { body: string }[];
    const found = comments.some((comment) => comment.body.includes(commentPattern));
    return found ? success : failure('checkComment', 404);
  }

  if (cfg['checkBranchExists']) {
    const repo = String(cfg['repo'] ?? '');
    const branchName = String(cfg['branchName'] ?? '');
    const [owner, repoName] = repo.split('/');
    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/branches/${branchName}`, { headers });
    return res.ok ? success : failure('checkBranchExists', res.status);
  }

  return { score: 0.0, reasoning: 'GitHub check failed: unknown check type', passed: false };
}

/**
 * API state verifier: placeholder for future use
 */
async function runApiStateVerifier(_task: GauntletTask, _agentResult: string): Promise<VerifierResult> {
  return { score: 0, reasoning: 'API state verifier not yet implemented', passed: false };
}
