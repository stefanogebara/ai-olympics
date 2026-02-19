/**
 * Prediction Markets - Meta-Markets (AI Competition Betting)
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../../../shared/utils/logger.js';

const router = Router();
const log = createLogger('PredictionMarketsAPI');

/**
 * GET /api/predictions/meta-markets
 * Get AI agent matchup betting markets
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Generate matchups based on active/upcoming competitions
    // For now, return well-structured mock data
    const matchups = [
      {
        id: 'mm-1',
        title: 'Trivia Showdown',
        description: 'Which AI will score highest on the trivia challenge?',
        taskType: 'trivia',
        agents: [
          { id: 'claude-1', name: 'Claude 3.5', provider: 'claude', odds: 0.45, betsCount: 24, totalBets: 2400 },
          { id: 'gpt4-1', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.35, betsCount: 18, totalBets: 1800 },
          { id: 'gemini-1', name: 'Gemini Pro', provider: 'gemini', odds: 0.20, betsCount: 8, totalBets: 800 }
        ],
        status: 'live',
        totalPool: 5000
      },
      {
        id: 'mm-2',
        title: 'Math Championship',
        description: 'Speed and accuracy in mathematical computation',
        taskType: 'math',
        agents: [
          { id: 'claude-2', name: 'Claude 3.5', provider: 'claude', odds: 0.40, betsCount: 15, totalBets: 1500 },
          { id: 'gpt4-2', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.40, betsCount: 16, totalBets: 1600 },
          { id: 'gemini-2', name: 'Gemini Pro', provider: 'gemini', odds: 0.20, betsCount: 9, totalBets: 900 }
        ],
        status: 'upcoming',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        totalPool: 4000
      },
      {
        id: 'mm-3',
        title: 'Logic Master',
        description: 'Pattern recognition and logical reasoning',
        taskType: 'logic',
        agents: [
          { id: 'claude-3', name: 'Claude 3.5', provider: 'claude', odds: 0.55, betsCount: 30, totalBets: 3300 },
          { id: 'gpt4-3', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.30, betsCount: 12, totalBets: 1200 },
          { id: 'gemini-3', name: 'Gemini Pro', provider: 'gemini', odds: 0.15, betsCount: 5, totalBets: 500 }
        ],
        status: 'completed',
        winner: 'claude-3',
        totalPool: 5000
      },
      {
        id: 'mm-4',
        title: 'Word Scramble Battle',
        description: 'Unscramble words faster than your AI opponents',
        taskType: 'word',
        agents: [
          { id: 'claude-4', name: 'Claude 3.5', provider: 'claude', odds: 0.50, betsCount: 20, totalBets: 2000 },
          { id: 'gpt4-4', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.35, betsCount: 14, totalBets: 1400 },
          { id: 'gemini-4', name: 'Gemini Pro', provider: 'gemini', odds: 0.15, betsCount: 6, totalBets: 600 }
        ],
        status: 'upcoming',
        startsAt: new Date(Date.now() + 7200000).toISOString(),
        totalPool: 4000
      },
      {
        id: 'mm-5',
        title: 'Chess Puzzle Championship',
        description: 'Find the best moves in tactical positions',
        taskType: 'chess',
        agents: [
          { id: 'claude-5', name: 'Claude 3.5', provider: 'claude', odds: 0.35, betsCount: 22, totalBets: 2200 },
          { id: 'gpt4-5', name: 'GPT-4 Turbo', provider: 'gpt4', odds: 0.45, betsCount: 28, totalBets: 2800 },
          { id: 'gemini-5', name: 'Gemini Pro', provider: 'gemini', odds: 0.20, betsCount: 10, totalBets: 1000 }
        ],
        status: 'live',
        totalPool: 6000
      }
    ];

    res.json({
      matchups,
      count: matchups.length,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('Error fetching meta-markets', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch meta-markets' });
  }
});

export default router;
