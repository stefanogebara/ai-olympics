/**
 * Judging Service - Cross-provider AI evaluation for creative task submissions.
 *
 * Provides AI-based judging for tasks with scoringMethod: 'judged'.
 * Each task type has a specific rubric used to score submissions 0-1000.
 *
 * BIAS MITIGATION: When a competitor's provider is known, the judge is chosen
 * from a DIFFERENT provider to prevent self-evaluation bias. For multi-provider
 * competitions, a panel of 3 judges from different providers scores submissions
 * and the median score is used.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../shared/config.js';
import { createLogger } from '../shared/utils/logger.js';
import { circuits } from '../shared/utils/circuit-breaker.js';
import type { AgentProvider } from '../shared/types/index.js';

const log = createLogger('JudgingService');

interface JudgingResult {
  score: number;          // 0-1000
  breakdown: Record<string, number>;
  feedback: string;
  judgeModel?: string;    // Which model judged this submission
}

const RUBRICS: Record<string, string> = {
  'design-challenge': `You are judging an AI agent's HTML/CSS design submission for a pricing card component.

Score the submission from 0 to 1000 based on these criteria:

1. VISUAL QUALITY (400 points max)
   - Color harmony and contrast
   - Typography choices and hierarchy
   - Use of whitespace and spacing
   - Overall aesthetic appeal
   - Dark theme execution

2. CODE QUALITY (300 points max)
   - Clean, well-structured HTML
   - Semantic markup usage
   - CSS organization
   - No inline style abuse

3. COMPLETENESS (200 points max)
   - Has plan name ("Pro Plan" or similar)
   - Has price displayed ("$29/month" or similar)
   - Has at least 4 feature bullet points
   - Has call-to-action button
   - Card has rounded corners, border, shadow
   - Card is centered on page

4. RESPONSIVENESS (100 points max)
   - Uses relative units (%, em, rem, vw)
   - Flexible layout (flexbox/grid)
   - Would adapt to different widths

Return a JSON object with this exact format:
{
  "score": <total 0-1000>,
  "breakdown": {
    "visual_quality": <0-400>,
    "code_quality": <0-300>,
    "completeness": <0-200>,
    "responsiveness": <0-100>
  },
  "feedback": "<brief 1-2 sentence summary>"
}`,

  'writing-challenge': `You are judging an AI agent's writing submission for a product description.

The prompt was: Write a persuasive product description for "GreenMind," an AI-powered smart garden device for busy urban professionals.

Score the submission from 0 to 1000 based on these criteria:

1. CREATIVITY (300 points max)
   - Original language and phrasing
   - Vivid imagery and sensory details
   - Unique angle or perspective
   - Memorable hooks

2. PERSUASIVENESS (300 points max)
   - Compelling value proposition
   - Emotional appeal to target audience
   - Clear benefits over alternatives
   - Strong call to action

3. GRAMMAR & STYLE (200 points max)
   - Correct grammar and punctuation
   - Appropriate tone for audience
   - Good sentence flow and variety
   - Professional polish

4. RELEVANCE (200 points max)
   - Addresses the product features
   - Targets busy urban professionals
   - Mentions smart/AI capabilities
   - Adequate length (not too short)

Return a JSON object with this exact format:
{
  "score": <total 0-1000>,
  "breakdown": {
    "creativity": <0-300>,
    "persuasiveness": <0-300>,
    "grammar_style": <0-200>,
    "relevance": <0-200>
  },
  "feedback": "<brief 1-2 sentence summary>"
}`,

  'pitch-deck': `You are judging an AI agent's startup pitch deck submission.

Score the submission from 0 to 1000 based on these criteria:

1. CLARITY (300 points max)
   - Clear problem definition
   - Easy to understand solution
   - Well-articulated value proposition
   - Logical flow between slides

2. PERSUASIVENESS (300 points max)
   - Compelling narrative
   - Convincing market opportunity
   - Strong team positioning
   - Clear and justified ask

3. COMPLETENESS (200 points max)
   - Company name and tagline present
   - Problem and solution defined
   - Market size provided (TAM/SAM)
   - Business model described
   - Team described
   - Funding ask specified

4. CREATIVITY (200 points max)
   - Unique business idea
   - Novel approach to problem
   - Creative positioning
   - Memorable presentation

Return a JSON object with this exact format:
{
  "score": <total 0-1000>,
  "breakdown": {
    "clarity": <0-300>,
    "persuasiveness": <0-300>,
    "completeness": <0-200>,
    "creativity": <0-200>
  },
  "feedback": "<brief 1-2 sentence summary>"
}`
};

// Cross-provider judge mapping: competitor provider -> judge model
// Ensures no model family judges its own submissions
const JUDGE_MAP: Record<string, { model: string; orModel: string }> = {
  claude:  { model: 'gpt-4.1',                    orModel: 'openai/gpt-4.1' },
  openai:  { model: 'claude-sonnet-4-5-20250929',  orModel: 'anthropic/claude-sonnet-4-5-20250929' },
  gemini:  { model: 'claude-sonnet-4-5-20250929',  orModel: 'anthropic/claude-sonnet-4-5-20250929' },
  llama:   { model: 'gpt-4.1',                    orModel: 'openai/gpt-4.1' },
  mistral: { model: 'claude-sonnet-4-5-20250929',  orModel: 'anthropic/claude-sonnet-4-5-20250929' },
};

// Default judge when provider is unknown or for fallback
const DEFAULT_JUDGE = { model: 'claude-sonnet-4-5-20250929', orModel: 'anthropic/claude-sonnet-4-5-20250929' };

// Panel judges for multi-provider fairness (3 different models)
const PANEL_JUDGES = [
  { model: 'claude-sonnet-4-5-20250929', orModel: 'anthropic/claude-sonnet-4-5-20250929' },
  { model: 'gpt-4.1',                    orModel: 'openai/gpt-4.1' },
  { model: 'gemini-2.5-flash',           orModel: 'google/gemini-2.5-flash' },
];

class JudgingService {
  private anthropicClient: Anthropic | null = null;

  private getAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      this.anthropicClient = new Anthropic();
    }
    return this.anthropicClient;
  }

  /**
   * Get the appropriate judge model for a competitor's provider.
   * Returns a model from a DIFFERENT provider to prevent self-evaluation bias.
   */
  private getJudgeForCompetitor(competitorProvider?: AgentProvider): { model: string; orModel: string } {
    if (!competitorProvider) return DEFAULT_JUDGE;
    return JUDGE_MAP[competitorProvider] || DEFAULT_JUDGE;
  }

  /**
   * Call a judge model via OpenRouter (supports all providers through one API).
   */
  private async callOpenRouterJudge(model: string, prompt: string): Promise<string> {
    const response = await circuits.openrouter.execute(() => fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-olympics.vercel.app',
        'X-Title': 'AI Olympics Judging',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0.3, // Low temperature for consistent scoring
      }),
    }));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter judge call failed (${response.status}): ${errorText}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Call a judge model via Anthropic directly (fallback when OpenRouter unavailable).
   */
  private async callAnthropicJudge(model: string, prompt: string): Promise<string> {
    const client = this.getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0]?.type === 'text' ? response.content[0].text : '';
  }

  /**
   * Call a judge model, routing through OpenRouter if available, otherwise Anthropic direct.
   */
  private async callJudge(judge: { model: string; orModel: string }, prompt: string): Promise<string> {
    if (config.openRouterApiKey) {
      return this.callOpenRouterJudge(judge.orModel, prompt);
    }
    // Fallback: use Anthropic directly (only works for Claude models)
    return this.callAnthropicJudge(judge.model, prompt);
  }

  /**
   * Parse a judging response into a JudgingResult.
   */
  private parseJudgingResponse(text: string): JudgingResult | null {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      const result = JSON.parse(jsonMatch[0]) as JudgingResult;
      result.score = Math.max(0, Math.min(1000, Math.round(result.score)));
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Judge a creative task submission.
   *
   * @param taskType - The task type (must match a key in RUBRICS)
   * @param submission - The agent's submission content
   * @param competitorProvider - The provider of the agent being judged (for bias mitigation)
   * @returns JudgingResult with score 0-1000
   */
  async judgeSubmission(
    taskType: string,
    submission: unknown,
    competitorProvider?: AgentProvider
  ): Promise<JudgingResult> {
    const rubric = RUBRICS[taskType];

    if (!rubric) {
      log.warn('No rubric found for task type, returning default score', { taskType });
      return {
        score: 500,
        breakdown: {},
        feedback: 'No rubric available for this task type.'
      };
    }

    const submissionText = typeof submission === 'string'
      ? submission
      : JSON.stringify(submission, null, 2);

    const prompt = `${rubric}\n\n--- SUBMISSION ---\n${submissionText}\n--- END SUBMISSION ---\n\nReturn ONLY the JSON object, no other text.`;

    const judge = this.getJudgeForCompetitor(competitorProvider);

    try {
      log.info('Judging submission', {
        taskType,
        competitorProvider: competitorProvider || 'unknown',
        judgeModel: config.openRouterApiKey ? judge.orModel : judge.model,
      });

      const text = await this.callJudge(judge, prompt);
      const result = this.parseJudgingResponse(text);

      if (!result) {
        log.error('Failed to parse judging response', { text: text.substring(0, 200) });
        return { score: 500, breakdown: {}, feedback: 'Failed to parse judge response.' };
      }

      result.judgeModel = config.openRouterApiKey ? judge.orModel : judge.model;
      log.info('Judging complete', { taskType, score: result.score, judgeModel: result.judgeModel });

      return result;

    } catch (error) {
      log.error('Judging failed', {
        taskType,
        judgeModel: config.openRouterApiKey ? judge.orModel : judge.model,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        score: 500,
        breakdown: {},
        feedback: 'Judging service encountered an error.'
      };
    }
  }

  /**
   * Panel judging: 3 judges from different providers score the submission.
   * Returns the median score for fairness. Use for high-stakes or multi-provider competitions.
   */
  async panelJudge(taskType: string, submission: unknown): Promise<JudgingResult> {
    const rubric = RUBRICS[taskType];

    if (!rubric) {
      log.warn('No rubric found for task type, returning default score', { taskType });
      return { score: 500, breakdown: {}, feedback: 'No rubric available for this task type.' };
    }

    if (!config.openRouterApiKey) {
      log.warn('Panel judging requires OpenRouter API key, falling back to single judge');
      return this.judgeSubmission(taskType, submission);
    }

    const submissionText = typeof submission === 'string'
      ? submission
      : JSON.stringify(submission, null, 2);

    const prompt = `${rubric}\n\n--- SUBMISSION ---\n${submissionText}\n--- END SUBMISSION ---\n\nReturn ONLY the JSON object, no other text.`;

    log.info('Panel judging submission', { taskType, panelSize: PANEL_JUDGES.length });

    // Run all 3 judges in parallel
    const results = await Promise.allSettled(
      PANEL_JUDGES.map(judge => this.callOpenRouterJudge(judge.orModel, prompt))
    );

    const scores: number[] = [];
    const parsedResults: JudgingResult[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        const parsed = this.parseJudgingResponse(r.value);
        if (parsed) {
          scores.push(parsed.score);
          parsedResults.push(parsed);
          log.info('Panel judge scored', {
            judge: PANEL_JUDGES[i].orModel,
            score: parsed.score,
          });
        }
      } else {
        log.warn('Panel judge failed', {
          judge: PANEL_JUDGES[i].orModel,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }

    if (scores.length === 0) {
      return { score: 500, breakdown: {}, feedback: 'All panel judges failed.' };
    }

    // Use median score for fairness
    scores.sort((a, b) => a - b);
    const medianScore = scores[Math.floor(scores.length / 2)];
    const medianResult = parsedResults.find(r => r.score === medianScore) || parsedResults[0];

    log.info('Panel judging complete', {
      taskType,
      scores,
      medianScore,
      judgeCount: scores.length,
    });

    return {
      score: medianScore,
      breakdown: medianResult.breakdown,
      feedback: `Panel judged (${scores.length}/3 judges). Scores: ${scores.join(', ')}. ${medianResult.feedback}`,
      judgeModel: `panel (${scores.length} judges)`,
    };
  }
}

export const judgingService = new JudgingService();
export default judgingService;
