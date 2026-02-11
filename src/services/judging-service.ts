/**
 * Judging Service - Uses Claude API to evaluate creative task submissions.
 *
 * Provides AI-based judging for tasks with scoringMethod: 'judged'.
 * Each task type has a specific rubric used to score submissions 0-1000.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('JudgingService');

interface JudgingResult {
  score: number;          // 0-1000
  breakdown: Record<string, number>;
  feedback: string;
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

class JudgingService {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic();
    }
    return this.client;
  }

  /**
   * Judge a creative task submission using Claude.
   * Returns a score between 0-1000.
   */
  async judgeSubmission(taskType: string, submission: unknown): Promise<JudgingResult> {
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

    try {
      const client = this.getClient();

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `${rubric}\n\n--- SUBMISSION ---\n${submissionText}\n--- END SUBMISSION ---\n\nReturn ONLY the JSON object, no other text.`
        }]
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

      // Parse the JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        log.error('Failed to parse judging response', { text });
        return { score: 500, breakdown: {}, feedback: 'Failed to parse judge response.' };
      }

      const result = JSON.parse(jsonMatch[0]) as JudgingResult;

      // Clamp score to valid range
      result.score = Math.max(0, Math.min(1000, Math.round(result.score)));

      log.info('Judging complete', { taskType, score: result.score });

      return result;

    } catch (error) {
      log.error('Judging failed', {
        taskType,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return a default score on failure rather than crashing
      return {
        score: 500,
        breakdown: {},
        feedback: 'Judging service encountered an error.'
      };
    }
  }
}

export const judgingService = new JudgingService();
export default judgingService;
